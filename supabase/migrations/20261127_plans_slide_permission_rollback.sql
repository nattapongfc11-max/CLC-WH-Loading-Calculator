-- Rollback of 20261127_plans_slide_permission.sql: logistics = plans.edit again, new keys removed, insert policy back to plans.edit only.
drop function if exists public.plan_delivery_update(text, jsonb);

drop policy if exists "shipment_plans insert" on public.shipment_plans;
create policy "shipment_plans insert" on public.shipment_plans for insert to authenticated with check ((select public.clc_can('plans.edit')));

-- logistics users on the new template go back to the old one; everybody else just loses the two new keys
update public.user_roles set perms = array['plans.view','plans.edit','plans.delete_own','parts.view','masters.view','masters.edit','masters.delete','photos.view','photos.edit']
 where role = 'logistics' and perms @> array['plans.create','plans.slide']::text[] and not ('plans.edit' = any (perms));
update public.user_roles set perms = array_remove(array_remove(perms, 'plans.create'), 'plans.slide');

alter table public.user_roles drop constraint if exists user_roles_perms_valid;
alter table public.user_roles add constraint user_roles_perms_valid check (perms <@ array['plans.view','plans.view_own','plans.edit','plans.delete','plans.delete_own','parts.view','parts.edit','parts.delete','masters.view','masters.edit','masters.delete','photos.view','photos.edit']::text[]);

create or replace function public.clc_role_perms(r text)
returns text[]
language sql
immutable
set search_path = ''
as $$
  select case r
    when 'admin' then array['plans.view','plans.view_own','plans.edit','plans.delete','plans.delete_own','parts.view','parts.edit','parts.delete','masters.view','masters.edit','masters.delete','photos.view','photos.edit']
    when 'logistics' then array['plans.view','plans.edit','plans.delete_own','parts.view','masters.view','masters.edit','masters.delete','photos.view','photos.edit']
    when 'warehouse' then array['plans.view','plans.edit','plans.delete_own','parts.view','parts.edit','parts.delete','masters.view','photos.view','photos.edit']
    when 'viewer' then array['plans.view','parts.view','masters.view','photos.view']
    else array[]::text[]
  end
$$;
update public.user_roles set perms = public.clc_role_perms('admin') where role = 'admin';
