// Admin "Users" page (Manage User Authorize): list, approve, per-user permissions, remove, and what each permission hides.
const {JSDOM}=require('jsdom');const fs=require('fs');const path=require('path');
const html=fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8');
const dom=new JSDOM(html,{runScripts:'dangerously',pretendToBeVisual:true,url:'https://clc.test/'});
const w=dom.window,d=w.document,errs=[];w.addEventListener('error',e=>errs.push(e.message));
let fail=0;const ok=(c,m)=>{console.log((c?'PASS ':'FAIL ')+m);if(!c)fail++};
let confirmAns=true;w.alert=()=>{};w.confirm=()=>confirmAns;
const $=id=>d.getElementById(id);
const nav=p=>d.querySelector('.navbtn[data-page="'+p+'"]').style.display!=='none';
const ALL=['plans.view','plans.view_own','plans.edit','plans.delete','plans.delete_own','parts.view','parts.edit','parts.delete','masters.view','masters.edit','masters.delete','photos.view','photos.edit'];
const T=w.CLC_ROLE_PERMS,UA=w.eval('UA');
setTimeout(async()=>{
  // ---- role templates mirror the SQL function clc_role_perms() ----
  const sql=fs.readFileSync(path.join(__dirname,'..','supabase','migrations','20261126_user_permissions.sql'),'utf8');
  const sqlTpl=r=>{const m=new RegExp("when '"+r+"' then array\\[([^\\]]*)\\]").exec(sql);return m[1].split(',').map(x=>x.trim().replace(/'/g,''))};
  ok(['admin','logistics','warehouse','viewer'].every(r=>JSON.stringify(sqlTpl(r).sort())===JSON.stringify(T[r].slice().sort())),'UI role templates are identical to clc_role_perms() in the migration');
  ok(JSON.stringify(ALL)===JSON.stringify(w.eval('ALL_PERMS'))&&ALL.every(p=>sql.includes("'"+p+"'")),'permission keys match the SQL check constraint');

  // ---- what each permission shows (menu) ----
  let perms=[];w.clcCan=p=>perms.includes(p);d.body.dataset.role='viewer';
  const pages=()=>['dashboard','mgmt','calculate','parts','dest','booking','history','users'].filter(nav).join(',');
  perms=T.viewer;w.clcApplyAccess();ok(pages()==='dashboard,mgmt,calculate,parts,dest,booking,history','viewer: all data pages, no Users page');
  perms=['plans.view_own'];w.clcApplyAccess();ok(pages()==='dashboard,mgmt,booking,history'&&$('dashboard').classList.contains('active'),'own plans only: no Calculate (needs Part Master), no Part / Destination pages');
  perms=['plans.view','parts.view'];w.clcApplyAccess();ok(pages()==='dashboard,mgmt,calculate,parts,booking,history','plans + parts: Calculate appears, Destination page hidden');
  perms=['masters.view'];w.clcApplyAccess();ok(pages()==='dest'&&$('dest').classList.contains('active')&&!$('dashboard').classList.contains('active'),'only Destination-Port visible: the app switches to that page');
  perms=[];w.clcApplyAccess();ok(pages()===''&&$('noAccess').style.display===''&&![...d.querySelectorAll('.page')].some(x=>x.classList.contains('active')),'no permission at all: nothing visible, "ไม่มีสิทธิ์" message');
  perms=T.warehouse;w.clcApplyAccess();ok($('noAccess').style.display==='none'&&nav('dashboard'),'permissions restored: message hidden');
  d.body.dataset.role='admin';perms=ALL;w.clcApplyAccess();ok(nav('users'),'admin sees the Users page');
  ok(w.phCanWrite()===false||true,'phCanWrite callable');
  perms=['photos.view'];ok(w.phCanWrite()===false,'photos.view only: cannot upload photos');perms=['photos.view','photos.edit'];ok(w.phCanWrite()===true,'photos.edit: can upload photos');

  // ---- Users page ----
  const ME='u-me',U=(id,email,role,perms,extra)=>Object.assign({user_id:id,email,role,perms:perms||[],created_at:'2026-11-20T03:00:00Z',last_sign_in_at:'2026-11-26T05:00:00Z',confirmed:true,updated_at:'2026-11-25T01:00:00Z'},extra||{});
  let users=[U('u-new','new@co.test',null,[],{confirmed:false,last_sign_in_at:null}),U(ME,'boss@co.test','admin',ALL),U('u-wh','wh@co.test','warehouse',T.warehouse),U('u-cu','cust@co.test','viewer',['plans.view_own','plans.edit','plans.delete_own','photos.view'])];
  const log=[];let saveErr=null;
  w.clcAdmin={me:()=>ME,async listUsers(){log.push('list');return users.map(x=>({...x}))},async saveUser(u){log.push('save');if(saveErr)throw new Error(saveErr);log.save=u;const i=users.findIndex(x=>x.user_id===u.user_id);users[i]={...users[i],role:u.role,perms:u.perms}},async removeUser(id){log.push('remove');log.removed=id;users=users.map(x=>x.user_id===id?{...x,role:null,perms:[]}:x)}};
  d.body.dataset.role='viewer';w.showPage('users');await new Promise(r=>setTimeout(r,30));
  ok(!log.includes('list'),'non-admin opening the Users page does not even request the user list');
  d.body.dataset.role='admin';UA.loaded=false;w.showPage('users');await new Promise(r=>setTimeout(r,30));
  ok(log.includes('list')&&/new@co\.test/.test($('uaPending').textContent)&&/ยังไม่ยืนยัน/.test($('uaPending').textContent),'admin: accounts waiting for approval are listed first (with email-confirmed status)');
  const rows=[...d.querySelectorAll('#uaTable tbody tr')];
  ok(rows.length===3&&/boss@co\.test/.test(rows[0].textContent)&&/\(คุณ\)/.test(rows[0].textContent)&&/ทุกอย่าง/.test(rows[0].textContent),'user table: you + 2 users, admin shown as "ทุกอย่าง"');
  ok(/ลบ: แผน \(ของตัวเอง\)/.test(rows[2].textContent)&&/แก้ไข: แผน/.test(rows[2].textContent)&&/ดู: แผน \(ของตัวเอง\), รูป/.test(rows[2].textContent)&&/ปรับเอง/.test(rows[2].textContent)&&!/ปรับเอง/.test(rows[1].textContent),'chips show view / edit / delete scope; "ปรับเอง" only when different from the role template');
  ok(rows[0].querySelector('button.danger').disabled,'cannot remove your own access');
  ok(/viewer/.test($('uaTemplates').textContent)&&/admin/.test($('uaTemplates').textContent),'role templates reference table');
  // approve = role template
  w.uaApprove('u-new');await new Promise(r=>setTimeout(r,30));
  ok(log.save&&log.save.user_id==='u-new'&&log.save.role==='viewer'&&JSON.stringify(log.save.perms)===JSON.stringify(T.viewer),'approve: saves the chosen role with that role\'s default permissions');
  confirmAns=false;log.length=0;$('uaApp_u-new')&&0;
  // open editor for the warehouse user
  confirmAns=true;w.openUserAuth('u-wh');
  ok($('userModal').classList.contains('open')&&$('ua_email').value==='wh@co.test'&&$('ua_role').value==='warehouse','editor opens with the user and role');
  ok($('ua_plans_view').value==='all'&&$('ua_plans_edit').checked&&$('ua_plans_del').value==='own'&&$('ua_parts_edit').checked&&$('ua_parts_del').checked&&!$('ua_masters_edit').checked&&$('ua_photos_edit').checked,'form shows the current permissions');
  // dependencies
  $('ua_parts_view').checked=false;w.uaSync('parts_view');ok(!$('ua_parts_edit').checked&&!$('ua_parts_del').checked,'removing "ดู" also removes edit + delete');
  $('ua_masters_edit').checked=true;w.uaSync('masters_edit');ok($('ua_masters_view').checked,'ticking edit also ticks "ดู"');
  $('ua_plans_view').value='';w.uaSync('plans_view');ok(!$('ua_plans_edit').checked&&$('ua_plans_del').value==='','plans: "ไม่เห็น" clears edit + delete');
  $('ua_plans_del').value='all';w.uaSync('plans_del');ok($('ua_plans_view').value==='all','deleting every plan requires seeing every plan');
  $('ua_plans_view').value='own';w.uaSync('plans_view');ok($('ua_plans_del').value==='own','narrowing view to own plans narrows delete to own');
  $('ua_plans_edit').checked=true;w.uaSync('plans_edit');
  // save custom permissions
  await w.uaSave();
  ok(log.save.role==='warehouse'&&JSON.stringify(log.save.perms.slice().sort())===JSON.stringify(['masters.edit','masters.view','photos.edit','photos.view','plans.delete_own','plans.edit','plans.view_own'])&&!$('userModal').classList.contains('open'),'save writes exactly the ticked permissions and closes');
  ok(/บันทึกสิทธิ์ของ wh@co\.test/.test($('uaMsg').textContent)&&/ปรับเอง/.test([...d.querySelectorAll('#uaTable tbody tr')][2].textContent),'list refreshes: user now marked "ปรับเอง"');
  // role change -> template; admin -> locked + all
  w.openUserAuth('u-cu');$('ua_role').value='logistics';w.uaRoleChanged();
  ok($('ua_masters_del').checked&&!$('ua_parts_edit').checked&&$('ua_plans_del').value==='own','changing role loads that role\'s template');
  $('ua_role').value='admin';w.uaRoleChanged();ok($('ua_plans_view').disabled&&$('ua_plans_del').disabled&&/admin มีสิทธิ์ทั้งหมด/.test($('uaRoleNote').textContent),'admin role: checkboxes locked, note shown');
  await w.uaSave();ok(log.save.user_id==='u-cu'&&log.save.role==='admin'&&log.save.perms.length===13,'saving as admin stores all permissions');
  // nothing ticked
  w.openUserAuth('u-wh');['ua_parts_view','ua_parts_edit','ua_parts_del','ua_masters_view','ua_masters_edit','ua_masters_del','ua_photos_view','ua_photos_edit','ua_plans_edit'].forEach(i=>$(i).checked=false);$('ua_plans_view').value='';$('ua_plans_del').value='';
  log.length=0;await w.uaSave();ok(!log.includes('save')&&/ถอนสิทธิ์/.test($('uaErr').textContent)&&$('userModal').classList.contains('open'),'no permission ticked: refuses to save (use "ถอนสิทธิ์" instead)');
  // database refuses (e.g. last admin) -> message stays in the dialog
  saveErr='ต้องมี admin อย่างน้อย 1 คน';w.uaApplyTemplate();await w.uaSave();ok(/ต้องมี admin อย่างน้อย 1 คน/.test($('uaErr').textContent)&&$('userModal').classList.contains('open')&&!UA.busy,'database error is shown in the dialog (dialog stays open)');saveErr=null;
  w.closeModal('userModal');
  // demoting an admin asks first
  users[1]={...users[1],role:'admin',perms:ALL};w.openUserAuth('u-cu');$('ua_role').value='viewer';w.uaRoleChanged();confirmAns=false;log.length=0;await w.uaSave();ok(!log.includes('save'),'demoting an admin: cancelled confirm saves nothing');confirmAns=true;w.closeModal('userModal');
  // own row: read only
  w.openUserAuth(ME);ok($('ua_role').disabled&&$('uaSave').style.display==='none'&&/ของคุณ/.test($('uaRoleNote').textContent),'your own account: view only (cannot change your own role / permissions)');w.closeModal('userModal');
  // remove access
  log.length=0;await w.uaRemove('u-wh');ok(log.removed==='u-wh'&&/ถอนสิทธิ์ของ wh@co\.test/.test($('uaMsg').textContent),'remove access calls the API and refreshes');
  confirmAns=false;log.length=0;await w.uaRemove('u-cu');ok(!log.includes('remove'),'remove cancelled: nothing happens');confirmAns=true;
  ok(/wh@co\.test/.test($('uaPending').textContent),'removed user is back in "รออนุมัติ"');
  ok(errs.length===0,'no runtime errors '+errs.join('|'));
  console.log(fail?'FAILED '+fail:'ALL PASSED');process.exit(fail?1:0);
},400);
