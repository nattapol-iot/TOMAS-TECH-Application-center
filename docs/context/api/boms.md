# boms

[Module](../modules/procurement.md) · [Index](../../../AGENTS.md)

Evidence: source snapshot `049482a7`; generated, do not edit. [backend-node/src/routes/boms.ts](<../../../backend-node/src/routes/boms.ts>). Ranges are hints: search symbol after edits.

## API operations

| Method | Path | Source lines |
|---|---|---|
| GET | `/api/v1/boms` | 35–50 |
| GET | `/api/v1/boms/:id` | 52–95 |
| POST | `/api/v1/boms` | 97–123 |
| POST | `/api/v1/boms/:id/release` | 125–134 |
| POST | `/api/v1/boms/:id/reservations` | 136–162 |
| POST | `/api/v1/boms/:id/reservations/:reservationId/release` | 164–173 |

## Named functions

| Symbol | Source | Lines |
|---|---|---|
| `todayIn` | [backend-node/src/routes/boms.ts](<../../../backend-node/src/routes/boms.ts>) | 19–22 |
| `quantity` | [backend-node/src/routes/boms.ts](<../../../backend-node/src/routes/boms.ts>) | 23–27 |
| `header` | [backend-node/src/routes/boms.ts](<../../../backend-node/src/routes/boms.ts>) | 28–32 |
| `registerBomRoutes` | [backend-node/src/routes/boms.ts](<../../../backend-node/src/routes/boms.ts>) | 34–174 |

## Direct local dependencies

- [backend-node/src/config.ts](<../../../backend-node/src/config.ts>)
- [backend-node/src/db.ts](<../../../backend-node/src/db.ts>)
- [backend-node/src/document-number.ts](<../../../backend-node/src/document-number.ts>)
- [backend-node/src/errors.ts](<../../../backend-node/src/errors.ts>)
- [backend-node/src/http.ts](<../../../backend-node/src/http.ts>)
- [backend-node/src/material-audit.ts](<../../../backend-node/src/material-audit.ts>)
- [backend-node/src/procurement-rules.ts](<../../../backend-node/src/procurement-rules.ts>)
- [backend-node/src/project-scope.ts](<../../../backend-node/src/project-scope.ts>)
- [backend-node/src/users.ts](<../../../backend-node/src/users.ts>)

## SQL references (literal scan, not a complete schema or write-set)

`dbo.bom_lines`, `dbo.boms`, `dbo.cost_items`, `dbo.estimates`, `dbo.mat_items`, `dbo.mat_pr_lines`, `dbo.mat_prs`, `dbo.mir_lines`, `dbo.mirs`, `dbo.project_members`, `dbo.projects`, `dbo.reservations`, `dbo.stock_txns`, `dbo.users`, `dbo.v_estimate_totals`, `dbo.v_item_balances`

## Change boundary

Read the selected handler and helpers it calls, then its caller in api-client.ts. Verify permission checks, record scope, transaction, rowVersion and audit on that path; a route name alone does not prove authorization. Dynamic routes/SQL, helper side effects and runtime config require source inspection.
