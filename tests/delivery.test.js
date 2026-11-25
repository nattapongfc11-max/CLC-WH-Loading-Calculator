// Delivery board, booking (Firm / Delivered Complete / Slide / Cancel), paste import, simulation, dashboard metrics.
const {JSDOM}=require('jsdom');const fs=require('fs');const path=require('path');
const html=fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8');
const dom=new JSDOM(html,{runScripts:'dangerously',pretendToBeVisual:true,url:'https://clc.test/'});
const w=dom.window,d=w.document,errs=[];w.addEventListener('error',e=>errs.push(e.message));
let fail=0;const ok=(c,m)=>{console.log((c?'PASS ':'FAIL ')+m);if(!c)fail++};
w.alert=()=>{};w.confirm=()=>true;
const part=(model,o)=>Object.assign({model,description:model,qtyCarton:10,cartonD:40,cartonW:30,cartonH:25,qtyPallet:200,palletD:110,palletW:110,palletH:125,netPC:1.2,grossCarton:13,grossPallet:260},o||{});
setTimeout(async()=>{
  const now=new Date('2026-11-25T10:00:00+07:00');
  const P=(id,time,extra)=>Object.assign({planId:id,requestDate:'2026-11-25',deliveryTime:time,destination:'X',port:'Y',shipBy:'Sea',summary:{pallets:2,gross:500,cbm:3}},extra||{});
  const full=(date,time)=>({containerNo:'ABCD1234567',sealNo:'S1',loadingBy:'A',loadDate:date,loadTime:time,invoiceNo:'I1',driver:'D',subTruck:'T'});
  ok(w.delivInfo(P('A','09:00'),now).key==='overdue','Firm past plan time, not delivered -> Delay (overdue)');
  ok(w.delivInfo(P('B','15:00'),now).label==='Firm · รอส่ง','order = Firm, waiting (no status field needed)');
  ok(w.delivInfo(P('C','09:00',{booking:full('2026-11-25','08:30')}),now).label==='Delivered Complete · On time','all fields filled before plan -> Delivered Complete On time');
  ok(w.delivInfo(P('D','09:00',{booking:full('2026-11-25','10:15')}),now).late===75,'loaded 75 min after plan -> Delay 75');
  const partial=full('2026-11-25','08:00');delete partial.sealNo;
  ok(!w.bkComplete(P('E','09:00',{booking:partial})),'missing Seal No. -> not Delivered Complete');
  const sl=P('F','09:00',{slides:[{fromDate:'2026-11-25',fromTime:'09:00',toDate:'2026-11-27',toTime:'08:00'}]});
  ok(w.delivInfo(sl,now).key==='slided'&&w.delivInfo(sl,now).label.includes('เดิม 2026-11-25 09:00'),'Slide shows original booking date');
  const slDone=P('G','09:00',{slides:sl.slides,booking:full('2026-11-27','07:00')});
  ok(w.delivInfo(slDone,now).delay===true,'delivered after Slide still Delay vs ORIGINAL plan (KPI)');
  ok(w.delivInfo(P('H','09:00',{cancel:{reason:'x'}}),now).key==='cancelled','Cancel status keeps original date');
  // board: slide/cancel stay counted on original day
  const day=w.localDay(),mk=(id,t,e)=>P(id,t,Object.assign({requestDate:day},e||{}));
  w.plans=[mk('P1','00:00',{booking:full(day,'00:00')}),mk('P2','23:59'),mk('P3','23:58',{cancel:{reason:'r'}}),mk('P4','23:57',{slides:[{fromDate:day,fromTime:'23:57',toDate:w.shiftDay(day,2),toTime:'08:00'}]})];
  w.renderDeliveryBoard();
  const k=[...d.querySelectorAll('#deliveryBoard .kpi b')].map(x=>x.textContent);
  ok(k[0]==='3'&&k[1]==='1'&&k[2]==='1','board day: 3 trips (slid trip moved out), 1 delivered complete, 1 outstanding ('+k.join(',')+')');
  ok(k[4]==='0 / 1'&&k[5]==='1','board: Slide in/out = 0 / 1, Cancel = 1 ('+k[4]+','+k[5]+')');
  ok(d.querySelector('#deliveryBoard .tripbar')&&/Count\/Trip/.test(d.getElementById('deliveryBoard').textContent),'Count/Trip breakdown shown with Delivered, Slide, Cancel');
  w.setBoardDay(w.shiftDay(day,2));
  const k2=[...d.querySelectorAll('#deliveryBoard .kpi b')].map(x=>x.textContent);
  ok(k2[0]==='1'&&k2[4]==='1 / 0'&&d.querySelector('#deliveryBoard').textContent.includes(day),'slid trip is counted on the NEW date, original date still shown ('+k2.join(',')+')');
  w.setBoardDay(day);
  // slid 3 times: counted only on the last date
  const multi=mk('M1','08:00',{slides:[{fromDate:day,fromTime:'08:00',toDate:w.shiftDay(day,1),toTime:'08:00'},{fromDate:w.shiftDay(day,1),fromTime:'08:00',toDate:w.shiftDay(day,2),toTime:'08:00'},{fromDate:w.shiftDay(day,2),fromTime:'08:00',toDate:w.shiftDay(day,5),toTime:'10:00'}]});
  w.plans.push(multi);
  ok(w.boardRows(w.shiftDay(day,5),new Date()).length===1&&w.boardRows(w.shiftDay(day,2),new Date()).filter(r=>r.p.planId==='M1').length===0,'3x Slide: trip counted only on the latest date');
  w.plans.pop();
  // outstanding trips without a status judgement
  w.plans.push(mk('J1','00:00',{requestDate:w.shiftDay(day,-3)}));w.renderDeliveryBoard();
  ok(d.getElementById('deliveryBoard').textContent.includes('ยังไม่มีการ Judge Status')&&d.getElementById('deliveryBoard').textContent.includes('J1'),'overdue outstanding plan listed as not yet judged');
  const tbls=d.querySelectorAll('#deliveryBoard table');
  ok(tbls.length===1,'Delivery Board shows a single table');
  const bodyRows=[...d.querySelectorAll('#deliveryBoard tbody tr')];
  const iJ=bodyRows.findIndex(r=>r.classList.contains('jrow')),iDay=bodyRows.findIndex(r=>r.classList.contains('grp')&&/Trip ประจำวันที่/.test(r.textContent));
  ok(iJ>=0&&iJ<iDay&&bodyRows[0].classList.contains('warn'),'un-judged outstanding plans are highlighted and listed first, then the day trips');
  ok(!d.getElementById('mParts')&&!d.getElementById('mPlans')&&!d.getElementById('mPallets')&&!d.getElementById('mGross')&&!/Part Master/.test(d.getElementById('dashboard').textContent),'Loading Overview summary cards (Part Master, Plans, Pallet, Gross) removed');
  w.plans.pop();
  // booking flow
  let saved=null;w.savePlanRecord=async p=>{saved=JSON.parse(JSON.stringify(p));return true};
  w.plans[1].booking={driver:'สมชาย',subTruck:'SUB-01',truckPlate:'1กข-1234',loadingBy:'Somchai',updatedAt:'2026-01-01'};
  w.openBooking('P2');
  ok(d.getElementById('dl_driver').innerHTML.includes('สมชาย')&&d.getElementById('bkHistory').textContent.includes('SUB-01'),'booking shows history of previous entries');
  ok(!d.getElementById('bookModal').innerHTML.match(/Draft|Booking status/),'no Draft/Firm/Delivered status selector');
  await w.saveBooking();ok(d.getElementById('bkWarn').textContent.includes('Container No.'),'missing fields block Delivered Complete');
  const set=(k,v)=>d.getElementById('bk_'+k).value=v;
  set('containerNo','abcd 1234567');set('sealNo','S1');set('loadingBy','Somchai');set('invoiceNo','INV-1');set('loadDate',day);set('loadTime','08:00');set('driver','D');set('subTruck','SUB-01');
  await w.saveBooking();
  ok(saved&&saved.booking.containerNo==='ABCD1234567'&&w.bkComplete(saved),'saved -> Delivered Complete');
  w.openBooking('P4');set('slideDate',w.shiftDay(day,3));set('slideTime','09:00');set('slideReason','รถไม่มา');await w.slideBooking();
  ok(saved.slides.length===2&&saved.slides[1].fromDate===w.shiftDay(day,2)&&saved.requestDate===day,'second Slide logged, original request date unchanged');
  w.openBooking('P2');w.document.getElementById('bkReopen');
  w.plans.push(mk('P5','12:00'));w.openBooking('P5');await w.cancelBooking();
  ok(saved.cancel&&saved.requestDate===day,'Cancel recorded, original date kept');
  ok(!d.body.innerHTML.includes('copyFirmBookings')&&!d.body.textContent.includes('Copy Firm Bookings'),'Copy Firm Bookings removed');
  // paste import
  w.parts=[part('A'),part('B',{qtyCarton:6,cartonD:55,cartonW:36}),part('C',{cartonH:30})];w.fillSelects();w.models=[];w.allocations=[];
  const r=w.importModels('Model\tQty\na\t1,200\nB\t300\nZZZ\t10\nB\t100');
  ok(r.added===2&&r.missing.length===1&&r.missing[0]==='ZZZ','paste imports Model/Qty, reports unknown model');
  ok(w.models.find(m=>m.model==='A').planQty===1200&&w.models.find(m=>m.model==='B').planQty===400,'paste: commas stripped, duplicate lines summed, case-insensitive');
  w.importModels('A 500');ok(w.models.find(m=>m.model==='A').planQty===500,'re-paste updates existing Qty (space separated)');
  // Mix dimension toggle only affects Mix Pallet Dimension Calculation
  w.models=[{model:'A',planQty:50,actualQty:null,packingModel:'A'},{model:'B',planQty:30,actualQty:null,packingModel:'B'}];w.generateAllocations();
  w.allocations.forEach(a=>{a.mixGroup='Mix Pallet 1';a.skidNo='Mix Pallet 1'});w.recalcDerived();w.renderCalc();
  ok(d.querySelectorAll('#mixCalcPanel svg.topview').length>=1,'mix calc shown by default');
  w.toggleDims();ok(d.querySelectorAll('#mixCalcPanel svg.topview').length===0&&d.getElementById('dimToggle').textContent.includes('Show'),'Hide Pallet Dimensions hides Mix Pallet Dimension Calculation');
  ok(d.querySelectorAll('#allocations tr').length>0&&!d.getElementById('allocationWrap').className.includes('hidden'),'allocation table unaffected');
  w.toggleDims();ok(d.querySelectorAll('#mixCalcPanel svg.topview').length>=1,'Show restores it');
  ok(!w.eval("typeof localStorage!=='undefined'&&localStorage.getItem('clcDimsHidden')"),'no browser-remembered dimension state');
  // simulate layout
  w.models=[{model:'A',planQty:600,actualQty:null,packingModel:'A'},{model:'B',planQty:100,actualQty:null,packingModel:'B'}];w.generateAllocations();w.renderCalc();
  const sim=d.getElementById('simLayout');
  ok(sim.querySelectorAll('svg.simsvg').length===2,'Top View + Side View rendered');
  ok(/SKID 1/.test(sim.textContent)&&/Top View/.test(sim.textContent)&&/Side View/.test(sim.textContent),'SKID numbers + view titles shown');
  ok(sim.innerHTML.includes('ว่าง'),'empty space shown');
  const fills=new Set([...sim.querySelectorAll('svg.simsvg rect[fill^="#"]')].map(x=>x.getAttribute('fill')));
  ok(fills.has(w.simColor('A'))&&fills.has(w.simColor('B'))&&w.simColor('A')!==w.simColor('B'),'pallets coloured per model');
  w.models=[{model:'A',planQty:200*45,actualQty:null,packingModel:'A'}];w.generateAllocations();w.renderCalc();
  ok(d.getElementById('simLayout').textContent.includes('เกินความจุพื้นตู้'),'over 20 floor positions flagged in simulation');
  // Mix calculation: flat stacking order, pallets <= 130 (125+5), Save blocked above floor capacity
  w.parts=[part('A',{cartonH:25,cartonD:50,cartonW:40,qtyCarton:4,qtyPallet:100}),part('B',{cartonH:30,cartonD:55,cartonW:36,qtyCarton:6,qtyPallet:100})];
  w.models=[{model:'A',planQty:4*30,actualQty:null,packingModel:'A'},{model:'B',planQty:6*20,actualQty:null,packingModel:'B'}];w.generateAllocations();
  w.allocations.forEach(a=>{a.mixGroup='Mix Pallet 1';a.skidNo='Mix Pallet 1'});w.recalcDerived();w.renderCalc();
  const gs=w.calculateMixPalletLayouts();
  ok(gs.length>=1&&gs.every(g=>g.totalHeight<=130),'every Mix pallet height <= 130 cm (125 ± 5) after auto split ('+gs.map(g=>g.totalHeight).join(',')+')');
  ok(gs.every(g=>{const s=g.stack;const firstPartial=s.findIndex(x=>x.partial);return firstPartial<0||s.slice(firstPartial).every(x=>x.partial)}),'incomplete layers are always on top (flat surface below)');
  ok(gs.every(g=>g.stack.every((x,i)=>x.level===i+1&&(i===0||x.cum>g.stack[i-1].cum))),'levels numbered bottom to top with cumulative height');
  const hs=gs.map(g=>g.totalHeight);ok(hs.length<2||Math.max(...hs)-Math.min(...hs)<=Math.max(...gs.map(g=>g.stack[0].h)),'split pallets have balanced heights ('+hs.join(',')+')');
  w.models=[{model:'A',planQty:200*21,actualQty:null,packingModel:'A'}];w.parts=[part('A')];w.generateAllocations();w.renderCalc();
  d.getElementById('stackPallet').checked=false;w.renderSummary();
  ok(w.physicalPalletCount()>20&&d.getElementById('savePlanBtn').disabled===true,'floor positions > 20 disables Save button');
  let alerted='';w.alert=m=>alerted=m;w.savePlan();ok(/ไม่สามารถบันทึกได้/.test(alerted),'savePlan() is blocked with a message when over floor capacity');
  d.getElementById('stackPallet').checked=true;w.renderSummary();
  ok(d.getElementById('savePlanBtn').disabled===false&&w.floorOver().pairs===1,'21 pallets with a stacked pair = 20 floor positions -> Save allowed');
  w.models=[{model:'A',planQty:200*45,actualQty:null,packingModel:'A'}];w.generateAllocations();w.renderCalc();
  alerted='';w.savePlan();ok(d.getElementById('savePlanBtn').disabled===true&&/ไม่สามารถบันทึกได้/.test(alerted),'45 pallets: still blocked after stacking');
  // stability: a pallet with an incomplete top layer is never the bottom of a stack
  w.parts=[part('A'),part('X',{qtyCarton:10,cartonD:40,cartonW:30,qtyPallet:200})];
  w.models=[{model:'A',planQty:200*20,actualQty:null,packingModel:'A'},{model:'X',planQty:70,actualQty:null,packingModel:'X'}];w.generateAllocations();
  w.allocations.forEach(a=>{if(a.shipmentModel==='X'){a.mixGroup='N';a.skidNo=1}});w.recalcDerived();w.renderCalc();
  const sp=w.planStacking();
  ok(sp.pairs.every(p=>p.bottom.flat),'stack bottoms always have a flat top surface');
  w.models=[{model:'A',planQty:200*20,actualQty:null,packingModel:'A'}];w.generateAllocations();w.renderCalc();
  ok(w.physicalPalletCount()===20&&d.getElementById('savePlanBtn').disabled===false,'exactly 20 pallets: Save allowed');
  w.alert=()=>{};
  // dashboard
  w.plans=[mk('Q1','08:00',{shipBy:'Air',booking:full(day,'07:00')}),mk('Q2','08:00',{shipBy:'Sea',slides:[{fromDate:day,fromTime:'08:00',toDate:w.shiftDay(day,1),toTime:'08:00'}]}),mk('Q3','08:00',{shipBy:'Sea',cancel:{reason:'x'}})];
  w.eval("DASH.metric='delivered'");w.renderDashboard();
  ok(d.getElementById('dashChartTitle').textContent.startsWith('Delivered Complete'),'Metric: Delivered Complete');
  ok(/Shipments/.test(d.getElementById('dashKpis').textContent)&&/Delivered Complete/.test(d.getElementById('dashKpis').textContent),'Dashboard KPIs include Shipments & Delivered Complete');
  w.eval("DASH.metric='slide'");w.renderDashboard();ok(d.getElementById('dashChartTitle').textContent.startsWith('Slide'),'Metric: Slide');
  w.eval("DASH.metric='cancel'");w.renderDashboard();ok(d.getElementById('dashChartTitle').textContent.startsWith('Cancel'),'Metric: Cancel');
  ok(/Slide \(Trip\)/.test(d.getElementById('dashKpis').textContent)&&/Cancel \(Trip\)/.test(d.getElementById('dashKpis').textContent),'Dashboard KPIs include Slide & Cancel');
  const st=d.getElementById('dashShipType').textContent;
  ok(/Air \/ Sea/.test(st),'Shipment by month · Air / Sea card');
  const tot=[...d.querySelectorAll('#dashShipType tbody tr:last-child td')].map(x=>x.textContent);
  ok(tot[1]==='3'&&tot[2]==='1'&&tot[3]==='2'&&tot[5]==='1'&&tot[6]==='1'&&tot[7]==='1','totals: 3 shipments, 1 Air, 2 Sea, 1 Delivered, 1 Slide, 1 Cancel ('+tot.join(',')+')');
  // Management page
  ok(!!d.querySelector('[data-page="mgmt"]')&&!!d.querySelector('#mgmt #dashControls')&&!!d.querySelector('#mgmt #dashChart')&&!!d.querySelector('#mgmt #dashShipType')&&!!d.querySelector('#mgmt #recentPlans'),'Plan Overview moved to its own Management page');
  ok(!d.querySelector('#dashboard #dashControls')&&!!d.querySelector('#dashboard #deliveryBoard'),'Dashboard keeps only the Delivery Board (no Plan Overview)');
  w.showPage('mgmt');ok(d.getElementById('mgmt').classList.contains('active')&&!d.getElementById('dashboard').classList.contains('active'),'Management nav opens the page');
  ok(/On plan %/.test(d.getElementById('mgmtPerf').textContent)&&/Delivery Performance/.test(d.getElementById('mgmtPerf').textContent),'Management shows Delivery Performance On plan');
  const tr=[...d.querySelectorAll('#mgmtPerf tbody tr:last-child td')].map(x=>x.textContent);
  ok(tr[1]==='3'&&tr[2]==='1'&&tr[3]==='1'&&tr[5]==='1'&&tr[6]==='1','performance totals: 3 trips, 1 delivered, 1 on time, 1 slide, 1 cancel ('+tr.join(',')+')');
  ok(errs.length===0,'no runtime errors '+errs.join('|'));
  console.log(fail?'FAILED '+fail:'ALL PASSED');process.exit(fail?1:0);
},500);
