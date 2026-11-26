-- CLC Warehouse: Logistics = create new plans + Slide / Cancel, but can NOT change a saved plan (Shipment Information, Models, Pallet Allocation).
-- Run AFTER 20261126_user_permissions.sql. Rollback: 20261127_plans_slide_permission_rollback.sql.
--
-- New permission keys (user_roles.perms)
--   plans.create   save a NEW plan (insert)
--   plans.slide    Slide / Cancel / Delivered Complete (booking) / preparation status of an existing plan.
--                  Done only through plan_delivery_update(): it can touch nothing but booking, slides, cancel, prep, photoReq.
--   plans.edit     unchanged = change ANY saved plan; it includes create + slide.

-- 1) allowed keys
alter table public.user_roles drop constraint if exists user_roles_perms_valid;
alter table public.user_roles add constraint user_roles_perms_valid check (perms <@ array['plans.view','plans.view_own','plans.edit','plans.create','plans.slide','plans.delete','plans.delete_own','parts.view','parts.edit','parts.delete','masters.view','masters.edit','masters.delete','photos.view','photos.edit']::text[]);

-- 2) role templates (logistics: no plans.edit any more)
create or replace function public.clc_role_perms(r text)
returns text[]
language sql
immutable
set search_path = ''
as $$
  select case r
    when 'admin' then array['plans.view','plans.view_own','plans.edit','plans.create','plans.slide','plans.delete','plans.delete_own','parts.view','parts.edit','parts.delete','masters.view','masters.edit','masters.delete','photos.view','photos.edit']
    when 'logistics' then array['plans.view','plans.create','plans.slide','plans.delete_own','parts.view','masters.view','masters.edit','masters.delete','photos.view','photos.edit']
    when 'warehouse' then array['plans.view','plans.edit','plans.delete_own','parts.view','parts.edit','parts.delete','masters.view','photos.view','photos.edit']
    when 'viewer' then array['plans.view','parts.view','masters.view','photos.view']
    else array[]::text[]
  end
$$;

-- 3) existing users: admin rows follow the admin template; logistics users who still have EXACTLY the old logistics template get the new one
--    (an admin who customised a logistics user's permissions keeps them — change those on the Users page)
update public.user_roles set perms = public.clc_role_perms('admin') where role = 'admin';
update public.user_roles set perms = public.clc_role_perms('logistics')
 where role = 'logistics'
   and perms @> array['plans.view','plans.edit','plans.delete_own','parts.view','masters.view','masters.edit','masters.delete','photos.view','photos.edit']::text[]
   and perms <@ array['plans.view','plans.edit','plans.delete_own','parts.view','masters.view','masters.edit','masters.delete','photos.view','photos.edit']::text[];

-- 4) a NEW plan may be saved with plans.create (or plans.edit). Changing a saved plan still needs plans.edit (update policy unchanged).
drop policy if exists "shipment_plans insert" on public.shipment_plans;
create policy "shipment_plans insert" on public.shipment_plans for insert to authenticated
  with check ((select public.clc_can('plans.edit')) or (select public.clc_can('plans.create')));

-- 5) Slide / Cancel / Booking: the only write path for users who have plans.slide but not plans.edit.
--    patch = { booking | slides | cancel | prep | photoReq : value }, a JSON null removes the key. Any other key is refused.
create or replace function public.plan_delivery_update(p_plan_id text, p_patch jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  k text;
  allowed text[] := array['booking','slides','cancel','prep','photoReq'];
  cur jsonb;
begin
  if (select auth.uid()) is null then raise exception 'forbidden' using errcode = '42501'; end if;
  if not ((select public.clc_can('plans.slide')) or (select public.clc_can('plans.edit'))) then
    raise exception 'สิทธิ์ของคุณไม่สามารถ Slide / Cancel ได้ (plans.slide)' using errcode = '42501';
  end if;
  if p_patch is null or jsonb_typeof(p_patch) <> 'object' then raise exception 'patch must be a JSON object' using errcode = '22023'; end if;
  select s.payload into cur from public.shipment_plans s
   where s.plan_id = p_plan_id
     and ((select public.clc_can('plans.view')) or ((select public.clc_can('plans.view_own')) and s.created_by = (select auth.uid())))
   for update;
  if not found then raise exception 'plan not found' using errcode = 'P0002'; end if;
  cur := coalesce(cur, '{}'::jsonb);
  for k in select jsonb_object_keys(p_patch) loop
    if not (k = any (allowed)) then raise exception 'field % can not be changed with plans.slide', k using errcode = '42501'; end if;
    if jsonb_typeof(p_patch -> k) = 'null' then cur := cur - k; else cur := cur || jsonb_build_object(k, p_patch -> k); end if;
  end loop;
  update public.shipment_plans set payload = cur, updated_at = now(), updated_by = (select auth.uid()) where plan_id = p_plan_id;
end
$$;
revoke all on function public.plan_delivery_update(text, jsonb) from public, anon;
grant execute on function public.plan_delivery_update(text, jsonb) to authenticated;
