# reports

[Module](../modules/reports.md) · [Index](../../../AGENTS.md)

Evidence: source snapshot `a2113e08`; generated, do not edit. [backend-node/src/routes/reports.ts](<../../../backend-node/src/routes/reports.ts>). Ranges are hints: search symbol after edits.

## API operations

| Method | Path | Source lines |
|---|---|---|
| GET | `/api/v1/reports/project-cost` | 39–93 |
| GET | `/api/v1/reports/inventory-value` | 95–141 |
| GET | `/api/v1/reports/supplier-performance` | 143–204 |
| GET | `/api/v1/reports/pr-cycle-time` | 206–253 |

## Named functions

| Symbol | Source | Lines |
|---|---|---|
| `todayIn` | [backend-node/src/routes/reports.ts](<../../../backend-node/src/routes/reports.ts>) | 10–14 |
| `shift` | [backend-node/src/routes/reports.ts](<../../../backend-node/src/routes/reports.ts>) | 16–21 |
| `optionalInt` | [backend-node/src/routes/reports.ts](<../../../backend-node/src/routes/reports.ts>) | 23–28 |
| `range` | [backend-node/src/routes/reports.ts](<../../../backend-node/src/routes/reports.ts>) | 30–36 |
| `registerReportRoutes` | [backend-node/src/routes/reports.ts](<../../../backend-node/src/routes/reports.ts>) | 38–254 |

## Direct local dependencies

- [backend-node/src/config.ts](<../../../backend-node/src/config.ts>)
- [backend-node/src/db.ts](<../../../backend-node/src/db.ts>)
- [backend-node/src/errors.ts](<../../../backend-node/src/errors.ts>)
- [backend-node/src/http.ts](<../../../backend-node/src/http.ts>)
- [backend-node/src/project-scope.ts](<../../../backend-node/src/project-scope.ts>)
- [backend-node/src/users.ts](<../../../backend-node/src/users.ts>)

## SQL references (literal scan, not a complete schema or write-set)

`dbo.estimates`, `dbo.grn_lines`, `dbo.grns`, `dbo.mat_items`, `dbo.mat_po_lines`, `dbo.mat_pos`, `dbo.mat_pr_approval_steps`, `dbo.mat_pr_lines`, `dbo.mat_prs`, `dbo.project_members`, `dbo.projects`, `dbo.reservations`, `dbo.stock_txns`, `dbo.suppliers`, `dbo.v_estimate_totals`

## Change boundary

Read the selected handler and helpers it calls, then its caller in api-client.ts. Verify permission checks, record scope, transaction, rowVersion and audit on that path; a route name alone does not prove authorization. Dynamic routes/SQL, helper side effects and runtime config require source inspection.
