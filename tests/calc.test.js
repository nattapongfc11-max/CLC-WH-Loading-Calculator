// Pallet Allocation table: columns, pallet height from Qty, Skid numbering, Add Manual Pallet pop-up, Layer-1-only leveling.
const {JSDOM}=require('jsdom');const fs=require('fs');const path=require('path');
const html=fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8');
const dom=new JSDOM(html,{runScripts:'dangerously',pretendToBeVisual:true,url:'https://clc.test/'});
const w=dom.window,d=w.document,errs=[];w.addEventListener('error',e=>errs.push(e.message));
let fail=0;const ok=(c,m)=>{console.log((c?'PASS ':'FAIL ')+m);if(!c)fail++};
w.alert=()=>{};w.confirm=()=>true;
const part=(model,o)=>Object.assign({model,description:model,qtyCarton:10,cartonD:40,cartonW:30,cartonH:25,qtyPallet:200,palletD:110,palletW:110,palletH:125,netPC:1.2,grossCarton:13,grossPallet:260},o||{});
const setup=(ms,ps)=>{w.parts=ps;w.models=ms.map(([m,q])=>({model:m,planQty:q,actualQty:null,packingModel:m}));w.generateAllocations();w.renderCalc()};
setTimeout(()=>{
  // ---- table columns
  setup([['A',500]],[part('A')]);
  const th=[...d.querySelectorAll('table.allocation thead th')];const names=th.map(x=>x.textContent.trim());
  ok(!names.includes('CTN.NO')&&!/ctnNo/.test(d.getElementById('allocations').innerHTML),'CTN.NO column removed (header and cells)');
  ok(names[0]==='Separate Type Model','first column is Separate Type Model');
  ok(['Skid Pallet Total','Skid Pallet No.'].every(n=>{const t=th.find(x=>x.textContent.trim()===n);return t&&t.classList.contains('col-pack')}),'Skid Pallet Total / No. moved into Packing Details (hidden by default)');
  ok(d.querySelectorAll('#allocations tr').length>0&&[...d.querySelectorAll('#allocations tr')].every(tr=>tr.children.length===th.length),'every row has one cell per header ('+th.length+' columns)');
  ok(/\.allocation \.model-input\{[^}]*font-weight:700/.test(html)&&d.querySelector('#allocations input.model-input'),'Separate Type Model text is bold');
  ok(w.allocations.every(a=>n(a.ctnNo)>0),'CTN count is still calculated internally (summary / mix layout)');
  function n(v){return Number(v)||0}
  // ---- Skid numbering is automatic
  ok(w.allocations.filter(a=>!w.isMixAllocation(a)).map(a=>a.skidNo).join()==='1,2'&&w.allocations.every(a=>a.skidTotal===3),'Skid No. 1,2 + Mix; Skid Total = 3 pallets for the model');
  // ---- height follows Qty
  const solo=w.allocations.find(a=>w.isMixAllocation(a));solo.mixGroup='N';solo.skidNo=3;w.recalcDerived();w.renderCalc();
  const idx=w.allocations.indexOf(solo);
  w.editAlloc(idx,'qtyPallet','200');ok(w.allocations[idx].palletH===125,'full pallet = Part Master height (125)');
  w.editAlloc(idx,'qtyPallet','100');const h100=w.allocations[idx].palletH;ok(h100>7&&h100<125&&Math.abs(h100-77.8)<0.2,'Qty 100 -> height re-calculated ('+h100+' cm, 3 of 5 layers)');
  w.editAlloc(idx,'qtyPallet','40');ok(Math.abs(w.allocations[idx].palletH-30.6)<0.2,'Qty 40 -> 1 layer ('+w.allocations[idx].palletH+' cm)');
  w.editAlloc(idx,'palletH','99');w.editAlloc(idx,'remark','x');ok(w.allocations[idx].palletH===99,'height typed by the user stays while other fields change');
  w.editAlloc(idx,'qtyPallet','160');ok(Math.abs(w.allocations[idx].palletH-101.4)<0.3&&!w.allocations[idx].hManual,'editing Qty recalculates the height again ('+w.allocations[idx].palletH+' cm, 4 layers)');
  ok(d.querySelectorAll('#allocations .dim-input')[2].value==String(w.allocations[0].palletH),'height shown in the table');
  w.parts=[part('A',{palletStack:'Y'})];w.models=[{model:'A',planQty:400,actualQty:null,packingModel:'A'}];w.generateAllocations();w.renderCalc();
  ok(w.allocations.length===1&&w.allocations[0].stack==='Y'&&w.allocations[0].palletH===250,'Stack = Y full pallet = 2 x 125');
  w.editAlloc(0,'qtyPallet','200');ok(Math.abs(w.allocations[0].palletH-2*125)>1&&w.allocations[0].palletH<250,'Stack = Y half quantity -> lower height ('+w.allocations[0].palletH+')');
  w.parts=[part('P',{qtyCarton:4,qtyPallet:4,cartonD:33.5,cartonW:55.5,cartonH:48,palletD:33.5,palletW:55.5,palletH:48})];w.models=[{model:'P',planQty:4,actualQty:null,packingModel:'P'}];w.generateAllocations();w.renderCalc();
  ok(w.allocations[0].palletH===48,'loose-carton part (pallet = 1 carton) keeps its height');
  // ---- Add Manual Pallet pop-up
  setup([['A',500],['B',300]],[part('A'),part('B',{qtyCarton:6,cartonD:55,cartonW:36,cartonH:30})]);
  const sumOf=m=>w.allocations.filter(a=>a.shipmentModel===m).reduce((s,a)=>s+n(a.qtyPallet),0);
  w.addManualAllocation();
  ok(d.getElementById('manualModal').classList.contains('open')&&d.querySelectorAll('#manualRows tr').length===2,'Add Manual Pallet opens a pop-up listing the Shipment Order models');
  const r0=[...d.querySelectorAll('#manualRows tr')[0].children].map(c=>c.textContent.trim());
  ok(r0[0]==='A'&&r0[2]==='500'&&r0[3]==='500'&&r0[4]==='0','pop-up shows Shipment Qty 500 / already on pallets 500 / balance 0 ('+r0.slice(0,5).join(' | ')+')');
  ok(d.getElementById('manualOk').disabled===true,'cannot add until a quantity is entered');
  w.manSet(1,'999');ok(d.getElementById('manualOk').disabled===true&&/เกิน Shipment Qty/.test(d.getElementById('manualPreview').textContent),'quantity above the Shipment Qty is rejected');
  const before=w.allocations.length;
  w.manSet(1,'40');ok(/หักจาก Pallet เดิม/.test(d.getElementById('manualPreview').textContent)&&d.getElementById('manualOk').disabled===false,'preview: 40 comes from the existing pallets of that model');
  w.manualConfirm();
  const man=w.allocations.filter(a=>a.remark==='Manual');
  ok(man.length===1&&man[0].shipmentModel==='B'&&man[0].qtyPallet===40&&!w.isMixAllocation(man[0]),'one manual pallet row: B x 40 (single model = standalone pallet)');
  ok(sumOf('B')===300&&sumOf('A')===500,'Shipment Qty still balanced after the manual pallet (B 300, A 500)');
  ok(!d.getElementById('manualModal').classList.contains('open')&&w.allocations.length>=before,'pop-up closes after adding');
  ok(man[0].palletH>0&&man[0].palletH<125,'manual pallet height is calculated from its quantity ('+man[0].palletH+' cm)');
  // several models -> one Mix Pallet
  w.addManualAllocation();w.manSet(0,'30');w.manSet(1,'20');
  ok(d.querySelectorAll('input[name=manMode]').length===2&&/Mix Pallet \d/.test(d.getElementById('manualPreview').textContent),'two models selected -> choice between one Mix Pallet or separate pallets');
  w.manualConfirm();
  const mm=w.allocations.filter(a=>a.remark==='Manual'&&w.isMixAllocation(a));
  ok(mm.length===2&&new Set(mm.map(a=>a.mixGroup)).size===1&&/^Mix Pallet \d+$/.test(mm[0].mixGroup),'two manual rows share one new Mix Pallet group ('+(mm[0]&&mm[0].mixGroup)+')');
  ok(sumOf('A')===500&&sumOf('B')===300,'quantities still balanced after the Mix Pallet');
  w.addManualAllocation();w.manSet(0,'10');w.manSet(1,'10');w.manMode('sep');w.manualConfirm();
  ok(w.allocations.filter(a=>a.remark==='Manual'&&!w.isMixAllocation(a)).length===3,'"separate" mode adds one standalone pallet per model');
  // balance first: unallocated quantity is used before existing pallets are reduced
  setup([['A',500]],[part('A')]);const rowsBefore=w.allocations.map(a=>a.qtyPallet).join();
  w.editAlloc(0,'qtyPallet','50');w.addManualAllocation();
  ok(/150/.test(d.querySelectorAll('#manualRows tr')[0].children[4].textContent),'after reducing a row the balance (BL) is 150');
  w.manFill(0);ok(d.getElementById('manQ0').value==='150','"เหลือ" fills the unallocated balance');
  w.manualConfirm();ok(sumOf('A')===500&&w.allocations.filter(a=>a.remark==='Manual')[0].qtyPallet===150&&w.allocations[0].qtyPallet===50,'balance used first: existing pallets untouched (rows before: '+rowsBefore+')');
  // ---- Layer 1 levelled, Layer 2 free
  {const lay=(cap,stackOn)=>{d.getElementById('floorCap').value=cap;d.getElementById('stackPallet').checked=stackOn};
   const B=part('B',{qtyCarton:1,qtyPallet:100,cartonD:55,cartonW:36,cartonH:33,grossPallet:100});
   const A=part('A'); // one full flat pallet 125 cm
   w.parts=[A,B];w.models=[{model:'A',planQty:200,actualQty:null,packingModel:'A'},{model:'B',planQty:24,actualQty:null,packingModel:'B'}];
   lay(1,false);w.generateAllocations();w.renderCalc();
   let gs=w.calculateMixPalletLayouts();
   ok(gs.length===2&&gs.every(g=>g.totalHeight<=130&&!g.topFree),'stacking off: Mix group is levelled and split into pallets <= 130 cm ('+gs.map(g=>g.totalHeight).join(',')+')');
   lay(1,true);w.generateAllocations();w.renderCalc();
   gs=w.calculateMixPalletLayouts();const sp=w.planStacking();
   ok(gs.length===1&&gs[0].topFree&&gs[0].totalHeight>130,'stacking on: the split pieces are joined into ONE Layer-2 pallet taller than 130 cm ('+gs.map(g=>g.totalHeight).join(',')+')');
   ok(sp.pairs.length===1&&sp.pairs[0].top.mix&&sp.pairs[0].bottom.flat&&sp.floorUsed===1&&sp.pairs[0].bottom.h+sp.pairs[0].top.h<=sp.H,'Layer 2 is the joined Mix pallet, Layer 1 is flat; pair height '+(sp.pairs[0]&&(sp.pairs[0].bottom.h+sp.pairs[0].top.h))+' <= container '+sp.H);
   ok(d.getElementById('savePlanBtn').disabled===false&&/Layer 2/.test(d.getElementById('mixCalcPanel').textContent),'fits the container -> Save allowed; Mix card labels the pallet Layer 2');
   // the pair would exceed the container height -> not joined
   d.getElementById('contH').value=250;d.getElementById('containerType').value='Other';w.renderSummary();w.generateAllocations();w.renderCalc();
   gs=w.calculateMixPalletLayouts();ok(gs.every(g=>g.totalHeight<=130&&!g.topFree),'if the pair would be taller than the container, the Mix group stays levelled (<=130)');
   d.getElementById('containerType').value='40HC';d.getElementById('contH').value=269;
   // a 155 cm master pallet may ride on top (limit is the container, not 130)
   const A2=part('A2',{palletH:100,grossPallet:260}),Z=part('Z',{palletH:155,grossPallet:200});
   w.parts=[A2,Z];w.models=[{model:'A2',planQty:200,actualQty:null,packingModel:'A2'},{model:'Z',planQty:200,actualQty:null,packingModel:'Z'}];lay(1,true);w.generateAllocations();w.renderCalc();
   const s2=w.planStacking();ok(s2.pairs.length===1&&s2.pairs[0].top.h===155&&s2.pairs[0].bottom.h===100&&s2.floorUsed===1,'155 cm pallet stacks on a flat 100 cm pallet (255 <= 269)');
   w.parts=[part('A'),Z];w.models=[{model:'A',planQty:200,actualQty:null,packingModel:'A'},{model:'Z',planQty:200,actualQty:null,packingModel:'Z'}];w.generateAllocations();w.renderCalc();
   ok(w.planStacking().pairs.length===0&&w.planStacking().floorUsed===2,'125 + 155 = 280 > 269 -> not stacked');
   ok(w.planStacking().pairs.every(p=>p.bottom.flat),'bottoms always flat');
   lay(20,true);}
  ok(errs.length===0,'no script errors ('+errs.join('; ')+')');
  console.log(fail?fail+' FAILED':'ALL PASSED');process.exit(fail?1:0);
},300);
