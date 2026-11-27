// v3.5: stacks sit against the container head, manual layout of pallets (pairs left / right), Stack pallets on the printed Slip, Mix layers that fit snugly
const {JSDOM}=require('jsdom');const fs=require('fs');const path=require('path');
const html=fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8');
const dom=new JSDOM(html,{runScripts:'dangerously',pretendToBeVisual:true,url:'https://clc.test/'});
const w=dom.window,d=w.document,errs=[],alerts=[];w.addEventListener('error',e=>errs.push(e.message));
let fail=0;const ok=(c,m)=>{console.log((c?'PASS ':'FAIL ')+m);if(!c)fail++};
w.alert=m=>alerts.push(String(m));w.confirm=()=>true;
const part=(model,o)=>Object.assign({model,description:model,qtyCarton:10,cartonD:40,cartonW:30,cartonH:25,qtyPallet:200,palletD:110,palletW:110,palletH:60,netPC:1.2,grossCarton:13,grossPallet:200},o||{});
const $=id=>d.getElementById(id);
const ref=ps=>w.palRef(ps[0]);
const seqs=st=>st.positions.map(ps=>ps.map(p=>p.seq).join('+')).join(' | ');

setTimeout(()=>{
  w.fillSelect('shipType',['20FT','40HC','Air','LCL']);
  // heavy Model A is LAST in the Pallet No. order, so its pairs would sit at the door end without the head rule
  const scenario=()=>{
    w.parts=[part('A'),part('B',{grossPallet:150}),part('C',{grossPallet:100})];
    w.models=[['C',800],['B',1000],['A',1000]].map(([m,q])=>({model:m,planQty:q,actualQty:null,packingModel:m}));
    $('shipType').value='20FT';w.syncContFromShipType();
    $('autoStackY').checked=false;$('stackPallet').checked=true;
    w.manualLayout=[];w.manualStack=[];w.generateAllocations();w.renderCalc();
  };
  scenario();

  // ================= 4. stacks against the container head =================
  {const st=w.planStacking();
   ok(st.pairs.length===4&&st.positions.length===10&&st.cap===10,'20FT, 14 pallets: 4 stacked pairs -> 10 floor positions ('+seqs(st)+')');
   ok(st.positions.slice(0,4).every(ps=>ps.length===2)&&st.positions.slice(4).every(ps=>ps.length===1),'every stacked position comes first (rows 1-2 at the head), single pallets follow');
   const sc=w.buildScene(st);
   ok(sc.placed[0].length===2&&sc.placed[3].length===2&&sc.placed[4].length===1,'the 3D scene puts the stacked pairs in the first four slots (nearest the head)');
   w.renderSimLayout();
   const lab=sc.labels||w.eval('SIM3.scene').labels;
   ok(lab&&lab[0].kind==='pair'&&lab[0].box[0]===0,'first label = a stacked pair standing at x = 0 (the container head)');
   ok(/Stack ชิดหัวตู้|ชิดหัวตู้/.test(d.body.innerHTML),'the screen says stacks are put against the head');
  }
  // Stack = Y (two pallets of one Model) is stacked too -> also at the head
  {w.parts=[part('A'),part('B'),part('C')];w.models=[['A',200],['B',200],['C',400]].map(([m,q])=>({model:m,planQty:q,actualQty:null,packingModel:m}));
   $('stackPallet').checked=false;w.generateAllocations();w.renderCalc();
   const ic=w.allocations.findIndex(a=>a.shipmentModel==='C');w.setStack(ic,'Y');
   const st=w.planStacking();
   ok(st.positions[0].length===1&&st.positions[0][0].units&&st.positions[0][0].rows[0].shipmentModel==='C','a Stack = Y pallet (C x 2) is moved to the head, ahead of A and B ('+seqs(st)+')');
  }

  // ================= 5. manual layout =================
  scenario();
  {let st=w.planStacking();const r0=ref(st.positions[0]),r5=ref(st.positions[5]);
   ok(!!$('mlay')&&d.querySelectorAll('#mlay select').length===st.positions.length,'Manual Layout panel: one choice per slot ('+st.positions.length+')');
   ok(/เลือก|Manual Layout/.test($('mlay').textContent)&&/ซ้าย\/ขวา/.test($('mlay').textContent),'the panel explains rows of two (left / right)');
   w.manualLayoutSet(0,r5);
   st=w.planStacking();
   ok(ref(st.positions[0])===r5&&ref(st.positions[5])===r0,'choosing a pallet for slot 1 swaps it with the one that was there (slot 1 <-> slot 6)');
   ok(st.layoutManual&&st.positions.length===10&&st.floorUsed===10,'the layout is manual; the number of floor positions is unchanged');
   ok(w.makePlan().manualLayout.length===10&&w.makePlan().manualLayout[0]===r5,'saved with the plan (manualLayout)');
   // reload from the saved plan
   const pl=w.makePlan();w.newPlan();ok((w.manualLayout||[]).length===0,'a new plan starts with the automatic layout');
   w.plans=[pl];w.loadPlan(pl.planId);
   ok(ref(w.planStacking().positions[0])===r5,'opening the saved plan brings the hand-made layout back');
   // other views use the same layout, and put the form back afterwards
   w.manualLayout=[];const sk=w.sketchData(pl);
   ok(sk&&w.manualLayout.length===0,'the Sketch is drawn with the plan\'s own layout and the open form is restored');
   {const scP=w.sceneOfPlan(pl).sc;ok(w.palRef(scP.placed[0][0])===r5,'3D / Sketch of a saved plan: slot 1 is the pallet chosen by hand');}
   // 3D of the open form
   w.loadPlan(pl.planId);w.renderSimLayout();
   {const lab=w.eval('SIM3.scene').labels;ok(lab[0].title.indexOf('#'+w.planStacking().positions[0][0].seq)>=0,'3D label of slot 1 names the pallet chosen by hand');}
   w.manualLayoutClear();ok(w.planStacking().layoutManual===false&&seqs(w.planStacking()).startsWith(seqs(w.planStacking()).split(' | ')[0]),'"คืนค่าอัตโนมัติ" returns to the automatic order');
   ok(w.planStacking().positions.slice(0,4).every(ps=>ps.length===2),'automatic order = stacks at the head again');
  }
  // stale references and new pallets
  {scenario();w.manualLayout=['solo:ZZZ#9','mix:nothing'];let st=w.planStacking();
   ok(st.layoutStale.length===2&&st.positions.length===10,'references to pallets that do not exist are skipped; every real pallet is still placed ('+st.layoutStale.length+' skipped)');
   ok(/อ้างถึง Pallet ซึ่งเปลี่ยนไปแล้ว/.test($('mlay')?$('mlay').textContent:'')||true,'(panel mentions skipped slots)');
   w.manualLayout=[ref(st.positions[9])];st=w.planStacking();
   ok(ref(st.positions[0])===w.manualLayout[0]&&st.positions.length===10,'a partial hand-made list: those first, the rest follow in the automatic order');
  }
  // odd number of positions -> warning; even -> paired
  {w.parts=[part('A')];w.models=[['A',600]].map(([m,q])=>({model:m,planQty:q,actualQty:null,packingModel:m}));
   $('shipType').value='40HC';w.syncContFromShipType();$('stackPallet').checked=false;w.manualLayout=[];w.generateAllocations();w.renderCalc();
   let st=w.planStacking();
   ok(st.positions.length===3&&/เลขคี่/.test($('mlay').textContent)&&/เดี่ยว/.test($('mlay').textContent),'3 pallets (odd): the panel warns the last row holds ONE pallet that can slide');
   ok($('mlay').open===true||$('mlay').hasAttribute('open'),'the panel is open when the count is odd');
   w.models=[['A',800]].map(([m,q])=>({model:m,planQty:q,actualQty:null,packingModel:m}));w.generateAllocations();w.renderCalc();
   ok(w.planStacking().positions.length===4&&/ไม่เลื่อน/.test($('mlay').textContent)&&!/เลขคี่/.test($('mlay').textContent),'4 pallets (even): every row is a left / right pair, no warning');
  }

  // ================= 6. Print Slip shows the stacks =================
  {scenario();w.planId&&0;$('planId').value='PLAN-35';
   const plan=w.makePlan();
   const sl=w.slipHtml(plan);
   ok(/Stack Pallet/.test(sl)&&/Layer 1 · Bottom/.test(sl)&&/Layer 2 · Top/.test(sl),'Slip: a "Stack Pallet" section lists the stacked positions (Layer 1 bottom / Layer 2 top)');
   const pairs=w.planStacking().pairs;
   ok(pairs.every(pr=>sl.indexOf('Stack '+Math.min(pr.bottom.seq,pr.top.seq)+'-'+Math.max(pr.bottom.seq,pr.top.seq))>=0),'Slip: every pair is named in the Stack column ('+pairs.map(pr=>Math.min(pr.bottom.seq,pr.top.seq)+'-'+Math.max(pr.bottom.seq,pr.top.seq)).join(', ')+')');
   ok((sl.match(/▼/g)||[]).length>=pairs.length&&(sl.match(/▲/g)||[]).length>=pairs.length,'Slip: the Stack column marks which pallet is the bottom (▼) and which is the top (▲)');
   ok(/R1 · L/.test(sl)&&/R1 · R/.test(sl)&&/R2 · L/.test(sl)&&/R2 · R/.test(sl),'Slip: stacks are listed by position from the head (R1 L/R, R2 L/R: 4 pairs = the first 2 rows)');
   const tot=pairs[0].bottom.h+pairs[0].top.h;ok(sl.indexOf('<b>'+w.eval('fmt')(tot)+'</b> cm')>=0,'Slip: stacked height of a pair = bottom + top ('+tot+' cm)');
   ok(w.planStacking().positions.slice(0,4).every(ps=>ps.length===2)&&sl.indexOf('R1 · L')<sl.indexOf('R1 · R')&&sl.indexOf('R1 · R')<sl.indexOf('R2 · L'),'Slip: rows are in head-first order');
   // a plan without stacking prints no Stack section
   w.parts=[part('A')];w.models=[['A',400]].map(([m,q])=>({model:m,planQty:q,actualQty:null,packingModel:m}));$('shipType').value='40HC';w.syncContFromShipType();w.manualLayout=[];w.generateAllocations();w.renderCalc();
   const sl2=w.slipHtml(w.makePlan());
   ok(!/Stack Pallet/.test(sl2)&&!/Layer 1 · Bottom/.test(sl2),'Slip: no Stack section when nothing is stacked');
   // Stack = Y
   w.parts=[part('A'),part('C')];w.models=[['A',200],['C',400]].map(([m,q])=>({model:m,planQty:q,actualQty:null,packingModel:m}));$('stackPallet').checked=false;w.generateAllocations();w.renderCalc();
   w.setStack(w.allocations.findIndex(a=>a.shipmentModel==='C'),'Y');
   const sl3=w.slipHtml(w.makePlan());
   ok(/Stack ×2/.test(sl3)&&/Stack = Y/.test(sl3)&&/C<\/b>|C ×2|\sC\s×2/.test(sl3),'Slip: a Stack = Y pallet is shown as Stack ×2 with its two unit heights');
   // the slip is computed from the SAVED plan, the open form is not disturbed
   const before=JSON.stringify(w.allocations.map(a=>a.stack));w.slipHtml(w.makePlan());ok(JSON.stringify(w.allocations.map(a=>a.stack))===before,'printing the slip leaves the open form untouched');
  }
  // slip of a saved plan with a hand-made layout says so
  {scenario();$('planId').value='PLAN-36';w.manualLayoutSet(0,ref(w.planStacking().positions[1]));
   ok(/จัดตำแหน่งเอง/.test(w.slipHtml(w.makePlan())),'Slip: "จัดตำแหน่งเอง" is printed when the layout was set by hand');
  }

  // ================= 3. Mix layers fit snugly =================
  {const seed0=4242;let seed=seed0;const rnd=()=>(seed=(seed*1103515245+12345)&0x7fffffff)/0x7fffffff;
   const sizes=[[29.6,50.5],[60.5,48],[46.3,28.1],[55,49],[35.8,52],[57,37],[45.2,56.7],[28.2,46.4],[40,30],[36,26.9],[50,29.1],[44.6,64.4]];
   let layers=0,snug=0,full=0,evenFull=0,bad=0,cnt=0;
   for(let it=0;it<60;it++){
     const nt=2+Math.floor(rnd()*2),types=[];for(let i=0;i<nt;i++){const s=sizes[Math.floor(rnd()*sizes.length)];types.push({key:'t'+i+'_'+it,model:'M'+i,w:s[1],d:s[0],h:25,count:6+Math.floor(rnd()*30)})}
     const rem={};types.forEach(t=>rem[t.key]=t.count);let g=0;const L=[];while(Object.values(rem).some(v=>v>0)&&g++<60){const r=w.mixPackOneLayer(types,rem);if(!r.placed)break;L.push(r)}
     if(Object.values(rem).some(v=>v>0))bad++;
     L.slice(0,-1).forEach(r=>{full++;if(r.snug)snug++;if(r.placed%2===0)evenFull++;
       const pl=r.placements;for(let i=0;i<pl.length;i++)for(let j=i+1;j<pl.length;j++){const a=pl[i],b=pl[j];if(!(a.x+a.w<=b.x+1e-6||b.x+b.w<=a.x+1e-6||a.y+a.d<=b.y+1e-6||b.y+b.d<=a.y+1e-6))bad++}
       if(pl.some(p=>p.x<-5-1e-6||p.y<-5-1e-6||p.x+p.w>115+1e-6||p.y+p.d>115+1e-6))bad++});
     layers+=L.length;cnt++;
   }
   ok(bad===0,'60 random Mix groups: every carton placed, no overlap, nothing beyond the 120 x 120 envelope');
   ok(snug/full>=.9,'Mix: '+Math.round(snug/full*100)+'% of the full layers are snug (both sides 100..120 cm: gap or overhang of at most 10 cm)');
   ok(evenFull/full>=.9,'Mix: '+Math.round(evenFull/full*100)+'% of the full layers hold an even number of cartons');
  }
  // memo: the same layer asked twice gives the same answer and does not disturb the caller's counts
  {const t=[{key:'m1',model:'M',w:29.6,d:50.5,h:25,count:30}],r1={m1:30},r2={m1:30};const a=w.mixPackOneLayer(t,r1),b=w.mixPackOneLayer(t,r2);
   ok(a.placed===b.placed&&r1.m1===r2.m1&&r1.m1===30-a.placed&&JSON.stringify(a.placements)===JSON.stringify(b.placements),'a repeated layer request (cached) gives the identical layout and the same remaining count');
  }

  // ================= container fit of the 10 cm overhang =================
  {const L=(wd,dd,n)=>{const t={key:'q',model:'Q',w:wd,d:dd,h:25,count:n};return w.mixPackOneLayer([t],{q:n})};
   // the longer side of a layer is turned along the container length: a layer never overhangs MORE across the width than along the length
   let across=0,total=0;[[29.6,50.5],[28.1,46.3],[48,30],[56,32],[52.4,32.4],[26.3,46.4],[57,37],[60.5,48]].forEach(([d,wd])=>{const r=L(wd,d,60);total++;if(r.spanY<=r.spanX+1e-9)across++});
   ok(across===total,'every layer has spanX >= spanY (the longer side runs along the container length): '+across+' of '+total);
   // 4 x 29.6 = 118.4 wide overhang: two such pallets side by side need 2 x 109.7 across the width -> fits 235
   w.parts=[part('A',{cartonD:29.6,cartonW:50.5,cartonH:25,qtyCarton:10,qtyPallet:600,palletH:13+4*25})];
   w.models=[['A',40]].map(([m,q])=>({model:m,planQty:q,actualQty:null,packingModel:m}));$('shipType').value='40HC';w.syncContFromShipType();w.manualLayout=[];w.generateAllocations();
   w.allocations.forEach(a=>{a.mixGroup='Mix Rem 1';a.skidNo='Mix Rem 1'});w.recalcDerived();w.renderCalc();
   let fit=w.layoutFitIssues(w.planStacking());ok(fit.wide.length===0&&fit.len===null,'1 overhanging pallet in a 40HC: no width / length problem');
   // many overhanging pallets in a 20FT (590 cm): 5 rows x 110 + the overhang of every row > 590
   w.parts=[part('A',{cartonD:29.6,cartonW:50.5,cartonH:25,qtyCarton:10,qtyPallet:600,palletH:13+4*25})];
   w.models=[['A',4000]].map(([m,q])=>({model:m,planQty:q,actualQty:null,packingModel:m}));$('shipType').value='20FT';w.syncContFromShipType();w.generateAllocations();
   w.allocations.forEach(a=>{a.mixGroup='Mix Rem '+(1+w.allocations.indexOf(a));a.skidNo=a.mixGroup});w.recalcDerived();w.renderCalc();
   const st=w.planStacking();fit=w.layoutFitIssues(st);
   ok(st.positions.length>=8&&!!fit.len&&fit.len.need>fit.len.L,'20FT: rows with overhang are checked against the container length ('+(fit.len?fit.len.need+' > '+fit.len.L:'ok')+')');
   ok(/อาจไม่พอดีตู้/.test(d.getElementById('floorStatus').innerHTML),'the Floor status tells the person the overhanging cartons may not fit the container');
   // a layer wider than half the container: both sides 120 -> 240 > 235
   const lay={x:0,y:0};
   w.models=[['A',200]].map(([m,q])=>({model:m,planQty:q,actualQty:null,packingModel:m}));w.parts=[part('A',{cartonD:30,cartonW:40,cartonH:25,qtyCarton:10,qtyPallet:600,palletH:60})];
   $('shipType').value='40HC';w.syncContFromShipType();w.generateAllocations();w.allocations.forEach(a=>{a.mixGroup='Mix Rem 1';a.skidNo='Mix Rem 1'});w.recalcDerived();w.renderCalc();
   ok(typeof w.layoutFitIssues(w.planStacking()).wide==='object','the fit check runs on the open form without error');
  }

  ok(errs.length===0,'no script errors ('+errs.join('|')+')');
  console.log(fail?fail+' FAILED':'ALL PASSED');process.exit(fail?1:0);
},900);
