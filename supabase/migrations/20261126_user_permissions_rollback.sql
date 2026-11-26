-- Rollback of 20261126_user_permissions.sql: back to role-only policies (see 20261125_rbac_rls.sql and 20261126_delivery_photos.sql)
drop policy if exists "part_master read" on public.part_master;
drop policy if exists "part_master insert" on public.part_master;
drop policy if exists "part_master update" on public.part_master;
drop policy if exists "part_master delete" on public.part_master;
create policy "part_master read" on public.part_master for select to authenticated using ((select public.clc_role()) is not null);
create policy "part_master write" on public.part_master for all to authenticated
  using ((select public.clc_role()) in ('admin','warehouse')) with check ((select public.clc_role()) in ('admin','warehouse'));

drop policy if exists "destination_ports read" on public.destination_ports;
drop policy if exists "destination_ports insert" on public.destination_ports;
drop policy if exists "destination_ports update" on public.destination_ports;
drop policy if exists "destination_ports delete" on public.destination_ports;
create policy "destination_ports read" on public.destination_ports for select to authenticated using ((select public.clc_role()) is not null);
create policy "destination_ports write" on public.destination_ports for all to authenticated
  using ((select public.clc_role()) in ('admin','logistics')) with check ((select public.clc_role()) in ('admin','logistics'));

drop policy if exists "shipment_options read" on public.shipment_options;
drop policy if exists "shipment_options insert" on public.shipment_options;
drop policy if exists "shipment_options update" on public.shipment_options;
drop policy if exists "shipment_options delete" on public.shipment_options;
create policy "shipment_options read" on public.shipment_options for select to authenticated using ((select public.clc_role()) is not null);
create policy "shipment_options write" on public.shipment_options for all to authenticated
  using ((select public.clc_role()) in ('admin','logistics')) with check ((select public.clc_role()) in ('admin','logistics'));

drop policy if exists "shipment_plans read" on public.shipment_plans;
drop policy if exists "shipment_plans insert" on public.shipment_plans;
drop policy if exists "shipment_plans update" on public.shipment_plans;
drop policy if exists "shipment_plans delete" on public.shipment_plans;
create policy "shipment_plans read" on public.shipment_plans for select to authenticated using ((select public.clc_role()) is not null);
create policy "shipment_plans insert" on public.shipment_plans for insert to authenticated with check ((select public.clc_role()) in ('admin','logistics','warehouse'));
create policy "shipment_plans update" on public.shipment_plans for update to authenticated
  using ((select public.clc_role()) in ('admin','logistics','warehouse')) with check ((select public.clc_role()) in ('admin','logistics','warehouse'));
create policy "shipment_plans delete" on public.shipment_plans for delete to authenticated
  using ((select public.clc_role()) = 'admin' or ((select public.clc_role()) in ('logistics','warehouse') and created_by = (select auth.uid())));

drop policy if exists "delivery_photos read" on public.delivery_photos;
drop policy if exists "delivery_photos insert" on public.delivery_photos;
drop policy if exists "delivery_photos update" on public.delivery_photos;
drop policy if exists "delivery_photos delete" on public.delivery_photos;
create policy "delivery_photos read" on public.delivery_photos for select to authenticated using ((select public.clc_role()) is not null);
create policy "delivery_photos insert" on public.delivery_photos for insert to authenticated with check ((select public.clc_role()) in ('admin','logistics','warehouse'));
create policy "delivery_photos update" on public.delivery_photos for update to authenticated
  using ((select public.clc_role()) in ('admin','logistics','warehouse')) with check ((select public.clc_role()) in ('admin','logistics','warehouse'));
create policy "delivery_photos delete" on public.delivery_photos for delete to authenticated using ((select public.clc_role()) in ('admin','logistics','warehouse'));

drop function if exists public.admin_list_users();
drop trigger if exists user_roles_guard_write on public.user_roles;
drop trigger if exists user_roles_guard_delete on public.user_roles;
drop function if exists public.user_roles_guard();
alter table public.user_roles drop constraint if exists user_roles_perms_valid;
drop function if exists public.clc_can(text);
drop function if exists public.clc_role_perms(text);
alter table public.user_roles drop column if exists perms, drop column if exists updated_at, drop column if exists updated_by;
