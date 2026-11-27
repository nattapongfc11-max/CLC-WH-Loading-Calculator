// v3.2: every date is SHOWN as dd/mm/yyyy (stored as yyyy-mm-dd) — on every page, dialog and print document, in every language
const {JSDOM}=require('jsdom');const fs=require('fs');const path=require('path');
const html=fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8');
let fail=0;const ok=(c,m)=>{console.log((c?'PASS ':'FAIL ')+m);if(!c)fail++};
const ISO=/(^|[^\d.])\d{4}-\d{2}-\d{2}(?!\d)/;
const part=(model,o)=>Object.assign({model,description:model,qtyCarton:4,cartonD:42.8,cartonW:61.9,cartonH:27.5,qtyPallet:64,palletD:110,palletW:110,palletH:125,netPC:1.71,grossCarton:8.7,grossPallet:260},o||{});
const NAMES=['AVH-1259ZY/XNJP','AVH-1969ZY/XNJP','AVH-2369ZY/XNJP','AVH-2069ZY/XNJP','AVH-2269ZY/XNJP','AVH-2459ZY/XNJP'];
const tick=(ms=25)=>new Promise(r=>setTimeout(r,ms));
function open(){
  const alerts=[],dom=new JSDOM(html,{runScripts:'dangerously',pretendToBeVisual:true,url:'https://clc.test/',beforeParse(win){win.alert=m=>alerts.push(m);win.confirm=m=>{alerts.push('CONFIRM '+m);return true}}});
  const w=dom.window,d=w.document,printed=[];w.open=()=>({document:{open(){},write(h){printed.push(h)},close(){}},closed:false});
  return {w,d,alerts,printed};
}
// every yyyy-mm-dd that is still VISIBLE: text, tooltips / placeholders, and what the date boxes display
function isoLeft(d,w){
  const out=[],wk=d.createTreeWalker(d.body,4);let n;
  while((n=wk.nextNode())){const p=n.parentNode;if(['SCRIPT','STYLE'].includes(p.tagName))continue;if(ISO.test(n.data)){const a=p.closest('[id]');out.push((a?'#'+a.id+' ':'')+p.tagName.toLowerCase()+(p.className?'.'+String(p.className).split(' ')[0]:'')+': '+n.data.trim().slice(0,70))}}
  d.querySelectorAll('[placeholder],[title],[aria-label]').forEach(el=>['placeholder','title','aria-label'].forEach(a=>{const v=el.getAttribute(a);if(v&&ISO.test(v))out.push('@'+a+' '+v.slice(0,60))}));
  d.querySelectorAll('input:not([type=hidden]),textarea').forEach(el=>{const v=el.tagName==='TEXTAREA'?el.value:Object.getOwnPropertyDescriptor(w.HTMLInputElement.prototype,'value').get.call(el);if(el.type!=='date'&&ISO.test(v))out.push('input#'+el.id+' = '+v)});
  return out;
}
const textOf=h=>h.replace(/<style[\s\S]*?<\/style>/g,'').replace(/<script[\s\S]*?<\/script>/g,'').replace(/<[^>]+>/g,' ');
(async()=>{
  const S=open(),{w,d}=S;await tick(250);
  const day=w.localDay(),next=w.shiftDay(day,1);
  w.parts=NAMES.map(m=>part(m));
  w.models=NAMES.map((m,i)=>({model:m,planQty:[228,468,202,64,1256,460][i],actualQty:null,packingModel:m}));
  w.generateAllocations();w.allocations.forEach((a,i)=>w.setStack(i,'Y'));w.renderCalc();
  const Q=(id,tm,e)=>Object.assign({planId:id,requestDate:day,etd:day,deliveryTime:tm,orderType:'Firm',destination:'JAKARTA',port:'TJP',shipBy:'Sea',updatedAt:day+'T08:15:00.000Z',summary:{pallets:10,gross:4000,cbm:30},models:[]},e||{});
  const full={containerNo:'ABCD1234567',sealNo:'S1',loadingBy:'Somchai',loadDate:day,loadTime:'07:20',invoiceNo:'I1',driver:'Chalerm',truckPlate:'74-5610',subTruck:'SITC',updatedAt:day+'T07:30:00.000Z'};
  const p0=w.makePlan();p0.planId='PTM-261126-S-001';p0.destination='JPSHG';p0.port='NAGOYA';p0.etd=day;p0.deliveryTime='23:30';p0.shipBy='Sea';
  w.plans=[p0,Q('A-2','07:30',{booking:full,photoReq:true}),Q('A-3','09:00',{prep:'ready'}),Q('A-4','10:00',{cancel:{reason:'x',at:day+'T00:00:00Z'}}),
    Q('A-5','11:00',{slides:[{fromDate:day,fromTime:'11:00',toDate:next,toTime:'12:00',reason:'รถเสีย',at:day+'T05:00:00Z'}]}),Q('A-6','12:00',{etd:w.shiftDay(day,-3),requestDate:w.shiftDay(day,-5)}),Q('A-7','13:00',{etd:next})];
  const every=async()=>{for(const pg of ['dashboard','mgmt','calculate','parts','dest','booking','history','users']){w.showPage(pg);w.renderAll();await tick()}w.showPage('dashboard')};
  const scan=async(label)=>{await every();
    const bad=isoLeft(d,w);
    // every dashboard grouping / basis, and the Booking dialog of plans with Slide history, a finished load and a cancel
    for(const [k,v] of [['g','mm'],['g','ww'],['g','dd'],['basis','etd'],['basis','requestDate']]){w.setDash(k,v);bad.push(...isoLeft(d,w))}
    for(const id of ['A-5','A-2','A-6','A-4']){w.openBooking(id);bad.push(...isoLeft(d,w).map(x=>'[dialog '+id+'] '+x));w.closeModal('bookModal')}
    ok(bad.length===0,label+': no yyyy-mm-dd on any page / dialog'+(bad.length?' — '+bad.slice(0,8).join(' ¦ '):''))};
  // ---------- helper ----------
  ok(w.dmy('2026-11-27')==='27/11/2026'&&w.dmy('2026-11-27 06:57')==='27/11/2026 06:57'&&w.dmy('')===''&&w.dmy(null)===''&&w.dmy('abc')==='abc','dmy(): yyyy-mm-dd -> dd/mm/yyyy (time after it is kept; other text unchanged)');
  ok(w.dayLabel('2026-03-05')==='05/03/2026'&&w.dayLabel('')==='-','dayLabel() = dd/mm/yyyy');
  // ---------- pages ----------
  await scan('Standard');
  const bk=d.getElementById('bookTable').textContent;
  ok(bk.includes(w.dmy(day))&&bk.includes(w.dmy(next)),'Booking table shows '+w.dmy(day)+' and the Slide date '+w.dmy(next));
  const hs=d.getElementById('historyTable')?d.getElementById('historyTable').textContent:d.querySelector('#history').textContent;
  ok(hs.includes(w.dmy(day)),'Loading History shows '+w.dmy(day));
  // ---------- date boxes (typing / calendar) ----------
  const raw=el=>Object.getOwnPropertyDescriptor(w.HTMLInputElement.prototype,'value').get.call(el),type=(el,t)=>{Object.getOwnPropertyDescriptor(w.HTMLInputElement.prototype,'value').set.call(el,t);el.dispatchEvent(new w.Event('input',{bubbles:true}))};
  const boxes=[...d.querySelectorAll('input.dmyin')];
  ok(['reqDate','etd','bkFrom','bkTo','histFrom','histTo','bk_loadDate','bk_slideDate'].every(id=>d.getElementById(id).classList.contains('dmyin')&&d.getElementById(id).type==='text'&&d.getElementById(id).placeholder==='dd/mm/yyyy'),'every date box (Request, ETD, Booking / History filters, Loading date, Slide) is a dd/mm/yyyy box');
  ok(![...d.querySelectorAll('input[type=date]')].some(e=>!e.classList.contains('dmypk')),'no native browser date box is left (its format would follow the browser, not dd/mm/yyyy)');
  const etd=d.getElementById('etd');etd.value='2026-12-05';
  ok(raw(etd)==='05/12/2026'&&etd.value==='2026-12-05','value 2026-12-05 is shown as 05/12/2026 and still read back as 2026-12-05');
  type(etd,'27112026');ok(raw(etd)==='27/11/2026'&&etd.value==='2026-11-27','typing 27112026 -> 27/11/2026 (slashes added)');
  type(etd,'2711');ok(raw(etd)==='27/11'&&etd.value==='','half-typed date reads as empty');
  type(etd,'31022026');etd.dispatchEvent(new w.Event('blur'));ok(raw(etd)==='31/02/2026'&&etd.value===''&&etd.classList.contains('dmybad'),'31/02/2026 is not a date: read as empty and marked red');
  type(etd,'2026-12-24');ok(raw(etd)==='24/12/2026'&&etd.value==='2026-12-24'&&!etd.classList.contains('dmybad'),'an ISO date pasted in becomes dd/mm/yyyy');
  etd.value='';ok(raw(etd)===''&&etd.value==='','clearing works');
  // the page's own onchange never sees a half-typed date
  let calls=0;const keep=w.renderHistory;w.renderHistory=()=>{calls++};
  const hf=d.getElementById('histFrom');type(hf,'27/1');hf.dispatchEvent(new w.Event('change',{bubbles:true}));const c1=calls;
  type(hf,'27112026');hf.dispatchEvent(new w.Event('change',{bubbles:true}));
  ok(c1===0&&calls===1&&hf.value==='2026-11-27','onchange fires only for a complete date (history filter): '+c1+' then '+calls);w.renderHistory=keep;hf.value='';
  // calendar button
  const pk=etd.parentNode.querySelector('.dmypk');pk.value='2026-12-24';pk.dispatchEvent(new w.Event('change',{bubbles:true}));
  ok(etd.value==='2026-12-24'&&raw(etd)==='24/12/2026','date picked in the calendar is shown as dd/mm/yyyy and stored as 2026-12-24');
  // boxes created later (Delivery Board re-renders its own) are converted too
  w.showPage('booking');w.renderBooking();await tick();
  const bb=d.querySelector('#deliveryBoard input.dmyin');
  ok(!!bb&&raw(bb)===w.dmy(bb.value)&&/^\d{2}\/\d{2}\/\d{4}$/.test(raw(bb)),'the Delivery Board date box (created by the page) shows dd/mm/yyyy ('+(bb&&raw(bb))+')');
  w.openBooking('A-2');const bl=d.getElementById('bk_loadDate'),cal=bl.parentNode.querySelector('.dmycal'),pk2=bl.parentNode.querySelector('.dmypk');let shown=0;pk2.showPicker=()=>{shown++};
  bl.disabled=true;cal.click();const locked=shown;bl.disabled=false;cal.click();
  ok(locked===0&&shown===1&&/\.dmyin:disabled\+\.dmycal\{opacity/.test(html),'a read-only box: the 📅 button does nothing (and looks disabled); an editable one opens the calendar');w.closeModal('bookModal');
  // ---------- print documents ----------
  const docs={sketch:w.sketchHtml(p0),slip:w.slipHtml(p0),note:w.deliveryNoteHtml(w.plans[1],null)};
  for(const [k,h] of Object.entries(docs))ok(!ISO.test(textOf(h)),'print document "'+k+'": no yyyy-mm-dd'+(ISO.test(textOf(h))?' — '+(textOf(h).match(/.{20}\d{4}-\d{2}-\d{2}.{10}/)||[''])[0]:''));
  ok(textOf(docs.slip).includes(w.dmy(day))&&textOf(docs.note).includes(w.dmy(day))&&textOf(docs.sketch).includes(w.dmy(day)),'the print documents show '+w.dmy(day));
  // ---------- other languages ----------
  for(const L of ['en','ja']){w.clcSetLang(L);await tick();await scan(L);
    for(const [k,h] of Object.entries(docs))ok(!ISO.test(textOf(w.clcTrHtml(h))),L+': print document "'+k+'": no yyyy-mm-dd')}
  // alerts mention dates in dd/mm/yyyy too
  w.clcSetLang('th');await tick();
  // storage stays ISO: the plan keeps yyyy-mm-dd, only the display changes
  ok(w.plans.every(p=>!p.requestDate||/^\d{4}-\d{2}-\d{2}$/.test(p.requestDate))&&!w.makePlan().requestDate.replace(/^\d{4}-\d{2}-\d{2}$/,''),'stored values stay yyyy-mm-dd (sorting / comparing unchanged)');
  console.log(fail?'FAILED '+fail:'ALL PASSED');process.exit(fail?1:0);
})();
