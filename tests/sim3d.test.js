// 3D Simulate Layout: ONE 3D view, painter's order, camera drag / presets, Kraft look, readable pallet labels, stacked pairs, pallets that do not fit.
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
  const top=d.getElementById('sim3d');
  ok(top&&top.classList.contains('sim3d')&&d.querySelectorAll('#simLayout svg.sim3d').length===1,'one 3D SVG scene (no separate Top View / Side View)');
  ok(top.querySelectorAll('polygon').length>60,'the scene contains the container, pallets and cartons ('+top.querySelectorAll('polygon').length+' faces)');
  const txt=d.getElementById('simLayout').textContent;
  ok(/3D View/.test(txt)&&!/Top View|Side View/.test(txt)&&d.querySelectorAll('#simLayout svg.simsvg').length===0&&d.querySelectorAll('#simLayout details.sim2d').length===0,'no Top View / Side View panels and no 2D drawings any more');
  ok(d.querySelectorAll('#simLayout .s3head button').length>=4,'camera presets (oblique, from above, side, from the door) + reset');
  const fills=s=>new Set([...s.querySelectorAll('polygon')].map(p=>p.getAttribute('fill')));
  const ca=w.eval("s3col(simColor('A'),1.1)"),cb=w.eval("s3col(simColor('B'),1.1)");
  ok(fills(top).has(ca)&&fills(top).has(cb)&&ca!==cb,'pallet tops are coloured per model (same legend colours)');
  ok(fills(top).has('rgb(44,95,168)')||[...fills(top)].some(f=>/^rgb\(\d+,\d+,\d+\)$/.test(f)),'container shell is drawn in blue steel colours');
  ok(/หัวตู้/.test(top.textContent)&&/ประตู/.test(top.textContent),'front (head) and door ends are labelled');
  ok(top.querySelectorAll('g.s3lab').length>=5&&[...top.querySelectorAll('g.s3lab text')].some(t=>/^\d+$/.test(t.textContent)),'every pallet position gets a number label');
  const sc=w.eval('SIM3.scene'),items=w.eval("s3items(SIM3.scene,[0,-1,0])");
  ok(items.filter(i=>i.k==='door').length===2&&items.some(i=>i.k==='wall'&&i.glass)&&items.filter(i=>i.k==='wall'&&i.glass).length===1,'doors open; only the wall nearest the camera is glass (cut-away)');
  ok(items.some(i=>i.k==='carton'),'a Mix pallet is drawn carton by carton from its layer layout');
  ok(items.filter(i=>i.k==='skid'||i.k==='cargo'||i.k==='carton').every(i=>i.b[0]>=-1&&i.b[3]<=sc.L+1&&i.b[1]>=-1&&i.b[4]<=sc.W+1&&i.b[5]<=sc.H+1),'every pallet is inside the container (length, width, height)');
  // painter's algorithm: for any two boxes separated along an axis, the one nearer the camera is drawn later
  const angles=[[0,0],[-22,50],[-32,56],[45,30],[120,20],[170,35],[-90,12],[90,40],[-150,25],[0,88],[-10,5],[200,60]];
  let bad=0,pairsChecked=0,cyc=0;   // cyc = wrong pairs inside a GENUINE cycle of the constraint graph (no whole-box order exists for those)
  angles.forEach(([yaw,pitch])=>{
    const th=yaw*Math.PI/180,ph=pitch*Math.PI/180,v=[-Math.cos(ph)*Math.sin(th),-Math.cos(ph)*Math.cos(th),Math.sin(ph)];
    const ct=Math.cos(th),stt=Math.sin(th),cpp=Math.cos(ph),spp=Math.sin(ph),cx=sc.L/2,cy=sc.W/2,cz=sc.H/2;
    const PP=(x,y,z)=>{const dx=x-cx,dy=y-cy,dz=z-cz;return [dx*ct-dy*stt,-(dz*cpp+(dx*stt+dy*ct)*spp)]};
    const ord=w.eval("(function(v){var c=Math.cos,s=Math.sin;return s3order(s3items(SIM3.scene,v),v,function(x,y,z){var th="+th+",ph="+ph+",cx=SIM3.scene.L/2,cy=SIM3.scene.W/2,cz=SIM3.scene.H/2,dx=x-cx,dy=y-cy,dz=z-cz;return [dx*c(th)-dy*s(th),-(dz*c(ph)+(dx*s(th)+dy*c(th))*s(ph))]})})("+JSON.stringify(v)+")");
    const bb=ord.map(it=>{const b=it.b;let x0=1e9,x1=-1e9,y0=1e9,y1=-1e9;[b[0],b[3]].forEach(x=>[b[1],b[4]].forEach(y=>[b[2],b[5]].forEach(z=>{const q=PP(x,y,z);x0=Math.min(x0,q[0]);x1=Math.max(x1,q[0]);y0=Math.min(y0,q[1]);y1=Math.max(y1,q[1])})));return [x0,x1,y0,y1]});
    // strongly connected components of the 'must be drawn before' graph: a pair inside one is a true cycle (e.g. interlocking carton layers)
    const nn=ord.length,gadj=Array.from({length:nn},()=>[]);
    for(let i=0;i<nn;i++)for(let j=i+1;j<nn;j++){
      if(bb[i][1]<=bb[j][0]+1e-6||bb[j][1]<=bb[i][0]+1e-6||bb[i][3]<=bb[j][2]+1e-6||bb[j][3]<=bb[i][2]+1e-6)continue;
      const A=ord[i].b,B=ord[j].b;let best=0,ax=-1,aLow=true;
      for(let k=0;k<3;k++){const ab=A[k+3]<=B[k]+1e-6,ba=B[k+3]<=A[k]+1e-6,m=Math.abs(v[k]);if((ab||ba)&&m>best+1e-9){best=m;ax=k;aLow=ab}}
      if(ax<0)continue;if(aLow===(v[ax]>0))gadj[i].push(j);else gadj[j].push(i);
    }
    let tix=0;const tst=[],ton=new Array(nn).fill(false),tind=new Array(nn).fill(-1),tlow=new Array(nn).fill(0),comp=new Array(nn).fill(-1);let cn=0;
    const tdfs=u=>{tind[u]=tlow[u]=tix++;tst.push(u);ton[u]=true;gadj[u].forEach(x=>{if(tind[x]<0){tdfs(x);tlow[u]=Math.min(tlow[u],tlow[x])}else if(ton[x])tlow[u]=Math.min(tlow[u],tind[x])});if(tlow[u]===tind[u]){let x;const members=[];do{x=tst.pop();ton[x]=false;members.push(x)}while(x!==u);if(members.length>1)members.forEach(m=>comp[m]=cn);cn++}};
    for(let i=0;i<nn;i++)if(tind[i]<0)tdfs(i);
    for(let i=0;i<ord.length;i++)for(let j=i+1;j<ord.length;j++){
      if(bb[i][1]<=bb[j][0]+1e-6||bb[j][1]<=bb[i][0]+1e-6||bb[i][3]<=bb[j][2]+1e-6||bb[j][3]<=bb[i][2]+1e-6)continue; // outlines do not overlap on screen
      const A=ord[i].b,B=ord[j].b;let ax=-1,best=0,aLow=true;
      for(let k=0;k<3;k++){const ab=A[k+3]<=B[k]+1e-6,ba=B[k+3]<=A[k]+1e-6,m=Math.abs(v[k]);if((ab||ba)&&m>best+1e-9){best=m;ax=k;aLow=ba}}
      // A is drawn before B: B must not be strictly farther than A on the best separating axis
      if(ax<0)continue;pairsChecked++;const aIsLow=A[ax+3]<=B[ax]+1e-6;const aNearer=(aIsLow&&v[ax]<0)||(!aIsLow&&v[ax]>0);if(aNearer){if(comp[i]>=0&&comp[i]===comp[j])cyc++;else bad++}
    }
  });
  ok(bad===0&&pairsChecked>500&&cyc<=pairsChecked*.01,'draw order is correct from '+angles.length+' camera angles ('+pairsChecked+' overlapping box pairs checked, '+bad+' wrong, '+cyc+' inside genuine cycles)');
  // camera
  const before=top.innerHTML;
  w.s3down({button:0,clientX:200,clientY:200,pointerId:1,currentTarget:top});w.s3move({clientX:260,clientY:215});await sleep(60);w.s3up();
  const cam=w.eval('SIM3.cam'),def=w.eval('S3_CAM');
  ok(Math.abs(cam.yaw-(def.yaw+60*.45))<.01&&Math.abs(cam.pitch-(def.pitch+15*.35))<.01&&d.getElementById('sim3d').innerHTML!==before,'dragging rotates the 3D view (yaw '+cam.yaw.toFixed(1)+', pitch '+cam.pitch.toFixed(1)+')');
  w.s3down({button:0,clientX:0,clientY:0,pointerId:1,currentTarget:top});w.s3move({clientX:0,clientY:-900});await sleep(60);w.s3up();
  ok(w.eval('SIM3.cam.pitch')<=88&&w.eval('SIM3.cam.pitch')>=4,'pitch is limited so the view never flips');
  w.s3reset();ok(w.eval('SIM3.cam.yaw')===def.yaw&&w.eval('SIM3.cam.pitch')===def.pitch,'reset restores the default angle');
  w.s3view(-90,12);ok(w.eval('SIM3.cam.yaw')===-90&&!/หัวตู้/.test(d.getElementById('sim3d').textContent),'preset: view from the door end (end labels hidden when looking along the container)');
  w.s3reset();
  w.s3wheel({deltaY:-100,preventDefault(){}});ok(w.eval('SIM3.cam.zoom')>1,'mouse wheel zooms');w.s3reset();
  // Kraft look (like the reference photo)
  w.s3look('kraft');
  ok(d.querySelector('.s3look button[data-look=kraft]').classList.contains('on')&&fills(d.getElementById('sim3d')).has(w.eval("s3col('#cfa66d',1.1)")),'Kraft look: brown cartons');
  w.s3look('model');ok(fills(d.getElementById('sim3d')).has(ca),'back to colours by model');
  // stacked pairs (the pair planner; "overflow -> Stack = Y" is tested in layout34.test.js)
  d.getElementById('autoStackY').checked=false;
  setup([['A',200*17],['B',96*4]]);
  const st=w.planStacking(),it2=w.eval("s3items(SIM3.scene,[0,-1,.5])");
  ok(st.pairs.length>0&&it2.filter(i=>i.k==='skid'&&i.b[2]>50).length===st.pairs.length,'each stacked pair is drawn two-high ('+st.pairs.length+' upper pallets)');
  ok(Math.max(...it2.filter(i=>i.k==='cargo'||i.k==='carton').map(i=>i.b[5]))<=269,'stacks never exceed the container height');
  // pallets that do not fit are shown outside the container
  setup([['A',200*40],['B',96*6]]);
  const so=w.planStacking(),svgo=d.getElementById('sim3d');
  ok(so.positions.length>so.cap&&/นอกตู้/.test(svgo.textContent),'over-capacity pallets are drawn outside the container with a label');
  const sc2=w.eval('SIM3.scene'),it3=w.eval("s3items(SIM3.scene,[0,-1,.5])");
  ok(it3.some(i=>i.b[4]>sc2.W+10&&(i.k==='cargo'||i.k==='carton')&&i.stroke==='#dc2626'),'outside pallets have a red outline');
  setup([['A',200*3]]);ok(d.getElementById('sim3d').querySelectorAll('polygon').length>60&&!/นอกตู้/.test(d.getElementById('sim3d').textContent),'a small shipment renders without the outside area');
  setup([]);ok(/เพิ่ม Shipment Model/.test(d.getElementById('simLayout').textContent),'no models: hint instead of a scene');
  // ---- pallet number labels: all visible, on top of everything, never overlapping, from every angle
  {const Cp=part('C',{qtyCarton:12,cartonH:20,qtyPallet:240,palletH:110,grossPallet:180});
   w.parts=[part('A'),part('B',{qtyCarton:6,cartonD:55,cartonW:36,cartonH:30,qtyPallet:96,palletH:120,grossPallet:200}),Cp];
   w.models=[['A',200*17+60],['B',96*4+30],['C',240*5+120]].map(([m,q])=>({model:m,planQty:q,actualQty:null,packingModel:m}));
   d.getElementById('floorCap').value=20;d.getElementById('stackPallet').checked=true;w.generateAllocations();w.renderCalc();
   const st=w.planStacking(),svg=d.getElementById('sim3d'),kids=[...svg.children];
   const lastPoly=Math.max(...kids.map((k,i)=>k.tagName==='polygon'?i:-1)),firstLab=kids.findIndex(k=>k.classList&&k.classList.contains('s3lab'));
   ok(firstLab>lastPoly&&lastPoly>0,'labels are drawn after every wall, rail and carton, so nothing can cover a number');
   ok(st.pls.every(p=>d.querySelectorAll('#sim3d g.s3lab').length>0)&&st.pls.every(p=>[...d.querySelectorAll('#sim3d g.s3lab')].some(g=>new RegExp('(^|\\D)'+p.seq+'(\\D|$)').test([...g.querySelectorAll('text')].map(t=>t.textContent).join(' ')))),'every Pallet No. 1…'+st.pls.length+' appears on a label');
   ok(d.querySelectorAll('#sim3d g.s3lab').length===st.positions.length,'one label per floor position ('+st.positions.length+'); a stacked pair has one label for both pallets');
   const pr=st.pairs[0],pg=[...d.querySelectorAll('#sim3d g.s3lab')].map(g=>[...g.querySelectorAll('text')].map(t=>t.textContent)).find(a=>a[0].startsWith('▲ '+pr.top.seq));
   ok(pg&&pg[1].startsWith('▼ '+pr.bottom.seq),'pair label: ▲ top pallet / ▼ bottom pallet ('+(pg||[]).join(' | ')+')');
   ok([...d.querySelectorAll('#sim3d g.s3lab text')].some(t=>/Mix \d+/.test(t.textContent)),'Mix pallets carry their running Mix number on the label');
   ok(d.querySelector('#sim3d g.s3lab title').textContent.length>3,'hovering a label gives details (model, height, weight)');
   const rects=()=>[...d.querySelectorAll('#sim3d g.s3lab > rect')].map(r=>({x:+r.getAttribute('x'),y:+r.getAttribute('y'),w:+r.getAttribute('width'),h:+r.getAttribute('height')}));
   const overlaps=a=>{let c=0;for(let i=0;i<a.length;i++)for(let j=i+1;j<a.length;j++){const p=a[i],q=a[j];if(p.x<q.x+q.w&&q.x<p.x+p.w&&p.y<q.y+q.h&&q.y<p.y+p.h)c++}return c};
   const inside=a=>a.every(r=>r.x>=0&&r.y>=0&&r.x+r.w<=1000&&r.y+r.h<=520);
   let worst=0,allIn=true,counts=new Set();
   for(const [yaw,pitch] of [[-34,30],[0,86],[0,6],[-90,18],[60,25],[150,40],[-120,12],[20,60],[-10,5],[200,35]]){w.s3view(yaw,pitch);const r=rects();worst=Math.max(worst,overlaps(r));allIn=allIn&&inside(r);counts.add(r.length)}
   ok(worst===0,'labels never overlap each other (checked from 10 camera angles)');
   ok(allIn,'labels stay inside the picture');
   ok(counts.size===1&&[...counts][0]===st.positions.length,'a label for every position at every angle');
   w.s3view(-34,30);
   const dashed=d.querySelectorAll('#sim3d g.s3lab > rect[stroke-dasharray]').length;
   w.s3view(0,6);const dashedLow=d.querySelectorAll('#sim3d g.s3lab > rect[stroke-dasharray]').length;
   ok(dashedLow>=dashed,'a pallet hidden behind others from the current angle gets a dashed label (low angle hides more: '+dashed+' → '+dashedLow+')');
   w.s3reset();
   w.s3look('kraft');ok(d.querySelectorAll('#sim3d g.s3lab').length===st.positions.length,'labels also drawn in the Kraft look');w.s3look('model');
   // outside pallets are labelled too
   setup([['A',200*40],['B',96*6]]);const so=w.planStacking();
   ok(d.querySelectorAll('#sim3d g.s3lab').length===Math.min(8,so.positions.length-so.cap)+so.cap&&d.querySelectorAll('#sim3d g.s3lab > rect[stroke="#dc2626"]').length>0,'pallets outside the container are labelled with a red frame');
  }
  ok(errs.length===0,'no script errors ('+errs.join('; ')+')');
  console.log(fail?fail+' FAILED':'ALL PASSED');process.exit(fail?1:0);
},300);
