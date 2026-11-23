CLC – WH Loading Calculator v2
================================
Reference workbook: Calculate del part export(1).xlsx, especially the updated Semulate sheet.

CONFIRMED WAREHOUSE RULE
- Pallet Tare = 7 kg per physical pallet.
- Gross Weight = sum of allocated Net Weight + (7 kg × physical pallet count).
- A shared Mix Pallet group counts as one physical pallet; tare is applied once per unique Mix Pallet group.

SEMULATE FIELDS IMPLEMENTED
Logistics: Log Request Container Date, FG Ship Container Date (ETD PTM), Model Code, Plan Shipment Qty/Set, Revise Qty Actual WH, Order Type, Ship By, Type Shipment, Destination-Port, Port, Remark.
Warehouse: Separate Type Model (Packing Reference), Name, Pack STD, Net Weight (kg/Carton), Carton D×W×H, Pallet Stack Y/N, Group Mix on Pallet, CTN.NO, Skid Pallet Total, Skid Pallet No., Total Qty Before Allocation, Qty (Set)/Pallet, BL Diff, Net Weight (kg/Pallet), Gross Weight, Pallet D×W×H, Remark.

PACKAGE CONTENTS
- index.html: interactive CLC local preview with embedded 4,485 Part Master records.
- CLC_Master_Template_v2.xlsx: SharePoint import-ready workbook with PartPackingMaster, ShipmentMaster, DestinationPortMaster, LoadingPlans, README and SemulateReference.

LOCAL PREVIEW
Open index.html directly or run `python -m http.server 8080` in this folder and browse to http://localhost:8080. Data changes and plans are stored in the current browser only in this preview. This is not a multi-user cloud deployment.

MICROSOFT 365 / SHAREPOINT ONLINE TARGET
Recommended production architecture: CLC Web App + Microsoft Entra ID sign-in + SharePoint Online Lists + SharePoint Document Library. Import the matching sheets as Lists: PartPackingMaster, ShipmentMaster, DestinationPortMaster, LoadingPlans. Use indexed columns for Model Code, Plan ID, Destination-Port and ETD; use paging/filtering for the 4,485+ Part records. Keep access limited to the company tenant and role-based groups for Logistics, Warehouse, Supervisor and Admin.

Before enabling live SharePoint sync, IT must provide/approve the SharePoint Site URL, Entra ID App Registration (Tenant ID, Client ID), redirect URL, Graph API permissions and the approved hosting location (e.g. Azure Static Web Apps / App Service or company intranet). Do not put client secrets in browser code.

CALCULATION NOTES / VALIDATION
- Full pallet rows are generated from Qty/Pallet. Remaining quantity is shown as a remainder row and defaulted to Mix Pallet 1 for Warehouse review.
- Warehouse can edit Separate Type Model, Stack, Mix Group, CTN.NO, Skid Pallet Total, Skid Pallet No., Qty/Pallet, pallet dimensions and remark.
- Container Summary is summary-only; no 3D loading layout.
- For a shared Mix Pallet group, CBM is counted once using the largest pallet CBM/dimension among member rows as a provisional summary rule. Warehouse should confirm whether this is the correct method for mixed pallet dimensions.
- Source-specific Air Mode and any special stacking/height exceptions are not silently generalized; validate them with Warehouse before production use.
- This is a functional prototype and import template, not yet deployed or connected to the company Microsoft 365 tenant.
