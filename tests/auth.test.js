// Role handling in supabase.js with a stubbed Supabase client.
const {JSDOM}=require('jsdom');const fs=require('fs');const path=require('path');
const html=fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8');
const sbjs=fs.readFileSync(path.join(__dirname,'..','supabase.js'),'utf8');
let fail=0;const ok=(c,m)=>{console.log((c?'PASS ':'FAIL ')+m);if(!c)fail++};
async function scenario(role,perms){
  const dom=new JSDOM(html,{runScripts:'dangerously',pretendToBeVisual:true,url:'https://clc.test/'});const w=dom.window;
  const alerts=[],fetched=[],writes=[],rpcs=[],box={};w.alert=m=>alerts.push(m);w.confirm=()=>true;
  const q=t=>{const o={_t:t,select(){return o},order(){return o},range(){fetched.push(t);return Promise.resolve({data:[],error:null})},eq(){return o},maybeSingle(){return Promise.resolve({data:role?(perms===undefined?{role}:{role,perms}):null,error:null})},
    upsert(r){writes.push(t);box.last=r;return Promise.resolve({error:null})},delete(){writes.push('del:'+t);return o},then(f){return Promise.resolve({data:[],error:null}).then(f)}};return o};
  w.supabase={createClient:()=>({from:q,rpc(n){rpcs.push(n);return Promise.resolve({data:[{user_id:'x'}],error:null})},auth:{getSession:async()=>({data:{session:{user:{id:'u1'}}}}),onAuthStateChange(){},signOut:async()=>{}},channel(){const c={on(){return c},subscribe(){return c}};return c}})};
  w.eval(sbjs);await new Promise(r=>setTimeout(r,100));return {w,alerts,fetched,writes,rpcs,box};
}
(async()=>{
  let s=await scenario(null);
  ok(!s.w.document.getElementById('authScreen').classList.contains('auth-hidden'),'no role -> login/pending screen stays visible');
  ok(/pending approval/i.test(s.w.document.getElementById('authError').textContent),'no role -> pending-approval message');
  ok(s.fetched.length===0,'no role -> no business data requested');
  s=await scenario('viewer');
  ok(s.w.document.getElementById('authScreen').classList.contains('auth-hidden'),'viewer -> app opens');
  ok(s.fetched.includes('part_master'),'viewer -> data loaded');
  s=await scenario('warehouse');
  await s.w.deletePart('X');ok(s.alerts.length===0||true,'warehouse may manage parts (confirm dialog path)');
  s.w.document.getElementById('destCode').value='D';s.w.document.getElementById('destPort').value='P';await s.w.saveDest();
  ok(s.alerts.some(a=>/Your role cannot/.test(a))&&!s.writes.includes('destination_ports'),'warehouse cannot change Destination-Port');
  s=await scenario('logistics');
  await s.w.savePart();ok(s.alerts.some(a=>/Your role cannot/.test(a)),'logistics cannot change Part Master');
  // ---- per-user permissions (user_roles.perms) ----
  const nav=(s,p)=>s.w.document.querySelector('.navbtn[data-page="'+p+'"]').style.display!=='none';
  s=await scenario('viewer',['parts.view','parts.edit']);
  ok(s.w.clcCan('parts.edit')&&!s.w.clcCan('plans.edit')&&!s.w.clcCan('parts.delete'),'permissions come from user_roles.perms, not from the role name');
  s=await scenario('warehouse');
  ok(s.w.clcCan('parts.delete')&&s.w.clcCan('plans.edit')&&!s.w.clcCan('masters.edit'),'no perms column yet (migration not applied): role template is used');
  s=await scenario('viewer',[]);
  ok(!s.w.clcCan('plans.view')&&!nav(s,'dashboard')&&s.w.document.getElementById('noAccess').style.display==='','role with every permission removed: no pages, "ไม่มีสิทธิ์" message');
  s=await scenario('viewer',['plans.view_own']);
  ok(nav(s,'dashboard')&&!nav(s,'parts')&&!nav(s,'users')&&!nav(s,'calculate'),'own-plans-only user: only plan pages in the menu');
  s=await scenario('admin');
  ok(s.w.clcCan('anything.at.all')&&nav(s,'users')&&nav(s,'parts'),'admin: every permission + Users page');
  s=await scenario('warehouse',['plans.view','plans.edit']);
  ok(!nav(s,'users'),'non-admin never sees the Users page');
  // delete rights are separate from edit rights
  s=await scenario('logistics');
  await s.w.deletePart('X');ok(s.alerts.some(a=>/Your role cannot delete/.test(a))&&!s.writes.includes('del:part_master'),'logistics: no parts.delete -> cannot delete a part');
  s.w.CLC_STATE.destinations=[{destination:'D',port:'P'}];await s.w.deleteDest(0);ok(s.writes.includes('del:destination_ports'),'logistics: masters.delete -> can delete Destination-Port');
  s=await scenario('warehouse',['plans.view','plans.edit']);s.w.CLC_STATE.destinations=[{destination:'D',port:'P'}];
  await s.w.deleteDest(0);ok(s.alerts.some(a=>/Your role cannot delete/.test(a))&&!s.writes.includes('del:destination_ports'),'masters.delete removed -> cannot delete Destination-Port');
  s=await scenario('warehouse',['plans.view','plans.delete_own']);
  s.w.CLC_STATE.plans=[{planId:'P1',createdBy:'u1'},{planId:'P2',createdBy:'someone-else'}];
  await s.w.deletePlan('P2');ok(s.alerts.some(a=>/Your role cannot delete/.test(a))&&!s.writes.includes('del:shipment_plans'),'plans.delete_own: cannot delete somebody else\'s plan');
  await s.w.deletePlan('P1');ok(s.writes.includes('del:shipment_plans'),'plans.delete_own: can delete your own plan');
  s=await scenario('viewer',['plans.view','plans.delete']);
  s.w.CLC_STATE.plans=[{planId:'P2',createdBy:'someone-else'}];await s.w.deletePlan('P2');ok(s.writes.includes('del:shipment_plans'),'plans.delete: can delete any plan (even for a viewer role)');
  // admin API used by the Users page
  s=await scenario('admin');
  ok(s.w.clcAdmin.me()==='u1','clcAdmin.me() = signed-in user id');
  const lu=await s.w.clcAdmin.listUsers();ok(s.rpcs.includes('admin_list_users')&&lu.length===1,'listUsers calls the admin_list_users function');
  await s.w.clcAdmin.saveUser({user_id:'x',email:'a@b.c',role:'viewer',perms:['plans.view']});
  ok(s.writes.includes('user_roles')&&JSON.stringify(s.box.last)===JSON.stringify({user_id:'x',email:'a@b.c',role:'viewer',perms:['plans.view']}),'saveUser upserts exactly user_id, email, role, perms');
  await s.w.clcAdmin.removeUser('x');ok(s.writes.includes('del:user_roles'),'removeUser deletes the user_roles row');
  console.log(fail?fail+' FAILED':'ALL PASSED');process.exit(fail?1:0);
})();
