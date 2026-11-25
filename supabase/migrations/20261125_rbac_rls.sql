-- CLC Warehouse: role-based access (replaces "any authenticated user can do everything").
-- Roles: admin (everything) · logistics (plans, destinations, options) · warehouse (plans, part master) · viewer (read only)
-- Users WITHOUT a row in public.user_roles can sign in but see/change nothing (pending approval).

create table if not exists public.user_roles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email text,
  role text not null check (role in ('admin','logistics','warehouse','viewer')),
  created_at timestamptz not null default now()
);
alter table public.user_roles enable row level security;
-- Table privileges are required in addition to RLS (without them the app gets "permission denied for table user_roles").
revoke all on public.user_roles from anon, authenticated;
grant select, insert, update, delete on public.user_roles to authenticated;

-- Role lookup used by every policy. SECURITY DEFINER so it can read user_roles without recursion.
create or replace function public.clc_role()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select role from public.user_roles where user_id = (select auth.uid())
$$;
revoke all on function public.clc_role() from public, anon;
grant execute on function public.clc_role() to authenticated;

-- Seed: every user that exists today keeps full access (only the owner account exists at migration time).
insert into public.user_roles (user_id, email, role)
select id, email, 'admin' from auth.users
on conflict (user_id) do nothing;

-- Drop the old "authenticated can do everything" policies
drop policy if exists "Authenticated users can manage part master" on public.part_master;
drop policy if exists "Authenticated users can manage destination ports" on public.destination_ports;
drop policy if exists "Authenticated users can manage shipment options" on public.shipment_options;
drop policy if exists "Authenticated users can manage shipment plans" on public.shipment_plans;

-- user_roles: everyone sees their own role, admins manage all
create policy "user_roles read own or admin" on public.user_roles for select to authenticated
  using (user_id = (select auth.uid()) or (select public.clc_role()) = 'admin');
create policy "user_roles admin write" on public.user_roles for all to authenticated
  using ((select public.clc_role()) = 'admin') with check ((select public.clc_role()) = 'admin');

-- part_master: read = any role, write = admin / warehouse
create policy "part_master read" on public.part_master for select to authenticated
  using ((select public.clc_role()) is not null);
create policy "part_master write" on public.part_master for all to authenticated
  using ((select public.clc_role()) in ('admin','warehouse'))
  with check ((select public.clc_role()) in ('admin','warehouse'));

-- destination_ports + shipment_options: read = any role, write = admin / logistics
create policy "destination_ports read" on public.destination_ports for select to authenticated
  using ((select public.clc_role()) is not null);
create policy "destination_ports write" on public.destination_ports for all to authenticated
  using ((select public.clc_role()) in ('admin','logistics'))
  with check ((select public.clc_role()) in ('admin','logistics'));
create policy "shipment_options read" on public.shipment_options for select to authenticated
  using ((select public.clc_role()) is not null);
create policy "shipment_options write" on public.shipment_options for all to authenticated
  using ((select public.clc_role()) in ('admin','logistics'))
  with check ((select public.clc_role()) in ('admin','logistics'));

-- shipment_plans: read = any role; insert/update = admin / logistics / warehouse; delete = admin or the plan's creator
create policy "shipment_plans read" on public.shipment_plans for select to authenticated
  using ((select public.clc_role()) is not null);
create policy "shipment_plans insert" on public.shipment_plans for insert to authenticated
  with check ((select public.clc_role()) in ('admin','logistics','warehouse'));
create policy "shipment_plans update" on public.shipment_plans for update to authenticated
  using ((select public.clc_role()) in ('admin','logistics','warehouse'))
  with check ((select public.clc_role()) in ('admin','logistics','warehouse'));
create policy "shipment_plans delete" on public.shipment_plans for delete to authenticated
  using ((select public.clc_role()) = 'admin'
         or ((select public.clc_role()) in ('logistics','warehouse') and created_by = (select auth.uid())));

-- Add / change a user's role (run as admin in the SQL editor), e.g.:
--   insert into public.user_roles (user_id, email, role)
--   select id, email, 'warehouse' from auth.users where email = 'name@company.com'
--   on conflict (user_id) do update set role = excluded.role;
