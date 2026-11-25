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

## Development
```
npm install
npm test      # jsdom smoke tests for allocation, mix pallet, tare, dashboard, history
```
Open `index.html` through any static server (`python -m http.server 8080`). Work on a feature branch and open a pull request; do not change the production Supabase schema without review.
