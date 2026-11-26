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
  ok(k2[0]==='1'&&k2[4]==='1 / 0'&&d.querySelector('#deliveryBoard').textContent.includes('เดิม '+w.dayLabel(day)),'slid trip is counted on the NEW date, original date still shown ('+k2.join(',')+')');
  w.setBoardDay(day);
  // slid 3 times: counted only on the last date
  const multi=mk('M1','08:00',{slides:[{fromDate:day,fromTime:'08:00',toDate:w.shiftDay(day,1),toTime:'08:00'},{fromDate:w.shiftDay(day,1),fromTime:'08:00',toDate:w.shiftDay(day,2),toTime:'08:00'},{fromDate:w.shiftDay(day,2),fromTime:'08:00',toDate:w.shiftDay(day,5),toTime:'10:00'}]});
  w.plans.push(multi);
  ok(w.boardRows(w.shiftDay(day,5),new Date()).length===1&&w.boardRows(w.shiftDay(day,2),new Date()).filter(r=>r.p.planId==='M1').length===0,'3x Slide: trip counted only on the latest date');
  w.plans.pop();
  // outstanding trips without a status judgement
  w.plans.push(mk('J1','00:00',{requestDate:w.shiftDay(day,-3)}));w.renderDeliveryBoard();
  ok(d.getElementById('deliveryBoard').textContent.includes('ยังไม่มีการ Judge Status')&&d.getElementById('deliveryBoard').textContent.includes('J1'),'overdue outstanding plan listed as not yet judged');
  const tbls=d.querySelectorAll('#deliveryBoard table:not(.mmatrix)');
  ok(tbls.length===1,'Delivery Board shows a single trip table (plus the Count/Trip matrix)');
  const bodyRows=[...d.querySelectorAll('#deliveryBoard tbody tr')];
  const iJ=bodyRows.findIndex(r=>r.classList.contains('jrow')),iDay=bodyRows.findIndex(r=>r.classList.contains('grp')&&/Trip ประจำวันที่/.test(r.textContent));
  ok(iJ>=0&&iJ<iDay&&bodyRows[0].classList.contains('warn'),'un-judged outstanding plans are highlighted and listed first, then the day trips');
  ok(!d.getElementById('mParts')&&!d.getElementById('mPlans')&&!d.getElementById('mPallets')&&!d.getElementById('mGross')&&!/Part Master/.test(d.getElementById('dashboard').textContent),'Loading Overview summary cards (Part Master, Plans, Pallet, Gross) removed');
  w.plans.pop();
  // Count/Trip per day: Plan + Actual Delivered + Outstanding + Slide + Cancel for every day of the month
  {const mx=d.querySelector('#tripMatrix table.mmatrix');
   const rows=[...mx.querySelectorAll('tbody tr')].map(r=>[...r.children].map(c=>c.textContent.trim()));
   ok(rows.map(r=>r[0]).join('|')==='Plan (Trip ทั้งหมด)|Actual Delivered|Outstanding|Slide|Cancel','matrix rows: Plan, Actual Delivered, Outstanding, Slide, Cancel');
   const dayNo=Number(day.slice(8)),col=dayNo; // first cell is the label
   ok(rows[0][col]==='3'&&rows[1][col]==='1'&&rows[2][col]==='1'&&rows[3][col]==='·'&&rows[4][col]==='1','matrix today: Plan 3 = Delivered 1 + Outstanding 1 + Cancel 1 ('+rows.map(r=>r[col]).join(',')+')');
   const tot=rows.map(r=>r[r.length-1]);
   ok(Number(tot[0])===Number(tot[1].split(' ')[0])+Number(tot[2])+Number(tot[3])+Number(tot[4]),'month total: Plan = Actual Delivered + Outstanding + Slide + Cancel ('+tot.join(' / ')+')');
   ok(/Actual Delivered/.test(d.getElementById('deliveryBoard').textContent)&&mx.querySelectorAll('thead th').length===rows[0].length,'header has one column per day plus the label and the month total');}
  // New Shipment saved on another day -> the Delivery Board shows it
  {const far=w.shiftDay(day,6);const np=mk('NEW1','10:00',{requestDate:far});w.plans.push(np);w.setBoardDay(day);
   ok(d.getElementById('upcomingPlans').textContent.includes('1 trip')&&[...d.querySelectorAll('#upcomingPlans button')].some(b=>b.title===far),'upcoming-plans chips list the new plan\'s day even when the board shows today');
   w.clcAfterPlanSaved(np);
   ok(w.eval('BOARD.day')===far&&d.querySelector('#deliveryBoard tr.newrow')&&/NEW1/.test(d.querySelector('#deliveryBoard tr.newrow').textContent),'after saving, the board jumps to the plan day and marks the row as new');
   ok(d.getElementById('clcToast').classList.contains('show')&&d.getElementById('clcToast').textContent.includes(far)&&d.getElementById('clcToastBtn'),'toast says where the plan is, with a button to the board');
   w.setBoardDay(day);ok(!d.querySelector('#deliveryBoard tr.newrow'),'highlight is cleared when the user changes day');
   const nodate=mk('NODATE','10:00',{requestDate:''});w.clcAfterPlanSaved(nodate);ok(/ไม่มี FG Ship Container Date \(ETD PTM\)/.test(d.getElementById('clcToast').textContent),'plan without request date: user is told why it is not on the board');
   w.plans=w.plans.filter(x=>x.planId!=='NEW1');w.renderDeliveryBoard();}
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
  ok(d.querySelectorAll('#mixCalcPanel svg.pal3d').length>=1,'mix calc shown by default');
  w.toggleDims();ok(d.querySelectorAll('#mixCalcPanel svg.pal3d').length===0&&d.getElementById('dimToggle').textContent.includes('Show'),'Hide Pallet Dimensions hides Mix Pallet Dimension Calculation');
  ok(d.querySelectorAll('#allocations tr').length>0&&!d.getElementById('allocationWrap').className.includes('hidden'),'allocation table unaffected');
  w.toggleDims();ok(d.querySelectorAll('#mixCalcPanel svg.pal3d').length>=1,'Show restores it');
  ok(!w.eval("typeof localStorage!=='undefined'&&localStorage.getItem('clcDimsHidden')"),'no browser-remembered dimension state');
  // simulate layout
  w.models=[{model:'A',planQty:600,actualQty:null,packingModel:'A'},{model:'B',planQty:100,actualQty:null,packingModel:'B'}];w.generateAllocations();w.renderCalc();
  const sim=d.getElementById('simLayout');
  ok(sim.querySelectorAll('svg.sim3d').length===1&&sim.querySelectorAll('svg.simsvg').length===0,'one 3D View (no separate Top View / Side View)');
  ok(sim.querySelectorAll('g.s3lab').length>=3&&/3D View/.test(sim.textContent)&&!/Top View|Side View/.test(sim.textContent),'Pallet No. labels + 3D View title shown');
  ok(sim.innerHTML.includes('ว่าง'),'empty space shown');
  const fills=new Set([...sim.querySelectorAll('.topview-legend i')].map(x=>x.style.background).map(c=>c.startsWith('rgb')?c:c));const colorOf=m=>{const e=d.createElement('i');e.style.background=w.simColor(m);return e.style.background};
  ok(fills.has(colorOf('A'))&&fills.has(colorOf('B'))&&w.simColor('A')!==w.simColor('B'),'legend shows one colour per model');
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
  // Print: redesigned Shipment Slip + ใบส่งงาน (Delivery Note, 1 page) with the embedded Pioneer logo
  w.parts.push(part('PRT-1'),part('PRT-2'));
  const dAl=[{shipmentModel:'PRT-1',stack:'N',qtyPallet:100,skidNo:'SKID-1',palletD:110,palletW:110,palletH:105,grossLine:420,remark:''},{shipmentModel:'PRT-2',stack:'Y',qtyPallet:50,skidNo:'SKID-2',palletD:110,palletW:110,palletH:90,grossLine:380,remark:'Top'}];
  const dp=Object.assign(P('DN-1','09:00',{requestDate:day,orderType:'OEM',shipmentType:'40HC',remark:'Handle with care',models:[{model:'PRT-1',planQty:100,actualQty:null},{model:'PRT-2',planQty:50,actualQty:40}],allocations:dAl,summary:{models:2,qty:150,pallets:2,net:300,gross:900,cbm:4.2,containerType:'40HC',floorCap:20,floorUsed:2,stackPairs:0}}),{booking:{containerNo:'MSKU7654321',sealNo:'SEAL99',loadingBy:'Somchai',loadDate:day,loadTime:'10:30',invoiceNo:'INV-77',driver:'Somying',subTruck:'SUB-9',truckPlate:'1กข-1234'}});
  w.plans=[dp];
  const LOGO=w.eval('PIONEER_LOGO');
  const slipH=w.slipHtml(dp);
  ok(/SHIPMENT DETAIL SLIP/.test(slipH)&&/DN-1/.test(slipH)&&/PRT-1/.test(slipH)&&/Pallet Allocation Detail/.test(slipH)&&/Approved by/.test(slipH),'Shipment Slip renders the new template (title, plan, models, pallet table, sign-off)');
  ok(/^data:image\/svg\+xml;base64,/.test(LOGO)&&/fill="#A90533"/.test(Buffer.from(LOGO.split(',')[1],'base64').toString()),'embedded Pioneer logo is the attached SVG (brand colour #A90533)');
  ok(slipH.includes('class="logo"><img src="'+LOGO+'"'),'Shipment Slip: Pioneer logo top-left');
  const dn=w.deliveryNoteHtml(dp);
  ok((dn.match(/<main class="sheet/g)||[]).length===1&&(dn.match(/class="sheet fix pg-dn"/g)||[]).length===1,'Delivered print = ใบส่งงาน only, exactly one fixed A4 page');
  ok(!/DELIVERED COMPLETE SLIP/.test(dn)&&!/Model Summary/.test(dn)&&!/Slide history/.test(dn),'no Delivered Complete summary slip in the print');
  ok(/DELIVERY NOTE/.test(dn)&&/ใบส่งงาน/.test(dn)&&/MSKU7654321/.test(dn)&&/SEAL99/.test(dn)&&/INV-77/.test(dn)&&/Somying/.test(dn)&&/1กข-1234/.test(dn)&&/SUB-9/.test(dn)&&/PRT-1/.test(dn)&&/ผู้รับสินค้า/.test(dn),'ใบส่งงาน shows container, seal, invoice, driver, truck, items and receiver sign-off');
  ok(dn.includes('class="logo"><img src="'+LOGO+'"'),'ใบส่งงาน: Pioneer logo top-left');
  ok(/PRT-2<\/b><\/td><td>PRT-2<\/td><td class="r">40</.test(dn),'item qty uses the actual Shipment Qty');
  const big=Object.assign({},dp,{models:Array.from({length:40},(_,i)=>({model:'M-'+i,planQty:10,actualQty:null})),allocations:[]});
  const bigH=w.deliveryNoteHtml(big);
  ok((bigH.match(/class="sheet fix pg-dn"/g)||[]).length===1&&/class="two"/.test(bigH),'40 models: compact two-column list, still 1 page');
  // logo upload (stored in this browser) overrides the embedded logo; Remove restores it
  w.localStorage.setItem('clcPrintLogo','data:image/png;base64,AAAA');
  ok(w.printLogoSrc()==='data:image/png;base64,AAAA'&&w.deliveryNoteHtml(dp).includes('data:image/png;base64,AAAA'),'uploaded logo overrides the embedded one');
  w.clearLogo();ok(w.printLogoSrc()===LOGO,'Remove logo restores the embedded Pioneer logo');
  // UI: print button only for Delivered Complete
  w.plans=[dp,P('DN-3','09:00')];w.renderBooking();
  const rowOf=id=>[...d.querySelectorAll('#bookTable tbody tr')].find(r=>r.textContent.includes(id));
  ok(/ใบส่งงาน/.test(rowOf('DN-1').textContent)&&!/ใบส่งงาน/.test(rowOf('DN-3').textContent),'Delivery Booking: Print ใบส่งงาน only on Delivered Complete rows');
  w.openBooking('DN-1');ok(d.getElementById('bkPrint').style.display==='','Booking modal shows Print ใบส่งงาน when Delivered Complete');
  w.openBooking('DN-3');ok(d.getElementById('bkPrint').style.display==='none','Booking modal hides Print when not Delivered Complete');
  let opened=null;alerted='';w.alert=m=>{alerted=m};w.open=()=>({document:{open(){},write(h){opened=h},close(){}}});
  w.printDeliveryNote('DN-3');ok(!opened&&/Delivered Complete/.test(alerted),'printDeliveryNote blocked for a plan that is not Delivered Complete');
  w.printDeliveryNote('DN-1');ok(opened&&/DELIVERY NOTE/.test(opened)&&!/DELIVERED COMPLETE SLIP/.test(opened),'printDeliveryNote opens ใบส่งงาน only');
  ok(!!d.getElementById('logoCard')&&!!d.getElementById('logoFile')&&/Pioneer logo/.test(d.getElementById('logoCard').innerHTML),'Management page shows the Pioneer logo setting');
  w.alert=()=>{};
  // Container photos (R2): per-trip flag, 5 slots, bulk pick from the camera, role-aware, badge + filter
  const calls=[];let store={};let cfg=true,probs=[],chkRes={ok:true,message:'✅ ฟังก์ชันต่อ R2 ได้'};
  w.clcPhotos={async index(){return Object.keys(store).flatMap(pid=>Object.keys(store[pid]).map(s=>({plan_id:pid,slot:Number(s)})))},
    async call(action,body){calls.push(action+(body&&body.slot?':'+body.slot:''));
      if(action==='status')return {configured:cfg,role:'warehouse',canWrite:true,problems:probs};
      if(action==='check')return chkRes;
      if(action==='sign-view')return {photos:Object.keys(store[body.planId]||{}).map(s=>({slot:Number(s),url:'https://r2.test/'+body.planId+'/'+s+'?sig',bytes:1}))};
      if(action==='sign-upload')return {key:'plans/'+body.planId+'/slot'+body.slot+'-k.jpg',url:'https://r2.test/put/'+body.slot,headers:{'Content-Type':'image/jpeg'}};
      if(action==='commit'){(store[body.planId]=store[body.planId]||{})[body.slot]=1;return {photo:{}}}
      if(action==='delete'){delete store[body.planId][body.slot];return {deleted:true}}
      return {}}};
  const puts=[];w.fetch=async(u,o)=>{puts.push(u+'|'+o.method+'|'+(o.headers&&o.headers['Content-Type']));return {ok:true,status:200}};
  w.photoCompress=async f=>new w.Blob(['x'],{type:'image/jpeg'});
  const pp=P('PH-1','09:00',{booking:full(day,'08:00')});w.plans=[pp,P('PH-2','10:00',{photoReq:true}),P('PH-3','11:00',{photoReq:true})];
  store={'PH-2':{1:1,2:1,3:1,4:1,5:1},'PH-3':{1:1}};const PHs=w.eval('PH');PHs.loaded=false;PHs.tried=false;
  await w.phLoadIndex(true);
  const brow=id=>[...d.querySelectorAll('#bookTable tbody tr')].find(r=>r.textContent.includes(id));
  ok(!/📷/.test(brow('PH-1').textContent)&&/📷 5\/5/.test(brow('PH-2').textContent)&&/📷 1\/5/.test(brow('PH-3').textContent),'booking table: 📷 n/5 badge only on trips that require photos');
  ok(brow('PH-2').querySelector('.chip.ok:last-of-type')&&/📷 1\/5/.test(brow('PH-3').textContent)&&!!brow('PH-3').querySelector('.chip.bad'),'badge is green when complete, red when photos are missing');
  d.getElementById('bkStatus').value='photo';w.renderBooking();
  ok([...d.querySelectorAll('#bookTable tbody tr')].length===1&&brow('PH-3'),'filter "📷 รูปยังไม่ครบ" lists only incomplete trips that require photos');
  d.getElementById('bkStatus').value='';w.renderBooking();
  // open a trip that does not need photos, then tick the flag
  await w.openBooking('PH-1');
  ok(d.getElementById('bkPhotos').style.display==='none'&&d.getElementById('bk_photoReq').checked===false,'photo section hidden until the customer requires photos');
  d.getElementById('bk_photoReq').checked=true;await w.bkTogglePhotoReq();
  ok(pp.photoReq===true&&d.getElementById('bkPhotos').style.display==='','ticking the flag saves it on the trip and shows the 5 slots');
  ok(d.querySelectorAll('#bkPhotoGrid .pslot').length===5&&/ก่อนโหลด/.test(d.getElementById('bkPhotoGrid').textContent)&&/Close Cargo door/.test(d.getElementById('bkPhotoGrid').textContent)&&/Seal/.test(d.getElementById('bkPhotoGrid').textContent),'5 slots: Cargo Empty, 50%, Loading complete, Close door, Seal / Lock');
  // bulk: files named like a Canon, one slot already filled -> goes into empty slots 1,3,4,5 in file-name order
  store['PH-1']={2:1};await w.bkPhotosLoad('PH-1');calls.length=0;puts.length=0;
  const F=n=>new w.File(['img'],n,{type:'image/jpeg'});
  await w.bkPhotoBulkChosen({files:[F('IMG_0010.JPG'),F('IMG_0002.JPG'),F('IMG_0003.JPG'),F('IMG_0004.JPG')]});
  ok(calls.filter(c=>c.startsWith('sign-upload')).join()==='sign-upload:1,sign-upload:3,sign-upload:4,sign-upload:5'&&calls.filter(c=>c.startsWith('commit')).length===4,'bulk pick: sorted by file name and placed into the empty slots in order');
  ok(puts.length===4&&puts.every(x=>/^https:\/\/r2\.test\/put\/\d\|PUT\|image\/jpeg$/.test(x)),'files are PUT straight to the presigned R2 URL as image/jpeg');
  ok(d.querySelectorAll('#bkPhotoGrid .pslot.has').length===5&&phc('PH-1')===5,'all 5 slots filled after upload ('+phc('PH-1')+')');
  function phc(id){return w.phCount(id)}
  ok(/📷 5\/5/.test(brow('PH-1').textContent),'badge updates to 5/5 after uploading');
  // errors: RAW / non-image rejected with a clear message
  store['PH-1']={};await w.bkPhotosLoad('PH-1');
  await w.phRunJobs('PH-1',[{f:new w.File(['x'],'IMG_1.CR3',{type:''}),slot:1}]);
  ok(/RAW/.test(d.getElementById('bkPhotoMsg').textContent)&&!store['PH-1'][1],'RAW files (CR2/CR3) are rejected with a hint to shoot JPEG');
  // delete
  store['PH-1']={4:1};await w.bkPhotosLoad('PH-1');await w.bkPhotoDel(4);
  ok(!store['PH-1'][4]&&calls.includes('delete:4'),'delete removes the photo through the function');
  // R2 not configured
  cfg=false;await w.bkPhotosLoad('PH-1');
  ok(/ยังไม่ได้ตั้งค่า Cloudflare R2/.test(d.getElementById('bkPhotoMsg').textContent)&&d.querySelectorAll('#bkPhotoGrid button').length===0,'R2 not configured: clear message and no upload buttons');
  cfg=true;
  // R2 secrets self-check: names the wrong secret, "🔧 ตรวจ R2" button, diagnosis when the browser cannot reach R2
  const msgT=()=>d.getElementById('bkPhotoMsg').textContent;
  cfg=false;probs=[{name:'R2_ACCOUNT_ID',message:'ต้องเป็นรหัส 32 ตัว แต่ค่าที่ตั้งไว้ยาว 40 ตัว'}];await w.bkPhotosLoad('PH-1');
  ok(/R2_ACCOUNT_ID: ต้องเป็นรหัส 32 ตัว/.test(msgT())&&!/ยังไม่ได้ตั้งค่า Cloudflare R2/.test(msgT()),'wrong secret: the message names it (R2_ACCOUNT_ID) and what is wrong');
  ok(d.getElementById('bkPhotoCheckBtn').style.display==='','🔧 ตรวจ R2 button is shown to writers even when R2 is mis-configured');
  chkRes={ok:false,code:'config',message:'ตั้งค่า secrets ของ R2 ไม่ครบหรือรูปแบบไม่ถูกต้อง',problems:probs};await w.bkPhotoCheck();
  ok(/⚠/.test(msgT())&&/R2_ACCOUNT_ID/.test(msgT()),'ตรวจ R2 shows the problem');
  cfg=true;probs=[];chkRes={ok:true,message:'✅ ฟังก์ชันต่อ R2 ได้ — Account ID, bucket และ Access Key ถูกต้อง'};await w.bkPhotosLoad('PH-1');await w.bkPhotoCheck();
  ok(/✅/.test(msgT())&&/CORS/.test(msgT()),'ตรวจ R2 OK: still reminds to check the bucket CORS');
  d.body.dataset.role='viewer';await w.bkPhotosLoad('PH-1');
  ok(d.getElementById('bkPhotoCheckBtn').style.display==='none','viewer role: no ตรวจ R2 button');delete d.body.dataset.role;
  // upload where the browser cannot reach R2 (DNS / CORS): ONE server check, one explanation for all failed files
  const realFetch=w.fetch;w.fetch=async()=>{throw new TypeError('Failed to fetch')};
  store['PH-1']={};await w.bkPhotosLoad('PH-1');w.eval('phDiag=null');calls.length=0;
  await w.phRunJobs('PH-1',[{f:F('IMG_1.JPG'),slot:1},{f:F('IMG_2.JPG'),slot:2}]);
  ok(calls.filter(c=>c==='check').length===1&&/IMG_1\.JPG, IMG_2\.JPG/.test(msgT())&&/CORS/.test(msgT())&&(msgT().match(/ส่งรูปไป Cloudflare R2 ไม่ได้/g)||[]).length===1,'PUT network failure: one R2 check, one explanation (CORS) for all failed files');
  chkRes={ok:false,code:'network',message:'ต่อ Cloudflare R2 ไม่ได้ — ชื่อโฮสต์ผิด (ตรวจ R2_ACCOUNT_ID)'};w.eval('phDiag=null');
  await w.phRunJobs('PH-1',[{f:F('IMG_3.JPG'),slot:1}]);
  ok(/R2_ACCOUNT_ID/.test(msgT())&&!/CORS/.test(msgT()),'PUT network failure and the server cannot reach R2 either -> points at R2_ACCOUNT_ID');
  w.fetch=realFetch;chkRes={ok:true,message:'ok'};
  // viewer: sees photos but no upload/delete buttons
  d.body.dataset.role='viewer';store['PH-1']={1:1};await w.bkPhotosLoad('PH-1');
  ok(d.querySelectorAll('#bkPhotoGrid .pslot.has').length===1&&d.querySelectorAll('#bkPhotoGrid button').length===0&&d.getElementById('bkPhotoBulkBtn').style.display==='none','viewer role: can look at photos, no upload / delete buttons');
  delete d.body.dataset.role;
  // flag survives re-saving the plan from the calculator
  w.plans=[Object.assign({},pp,{planId:'KEEP-1',photoReq:true})];d.getElementById('planId').value='KEEP-1';
  ok(w.makePlan().photoReq===true,'photoReq is preserved when the plan is re-saved from WH Calculate');
  // Print ใบส่งงาน + optional "รูปถ่ายตู้" page (only when the customer requires photos)
  const pn=Object.assign({},dp,{planId:'PRN-1',photoReq:true}),pnNo=Object.assign({},dp,{planId:'PRN-2'});
  w.plans=[pn,pnNo];store={'PRN-1':{3:1,1:1,2:1}};
  const ph3=await w.phForPrint('PRN-1');
  ok(ph3.photos&&ph3.photos.map(x=>x.slot).join()==='1,2,3'&&ph3.photos.every(x=>/^https:\/\/r2\.test\//.test(x.url)),'phForPrint: fresh signed URLs, sorted by slot');
  const dn0=w.deliveryNoteHtml(pnNo,null);
  ok((dn0.match(/<main class="sheet/g)||[]).length===1&&!/optPhotos|CONTAINER PHOTOS/.test(dn0),'trip that does not need photos: no photo option, still exactly 1 page');
  const dn3=w.deliveryNoteHtml(pn,ph3);
  ok((dn3.match(/<main class="sheet/g)||[]).length===2&&/<main class="sheet fix pg-dn">/.test(dn3)&&/<main class="sheet fix pgph">/.test(dn3),'with photos: ใบส่งงาน page + 1 photo page (both fixed A4)');
  ok(dn3.indexOf('<main class="sheet fix pg-dn">')<dn3.indexOf('<main class="sheet fix pgph">')&&/CONTAINER PHOTOS/.test(dn3)&&/ภาพถ่ายตู้คอนเทนเนอร์/.test(dn3),'photo page comes after the ใบส่งงาน page, same Pioneer header');
  ok(['Cargo Empty','Loading on Cargo 50%','Loading complete','Close Cargo door','Lock cargo'].every(t=>dn3.includes(t))&&(dn3.match(/<div class="phc">/g)||[]).length===5,'photo page has the 5 customer captions (Cargo Empty … Lock cargo)');
  ok((dn3.match(/<img src="https:\/\/r2\.test\//g)||[]).length===3&&(dn3.match(/— ไม่มีรูป —/g)||[]).length===2,'3 photos placed in their slots, 2 empty slots marked "ไม่มีรูป"');
  ok(/class="phc phi"/.test(dn3)&&/MSKU7654321/.test(dn3.slice(dn3.indexOf('pgph')))&&/SEAL99/.test(dn3.slice(dn3.indexOf('pgph'))),'6th cell: loading record (Container No., Seal No.) next to the photos');
  ok(/id="optPhotos" checked/.test(dn3)&&/3\/5 · ยังไม่ครบ/.test(dn3)&&/classList\.toggle\('nophotos'/.test(dn3)&&/\.nophotos \.pgph\{display:none\}/.test(dn3),'print window option: ☑ แนบรูปถ่ายตู้ (3/5 · ยังไม่ครบ) hides / shows the photo page');
  ok(/function clcPrint\(\)/.test(dn3)&&/onclick="clcPrint\(\)"/.test(dn3),'Print button waits for the photos to finish loading');
  const dn5=w.deliveryNoteHtml(pn,{photos:[1,2,3,4,5].map(n=>({slot:n,url:'https://r2.test/x/'+n+'?a=1&b=2'}))});
  ok(!/ยังไม่ครบ/.test(dn5)&&/5\/5/.test(dn5)&&dn5.includes('src="https://r2.test/x/1?a=1&amp;b=2"'),'5/5: no warning; signed URL is HTML-escaped');
  ok(/กำลังโหลดรูปถ่ายตู้/.test(w.deliveryNoteHtml(pn,{loading:true}))&&(w.deliveryNoteHtml(pn,{loading:true}).match(/<main class="sheet/g)||[]).length===1,'while loading: message in the bar, only the ใบส่งงาน page');
  ok(/class="warn">⚠ รูปถ่ายตู้: R2 down/.test(w.deliveryNoteHtml(pn,{error:'R2 down'}))&&/ยังไม่มีรูปถ่ายตู้ในระบบ/.test(w.deliveryNoteHtml(pn,{photos:[]}))&&!/CONTAINER PHOTOS/.test(w.deliveryNoteHtml(pn,{photos:[]})),'error / no photos: warning in the bar, no empty photo page');
  const bigP=w.deliveryNoteHtml(Object.assign({},big,{photoReq:true,booking:dp.booking}),ph3);
  ok((bigP.match(/class="sheet fix pg-dn"/g)||[]).length===1&&(bigP.match(/class="sheet fix pgph"/g)||[]).length===1,'40 models + photos: still 1 ใบส่งงาน page + 1 photo page');
  // printDeliveryNote: window opens at once (pop-up blockers), photos are added when they arrive
  const writes=[];let closedWin=false;w.open=()=>({get closed(){return closedWin},document:{open(){},write(h){writes.push(h)},close(){}}});
  calls.length=0;const pr=w.printDeliveryNote('PRN-1');
  ok(writes.length===1&&/กำลังโหลดรูปถ่ายตู้/.test(writes[0])&&!/CONTAINER PHOTOS/.test(writes[0]),'photo trip: ใบส่งงาน window opens immediately with "กำลังโหลดรูป…"');
  await pr;
  ok(writes.length===2&&/CONTAINER PHOTOS/.test(writes[1])&&/id="optPhotos"/.test(writes[1])&&calls.includes('sign-view'),'then the window is rewritten with the photo page + option');
  ok(w.phCount('PRN-1')===3,'photo count badge updated from the print fetch');
  writes.length=0;calls.length=0;await w.printDeliveryNote('PRN-2');
  ok(writes.length===1&&!calls.includes('sign-view')&&!/optPhotos/.test(writes[0]),'trip without photo requirement: one write, no photo request');
  writes.length=0;closedWin=false;const pc=w.printDeliveryNote('PRN-1');closedWin=true;await pc;
  ok(writes.length===1,'window closed while photos load: nothing written to a closed window');
  closedWin=false;writes.length=0;const savedPhotos=w.clcPhotos;
  w.clcPhotos={async call(){throw new Error('R2 ยังไม่ตั้งค่า')}};await w.printDeliveryNote('PRN-1');
  ok(writes.length===2&&/ใบส่งงาน|DELIVERY NOTE/.test(writes[1])&&/รูปถ่ายตู้: R2 ยังไม่ตั้งค่า/.test(writes[1])&&!/CONTAINER PHOTOS/.test(writes[1]),'photo fetch fails: ใบส่งงาน still prints, bar explains why');
  w.clcPhotos=null;writes.length=0;await w.printDeliveryNote('PRN-1');
  ok(writes.length===2&&/ต้องล็อกอินและเชื่อม Supabase/.test(writes[1]),'not signed in: ใบส่งงาน still prints, bar says photos need sign-in');
  w.clcPhotos=savedPhotos;
  // buttons tell the user the photo option exists
  w.renderBooking();
  ok(/ใบส่งงาน \+ 📷/.test(brow('PRN-1').textContent)&&!/ใบส่งงาน \+ 📷/.test(brow('PRN-2').textContent),'booking table: "🖨 ใบส่งงาน + 📷" only on trips that require photos');
  await w.openBooking('PRN-1');
  ok(/รูปถ่ายตู้/.test(d.getElementById('bkPrint').textContent),'booking dialog: Print button mentions the photo option');
  await w.openBooking('PRN-2');
  ok(d.getElementById('bkPrint').textContent==='🖨 Print ใบส่งงาน','booking dialog: plain label when the customer does not need photos');
  w.closeModal('bookModal');
  // ---- Delivery Board table: วันที่ส่ง | เวลา | คันที่ | Order Type | จุดส่ง | ขนาดตู้ | Pallet | สถานะ, status = coloured circle
  {const day=w.localDay(),far=w.shiftDay(day,3),Q=(id,t,e)=>P(id,t,Object.assign({requestDate:far,orderType:'Firm',summary:{pallets:7,gross:500,cbm:3,containerType:'40HC'}},e||{}));
   w.plans=[Q('S-DONE','08:00',{booking:full(far,'07:30')}),Q('S-READY','09:00',{prep:'ready'}),Q('S-SHORT','10:00',{prep:'short'}),Q('S-NONE','11:00'),
     Q('S-CANCEL','12:00',{cancel:{reason:'x'}}),Q('S-SLIDE','13:00',{slides:[{fromDate:far,fromTime:'13:00',toDate:far,toTime:'15:00'}]}),
     Q('S-DELAY','14:00',{requestDate:w.shiftDay(day,-1)})];
   w.setBoardDay(far);
   const th=[...d.querySelectorAll('#deliveryBoard table.btable thead th')].map(x=>x.textContent);
   ok(th.join('|')==='วันที่ส่ง|เวลา|คันที่|Order Type|จุดส่ง (Destination · Port)|ขนาดตู้|Pallet|สถานะ (Status)','Delivery Board columns: '+th.join(' | '));
   const rowOf=id=>[...d.querySelectorAll('#deliveryBoard tr.brow')].find(r=>r.textContent.includes(id));
   const lab=id=>{const r=rowOf(id);return r?r.querySelector('.bst b').textContent+'/'+r.querySelector('.sdot').style.background:'-'};
   const want={'S-DONE':'สำเร็จ','S-READY':'จัดเตรียมชิ้นงานแล้ว','S-SHORT':'ชิ้นงานไม่พอจัดส่ง','S-NONE':'ยังไม่จัดเตรียม','S-CANCEL':'Cancel','S-SLIDE':'Slide'};
   Object.keys(want).forEach(id=>ok(lab(id).split('/')[0]===want[id],id+' -> '+want[id]+' ('+lab(id)+')'));
   w.setBoardDay(w.shiftDay(day,-1));ok(/Delay/.test((rowOf('S-DELAY')||{textContent:''}).querySelector?rowOf('S-DELAY').querySelector('.bst b').textContent:''),'a trip past its plan time that is not delivered -> Delay');
   w.setBoardDay(far);
   const cols=BS=>BS;const colors=new Set(Object.keys(want).map(id=>lab(id).split('/')[1]));ok(colors.size===6,'every status has its own circle colour ('+[...colors].join(' ')+')');
   const leg=d.getElementById('statusLegend');ok(leg&&leg.querySelectorAll('.sdot').length===7&&['สำเร็จ','จัดเตรียมชิ้นงานแล้ว','ชิ้นงานไม่พอจัดส่ง','ยังไม่จัดเตรียม','Delay','Cancel','Slide'].every(s=>leg.textContent.includes(s)),'Status Symbol legend lists all 7 statuses with a circle each');
   const r=rowOf('S-READY');ok(r.children.length===8&&/40HC/.test(r.textContent)&&/Firm/.test(r.textContent)&&/X · Y/.test(r.textContent)&&r.children[5].textContent==='40HC'&&r.children[6].textContent==='7','a row shows Order Type, Destination · Port, container size and Pallet');
   const tn=[...d.querySelectorAll('#deliveryBoard tr.brow:not(.jrow)')].map(x=>x.querySelector('.tno').textContent);ok(tn.join()==='1,2,3,4,5,6','คันที่ runs 1..n by time within the day ('+tn.join()+')');
   ok(rowOf('S-SLIDE').children[1].textContent.includes('15:00')&&rowOf('S-SLIDE').children[1].textContent.includes('เดิม 13:00'),'Slide: the NEW time is shown, the original time as a small note');
   // Warehouse sets the preparation status in the booking dialog; it lands on the board
   await w.openBooking('S-NONE');ok(d.getElementById('bk_prep').value==='','booking dialog starts at "ยังไม่จัดเตรียม"');
   d.getElementById('bk_prep').value='short';await w.savePrep('short');w.closeModal('bookModal');
   ok(w.plans.find(p=>p.planId==='S-NONE').prep==='short'&&lab('S-NONE').split('/')[0]==='ชิ้นงานไม่พอจัดส่ง','savePrep: the board shows "ชิ้นงานไม่พอจัดส่ง" for that trip');
   ok(w.eval("makePlan0().planId")!==undefined,'makePlan0 still builds');
   w.plans=[];w.renderDeliveryBoard();}
  ok(errs.length===0,'no runtime errors '+errs.join('|'));
  console.log(fail?'FAILED '+fail:'ALL PASSED');process.exit(fail?1:0);
},500);
