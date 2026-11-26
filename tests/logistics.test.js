// Logistics permissions: cannot edit a saved plan ("1. Shipment Information", models, pallet allocation) or the Part & Packing Master,
// but can create a new plan and Slide / Cancel / set the preparation status (through the database function plan_delivery_update).
const {JSDOM}=require('jsdom');const fs=require('fs');const path=require('path');
const html=fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8');
const sbjs=fs.readFileSync(path.join(__dirname,'..','supabase.js'),'utf8');
let fail=0;const ok=(c,m)=>{console.log((c?'PASS ':'FAIL ')+m);if(!c)fail++};
const part=(model,o)=>Object.assign({model,description:model,qtyCarton:10,cartonD:40,cartonW:30,cartonH:25,qtyPallet:200,palletD:110,palletW:110,palletH:125,netPC:1.2,grossCarton:13,grossPallet:260},o||{});

// signed-in user with a role (+ optional per-user perms); stub Supabase client records inserts / upserts / rpc calls
async function scenario(role,perms,opt){opt=opt||{};
  const dom=new JSDOM(html,{runScripts:'dangerously',pretendToBeVisual:true,url:'https://clc.test/'});const w=dom.window;
  const alerts=[],inserts=[],upserts=[],rpcs=[];w.alert=m=>alerts.push(m);w.confirm=()=>true;
  const q=t=>{const o={select(){return o},order(){return o},range(){return Promise.resolve({data:[],error:null})},eq(){return o},like(){return Promise.resolve({data:[],error:null})},
    maybeSingle(){return Promise.resolve({data:perms===undefined?{role}:{role,perms},error:null})},
    insert(r){inserts.push({t,r});return Promise.resolve({error:null})},upsert(r){upserts.push({t,r});return Promise.resolve({error:null})},delete(){return o},then(f){return Promise.resolve({data:[],error:null}).then(f)}};return o};
  w.supabase={createClient:()=>({from:q,rpc(n,a){rpcs.push({n,a});return Promise.resolve({data:null,error:opt.rpcError?{message:opt.rpcError}:null})},auth:{getSession:async()=>({data:{session:{user:{id:'u1'}}}}),onAuthStateChange(){},signOut:async()=>{}},channel(){const c={on(){return c},subscribe(){return c}};return c},removeChannel(){}})};
  w.eval(sbjs);await new Promise(r=>setTimeout(r,120));
  return {w,d:w.document,alerts,inserts,upserts,rpcs};
}
const LOGI=['plans.view','plans.create','plans.slide','plans.delete_own','parts.view','masters.view','masters.edit','masters.delete','photos.view','photos.edit'];
function fill(s){
  const {w,d}=s;w.parts=[part('A')];w.models=[{model:'A',planQty:200,actualQty:null,packingModel:'A'}];w.generateAllocations();w.renderCalc();
  d.getElementById('planId').value='';d.getElementById('etd').value='2026-12-01';d.getElementById('reqDate').value='2026-11-20';
  const sel=d.getElementById('shipBy');sel.innerHTML='<option value=""></option><option>Sea</option>';sel.value='Sea';
}
const savedPlan=(over)=>Object.assign({planId:'PTM-261201-S-001',requestDate:'2026-11-20',etd:'2026-12-01',deliveryTime:'09:00',destination:'D',port:'P',shipBy:'Sea',summary:{pallets:2,gross:500},slides:[],createdBy:'someone',models:[],allocations:[]},over||{});

(async()=>{
  // ---- permission helpers on the page ----
  let s=await scenario('logistics');
  ok(s.w.clcCan('plans.create')&&s.w.clcCan('plans.slide')&&!s.w.clcCan('plans.edit')&&!s.w.clcCan('parts.edit'),'logistics template: create + Slide/Cancel, not edit saved plans, not edit Part Master');
  ok(s.w.planEditable()===true&&s.w.canSlide()===true,'a NEW plan is editable for logistics (they enter Shipment Information of new plans)');
  s.d.getElementById('planId').value='PTM-261201-S-001';
  ok(s.w.planEditable()===false&&s.w.canSlide()===true,'a SAVED plan is not editable for logistics, but Slide / Cancel is allowed');
  s.d.getElementById('planId').value='';

  // ---- Calculate page: saved plan is read-only ----
  s=await scenario('logistics');fill(s);const {w,d}=s;
  d.getElementById('planId').value='PTM-261201-S-001';w.applyPlanAccess();
  const cards=[...d.querySelectorAll('#calculate > .card')];
  const dis=c=>[...c.querySelectorAll('input,select,textarea,button')].filter(e=>e.disabled).length,tot=c=>c.querySelectorAll('input,select,textarea,button').length;
  ok(dis(cards[0])===tot(cards[0])&&tot(cards[0])>5,'saved plan: every field of "1. Shipment Information" is disabled');
  ok(dis(cards[1])===tot(cards[1]),'saved plan: Shipment Models card is read-only');
  ok([...d.querySelectorAll('#allocations input,#allocations select,#allocations button')].every(e=>e.disabled),'saved plan: Pallet Allocation inputs are read-only');
  ok(d.getElementById('planLockNote').style.display!=='none'&&d.getElementById('savePlanBtn').disabled,'saved plan: lock banner shown and Save disabled');
  // new plan: unlocks again (and only what we locked)
  d.getElementById('planId').value='';w.applyPlanAccess();
  ok(dis(cards[0])===0&&dis(cards[1])===0&&d.getElementById('planLockNote').style.display==='none','new plan: fields unlocked again, banner hidden');
  ok(![...d.querySelectorAll('#allocations input')].some(e=>e.disabled),'new plan: pallet allocation editable again');

  // ---- Part Master: read-only for logistics ----
  ok(d.getElementById('partAddBtn').style.display==='none','logistics: "Add Part" button hidden');
  await w.savePart();ok(s.alerts.some(a=>/Your role cannot/.test(a))&&!s.upserts.some(x=>x.t==='part_master'),'logistics: saving a part is refused (and nothing is written)');
  w.parts=[part('A')];w.renderParts();
  const tb=[...d.querySelectorAll('#partTable button')].map(b=>b.textContent.trim());
  ok(tb.length===0,'logistics: no Edit / Delete buttons on the Part table (rows: '+d.querySelectorAll('#partTable tbody tr').length+')');
  const wh=await scenario('warehouse');wh.w.parts=[part('A')];wh.w.renderParts();
  ok([...wh.d.querySelectorAll('#partTable button')].map(b=>b.textContent.trim()).join()==='Edit,Delete'&&wh.d.getElementById('partAddBtn').style.display!=='none','warehouse (parts.edit/delete): Edit / Delete / Add Part still available');

  // ---- Save: create allowed, edit refused ----
  s=await scenario('logistics');fill(s);
  await s.w.savePlan();
  ok(s.inserts.some(x=>x.t==='shipment_plans')&&!s.alerts.some(a=>/ไม่ได้|cannot/i.test(a)),'logistics can save a NEW plan (insert) — no permission message');
  ok(s.d.getElementById('planId').value===''&&s.w.models.length===0,'after Save the form is cleared to New');
  s=await scenario('logistics');fill(s);s.w.plans=[savedPlan()];s.d.getElementById('planId').value='PTM-261201-S-001';
  await s.w.savePlan();
  ok(s.upserts.length===0&&s.inserts.length===0&&s.alerts.some(a=>/แก้ไขแผนที่บันทึกแล้วไม่ได้/.test(a)),'logistics cannot save changes to a SAVED plan (clear message, nothing written)');

  // ---- Slide / Cancel / prep: through plan_delivery_update only ----
  s=await scenario('logistics');s.w.CLC_STATE.plans=[savedPlan()];
  const p=s.w.CLC_STATE.plans[0];p.slides=[{toDate:'2026-12-03',toTime:'10:00',reason:'ลูกค้าขอเลื่อน'}];p.prep='ready';p.cancel=undefined;
  const r=await s.w.savePlanRecord(p);
  ok(r===true&&s.rpcs.length===1&&s.rpcs[0].n==='plan_delivery_update'&&s.rpcs[0].a.p_plan_id==='PTM-261201-S-001','logistics Slide: saved through the RPC plan_delivery_update');
  ok(JSON.stringify(Object.keys(s.rpcs[0].a.p_patch).sort())===JSON.stringify(['booking','cancel','photoReq','prep','slides'])&&s.rpcs[0].a.p_patch.prep==='ready'&&s.rpcs[0].a.p_patch.slides[0].toDate==='2026-12-03'&&s.rpcs[0].a.p_patch.cancel===null,'the patch carries only delivery fields (undefined -> null removes the key)');
  ok(s.upserts.length===0,'logistics Slide: the plan row itself is NOT upserted (no Shipment Information change possible)');
  // rpc error (migration not applied yet) -> clear hint
  s=await scenario('logistics',undefined,{rpcError:'Could not find the function public.plan_delivery_update'});s.w.CLC_STATE.plans=[savedPlan()];
  const p2=s.w.CLC_STATE.plans[0];p2.prep='ready';
  ok((await s.w.savePlanRecord(p2))===false&&s.alerts.some(a=>/20261127_plans_slide_permission/.test(a)),'RPC missing (migration not run yet): clear message pointing to the migration');
  ok(s.w.CLC_STATE.plans[0]===p2&&!s.w.CLC_STATE.plans.some(x=>x!==p2),'failed RPC does not touch the local plan list');
  // a database refusal (no permission) is shown as is
  s=await scenario('logistics',undefined,{rpcError:'สิทธิ์ของคุณไม่สามารถ Slide / Cancel ได้ (plans.slide)'});s.w.CLC_STATE.plans=[savedPlan()];
  ok((await s.w.savePlanRecord(s.w.CLC_STATE.plans[0]))===false&&s.alerts.some(a=>/plans\.slide/.test(a)),'database refusal is shown to the user');

  // ---- Booking dialog: open for logistics, fields enabled ----
  s=await scenario('logistics');s.w.plans=[savedPlan()];s.w.CLC_STATE.plans=s.w.plans;
  s.w.openBooking('PTM-261201-S-001');
  const bk=[...s.d.querySelectorAll('#bookModal [id^="bk_"]')];
  ok(bk.length>5&&bk.every(e=>!e.disabled),'logistics: booking dialog (Slide / Cancel / prep) is enabled');
  ok(!/ดูอย่างเดียว/.test(s.d.getElementById('bkWarn').textContent),'logistics: no read-only warning in the booking dialog');

  // ---- a viewer: cannot Slide, dialog is read-only ----
  s=await scenario('viewer');s.w.plans=[savedPlan()];s.w.CLC_STATE.plans=s.w.plans;
  ok(s.w.canSlide()===false,'viewer: no Slide / Cancel permission');
  s.w.openBooking('PTM-261201-S-001');
  ok([...s.d.querySelectorAll('#bookModal [id^="bk_"]')].every(e=>e.disabled)&&/ดูอย่างเดียว/.test(s.d.getElementById('bkWarn').textContent),'viewer: booking dialog fields disabled + read-only note');
  s.d.getElementById('planId').value='';
  ok(s.w.planEditable()===false,'viewer cannot create a plan either');
  fill(s);await s.w.savePlan();ok(s.inserts.length===0&&s.alerts.some(a=>/สร้างแผนใหม่ไม่ได้/.test(a)),'viewer: saving a new plan is refused with a clear message');

  // ---- warehouse (plans.edit): can edit saved plans; slide goes through the normal save ----
  s=await scenario('warehouse');fill(s);s.w.plans=[savedPlan()];s.w.CLC_STATE.plans=s.w.plans;
  s.d.getElementById('planId').value='PTM-261201-S-001';s.w.applyPlanAccess();
  ok(s.w.planEditable()===true&&![...s.d.querySelectorAll('#calculate > .card')[0].querySelectorAll('input,select')].some(e=>e.disabled),'warehouse (plans.edit): saved plan stays editable');
  const wp=s.w.CLC_STATE.plans[0];wp.prep='short';
  await s.w.savePlanRecord(wp);
  ok(s.rpcs.length===0&&s.upserts.some(x=>x.t==='shipment_plans'),'plans.edit user: whole-plan upsert (no RPC)');

  // ---- per-user override: slide only, no create ----
  s=await scenario('viewer',['plans.view','plans.slide']);
  ok(s.w.canSlide()===true&&s.w.planEditable()===false,'custom perms plans.slide only: can Slide, cannot edit / create');
  s.d.getElementById('planId').value='';ok(s.w.planEditable()===false,'plans.slide only: cannot create a new plan');

  // ---- admin: everything ----
  s=await scenario('admin');fill(s);s.d.getElementById('planId').value='PTM-261201-S-001';s.w.applyPlanAccess();
  ok(s.w.planEditable()===true&&s.w.canSlide()===true&&s.d.getElementById('planLockNote').style.display==='none','admin: saved plan editable, no lock banner');
  ok(s.d.getElementById('partAddBtn').style.display!=='none','admin: "Add Part" button visible');

  console.log(fail?'FAILED '+fail:'ALL PASSED');process.exit(fail?1:0);
})();
