// Delivery board, booking and pallet-dimension toggle tests (jsdom, Supabase not loaded).
const {JSDOM}=require('jsdom');const fs=require('fs');const path=require('path');
const html=fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8');
const dom=new JSDOM(html,{runScripts:'dangerously',pretendToBeVisual:true,url:'https://clc.test/'});
const w=dom.window,d=w.document,errs=[];w.addEventListener('error',e=>errs.push(e.message));
let fail=0;const ok=(c,m)=>{console.log((c?'PASS ':'FAIL ')+m);if(!c)fail++};
w.alert=()=>{};w.prompt=()=>{};
setTimeout(async()=>{
  const day=w.localDay(),mk=(id,time,booking)=>({planId:id,requestDate:day,deliveryTime:time,destination:'X',port:'Y',summary:{pallets:2,gross:500,cbm:3},booking});
  // plan times relative to "now" (Bangkok clock is used for plan times)
  const now=new Date('2026-11-25T10:00:00+07:00');
  const base=(id,time,b)=>Object.assign(mk(id,time,b),{requestDate:'2026-11-25'});
  ok(w.delivInfo(base('A','09:00'),now).key==='overdue','past plan time, no delivery -> overdue/delay');
  ok(w.delivInfo(base('B','15:00'),now).key==='pending','future plan time -> pending');
  ok(w.delivInfo(base('C','09:00',{status:'Delivered',deliveredDate:'2026-11-25',deliveredTime:'08:30'}),now).label==='Delivered · On time','delivered before plan -> on time');
  const late=w.delivInfo(base('D','09:00',{status:'Delivered',deliveredDate:'2026-11-25',deliveredTime:'10:15'}),now);
  ok(late.delay&&late.late===75,'delivered 75 min after plan -> delay 75');
  ok(w.delivInfo(base('E','15:00',{status:'Firm'}),now).label==='Firm · on plan','firm booking pending label');
  // board counts
  w.plans=[mk('P1','00:00',{status:'Delivered',deliveredDate:day,deliveredTime:'00:00'}),mk('P2','23:59',{status:'Firm'}),mk('P3','23:59')];
  w.renderDeliveryBoard();
  const k=[...d.querySelectorAll('#deliveryBoard .kpi b')].map(x=>x.textContent);
  ok(k[0]==='3'&&k[1]==='1'&&k[2]==='2','board: 3 trips, 1 delivered, 2 outstanding ('+k.join(',')+')');
  ok(d.querySelectorAll('#dayStrip .daycard').length===15,'day slide strip has 15 days');
  ok(d.querySelectorAll('#deliveryBoard .mcol').length>=28,'daily plan vs actual chart rendered');
  // booking flow
  let saved=null;w.savePlanRecord=async p=>{saved=JSON.parse(JSON.stringify(p));return true};
  w.openBooking('P2');ok(d.getElementById('bookModal').classList.contains('open'),'booking modal opens');
  d.getElementById('bk_status').value='Firm';await w.saveBooking();
  ok(d.getElementById('bkWarn').textContent.includes('Container No.'),'Firm requires all fields');
  const set=(k,v)=>d.getElementById('bk_'+k).value=v;
  set('containerNo','abcd 1234567');set('sealNo','S1');set('loadingBy','Somchai');set('invoiceNo','INV-1');set('loadDate',day);set('loadTime','08:00');set('driver','Driver A');set('subTruck','SUB-01');
  await w.saveBooking();
  ok(saved&&saved.booking.containerNo==='ABCD1234567'&&saved.booking.status==='Firm','booking saved (container normalised, Firm)');
  ok(!d.getElementById('bookModal').classList.contains('open'),'modal closes after save');
  ok(d.querySelector('#bookTable').textContent.includes('ABCD1234567'),'booking table lists container');
  w.openBooking('P3');d.getElementById('bk_status').value='Delivered';w.bkToggleDelivered();
  ok(d.getElementById('bkDelivered').style.display!=='none','delivered date/time fields appear');
  w.closeModal('bookModal');
  w.document.getElementById('bkStatus').value='Firm';w.renderBooking();
  ok(d.querySelectorAll('#bookTable tbody tr').length===1,'booking filter by status');
  // dimension toggle
  w.models=[];w.renderAll();
  ok(!d.getElementById('allocationWrap').classList.contains('dims-hidden'),'dimensions shown by default');
  w.toggleDims();
  ok(d.getElementById('allocationWrap').classList.contains('dims-hidden')&&d.getElementById('dimToggle').textContent.includes('Show'),'toggle hides dimensions');
  w.toggleDims();ok(!d.getElementById('allocationWrap').classList.contains('dims-hidden'),'toggle shows again');
  ok(d.querySelectorAll('#allocationWrap .col-dim, th.col-dim').length>=1,'pallet dimension header has col-dim');
  ok(errs.length===0,'no runtime errors '+errs.join('|'));
  console.log(fail?'FAILED '+fail:'ALL PASSED');process.exit(fail?1:0);
},400);
