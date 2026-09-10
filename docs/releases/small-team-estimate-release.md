# Small-team Inquiry / Estimate release — 2026-09-10

## Changes

- Inquiry opens the engineer's own queue; managers can use the team queue. Each row shows the responsible owner, deadline and next step. The existing schema requires an owner at creation, so no fictional unassigned records are shown.
- Excel import stores the original file against the estimate revision, with a SHA-256 checksum and authenticated download. Repeated imports do not duplicate costs/files; failed transactions clean staged files. Older imports without stored originals are labelled explicitly.
- Published module templates cannot be overwritten. Copy to a new draft, edit and publish; only users with master-data write permission can publish. Estimates accept published templates only.
- Price references show source estimate revision, quantity/unit/date and available original imports. Export filenames include estimate number, revision and status.
- Overhead uses monthly shared budget divided by normal internal project hours, multiplied by the estimate's internal hours. No example rate is inserted into company data. Policy snapshots belong to individual revisions; submission records are immutable.
- Inquiry shows Overhead separately. Project handover summaries retain the amount and policy basis, so their cost components reconcile to the total.
- Keep the existing nine Estimate tabs and tables. Add guidance and provenance inside the existing workflow.

## Installation boundary

The local TeamTest API currently connects to **IoTTeamCenterTeamTest on the company SQL server**, not an isolated local database. A read-only check found schema 38 `supplier_quotation_lines` and schema 39 `NAS storage connection draft settings`. The new migration is therefore **040_estimate_overhead_policy.sql**.

The configured runtime account has no CREATE TABLE, database-owner or BACKUP permission. No company migration or runtime switch was performed. Apply migration 040 with an authorized migration account after backing up the exact target database, then deploy the matching API and frontend together. Do not replace existing migrations 38/39 or change the NAS connection. Recheck the current schema before deployment in case another release has reserved 40.

Do not deploy the new API alone before migration 040: it reads the new overhead tables/view columns. Fresh isolated test databases can apply 040 after the repository's 037; the migration does not claim that company-specific 038/039 were installed there.

## Verification

- Queue, UX routing, workbook parser and revision contract: 11 tests passed.
- Backend unit tests: 108 passed.
- Isolated SQL/API flow passed: draft created before a policy stayed Missing on submission after policy creation; a new estimate captured the active policy; submit, approval, Inquiry read and Project creation retained matching totals and policy provenance. Synthetic fixture: direct 800 + contingency 40 + overhead 1,200 = 2,040 THB. No fixture values were applied to company data.
- Original-file SQL integration: byte-for-byte download/checksum, duplicate import, wrong estimate/hash, stale-write cleanup and published-template overwrite rejection passed on a disposable database including migration 040.
- Scoped frontend and backend TypeScript, targeted ESLint, and frontend production build passed after the Inquiry/handover reconciliation changes.
- Repository-wide TypeScript remains affected by existing archived `outputs/company-cutover` dependencies/type drift. This is separate from the scoped application check.

## Practical limits

- Actual team budget and normal direct hours still need to be entered by the cost owner. Check that labor rates do not already contain those shared costs.
- With no policy configured, estimates display a Missing warning and can follow the existing submission flow. This is distinct from an explicit zero-budget policy. Applying a policy to an existing revision is explicit; changing a captured policy requires a new revision.
- Stored originals use the configured document storage; these tests prove local storage behavior, not company NAS connectivity.
- No timed engineer usability trial has been conducted. Faster file lookup and clearer responsibility are intended improvements, not a measured time-saving claim.
- Historical reference prices still require checking supplier validity, quantities and conditions.

## Reproduce isolated integration tests

Requires a local SQL Server test administrator and `sqlcmd`. Both scripts allocate randomly named test databases and remove only those databases and their test storage after execution.

From the repository root:

```powershell
node --import ./backend-node/node_modules/tsx/dist/loader.mjs backend-node/tests/estimate-original-integration.ts
```

From `backend-node`:

```powershell
node --import tsx tests/overhead-integration.ts
```
