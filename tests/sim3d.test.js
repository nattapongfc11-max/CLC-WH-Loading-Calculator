// 3D Simulate Layout: scene, painter's order, camera drag / presets, Kraft look, stacked pairs, pallets that do not fit.
const {JSDOM}=require('jsdom');const fs=require('fs');const path=require('path');
const html=fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8');
const dom=new JSDOM(html,{runScripts:'dangerously',pretendToBeVisual:true,url:'https://clc.test/'});
const w=dom.window,d=w.document,errs=[];w.addEventListener('error',e=>errs.push(e.message));
let fail=0;const ok=(c,m)=>{console.log((c?'PASS ':'FAIL ')+m);if(!c)fail++};
w.alert=()=>{};w.confirm=()=>true;
const part=(model,o)=>Object.assign({model,description:model,qtyCarton:10,cartonD:40,cartonW:30,cartonH:25,qtyPallet:200,palletD:110,palletW:110,palletH:125,netPC:1.2,grossCarton:13,grossPallet:260},o||{});
const setup=ms=>{w.parts=[part('A'),part('B',{qtyCarton:6,cartonD:55,cartonW:36,cartonH:30,qtyPallet:96,palletH:120,grossPallet:200})];w.models=ms.map(([m,q])=>({model:m,planQty:q,actualQty:null,packingModel:m}));w.generateAllocations();w.renderCalc()};
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
setTimeout(async()=>{
  setup([['A',200*4+60],['B',96*2+30]]);
  const top=d.getElementById('sim3d-top'),side=d.getElementById('sim3d-side');
  ok(top&&side&&top.classList.contains('sim3d')&&side.classList.contains('sim3d'),'Top View and Side View are 3D SVG scenes');
  ok(top.querySelectorAll('polygon').length>60&&side.querySelectorAll('polygon').length>60,'scenes contain the container, pallets and cartons ('+top.querySelectorAll('polygon').length+' faces)');
  const txt=d.getElementById('simLayout').textContent;
  ok(/Top View · มุมมองด้านบน/.test(txt)&&/Side View · มุมมองด้านข้าง/.test(txt)&&d.querySelectorAll('#simLayout .s3head .tag').length===2,'titles keep the Thai names and are marked 3D');
  ok(d.querySelectorAll('#simLayout details.sim2d svg.simsvg').length===2,'the old 2D drawings stay available (collapsed)');
  const fills=s=>new Set([...s.querySelectorAll('polygon')].map(p=>p.getAttribute('fill')));
  const ca=w.eval("s3col(simColor('A'),1.1)"),cb=w.eval("s3col(simColor('B'),1.1)");
  ok(fills(top).has(ca)&&fills(top).has(cb)&&ca!==cb,'pallet tops are coloured per model (same legend colours)');
  ok(fills(top).has('rgb(44,95,168)')||[...fills(top)].some(f=>/^rgb\(\d+,\d+,\d+\)$/.test(f)),'container shell is drawn in blue steel colours');
  ok(/หัวตู้/.test(top.textContent)&&/ประตู/.test(top.textContent),'front (head) and door ends are labelled');
  ok([...top.querySelectorAll('text')].some(t=>/^\d+( MIX)?$/.test(t.textContent)),'SKID numbers are printed on the pallets');
  const sc=w.eval('SIM3.scene'),items=w.eval("s3items(SIM3.scene,[0,-1,0])");
  ok(items.filter(i=>i.k==='door').length===2&&items.some(i=>i.k==='wall'&&i.glass)&&items.filter(i=>i.k==='wall'&&i.glass).length===1,'doors open; only the wall nearest the camera is glass (cut-away)');
  ok(items.some(i=>i.k==='carton'),'a Mix pallet is drawn carton by carton from its layer layout');
  ok(items.filter(i=>i.k==='skid'||i.k==='cargo'||i.k==='carton').every(i=>i.b[0]>=-1&&i.b[3]<=sc.L+1&&i.b[1]>=-1&&i.b[4]<=sc.W+1&&i.b[5]<=sc.H+1),'every pallet is inside the container (length, width, height)');
  // painter's algorithm: for any two boxes separated along an axis, the one nearer the camera is drawn later
  const angles=[[0,0],[-22,50],[-32,56],[45,30],[120,20],[170,35],[-90,12],[90,40],[-150,25],[0,88],[-10,5],[200,60]];
  let bad=0,pairsChecked=0;
  angles.forEach(([yaw,pitch])=>{
    const th=yaw*Math.PI/180,ph=pitch*Math.PI/180,v=[-Math.cos(ph)*Math.sin(th),-Math.cos(ph)*Math.cos(th),Math.sin(ph)];
    const ct=Math.cos(th),stt=Math.sin(th),cpp=Math.cos(ph),spp=Math.sin(ph),cx=sc.L/2,cy=sc.W/2,cz=sc.H/2;
    const PP=(x,y,z)=>{const dx=x-cx,dy=y-cy,dz=z-cz;return [dx*ct-dy*stt,-(dz*cpp+(dx*stt+dy*ct)*spp)]};
    const ord=w.eval("(function(v){var c=Math.cos,s=Math.sin;return s3order(s3items(SIM3.scene,v),v,function(x,y,z){var th="+th+",ph="+ph+",cx=SIM3.scene.L/2,cy=SIM3.scene.W/2,cz=SIM3.scene.H/2,dx=x-cx,dy=y-cy,dz=z-cz;return [dx*c(th)-dy*s(th),-(dz*c(ph)+(dx*s(th)+dy*c(th))*s(ph))]})})("+JSON.stringify(v)+")");
    const bb=ord.map(it=>{const b=it.b;let x0=1e9,x1=-1e9,y0=1e9,y1=-1e9;[b[0],b[3]].forEach(x=>[b[1],b[4]].forEach(y=>[b[2],b[5]].forEach(z=>{const q=PP(x,y,z);x0=Math.min(x0,q[0]);x1=Math.max(x1,q[0]);y0=Math.min(y0,q[1]);y1=Math.max(y1,q[1])})));return [x0,x1,y0,y1]});
    for(let i=0;i<ord.length;i++)for(let j=i+1;j<ord.length;j++){
      if(bb[i][1]<=bb[j][0]+1e-6||bb[j][1]<=bb[i][0]+1e-6||bb[i][3]<=bb[j][2]+1e-6||bb[j][3]<=bb[i][2]+1e-6)continue; // outlines do not overlap on screen
      const A=ord[i].b,B=ord[j].b;let ax=-1,best=0,aLow=true;
      for(let k=0;k<3;k++){const ab=A[k+3]<=B[k]+1e-6,ba=B[k+3]<=A[k]+1e-6,m=Math.abs(v[k]);if((ab||ba)&&m>best+1e-9){best=m;ax=k;aLow=ba}}
      // A is drawn before B: B must not be strictly farther than A on the best separating axis
      if(ax<0)continue;pairsChecked++;const aIsLow=A[ax+3]<=B[ax]+1e-6;const aNearer=(aIsLow&&v[ax]<0)||(!aIsLow&&v[ax]>0);if(aNearer)bad++;
    }
  });
  ok(bad===0&&pairsChecked>500,'draw order is correct from '+angles.length+' camera angles ('+pairsChecked+' overlapping box pairs checked, '+bad+' wrong)');
  // camera
  const before=top.innerHTML;
  w.s3down({button:0,clientX:200,clientY:200,pointerId:1,currentTarget:top},'top');w.s3move({clientX:260,clientY:215});await sleep(60);w.s3up();
  const cam=w.eval('SIM3.cams.top');
  ok(Math.abs(cam.yaw-(-22+60*.45))<.01&&Math.abs(cam.pitch-(50+15*.35))<.01&&d.getElementById('sim3d-top').innerHTML!==before,'dragging rotates the 3D view (yaw '+cam.yaw.toFixed(1)+', pitch '+cam.pitch.toFixed(1)+')');
  w.s3down({button:0,clientX:0,clientY:0,pointerId:1,currentTarget:top},'top');w.s3move({clientX:0,clientY:-900});await sleep(60);w.s3up();
  ok(w.eval('SIM3.cams.top.pitch')<=88&&w.eval('SIM3.cams.top.pitch')>=4,'pitch is limited so the view never flips');
  w.s3reset('top');ok(w.eval('SIM3.cams.top.yaw')===-22&&w.eval('SIM3.cams.top.pitch')===50,'reset restores the default angle');
  w.s3view('side',-90,12);ok(w.eval('SIM3.cams.side.yaw')===-90&&!/หัวตู้/.test(d.getElementById('sim3d-side').textContent),'preset: view from the door end (end labels hidden when looking along the container)');
  w.s3reset('side');
  w.s3wheel({deltaY:-100,preventDefault(){}},'top');ok(w.eval('SIM3.cams.top.zoom')>1,'mouse wheel zooms');w.s3reset('top');w.eval("SIM3.cams.top.zoom=1");
  // Kraft look (like the reference photo)
  w.s3look('kraft');
  ok(d.querySelector('.s3look button[data-look=kraft]').classList.contains('on')&&fills(d.getElementById('sim3d-top')).has(w.eval("s3col('#cfa66d',1.1)")),'Kraft look: brown cartons');
  w.s3look('model');ok(fills(d.getElementById('sim3d-top')).has(ca),'back to colours by model');
  // stacked pairs
  setup([['A',200*17],['B',96*4]]);
  const st=w.planStacking(),it2=w.eval("s3items(SIM3.scene,[0,-1,.5])");
  ok(st.pairs.length>0&&it2.filter(i=>i.k==='skid'&&i.b[2]>50).length===st.pairs.length,'each stacked pair is drawn two-high ('+st.pairs.length+' upper pallets)');
  ok(Math.max(...it2.filter(i=>i.k==='cargo'||i.k==='carton').map(i=>i.b[5]))<=269,'stacks never exceed the container height');
  // pallets that do not fit are shown outside the container
  setup([['A',200*40],['B',96*6]]);
  const so=w.planStacking(),svgo=d.getElementById('sim3d-top');
  ok(so.positions.length>so.cap&&/นอกตู้/.test(svgo.textContent),'over-capacity pallets are drawn outside the container with a label');
  const sc2=w.eval('SIM3.scene'),it3=w.eval("s3items(SIM3.scene,[0,-1,.5])");
  ok(it3.some(i=>i.b[4]>sc2.W+10&&(i.k==='cargo'||i.k==='carton')&&i.stroke==='#dc2626'),'outside pallets have a red outline');
  setup([['A',200*3]]);ok(d.getElementById('sim3d-top').querySelectorAll('polygon').length>60&&!/นอกตู้/.test(d.getElementById('sim3d-top').textContent),'a small shipment renders without the outside area');
  setup([]);ok(/เพิ่ม Shipment Model/.test(d.getElementById('simLayout').textContent),'no models: hint instead of a scene');
  ok(errs.length===0,'no script errors ('+errs.join('; ')+')');
  console.log(fail?fail+' FAILED':'ALL PASSED');process.exit(fail?1:0);
},300);
