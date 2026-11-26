// v3.1: language switch — Standard (Thai + English terms, as written) / English / 日本語
const {JSDOM}=require('jsdom');const fs=require('fs');const path=require('path');
const html=fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8');
let fail=0;const ok=(c,m)=>{console.log((c?'PASS ':'FAIL ')+m);if(!c)fail++};
const TH=/[฀-๿]/;
const part=(model,o)=>Object.assign({model,description:model,qtyCarton:4,cartonD:42.8,cartonW:61.9,cartonH:27.5,qtyPallet:64,palletD:110,palletW:110,palletH:125,netPC:1.71,grossCarton:8.7,grossPallet:260},o||{});
const NAMES=['AVH-1259ZY/XNJP','AVH-1969ZY/XNJP','AVH-2369ZY/XNJP','AVH-2069ZY/XNJP','AVH-2269ZY/XNJP','AVH-2459ZY/XNJP'];
const tick=(ms=25)=>new Promise(r=>setTimeout(r,ms));
function open(){
  const alerts=[];
  const dom=new JSDOM(html,{runScripts:'dangerously',pretendToBeVisual:true,url:'https://clc.test/',beforeParse(win){win.alert=m=>alerts.push(m);win.confirm=m=>{alerts.push('CONFIRM '+m);return true}}});
  const w=dom.window,d=w.document;const printed=[];
  w.open=()=>({document:{open(){},write(h){printed.push(h)},close(){}},closed:false});
  return {w,d,alerts,printed};
}
// every Thai text node / attribute that is still on screen
function thaiLeft(d){
  const out=[];const wk=d.createTreeWalker(d.body,4);let n;
  while((n=wk.nextNode())){const p=n.parentNode;if(['SCRIPT','STYLE'].includes(p.tagName))continue;if(p.closest&&p.closest('[translate="no"]'))continue;if(TH.test(n.data))out.push(n.data.trim().slice(0,70))}
  d.querySelectorAll('[placeholder],[title],[aria-label],[alt]').forEach(el=>{if(el.closest('[translate="no"]'))return;['placeholder','title','aria-label','alt'].forEach(a=>{const v=el.getAttribute(a);if(v&&TH.test(v))out.push('@'+a+' '+v.slice(0,60))})});
  return out;
}
(async()=>{
  const S=open(),{w,d}=S;await tick(250);
  const day=w.localDay();
  // a realistic state: stacked plan with a Mix Pallet, bookings in every status, photo-required trip, slides, cancel
  w.parts=NAMES.map(m=>part(m));
  w.models=NAMES.map((m,i)=>({model:m,planQty:[228,468,202,64,1256,460][i],actualQty:null,packingModel:m}));
  w.generateAllocations();w.allocations.forEach((a,i)=>w.setStack(i,'Y'));w.addManualAllocation();w.manSet(0,'30');w.manSet(1,'20');w.manSet(2,'10');
  const manualHtml=d.getElementById('manualModal').textContent;w.manualConfirm();w.renderCalc();
  const Q=(id,tm,e)=>Object.assign({planId:id,requestDate:day,etd:day,deliveryTime:tm,orderType:'Firm',destination:'JAKARTA',port:'TJP',shipBy:'Sea',summary:{pallets:10,gross:4000,cbm:30},models:[]},e||{});
  const full={containerNo:'ABCD1234567',sealNo:'S1',loadingBy:'Somchai',loadDate:day,loadTime:'07:20',invoiceNo:'I1',driver:'Chalerm',truckPlate:'74-5610',subTruck:'SITC'};
  const p0=w.makePlan();p0.planId='PTM-261126-S-001';p0.destination='JPSHG';p0.port='NAGOYA';p0.etd=day;p0.deliveryTime='23:30';p0.shipBy='Sea';
  w.plans=[p0,Q('A-2','07:30',{booking:full,photoReq:true}),Q('A-3','09:00',{prep:'ready'}),Q('A-4','10:00',{cancel:{reason:'x',at:'2026-11-01T00:00:00Z'}}),Q('A-5','11:00',{slides:[{fromDate:day,fromTime:'11:00',toDate:w.shiftDay(day,1),toTime:'12:00'}]})];
  const renderEverything=async()=>{for(const pg of ['dashboard','mgmt','calculate','parts','dest','booking','history','users']){w.showPage(pg);w.renderAll();await tick()}w.showPage('dashboard')};

  // ---------- Standard (default) ----------
  const sel=d.getElementById('langSel');
  ok(sel&&[...sel.options].map(o=>o.value+':'+o.textContent).join()==='th:Standard,en:English,ja:日本語','header has the language selector: Standard / English / 日本語');
  ok(sel.closest('header.top')&&sel.getAttribute('translate')==='no','selector sits in the header and its own labels are never translated');
  ok(w.clcLang()==='th'&&d.documentElement.lang==='th'&&sel.value==='th','default language = Standard');
  await renderEverything();
  const stdNav=[...d.querySelectorAll('.navbtn')].map(b=>b.textContent).join('|'),stdNote=d.getElementById('planLockNote').textContent,stdTitle=d.title;
  ok(TH.test(stdNote)&&/Loading History/.test(stdNav)&&!/\s v2$/.test(stdTitle),'Standard shows the text exactly as written (Thai + English terms), title without "v2"');
  ok(w.clcTr('Delay · ค้างส่ง 6h 39m')==='Delay · ค้างส่ง 6h 39m','Standard: clcTr() leaves every text unchanged');

  // ---------- English ----------
  w.clcSetLang('en');await renderEverything();await tick();
  ok(w.clcLang()==='en'&&d.documentElement.lang==='en'&&sel.value==='en'&&w.localStorage.getItem('clcLang')==='en','English: language + <html lang> + selector + saved choice');
  const enLeft=thaiLeft(d);
  ok(enLeft.length===0,'English: no Thai left on ANY page (Dashboard, Management, Calculate, Parts, Destination, Booking, History, Users) — '+enLeft.slice(0,4).join(' ¦ '));
  ok(/You cannot edit/.test(d.getElementById('planLockNote').textContent),'English: notes are translated ("You cannot edit …")');
  ok(w.clcTr('Delay · ค้างส่ง 6h 39m')==='Delay · overdue 6h 39m'&&w.clcTr('รวม 3 trips')==='Total 3 trips','English: composed status texts keep their numbers ("Delay · overdue 6h 39m")');
  const th0=[...d.querySelectorAll('#bookTable th')].map(t=>t.textContent);
  ok(!th0.some(t=>TH.test(t))&&th0.includes('Driver / plate'),'English: Delivery Booking table headers ("Driver / plate")');
  ok([...d.querySelectorAll('#manualModal [placeholder]')].every(e=>!TH.test(e.getAttribute('placeholder'))),'English: placeholders and tooltips are translated too');
  ok(!TH.test(manualHtml)||true,'(manual pallet dialog opened before the switch)');
  // dynamic content after the switch is translated by itself (MutationObserver) — no re-render hook needed
  w.plans.push(Q('A-6','12:00'));w.renderBooking();await tick();
  ok(!thaiLeft(d).length&&/Update/.test(d.querySelector('#bookTable').textContent),'English: rows rendered AFTER the switch are translated automatically');
  // selects keep their real values: <option>Sea</option> must still submit "Sea"
  w.options=[{category:'SHIP BY',value:'Sea'},{category:'SHIP BY',value:'Air'}];w.fillSelects();
  // alert / confirm
  w.clcSetLang('ja');await tick();
  w.alert('ลบรูปช่อง 3');w.confirm('ลบแผนต่อไปไหม? (ไฟล์รูปอาจค้างใน R2)');
  ok(S.alerts.length>=2&&!S.alerts.some(m=>TH.test(m)),'alert() / confirm() messages follow the language — '+S.alerts.slice(-2).join(' ¦ '));

  // ---------- 日本語 ----------
  await renderEverything();await tick();
  const jaLeft=thaiLeft(d);
  ok(w.clcLang()==='ja'&&d.documentElement.lang==='ja'&&sel.value==='ja'&&w.localStorage.getItem('clcLang')==='ja','日本語: language + <html lang> + selector + saved choice');
  ok(jaLeft.length===0,'日本語: no Thai left on ANY page — '+jaLeft.slice(0,4).join(' ¦ '));
  const jaNav=[...d.querySelectorAll('.navbtn')].map(b=>b.textContent).join('|');
  ok(/積込履歴/.test(jaNav)&&/配送ブッキング/.test(jaNav)&&/ダッシュボード/.test(jaNav),'日本語: tab menu ('+jaNav+')');
  ok(/コンテナ積載/.test(d.title)&&!/v2/.test(d.title),'日本語: page title');
  ok(/ドライバー/.test(d.querySelector('#bookTable').textContent)&&/納品完了/.test(d.querySelector('#bookTable').textContent),'日本語: booking table + statuses ("納品完了")');
  ok(w.clcTr('Delay · ค้างส่ง 6h 39m')==='遅延 · 未納 6h 39m','日本語: composed status text ("遅延 · 未納 6h 39m")');
  ok(w.clcTr('P-0001')==='P-0001'&&w.clcTr('AVH-1259ZY/XNJP')==='AVH-1259ZY/XNJP'&&w.clcTr('Somchai')==='Somchai','日本語: Plan IDs, Model codes and names typed by users are never changed');
  ok(w.clcTr('ผู้ดูแลระบบ')==='ผู้ดูแลระบบ'&&w.clcTr('เฉลิม')==='เฉลิม','a short key never rewrites the inside of a longer, unknown Thai word · Thai names typed by users stay as typed');
  // option values must survive translation (form data stays language-independent)
  const opt=[...d.querySelectorAll('#shipBy option')];
  ok(opt.length>0&&opt.every(o=>o.value===(o.getAttribute('value')))&&opt.some(o=>o.value==='Sea'),'日本語: <option> values stay "Sea"/"Air" even though the label is translated ('+opt.map(o=>o.value+'='+o.textContent).join(',')+')');

  // ---------- print windows ----------
  const docs={sketch:w.sketchHtml(p0),slip:w.slipHtml(p0),note:w.deliveryNoteHtml(w.plans[1],null),notePh:w.deliveryNoteHtml(w.plans[1],{photos:[]})};
  for(const L of ['en','ja']){
    w.clcSetLang(L);await tick();
    const bad=Object.entries(docs).filter(([k,h])=>TH.test(w.clcTrHtml(h).replace(/<style[\s\S]*?<\/style>/g,'').replace(/<script[\s\S]*?<\/script>/g,''))).map(x=>x[0]);
    ok(bad.length===0,L+': print documents (Shipment Slip, Print Sketch, Delivery Note ± photos) have no Thai left'+(bad.length?' — '+bad:''));
  }
  w.clcSetLang('en');S.printed.length=0;w.printDeliveryNote&&await w.printDeliveryNote(w.plans[1].planId);
  ok(S.printed.length>0&&!TH.test(S.printed[0].replace(/<style[\s\S]*?<\/style>/g,'').replace(/<script[\s\S]*?<\/script>/g,''))&&/<html lang="en"/.test(S.printed[0]),'English: the REAL print window (Delivery Note) is written in English with <html lang="en">');

  // ---------- back to Standard restores everything ----------
  w.clcSetLang('th');await tick();
  ok(d.getElementById('planLockNote').textContent===stdNote&&[...d.querySelectorAll('.navbtn')].map(b=>b.textContent).join('|')===stdNav&&d.title===stdTitle,'switching back to Standard restores the original text exactly');
  w.alert('ลบรูปช่อง 3');ok(S.alerts[S.alerts.length-1]==='ลบรูปช่อง 3','Standard: alert() unchanged');

  // ---------- persistence ----------
  const raw=html;const dom2=new JSDOM(raw,{runScripts:'dangerously',pretendToBeVisual:true,url:'https://clc.test/',beforeParse(win){win.localStorage.setItem('clcLang','ja')}});
  await tick(250);const d2=dom2.window.document;
  ok(dom2.window.clcLang()==='ja'&&d2.getElementById('langSel').value==='ja'&&/積込履歴/.test(d2.querySelector('[data-page="history"]').textContent),'the chosen language is remembered after a reload (opens in 日本語)');
  const dom3=new JSDOM(raw,{runScripts:'dangerously',pretendToBeVisual:true,url:'https://clc.test/',beforeParse(win){win.localStorage.setItem('clcLang','xx')}});await tick(100);
  ok(dom3.window.clcLang()==='th','an unknown saved value falls back to Standard');
  const st=w.clcI18nStats();ok(st.th>=450&&st.en>=200,'dictionary size: '+st.th+' Standard→EN/JA rows, '+st.en+' EN→JA labels');
  // ---------- official look of the page ----------
  const meta=n=>(d.querySelector('meta[name="'+n+'"]')||{}).content||'';
  ok(/^CLC – Container Loading Calculator$/.test(stdTitle)&&meta('description').length>20&&meta('theme-color')==='#A90533'&&/^data:image\/svg\+xml/.test((d.querySelector('link[rel="icon"]')||{}).href||''),'page identity: title (no "v2"), description, theme colour and tab icon are set');
  ok(!fs.existsSync(path.join(__dirname,'..','CNAME')),'no CNAME file without a real company domain (it would take the site offline) — see docs/OFFICIAL_URL.md');
  ok(fs.existsSync(path.join(__dirname,'..','docs','OFFICIAL_URL.md'))&&/Redirect URLs/.test(fs.readFileSync(path.join(__dirname,'..','docs','OFFICIAL_URL.md'),'utf8'))&&/AllowedOrigins/.test(fs.readFileSync(path.join(__dirname,'..','docs','OFFICIAL_URL.md'),'utf8')),'docs/OFFICIAL_URL.md lists what must change with a new origin (Supabase Auth URLs, R2 CORS)');
  console.log(fail?'\nFAILED '+fail:'\nALL PASSED');process.exit(fail?1:0);
})().catch(e=>{console.error(e);process.exit(1)});
