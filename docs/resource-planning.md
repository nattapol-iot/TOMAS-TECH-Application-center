# Production Resource Plan & Workload

Implemented 2026-09-05. Open **Resource Plan** in the real application (not /demo).

## Features

- Assignment timeline with progress bars, overdue highlighting, today marker,
  configurable start date and 8/12/16/24-week horizons.
- Real Inquiry owners, Estimate owners/section assignees/support, and leaf Project
  Schedule tasks/PICs. Source lists are fully paginated; workspace requests use
  bounded concurrency. Existing API permissions and project scope remain in force.
- Engineer/work/customer search, department/type/focus filters and name/peak/effort
  sorting; weekly capacity heatmap, engineer summary, department chart and alerts.
- Table page size defaults to **50** (10/25/50/100), with pagination.
- Click work to open its exact Inquiry, Estimate or Project Schedule.
- Assign an Inquiry with the existing audited, row-version-checked assignment API.
- Persist pre-sales planning start/end dates and effort; persist individual capacity.
- Real UTF-8 CSV export of filtered work and weekly man-days; formula-injection-safe.

## Data and permissions

Migration **019_resource_planning.sql** adds resource_capacity and resource_effort;
no existing business data is rewritten. It depends on 017, independently of Claude's
018 signing work. The UAT database has 019 applied. Fresh installations must include
019 after core migrations. The shared fresh-deployment runner now includes 019 and
verifies all 19 migrations; the fresh SQL integration test passed on 2026-09-05.

GET /api/v1/resource-planning requires schedule.read. It filters pre-sales effort by
the matching inquiry.read/estimate.read permission and excludes deleted sources.
PUT /api/v1/resource-planning/capacity/:userId requires schedule.plan.
PUT /api/v1/resource-planning/Inquiry/:id or /Estimate/:id also requires the respective
source write permission. Server validates active references, amounts, date spans and
expected row version. SERIALIZABLE transactions, key-range locks and unique keys
prevent concurrent duplicate creates. Updates append to the existing audit log.

## Calculation policy

- No seeded effort or capacity. Unconfigured values display **—**.
- Capacity is explicitly saved, 0–5 days/week on a Monday–Friday calendar;
  company holidays reduce availability. Personal leave is not deducted in this version.
- Planned effort is distributed across working days. Horizon totals only include
  overlap. Missing effort/dates are flagged and excluded; percentages for incomplete
  plans are therefore lower bounds, not certified free capacity.
- Estimate effort means preparing the estimate, NOT the delivery engineering
  man-days being priced. It is divided equally across distinct assignment owners
  and support users (header owner is the fallback).
- Project effort is taken from leaf schedule tasks and divided across PICs.
  Date/PIC changes are made in the source Project Schedule.
- Inquiry and Estimate effort represent separate discovery/estimating activities.
  Do not enter the same effort twice. Document dates are used until a planning
  interval is explicitly saved.

## Verification

- 8 real calculation/export tests in tests/resource-planning.test.mjs.
- 3 Fastify permission/validation tests in backend-node/tests/resource-planning.test.ts.
- Audit JSON regression test: scalar audit values use a value envelope because
  SQL Server ISJSON's default mode accepts only object/array roots. This fixed an
  existing Estimate-create transaction failure; object/array audit format is preserved.
- Node suite: 20/20 at verification (includes concurrent Signing tests).
- Frontend and Node type checks and frontend production build passed.
- UAT script tests real SQL persistence, conflict rejection, estimate effort,
  capacity and Viewer permission denial, using clearly identified UAT records.
- Fixture: INQ-2609-0005 / EST-2609-0006, owner Revision Owner Test;
  5 + 8 MD over two weeks at 5 MD/week yields 130% each week.
- No test credentials or signing secrets are committed.
- Final full root `npm test`: **78/78**, no skips, including the disposable fresh
  SQL database material/schedule/reporting integration flow. Lint and typecheck passed.
- Final Node tests **20/20** and Node build passed. Team Test frontend build passed
  (existing bundle-size/static route-classification warnings remain).
- Browser verified real timeline/workload, 130% weekly load, the default Show 50
  control, exact Inquiry and Estimate drill-down, and a successful effort save/reload.
- CSV serialization is unit-tested; the in-app browser did not emit a download
  event when clicking Export. Actual file receipt in a normal browser is not yet
  verified. Do not treat that click alone as proof of successful download.

## Runtime diagnostic result

Earlier SQL-backed API calls intermittently timed out, including a save that had
already committed. After an ordinary API restart and the user reporting Claude had
stopped, readiness checks and screen reads/writes completed normally. Independent
queries using the exact runtime Database implementation and role were also fast.
The underlying intermittent timeout cause is **not proven**; no database pooling,
permission or timeout settings were relaxed. The temporary thread-pool diagnostic
override was removed by restarting normally. On a save timeout, refresh before
retrying because the transaction may already have committed.

## Release coordination

LAN: http://192.168.1.160:3000/
Resource-only API release: 20260905-104136-resource, based on verified
20260905-095826 plus the resource-planning route and audit scalar fix.
This deliberately does not activate unfinished Signing work from the shared tree.
Frontend uses Start-TeamTestLanFrontend.ps1 to preserve baked-in Team Test settings.
Do not run a generic build against the live frontend's shared dist directory.

## Translation handoff

The screen uses the shared t() context; existing TH/JP keys are reused.
New English fallbacks remain for Claude's dictionary lane, principally:
Weekly capacity; Plan effort; Work items; Within selected horizon;
Missing effort; Set weekly capacity; Working days per week (Monday–Friday);
No scheduled work in this horizon; Open the source to change owners or project dates;
planning calculation/partial-data notes. Source file contains exact full keys.

## Using the module

1. Set capacity for relevant members through Weekly capacity.
2. Open Work items and choose Plan effort for Inquiry/Estimate work.
3. Manage Project dates/PICs in the linked schedule.
4. Review Timeline and Workload, filter overloaded or overdue work.
5. Export the current filtered plan as CSV.
