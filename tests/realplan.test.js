// v3.2: a container with MANY Models must read as many Models everywhere (labels, floor plan, summary).
// Fixture = the real saved plan CLC-1795687867851 (6 Models, 23 pallets, 3 stacked pairs, 6 remainder pallets), printed through printSketchPlan().
const {JSDOM}=require('jsdom');const fs=require('fs');const path=require('path');
const html=fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8');
let fail=0;const ok=(c,m)=>{console.log((c?'PASS ':'FAIL ')+m);if(!c)fail++};
const dom=new JSDOM(html,{runScripts:'dangerously',pretendToBeVisual:true,url:'https://clc.test/'});
const w=dom.window,d=w.document;w.alert=()=>{};w.confirm=()=>true;
const printed=[];w.open=()=>({document:{open(){},write(h){printed.push(h)},close(){}},closed:false});
const M=['AVH-1259ZY/XNJP','AVH-1969ZY/XNJP','AVH-2369ZY/XNJP','AVH-2069ZY/XNJP','AVH-2269ZY/XNJP','AVH-2459ZY/XNJP'],CODE=['1259ZY','1969ZY','2369ZY','2069ZY','2269ZY','2459ZY'];
const base=(model,o)=>Object.assign({name:'COLOR MONITOR W/TUNER AMP FOR CAR',ctnNo:32,netKg:218.88,stack:'Y',remark:'',cartonD:42.8,cartonH:27.5,cartonW:61.9,packStd:4,palletD:110,palletH:244,palletW:110,mixGroup:'N',netKgCtn:6.84,grossLine:215.8,qtyPallet:128,grossKgCtn:8.7,isRemainder:false,packingModel:model,grossKgPallet:208.8,shipmentModel:model},o);
const solo=(m,skid,tot,qb,bl)=>base(m,{skidNo:skid,skidTotal:tot,qtyBefore:qb,blDiff:bl});
const mix=(m,g,tot,qb,bl)=>base(m,{ctnNo:16,netKg:109.44,palletH:117,qtyPallet:64,grossLine:111.4,grossKgPallet:104.4,skidNo:g,mixGroup:g,skidTotal:tot,qtyBefore:qb,blDiff:bl,isRemainder:true});
const A=[solo(M[0],1,2,192,64),solo(M[1],1,4,448,320),solo(M[1],2,4,320,192),solo(M[1],3,4,192,64),solo(M[2],1,2,192,64)];
[1216,1088,960,832,704,576,448,320,192].forEach((q,i)=>A.push(solo(M[4],i+1,10,q,q-128)));
A.push(solo(M[5],1,4,384,256),solo(M[5],2,4,256,128),solo(M[5],3,4,128,0));
A.push(mix(M[0],'Mix Pallet 1',2,64,0),mix(M[5],'Mix Pallet 1 (6)',4,448,384),mix(M[4],'Mix Pallet 1 (5)',10,64,0),mix(M[3],'Mix Pallet 1 (4)',1,64,0),mix(M[2],'Mix Pallet 1 (3)',2,64,0),mix(M[1],'Mix Pallet 1 (2)',4,64,0));
const models=[[M[0],192],[M[1],448],[M[2],192],[M[3],64],[M[4],1352,1216],[M[5],448]].map(x=>({model:x[0],planQty:x[1],actualQty:x[2]||null,packingModel:x[0]}));
const textOf=h=>h.replace(/<style[\s\S]*?<\/style>/g,'').replace(/<script[\s\S]*?<\/script>/g,'').replace(/<[^>]+>/g,' ');
setTimeout(()=>{
  w.parts=M.map(m=>({model:m,description:'COLOR MONITOR W/TUNER AMP FOR CAR',qtyCarton:4,cartonW:61.9,cartonH:27.5,cartonD:42.8,grossCarton:8.7,qtyPallet:64,palletW:110,palletH:122,palletD:110,grossPallet:104.4,netPC:1.71}));
  const plan={planId:'CLC-1795687867851',requestDate:'2026-11-23',etd:'2026-11-26',deliveryTime:'',orderType:'',shipBy:'Sea',destination:'',port:'',models,allocations:A,
    summary:{cbm:58.685,ctn:640,net:4377.6,qty:2560,tare:161,contH:269,gross:4337,models:6,pallets:23,stackOn:true,floorCap:20,floorUsed:20,stackPairs:3,containerType:'40HC'}};
  w.plans=[plan];w.printSketchPlan('CLC-1795687867851');
  const h=printed[0]||'',D=w.sketchData(plan),T=textOf(h);
  ok(D.st.physical===23&&D.models.length===6,'the real plan: 23 pallets, 6 Models');
  // 1. the container picture names the Model of every pallet
  const labs=[...D.container.matchAll(/<g class="s3lab"[^>]*>([\s\S]*?)<\/g>/g)].map(m=>[...m[1].matchAll(/<text[^>]*>([^<]*)<\/text>/g)].map(x=>x[1]).join(' | '));
  ok(labs.length===20&&labs.every(l=>CODE.some(c=>l.includes(c))),'every label in the container (20 positions) names a Model code ('+labs.slice(0,3).join(' ¦ ')+' …)');
  ok(CODE.every(c=>labs.some(l=>l.includes(c))),'all 6 Models are written on the container picture');
  const rects=[...D.container.matchAll(/<g class="s3lab"[^>]*>[\s\S]*?<rect x="([\d.-]+)" y="([\d.-]+)" width="([\d.]+)" height="([\d.]+)"/g)].map(m=>m.slice(1).map(Number));
  let hit=0;for(let i=0;i<rects.length;i++)for(let j=i+1;j<rects.length;j++){const a=rects[i],b=rects[j];if(a[0]<b[0]+b[2]&&b[0]<a[0]+a[2]&&a[1]<b[1]+b[3]&&b[1]<a[1]+a[3])hit++}
  ok(hit===0,'the bigger, longer labels never cover each other ('+rects.length+' labels)');
  // 2. floor plan
  ok(CODE.every(c=>D.plan.includes('>'+c))&&/×2/.test(D.plan),'the floor plan names the Model in every cell');
  // 3. summary: Model -> Pallet No.
  const want={[M[0]]:'1, 18',[M[1]]:'2–4, 23',[M[2]]:'5, 22',[M[3]]:'21',[M[4]]:'6–14, 20',[M[5]]:'15–17, 19'};
  ok(M.every(m=>T.includes(m)&&T.includes(D.models.find(x=>x.model===m).qty.toLocaleString('en-US')+' pcs · No. '+want[m])),'summary lists every Model with the Pallet No. it is on ('+M.map(m=>want[m]).join(' / ')+')');
  ok(D.models.flatMap(m=>m.seqs).filter((s,i,a)=>a.indexOf(s)===i).length===23,'together the Models cover all 23 pallets');
  // 4. cards: one per pallet type, each with its Model and layers
  ok((h.match(/class="pc"/g)||[]).length===11&&M.every(m=>(T.match(new RegExp(m.replace(/[\/]/g,'\\/')+' ×','g'))||[]).length>=1),'11 pallet cards, each names its Model');
  ok((h.match(/<main class="sheet sk">/g)||[]).length===1,'all of it on ONE A4 sheet');
  // 5. the short code
  const f=(a,s)=>w.modelShortFn(a,s);
  ok(f(M,true)(M[0])==='1259ZY'&&f(M,false)(M[0])==='AVH-1259ZY','short code: family prefix stripped when still unique ("1259ZY"), "AVH-1259ZY" otherwise');
  ok(f(['AVH-1259ZY/XNJP','NVF-1259ZY/XNJP'],true)('NVF-1259ZY/XNJP')==='NVF-1259ZY','two families with the same number: the family stays');
  ok(f(['AVH-1259ZY/XNJP','AVH-1259ZY/XNEU'],true)('AVH-1259ZY/XNEU')==='AVH-1259ZY/XNEU','same code for different destinations: the full Model code is written');
  // 6. the same picture elsewhere: Booking and WH Calculate draw the same labels
  w.openBooking('CLC-1795687867851');
  const bk=d.getElementById('bk3d').innerHTML;
  ok(CODE.every(c=>bk.includes(c)),'Delivery Booking 3D names the Models too (same renderer)');
  console.log(fail?'FAILED '+fail:'ALL PASSED');process.exit(fail?1:0);
},300);
