# material-issues

[Module](../modules/inventory.md) · [Index](../../../AGENTS.md)

Evidence: source snapshot `5eb9231a`; generated, do not edit. [backend-node/src/routes/material-issues.ts](<../../../backend-node/src/routes/material-issues.ts>). Ranges are hints: search symbol after edits.

## API operations

| Method | Path | Source lines |
|---|---|---|
| GET | `/api/v1/material-issues` | 39–44 |
| GET | `/api/v1/material-issues/:id` | 46–53 |
| POST | `/api/v1/material-issues` | 55–57 |
| POST | `/api/v1/material-issues/:id/decide` | 59–60 |
| POST | `/api/v1/material-issues/:id/issue` | 62–70 |
| POST | `/api/v1/material-issues/:id/receipt` | 72–72 |
| POST | `/api/v1/material-issues/:id/returns` | 74–74 |

## Named functions

| Symbol | Source | Lines |
|---|---|---|
| `todayIn` | [backend-node/src/routes/material-issues.ts](<../../../backend-node/src/routes/material-issues.ts>) | 16–16 |
| `qty` | [backend-node/src/routes/material-issues.ts](<../../../backend-node/src/routes/material-issues.ts>) | 17–18 |
| `header` | [backend-node/src/routes/material-issues.ts](<../../../backend-node/src/routes/material-issues.ts>) | 19–19 |
| `lines` | [backend-node/src/routes/material-issues.ts](<../../../backend-node/src/routes/material-issues.ts>) | 20–22 |
| `insertLine` | [backend-node/src/routes/material-issues.ts](<../../../backend-node/src/routes/material-issues.ts>) | 24–32 |
| `consumeReservations` | [backend-node/src/routes/material-issues.ts](<../../../backend-node/src/routes/material-issues.ts>) | 34–36 |
| `registerMaterialIssueRoutes` | [backend-node/src/routes/material-issues.ts](<../../../backend-node/src/routes/material-issues.ts>) | 38–75 |

## Direct local dependencies

- [backend-node/src/config.ts](<../../../backend-node/src/config.ts>)
- [backend-node/src/db.ts](<../../../backend-node/src/db.ts>)
- [backend-node/src/document-number.ts](<../../../backend-node/src/document-number.ts>)
- [backend-node/src/errors.ts](<../../../backend-node/src/errors.ts>)
- [backend-node/src/http.ts](<../../../backend-node/src/http.ts>)
- [backend-node/src/material-audit.ts](<../../../backend-node/src/material-audit.ts>)
- [backend-node/src/project-scope.ts](<../../../backend-node/src/project-scope.ts>)
- [backend-node/src/stock-ledger.ts](<../../../backend-node/src/stock-ledger.ts>)
- [backend-node/src/users.ts](<../../../backend-node/src/users.ts>)

## SQL references (literal scan, not a complete schema or write-set)

`dbo.bom_lines`, `dbo.boms`, `dbo.mat_items`, `dbo.mir_lines`, `dbo.mirs`, `dbo.project_members`, `dbo.projects`, `dbo.reservations`, `dbo.stock_txns`, `dbo.users`, `dbo.v_item_balances`

## Change boundary

Read the selected handler and helpers it calls, then its caller in api-client.ts. Verify permission checks, record scope, transaction, rowVersion and audit on that path; a route name alone does not prove authorization. Dynamic routes/SQL, helper side effects and runtime config require source inspection.
