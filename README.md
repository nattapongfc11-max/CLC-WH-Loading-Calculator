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

## Access control (roles + per-user permissions)
Run `supabase/migrations/20261125_rbac_rls.sql` and then `supabase/migrations/20261126_user_permissions.sql` once (rollbacks: `..._rollback.sql`). Users without a row in `public.user_roles` can sign in but see nothing ("pending approval").

**Admin page `👥 Users`** (menu, admin only) – no SQL needed any more:
- **รออนุมัติ**: every account that registered with *Create account* and has no role yet. Pick a role and press *อนุมัติ* (gets that role's default permissions), or *กำหนดสิทธิ์เอง…*.
- **แก้สิทธิ์**: per user, choose what the person may **see**, **add / edit** and **delete**:

| Data | See | Add / edit | Delete |
|---|---|---|---|
| Loading Plans (Dashboard, Management, Booking, History, Calculate) | none · **own plans only** · all | on / off | none · **own** · all |
| Part & Packing Master | on / off | on / off | on / off |
| Destination-Port & Options | on / off | on / off | on / off |
| Container photos (only photos of plans the user can see) | on / off | upload / replace / delete | – |

- The **role is the starting template** (admin / logistics / warehouse / viewer, same behaviour as before: admin = everything + Users page; logistics = plans + Destination/Options; warehouse = plans + Part Master; viewer = read only). *ใช้ค่ามาตรฐานของ role* resets the ticks; a user whose ticks differ is marked **ปรับเอง**.
- *ถอนสิทธิ์* returns the user to pending (the account stays; delete accounts in Supabase → Authentication). You cannot remove or change your own access, and the database refuses to remove the **last admin**.
- Everything is **enforced in the database (RLS)**, not just hidden in the menu: a user without "see Part Master" gets no rows from `part_master`; "plans: own only" filters `shipment_plans` by `created_by`; delete rights are separate policies. The menu hides pages the user cannot use, and a user with no permission at all sees "ไม่มีสิทธิ์". Changes apply to the database immediately; the user's menu updates on the next page load.
- Permissions are stored in `user_roles.perms` (`plans.view`, `plans.view_own`, `plans.edit`, `plans.delete`, `plans.delete_own`, `parts.view|edit|delete`, `masters.view|edit|delete`, `photos.view|edit`). Old SQL that only sets a role still works (`insert … role` / `on conflict … set role`): the permissions follow that role's template. The Edge Function `photos` reads the same permissions.
- Tests: `tests/users.test.js` (page), `tests/auth.test.js` (permission checks in the client), and `supabase/tests/user_permissions_test.sql` (run in the SQL editor: simulates 6 users against every table policy and always rolls back; expected message `USER_PERMISSIONS_TEST FAILED=0`).

Approve a user without the page (SQL editor): `insert into public.user_roles (user_id,email,role) select id,email,'warehouse' from auth.users where email='name@company.com' on conflict (user_id) do update set role=excluded.role;`

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
- **Dashboard › Delivery Board**: Firm trips per day, Delivered Complete, outstanding, on-time / delay, Slide / Cancel, day slide strip, plan-vs-delivered chart. Plan time = **FG Ship Container Date (ETD PTM)** + Delivery Time (Thai time); a plan saved without an ETD falls back to Log Request Container Date.
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

## v2.5 – Print templates (Slip · Delivered Complete · ใบส่งงาน)
- **Shipment Slip** (WH Calculate → Print Shipment Slip): new A4 layout with the Pioneer logo top-left, shipment information cards, KPI strip (models / qty / pallet / net / gross / CBM), model detail and colour-banded pallet allocation, remark and sign-off. Up to ~12 models / 18 pallets fit on one page; longer lists continue on the next page with repeated table headers.
- **ใบส่งงาน / Delivery Note** (Delivery Booking → `🖨 ใบส่งงาน` on a Delivered Complete row, or the button inside the booking dialog): prints **only** the delivery note, exactly **one A4 page** – From / To, container, seal, invoice, driver, sub truck and plate, item list with pallet numbers (Shipment Qty), receiving check and four signature boxes (Warehouse, Driver, Logistics, Receiver). With many models the list switches to a compact two-column layout so it never spills onto a second page.
- **Logo**: the Pioneer logo (from `Pioneer_logo.svg`, brand colour `#A90533`) is embedded in the app and printed top-left on every slip. A different logo can be uploaded under *Management → Print Logo* (or the `🖼 Print logo` button in Delivery Booking); it is stored in that browser only and *Remove* restores the Pioneer logo.

## v2.6 – Container photos (Cloudflare R2)
Some customers require photos of the container. Tick **Customer ต้องการรูป** in the *Delivery Booking* dialog of that trip and five slots appear:
1 ก่อนโหลด (Cargo Empty) · 2 กลางตู้ 50% (Loading on Cargo 50%) · 3 โหลดเสร็จ (Loading complete) · 4 ปิดตู้ (Close Cargo door) · 5 Seal / Lock cargo.

- **From a digital camera (Canon etc.)**: copy the JPEGs to the PC, press *เลือกรูปจากกล้อง* and select several files at once – they are sorted by file name and put into the empty slots in order; or use *เลือกรูป / เปลี่ยน* on a single slot. Photos are shrunk in the browser (long edge 2048 px, JPEG ≈ 0.3–0.6 MB) before upload. RAW (CR2/CR3) is not accepted – set the camera to JPEG.
- The table in *Delivery Booking* shows `📷 n/5` on trips that require photos (green = complete) and the status filter has **📷 รูปยังไม่ครบ**. Photos are optional – nothing blocks *Delivered Complete*.
- Files are stored in a **private** Cloudflare R2 bucket, not in Supabase: the database keeps only a small row per photo (`delivery_photos`). The browser uploads/downloads with short-lived presigned links created by the Supabase Edge Function `photos` after it checks the user's role (admin / logistics / warehouse may upload and delete; every role can view). Deleting a plan also deletes its photos.

### One-time setup (Cloudflare + Supabase)
1. Cloudflare dashboard → **R2** → create a bucket (e.g. `clc-photos-apac`). Keep *public access* OFF. *Location*: pick **Asia-Pacific** (a hint, applied only when the bucket is first created; R2 has no Thailand-specific region).
2. R2 → **Manage API tokens** → create a token with **Object Read & Write** limited to that bucket. Note the *Access Key ID*, *Secret Access Key* and your *Account ID* (R2 overview; **32 hex characters**, not the account name).
3. Bucket → **Settings → CORS policy** (JSON tab; the origin must match exactly – no trailing `/`, no path. Without it the browser blocks the upload with “No 'Access-Control-Allow-Origin' header”):
   ```json
   [{"AllowedOrigins":["https://nattapongfc11-max.github.io"],"AllowedMethods":["PUT","GET","HEAD"],"AllowedHeaders":["*"],"ExposeHeaders":["ETag"],"MaxAgeSeconds":3600}]
   ```
4. Bucket → **Settings → Object lifecycle rules**: delete objects after the retention you need (e.g. 365 days). The photo rows stay in the database until the plan is deleted; expired files simply show an empty thumbnail.
5. Supabase → **Edge Functions → photos → Secrets** (never paste these in chat or commit them): `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`.
6. Open a trip, tick *Customer ต้องการรูป*: until step 5 is done the dialog says “ยังไม่ได้ตั้งค่า Cloudflare R2”, and if a secret is present but malformed it names it (e.g. `R2_ACCOUNT_ID: must be 32 characters…`).

### Checking the secrets (🔧 ตรวจ R2)
The button next to the photo slots (admin / logistics / warehouse) asks the Edge Function to test the secrets: it validates their format and sends one signed request to R2, then reports **which** secret is wrong – `R2_ACCOUNT_ID` (host not found), `R2_BUCKET` (no such bucket), `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, or a token without *Object Read & Write* on that bucket. Secret values are never shown. The same check runs automatically when the browser cannot reach R2 during an upload. “Failed to fetch / Load failed” with a healthy server check means the bucket **CORS** (step 3) or a network filter blocking `*.r2.cloudflarestorage.com`. The check cannot see CORS, because that is enforced by the browser.

### Photos on the printed ใบส่งงาน (optional)
For a trip that has **Customer ต้องการรูป** ticked, the print buttons read `🖨 ใบส่งงาน + 📷`. The print window opens at once, fetches fresh signed links and then adds a second A4 page **CONTAINER PHOTOS** after the one-page ใบส่งงาน: the five slots with their customer captions (Cargo Empty … Lock cargo), empty slots marked *ไม่มีรูป*, and a *Loading record* box (plan, container, seal, invoice, loading by, date/time, plate, driver).
- The top bar of the print window has the option **☑ แนบรูปถ่ายตู้ท้ายใบส่งงาน (n/5)** – untick it to print the ใบส่งงาน alone (page 1 is never changed). It says *ยังไม่ครบ* when fewer than 5 photos exist.
- **Print / Save PDF** waits (max 20 s) until the photos have loaded, so none is missing from the printout or the PDF.
- Trips without the flag are unchanged: one page, no photo request. If the photos cannot be fetched (not signed in, R2 not configured) the ใบส่งงาน still prints and the bar says why.

Code: `supabase/functions/photos/` (function), `supabase/migrations/20261126_delivery_photos.sql` (table + RLS; rollback file next to it). The function is deployed with `verify_jwt=false` because it authenticates the caller itself (`auth.getUser()`) and runs every database call with the caller's token, so RLS stays in force.

## v2.7 – Board plan visibility, Count/Trip matrix, Manual Pallet, 3D layout
- **New Shipment → Delivery Board**: after *Save Plan* the board jumps to the plan's Request Date, the new row is highlighted (`ใหม่ · เพิ่งบันทึก`) and a toast with a *ดู Delivery Board* button confirms it. A plan with no Request Date shows a message explaining why it is not on the board. The board also lists **แผนส่งล่วงหน้า** (upcoming plans from today) as clickable chips.
- **Count/Trip ต่อวัน**: the chart label is `Delivered / Plan` and a monthly matrix shows **Plan · Actual Delivered · Outstanding · Slide · Cancel** per day with a month total. Plan = Delivered + Outstanding + Slide + Cancel, counted on the trip's *current* (post-Slide) date. Click a day to open it.
- **Pallet Allocation (Warehouse / Hybrid)**
  - *Layer 1* (bottom) pallets must have a flat top (Mix / remainder levelling applies here only) and height ≤ 130 cm. *Layer 2* (stacked on top) is **not** levelled — it only has to stay under the container height together with the bottom pallet (bottom + top ≤ container height) and weigh no more than the bottom pallet. A Mix group that was split but ends up on top is re-joined into one taller pallet when this saves a floor position.
  - Editing **Qty/Pallet** recalculates the pallet height (full pallet = master pallet height; partial = 7 cm base + layers × layer height). A height typed by hand is kept until Qty is edited again.
  - **Add Manual Pallet** opens a popup listing the Shipment Order models (Shipment Qty · already allocated · balance). Enter the Qty for each model (*เหลือ* fills the balance); 2+ models = one Mix Pallet or separate pallets. The balance is used first, otherwise the quantity is deducted from that model's last rows, so totals still equal the Shipment Qty. Rows carry the remark `Manual`.
  - **CTN.NO removed.** The first column is **Separate Type Model** (bold). One **Skid Pallet No.** column shows `No./Total` (e.g. `3/4` = 3rd of the 4 pallets of that Model); the separate *Skid Pallet Total* column was removed.
- **Simulate Layout – 3D**: one 3D View of the container (cut-away: glass near wall, corrugated far walls, open doors) — see v2.8 for the labels, camera and stacking plan.
- Tests: `tests/calc.test.js` (columns, heights, skid numbering, manual popup, Layer 1/2 rule), `tests/sim3d.test.js` (3D scene, draw order, camera, overflow). No database change.

## v2.8 – one 3D view, readable pallet numbers, stacking plan, Plan ID code
- **Delivery Board / Count/Trip use FG Ship Container Date (ETD PTM)** as the Trip date (Log Request Container Date only when a plan has no ETD). *Dashboard › Date basis* still lets you choose either date for the Plan Overview.
- **Plan ID** = `PTM-YYMMDD-M-NNN` (fixed 16 characters): company code `PTM`, the ETD date (YYMMDD), ship mode (`S` = Sea, `A` = Air, `X` = other) and a running no. that counts up through that day, e.g. `PTM-261130-S-001`, `PTM-261130-A-002`. It is created when a **new** plan is saved; editing a plan keeps its ID, and old `CLC-…` IDs are unchanged. In the cloud the next number is read from the database right before saving and a duplicate (two people saving at once) is retried with the next number. The company code is the constant `PLAN_ID_COMPANY` in `index.html`.
- **Mix Pallet running no.**: Mix Pallets are numbered `Mix Pallet 1, 2, 3 …` in the order they appear — pieces of a Mix group that was split because of the 130 cm limit get their own number (no more `Mix Pallet 1 (2)`). A group you name yourself (e.g. `Mix Special`) keeps its name.
- **Skid Pallet No.** is a single always-visible column `No./Total`; **Skid Pallet Total** was removed.
- **Stacking plan** (*Simulate Layout*): a table of every floor position showing **Layer 1 · ล่าง** and **Layer 2 · ซ้อนบน**, the pair's dimension `D × W × (H bottom + H top)`, total Gross kg and the check against the container height. Each Mix Pallet card shows its **Pallet No.** and which pallet it is stacked with. How a stacked pair is measured: D × W = the bottom pallet's base (a pair uses ONE floor position); **H = H bottom + H top** (each includes its own 7 cm skid) and must be ≤ the container's inner height (40HC 269 cm); weight = bottom + top (7 kg tare each) with the top not heavier than the bottom; Layer 1 flat and ≤ 130 cm, Layer 2 not levelled.
- **3D View** (Top / Side panels merged): drag to rotate, wheel to zoom, presets *มุมเฉียง · มองจากด้านบน · ด้านข้าง · จากประตูตู้*, *รีเซ็ตมุม*, Kraft / Model colours. **Pallet No. labels** are drawn last (nothing can cover them), placed on a spot of the pallet the camera can see, never overlap each other, and use a leader line when moved. White = Pallet No., yellow = Mix Pallet (`5` / `Mix 2`), blue = stacked pair (`▲` top / `▼` bottom), dashed = hidden from this angle (hover for model / height / weight).
- Tests: `tests/planid.test.js` (ETD trip date, Plan ID, cloud save + retry), `tests/calc.test.js` (Skid cell, Mix numbering, stacking plan), `tests/sim3d.test.js` (labels visible / not overlapping from 10 angles). No database change.
