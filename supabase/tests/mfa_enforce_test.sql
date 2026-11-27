-- Test for 20261128_mfa_enforce_aal2.sql. Run AFTER the migration in the SQL editor: it creates fake users + factors, checks what an aal1 / aal2 session may do
-- and ALWAYS ends with an exception (so nothing is kept). Expected message: "MFA_ENFORCE_TEST FAILED=0 (all checks passed)".
do $test$
declare
  u1 uuid := '00000000-0000-0000-0000-0000000000a1'; -- admin, NO authenticator
  u2 uuid := '00000000-0000-0000-0000-0000000000a2'; -- admin, verified authenticator
  u3 uuid := '00000000-0000-0000-0000-0000000000a3'; -- viewer, authenticator started but NOT verified
  rep text := '';
  failed int := 0;
begin
  create or replace function pg_temp.v(uid uuid, aal text, q text) returns text language plpgsql as $f$
  declare r text;
  begin
    perform set_config('request.jwt.claims', (case when aal is null then json_build_object('sub', uid, 'role', 'authenticated') else json_build_object('sub', uid, 'role', 'authenticated', 'aal', aal) end)::text, true);
    set local role authenticated;
    execute q into r;
    reset role; return coalesce(r, 'null');
  exception when others then
    reset role; return 'err:' || sqlstate;
  end $f$;
  create or replace function pg_temp.chk(label text, got text, want text) returns text language sql as $f$
    select case when got = want then '' else '[FAIL ' || label || ': got ' || got || ' want ' || want || '] ' end $f$;

  insert into auth.users (id, email) values (u1,'m1@t.test'),(u2,'m2@t.test'),(u3,'m3@t.test');
  insert into public.user_roles (user_id, email, role) values (u1,'m1@t.test','admin'),(u2,'m2@t.test','admin'),(u3,'m3@t.test','viewer');
  insert into auth.mfa_factors (id, user_id, friendly_name, factor_type, status, created_at, updated_at, secret) values
    (gen_random_uuid(), u2, 'test', 'totp', 'verified', now(), now(), 'JBSWY3DPEHPK3PXP'),
    (gen_random_uuid(), u3, 'test', 'totp', 'unverified', now(), now(), 'JBSWY3DPEHPK3PXP');

  -- no authenticator: unchanged behaviour on an aal1 session
  rep := rep || pg_temp.chk('no factor, aal1: role', pg_temp.v(u1,'aal1','select public.clc_role()'), 'admin');
  rep := rep || pg_temp.chk('no factor, aal1: can', pg_temp.v(u1,'aal1','select public.clc_can(''plans.edit'')::text'), 'true');
  rep := rep || pg_temp.chk('no factor, no aal claim: role', pg_temp.v(u1,null,'select public.clc_role()'), 'admin');
  -- authenticator started but never verified: does not lock the user out
  rep := rep || pg_temp.chk('unverified factor, aal1: role', pg_temp.v(u3,'aal1','select public.clc_role()'), 'viewer');
  rep := rep || pg_temp.chk('unverified factor, aal1: can view', pg_temp.v(u3,'aal1','select public.clc_can(''plans.view'')::text'), 'true');
  -- verified authenticator: password-only session gets nothing
  rep := rep || pg_temp.chk('verified factor, aal1: role is null', pg_temp.v(u2,'aal1','select public.clc_role()'), 'null');
  rep := rep || pg_temp.chk('verified factor, aal1: can is false', pg_temp.v(u2,'aal1','select public.clc_can(''plans.view'')::text'), 'false');
  rep := rep || pg_temp.chk('verified factor, no aal claim: role is null', pg_temp.v(u2,null,'select public.clc_role()'), 'null');
  rep := rep || pg_temp.chk('verified factor, aal1: plans are invisible', pg_temp.v(u2,'aal1','select count(*)::text from public.shipment_plans'), '0');
  rep := rep || pg_temp.chk('verified factor, aal1: part master invisible', pg_temp.v(u2,'aal1','select count(*)::text from public.part_master'), '0');
  rep := rep || pg_temp.chk('verified factor, aal1: admin_list_users refused', pg_temp.v(u2,'aal1','select count(*)::text from public.admin_list_users()'), 'err:42501');
  rep := rep || pg_temp.chk('verified factor, aal1: cannot write', pg_temp.v(u2,'aal1','with x as (insert into public.shipment_plans (plan_id) values (''T-MFA'') returning 1) select count(*)::text from x'), 'err:42501');
  rep := rep || pg_temp.chk('verified factor, aal1: still reads its OWN role row (so the web app can show the code screen)', pg_temp.v(u2,'aal1','select count(*)::text from public.user_roles where user_id = ''' || u2 || ''''), '1');
  -- verified authenticator + aal2 session (password + code): full access
  rep := rep || pg_temp.chk('verified factor, aal2: role', pg_temp.v(u2,'aal2','select public.clc_role()'), 'admin');
  rep := rep || pg_temp.chk('verified factor, aal2: can', pg_temp.v(u2,'aal2','select public.clc_can(''plans.edit'')::text'), 'true');
  rep := rep || pg_temp.chk('verified factor, aal2: plans visible', pg_temp.v(u2,'aal2','select count(*)::text from public.shipment_plans'), (select count(*)::text from public.shipment_plans));
  rep := rep || pg_temp.chk('verified factor, aal2: admin_list_users works', pg_temp.v(u2,'aal2','select (count(*) >= 3)::text from public.admin_list_users()'), 'true');
  -- the helper functions are still not callable by anon
  rep := rep || pg_temp.chk('anon cannot execute clc_role', has_function_privilege('anon','public.clc_role()','execute')::text, 'false');
  rep := rep || pg_temp.chk('anon cannot execute clc_can', has_function_privilege('anon','public.clc_can(text)','execute')::text, 'false');

  select count(*) into failed from regexp_matches(rep, 'FAIL', 'g');
  raise exception 'MFA_ENFORCE_TEST FAILED=% %', failed, case when rep = '' then '(all checks passed)' else rep end;
end
$test$;
