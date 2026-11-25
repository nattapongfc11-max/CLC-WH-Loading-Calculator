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

## Delivery board, booking, simulation
- **Dashboard › Delivery Board**: Firm trips per day, Delivered Complete, outstanding, on-time / delay, Slide / Cancel, day slide strip, plan-vs-delivered chart. Plan time = Request Date + Delivery Time (Thai time).
- **Delivery Booking**: an order is a *Firm booking*. Filling Container No., Seal No., Loading by, Loading date/time, Invoice No., Driver (พขร.) and Sub control truck (plate optional) = **Delivered Complete**. Previously entered drivers / sub trucks / plates / loading-by are suggested and can be reused. *Slide* (new date/time) or *Cancel* keeps the original booking date, which is the baseline for on-plan delivery KPI. Data is stored in the plan payload (`booking`, `slides`, `cancel`), no schema change.
- **WH Calculate**: *Hide/Show Pallet Dimensions* toggles the *Mix Pallet Dimension Calculation* section only. *Paste Model / Qty (Excel)* imports Model Code + Qty (also by pasting multi-line text into the Model Code box). *Simulate Layout* draws container Top View / Side View with SKID numbers, model colours and free space.
- **Dashboard › Plan Overview**: metrics *Shipments* and *Delivered Complete*, plus *Shipment by Month · Air / Sea* (from SHIP BY).

### Rules added in v2.3
- **Delivery Board**: a trip is counted on its *current* schedule date (the last Slide, any number of Slides); On time / Delay is still measured against the original booking date. Count/Trip = Delivered Complete + Slide (waiting) + Cancel + Outstanding. Outstanding trips past their scheduled time without any status are listed under *ยังไม่ Judge Status*.
- **Mix Pallet calculation**: full layers at the bottom (tallest cartons first), the incomplete layer on top (flat surface below); pallet height target 125 ± 5 cm (max 130). Taller mixes are split into the fewest pallets with balanced heights.
- **Save is blocked** when Physical Pallet exceeds the container floor capacity (20 for 40HC).

### Rules added in v2.4
- **Stacking pallets in the container**: when Physical Pallet exceeds the floor capacity, pallets are stacked 2-high automatically (option *ซ้อน Pallet 2 ชั้น*, on by default). A stacked pair counts as **one floor position**. Stability rules: the bottom pallet must have a flat top (every layer complete) and be the heavier one, each pallet ≤ 130 cm (125 ± 5), and the pair ≤ container inner height (269 cm for 40HC). Save is blocked only if the floor positions still exceed capacity after stacking. Tare stays 7 kg per physical pallet.
- **Management Overview** page: Plan Overview (Month / Week / Day), Delivery Performance (On plan % by original booking date), Shipment by Month Air / Sea, Slide / Cancel. The Dashboard keeps the Delivery Board.
