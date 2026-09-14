# estimate-erp

[Module](../modules/estimate-erp.md) · [Index](../../../AGENTS.md)

Evidence: source snapshot `9ed694e3`; generated, do not edit. [backend-node/src/routes/estimate-erp.ts](<../../../backend-node/src/routes/estimate-erp.ts>). Ranges are hints: search symbol after edits.

## API operations

| Method | Path | Source lines |
|---|---|---|
| GET | `/api/v1/estimates/:id/erp-summary` | 174–179 |
| PUT | `/api/v1/estimates/:id/erp-mappings` | 181–266 |
| POST | `/api/v1/estimates/:id/erp-export-events` | 268–311 |

## Named functions

| Symbol | Source | Lines |
|---|---|---|
| `loadSummary` | [backend-node/src/routes/estimate-erp.ts](<../../../backend-node/src/routes/estimate-erp.ts>) | 106–119 |
| `parseMappings` | [backend-node/src/routes/estimate-erp.ts](<../../../backend-node/src/routes/estimate-erp.ts>) | 128–152 |
| `parseExportEvent` | [backend-node/src/routes/estimate-erp.ts](<../../../backend-node/src/routes/estimate-erp.ts>) | 154–171 |
| `registerEstimateErpRoutes` | [backend-node/src/routes/estimate-erp.ts](<../../../backend-node/src/routes/estimate-erp.ts>) | 173–312 |

## Direct local dependencies

- [backend-node/src/estimate-labor-category.ts](<../../../backend-node/src/estimate-labor-category.ts>)
- [backend-node/src/audit.ts](<../../../backend-node/src/audit.ts>)
- [backend-node/src/db.ts](<../../../backend-node/src/db.ts>)
- [backend-node/src/errors.ts](<../../../backend-node/src/errors.ts>)
- [backend-node/src/estimate-erp.ts](<../../../backend-node/src/estimate-erp.ts>)
- [backend-node/src/http.ts](<../../../backend-node/src/http.ts>)
- [backend-node/src/types.ts](<../../../backend-node/src/types.ts>)
- [backend-node/src/users.ts](<../../../backend-node/src/users.ts>)

## SQL references (literal scan, not a complete schema or write-set)

`dbo.cost_items`, `dbo.estimate_erp_mappings`, `dbo.estimates`, `dbo.expense_lines`, `dbo.manhour_lines`, `dbo.other_cost_lines`, `dbo.permissions`, `dbo.role_permissions`, `dbo.roles`, `dbo.suppliers`, `dbo.v_estimate_totals`

## Change boundary

Read the selected handler and helpers it calls, then its caller in api-client.ts. Verify permission checks, record scope, transaction, rowVersion and audit on that path; a route name alone does not prove authorization. Dynamic routes/SQL, helper side effects and runtime config require source inspection.
