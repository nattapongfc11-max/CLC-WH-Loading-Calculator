-- Emergency rollback for 20261125_rbac_rls.sql: restores "any authenticated user can manage everything".
drop policy if exists "user_roles read own or admin" on public.user_roles;
drop policy if exists "user_roles admin write" on public.user_roles;
drop policy if exists "part_master read" on public.part_master;
drop policy if exists "part_master write" on public.part_master;
drop policy if exists "destination_ports read" on public.destination_ports;
drop policy if exists "destination_ports write" on public.destination_ports;
drop policy if exists "shipment_options read" on public.shipment_options;
drop policy if exists "shipment_options write" on public.shipment_options;
drop policy if exists "shipment_plans read" on public.shipment_plans;
drop policy if exists "shipment_plans insert" on public.shipment_plans;
drop policy if exists "shipment_plans update" on public.shipment_plans;
drop policy if exists "shipment_plans delete" on public.shipment_plans;
create policy "Authenticated users can manage part master" on public.part_master for all to authenticated using (true) with check (true);
create policy "Authenticated users can manage destination ports" on public.destination_ports for all to authenticated using (true) with check (true);
create policy "Authenticated users can manage shipment options" on public.shipment_options for all to authenticated using (true) with check (true);
create policy "Authenticated users can manage shipment plans" on public.shipment_plans for all to authenticated using (true) with check (true);
-- user_roles table and clc_role() are left in place (harmless); drop them manually if wanted.
