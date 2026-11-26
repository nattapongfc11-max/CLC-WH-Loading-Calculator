-- CLC Warehouse: container photos (metadata only – the image files live in a private Cloudflare R2 bucket).
-- 5 slots per trip: 1 Cargo Empty · 2 Loading 50% · 3 Loading complete · 4 Close cargo door · 5 Seal / lock cargo
-- Only trips that the customer requires photos for will have rows here.

create table if not exists public.delivery_photos (
  id uuid primary key default gen_random_uuid(),
  plan_id text not null references public.shipment_plans(plan_id) on delete cascade on update cascade,
  slot smallint not null check (slot between 1 and 5),
  object_key text not null unique,
  content_type text not null default 'image/jpeg',
  bytes integer not null check (bytes > 0 and bytes <= 3000000),
  uploaded_by uuid default auth.uid() references auth.users(id) on delete set null,
  uploaded_at timestamptz not null default now(),
  unique (plan_id, slot)
);
alter table public.delivery_photos enable row level security;

-- read = any role (incl. viewer); write = admin / logistics / warehouse (same as shipment_plans)
create policy "delivery_photos read" on public.delivery_photos for select to authenticated
  using ((select public.clc_role()) is not null);
create policy "delivery_photos insert" on public.delivery_photos for insert to authenticated
  with check ((select public.clc_role()) in ('admin','logistics','warehouse'));
create policy "delivery_photos update" on public.delivery_photos for update to authenticated
  using ((select public.clc_role()) in ('admin','logistics','warehouse'))
  with check ((select public.clc_role()) in ('admin','logistics','warehouse'));
create policy "delivery_photos delete" on public.delivery_photos for delete to authenticated
  using ((select public.clc_role()) in ('admin','logistics','warehouse'));

revoke all on public.delivery_photos from anon, authenticated;
grant select, insert, update, delete on public.delivery_photos to authenticated;
