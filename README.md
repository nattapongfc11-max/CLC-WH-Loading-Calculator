# CLC-WH-Loading-Calculator
CLC WH Loading Calculator V2 – Container Loading Calculator for Logistics and Warehouse.

- **Web app:** https://nattapongfc11-max.github.io/CLC-WH-Loading-Calculator/
- **Database / auth:** Supabase project "CLC Warehouse" (`part_master`, `destination_ports`, `shipment_options`, `shipment_plans`)
- **Files:** `index.html` (UI + calculation logic), `supabase.js` (auth, cloud sync, realtime), `README.txt` (warehouse rules and calculation notes)

## Pages
| Page | What it does |
|---|---|
| Dashboard | Plan overview by month / week / day, metric selector (Pallet, Gross kg, CBM, Qty), Daily Delivery Plan table |
| WH Calculate | Shipment info, model input, pallet allocation, Mix Pallet layout with Top View, container summary, shipment slip |
| Part & Packing Master | Add / edit / delete part and packing data |
| Destination-Port | Destination–port pairs and dropdown options |
| Loading History | Search, date filter, open/edit, delete saved plans |

## Confirmed rules
Pallet 110 × 110 cm · base 7 cm · target height 125 cm (120–130 cm acceptable) · cartons placed 0° / 90° · layer 1 filled before layer 2 · cartons of different height never share a layer · pallet tare 7 kg per **physical** pallet (a Mix group = 1 pallet).

## Access control (roles)
Run `supabase/migrations/20261125_rbac_rls.sql` once (rollback: `..._rollback.sql`). Users without a row in `public.user_roles` can sign in but see nothing ("pending approval").

| Role | Read | Plans | Part Master | Destination / Options |
|---|---|---|---|---|
| admin | all | write + delete | write | write |
| logistics | all | write, delete own | read | write |
| warehouse | all | write, delete own | write | read |
| viewer | all | read | read | read |

Give a user a role (SQL editor): `insert into public.user_roles (user_id,email,role) select id,email,'warehouse' from auth.users where email='name@company.com' on conflict (user_id) do update set role=excluded.role;`

Dashboard-only Auth settings (cannot be set from code): enable **Leaked password protection** and, if self-registration is not needed, turn off **Allow new users to sign up**.

## Pallet rules added
- A Mix group taller than 130 cm is split automatically into several physical pallets (`Mix Pallet 1`, `Mix Pallet 1 (2)`, …); each pallet carries its own 7 kg tare.
- Container Summary checks floor capacity (Layer 1): **40HC = 20 pallets**; more than 20 shows how many containers are needed.

## Development
```
npm install
npm test      # jsdom smoke tests for allocation, mix pallet, tare, dashboard, history
```
Open `index.html` through any static server (`python -m http.server 8080`). Work on a feature branch and open a pull request; do not change the production Supabase schema without review.

## Delivery board, booking & dimension toggle
- **Dashboard › Delivery Board**: trips planned per day, delivered, outstanding, on-time / delay (plan time = Request Date + Delivery Time, Thai time), day slide strip and daily plan-vs-delivered chart.
- **Delivery Booking** page / *Booking* button in Loading History: Container No., Seal No., Loading by, Loading date & time, Invoice No., Driver (พขร.), Sub control truck, plate, status Draft → Firm → Delivered. Stored in the plan payload (no schema change); Firm/Delivered require all fields. *Copy Firm Bookings* pastes into Excel.
- **WH Calculate**: *Hide/Show Pallet Dimensions* toggles the Pallet D×W×H column and the mix-pallet calculation panel (remembered per browser).
