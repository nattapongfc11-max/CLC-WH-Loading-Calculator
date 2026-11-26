-- RLS test for 20261126_user_permissions.sql. Run AFTER the migration in the SQL editor: it creates fake users, checks every policy
-- as each of them and ALWAYS ends with an exception (so nothing is kept). Expected message: "USER_PERMISSIONS_TEST ... FAILED=0".
do $test$
declare
  admin0 uuid := (select user_id from public.user_roles where role = 'admin' order by created_at limit 1);
  a1 uuid := '00000000-0000-0000-0000-0000000000a1';
  w1 uuid := '00000000-0000-0000-0000-0000000000b1';
  l1 uuid := '00000000-0000-0000-0000-0000000000c1';
  v1 uuid := '00000000-0000-0000-0000-0000000000d1';
  c1 uuid := '00000000-0000-0000-0000-0000000000e1';
  n1 uuid := '00000000-0000-0000-0000-0000000000f1';
  rep text := ''; failed int := 0; part1 text; dp1 text; base int; basep int; basepart int;
begin
  create or replace function pg_temp.t(uid uuid, q text) returns text language plpgsql as $f$
  declare n int;
  begin
    perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
    set local role authenticated;
    execute q; get diagnostics n = row_count;
    reset role; return 'ok:' || n;
  exception when others then
    reset role; return 'err:' || sqlstate;
  end $f$;
  create or replace function pg_temp.chk(label text, got text, want text) returns text language sql as $f$
    select case when got like want then '' else '[FAIL ' || label || ': got ' || got || ' want ' || want || '] ' end $f$;

  insert into auth.users (id, email) values (a1,'a1@t.test'),(w1,'w1@t.test'),(l1,'l1@t.test'),(v1,'v1@t.test'),(c1,'c1@t.test'),(n1,'n1@t.test');
  insert into public.user_roles (user_id, email, role) values (a1,'a1@t.test','admin'),(w1,'w1@t.test','warehouse'),(l1,'l1@t.test','logistics'),(v1,'v1@t.test','viewer');
  insert into public.user_roles (user_id, email, role, perms) values (c1,'c1@t.test','viewer', array['plans.view_own','plans.edit','plans.delete_own','photos.view','photos.edit']);

  -- defaults written by the trigger (old SQL that only passes the role keeps working)
  rep := rep || pg_temp.chk('tpl warehouse', (select array_length(perms,1)::text from public.user_roles where user_id=w1), '9');
  rep := rep || pg_temp.chk('tpl viewer', (select array_length(perms,1)::text from public.user_roles where user_id=v1), '4');
  rep := rep || pg_temp.chk('tpl admin', (select array_length(perms,1)::text from public.user_roles where user_id=a1), '15');  -- 13 before 20261127_plans_slide_permission.sql
  update public.user_roles set role='logistics' where user_id=v1;
  rep := rep || pg_temp.chk('role change follows template', (select (('masters.delete' = any(perms)) and not ('plans.delete' = any(perms)))::text from public.user_roles where user_id=v1), 'true');
  update public.user_roles set role='viewer', perms = public.clc_role_perms('viewer') where user_id=v1;
  rep := rep || pg_temp.chk('bogus perm rejected', pg_temp.t(a1, 'update public.user_roles set perms = array[''bogus''] where user_id = ''' || c1 || ''''), 'err:23514');

  select model into part1 from public.part_master limit 1;
  select destination into dp1 from public.destination_ports limit 1;
  select count(*) into base from public.shipment_plans; select count(*) into basep from public.delivery_photos; select count(*) into basepart from public.part_master;
  insert into public.shipment_plans (plan_id, created_by) values ('T-W', w1), ('T-L', l1), ('T-C', c1), ('T-A', a1);
  insert into public.delivery_photos (plan_id, slot, object_key, bytes) values ('T-C', 1, 'k/tc1', 10), ('T-L', 1, 'k/tl1', 10);

  -- warehouse: plans edit + delete own, parts edit/delete, masters read only
  rep := rep || pg_temp.chk('wh view parts', pg_temp.t(w1, 'select 1 from public.part_master'), 'ok:%');
  rep := rep || pg_temp.chk('wh edit part', pg_temp.t(w1, 'update public.part_master set description = description where model = ' || quote_literal(part1)), 'ok:1');
  rep := rep || pg_temp.chk('wh insert dest blocked', pg_temp.t(w1, 'insert into public.destination_ports (destination, port) values (''zz'',''zz'')'), 'err:42501');
  rep := rep || pg_temp.chk('wh delete dest blocked', pg_temp.t(w1, 'delete from public.destination_ports'), 'ok:0');
  rep := rep || pg_temp.chk('wh delete others plan blocked', pg_temp.t(w1, 'delete from public.shipment_plans where plan_id = ''T-L'''), 'ok:0');
  rep := rep || pg_temp.chk('wh delete own plan', pg_temp.t(w1, 'delete from public.shipment_plans where plan_id = ''T-W'''), 'ok:1');
  rep := rep || pg_temp.chk('wh delete part', pg_temp.t(w1, 'delete from public.part_master where model = ' || quote_literal(part1)), 'ok:1');
  -- logistics: parts read only, masters edit + delete
  rep := rep || pg_temp.chk('lg insert part blocked', pg_temp.t(l1, 'insert into public.part_master (model) values (''ZZ-1'')'), 'err:42501');
  rep := rep || pg_temp.chk('lg delete part blocked', pg_temp.t(l1, 'delete from public.part_master'), 'ok:0');
  rep := rep || pg_temp.chk('lg insert dest', pg_temp.t(l1, 'insert into public.destination_ports (destination, port) values (''zz'',''zz'')'), 'ok:1');
  rep := rep || pg_temp.chk('lg delete dest', pg_temp.t(l1, 'delete from public.destination_ports where destination = ''zz'''), 'ok:1');
  rep := rep || pg_temp.chk('lg delete others plan blocked', pg_temp.t(l1, 'delete from public.shipment_plans where plan_id = ''T-C'''), 'ok:0');
  -- viewer: read only
  rep := rep || pg_temp.chk('vw view plans', pg_temp.t(v1, 'select 1 from public.shipment_plans'), 'ok:' || (base + 3));
  rep := rep || pg_temp.chk('vw insert plan blocked', pg_temp.t(v1, 'insert into public.shipment_plans (plan_id) values (''T-V'')'), 'err:42501');
  rep := rep || pg_temp.chk('vw update plan blocked', pg_temp.t(v1, 'update public.shipment_plans set remark = ''x'''), 'ok:0');
  rep := rep || pg_temp.chk('vw view photos', pg_temp.t(v1, 'select 1 from public.delivery_photos'), 'ok:' || (basep + 2));
  rep := rep || pg_temp.chk('vw cannot change roles', pg_temp.t(v1, 'update public.user_roles set role = ''admin'' where user_id = ''' || v1 || ''''), 'ok:0');
  -- custom user c1: sees ONLY own plans, no parts / masters, edits + deletes own, photos only of visible plans
  rep := rep || pg_temp.chk('c1 sees only own plans', pg_temp.t(c1, 'select 1 from public.shipment_plans'), 'ok:1');
  rep := rep || pg_temp.chk('c1 no parts', pg_temp.t(c1, 'select 1 from public.part_master'), 'ok:0');
  rep := rep || pg_temp.chk('c1 no masters', pg_temp.t(c1, 'select 1 from public.destination_ports'), 'ok:0');
  rep := rep || pg_temp.chk('c1 photos only of own plan', pg_temp.t(c1, 'select 1 from public.delivery_photos'), 'ok:1');
  rep := rep || pg_temp.chk('c1 photo on others plan blocked', pg_temp.t(c1, 'insert into public.delivery_photos (plan_id, slot, object_key, bytes) values (''T-L'', 2, ''k/x'', 10)'), 'err:42501');
  rep := rep || pg_temp.chk('c1 photo on own plan', pg_temp.t(c1, 'insert into public.delivery_photos (plan_id, slot, object_key, bytes) values (''T-C'', 2, ''k/y'', 10)'), 'ok:1');
  rep := rep || pg_temp.chk('c1 delete others plan blocked', pg_temp.t(c1, 'delete from public.shipment_plans where plan_id = ''T-L'''), 'ok:0');
  rep := rep || pg_temp.chk('c1 delete own plan', pg_temp.t(c1, 'delete from public.shipment_plans where plan_id = ''T-C'''), 'ok:1');
  -- pending (no row) sees and changes nothing
  rep := rep || pg_temp.chk('pending sees nothing', pg_temp.t(n1, 'select 1 from public.shipment_plans'), 'ok:0');
  rep := rep || pg_temp.chk('pending no parts', pg_temp.t(n1, 'select 1 from public.part_master'), 'ok:0');
  rep := rep || pg_temp.chk('pending cannot insert', pg_temp.t(n1, 'insert into public.user_roles (user_id, role) values (''' || n1 || ''',''admin'')'), 'err:42501');
  rep := rep || pg_temp.chk('pending cannot list users', pg_temp.t(n1, 'select * from public.admin_list_users()'), 'err:42501');
  -- admin: everything + user list (pending accounts first)
  rep := rep || pg_temp.chk('admin sees all plans', pg_temp.t(a1, 'select 1 from public.shipment_plans'), 'ok:' || (base + 2));
  rep := rep || pg_temp.chk('admin list users', pg_temp.t(a1, 'select * from public.admin_list_users()'), 'ok:%');
  rep := rep || pg_temp.chk('admin list: pending first', (select (u.role is null)::text from public.admin_list_users() u limit 1), 'true');
  rep := rep || pg_temp.chk('non-admin cannot list users', pg_temp.t(w1, 'select * from public.admin_list_users()'), 'err:42501');
  rep := rep || pg_temp.chk('admin sets perms', pg_temp.t(a1, 'update public.user_roles set perms = array[''plans.view''] where user_id = ''' || w1 || ''''), 'ok:1');
  rep := rep || pg_temp.chk('admin stamped updated_by', (select (updated_by = a1)::text from public.user_roles where user_id = w1), 'true');
  -- last admin cannot be removed / demoted
  -- the REAL admin account keeps full access under the new policies (one part was deleted and one plan removed above)
  rep := rep || pg_temp.chk('real admin: parts', pg_temp.t(admin0, 'select 1 from public.part_master'), 'ok:' || (basepart - 1));
  rep := rep || pg_temp.chk('real admin: plans', pg_temp.t(admin0, 'select 1 from public.shipment_plans'), 'ok:' || (base + 2));
  rep := rep || pg_temp.chk('real admin: list users', pg_temp.t(admin0, 'select * from public.admin_list_users()'), 'ok:%');
  delete from public.user_roles where user_id = admin0;
  rep := rep || pg_temp.chk('last admin delete blocked', pg_temp.t(a1, 'delete from public.user_roles where user_id = ''' || a1 || ''''), 'err:23514');
  rep := rep || pg_temp.chk('last admin demote blocked', pg_temp.t(a1, 'update public.user_roles set role = ''viewer'' where user_id = ''' || a1 || ''''), 'err:23514');

  select count(*) into failed from regexp_matches(rep, 'FAIL', 'g');
  raise exception 'USER_PERMISSIONS_TEST FAILED=% %', failed, case when rep = '' then '(all checks passed)' else rep end;
end
$test$;
