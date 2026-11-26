# purchase-units

[Module](../modules/procurement.md) · [Index](../../../AGENTS.md)

Evidence: source snapshot `fd82cb38`; generated, do not edit. [backend-node/src/routes/purchase-units.ts](<../../../backend-node/src/routes/purchase-units.ts>). Ranges are hints: search symbol after edits.

## API operations

| Method | Path | Source lines |
|---|---|---|
| GET | `/api/v1/projects/:projectId/purchase-units` | 66–110 |
| POST | `/api/v1/projects/:projectId/purchase-units` | 112–126 |
| PUT | `/api/v1/purchase-units/:id` | 133–149 |
| POST | `/api/v1/purchase-units/:id/remove` | 152–165 |

## Named functions

| Symbol | Source | Lines |
|---|---|---|
| `round2` | [backend-node/src/routes/purchase-units.ts](<../../../backend-node/src/routes/purchase-units.ts>) | 19–19 |
| `budgetOf` | [backend-node/src/routes/purchase-units.ts](<../../../backend-node/src/routes/purchase-units.ts>) | 20–23 |
| `unitInput` | [backend-node/src/routes/purchase-units.ts](<../../../backend-node/src/routes/purchase-units.ts>) | 24–29 |
| `moduleBudgetsOf` | [backend-node/src/routes/purchase-units.ts](<../../../backend-node/src/routes/purchase-units.ts>) | 32–39 |
| `assertFits` | [backend-node/src/routes/purchase-units.ts](<../../../backend-node/src/routes/purchase-units.ts>) | 42–52 |
| `assertNotTaken` | [backend-node/src/routes/purchase-units.ts](<../../../backend-node/src/routes/purchase-units.ts>) | 54–61 |
| `duplicate` | [backend-node/src/routes/purchase-units.ts](<../../../backend-node/src/routes/purchase-units.ts>) | 62–62 |
| `registerPurchaseUnitRoutes` | [backend-node/src/routes/purchase-units.ts](<../../../backend-node/src/routes/purchase-units.ts>) | 64–166 |

## Direct local dependencies

- [backend-node/src/db.ts](<../../../backend-node/src/db.ts>)
- [backend-node/src/errors.ts](<../../../backend-node/src/errors.ts>)
- [backend-node/src/http.ts](<../../../backend-node/src/http.ts>)
- [backend-node/src/material-audit.ts](<../../../backend-node/src/material-audit.ts>)
- [backend-node/src/procurement-rules.ts](<../../../backend-node/src/procurement-rules.ts>)
- [backend-node/src/project-scope.ts](<../../../backend-node/src/project-scope.ts>)
- [backend-node/src/users.ts](<../../../backend-node/src/users.ts>)

## SQL references (literal scan, not a complete schema or write-set)

`dbo.bom_lines`, `dbo.boms`, `dbo.cost_items`, `dbo.mat_pr_lines`, `dbo.mat_prs`, `dbo.project_purchase_units`

## Change boundary

Read the selected handler and helpers it calls, then its caller in api-client.ts. Verify permission checks, record scope, transaction, rowVersion and audit on that path; a route name alone does not prove authorization. Dynamic routes/SQL, helper side effects and runtime config require source inspection.
