# IoT Team Center — feature specification

Engineering Estimate Cost Management System for the TOMAS TECH IoT team.

Single reference for everything the application does today, written so the
back-end can be built from it without reading the UI code.

- Front end: React 19 on vinext, all screens under `app/system/`
- Data today: in-repo dataset (`app/system/data.ts`) — no persistence yet
- Calculation today: `app/system/calc.ts` — **must move to the server**
- Last updated: 30 Aug 2026

**Golden rule:** this system controls internal engineering cost only. Gross
margin, profit margin, gross profit, selling price, customer selling price,
markup and commercial quotation calculation must never exist in any field,
report or export. Approval covers technical scope, cost accuracy, engineering
effort and cost completeness.

---

## 1. Screen map

| Nav group | Screen | Route | File | Purpose |
| --- | --- | --- | --- | --- |
| — | Login | — | `App.tsx` | Sign in, role selection |
| — | Dashboard | `dashboard` | `screens/Dashboard.tsx` | 8 KPIs, 6 charts, recent estimates, section progress, attention list |
| — | Inquiry | `inquiries` | `screens/Inquiry.tsx` | List + filters; auto inquiry number |
| — | Create Inquiry | `inquiry-new` | `screens/Inquiry.tsx` | General info, requirement info, attachments |
| — | Inquiry Detail | `inquiry` | `screens/Inquiry.tsx` | Tabs: Overview, Requirement, Meeting Log, Estimate Cost, Attachments, Activity |
| — | Estimate Cost list | `estimates` | `screens/EstimateList.tsx` | All estimates with cost columns and filters |
| — | **Estimate Workspace** | `estimate` | `screens/Workspace.tsx` | Tabs: Summary, Cost Items, Engineering Man-hour, Other Project Cost, Assignment, Validation, Revision History, Compare Revision, Engineering Review |
| Price & supplier | Price Library | `price` | `screens/Price.tsx` | Reference prices, price age, trend |
| Price & supplier | Price History | `price-history` | `screens/Price.tsx` | Price trend chart and history table |
| Price & supplier | Supplier Quotation | `quotations` | `screens/Price.tsx` | Quotation register, validity, upload |
| Price & supplier | Waiting Supplier Price | `missing` | `screens/Price.tsx` | Missing price management |
| Planning | **Resource Plan** | `resources` | `screens/Resource.tsx` | Assignment Gantt + workload heat grid |
| Planning | **Purchase Requisition** | `purchase` / `pr` | `screens/Purchase.tsx` | PR list, PR detail, create PR from estimate |
| Organisation | Customers | `customers` | `screens/Admin.tsx` | Customer master view |
| Organisation | Projects | `projects` | `screens/Admin.tsx` | Awarded projects and their cost baseline |
| Organisation | Reports | `reports` | `screens/Admin.tsx` | 13 reports, Excel/PDF export |
| Administration | Master Data | `master` | `screens/Admin.tsx` | 14 master tabs |
| Administration | Engineering Rate | `rates` | `screens/Admin.tsx` | Employee / rate master |
| Administration | Audit Log | `audit` | `screens/Admin.tsx` | Immutable change log |
| Administration | Settings | `settings` | `screens/Admin.tsx` | Users & roles, notifications, numbering, storage, general |

Global chrome: sidebar navigation, global search (Ctrl-K) across inquiry,
estimate, price library, supplier quotation and engineer; notification menu;
TH / EN / JP switch; user menu.

---

## 2. Domain model

Field lists mirror `app/system/data.ts`. Types marked *(new)* did not exist in
the original spec and were added while building.

### 2.1 Inquiry
```
Inquiry: id, no, date, customerId, contact, projectName, projectType, rfqNo,
         salesOwner, estimateOwnerId, dueDate, priority, status, progress,
         revision, updatedAt,
         requirement, background, scopeSummary, technical, targetDelivery,
         siteLocation, standard, special, remark,
         attachments[], meetings[], estimateId?
Attachment:    id, name, category, size, uploadedBy, uploadedAt
MeetingRecord: id, date, type, participants[], requirement, technical,
               decision, openPoint, actionItem, owner, dueDate, attachment?
```
- `InquiryStatus`: New · Estimating · Waiting Supplier Price · Estimate Completed · Engineering Review · Approved · Cancelled
- `Priority`: Low · Normal · High · Urgent
- Attachment categories: Customer RFQ, Meeting Record, Specification, Drawing, Layout, Equipment List, Customer Standard, Supplier Document, Reference Document, Other

### 2.2 Estimate
```
Estimate: id, no, inquiryNo, customerId, projectName, projectType, ownerId,
          revision, createdDate, dueDate, status, progress, updatedAt,
          contingencyRate,
          items[], manhours[], expenses[], others[], assignments[], revisions[]
```
- `EstimateStatus`: Draft · Engineering Input · Waiting Supplier Price · Estimate Completed · Engineering Review · Revision Required · Approved · Locked

### 2.3 Cost item (material)
```
CostItem: id, categoryCode, category, subcategory, module, itemCode,
          description, brand, model, specification, supplier,
          qty, unit, unitCost,
          source, referenceNo, referenceProject, priceDate,
          remark, owner, status
```
- Three levels: **category (discipline) → module → item**. `module` *(new)* is the main module, e.g. "Main Control Box".
- `PriceSource`: Supplier Quotation · Previous Estimate · Previous Project Cost · Purchase Price · Master Price · Manual Estimate · Budgetary Price
- `SectionStatus`: Not Started · In Progress · Waiting Information · Waiting Supplier · Completed · Reviewed

### 2.4 Engineering effort
```
ManhourLine: id, package, activity, department, level,
             costType, provider, supplier, quotationNo, priceDate,
             engineers, manDays, hoursPerDay, dailyRate, owner, remark
ExpenseLine: id, package, type, description, costType, supplier, reference,
             qty, unit, unitCost, owner, remark
```
- `CostType` *(new)*: `Engineering` (label "Engineering cost") · `Installation` (label "Installation & Service cost"). Stored short, displayed through `COST_TYPE_LABEL` / `COST_TYPE_SHORT`.
- `ManhourProvider` *(new)*: `Internal` (rate read from the master) · `Supplier` (rate quoted; supplier + quotation number required).
- Work package *(new)* groups activities and the expenses they cause.
- `ExpenseType`: Travel · Accommodation · Per Diem · Transportation · Equipment Rental · Other
- Expense units: Trip · Night · Day · Person · Km · Lot · Service

### 2.5 Other estimate records
```
OtherCostLine: id, category, description, qty, unit, unitCost, remark
Assignment:    id, section, ownerId, supportId, dueDate, status, progress, comment
Revision:      id, code, reason, description, createdBy, createdAt,
               reviewedBy, status, total
```

### 2.6 Price and supplier
```
PriceRecord:       id, itemCode, description, brand, model, category, supplier,
                   unit, price, priceDate, source, reference, project, lastUsed,
                   history[]
PriceHistoryPoint: date, price, supplier, reference, project, uploadedBy
SupplierQuotation: id, no, supplier, receivedDate, validUntil, inquiryNo,
                   project, currency, amount, uploadedBy, status, file, fileType
MissingPrice:      id, inquiryNo, project, item, brand, model, supplier,
                   requestedBy, requestDate, requiredDate, status, ownerId
```
- Quotation status: Valid · Expiring · Expired · Superseded
- Missing price status: Not Requested · Requested · Waiting Supplier · Received · Price Updated

### 2.7 Resource plan *(new)*
```
WorkItem: id, type, ownerId, reference, title, customer, start, end,
          manDays, progress, status, linkInquiryId?, linkEstimateId?
CAPACITY_PER_WEEK = 5   // working days an engineer can commit per week
```
- `WorkItemType`: Inquiry · Estimate · Project

### 2.8 Purchase requisition *(new)*
```
PurchaseRequisition: id, no, projectNo, projectName, estimateId, estimateNo,
                     revision, customer, requesterId, approverId,
                     createdDate, requiredDate, status, purpose, lines[]
PrLine:              id, estimateItemId, itemCode, description, brand, model,
                     specification, supplier, qty, unit, unitCost,
                     estimateQty, estimateUnitCost, remark
```
- `PrStatus`: Draft · Submitted · Approved · Ordered · Rejected
- `estimateItemId` links the line back to `CostItem.id`; empty means the line was never estimated separately (it was inside a rounded figure).
- `estimateQty` / `estimateUnitCost` are a **frozen snapshot** taken when the PR is raised — they must not follow later estimate edits.

### 2.9 Master data
```
User:       id, name, initials, email, role, department, level
Customer:   id, code, name, contact, email, phone, industry, site, inquiries
Supplier:   id, code, name, category, contact, email, phone, brands[], status
RateRecord: id, level, department,
            engineeringHourly, engineeringDaily,
            installationHourly, installationDaily, effective
AuditEntry: id, at, user, estimate, revision, module, action, before, after, reason
Notification: id, kind, title, detail, at, unread
```
Reference lists: `PROJECT_TYPES` (15), `COST_STRUCTURE` (10 categories with
subcategories), `MODULE_PRESETS` (per category), `PACKAGE_PRESETS` (per cost
type), `ENGINEERING_ACTIVITIES` (19), `ENGINEER_LEVELS` (6), `DEPARTMENTS` (7),
`UNITS` (8), `BRANDS` (12).

### 2.10 Cost breakdown structure
```
01 Hardware        PLC · HMI · Sensor · Network · Industrial PC
02 Software        PLC Programming · HMI Programming · Application Software · Database · Dashboard
03 Electrical      Electrical Design · Control Panel · Wiring · Installation
04 Mechanical      Mechanical Design · Fabrication · Assembly
05 Robot           Robot · Gripper · Robot Programming
06 Engineering     System Design · Programming · Testing · Commissioning · Documentation
07 Outsource       08 Transportation   09 Accommodation   10 Other Cost
```

---

## 3. Numbering standards

| Document | Pattern | Example | Notes |
| --- | --- | --- | --- |
| Inquiry | `INQ-YYMM-XXXX` | INQ-2608-0001 | Server generated, never typed, unique |
| Estimate | `EST-YYMM-XXXX` | EST-2608-0001 | Server generated, unique |
| Revision | `R00`, `R01`, … | R02 | Per estimate |
| Supplier quotation | `SQ-YYMM-XXXX` | SQ-2608-0012 | |
| Purchase requisition | `PR-YYMM-XXXX` | PR-2608-0001 | *(new)* |
| **Item code** *(new)* | `<CAT>-<MOD>-<NNN>` | ME-IFC-001 | Running number **inside a module** |

### Item code rules (`calc.ts`)
- `CAT` — 2 letters per category: 01 HW · 02 SW · 03 EL · 04 ME · 05 RB · 06 EN · 07 OS · 08 TR · 09 AC · 10 OT
- `MOD` — initials of the module words, up to 3 letters; a single-word module uses its first 3 letters ("Safety Fence" → SF, "In-feed Conveyor" → IFC)
- `NNN` — running number within that category + module, zero padded, starting at 001
- Generated when a row is added inline, duplicated, or created in the Add Cost Item drawer
- Re-issued when the line moves to another module or category, and when a module is renamed
- **Never overwritten** if the engineer typed their own code (supplier / customer part number). `isGeneratedCode()` decides this by matching the code against the prefix of its current module

---

## 4. Calculation rules — all server-side in production

Currently in `app/system/calc.ts`. The client must never compute a stored total.

### 4.1 Line level
```
Cost item total       = qty × unitCost
Expense total         = qty × unitCost
Man-hours             = engineers × manDays × hoursPerDay
Man-days              = engineers × manDays
Man-hour cost         = engineers × manDays × dailyRate
PR line total         = qty × unitCost
PR line estimate      = estimateQty × estimateUnitCost
PR line variance      = PR line total − PR line estimate
```

### 4.2 Rate resolution
```
rateFor(level, department, costType):
  find rate by (level, department), else by level
  costType = Installation → installationDaily / installationHourly
  costType = Engineering  → engineeringDaily / engineeringHourly
```
- Internal man-hour lines always read this table; changing level, department or cost type re-reads it.
- Supplier man-hour lines keep the **quoted** rate and ignore the master.
- Installation & service rate is ~25% above the engineering rate in the current master.

### 4.3 Estimate totals (`estimateTotals`)
```
material           = Σ items in 01, 02, 03, 04, 05
effortEngineering  = Σ man-hour cost where costType = Engineering
effortInstallation = Σ man-hour cost where costType = Installation
engineering        = effortEngineering + effortInstallation
supplierManhour    = Σ man-hour cost where provider = Supplier   (subset of the above)
siteExpense        = Σ expense lines
outsource          = items in 07 + other-cost lines of category Outsource
transportation     = items in 08 + expenses of type Travel, Transportation
accommodation      = items in 09 + expenses of type Accommodation, Per Diem
other              = items in 10 + items in 06 + expenses of the remaining types
installation       = effortInstallation + siteExpense        (reporting tile only)
base               = material + engineering + outsource + transportation
                     + accommodation + other
contingency        = round(base × contingencyRate / 100)
total              = base + contingency
```
Note: `installation` is a reporting figure derived from components already
inside `base`; it is never added again.

### 4.4 Summary blocks (`summaryBlocks`)
Four blocks the team reports on, plus the remainder:
```
Hardware cost              = modules of categories 01, 03, 04, 05
Software cost              = modules of category 02
Engineering / Service cost = man-hour with costType Engineering, grouped by department,
                             plus expenses on engineering packages
Installation cost          = man-hour with costType Installation, grouped by work package,
                             plus the travel / hotel / per diem of those packages
Other project cost         = items 06–10 + other-cost lines + contingency
```
**Summary re-count (override) rules** — the summary sheet is editable:
- Each line carries `unitCost` (what the cost tabs rolled up for one set) and a `qty` that defaults to 1; the shown total is `unitCost × qty`.
- Overrides are keyed per line (`block|category|module`, `block|department|key`, `block|package|key`) and may set `qty`, `unit`, `label`, `remark`.
- A manual line can be added to any block (`manual` override with its own `unitCost`).
- The screen reports `rolledUpTotal` (from the cost tabs), `grandTotal` (after re-count) and `adjusted` (the difference) so the deviation is always explicit.
- Example: a control panel priced once as 1 Set = 168,000 becomes qty 2 → 336,000, and the reconciliation panel shows +168,000 against the cost tabs.

### 4.5 Price age
```
days = today − priceDate
0–90 green · 91–180 orange · >180 red
```

### 4.6 Workload (`weeksFrom`, `weekLoad`, `engineerLoads`)
```
week buckets      = Monday-based weeks over the chosen horizon (8/12/16/24 weeks)
week load (MD)    = manDays × (days of the item inside the week ÷ total calendar days of the item)
utilisation       = week load ÷ CAPACITY_PER_WEEK (5) × 100
tone              = >100% red · 85–100% orange · >0 green
per engineer      = committed MD, average utilisation, peak utilisation,
                    open items, overdue items, next due item
```

---

## 5. Workflows and statuses

### 5.1 Estimate workflow
```
Draft → Engineering Input → Waiting Supplier Price → Estimate Completed
      → Engineering Review → Approved → Locked
Engineering Review → Revision Required → Engineer Update → Resubmit Review
```
- Submit for review is blocked while any **critical validation error** exists.
- Approve is blocked the same way; approval is by the Engineering Manager.
- An approved or locked revision is read-only; editing requires a new revision.

### 5.2 Revision control
- Creating a revision clones every line of the previous revision.
- Revision reasons: Customer Requirement Change · Scope Change · Technical Change · Cost Update · Supplier Price Update · Other
- Compare Revision shows added (green) / removed (red) / changed (orange) lines with qty and cost differences and a total difference.

### 5.3 Purchase requisition workflow *(new)*
```
Draft → Submitted → Approved → Ordered
              ↘ Rejected
```
- Raised after the inquiry becomes a project.
- Created from an estimate: pick the estimate lines to buy; each PR line keeps `estimateItemId` plus the frozen estimated qty and unit cost.
- Lines stay editable until the PR is approved (qty, supplier, price, spec).
- The detail screen shows per-line and total variance, the count of lines with no estimate link, and an explanation list for the approver.

---

## 6. Validation rules (`validateEstimate`)

Critical errors (block submit and approval):
- Invalid quantity (missing or zero)
- Missing unit cost
- Negative cost
- Duplicate cost item (same item code + model + description)
- Engineering man-hour missing
- Cost category not assigned
- Owner not assigned
- Internal man-hour rate does not match the rate master
- Supplier man-hour without a supplier *(new)*
- Supplier man-hour without a quotation *(new)*

Warnings:
- Price reference missing
- Reference price older than 180 days
- Transportation cost not entered
- Engineering man-day unusually high (>20 MD in one activity)
- Supplier man-hour quotation older than 180 days *(new)*
- Installation & service work has no travel cost *(new)*
- Installation & service work has no accommodation cost *(new)*

Passes are also reported (formula correctness, subtotal reconciliation, quantity
and unit cost completeness, category and owner assignment, rate master usage,
supplier man-hour documentation).

---

## 7. Roles and permissions

| Role | Can |
| --- | --- |
| Engineer | Create estimate, input cost, search price, upload supplier quotation, estimate man-hour, update assigned section |
| Project Manager | Assign engineer, review scope, review estimate |
| Engineering Manager | Approve estimate cost, manage engineering rate, view all estimate cost |
| Sales Engineer | Create inquiry, view estimate status; cannot edit engineering cost unless granted |
| Admin | Manage users, master data, system settings |
| Viewer | Read only |

No margin approval exists at any level.

---

## 8. Notifications

New inquiry assigned · Estimate due in 3 days · Estimate due tomorrow · Estimate
overdue · Engineering section not completed · Supplier price still missing ·
Supplier quotation expired · Estimate waiting review · Estimate revision
requested · Estimate approved · New requirement added.

Each rule can be switched on or off in Settings.

---

## 9. Data integrity requirements

- Inquiry number and estimate number cannot duplicate.
- Every estimate has an owner; every revision records its creator.
- Every change records created by / date and updated by / date; approvals record approved by / date.
- An approved revision cannot be edited.
- Cost calculation is server controlled.
- Delete is always a soft delete.
- Audit logs are permanent and cannot be deleted by normal users.
- PR lines keep an immutable snapshot of the estimate figures they were raised from.

---

## 10. Document storage

Attachments (customer RFQ, specification, drawing, layout, meeting record,
supplier quotation, estimate export, engineering reference, manual, other) are
addressed by a **storage key**, not a file path, so Microsoft 365 / SharePoint
today can be swapped for the company NAS later without touching the estimate
database. Folder pattern in Settings: `/{Year}/{Customer}/{InquiryNo}/{DocumentCategory}/`.

---

## 11. What the back end has to provide

### Suggested tables
```
users, customers, suppliers, project_types, cost_categories, cost_subcategories,
modules, brands, units, engineering_activities, engineer_levels,
engineering_rates            (engineering + installation hourly/daily, effective date)
inquiries, inquiry_attachments, inquiry_meetings
estimates, estimate_revisions, estimate_assignments
cost_items                   (category, module, item_code, price source, owner, status)
manhour_lines                (package, cost_type, provider, supplier, quotation_no, rate)
expense_lines                (package, type, cost_type, supplier, reference)
other_cost_lines
summary_overrides            (estimate_id, revision, line_key, qty, unit, label, remark, manual_json)
price_records, price_history
supplier_quotations, quotation_files
missing_prices
work_items                   (resource plan)
purchase_requisitions, pr_lines
audit_log                    (append only)
notifications
```

### Endpoints the UI already implies
- CRUD for inquiry, estimate and every line table, all returning server-computed totals
- `POST /estimates/:id/validate` → the validation result list
- `POST /estimates/:id/revisions` → clone + reason
- `GET /estimates/:id/compare?from=R01&to=R02`
- `POST /estimates/:id/submit | approve | request-revision | reject`
- `GET /price-library?q=` and `GET /price-records/:id/history`
- `POST /quotations` (upload) and link to a cost item or a man-hour line
- `GET /resource-plan?from=&weeks=` → work items + capacity
- `POST /purchase-requisitions` (from estimate item ids) and status transitions
- `GET /reports/:key` for the 13 reports, plus Excel and PDF export

### Rules that must be enforced server side
1. All arithmetic in section 4 — the client only displays returned values.
2. Rate lookup by level + department + cost type; supplier man-hour keeps its quoted rate.
3. Item code generation and re-issue (section 3).
4. Numbering and uniqueness for INQ / EST / SQ / PR.
5. Validation before submit and approve.
6. Locking of approved revisions.
7. Audit entries for every field change, with previous value, new value and reason.
8. Frozen estimate snapshot on PR lines.

---

## 11b. Interface conventions

### Pagination
Every long grid (inquiry, estimate, price library, supplier quotation, purchase
requisition, audit log) uses the same footer: **Showing X to Y of Z entries** on
the left, page buttons on the right (Previous · 1 2 3 … n · Next) with an
ellipsis once there are more than seven pages. Page size is chosen in the grid
header (10 / 25 / 50 / 100) and changing the page size or a filter returns to
page 1. `usePaged(rows, pageSize, page)` in `app/system/ui.tsx` does the slicing
and clamps the page; the back end should expose the same shape — request
`page` and `pageSize`, return the rows plus `total`.

### Language
TH / EN / JP switch in the top bar, wired to `app/system/i18n.ts`. The dictionary
is keyed by the English phrase, so a screen wraps its text in `t("…")` and
anything not yet translated still renders in English rather than showing a
missing key. Translated today: navigation, the login screen, the grid chrome
(Show / entries / pagination) and the inquiry and estimate lists. To extend it,
add a Thai and a Japanese entry to `DICTIONARY`. Data — customer names, project
names, part numbers — is never translated.

## 12. Current implementation status

| Area | State |
| --- | --- |
| All screens listed in section 1 | Built and working on the demonstration dataset |
| Calculations, validation, item codes, workload, PR variance | Implemented in `calc.ts`, pure functions, ready to port |
| Persistence | **None** — state lives in React; a reload restores the seed data |
| API routes in `app/api/*`, `db/schema.ts` | Left over from the earlier prototype, not wired to these screens |
| Auth | Mock login screen only |
| Excel export | Real `.xlsx` writer in `lib/export-xlsx.ts` (estimate and summary sheets) |
| PDF export, file upload, email notification | Buttons and flows exist, no back end behind them |

### Where to look in the code
| Path | Contents |
| --- | --- |
| `app/system/data.ts` | Every type and the demonstration dataset |
| `app/system/calc.ts` | All calculation, validation, item code, workload and PR rules |
| `app/system/ui.tsx` | Icons, badges, panels, tabs, drawer, modal, charts |
| `app/system/App.tsx` | Shell, navigation, routing, global search |
| `app/system/screens/` | One file per screen area |
| `app/globals.css` | Design system, with a "Company template alignment (PEGASUS)" section at the end that re-skins it to the house admin style: white sidebar under a blue logo block, Bootstrap button colours, DataTables-style grids with status-coloured rows |
| `app/system/Brand.tsx` | TOMAS TECH logo as inline SVG (light and dark tone) |
