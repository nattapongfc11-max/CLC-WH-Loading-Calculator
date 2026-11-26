// Smoke / regression tests for the CLC calculator (runs index.html in jsdom, Supabase not loaded).
const {JSDOM}=require('jsdom');const fs=require('fs');const path=require('path');
const html=fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8');
const dom=new JSDOM(html,{runScripts:'dangerously',pretendToBeVisual:true,url:'https://clc.test/'});
const w=dom.window,d=w.document,errs=[];w.addEventListener('error',e=>errs.push(e.message));
let fail=0;const ok=(c,m)=>{console.log((c?'PASS ':'FAIL ')+m);if(!c)fail++};
const part=(model,o)=>Object.assign({model,description:model,qtyCarton:10,cartonD:40,cartonW:30,cartonH:25,qtyPallet:200,palletD:110,palletW:110,palletH:125,netPC:1.2,grossCarton:13,grossPallet:260},o);
setTimeout(()=>{
  w.parts=[part('A'),part('B',{qtyCarton:6,cartonD:55,cartonW:36,netPC:2.5}),part('C',{qtyCarton:4,cartonD:50,cartonW:40,cartonH:30,netPC:4})];
  w.fillSelects();
  // 1. Single model: 200 PCS = 1 physical pallet, tare 7 kg applied once
  w.models=[{model:'A',planQty:200,actualQty:null,packingModel:'A'}];w.generateAllocations();w.renderCalc();
  ok(w.physicalPalletCount()===1,'single model -> 1 physical pallet');
  ok(Math.abs(w.allocations.reduce((s,a)=>s+a.grossLine,0)-(260+7))<1e-6,'gross = pallet gross + 7 kg tare');
  // 2. Mix group counts as ONE physical pallet and tare is not duplicated
  w.models=[{model:'A',planQty:50,actualQty:null,packingModel:'A'},{model:'B',planQty:30,actualQty:null,packingModel:'B'}];w.generateAllocations();
  w.allocations.forEach(a=>{a.mixGroup='Mix Pallet 1';a.skidNo='Mix Pallet 1'});w.recalcDerived();w.renderCalc();
  ok(w.physicalPalletCount()===1,'mix group of 2 models -> 1 physical pallet');
  const tareTotal=w.allocations.reduce((s,a)=>s+a.grossLine-a.grossKgPallet,0);ok(Math.abs(tareTotal-7)<1e-6,'tare counted once per mix group (7 kg)');
  const lay=w.calculateMixPalletLayouts()[0];
  ok(lay.cartons===10,'mix cartons = 5 (A) + 5 (B)');
  ok(lay.totalHeight===7+lay.stackHeight,'total height = 7 cm base + sum of layer heights');
  ok(d.querySelectorAll('#mixCalcPanel svg.pal3d').length>=1&&!d.querySelector('#mixCalcPanel svg.topview')&&!/Top View/.test(d.getElementById('mixCalcPanel').textContent),'3D per pallet rendered in the Mix card (no 2D Top View)');
  w.pal3dAll();{const sv=d.querySelector('#mixCalcPanel svg.pal3d');ok(sv.querySelectorAll('polygon').length>=20&&/110 × 110 ×/.test(sv.textContent),'the 3D pallet draws its cartons and prints 110 × 110 × H');const y0=w.eval('PAL3.cam.yaw');w.eval('PAL3.cam.yaw=60');w.pal3dAll();ok(sv.innerHTML!==''&&w.eval('PAL3.cam.yaw')===60,'rotating the camera redraws the pallet');w.eval('PAL3.cam.yaw='+y0)}
  // 3. Different heights never share a layer
  w.models=[{model:'A',planQty:20,actualQty:null,packingModel:'A'},{model:'C',planQty:8,actualQty:null,packingModel:'C'}];w.generateAllocations();
  w.allocations.forEach(a=>{a.mixGroup='Mix Pallet 1';a.skidNo='Mix Pallet 1'});w.recalcDerived();
  const l2=w.calculateMixPalletLayouts()[0];ok(l2.heightGroups.length===2,'25 cm and 30 cm cartons are separate height groups');
  // 3b. Mix group taller than 130 cm is split into several physical pallets
  w.models=[{model:'A',planQty:400,actualQty:null,packingModel:'A'}];w.generateAllocations();
  w.allocations.forEach(a=>{a.mixGroup='Mix Pallet 1';a.skidNo='Mix Pallet 1'});w.recalcDerived();w.renderCalc();
  const gs=w.calculateMixPalletLayouts();
  ok(gs.length===2,'40 cartons x 25 cm (7+5x25=132 cm) split into 2 mix pallets, got '+gs.length);
  ok(gs.every(g=>g.totalHeight<=130),'every split pallet <= 130 cm ('+gs.map(g=>g.totalHeight).join(', ')+')');
  ok(w.allocations.reduce((s,a)=>s+a.ctnNo,0)===40&&w.allocations.reduce((s,a)=>s+a.qtyPallet,0)===400,'split keeps total cartons (40) and qty (400)');
  ok(w.physicalPalletCount()===2&&Math.abs(w.allocations.reduce((s,a)=>s+a.grossLine-a.grossKgPallet,0)-14)<1e-6,'2 physical pallets -> tare 14 kg');
  ok(gs[0].group==='Mix Rem 1'&&gs[1].group==='Mix Rem 2','single-model split pieces are Pallet เศษ (internal Mix Rem 1, 2), never numbered as Mix Pallet, no "(2)" names');
  w.recalcDerived();ok(w.calculateMixPalletLayouts().length===2,'split is stable on recalculation');
  // 3c. 40HC floor capacity = 20 pallets
  w.models=[{model:'A',planQty:200*21,actualQty:null,packingModel:'A'}];w.generateAllocations();w.renderCalc();
  d.getElementById('stackPallet').checked=false;w.renderSummary();
  ok(w.physicalPalletCount()===21&&/เกินความจุพื้นตู้/.test(d.getElementById('floorStatus').textContent),'21 pallets on 40HC, stacking off -> floor capacity warning');
  d.getElementById('stackPallet').checked=true;w.renderSummary();
  let stk=w.planStacking();
  ok(stk.pairs.length===1&&stk.floorUsed===20&&!/เกินความจุพื้นตู้/.test(d.getElementById('floorStatus').textContent),'21 pallets, stacking on -> 1 stacked pair = 20 floor positions');
  ok(stk.pairs[0].bottom.flat&&stk.pairs[0].bottom.gross>=stk.pairs[0].top.gross&&stk.pairs[0].bottom.h+stk.pairs[0].top.h<=269,'stack pair: flat heavier bottom, total height <= 269 cm');
  w.models=[{model:'A',planQty:200*45,actualQty:null,packingModel:'A'}];w.generateAllocations();w.renderCalc();
  ok(w.planStacking().floorUsed>20&&/เกินความจุพื้นตู้/.test(d.getElementById('floorStatus').textContent),'45 pallets cannot fit even stacked 2-high -> warning');
  w.models=[{model:'A',planQty:200*21,actualQty:null,packingModel:'A'}];w.generateAllocations();w.renderCalc();
  w.models=[{model:'A',planQty:200*20,actualQty:null,packingModel:'A'}];w.generateAllocations();w.renderCalc();
  ok(/20 \/ 20/.test(d.getElementById('floorStatus').textContent)&&/เหลือ 0/.test(d.getElementById('floorStatus').textContent),'20 pallets on 40HC -> exactly full, no warning');
  // 4. Dashboard / History
  const today=new Date().toISOString().slice(0,10);
  w.plans=[{planId:'P1',requestDate:today,etd:today,destination:'JP',port:'TKY',shipBy:'Sea',deliveryTime:'09:30',models:[{model:'A'}],summary:{models:1,pallets:3,qty:600,gross:900,cbm:4.2},updatedAt:today+'T01:00:00Z'},
           {planId:'P2',requestDate:'2020-01-05',destination:'US',port:'LAX',models:[{model:'B'}],summary:{models:1,pallets:1,qty:60,gross:200,cbm:1}}];
  w.eval('DASH.y='+new Date().getFullYear()+';DASH.m='+(new Date().getMonth()+1)+';DASH.g="dd"');w.renderAll();
  ok(d.querySelectorAll('#dashChart .dash-bar').length>=28,'dashboard daily chart rendered');
  ok(d.querySelector('#recentPlans').textContent.includes('P1')&&!d.querySelector('#recentPlans').textContent.includes('P2'),'daily plan table shows only the selected month');
  w.setDash('g','mm');ok(d.querySelectorAll('#dashChart .dash-bar').length===12,'month view has 12 bars');
  d.getElementById('histSearch').value='LAX';w.renderHistory();
  ok(d.getElementById('historyTable').textContent.includes('P2')&&!d.getElementById('historyTable').textContent.includes('P1'),'history search filters by destination/port');
  w.clearHistoryFilter();d.getElementById('histFrom').value=today;w.renderHistory();
  ok(!d.getElementById('historyTable').textContent.includes('P2'),'history date filter works');
  ok(errs.length===0,'no runtime errors '+errs.join(';'));
  console.log(fail?fail+' FAILED':'ALL PASSED');process.exit(fail?1:0);
},300);
