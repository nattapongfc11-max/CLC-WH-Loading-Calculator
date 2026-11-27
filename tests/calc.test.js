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
  ok(!names.includes('Skid Pallet Total')&&names.filter(x=>/^Skid Pallet No\./.test(x)).length===1,'Skid Pallet Total column removed; one Skid Pallet No. column');
  const skidTh=th.find(x=>/^Skid Pallet No\./.test(x.textContent.trim()));ok(skidTh&&!skidTh.classList.contains('col-pack'),'Skid Pallet No. is visible by default (not hidden with Packing Details)');
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
  w.editAlloc(idx,'qtyPallet','100');const h100=w.allocations[idx].palletH;ok(h100>13&&h100<125&&Math.abs(h100-69)<0.2,'Qty 100 -> height re-calculated ('+h100+' cm = 13 cm pallet + 2 of 4 layers of 28 cm)');
  w.editAlloc(idx,'qtyPallet','40');ok(Math.abs(w.allocations[idx].palletH-41)<0.2,'Qty 40 -> 1 layer ('+w.allocations[idx].palletH+' cm)');
  w.editAlloc(idx,'palletH','99');w.editAlloc(idx,'remark','x');ok(w.allocations[idx].palletH===99,'height typed by the user stays while other fields change');
  w.editAlloc(idx,'qtyPallet','160');ok(Math.abs(w.allocations[idx].palletH-125)<0.3&&!w.allocations[idx].hManual,'editing Qty recalculates the height again ('+w.allocations[idx].palletH+' cm, 4 layers)');
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
   const B=part('B',{qtyCarton:1,qtyPallet:100,cartonD:55,cartonW:36,cartonH:32,grossPallet:100}); // 4 layers x 32 + 13 cm pallet = 141 cm: taller than 130, and 125 + 141 = 266 <= 269
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
  const FM=w.eval('fmt');
  // ---- Skid Pallet No. = "No./Total" in one cell
  setup([['A',500]],[part('A')]);
  ok([...d.querySelectorAll('#allocations td.skidcell')].map(x=>x.textContent).join()==='1/3,2/3,3/3','Skid Pallet No. shows No./Total in one cell: 1/3, 2/3, 3/3 (the remainder Mix pallet is the 3rd)');
  setup([['A',500],['B',300]],[part('A'),part('B',{qtyCarton:6,cartonD:55,cartonW:36,cartonH:30})]);
  ok(w.allocations.filter(a=>a.shipmentModel==='B').every(a=>w.skidLabel(a).split('/')[1]===String(a.skidTotal))&&[...d.querySelectorAll('#allocations td.skidcell')].every(x=>/^\d+\/\d+$/.test(x.textContent)),'every row shows No./Total, numbered per model');
  // ---- Mix Pallets run on as 1, 2, 3 (split pieces included, custom names kept)
  {const C=part('C',{cartonH:25,qtyPallet:300,palletH:125}),D=part('D',{cartonH:20,qtyCarton:10,qtyPallet:200,palletH:60}),E=part('E',{cartonH:20,qtyCarton:10,qtyPallet:200,palletH:60});
   w.parts=[C,D,E];w.models=[{model:'C',planQty:600,actualQty:null,packingModel:'C'},{model:'D',planQty:100,actualQty:null,packingModel:'D'},{model:'E',planQty:100,actualQty:null,packingModel:'E'}];w.generateAllocations();
   w.allocations.forEach(a=>{if(a.shipmentModel==='C'){a.mixGroup='Mix Pallet 1';a.skidNo='Mix Pallet 1'}else if(a.shipmentModel==='D'){a.mixGroup='Mix Pallet 2';a.skidNo='Mix Pallet 2'}else{a.mixGroup='Mix Special';a.skidNo='Mix Special'}});
   w.recalcDerived();w.renderCalc();
   const names=[...new Set(w.allocations.map(a=>a.mixGroup))];
   ok(names.join()==='Mix Rem 1,Mix Rem 2,Mix Rem 3,Mix Special','groups with ONE Model are Pallet เศษ (Mix Rem 1, 2, 3 internally) and never take a Mix Pallet number; a custom name is kept ('+names.join(' | ')+')');
   {const PI=w.palletInfoOf(w.allocations);ok(PI.groups.every(g=>g.kind!=='mix')&&PI.groups.filter(g=>g.kind==='rem').length===3&&PI.groups.filter(g=>g.kind==='rem').every(g=>g.label==='Pallet เศษ'),'a one-Model pallet below its Qty/Pallet is displayed as "Pallet เศษ"; a one-Model group is never a Mix Pallet');}
   ok(!w.allocations.some(a=>/\(\d+\)/.test(a.mixGroup)),'no "(2)" style names remain');
   ok(w.allocations.every(a=>!w.isMixAllocation(a)||a.skidNo===a.mixGroup),'Skid No. of Mix rows follows the new group name');
   ok(w.allocations.find(a=>a.shipmentModel==='D').mixGroup==='Mix Rem 3','the group that came after the split group moved from 2 to 3');
   w.recalcDerived();ok([...new Set(w.allocations.map(a=>a.mixGroup))].join()===names.join(),'recalculating again keeps the same numbers (stable)');
   // D and E share one pallet (2 Models) -> the FIRST true Mix Pallet is "Mix Pallet 1"; the one-Model pieces stay Pallet เศษ
   w.allocations.forEach(a=>{if(a.shipmentModel==='D'||a.shipmentModel==='E'){a.mixGroup='Mix Pallet 7';a.skidNo='Mix Pallet 7'}});w.recalcDerived();w.renderCalc();
   ok([...new Set(w.allocations.map(a=>a.mixGroup))].join()==='Mix Rem 1,Mix Rem 2,Mix Pallet 1','a pallet carrying 2 Models becomes Mix Pallet 1; the one-Model pieces stay Mix Rem ('+[...new Set(w.allocations.map(a=>a.mixGroup))].join(' | ')+')');
   {const PI=w.palletInfoOf(w.allocations),mx=PI.groups.filter(g=>g.kind==='mix');ok(mx.length===1&&mx[0].label==='Mix Pallet 1'&&mx[0].models.join()==='D,E','display label of the true mix = "Mix Pallet 1" (D + E)');
    const seqCells=[...d.querySelectorAll('#allocations td.seqcell')],txt=seqCells.map(x=>x.textContent);
    const iD=w.allocations.findIndex(a=>a.shipmentModel==='D'),iE=w.allocations.findIndex(a=>a.shipmentModel==='E');
    ok(seqCells[iD].querySelector('b').textContent===seqCells[iE].querySelector('b').textContent&&/Mix Pallet 1/.test(seqCells[iD].textContent)&&/Mix Pallet 1/.test(seqCells[iE].textContent),'Pallet Seq column: D and E sit on ONE pallet -> the same Seq is repeated on both rows ('+txt.join(' | ')+')');
    ok(seqCells.filter(x=>/Pallet เศษ/.test(x.textContent)).length===1,'one-Model partial pallets are tagged "Pallet เศษ" in the Pallet Seq column');
    ok(!/Group Mix/.test(d.querySelector('table.allocation thead').textContent)&&/Pallet Seq/.test(d.querySelector('table.allocation thead').textContent),'Group Mix column is gone, Pallet Seq is there');
    ok(!d.querySelector('#allocations input[onchange^="editMix"]'),'no free-text Group Mix input in the rows any more');
    ok(/Mix Pallet 1/.test(d.getElementById('mixCalcPanel').textContent)&&/Pallet เศษ/.test(d.getElementById('mixCalcPanel').textContent),'Mix cards are titled Mix Pallet 1 / Pallet เศษ');}
   // a custom-named group with 2 Models keeps its name
   w.allocations.forEach(a=>{if(a.shipmentModel==='D'||a.shipmentModel==='E'){a.mixGroup='Mix Special';a.skidNo='Mix Special'}});w.recalcDerived();w.renderCalc();
   ok(w.palletInfoOf(w.allocations).groups.some(g=>g.kind==='mix'&&g.label==='Mix Special'),'a custom-named 2-Model group keeps its own name');
   // legacy plan data ("Mix Pallet 1 (6)") is cleaned on load
   w.allocations.forEach(a=>{if(a.shipmentModel==='C'){a.mixGroup='Mix Pallet 1 (6)';a.skidNo='Mix Pallet 1 (6)';delete a.skidSeq;delete a.skidTotal}});w.renderCalc();
   ok(![...d.querySelectorAll('#allocations td.skidcell')].some(x=>/\(\d+\)|Mix/.test(x.textContent))&&!w.allocations.some(a=>/\(\d+\)/.test(a.mixGroup)),'old saved names such as "Mix Pallet 1 (6)" are renumbered when a plan is opened');
  }
  // ---- Stacking plan: which pallet is on top / bottom / paired with which (the pair planner; "overflow -> Stack = Y" is tested in layout34.test.js)
  d.getElementById('autoStackY').checked=false;
  {const lay=(cap,stackOn)=>{d.getElementById('floorCap').value=cap;d.getElementById('stackPallet').checked=stackOn};
   const Cp=part('C',{qtyCarton:12,cartonH:20,qtyPallet:240,palletH:110,grossPallet:180}),Bp=part('B',{qtyCarton:6,cartonD:55,cartonW:36,cartonH:30,qtyPallet:96,palletH:120,grossPallet:200});
   w.parts=[part('A'),Bp,Cp];w.models=[{model:'A',planQty:200*17+60,actualQty:null,packingModel:'A'},{model:'B',planQty:96*4+30,actualQty:null,packingModel:'B'},{model:'C',planQty:240*5+120,actualQty:null,packingModel:'C'}];
   lay(20,true);w.generateAllocations();w.renderCalc();
   const st=w.planStacking(),sim=d.getElementById('simLayout');
   ok(st.pairs.length>=3&&sim.querySelectorAll('table.stk tr.pair').length===st.pairs.length,'stacking plan table highlights every stacked pair ('+st.pairs.length+')');
   ok(sim.querySelectorAll('table.stk tbody tr').length===st.positions.length,'one table row per floor position');
   const pr=st.pairs[0],rowTxt=[...sim.querySelectorAll('table.stk tr.pair')][0].textContent;
   ok(rowTxt.includes('#'+pr.top.seq)&&rowTxt.includes('#'+pr.bottom.seq)&&rowTxt.includes('ซ้อนบน'),'a pair row names the pallet on top (#'+pr.top.seq+') and the one underneath (#'+pr.bottom.seq+')');
   ok(rowTxt.includes('('+FM(pr.bottom.h)+' + '+FM(pr.top.h)+') = '+FM(pr.bottom.h+pr.top.h)),'stacked dimension = D × W × (H bottom + H top) = '+FM(pr.bottom.h+pr.top.h)+' cm');
   ok(/Gross kg/.test(sim.textContent)&&rowTxt.includes(FM(pr.bottom.gross+pr.top.gross)),'stacked gross weight = bottom + top');
   ok(/วิธีคำนวณ Dimension เมื่อซ้อน Pallet/.test(sim.textContent)&&/ความสูงภายในตู้ <b>269 cm|ความสูงภายในตู้ 269 cm/.test(sim.innerHTML.replace(/<\/?b>/g,'')),'the calculation rule is explained on the page, with the container height');
   ok(sim.textContent.includes('(บน) วางบน #'),'summary sentence: "#top (บน) วางบน #bottom (ล่าง)"');
   const mixPair=st.pairs.find(p=>p.top.mix||p.bottom.mix);
   ok(!!mixPair,'the scenario stacks a Mix pallet (so the Mix card partner text is exercised)');
   if(mixPair){const mk=(mixPair.top.mix?mixPair.top:mixPair.bottom),other=mk===mixPair.top?mixPair.bottom:mixPair.top,card=[...d.querySelectorAll('#mixCalcPanel .mix-group-card')].find(c=>c.querySelector('.chip').textContent==='Pallet Seq #'+mk.seq);
     ok(card&&card.textContent.includes('Pallet Seq #'+mk.seq)&&card.textContent.includes('#'+other.seq)&&card.textContent.includes(mk===mixPair.top?'ซ้อนบน Pallet #':'รับ Pallet #'),'Mix card shows its Pallet No. and which pallet it is stacked with ('+mk.mixName+' ↔ #'+other.seq+')')}
   lay(30,true);w.renderCalc();
   ok(d.getElementById('simLayout').querySelectorAll('table.stk tr.pair').length===0&&/ไม่มีการซ้อน Pallet/.test(d.getElementById('simLayout').textContent),'no stacking needed: the page says so');
   lay(20,true);}
  // ---- Stack = Y = two pallets of the SAME Model stacked, counted as ONE (one Seq, one floor position); the sketch draws both pallets
  {const ZY=part('ZY',{qtyCarton:8,qtyPallet:64,palletH:107,cartonH:25,palletStack:'Y'}),B=part('B',{palletStack:'N'});w.parts=[ZY,B];
   const run=q=>{w.models=[{model:'ZY',planQty:q,actualQty:null,packingModel:'ZY'},{model:'B',planQty:60,actualQty:null,packingModel:'B'}];lay(40,false);w.generateAllocations();w.renderCalc();return w.simPallets().find(p=>p.rows.some(a=>a.shipmentModel==='ZY'&&!w.isMixAllocation(a)))};
   function lay(cap,on){d.getElementById('floorCap').value=cap;d.getElementById('stackPallet').checked=on}
   const skids=()=>w.eval("s3items(SIM3.scene,[0,-1,.5]).filter(i=>i.k==='skid').length");
   let pl=run(128);
   ok(pl&&pl.rows.length===1&&pl.rows[0].qtyPallet===128&&pl.units&&pl.units.length===2&&pl.units[0]===107&&pl.units[1]===107&&pl.h===214,'Stack = Y, Qty 128 (STD 64): ONE row / ONE Seq, two pallets 107 + 107 = 214 cm');
   ok(pl.kind==='full','128 = two full pallets -> not a Pallet เศษ');
   const nPal=w.simPallets().length;ok(skids()===nPal+1,'the 3D sketch draws BOTH pallets of the stack (a skid under each): '+skids()+' skids for '+nPal+' Seq');
   ok(w.planStacking().floorUsed===nPal&&w.planStacking().pls.find(x=>x.key===pl.key).doubled,'the stack takes ONE floor position and is not stacked a third time');
   pl=run(100);
   ok(pl.units&&pl.units[0]===107&&pl.units[1]<107&&pl.units[1]>7&&pl.kind==='rem','Qty 100: bottom pallet filled first (full, 107 cm), top pallet carries the other 36 (lower: '+(pl.units&&pl.units[1])+' cm) -> Pallet เศษ');
   ok(Math.abs(pl.h-(pl.units[0]+pl.units[1]))<0.11,'total height = bottom + top ('+pl.h+' cm)');
   ok(!w.allocations.some(a=>a.shipmentModel==='ZY'&&w.isMixAllocation(a)),'a Stack remainder larger than one pallet stays its own stacked row (it is not pushed into a Mix pallet)');
   const pl50=run(50);
   ok(!pl50||!pl50.units,'Stack = Y with Qty up to ONE pallet: a single pallet, nothing on top');
   lay(20,true);
  }
  ok(errs.length===0,'no script errors ('+errs.join('; ')+')');
  console.log(fail?fail+' FAILED':'ALL PASSED');process.exit(fail?1:0);
},300);
