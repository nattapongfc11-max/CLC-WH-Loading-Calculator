-- RLS / function test for 20261127_plans_slide_permission.sql. Run AFTER the migration in the SQL editor: it creates fake users, checks what each of them may do
-- and ALWAYS ends with an exception (so nothing is kept). Expected message: "PLANS_SLIDE_TEST FAILED=0 (all checks passed)".
do $test$
declare
  a1 uuid := '00000000-0000-0000-0000-0000000000a1';
  w1 uuid := '00000000-0000-0000-0000-0000000000b1';
  l1 uuid := '00000000-0000-0000-0000-0000000000c1';
  v1 uuid := '00000000-0000-0000-0000-0000000000d1';
  c1 uuid := '00000000-0000-0000-0000-0000000000e1';
  s1 uuid := '00000000-0000-0000-0000-0000000000f1';
  n1 uuid := '00000000-0000-0000-0000-0000000000f2';
  rep text := '';
  failed int := 0;
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

  insert into auth.users (id, email) values (a1,'a1@t.test'),(w1,'w1@t.test'),(l1,'l1@t.test'),(v1,'v1@t.test'),(c1,'c1@t.test'),(s1,'s1@t.test'),(n1,'n1@t.test');
  insert into public.user_roles (user_id, email, role) values (a1,'a1@t.test','admin'),(w1,'w1@t.test','warehouse'),(l1,'l1@t.test','logistics'),(v1,'v1@t.test','viewer');
  insert into public.user_roles (user_id, email, role, perms) values
    (c1,'c1@t.test','viewer', array['plans.view_own','plans.slide']),
    (s1,'s1@t.test','viewer', array['plans.view','plans.slide']);

  -- templates
  rep := rep || pg_temp.chk('tpl admin', (select array_length(perms,1)::text from public.user_roles where user_id=a1), '15');
  rep := rep || pg_temp.chk('tpl logistics = create + slide, NOT edit', (select (('plans.create' = any(perms)) and ('plans.slide' = any(perms)) and not ('plans.edit' = any(perms)))::text from public.user_roles where user_id=l1), 'true');
  rep := rep || pg_temp.chk('tpl warehouse keeps edit', (select ('plans.edit' = any(perms))::text from public.user_roles where user_id=w1), 'true');
  rep := rep || pg_temp.chk('bogus perm rejected', pg_temp.t(a1, 'update public.user_roles set perms = array[''plans.bogus''] where user_id = ''' || c1 || ''''), 'err:23514');
  rep := rep || pg_temp.chk('new keys accepted', pg_temp.t(a1, 'update public.user_roles set perms = array[''plans.view'',''plans.create'',''plans.slide''] where user_id = ''' || n1 || ''''), 'ok:0');

  insert into public.shipment_plans (plan_id, created_by, payload) values
    ('T-W', w1, '{"models":[{"model":"M1"}],"allocations":[1,2],"prep":"ready","note":"keep"}'),
    ('T-L', l1, '{"models":[{"model":"M2"}],"allocations":[3]}'),
    ('T-C', c1, '{"models":[]}'),
    ('T-A', a1, '{"models":[]}');

  -- logistics: create yes, change a saved plan no, Slide / Cancel yes (only the delivery fields)
  rep := rep || pg_temp.chk('lg create plan', pg_temp.t(l1, $q$insert into public.shipment_plans (plan_id, created_by, payload) values ('T-L2', '00000000-0000-0000-0000-0000000000c1', '{}')$q$), 'ok:1');
  rep := rep || pg_temp.chk('lg sees all plans', pg_temp.t(l1, 'select 1 from public.shipment_plans where plan_id like ''T-%'''), 'ok:5');
  rep := rep || pg_temp.chk('lg direct update blocked (Shipment Info)', pg_temp.t(l1, $q$update public.shipment_plans set remark = 'x' where plan_id = 'T-W'$q$), 'ok:0');
  rep := rep || pg_temp.chk('lg direct update of own plan blocked', pg_temp.t(l1, $q$update public.shipment_plans set payload = '{}' where plan_id = 'T-L'$q$), 'ok:0');
  rep := rep || pg_temp.chk('lg slide', pg_temp.t(l1, $q$select public.plan_delivery_update('T-W', '{"slides":[{"toDate":"2026-12-01"}],"prep":"short"}')$q$), 'ok:1');
  rep := rep || pg_temp.chk('slide merged, plan content untouched', (select ((payload->'slides'->0->>'toDate') = '2026-12-01' and (payload->>'prep') = 'short' and jsonb_array_length(payload->'allocations') = 2 and (payload->>'note') = 'keep' and (payload->'models'->0->>'model') = 'M1' and updated_by = l1)::text from public.shipment_plans where plan_id = 'T-W'), 'true');
  rep := rep || pg_temp.chk('lg cancel', pg_temp.t(l1, $q$select public.plan_delivery_update('T-W', '{"cancel":{"reason":"x"}}')$q$), 'ok:1');
  rep := rep || pg_temp.chk('lg re-open (null removes the key)', pg_temp.t(l1, $q$select public.plan_delivery_update('T-W', '{"cancel":null}')$q$), 'ok:1');
  rep := rep || pg_temp.chk('cancel key removed', (select (not (payload ? 'cancel'))::text from public.shipment_plans where plan_id = 'T-W'), 'true');
  rep := rep || pg_temp.chk('lg cannot change models through slide', pg_temp.t(l1, $q$select public.plan_delivery_update('T-W', '{"models":[]}')$q$), 'err:42501');
  rep := rep || pg_temp.chk('lg cannot change allocations through slide', pg_temp.t(l1, $q$select public.plan_delivery_update('T-W', '{"allocations":[],"booking":{"a":1}}')$q$), 'err:42501');
  rep := rep || pg_temp.chk('rejected patch changed nothing', (select (jsonb_array_length(payload->'allocations') = 2 and not (payload ? 'booking'))::text from public.shipment_plans where plan_id = 'T-W'), 'true');
  rep := rep || pg_temp.chk('unknown plan', pg_temp.t(l1, $q$select public.plan_delivery_update('NOPE', '{"prep":"ready"}')$q$), 'err:P0002');
  rep := rep || pg_temp.chk('patch must be an object', pg_temp.t(l1, $q$select public.plan_delivery_update('T-W', '"x"'::jsonb)$q$), 'err:22023');
  rep := rep || pg_temp.chk('lg delete others plan blocked', pg_temp.t(l1, $q$delete from public.shipment_plans where plan_id = 'T-W'$q$), 'ok:0');
  rep := rep || pg_temp.chk('lg delete own plan', pg_temp.t(l1, $q$delete from public.shipment_plans where plan_id = 'T-L2'$q$), 'ok:1');
  -- viewer: nothing
  rep := rep || pg_temp.chk('vw slide blocked', pg_temp.t(v1, $q$select public.plan_delivery_update('T-W', '{"prep":"ready"}')$q$), 'err:42501');
  rep := rep || pg_temp.chk('vw insert blocked', pg_temp.t(v1, $q$insert into public.shipment_plans (plan_id) values ('T-V')$q$), 'err:42501');
  -- warehouse (plans.edit): changes saved plans directly, Slide included
  rep := rep || pg_temp.chk('wh direct update', pg_temp.t(w1, $q$update public.shipment_plans set remark = 'wh' where plan_id = 'T-L'$q$), 'ok:1');
  rep := rep || pg_temp.chk('wh slide (edit includes slide)', pg_temp.t(w1, $q$select public.plan_delivery_update('T-L', '{"prep":"ready"}')$q$), 'ok:1');
  rep := rep || pg_temp.chk('wh create plan', pg_temp.t(w1, $q$insert into public.shipment_plans (plan_id, created_by, payload) values ('T-W2', '00000000-0000-0000-0000-0000000000b1', '{}')$q$), 'ok:1');
  -- c1: sees only own plans, Slide only those, cannot create
  rep := rep || pg_temp.chk('c1 slide own plan', pg_temp.t(c1, $q$select public.plan_delivery_update('T-C', '{"prep":"ready"}')$q$), 'ok:1');
  rep := rep || pg_temp.chk('c1 cannot slide others (not visible)', pg_temp.t(c1, $q$select public.plan_delivery_update('T-W', '{"prep":"ready"}')$q$), 'err:P0002');
  rep := rep || pg_temp.chk('c1 cannot create (no plans.create)', pg_temp.t(c1, $q$insert into public.shipment_plans (plan_id, created_by) values ('T-C2', '00000000-0000-0000-0000-0000000000e1')$q$), 'err:42501');
  -- s1: sees all, Slide only, cannot create / edit
  rep := rep || pg_temp.chk('s1 slide others', pg_temp.t(s1, $q$select public.plan_delivery_update('T-A', '{"prep":"short"}')$q$), 'ok:1');
  rep := rep || pg_temp.chk('s1 cannot create', pg_temp.t(s1, $q$insert into public.shipment_plans (plan_id) values ('T-S')$q$), 'err:42501');
  rep := rep || pg_temp.chk('s1 direct update blocked', pg_temp.t(s1, $q$update public.shipment_plans set remark = 's' where plan_id = 'T-A'$q$), 'ok:0');
  -- pending account (no role row) and admin
  rep := rep || pg_temp.chk('pending cannot slide', pg_temp.t(n1, $q$select public.plan_delivery_update('T-A', '{"prep":"ready"}')$q$), 'err:42501');
  rep := rep || pg_temp.chk('admin slide', pg_temp.t(a1, $q$select public.plan_delivery_update('T-W', '{"prep":"none"}')$q$), 'ok:1');
  rep := rep || pg_temp.chk('admin direct update', pg_temp.t(a1, $q$update public.shipment_plans set remark = 'adm' where plan_id = 'T-W'$q$), 'ok:1');

  select count(*) into failed from regexp_matches(rep, 'FAIL', 'g');
  raise exception 'PLANS_SLIDE_TEST FAILED=% %', failed, case when rep = '' then '(all checks passed)' else rep end;
end
$test$;
