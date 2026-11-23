# boms

[Module](../modules/procurement.md) · [Index](../../../AGENTS.md)

Evidence: source snapshot `f598047a`; generated, do not edit. [backend-node/src/routes/boms.ts](<../../../backend-node/src/routes/boms.ts>). Ranges are hints: search symbol after edits.

## API operations

| Method | Path | Source lines |
|---|---|---|
| GET | `/api/v1/boms` | 42–60 |
| GET | `/api/v1/boms/:id` | 62–107 |
| POST | `/api/v1/boms` | 109–135 |
| POST | `/api/v1/boms/:id/release` | 137–152 |
| POST | `/api/v1/boms/:id/reservations` | 154–180 |
| POST | `/api/v1/boms/:id/reservations/:reservationId/release` | 182–191 |

## Named functions

| Symbol | Source | Lines |
|---|---|---|
| `threshold` | [backend-node/src/routes/boms.ts](<../../../backend-node/src/routes/boms.ts>) | 24–24 |
| `todayIn` | [backend-node/src/routes/boms.ts](<../../../backend-node/src/routes/boms.ts>) | 26–29 |
| `quantity` | [backend-node/src/routes/boms.ts](<../../../backend-node/src/routes/boms.ts>) | 30–34 |
| `header` | [backend-node/src/routes/boms.ts](<../../../backend-node/src/routes/boms.ts>) | 35–39 |
| `registerBomRoutes` | [backend-node/src/routes/boms.ts](<../../../backend-node/src/routes/boms.ts>) | 41–192 |

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

`dbo.bom_lines`, `dbo.boms`, `dbo.cost_items`, `dbo.estimates`, `dbo.mat_items`, `dbo.mat_pr_lines`, `dbo.mat_prs`, `dbo.mir_lines`, `dbo.mirs`, `dbo.procurement_settings`, `dbo.project_members`, `dbo.projects`, `dbo.reservations`, `dbo.stock_txns`, `dbo.users`, `dbo.v_item_balances`

## Change boundary

Read the selected handler and helpers it calls, then its caller in api-client.ts. Verify permission checks, record scope, transaction, rowVersion and audit on that path; a route name alone does not prove authorization. Dynamic routes/SQL, helper side effects and runtime config require source inspection.
