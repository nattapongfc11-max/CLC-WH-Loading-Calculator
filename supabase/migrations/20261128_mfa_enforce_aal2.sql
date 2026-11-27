-- CLC Warehouse: server-side enforcement of two-factor authentication (TOTP).
-- Rollback: 20261128_mfa_enforce_aal2_rollback.sql.   Test: supabase/tests/mfa_enforce_test.sql.
--
-- Rule: a user who has a VERIFIED authenticator (auth.mfa_factors.status = 'verified') gets a role / permissions only on an aal2 session
--       (password + code). With a password-only (aal1) session clc_role() returns NULL and clc_can() returns false, so every RLS policy,
--       admin_list_users(), plan_delivery_update() and the `photos` Edge Function refuse the request — the web login screen is no longer the only gate.
--       Users who have NOT enrolled are unaffected, so this can be applied safely at any time AFTER the web app with the 2FA screens (v3.3) is live.
-- Do not apply it before v3.3 is deployed: an enrolled admin would have no screen to enter the code and could not get in
-- (recovery if that ever happens: run the rollback file, or delete the row in auth.mfa_factors from the Supabase dashboard / SQL editor).

create or replace function public.clc_role()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select r.role
    from public.user_roles r
   where r.user_id = (select auth.uid())
     and (coalesce((select auth.jwt() ->> 'aal'), 'aal1') = 'aal2'
          or not exists (select 1 from auth.mfa_factors f where f.user_id = r.user_id and f.status = 'verified'))
$$;

create or replace function public.clc_can(perm text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select r.role = 'admin' or perm = any (r.perms)
      from public.user_roles r
     where r.user_id = (select auth.uid())
       and (coalesce((select auth.jwt() ->> 'aal'), 'aal1') = 'aal2'
            or not exists (select 1 from auth.mfa_factors f where f.user_id = r.user_id and f.status = 'verified'))
  ), false)
$$;
-- CREATE OR REPLACE keeps the existing grants (authenticated only; anon/public have none).
