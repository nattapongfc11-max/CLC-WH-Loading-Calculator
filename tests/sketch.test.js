// v3.0: sticky header with Pioneer logo, hidden Print Logo card, "Stack a-b" tag in Skid Pallet No., Print Sketch (1 page), 3D View in Delivery Booking, compact board
const {JSDOM}=require('jsdom');const fs=require('fs');const path=require('path');
const html=fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8');
let fail=0;const ok=(c,m)=>{console.log((c?'PASS ':'FAIL ')+m);if(!c)fail++};
const part=(model,o)=>Object.assign({model,description:model,qtyCarton:4,cartonD:42.8,cartonW:61.9,cartonH:27.5,qtyPallet:64,palletD:110,palletW:110,palletH:125,netPC:1.71,grossCarton:8.7,grossPallet:260},o||{});
const NAMES=['AVH-1259ZY/XNJP','AVH-1969ZY/XNJP','AVH-2369ZY/XNJP','AVH-2069ZY/XNJP','AVH-2269ZY/XNJP','AVH-2459ZY/XNJP'];

function open(){
  const dom=new JSDOM(html,{runScripts:'dangerously',pretendToBeVisual:true,url:'https://clc.test/'});const w=dom.window,d=w.document;
  const alerts=[],printed=[];w.alert=m=>alerts.push(m);w.confirm=()=>true;
  w.open=()=>({document:{open(){},write(h){printed.push(h)},close(){}},closed:false});
  return {w,d,alerts,printed};
}
// the plan of the user's screenshot: 6 models, Stack = Y, 23 pallets on a 20-position 40HC => 3 stacked pairs
function load(S,qty,stackY){
  const {w}=S;w.parts=NAMES.map(m=>part(m));
  w.models=NAMES.map((m,i)=>({model:m,planQty:qty[i],actualQty:null,packingModel:m}));
  w.generateAllocations();if(stackY!==false)w.allocations.forEach((a,i)=>w.setStack(i,'Y'));w.renderCalc();
}
const n0=v=>Number(v)||0;
const USER_QTY=[192,448,192,64,1216,448];

(async()=>{
  const S=open(),{w,d}=S;await new Promise(r=>setTimeout(r,250));
  const css=[...html.matchAll(/<style>([\s\S]*?)<\/style>/g)].map(m=>m[1]).join('\n');

  // ---------- header ----------
  const tw=d.querySelector('.topwrap');
  ok(tw&&tw.querySelector('header.top')&&tw.querySelector('nav')&&tw.querySelectorAll('.navbtn').length>=7,'header + tab menu live in ONE wrapper (.topwrap)');
  ok(/\.topwrap\{position:sticky;top:0;z-index:(\d+)/.test(css)&&Number(/\.topwrap\{position:sticky;top:0;z-index:(\d+)/.exec(css)[1])<Number(/\.modal\{[^}]*z-index:(\d+)/.exec(css)[1]),'header + menu are frozen (position: sticky; top: 0) and stay below the pop-up dialogs');
  ok(!d.querySelector('.layout nav'),'the menu is no longer inside the scrolling layout');
  ok(/^data:image\/svg\+xml/.test(d.getElementById('topLogo').getAttribute('src')||'')&&d.querySelector('.topwrap header .toplogo'),'Pioneer logo shown at the left of the header');
  ok(d.querySelector('.topwrap header').firstElementChild===d.getElementById('topLogo'),'logo is the first (left-most) item of the header');
  ok(d.querySelector('.top h1').textContent==='Delivery Monitoring and CLC Container Loading','header title: Delivery Monitoring and CLC Container Loading');
  ok(/Truckplan Delivery/.test(d.querySelector('.top small').textContent)&&/Warehouse Container Loading · Logistics · Shipment/.test(d.querySelector('.top small').textContent),'sub title: Truckplan Delivery, Warehouse Container Loading · Logistics · Shipment');
  ok(/\.toplogo\{[^}]*background:#fff/.test(css),'logo sits on a white tile (the logo is red like the header)');
  ok(/auth-screen:not\(\.auth-hidden\)~\.topwrap/.test(css),'login screen still hides the header + menu');

  // ---------- Print Logo card hidden (logic kept) ----------
  const box=d.getElementById('logoCardBox');
  ok(box&&box.style.display==='none'&&box.textContent.includes('Print Logo'),'Print Logo card is hidden on the web page (kept in the background)');
  w.localStorage.setItem('clcPrintLogo','data:image/svg+xml;base64,AAAA');w.renderLogoCard();
  ok(d.getElementById('topLogo').getAttribute('src')==='data:image/svg+xml;base64,AAAA'&&w.printLogoSrc()==='data:image/svg+xml;base64,AAAA','a logo saved in the browser is used in the header and on prints');
  w.localStorage.removeItem('clcPrintLogo');w.renderLogoCard();

  // ---------- Skid Pallet No.: Stack a-b ----------
  load(S,USER_QTY);
  const st=w.planStacking();
  ok(st.physical===23&&st.pairs.length===3,'scenario: 23 physical pallets, 3 stacked pairs (like the screenshot)');
  const cellOf=seq=>[...d.querySelectorAll('#allocations tr')].filter(tr=>tr.querySelector('.stkpair')&&Number(tr.querySelector('.stkpair').dataset.seq)===seq).map(tr=>tr.querySelector('.stkpair').textContent.trim());
  const pairTxt=pr=>'Stack '+Math.min(pr.bottom.seq,pr.top.seq)+'-'+Math.max(pr.bottom.seq,pr.top.seq);
  ok(st.pairs.every(pr=>cellOf(pr.bottom.seq).every(t=>t===pairTxt(pr))&&cellOf(pr.top.seq).every(t=>t===pairTxt(pr))&&cellOf(pr.top.seq).length>0),'both pallets of a stacked pair show the SAME "Stack a-b" (lower number first)');
  const inPair=new Set(st.pairs.flatMap(p=>[p.bottom.seq,p.top.seq]));
  const dbl=st.pls.filter(p=>p.units&&!inPair.has(p.seq));
  ok(dbl.length>0&&dbl.every(p=>cellOf(p.seq).every(t=>t==='Stack ×2')),'one Seq holding 2 pallets of the same Model (Stack = Y, 128) shows "Stack ×2"');
  const plain=st.pls.filter(p=>!p.units&&!inPair.has(p.seq));
  ok(plain.every(p=>cellOf(p.seq).every(t=>t==='')),'pallets that are not stacked show no Stack tag');
  ok([...d.querySelectorAll('#allocations .stkpair .chip.stkp')].length>=6&&/title="ซ้อนกัน: ล่าง/.test(d.getElementById('allocations').innerHTML),'pair tag tooltip says which pallet is bottom / top');
  const skid=[...d.querySelectorAll('#allocations tr')][0].querySelector('.skidcell').textContent;
  ok(/\d+\/\d+/.test(skid),'the No./Total text is still there next to the tag ('+skid.trim()+')');
  // the tags follow the container: bigger floor -> no pair left, the tags disappear
  d.getElementById('containerType').value='40GP';d.getElementById('floorCap').disabled=false;d.getElementById('floorCap').value=40;w.renderSummary();
  ok(![...d.querySelectorAll('#allocations .stkpair')].some(e=>/^Stack \d+-\d+$/.test(e.textContent.trim())),'floor capacity raised: pair tags disappear (tags follow the stacking plan)');
  d.getElementById('floorCap').value=20;w.renderSummary();
  ok([...d.querySelectorAll('#allocations .stkpair')].some(e=>/^Stack \d+-\d+$/.test(e.textContent.trim())),'floor capacity lowered: pair tags come back');
  d.getElementById('containerType').value='40HC';w.setContainerType();

  // ---------- Print Sketch ----------
  const before=JSON.stringify([w.models,w.allocations]);
  w.printSketch();
  ok(S.printed.length===1,'Print Sketch opens one print window');
  const h=S.printed[0];
  ok(/@page\{size:A4 landscape/.test(h)&&/LOADING SKETCH/.test(h)&&/@media print\{\.sk\.sheet\{width:auto;height:196mm/.test(h),'A4 landscape, fixed page height (1 page)');
  ok(/<svg viewBox="0 0 1000 520">/.test(h)&&/class="cont"/.test(h),'container 3D picture is on the sheet');
  const D=w.sketchData(w.makePlan());
  const all=D.groups.flatMap(g=>g.seqs).sort((a,b)=>a-b);
  ok(all.length===23&&all.every((s,i)=>s===i+1),'every one of the 23 pallets is shown exactly once ('+D.groups.length+' pallet drawings)');
  ok(D.groups.length<23&&D.groups.some(g=>g.seqs.length>1),'pallets with the same build are merged into ONE drawing with ×count');
  ok((h.match(/class="pc"/g)||[]).length===D.groups.length&&D.groups.every(g=>g.svg.length>500),'one pallet drawing card per group (each is a real 3D picture)');
  ok(D.groups.some(g=>g.pl.units)&&D.groups.filter(g=>g.pl.units).every(g=>g.pl.units.length===2&&(g.svg.match(/<polygon/g)||[]).length>=12),'Stack = Y pallets are drawn as TWO pallets (2 skids + 2 loads)');
  ok(D.pairs.length===3&&D.pairs.every(x=>h.includes('Stack '+x.a+'-'+x.b)),'stacked pairs are listed ("Stack 18-19" style)');
  ok(JSON.stringify([w.models,w.allocations])===before,'printing does not change the form');
  ok(/PTM|-/.test(h)&&/Warehouse|จัดเตรียม/.test(h),'signature boxes for the warehouse are on the sheet');
  // layer-by-layer detail: every pallet card lists its Layers, and the cartons of the layers add up to the pallet's cartons
  ok(D.groups.every(g=>g.levels.parts.length===(g.pl.units?g.pl.units.length:1)&&g.levels.parts.every(lv=>lv.length>0)),'every pallet card has its Layer list (one list per physical pallet of a Stack = Y position)');
  ok(D.groups.every(g=>g.levels.parts.reduce((s,lv)=>s+lv.reduce((a,x)=>a+x.cartons,0),0)===g.ctn),'cartons in the Layers add up to the cartons of the pallet ('+D.groups.map(g=>g.ctn).join(',')+')');
  ok((h.match(/<b>Layer \d/g)||[]).length>=D.groups.length&&/ctn\/layer/.test(h)&&/61\.9×42\.8/.test(h),'Layer lines show cartons per layer and the carton footprint (W×D cm)');
  // top-view floor plan: every pallet number is on it, front / door marked
  ok(D.plan.includes('หัวตู้')&&D.plan.includes('ประตู')&&all.every(sq=>new RegExp('>[▲▼]? ?'+sq+'<').test(D.plan)),'floor plan (top view) shows every Pallet No., front and door');
  // label layout: the bigger labels of the sketch never sit on top of each other
  const labs=[...D.container.matchAll(/<g class="s3lab"[^>]*>[\s\S]*?<rect x="([\d.-]+)" y="([\d.-]+)" width="([\d.]+)" height="([\d.]+)"/g)].map(m=>m.slice(1).map(Number));
  let hit=0;for(let i=0;i<labs.length;i++)for(let j=i+1;j<labs.length;j++){const a=labs[i],b=labs[j];if(a[0]<b[0]+b[2]&&b[0]<a[0]+a[2]&&a[1]<b[1]+b[3]&&b[1]<a[1]+a[3])hit++}
  ok(labs.length>=12&&hit===0,'container labels are bigger on paper ('+D.ls+'x) and none overlaps another ('+labs.length+' labels)');
  ok(D.ls>=1.4&&D.container.includes('font-size="'+(13.5*D.ls).toFixed(1)+'"'),'label scale reaches the text (font-size '+(13.5*D.ls).toFixed(1)+')');
  // one sheet when it fits, more sheets when it does not: nothing is cut, signatures only on the last sheet
  const sheets=s=>(s.match(/<main class="sheet sk">/g)||[]).length;
  ok(sheets(h)===1&&/A4 แนวนอน · 1 Page/.test(h),'11 pallet types fit ONE A4 sheet');
  const many=()=>{const names=Array.from({length:30},(_,i)=>'ZZ-'+(100+i)+'/XJP');w.parts=names.map((m,i)=>part(m,i%2?{cartonD:30+i,cartonW:40,cartonH:20+i%6,qtyCarton:6,qtyPallet:96,palletH:121}:{}));
    w.models=names.map((m,i)=>({model:m,planQty:64*(1+i%4)+(i%5)*16,actualQty:null,packingModel:m}));w.generateAllocations();w.allocations.forEach(a=>w.setStack(w.allocations.indexOf(a),'Y'));w.renderCalc();return w.makePlan()};
  const pm=many(),hm=w.sketchHtml(pm),dm=w.sketchData(pm);
  ok(sheets(hm)>=2&&(hm.match(/class="pc"/g)||[]).length===dm.groups.length&&dm.groups.flatMap(g=>g.seqs).length===w.planStacking().physical,'30 pallet types: continues on more sheets ('+sheets(hm)+'), every pallet card is on exactly one sheet');
  ok((hm.match(/class="sg2"/g)||[]).length===1&&hm.lastIndexOf('class="sg2"')>hm.lastIndexOf('<main class="sheet sk">'),'signature boxes only on the LAST sheet');
  ok(/<main class="sheet sk">[\s\S]*?class="top"/.test(hm)&&(hm.match(/class="top"/g)||[]).length===1,'container picture only on the first sheet');
  ok(/@media print\{\.sk\.sheet\{[^}]*\}\.sk\.sheet\+\.sk\.sheet\{break-before:page/.test(hm),'each continuation sheet starts a new page when printed');
  load(S,USER_QTY);
  // a mix of models: Mix Pallet / Pallet เศษ drawn with their cartons
  load(S,[192+36,448+20,192+10,64,1216+40,448+12]);
  const D2=w.sketchData(w.makePlan());
  ok(D2.groups.some(g=>g.pl.kind==='mix')||D2.groups.some(g=>g.pl.kind==='rem'),'Mix Pallet / Pallet เศษ pallets appear in the sketch');
  // a SAVED plan with another container: drawn from that plan; the form stays as it was
  load(S,USER_QTY);const cur=w.makePlan();const other=JSON.parse(JSON.stringify(cur));other.planId='PTM-261126-S-009';other.summary.containerType='Other';other.summary.floorCap=10;other.summary.contH=239;
  w.plans=[other];const snap=JSON.stringify([w.models,w.allocations,d.getElementById('containerType').value,d.getElementById('floorCap').value]);
  S.printed.length=0;w.printSketchPlan('PTM-261126-S-009');
  ok(S.printed.length===1&&/Other · 580×235×239 cm/.test(S.printed[0])&&/PTM-261126-S-009/.test(S.printed[0]),'sketch of a saved plan uses THAT plan (container Other 580×235×239), not the open form (40HC)');
  ok(JSON.stringify([w.models,w.allocations,d.getElementById('containerType').value,d.getElementById('floorCap').value])===snap,'the open form (models, allocations, container fields) is restored afterwards');
  w.plans=[{planId:'EMPTY',allocations:[]}];S.alerts.length=0;w.printSketchPlan('EMPTY');ok(S.alerts.length===1&&S.printed.length===1,'plan without pallet data: message, nothing printed');
  ok(!!d.getElementById('printSketchBtn')&&/Print Sketch/.test(d.getElementById('printSketchBtn').textContent),'"Print Sketch" button next to Print Shipment Slip');
  w.newPlan();S.alerts.length=0;w.printSketch();ok(S.alerts.length===1,'Print Sketch with no plan: message');

  // ---------- 3D View in Delivery Booking ----------
  load(S,USER_QTY);const p=w.makePlan();p.planId='PTM-261126-S-001';p.destination='JPSHG';p.port='NAGOYA';p.etd=w.localDay();p.deliveryTime='23:30';p.shipBy='Sea';
  w.plans=[p,{planId:'NOALLOC',destination:'X',port:'Y',etd:w.localDay(),deliveryTime:'10:00',summary:{},allocations:[],models:[]}];
  w.newPlan();const fm=JSON.stringify([w.models,w.allocations]);
  w.openBooking('PTM-261126-S-001');
  const bk=d.getElementById('bk3d');
  ok(d.getElementById('bk3dBox').style.display===''&&bk.innerHTML.includes('<polygon')&&/×2/.test(bk.innerHTML),'Delivery Booking shows the 3D View of the plan\'s pallets (with Pallet No. labels)');
  ok(/Physical Pallet <b>23<\/b>/.test(d.getElementById('bk3Info').innerHTML)&&/ซ้อน 3 คู่/.test(d.getElementById('bk3Info').textContent),'summary line under the picture: pallets, floor use, stacked pairs');
  ok(JSON.stringify([w.models,w.allocations])===fm,'opening the dialog does not touch the calculation form behind it');
  const a0=bk.innerHTML;w.bk3view(0,86);ok(bk.innerHTML!==a0&&w.BK3?true:bk.innerHTML!==a0,'view buttons turn the picture (top view)');
  w.bk3Look();const k1=bk.innerHTML;ok(d.getElementById('bk3LookBtn').textContent==='ตาม Model'&&k1!==a0,'Kraft / Model colour toggle');
  w.bk3Look();
  ok(/printSketchPlan/.test(d.getElementById('bk3dBox').innerHTML),'Print Sketch is available inside the booking dialog');
  w.closeModal('bookModal');w.openBooking('NOALLOC');ok(d.getElementById('bk3dBox').style.display==='none','plan without pallet data: no 3D block');
  w.closeModal('bookModal');

  // ---------- ONE pipeline: 3D of a saved plan == the 3D WH Calculate draws after opening that plan ----------
  load(S,[192+36,448+20,192+10,64,1216+40,448+12]);
  w.addManualAllocation();w.manSet(0,'30');w.manSet(1,'20');w.manSet(2,'10');w.manualConfirm();   // a real Mix Pallet of 3 models (Manual Pallet pop-up)
  const cur2=w.makePlan();cur2.planId='PTM-261126-S-007';cur2.destination='JPSHG';cur2.port='NAGOYA';cur2.etd=w.localDay();cur2.deliveryTime='10:00';
  const saved=JSON.parse(JSON.stringify(cur2));saved.allocations.reverse();               // a plan saved in a different row order (older save)
  saved.allocations.forEach(a=>{if(w.isMixAllocation(a))a.palletH=40});   // ... with stale pallet heights (WH Calculate recalculates them when the plan is opened)
  const gid=s=>s.replace(/s3bg|bk3bg|skbg/g,'G').replace(/<text[^>]*>ลากเพื่อหมุน[^<]*<\/text>/,'');
  const CAM={yaw:-24,pitch:37,zoom:1},LS=w.sketchData(cur2).ls;
  const live=gid(w.s3svg(w.sceneOfPlan().sc,{cam:CAM,look:'model',gid:'s3bg',hint:false,labelScale:LS}).html);
  ok(gid(w.sketchData(cur2).container)===live,'sketch of the open form == the 3D of the open form (identical SVG)');
  w.plans=[saved];w.loadPlan('PTM-261126-S-007');
  const calcRaw=d.getElementById('sim3d').innerHTML,calcSvg=gid(calcRaw);
  w.newPlan();w.openBooking('PTM-261126-S-007');
  const bkSvg=gid(d.getElementById('bk3d').innerHTML);
  ok(w.sceneOfPlan(saved).st.pls.some(x=>x.kind==='mix')&&calcSvg.length>5000&&calcSvg===bkSvg,'Delivery Booking 3D == WH Calculate 3D of the same saved plan (identical SVG, even for rows saved in another order)');
  const viaDom=h=>{const s=d.createElementNS('http://www.w3.org/2000/svg','svg');s.innerHTML=h;return s.innerHTML};    // same serialisation as the on-screen <svg>
  const Dsv=w.sketchData(saved),inCtx=f=>w.withPlanCtx(saved,()=>w.s3svg(w.sceneOfPlan().sc,f({cam:CAM,look:'model',gid:'s3bg',hint:false})).html);   // the renderer, run with the saved plan loaded
  ok(gid(viaDom(Dsv.container))===gid(viaDom(inCtx(o=>Object.assign({labelScale:Dsv.ls},o)))),'Print Sketch picture == the shared 3D renderer with the default camera (only the label size differs)');
  ok(gid(viaDom(inCtx(o=>o)))===calcSvg,'WH Calculate / Booking open at the SAME default camera (-24° / 37°) as the Print Sketch');
  const strip=x=>x.replace(/<g class="s3lab"[\s\S]*?<\/g>/g,'').replace(/<line [^>]*>(<\/line>)?<circle [^>]*>(<\/circle>)?/g,'').replace(/font-size="[\d.]+"/g,'');
  ok(strip(gid(viaDom(Dsv.container)))===strip(calcSvg.replace(/<text[^>]*>ลากเพื่อหมุน[^<]*<\/text>/,'')),'apart from labels, the Print Sketch picture is IDENTICAL to the WH Calculate picture (same boxes, same colours)');
  ok(/-24° \/ 37°/.test(calcRaw),'WH Calculate opens at the default view angle -24° / 37°');
  const ids=w.sceneOfPlan(saved).st.pls.map(x=>x.seq+':'+x.kind+':'+x.label).join();
  w.loadPlan('PTM-261126-S-007');ok(w.planStacking().pls.map(x=>x.seq+':'+x.kind+':'+x.label).join()===ids,'Pallet No. / Mix Pallet / Pallet เศษ numbering is the same in every view');
  w.closeModal('bookModal');w.newPlan();

  // ---------- Delivery Board: compact ----------
  ok(/#deliveryBoard \.kpis\{grid-template-columns:none;grid-auto-flow:column/.test(css),'KPI cards: one row (grid-auto-flow: column)');
  ok(Number(/#deliveryBoard \.daycard\{flex:0 0 (\d+)px/.exec(css)[1])<=96&&Number(/#deliveryBoard \.daycard \.dn\{font-size:(\d+)px/.exec(css)[1])<=22,'date boxes are smaller (<= 96 px wide, day number <= 22 px)');
  w.plans=[];w.renderDeliveryBoard();
  ok(d.querySelectorAll('#deliveryBoard .kpis .kpi').length===8,'8 KPI cards sit in the single row');
  console.log(fail?'FAILED '+fail:'ALL PASSED');process.exit(fail?1:0);
})();
