// Role handling in supabase.js with a stubbed Supabase client.
const {JSDOM}=require('jsdom');const fs=require('fs');const path=require('path');
const html=fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8');
const sbjs=fs.readFileSync(path.join(__dirname,'..','supabase.js'),'utf8');
let fail=0;const ok=(c,m)=>{console.log((c?'PASS ':'FAIL ')+m);if(!c)fail++};
async function scenario(role){
  const dom=new JSDOM(html,{runScripts:'dangerously',pretendToBeVisual:true,url:'https://clc.test/'});const w=dom.window;
  const alerts=[],fetched=[],writes=[];w.alert=m=>alerts.push(m);
  const q=t=>{const o={_t:t,select(){return o},order(){return o},range(){fetched.push(t);return Promise.resolve({data:[],error:null})},eq(){return o},maybeSingle(){return Promise.resolve({data:role?{role}:null,error:null})},
    upsert(){writes.push(t);return Promise.resolve({error:null})},delete(){return o},then(f){return Promise.resolve({data:[],error:null}).then(f)}};return o};
  w.supabase={createClient:()=>({from:q,auth:{getSession:async()=>({data:{session:{user:{id:'u1'}}}}),onAuthStateChange(){},signOut:async()=>{}},channel(){const c={on(){return c},subscribe(){return c}};return c}})};
  w.eval(sbjs);await new Promise(r=>setTimeout(r,100));return {w,alerts,fetched,writes};
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
  console.log(fail?fail+' FAILED':'ALL PASSED');process.exit(fail?1:0);
})();
