-- Rollback of 20261128_mfa_enforce_aal2.sql: clc_role() / clc_can() go back to the definitions of 20261125_rbac_rls.sql (no 2FA check).
create or replace function public.clc_role()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select role from public.user_roles where user_id = (select auth.uid())
$$;

create or replace function public.clc_can(perm text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select r.role = 'admin' or perm = any (r.perms) from public.user_roles r where r.user_id = (select auth.uid())), false)
$$;
