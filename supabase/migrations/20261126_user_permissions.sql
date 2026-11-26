-- CLC Warehouse: per-user authorization (admin page "Users · Manage User Authorize").
-- The role stays the starting template (admin / logistics / warehouse / viewer); user_roles.perms holds what the user may actually do.
-- admin always has everything. Everything here is enforced by RLS, the page only edits user_roles.
--
-- Permission keys (text[] in user_roles.perms)
--   plans.view          see ALL loading plans / bookings / dashboard      plans.view_own   see only plans the user created
--   plans.edit          create + change plans, bookings                   plans.delete     delete ANY plan        plans.delete_own  delete own plans
--   parts.view / parts.edit / parts.delete          Part & Packing Master
--   masters.view / masters.edit / masters.delete    Destination-Port + shipment dropdown options
--   photos.view / photos.edit                       container photos (edit = upload, replace, delete)

alter table public.user_roles
  add column if not exists perms text[] not null default '{}',
  add column if not exists updated_at timestamptz not null default now(),
  add column if not exists updated_by uuid references auth.users(id) on delete set null;

-- Role -> default permissions (same behaviour as before this migration)
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

-- Every existing user keeps exactly what their role allowed until now
update public.user_roles set perms = public.clc_role_perms(role) where coalesce(array_length(perms, 1), 0) = 0;

alter table public.user_roles drop constraint if exists user_roles_perms_valid;
alter table public.user_roles add constraint user_roles_perms_valid check (perms <@ array['plans.view','plans.view_own','plans.edit','plans.delete','plans.delete_own','parts.view','parts.edit','parts.delete','masters.view','masters.edit','masters.delete','photos.view','photos.edit']::text[]);

-- Permission lookup used by every policy (SECURITY DEFINER so it can read user_roles without recursion)
create or replace function public.clc_can(perm text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select r.role = 'admin' or perm = any (r.perms) from public.user_roles r where r.user_id = (select auth.uid())), false)
$$;
revoke all on function public.clc_can(text) from public, anon;
grant execute on function public.clc_can(text) to authenticated;
revoke all on function public.clc_role_perms(text) from public, anon;
grant execute on function public.clc_role_perms(text) to authenticated;

-- Guard: fill defaults for rows written without perms (e.g. the old "insert ... role" SQL), keep admin = everything,
-- never leave the system without an admin, stamp who/when.
create or replace function public.user_roles_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    if old.role = 'admin' and not exists (select 1 from public.user_roles where role = 'admin' and user_id <> old.user_id) then
      raise exception 'ต้องมี admin อย่างน้อย 1 คน (cannot remove the last admin)' using errcode = '23514';
    end if;
    return old;
  end if;
  if tg_op = 'INSERT' then
    if coalesce(array_length(new.perms, 1), 0) = 0 then new.perms := public.clc_role_perms(new.role); end if;
  else
    if new.role is distinct from old.role and new.perms is not distinct from old.perms then new.perms := public.clc_role_perms(new.role); end if;
    if old.role = 'admin' and new.role <> 'admin' and not exists (select 1 from public.user_roles where role = 'admin' and user_id <> old.user_id) then
      raise exception 'ต้องมี admin อย่างน้อย 1 คน (cannot remove the last admin)' using errcode = '23514';
    end if;
  end if;
  if new.role = 'admin' then new.perms := public.clc_role_perms('admin'); end if;
  new.updated_at := now();
  new.updated_by := (select auth.uid());
  return new;
end
$$;
revoke all on function public.user_roles_guard() from public, anon, authenticated;
drop trigger if exists user_roles_guard_write on public.user_roles;
create trigger user_roles_guard_write before insert or update on public.user_roles for each row execute function public.user_roles_guard();
drop trigger if exists user_roles_guard_delete on public.user_roles;
create trigger user_roles_guard_delete before delete on public.user_roles for each row execute function public.user_roles_guard();

-- Admin page: every account (also the ones still waiting for approval = no row in user_roles)
create or replace function public.admin_list_users()
returns table (user_id uuid, email text, created_at timestamptz, last_sign_in_at timestamptz, confirmed boolean, role text, perms text[], updated_at timestamptz)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if (select public.clc_role()) is distinct from 'admin' then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  return query
    select u.id, u.email::text, u.created_at, u.last_sign_in_at, (u.email_confirmed_at is not null), r.role, coalesce(r.perms, array[]::text[]), r.updated_at
    from auth.users u left join public.user_roles r on r.user_id = u.id
    order by (r.role is null) desc, u.created_at;
end
$$;
revoke all on function public.admin_list_users() from public, anon;
grant execute on function public.admin_list_users() to authenticated;

-- ---------- policies: role checks -> permission checks ----------
drop policy if exists "part_master read" on public.part_master;
drop policy if exists "part_master write" on public.part_master;
create policy "part_master read" on public.part_master for select to authenticated using ((select public.clc_can('parts.view')));
create policy "part_master insert" on public.part_master for insert to authenticated with check ((select public.clc_can('parts.edit')));
create policy "part_master update" on public.part_master for update to authenticated using ((select public.clc_can('parts.edit'))) with check ((select public.clc_can('parts.edit')));
create policy "part_master delete" on public.part_master for delete to authenticated using ((select public.clc_can('parts.delete')));

drop policy if exists "destination_ports read" on public.destination_ports;
drop policy if exists "destination_ports write" on public.destination_ports;
create policy "destination_ports read" on public.destination_ports for select to authenticated using ((select public.clc_can('masters.view')));
create policy "destination_ports insert" on public.destination_ports for insert to authenticated with check ((select public.clc_can('masters.edit')));
create policy "destination_ports update" on public.destination_ports for update to authenticated using ((select public.clc_can('masters.edit'))) with check ((select public.clc_can('masters.edit')));
create policy "destination_ports delete" on public.destination_ports for delete to authenticated using ((select public.clc_can('masters.delete')));

drop policy if exists "shipment_options read" on public.shipment_options;
drop policy if exists "shipment_options write" on public.shipment_options;
create policy "shipment_options read" on public.shipment_options for select to authenticated using ((select public.clc_can('masters.view')));
create policy "shipment_options insert" on public.shipment_options for insert to authenticated with check ((select public.clc_can('masters.edit')));
create policy "shipment_options update" on public.shipment_options for update to authenticated using ((select public.clc_can('masters.edit'))) with check ((select public.clc_can('masters.edit')));
create policy "shipment_options delete" on public.shipment_options for delete to authenticated using ((select public.clc_can('masters.delete')));

drop policy if exists "shipment_plans read" on public.shipment_plans;
drop policy if exists "shipment_plans insert" on public.shipment_plans;
drop policy if exists "shipment_plans update" on public.shipment_plans;
drop policy if exists "shipment_plans delete" on public.shipment_plans;
create policy "shipment_plans read" on public.shipment_plans for select to authenticated
  using ((select public.clc_can('plans.view')) or ((select public.clc_can('plans.view_own')) and created_by = (select auth.uid())));
create policy "shipment_plans insert" on public.shipment_plans for insert to authenticated with check ((select public.clc_can('plans.edit')));
create policy "shipment_plans update" on public.shipment_plans for update to authenticated
  using ((select public.clc_can('plans.edit'))) with check ((select public.clc_can('plans.edit')));
create policy "shipment_plans delete" on public.shipment_plans for delete to authenticated
  using ((select public.clc_can('plans.delete')) or ((select public.clc_can('plans.delete_own')) and created_by = (select auth.uid())));

-- photos follow the plan: only photos of plans the user can see (RLS of shipment_plans applies inside the sub-select)
drop policy if exists "delivery_photos read" on public.delivery_photos;
drop policy if exists "delivery_photos insert" on public.delivery_photos;
drop policy if exists "delivery_photos update" on public.delivery_photos;
drop policy if exists "delivery_photos delete" on public.delivery_photos;
create policy "delivery_photos read" on public.delivery_photos for select to authenticated
  using ((select public.clc_can('photos.view')) and exists (select 1 from public.shipment_plans p where p.plan_id = delivery_photos.plan_id));
create policy "delivery_photos insert" on public.delivery_photos for insert to authenticated
  with check ((select public.clc_can('photos.edit')) and exists (select 1 from public.shipment_plans p where p.plan_id = delivery_photos.plan_id));
create policy "delivery_photos update" on public.delivery_photos for update to authenticated
  using ((select public.clc_can('photos.edit')) and exists (select 1 from public.shipment_plans p where p.plan_id = delivery_photos.plan_id))
  with check ((select public.clc_can('photos.edit')) and exists (select 1 from public.shipment_plans p where p.plan_id = delivery_photos.plan_id));
create policy "delivery_photos delete" on public.delivery_photos for delete to authenticated
  using ((select public.clc_can('photos.edit')) and exists (select 1 from public.shipment_plans p where p.plan_id = delivery_photos.plan_id));

-- Give / change access without the page (SQL editor), e.g. approve a new account as warehouse:
--   insert into public.user_roles (user_id, email, role) select id, email, 'warehouse' from auth.users where email = 'name@company.com'
--   on conflict (user_id) do update set role = excluded.role;       -- perms follow the role template unless you pass perms
