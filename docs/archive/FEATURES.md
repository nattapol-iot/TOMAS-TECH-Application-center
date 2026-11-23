# IoT Team Center — legacy prototype and full-target feature specification

Engineering Estimate Cost Management System for the TOMAS TECH IoT team.

This document preserves the original prototype and full-target scope. It is not
the release-status source of truth. See `README.md` for the implemented
Production Candidate scope and `docs/PRODUCTION_DEPLOYMENT.md` for its release gates.

- Legacy prototype: React 19 screens and in-repo data under `app/system/`
- Production Candidate: `app/system/ProductionApp.tsx` backed by ASP.NET Core and Microsoft SQL Server
- Production estimate totals and workflow validation run on the server/database; legacy `calc.ts` is demo-only
- Last updated: 30 Aug 2026 (project management, schedule/My Work, BOM/procurement/inventory added)

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
| — | **Projects** | `projects` | `screens/Project.tsx` | Won projects, folder completeness, delivery watch |
| — | **Project Workspace** | `project` | `screens/Project.tsx` | Tabs: Overview, Documents (15 folders), To do list, Schedule, Cost, Team |
| — | **Schedule Workspace** | `schedule` | `screens/Schedule.tsx` | The WBS plan: Sheet + Timeline, Internal/Customer view, Updates, Baseline |
| — | **My Work** | `my-work` | `screens/MyWork.tsx` | Every task assigned to the signed-in member, across all projects, one-click updates |
| Material | **Procurement Dashboard** | `procurement` | `screens/MatDashboard.tsx` | Budget vs commitment vs actual per project, exceptions, supplier performance |
| Material | **BOM list / workspace** | `boms` / `bom` | `screens/Bom.tsx` | BOM tree + 23-column sheet, stock columns, budget trace, allocate, generate PR |
| Material | **Purchase Requisitions** | `purchase` / `pr` / `pr-new` | `screens/Requisition.tsx` | PR list, creation from BOM shortage, approval workspace with rule-added steps |
| Material | **Purchase Orders** | `pos` | `screens/Receiving.tsx` | One PO per supplier from an approved PR, received-vs-ordered tracking |
| Material | **Inventory** | `inventory` | `screens/Inventory.tsx` | Ledger-derived balances, allocation panel, adjustments queue, per-item ledger drawer |
| Material | **Goods Receiving** | `receiving` / `grn` | `screens/Receiving.tsx` | Partial deliveries, accepted-to-stock, damage-to-quarantine |
| Material | **Material Issues** | `issues` / `mir` | `screens/Issue.tsx` | Request → approve → pick → issue → member receipt → return |
| Material | **Approvals** | `mat-approvals` | `screens/MatApprovals.tsx` | Every pending PR / issue / stock-adjustment decision in one queue |
| Organisation | Reports | `reports` | `screens/Admin.tsx` | 13 reports, Excel/PDF export |
| Administration | Master Data | `master` | `screens/Admin.tsx` | 14 master tabs |
| Administration | Engineering Rate | `rates` | `screens/Admin.tsx` | Employee / rate master |
| Administration | Audit Log | `audit` | `screens/Admin.tsx` | Immutable change log |
| Administration | Settings | `settings` | `screens/Admin.tsx` | Users & roles, notifications, numbering, storage, general |

Global chrome: sidebar navigation, global search (Ctrl-K) across inquiry,
estimate, **project and project document**, price library, supplier quotation
and engineer; notification menu;
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

### 2.8 Purchase requisition *(superseded by 2.13 — kept for history)*
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

### 2.11 Project *(new)*

A project is created when an inquiry is won and the customer PO arrives. It
carries the PJ number and reproduces, inside the application, the folder
structure the team already keeps on OneDrive — so nobody has to change how
they file anything.

```
Project        id, no (PJ…), name, customerId, projectType, status,
               managerId, leadEngineerId, members[],
               inquiryNo, estimateId, poNo, poDate,
               startDate, targetDelivery, actualDelivery, progress,
               site, remark, folderPath
ProjectDoc     id, projectId, folder (00–14), name, type, size,
               uploadedBy, uploadedAt, remark
ProjectTask    id, projectId, title, ownerId, due, status, priority,
               folder, remark
ProjectMilestone  id, projectId, name, folder, start, end, progress, owner
```

Status: Planning · Design · Development · Installation · Commissioning ·
Handover · Closed · On Hold.
Task status: Open · In Progress · Blocked · Done. Priority: Urgent · High ·
Normal · Low. Document type: PDF · Excel · Word · PowerPoint · Drawing ·
Image · Video · Other.

**The fifteen standard folders** (`PROJECT_FOLDERS`, fixed list, created with
every project, never renamed by a user):

| Code | Folder | Holds |
| --- | --- | --- |
| 00 | To do list | Open points and actions for the team |
| 01 | Concept Design and Proposal | Concept, proposal and customer presentation |
| 02 | Drawing | Layout, GA, electrical and mechanical drawings |
| 03 | Estimate cost | Approved estimate export and cost sheets |
| 04 | Quote | Supplier quotations collected for the project |
| 05 | PO | Customer PO and purchase orders raised |
| 06 | Specifications and Documentation | Specification, standard and requirement |
| 07 | Development | Program, configuration and source |
| 08 | Schedule | Project plan and milestone tracking |
| 09 | Installation | Site installation record |
| 10 | Report | Test, commissioning and progress reports |
| 11 | Manual and Document | Operation and maintenance manuals |
| 12 | DATA & EXAMPLE | Sample data, test data, examples |
| 13 | Pic and Video | Site photo and video record |
| 14 | Ref | Reference from other projects |

Folders 04 (Quote) and 05 (PO) store **documents only**. No amount from a
customer PO or a commercial quotation is ever read into a field — the golden
rule holds here as everywhere else.

`folderPath` is the human path shown in the header, e.g.
`IoT Team - Documents / Project - 2026 / [PJ260152] Katolec - Ink Jet Machine (Modify)`.
It is display text; the real address is `storage_key` (section 10).

---
### 2.12 Project schedule *(new)*

Replaces both spreadsheets of the old process: the customer-facing "Plan"
sheet AND every member's private "Task list" are ONE task tree per project.
The customer plan is a filter (`visibility`), a member's list is a filter
(`picIds`), and the master Gantt is a projection — a member update cannot
fail to reach the master plan because there is nothing to propagate between.

```
ScheduleTask      id, projectId, parentId ("" = phase), order,
                  kind: phase | task | detail,
                  name, milestone, origin: PM | Member, createdBy,
                  visibility: Customer | Internal,
                  -- PLAN lane (project manager) --
                  planStart, planDays, startMode: manual | linked,
                  predecessorId, lagDays, picIds[], picExternal, planManDays,
                  -- BASELINE lane (written only by freeze) --
                  baselineStart, baselineEnd, baselineDays, baselineRev,
                  -- PROGRESS lane (task owner) --
                  actualStart, actualEnd, forecastEnd, percentDone, status,
                  blockedReason, note, actualManDays, updatedBy, updatedAt
ScheduleUpdate    append-only: field, from, to, comment, requestDays,
                  answer ("" | Accepted | Rejected), answerBy, answerNote
ScheduleBaseline  rev, label, takenAt, takenBy, reason, taskCount, promisedFinish
ScheduleTemplate  the team's standard phase trees (Robot 9 phases, Traceability 6)
HOLIDAYS          Thai public holidays, excluded from every work-day count
```

Row kinds mirror the Excel template exactly:
- **phase** — Excel level 1. A formula row: start `=MIN(children)`, end
  `=MAX(children)`, % from the leaves. Editable by nobody, PM included.
- **task** — Excel level 2. The commitment. The PM owns the PLAN lane, the
  PIC owns the PROGRESS lane. A task keeps its own plan window and forecast
  even when the owner breaks it into details.
- **detail** — Sheet 2's "Work detail ( Please input your task )". Created by
  the member, always `visibility: Internal`, clamped to the parent window.
  The moment a task has details, its % stops being typed and becomes the
  work-day-weighted roll-up of the details.

**Derived, never stored:** WBS numbers, END dates, work-day counts, every
parent roll-up and every variance figure. `resolveSchedule` (calc.ts) is one
pure pass; a stored roll-up is a roll-up that goes stale.

**Money boundary:** the schedule stores `planManDays` / `actualManDays` and
nothing else numeric. No calc function takes a schedule row and a rate.
Effort overrun reads "+6 MD vs plan"; the cost consequence lives on the
estimate, where it already is.

---
### 2.13 BOM, procurement & inventory *(new)*

One chain of custody: **Estimate line → BOM line → PR line → PO line → Goods
receipt → Stock transaction → Material issue** — every link is an id, and the
Budget Trace modal walks the whole chain for any line.

```
MatItem          item master: itemCode, partNo, brand, unit, location,
                 reorderLevel, avgUnitCost, leadTimeDays, preferredSupplier
StockTxn         IMMUTABLE ledger: type (Goods Receipt | Material Issue |
                 Material Return | Stock Transfer | Stock Adjustment | Scrap |
                 Cycle Count Adjustment | Quarantine In/Release), signed qty,
                 bucket (stock | quarantine), refNo, projectId, byId
Reservation      itemId, projectId, bomLineId, qty, owner,
                 status Active | Consumed | Released
Bom / BomLine    section tree (HW.STD/EL/ME/PC/INF, SW, SVC, MP), qtyRequired,
                 estUnitCost, customerSupplied, estimateLineId, owner, nonStock
MatPr / MatPrLine  source BOM, requester, priority, approval steps[],
                 lines with estUnitCost vs unitPrice, priceSource, snapshot stock
MatPo / MatPoLine  one supplier per PO, born from an approved PR
Grn / GrnLine    ordered / previously received / received / accepted / damaged /
                 rejected, lot, serial, location, qcStatus, projectAllocation
Mir / MirLine    bomQty, previouslyIssued, requested, issued, returned +
                 the full actor chain (requested/approved/picked/issued/received by)
StockAdjustment  pending until the inventory controller decides
MatAudit         append-only: actor, role, action, entity, before, after, qty,
                 project, reason, attachment, approver
```

**Balances are never stored.** `stockBalance(itemId)` sums the ledger:
usable = Σ stock-bucket qty · quarantine = Σ quarantine-bucket qty ·
onHand = usable + quarantine · reserved = Σ active reservations ·
available = usable − reserved · onOrder = Σ (PO qty − received).

**BOM line facts** (`bomLineFacts`): allocated = Σ reservations for the line,
issued = Σ MIR issue qty, and
`purchaseRequired = max(0, qtyRequired − allocated − customerSupplied − openOrder)`
— the spec formula, extended with −openOrder so a released PO never resurfaces
as a shortage. Line status priority: Customer Supplied → Fully Fulfilled →
On Order → Reserved → Available in Stock → Partially Available → Purchase Required.

**Project material KPIs** (`matKpis`): approvedBudget = estimate material
total · actual = Σ issues − returns (at avg cost) · commitment = Σ open PO
value · reserved = Σ active reservations value ·
**forecast = actual + commitment + reserved** · remaining = budget − forecast.
A converted or rejected PR adds nothing to the check (`prBudgetCheck`).

---
## 3. Numbering standards

| Document | Pattern | Example | Notes |
| --- | --- | --- | --- |
| Inquiry | `INQ-YYMM-XXXX` | INQ-2608-0001 | Server generated, never typed, unique |
| Estimate | `EST-YYMM-XXXX` | EST-2608-0001 | Server generated, unique |
| Revision | `R00`, `R01`, … | R02 | Per estimate |
| Supplier quotation | `SQ-YYMM-XXXX` | SQ-2608-0012 | |
| Purchase requisition | `PR-YYMM-XXXX` | PR-2608-0001 | *(new)* |
| **Project** *(new)* | `PJYYNNNN` | PJ260152 | `YY` = Buddhist-era style year in use today, `NNNN` running per year; issued when the inquiry is won |
| **Item code** *(new)* | `<CAT>-<MOD>-<NNN>` | ME-IFC-001 | Running number **inside a module** |
| **BOM** *(new)* | `BOM-YYMM-XXXX` + `R##` | BOM-2608-0001 R01 | Revision per BOM |
| **PO** *(new)* | `PO-YYMM-XXXX` | PO-2608-0009 | One supplier per PO |
| **GRN** *(new)* | `GRN-YYMM-XXXX` | GRN-2608-0012 | One per delivery, partial allowed |
| **MIR** *(new)* | `MIR-YYMM-XXXX` | MIR-2608-0008 | Material issue request |
| **ADJ / CC** *(new)* | `ADJ-YYMM-XXXX` | ADJ-2608-0003 | Stock adjustment / cycle count |

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

### 4.7 Schedule arithmetic (`resolveSchedule`) *(new)*

Excel-exact, with `HOLIDAYS` excluded:
```
END        = START + DAYS - 1                  (calendar days)
WORK DAYS  = NETWORKDAYS(START, END)           (Mon–Fri minus HOLIDAYS)
linked FS  : planStart = nextWorkDay(pred.planEnd + 1 + lag)   -- the "=F27+1" formula
leaf window: start = actualStart || planStart
             end   = actualEnd || forecastEnd || planEnd
phase      : start = MIN(children.start), end = MAX(children.end)
task+details: keeps its OWN plan window and forecast; % and status roll up
percent    : Σ(leaf% × leaf.workDays) / Σ(leaf.workDays)  over the whole subtree
status     : all Done → Done · any Blocked → Blocked · any started → In Progress
variance   : networkDaysSigned(baselineEnd, end)   (signed WORK days)
expected%  : elapsed work days / plan work days, clamped 0..100; drift = % - expected
flags      : isLate (end < today, not Done) · needsForecast (past planEnd, no
             forecast) · isStale (In Progress, untouched > 5 work days)
```
Link resolution reads the predecessor's PLAN end, never its actual end — a
member finishing late moves the bar and the forecast, never the customer's
dates. Dependency cycles are detected and flagged, manual dates kept.

### 4.8 Schedule permissions (`schedulePermission`)

| Field | phase | PM on task | PIC on their task | Member's own detail |
| --- | --- | --- | --- | --- |
| plan dates, predecessor, PIC, visibility | computed / PM | edit | read (as text) | edit, clamped to parent |
| % done, status, actuals, forecast, note | rolled | edit | **edit** | **edit** |
| add detail under the task | — | yes | **yes** | sibling |
| freeze / re-baseline, accept requests | PM only | | | |

Non-editable fields render as text, never as disabled inputs, and the store's
`patchTask` re-checks the permission — the rule survives any UI path.
A member can never move a task's dates: they raise a **request for more days**
(`requestDays` on the update log), the PM accepts or rejects, and only an
accepted request changes `planDays`.
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

### 5.4 Project workflow *(new)*

```
Inquiry won → Project created → Planning → Design → Development →
Installation → Commissioning → Handover → Closed
                                     ↘ On Hold (any point, reversible)
```

1. Creating a project copies number, customer, project type, estimate link and
   inquiry number from the approved estimate, then creates the fifteen folders
   in one step — both in the database and on OneDrive / SharePoint.
2. `progress` is maintained on the project; milestone progress is separate and
   lives on `ProjectMilestone` (folder 08).
3. A project is late when `targetDelivery < today` and status is not Closed —
   the row and the delivery date turn red in the list and the header.
4. Purchase requisitions raised against the project's estimate appear on the
   Cost tab; committed value is the sum of PR lines (`qty × unitCost`).
5. Closing a project requires the same document completeness the team already
   expects: report (10) and manual (11) present. Enforce server side when the
   status moves to Handover or Closed.

---
### 5.5 Schedule workflow *(new)*

```
PO arrives → PM applies the phase template (or builds the WBS by hand)
          → assigns PIC per task → freezes Baseline Rev 1 (the promise)
Members   → My Work: percent strip 0·25·50·75·100, Start today, Finish today,
            blocked reason (required), forecast date (required once late),
            + Add my task (their own detail rows, always Internal)
          → Request more days: changes nothing until the PM accepts
PM weekly → Updates tab: request queue + who moved what + not-updated-5-days
          → Baseline tab: row-by-row slip in signed work days
          → Audience toggle → Customer view → export (Customer rows only,
            baseline dates, internal detail and member rows hidden)
Scope change → Re-baseline with a mandatory reason; every rev is kept
```

The Updates feed is append-only and doubles as the audit trail and the
Monday-meeting agenda. Requests are updates with `requestDays > 0` and an
empty `answer` — one array, one queue.

---
### 5.6 Material workflow *(new)*

```
Approved Estimate → Generate BOM → Release BOM (locked; changes need a revision)
 → Check inventory → Reserve available stock (one qty = one project)
 → Purchase shortage → PR (budget check + rule flags) → approval chain
 → PO per supplier → partial/full goods receipt → QC (damage → quarantine)
 → store + reserve for project → material issue request → project approval
 → picking → warehouse issue (ledger − stock, reservations consumed)
 → member receipt confirmation → consumed (actual cost) or returned (+ stock)
```

Approval chain: Requester → Section Owner → Budget Owner → Purchasing →
(Management, auto-added by rule) → PO Creation. Steps are **auto-added** when:
PR exceeds remaining budget · unit price > 10% over estimate · item not in the
estimate (unplanned) · stock available but buying anyway · manual price ·
emergency · value over 1,000,000 THB. Thresholds live in `APPROVAL_THRESHOLDS`
(configurable in Settings later). A comment is mandatory on reject, request-
changes and every flagged approval. **The requester can never decide their own
document** — enforced in the store, not just hidden in the UI.

Hard rules the server must keep: stock balances only via ledger transactions;
damaged/rejected/quarantine never enter Available; receiving over the PO
quantity needs approval; issue requests only by assigned project members, for
BOM items, within the remaining BOM quantity; released BOMs and non-draft PRs
are read-only; audit records are append-only.

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
addressed by a server-generated **storage key**, not a user-supplied file path.
SQL Server stores structured metadata and the integrity hash; the approved company
NAS stores file bytes beneath the API's configured UNC root.

**Project documents** use the standard project-folder taxonomy:

```
<NAS_APP_ROOT> / projects / {ProjectId} / {FolderCode} / {Year} / {Month} / {GeneratedFileId}
```

The browser never connects to SMB directly. It lists, uploads, and downloads through
the authenticated API; the API enforces permissions and project assignment, generates
the relative storage key, streams bytes to/from the UNC root, and records metadata,
SHA-256, uploader, and audit evidence in SQL. Operators and users must not drop files
directly into this application root because files without matching SQL metadata are
orphans. The fifteen logical folders (`00`–`14`) are created as project metadata.

Production release still requires the exact NAS share/application root, a dedicated
least-privileged service identity, Tailscale restart resilience, an approved malware
scan/quarantine control, monitoring, and coordinated SQL/NAS backup and restore tests.

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
projects                     (no, customer, type, status, manager, lead, dates, progress, folder_path)
project_members              (project_id, user_id, role_on_project)
project_folders              (fixed 00–14 reference list)
project_docs                 (project_id, folder, name, type, size, storage_key, uploaded_by, uploaded_at)
project_tasks                (project_id, title, owner, due, status, priority, folder)
project_milestones           (project_id, name, folder, start, end, progress, owner) -- superseded by schedule_tasks
schedule_tasks               (project_id, parent_id, order, kind, name, visibility, origin,
                              plan lane / baseline lane / progress lane — see section 2.12)
schedule_updates             (append only: field, from, to, comment, request_days, answer)
schedule_baselines           (project_id, rev, label, taken_at, taken_by, reason, promised_finish)
schedule_templates           (name, project_type, rows json)
holidays                     (date)
mat_items, stock_txns        (append-only ledger — balances are views, never columns)
reservations                 (item, project, bom_line, qty, status)
boms, bom_lines              (estimate_line_id link, customer_supplied, sections)
mat_prs, mat_pr_lines        (approval steps, price source, unplanned flags)
mat_pos, mat_po_lines, grns, grn_lines
mirs, mir_lines              (full actor chain)
stock_adjustments, mat_audit (append-only)
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
- `POST /projects` (from an approved estimate) → creates the project **and** its fifteen folders
- `GET /projects?status=&customer=&owner=` and `GET /projects/:id`
- `GET /projects/:id/docs?folder=` · `POST /projects/:id/docs` (upload) · `GET /docs/:id/link` (OneDrive share link)
- CRUD for `project_tasks` and `project_milestones`
- `GET /search?q=` must also match project number, project name, PO number and **document file name**
- `GET /projects/:id/schedule` → resolved rows (run `resolveSchedule` server-side)
- `PATCH /schedule-tasks/:id` — enforced by `schedulePermission`, appends to `schedule_updates`
- `POST /schedule-tasks` (add task / member detail) · `DELETE /schedule-tasks/:id` (cascades)
- `POST /projects/:id/baseline` (freeze / re-baseline, reason required after rev 1)
- `POST /schedule-requests/:updateId/answer` (accept adds the days, reject changes nothing)
- `GET /my-work` → the signed-in member's rows across projects, with the urgency flags
- `GET /projects/:id/schedule/export?audience=customer` → values-only workbook, Customer rows, baseline dates
- `POST /boms` (generate from estimate) · `POST /boms/:id/release` · `POST /boms/:id/revisions`
- `POST /reservations` (rejects qty > available) · `DELETE /reservations/:id` (release)
- `POST /prs` (from BOM shortage) · `POST /prs/:id/submit | decide` (comment rules enforced) · `POST /prs/:id/convert`
- `POST /grns` + `POST /grns/:id/confirm` → ledger transactions (accepted → stock, damage → quarantine)
- `POST /mirs` · `decide` · `issue` (ledger + reservation consumption) · `receipt` · `return`
- `POST /stock-adjustments` + `decide` (approved = ledger transaction; balances are never PATCHed)
- `GET /items/:id/ledger` · `GET /trace?bomLineId=` (the whole custody chain)

### Rules that must be enforced server side
1. All arithmetic in section 4 — the client only displays returned values.
2. Rate lookup by level + department + cost type; supplier man-hour keeps its quoted rate.
3. Item code generation and re-issue (section 3).
4. Numbering and uniqueness for INQ / EST / SQ / PR.
5. Validation before submit and approve.
6. Project number issue, folder creation (all fifteen, always) and the OneDrive mirror.
7. No amount is ever read out of a document in folders 04 (Quote) or 05 (PO).
8. All material arithmetic in 2.13, the ledger-only stock rule, the approval
   auto-add rules, and no self-approval anywhere.
9. All schedule arithmetic in 4.7, the permission matrix in 4.8, and the rule that
   an accepted request is the only path by which a member changes a plan date.
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
| `app/system/screens/Project.tsx` | Project list and project workspace (folder browser, to do list, schedule, cost, team) |
| `app/system/screens/Schedule.tsx` | Schedule workspace: banded WBS sheet, timeline with baseline/slip, updates, baseline variance |
| `app/system/screens/MyWork.tsx` | The member's screen: urgent queue, one-click updates, own detail rows, request more days |
| `app/system/store.ts` | Client schedule store — the single write seam; its functions map 1:1 onto the future API |
| `app/system/matstore.ts` | Material store — reservations, PR decisions, PO conversion, receipts, issues, returns, adjustments; every mutation appends audit + ledger rows |
| `app/system/screens/Bom.tsx` + `Requisition.tsx` + `Receiving.tsx` + `Issue.tsx` + `Inventory.tsx` + `MatDashboard.tsx` + `MatApprovals.tsx` | The material module screens |
| `app/system/session.ts` | Who is signed in (login role → demonstration user) |
| `app/globals.css` | Design system, with a "Company template alignment (PEGASUS)" section at the end that re-skins it to the house admin style: white sidebar under a blue logo block, Bootstrap button colours, DataTables-style grids with status-coloured rows |
| `app/system/Brand.tsx` | TOMAS TECH logo as inline SVG (light and dark tone) |
