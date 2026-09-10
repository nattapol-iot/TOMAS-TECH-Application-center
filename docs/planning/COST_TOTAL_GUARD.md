# Estimate total boundary hardening

Status: Local implementation and SQL boundary verification complete, 2026-09-10. Production acceptance remains open.
Baseline: candidate `1c135def97b1258e86b73f76f9eb73a225b5ea31`.

## Defect and acceptance

Accepted hours and an individually valid overhead rate can multiply into a value that cannot fit SQL `decimal(19,4)`. Previously a line mutation could commit before a later totals read failed. Reproduced on a new private SQL LocalDB instance using 100,000,000 hours and a 100,000,000 rate; SQL returned arithmetic overflow8115.

Every operation that changes a current estimate's monetary result must evaluate the complete canonical totals inside the same transaction before commit. Unsupported totals must reject with a stable API error and roll back rows, revision/version changes, audit and any staged original workbook. Valid estimates must retain the existing rounding and missing/zero-policy semantics.

## Implementation delivered

1. Add forward migration042 with `dbo.assert_estimate_totals`. Materialize every monetary output of `v_estimate_totals` into `decimal(19,4)` storage so the SQL optimizer cannot skip the offending expression. Translate overflow into domain SQL error51420. Do not rewrite migration040 or replace invalid amounts with NULL/zero.
2. Preflight current estimates during migration; existing invalid data blocks migration for explicit reconciliation. Preserve exact migration identity checks and add least-privilege execution grants.
3. Invoke the guard after each logical cost, man-hour, expense, other-cost, template application, Excel import, contingency and overhead mutation. Add checks for create/revision, submit/approve and project handover. Bulk operations validate once after the batch; existing estimate locks and transaction rollback remain authoritative.
4. Map the domain SQL error to HTTP422 `estimate_total_out_of_range`. Template definition edits do not change an estimate and do not need the guard.
5. Verify actual SQL boundaries, migration upgrade/idempotence/failure, role grants and rollback on a private synthetic database; verify Node guard wiring/error behavior and author API integration cases. Run typecheck, lint and tests, then independent code and architecture review.

SQL arithmetic remains in the canonical view to preserve existing behavior. SQL precision and scale rules can reduce intermediate scale; simply increasing every expression to `decimal(38,4)` would not prove equivalence. Reference: [Microsoft SQL precision, scale and length](https://learn.microsoft.com/en-us/sql/t-sql/data-types/precision-scale-and-length-transact-sql?view=sql-server-ver17).

## Test boundary

The leader created private LocalDB instance `IoTCandidate20260910` for this task, separate from the machine's existing SQL Server instances. Initial regression testing used synthetic database `IoTTeamCenter_CostBoundaryCI_6bb7585b15f548a6a5512ee66e8d691a`. The reproducible runner creates a new random private instance and three synthetic databases for upgrade, fresh deployment and invalid-baseline preflight. All databases and instances created by this task were removed after verification; the existing `MSSQLLocalDB` instance was preserved. No company records or deployed services were used. SQL LocalDB testing does not replace the Node SQL-login CI suite or production-version staging/UAT acceptance.

## Evidence

| Verification | Result |
| --- | --- |
| Full root `npm test` | PASS: lint, typecheck, 224 passing tests, 0 failures; 1 SQL integration explicitly skipped |
| Backend typecheck / unit / build | PASS: 131 passing tests, 0 failures, 0 skips |
| Private SQL LocalDB | PASS on SQL17.0.4025.3: 041→042 upgrade, repeated042, full fresh deployment |
| SQL boundary fixture | PASS: exact `999999999999999.9999`, just below it, direct/overhead/contingency/final overflow, missing/zero semantics, restricted-role EXECUTE |
| Invalid-baseline preflight | PASS: 51420 identifies the offending estimate; no schema42/procedure remains after failure; existing synthetic source rows remain intact |
| Fixture cleanup | PASS: temporary fixture changes rolled back and all task-owned databases/instances removed |
| Migration040 | Unchanged from the baseline commit |

Reproduce the SQL checks on Windows with installed SQL LocalDB and sqlcmd:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/Test-EstimateTotalBoundariesLocalDb.ps1
```

The runner supplies `-I` for indexed/computed-column SET requirements; standalone fixtures also explicitly set ANSI_NULLS and QUOTED_IDENTIFIER. SQL scripts refuse non-test database names. Logs from this run are in the workstation temporary directory: `iot-cost-guard-root.log`, `iot-cost-guard-backend.log`, `iot-cost-guard-sql.log`.

## Write-path inventory

| Source file under backend-node/src/routes | Guard placement |
| --- | --- |
| estimate-cost-write.ts | Shared touch boundary after cost create/update/remove and template bulk application |
| estimate-workspace-write.ts | Shared touch after man-hour/expense/other mutations; contingency update |
| estimate-excel-import.ts | After imported rows, before estimate touch/audit/commit |
| overhead-policies.ts | After snapshot selection, before reading totals |
| estimates.ts | Create, submit/approve, both revision paths before old snapshots and after new line clones |
| site-visit-reports.ts | Secondary estimate creation before audit/commit |
| projects.ts | Before project handover files or records are created |

## Remaining gates and review

Independent code review: 25 files, no findings, APPROVE scoped local code. Independent architecture review: 29 files, CLEAR for local COST-01 integration, WATCH for production. Combined verdict: APPROVE this local change; no production approval.

The invariant is invoked by the Node application. Privileged direct SQL and legacy writers can bypass it; future monetary write paths must call the shared guard. This is an explicit operational boundary, not database-wide DML enforcement. Existing invalid estimates block migration for reconciliation; this change does not repair business data automatically. Raw SQL8115 from persisted line calculations before the guard keeps the existing generic HTTP422 response; aggregate51420 has the estimate-specific response.

The Node SQL-login API scenarios for failed man-hour/contingency writes are authored but have not executed here. SQL Server2022 CI, full application-role acceptance, staging UAT and release/recovery checks remain open. COST-01's aggregate defect is fixed locally; the complete cost/business acceptance task is not closed.

Migration preflight scans every current estimate in one transaction. Rehearse its duration and locking with representative staging data, and reconcile any rejected estimates before scheduling deployment. Markdown navigation also passed: 113 documents inspected with no missing local targets.
