// Trip date on the Delivery Board = FG Ship Container Date (ETD PTM); Plan ID = company-YYMMDD-mode-running no. (cloud + local save).
const {JSDOM}=require('jsdom');const fs=require('fs');const path=require('path');
const html=fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8');
const sbjs=fs.readFileSync(path.join(__dirname,'..','supabase.js'),'utf8');
let fail=0;const ok=(c,m)=>{console.log((c?'PASS ':'FAIL ')+m);if(!c)fail++};
const part=(model,o)=>Object.assign({model,description:model,qtyCarton:10,cartonD:40,cartonW:30,cartonH:25,qtyPallet:200,palletD:110,palletW:110,palletH:125,netPC:1.2,grossCarton:13,grossPallet:260},o||{});

// cloud scenario: signed-in admin, stub client; dbIds = plan ids already in the database (not visible in the page), dup = how many inserts are rejected as duplicates
async function cloud(dbIds,dup){
  const dom=new JSDOM(html,{runScripts:'dangerously',pretendToBeVisual:true,url:'https://clc.test/'});const w=dom.window;
  const alerts=[],inserts=[],upserts=[],st={dup:dup||0};w.alert=m=>alerts.push(m);w.confirm=()=>true;
  const q=t=>{const o={select(){return o},order(){return o},range(){return Promise.resolve({data:[],error:null})},eq(){return o},
    maybeSingle(){return Promise.resolve({data:{role:'admin'},error:null})},
    like(c,pat){const pre=pat.replace(/%$/,'');return Promise.resolve({data:dbIds.filter(x=>x.startsWith(pre)).map(x=>({plan_id:x})),error:null})},
    insert(r){inserts.push(r);if(st.dup>0){st.dup--;return Promise.resolve({error:{code:'23505',message:'duplicate key'}})}return Promise.resolve({error:null})},
    upsert(r){upserts.push(r);return Promise.resolve({error:null})},delete(){return o},then(f){return Promise.resolve({data:[],error:null}).then(f)}};return o};
  w.supabase={createClient:()=>({from:q,rpc(){return Promise.resolve({data:[],error:null})},auth:{getSession:async()=>({data:{session:{user:{id:'u1'}}}}),onAuthStateChange(){},signOut:async()=>{}},channel(){const c={on(){return c},subscribe(){return c}};return c},removeChannel(){}})};
  w.eval(sbjs);await new Promise(r=>setTimeout(r,120));
  return {w,d:w.document,alerts,inserts,upserts};
}
function fill(s,etd,ship){
  const {w,d}=s;w.parts=[part('A')];w.models=[{model:'A',planQty:200,actualQty:null,packingModel:'A'}];w.generateAllocations();w.renderCalc();
  d.getElementById('planId').value='';d.getElementById('etd').value=etd;d.getElementById('reqDate').value='2026-11-20';
  const sel=d.getElementById('shipBy');sel.innerHTML='<option value=""></option><option>Sea</option><option>Air</option>';sel.value=ship||'';
}

(async()=>{
  const dom=new JSDOM(html,{runScripts:'dangerously',pretendToBeVisual:true,url:'https://clc.test/'});const w=dom.window;
  await new Promise(r=>setTimeout(r,200));
  // ---- Trip date
  const pl={requestDate:'2026-11-20',etd:'2026-11-30'};
  ok(w.planDay(pl)==='2026-11-30'&&w.planDayIsEtd(pl),'Delivery Board day = FG Ship Container Date (ETD PTM), not Log Request Container Date');
  ok(w.planDay({requestDate:'2026-11-20',etd:''})==='2026-11-20'&&!w.planDayIsEtd({requestDate:'2026-11-20'}),'a plan without ETD falls back to Log Request Container Date');
  ok(w.planDay({etd:'',requestDate:''})==='','no date at all -> not on the board');
  w.plans=[{planId:'E1',requestDate:'2026-11-20',etd:'2026-11-30',deliveryTime:'09:00',destination:'D',port:'P',shipBy:'Sea',summary:{pallets:2},slides:[]},{planId:'E2',requestDate:'2026-11-30',etd:'2026-12-02',deliveryTime:'10:00',destination:'D',port:'P',shipBy:'Sea',summary:{pallets:1},slides:[]}];
  ok(w.boardRows('2026-11-30',new Date('2026-11-29T00:00:00+07:00')).map(r=>r.p.planId).join()==='E1','board of 30 Nov lists the plan whose ETD is 30 Nov (not the one requested on 30 Nov)');
  ok(w.boardRows('2026-12-02',new Date('2026-11-29T00:00:00+07:00')).map(r=>r.p.planId).join()==='E2','board of 2 Dec lists the plan whose ETD is 2 Dec');
  // ---- nextPlanId (pure)
  const base={etd:'2026-11-30',shipBy:'Sea Freight'};
  ok(w.nextPlanId(base,[])==='PTM-261130-S-001','first plan of the day: PTM-261130-S-001 (company-YYMMDD-mode-run)');
  ok(w.nextPlanId({etd:'2026-11-30',shipBy:'Air'},['PTM-261130-S-001','PTM-261130-S-002','PTM-261129-S-009'])==='PTM-261130-A-003','running no. continues through the day across modes; other days are ignored');
  ok(w.nextPlanId({etd:'2026-12-01',shipBy:''},['PTM-261130-S-005'])==='PTM-261201-X-001','new day restarts at 001; unknown ship mode = X');
  ok(w.nextPlanId(base,['CLC-1764400000000','PTM-261130-S-001'])==='PTM-261130-S-002','legacy CLC- ids are left alone');
  ok(w.nextPlanId(base,[],5)==='PTM-261130-S-006','retry floor: next number after the one that was rejected');
  const lens=new Set([w.nextPlanId(base,[]),w.nextPlanId({etd:'2027-02-03',shipBy:'Air'},['PTM-270203-A-041']),w.nextPlanId({etd:'',requestDate:'2026-11-20',shipBy:''},[])].map(x=>x.length));
  ok(lens.size===1&&[...lens][0]===16,'fixed length (16 characters)');
  ok(/^PTM-\d{6}-[SAX]-\d{3}$/.test(w.nextPlanId({requestDate:'2026-11-20'},[])),'no ETD: the date part uses the request date');
  // ---- local save
  w.alert=()=>{};w.parts=[part('A')];w.models=[{model:'A',planQty:200,actualQty:null,packingModel:'A'}];w.generateAllocations();w.renderCalc();
  const d=w.document;d.getElementById('planId').value='';d.getElementById('etd').value='2026-11-30';
  const sel=d.getElementById('shipBy');sel.innerHTML='<option></option><option>Sea</option>';sel.value='Sea';
  w.plans=[{planId:'PTM-261130-S-001',etd:'2026-11-30',slides:[]}];
  w.savePlan();
  ok(d.getElementById('planId').value==='PTM-261130-S-002'&&w.plans.some(p=>p.planId==='PTM-261130-S-002'),'local save: new plan gets the next running no. (PTM-261130-S-002)');
  w.savePlan();ok(w.plans.filter(p=>p.planId==='PTM-261130-S-002').length===1&&d.getElementById('planId').value==='PTM-261130-S-002','saving the same plan again keeps its Plan ID (no new number)');
  // ---- cloud save: number is taken from the database, duplicates retry
  let s=await cloud(['PTM-261130-S-001','PTM-261130-S-002','PTM-261130-S-007'],0);fill(s,'2026-11-30','Sea');await s.w.savePlan();
  ok(s.inserts.length===1&&s.inserts[0].plan_id==='PTM-261130-S-008'&&s.upserts.length===0,'cloud: reads the highest running no. of the day from the database (not only what this browser sees) -> PTM-261130-S-008, inserted (not upserted)');
  ok(s.d.getElementById('planId').value==='PTM-261130-S-008'&&s.alerts.some(a=>/PTM-261130-S-008/.test(a)&&/Delivery Board วันที่ 2026-11-30 \(ETD PTM\)/.test(a)),'cloud: Plan ID shown in the form and in the message; message names the ETD board day');
  s=await cloud([],2);fill(s,'2026-11-30','Air');await s.w.savePlan();
  ok(s.inserts.map(x=>x.plan_id).join()==='PTM-261130-A-001,PTM-261130-A-002,PTM-261130-A-003'&&s.d.getElementById('planId').value==='PTM-261130-A-003','cloud: two duplicate-key rejections (someone saved at the same time) -> retries with 002, then 003');
  s=await cloud([],0);fill(s,'2026-11-30','Sea');await s.w.savePlan();const first=s.d.getElementById('planId').value;
  s.w.plans=s.w.plans;s.inserts.length=0;await s.w.savePlan();
  ok(s.inserts.length===0&&s.upserts.length===1&&s.upserts[0].plan_id===first,'cloud: editing an existing plan upserts under the same Plan ID');
  s=await cloud([],0);fill(s,'','Sea');s.d.getElementById('reqDate').value='2026-11-20';await s.w.savePlan();
  ok(s.inserts[0].plan_id==='PTM-261120-S-001'&&s.alerts.some(a=>/ไม่มี ETD PTM/.test(a)),'cloud: no ETD -> Plan ID from the request date and the message says the board uses the request date');
  console.log(fail?fail+' FAILED':'ALL PASSED');process.exit(fail?1:0);
})();
