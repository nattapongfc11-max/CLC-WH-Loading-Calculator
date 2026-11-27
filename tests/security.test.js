// v3.3 security hardening: pinned + SRI-protected supabase-js, no inline-handler injection, no HTML injection through any user-controlled text,
// Content-Security-Policy, MFA gate. Run: node tests/security.test.js
const {JSDOM}=require('jsdom');const fs=require('fs');const path=require('path');const crypto=require('crypto');
const root=path.join(__dirname,'..');
const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
const sbjs=fs.readFileSync(path.join(root,'supabase.js'),'utf8');
let fail=0;const ok=(c,m)=>{console.log((c?'PASS ':'FAIL ')+m);if(!c)fail++};
const sleep=ms=>new Promise(r=>setTimeout(r,ms));

// ---------------------------------------------------------------- 1. supply chain: the library is pinned, hosted here, and protected by an SRI hash
{
  const m=/<script src="(\.\/vendor\/supabase-js-(\d+\.\d+\.\d+)\.umd\.js)" integrity="(sha384-[A-Za-z0-9+/=]+)"/.exec(html);
  ok(!!m,'supabase-js is loaded from ./vendor/ with an exact version and an integrity attribute');
  if(m){
    const file=fs.readFileSync(path.join(root,m[1]));
    ok('sha384-'+crypto.createHash('sha384').update(file).digest('base64')===m[3],'integrity hash in index.html equals the sha384 of the vendored file');
    ok(/^var supabase=/.test(file.toString('utf8',0,40)),'vendored file defines the global `supabase` that supabase.js expects');
    ok(fs.existsSync(path.join(root,'vendor','supabase-js.LICENSE')),'licence of the vendored library is kept');
    ok(new RegExp(m[2].replace(/\./g,'\\.')).test(fs.readFileSync(path.join(root,'vendor','README.md'),'utf8')),'vendor/README.md documents the pinned version');
  }
  const ext=[...html.matchAll(/<(?:script|link|img|iframe)\b[^>]*\b(?:src|href)="(?:https?:)?\/\/[^"]+|@import\s+url\(['"]?https?:|url\(['"]?https?:\/\/(?!www\.w3\.org)/gi)].map(x=>x[0].slice(0,70));
  ok(!ext.length,'no external script / stylesheet / frame is loaded by index.html'+(ext.length?' → '+ext.join(' | '):''));
  ok(!/cdn\.jsdelivr|unpkg\.com|cdnjs/i.test(html+sbjs),'no CDN host is referenced in the code');
}

// ---------------------------------------------------------------- 2. secrets
{
  ok(!/service_role|cfat_|cfut_|R2_SECRET_ACCESS_KEY\s*[:=]\s*['"][A-Za-z0-9]{20,}|eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\./.test(html+sbjs),'no service_role key, Cloudflare token, R2 secret or JWT is committed in the client code');
  ok(/const CLC_KEY='sb_publishable_/.test(sbjs),'the only key in the client is the publishable (anon-level) key');
}

// ---------------------------------------------------------------- 3. inline handlers must never get a value through esc() inside a JS string
{
  const bad=[...html.matchAll(/\bon[a-z]+="[^"]*(?:\\''\+|\('\$\{esc\()/g)].map(x=>x[0].slice(0,80));
  ok(bad.length===0,'no inline handler puts data into a quoted JS string (use jsq())'+(bad.length?' → '+bad.slice(0,3).join(' | '):''));
  ok(/const jsq=v=>esc\(JSON\.stringify\(/.test(html),'jsq() = esc(JSON.stringify(value)) exists');
}

// ---------------------------------------------------------------- 4. CSP
{
  const m=/<meta http-equiv="Content-Security-Policy" content="([^"]+)"/.exec(html);
  ok(!!m,'index.html carries a Content-Security-Policy');
  if(m){
    const csp={};m[1].split(';').map(s=>s.trim()).filter(Boolean).forEach(s=>{const [k,...v]=s.split(/\s+/);csp[k]=v});
    ok((csp['default-src']||[]).join(' ')==="'none'",'default-src is none (everything not listed is blocked)');
    ok((csp['script-src']||[]).includes("'self'")&&!(csp['script-src']||[]).some(x=>/^https?:|\*/.test(x))&&!(csp['script-src']||[]).includes("'unsafe-eval'"),'script-src: self only, no remote host, no eval');
    ok((csp['connect-src']||[]).some(x=>/^https:\/\/takwoycaniiaesepbmss\.supabase\.co$/.test(x))&&!(csp['connect-src']||[]).includes('*')&&!(csp['connect-src']||[]).includes('https:'),'connect-src is limited to our Supabase project (+ R2) so a stolen token cannot be posted anywhere else');
    ok((csp['connect-src']||[]).some(x=>/r2\.cloudflarestorage\.com$/.test(x)),'connect-src allows the R2 presigned upload host');
    ok((csp['img-src']||[]).some(x=>/r2\.cloudflarestorage\.com$/.test(x))&&(csp['img-src']||[]).includes('data:')&&(csp['img-src']||[]).includes('blob:'),'img-src: self, data:, blob:, R2');
    ok((csp['object-src']||[]).join(' ')==="'none'"&&(csp['base-uri']||[]).join(' ')==="'self'"&&(csp['form-action']||[]).join(' ')==="'self'",'object-src none, base-uri self, form-action self');
    ok(/<meta name="referrer" content="(no-referrer|same-origin|strict-origin|strict-origin-when-cross-origin)">/.test(html),'referrer policy limits what leaks in the Referer header');
  }
}

// ---------------------------------------------------------------- 5. HTML / attribute / handler injection through every user-controlled text
// Payload: breaks out of "..." and '...' attributes, closes tags, opens a <script>, and (J) breaks out of a JS string in an inline handler.
const P='"\'><b data-xss="1">x</b><script data-xss="1">window.__xss=1</script>" data-xss="1" x=" \' data-xss=\'1\' x=\'';
const J='A\');window.__xss=1;//"><i data-xss="1">';
const STR=/"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'/g;
function scan(doc){
  const bad=[];
  doc.querySelectorAll('[data-xss]').forEach(e=>bad.push('<'+e.tagName.toLowerCase()+' data-xss>'));
  doc.querySelectorAll('*').forEach(e=>{for(const a of e.attributes){if(/^on/i.test(a.name)&&/__xss/.test(a.value.replace(STR,'""')))bad.push(e.tagName.toLowerCase()+'@'+a.name+'='+a.value.slice(0,70))}});
  return bad;
}
// control: the scanner really notices an injected handler
{
  const d=new JSDOM('<p onclick="loadPlan(\'A\');window.__xss=1;//\')">x</p><p onclick="loadPlan(&quot;A&#39;);window.__xss=1;//&quot;)">y</p>').window.document;
  const b=scan(d);ok(b.length===1&&/onclick/.test(b[0]),'scanner control: finds a broken-out handler and ignores a properly quoted one');
}

const part=(model,o)=>Object.assign({model,description:model,qtyCarton:4,cartonD:42.8,cartonW:61.9,cartonH:27.5,qtyPallet:64,palletD:110,palletW:110,palletH:125,netPC:1.71,grossCarton:8.7,grossPallet:260},o||{});
function open(){
  const dom=new JSDOM(html,{runScripts:'dangerously',pretendToBeVisual:true,url:'https://clc.test/'});const w=dom.window,d=w.document;
  const printed=[];w.alert=()=>{};w.confirm=()=>true;
  w.open=()=>({document:{open(){},write(h){printed.push(h)},close(){}},closed:false,focus(){},print(){}});
  return {w,d,printed};
}

(async()=>{
  const S=open(),{w,d,printed}=S;await sleep(300);
  const errors=[];const guard=(label,fn)=>{try{return fn()}catch(e){errors.push(label+': '+e.message)}};

  const M=[0,1,2].map(i=>'AVH-'+i+P);
  w.parts=M.map(m=>part(m,{description:P,oem:P,rev:P}));
  w.destinations=[{destination:P,port:P}];w.options=[{category:P,value:P}];
  w.models=M.map(m=>({model:m,planQty:192,actualQty:null,packingModel:m}));
  w.generateAllocations();w.allocations.forEach((a,i)=>w.setStack(i,'Y'));w.renderCalc();
  const base=w.makePlan();
  const mk=(id,extra)=>Object.assign(JSON.parse(JSON.stringify(base)),{planId:id,requestDate:'2026-11-20',etd:'2026-12-03',deliveryTime:'09:30',orderType:P,shipBy:P,shipmentType:P,destination:P,port:P,remark:P,updatedAt:'2026-11-26T10:00:00Z'},extra||{});
  const bk={driver:P,subTruck:P,truckPlate:P,loadingBy:P,containerNo:P,sealNo:P,invoiceNo:P,loadDate:'2026-12-02',loadTime:'08:00',updatedAt:'2026-11-26T11:00:00Z'};
  w.plans=[
    mk(J,{booking:bk,slides:[{fromDate:'2026-12-03',fromTime:'09:30',toDate:'2026-12-04',toTime:'10:00',reason:P,at:'2026-11-26T12:00:00Z'}]}),
    mk('PLAN-B'+P,{cancel:{reason:P,at:'2026-11-26T12:00:00Z'}}),
    mk('PLAN-C',{})
  ];
  // a plan whose date fields are hostile: pages may refuse to draw it, but must never inject
  const hostile=mk('PLAN-D',{requestDate:P,etd:P,deliveryTime:P,booking:Object.assign({},bk,{loadDate:P,loadTime:P})});
  w.plans.push(hostile);

  guard('renderAll',()=>w.renderAll());
  for(const pg of ['dashboard','mgmt','calculate','parts','dest','booking','history','users'])guard('showPage '+pg,()=>w.showPage(pg));
  guard('renderHistory',()=>w.renderHistory());guard('renderParts',()=>w.renderParts());guard('renderDest',()=>w.renderDest());guard('renderDeliveryBoard',()=>w.renderDeliveryBoard());
  guard('openPart',()=>w.openPart(M[0]));guard('openDest',()=>w.openDest(0));
  guard('openBooking J',()=>w.openBooking(J));guard('openBooking C',()=>w.openBooking('PLAN-C'));
  guard('users',()=>w.eval(`UA.users=[{user_id:${JSON.stringify(J)},email:${JSON.stringify(P)},created_at:'2026-11-01T00:00:00Z',last_sign_in_at:null,confirmed:true,role:null,perms:[],updated_at:null},{user_id:'11111111-1111-1111-1111-111111111111',email:${JSON.stringify(P)},created_at:'2026-11-01T00:00:00Z',last_sign_in_at:null,confirmed:true,role:'viewer',perms:['plans.view'],updated_at:null}];UA.loaded=true;renderUsers()`));
  guard('photos',()=>w.eval(`PH.view={1:{url:'https://x.r2.cloudflarestorage.com/a.jpg?X=1'},2:{url:"https://x.test/a'+onerror=window.__xss=1+'.jpg"},3:{url:'javascript:window.__xss=1'}};bkPhotosRender()`));
  guard('renderCalc',()=>w.renderCalc());guard('renderSimLayout',()=>w.renderSimLayout());
  // print documents
  guard('printSketch',()=>w.printSketch());guard('printShipmentSlip',()=>w.printShipmentSlip());
  w.plans.forEach(p=>guard('printDeliveryNote '+p.planId.slice(0,6),()=>w.printDeliveryNote(p.planId)));
  guard('sketchHtml',()=>printed.push(w.sketchHtml(w.plans[0])));

  const pageBad=scan(d);
  ok(pageBad.length===0,'no element, attribute or handler was injected on any page / dialog'+(pageBad.length?' → '+[...new Set(pageBad)].slice(0,4).join(' | '):''));
  const txt=d.body.textContent;
  ok(txt.includes('data-xss')&&txt.split('data-xss').length>12,'the payload is really rendered (as harmless text) in many places — the test is not vacuous ('+(txt.split('data-xss').length-1)+' hits)');
  ok(w.__xss===undefined,'no injected script ran');
  ok(printed.length>=4,'print documents were produced ('+printed.length+')');
  let printBad=[],printTxt=0;
  printed.forEach(h=>{const pd=new JSDOM(String(h)).window.document;printBad=printBad.concat(scan(pd));printTxt+=pd.body.textContent.split('data-xss').length-1});
  ok(printBad.length===0,'no injection in any print document (Sketch, Shipment Slip, Delivery Note — they run on this site\'s origin)'+(printBad.length?' → '+[...new Set(printBad)].slice(0,4).join(' | '):''));
  ok(printTxt>10,'print documents show the payload as text ('+printTxt+' hits)');
  // photo links: only https URLs without quote / bracket characters become a background-image or a window.open target
  const th=[...d.querySelectorAll('#bkPhotoGrid .th')];
  ok(th.length>=3&&th[0].dataset.u==='https://x.r2.cloudflarestorage.com/a.jpg?X=1'&&!th[1].dataset.u&&!th[2].dataset.u&&!th.some(x=>/javascript:|onerror/i.test(x.outerHTML)),'photo slots accept a normal https link and drop javascript: / quote-breaking links');
  ok(errors.length<=2,'renders ran without unexpected errors'+(errors.length?' ('+errors.slice(0,3).join(' | ')+')':''));

  // ---------------------------------------------------------------- 6. two-factor authentication (TOTP) screens, with a stubbed Supabase client
  async function scenario(o){
    const dom=new JSDOM(html,{runScripts:'dangerously',pretendToBeVisual:true,url:'https://clc.test/'});const w=dom.window,d=w.document;
    const calls={fetched:[],roleQ:0,verified:[],enrolled:0,unenrolled:[],signups:0,msgs:[]};w.alert=m=>calls.msgs.push(m);w.confirm=()=>true;
    if(o.noSignup)w.CLC_SIGNUP_ENABLED=false;
    let level=o.level||'aal1';const st={factors:(o.factors||[]).slice()};
    const q=t=>{const x={select(){return x},order(){return x},range(){calls.fetched.push(t);return Promise.resolve({data:[],error:null})},eq(){return x},maybeSingle(){calls.roleQ++;return Promise.resolve({data:{role:'admin'},error:null})},upsert(){return Promise.resolve({error:null})},delete(){return x},then(f){return Promise.resolve({data:[],error:null}).then(f)}};return x};
    const mfa=o.noMfaApi?undefined:{
      getAuthenticatorAssuranceLevel:async()=>o.aalError?({data:null,error:{message:'network down'}}):({data:{currentLevel:level,nextLevel:st.factors.some(f=>f.status==='verified')?'aal2':'aal1'},error:null}),
      listFactors:async()=>({data:{all:st.factors,totp:st.factors.filter(f=>f.factor_type==='totp')},error:null}),
      challengeAndVerify:async({factorId,code})=>{calls.verified.push(code);if(code==='123456'){level='aal2';if(factorId==='f-new')st.factors=[{id:'f-new',factor_type:'totp',status:'verified'}];return{data:{},error:null}}return{data:null,error:{message:'Invalid TOTP code entered'}}},
      enroll:async()=>{calls.enrolled++;return{data:{id:'f-new',totp:{qr_code:o.qr||'data:image/svg+xml;utf-8,<svg xmlns="http://www.w3.org/2000/svg"/>',secret:'JBSWY3DPEHPK3PXP',uri:'otpauth://totp/x'}},error:null}},
      unenroll:async({factorId})=>{calls.unenrolled.push(factorId);st.factors=st.factors.filter(f=>f.id!==factorId);return{data:{},error:null}}};
    w.supabase={createClient:()=>({from:q,rpc(){return Promise.resolve({data:[],error:null})},auth:{getSession:async()=>({data:{session:{user:{id:'u1'}}}}),onAuthStateChange(){},signOut:async()=>{},signUp:async()=>{calls.signups++;return{data:{},error:null}},mfa},channel(){const c={on(){return c},subscribe(){return c}};return c}})};
    w.eval(sbjs);await sleep(150);return {w,d,calls,st};
  }
  const vis=(d,id)=>{const e=d.getElementById(id);return !!e&&e.style.display!=='none'};
  const shown=d=>!d.getElementById('authScreen').classList.contains('auth-hidden');
  const V=[{id:'f1',factor_type:'totp',status:'verified'}];
  {
    let S=await scenario({factors:V,level:'aal1'});
    ok(shown(S.d)&&vis(S.d,'authMfa')&&!vis(S.d,'authLoginBox')&&!vis(S.d,'authActions')&&vis(S.d,'authMfaActions'),'2FA user with a password-only session: the code screen replaces the login form');
    ok(S.calls.roleQ===0&&S.calls.fetched.length===0,'… and NO data is requested (role, parts, plans) before the code is accepted');
    ok(vis(S.d,'authLogout'),'… a Logout button is available on the code screen');
    S.d.getElementById('authMfaCode').value='12ab';await S.w.clcMfaVerify();
    ok(S.calls.verified.length===0&&/6-digit/.test(S.d.getElementById('authError').textContent),'a code that is not 6 digits is rejected locally');
    S.d.getElementById('authMfaCode').value='000000';await S.w.clcMfaVerify();
    ok(S.calls.verified.length===1&&shown(S.d)&&S.calls.roleQ===0&&/Invalid/.test(S.d.getElementById('authError').textContent),'a wrong code keeps the screen locked and shows the error');
    S.d.getElementById('authMfaCode').value='123 456';await S.w.clcMfaVerify();await sleep(80);
    ok(!shown(S.d)&&S.calls.roleQ>=1&&S.calls.fetched.length>0,'the right code (spaces allowed) unlocks the app and loads the data');
    ok(vis(S.d,'clcMfaBtn')||S.d.getElementById('clcMfaBtn').style.display==='inline-flex','the 2FA button is shown in the header after sign-in');
  }
  {
    let S=await scenario({factors:V,level:'aal1',aalError:true});
    ok(shown(S.d)&&S.calls.roleQ===0&&/two-factor/i.test(S.d.getElementById('authError').textContent),'if the 2FA status cannot be checked the app stays locked (fails closed)');
  }
  {
    let S=await scenario({factors:[{id:'u1',factor_type:'totp',status:'unverified'}],level:'aal1'});
    ok(!shown(S.d)&&S.calls.roleQ>=1,'an authenticator that was started but never verified does not lock the user out');
    let T=await scenario({factors:[],level:'aal1'});
    ok(!shown(T.d)&&T.calls.roleQ>=1,'a user without 2FA signs in as before');
    const {w,d,calls}=T;
    await w.clcMfaOpen();
    ok(d.getElementById('mfaModal').classList.contains('open')&&/OFF/.test(d.getElementById('mfaState').textContent)&&vis(d,'mfaOnBtn')&&!vis(d,'mfaOffBtn'),'2FA dialog: shows OFF and offers "Set up"');
    await w.clcMfaStart();
    ok(calls.enrolled===1&&/^data:image\/svg\+xml/.test(d.getElementById('mfaQr').getAttribute('src')||'')&&d.getElementById('mfaSecret').textContent==='JBSWY3DPEHPK3PXP'&&vis(d,'mfaConfirmBtn'),'enrol: QR code + manual key are shown');
    d.getElementById('mfaCode').value='999999';await w.clcMfaConfirm();
    ok(/Invalid/.test(d.getElementById('mfaMsg').textContent)&&!/ON/.test(d.getElementById('mfaState').textContent.replace(/OFF/,'')),'enrol with a wrong code fails and 2FA stays off');
    d.getElementById('mfaCode').value='123456';await w.clcMfaConfirm();
    ok(/2FA is ON/.test(d.getElementById('mfaState').textContent)&&vis(d,'mfaOffBtn')&&d.getElementById('mfaSecret').textContent==='','enrol with the right code turns 2FA on and wipes the key from the page');
    await w.clcMfaOff();
    ok(calls.unenrolled.includes('f-new')&&/OFF/.test(d.getElementById('mfaState').textContent),'"Turn 2FA off" removes the factor');
  }
  {
    let S=await scenario({factors:[],qr:'javascript:window.__xss=1'});await S.w.clcMfaOpen();await S.w.clcMfaStart();
    ok(S.d.getElementById('mfaQr').style.display==='none'&&!S.d.getElementById('mfaQr').getAttribute('src'),'a QR value that is not an SVG data URL is never put into the page');
  }
  {
    let S=await scenario({noMfaApi:true});
    ok(!shown(S.d)&&S.calls.roleQ>=1&&S.d.getElementById('clcMfaBtn').style.display==='none','without the MFA API the app behaves as before and hides the 2FA button');
  }
  // ---------------------------------------------------------------- 7. self sign-up switch
  {
    let S=await scenario({noSignup:true,factors:[]});
    S.d.getElementById('authEmail').value='x@y.z';S.d.getElementById('authPassword').value='longenough1';await S.w.clcSignUp();
    ok(S.calls.signups===0&&/closed/i.test(S.d.getElementById('authError').textContent),'CLC_SIGNUP_ENABLED=false: Create account does nothing but explain');
    S.w.clcSignOut&&await S.w.clcSignOut();
    ok(S.d.getElementById('authSignUpBtn').style.display==='none','… and the button is hidden on the login screen');
    let T=await scenario({factors:[]});T.d.getElementById('authEmail').value='x@y.z';T.d.getElementById('authPassword').value='longenough1';await T.w.clcSignUp();
    ok(T.calls.signups===1,'default: Create account still works');
  }
  console.log(fail?'\nFAILED: '+fail:'\nAll security checks passed');process.exit(fail?1:0);
})();
