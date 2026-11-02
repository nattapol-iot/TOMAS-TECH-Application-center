# estimate-erp

[Module](../modules/estimate-erp.md) · [Index](../../../AGENTS.md)

Evidence: source snapshot `fb213996`; generated, do not edit. [backend-node/src/routes/estimate-erp.ts](<../../../backend-node/src/routes/estimate-erp.ts>). Ranges are hints: search symbol after edits.

## API operations

| Method | Path | Source lines |
|---|---|---|
| GET | `/api/v1/estimates/:id/erp-summary` | 378–383 |
| POST | `/api/v1/estimates/:id/erp-send` | 387–399 |
| POST | `/api/v1/estimates/:id/erp-refresh` | 401–409 |
| PUT | `/api/v1/estimates/:id/erp-mappings` | 411–490 |
| POST | `/api/v1/estimates/:id/erp-groups` | 498–523 |
| PUT | `/api/v1/estimates/:id/erp-groups/:groupId` | 525–553 |
| DELETE | `/api/v1/estimates/:id/erp-groups/:groupId` | 555–578 |
| POST | `/api/v1/estimates/:id/erp-export-events` | 580–623 |

## Named functions

| Symbol | Source | Lines |
|---|---|---|
| `erpLinkView` | [backend-node/src/routes/estimate-erp.ts](<../../../backend-node/src/routes/estimate-erp.ts>) | 122–129 |
| `loadSummary` | [backend-node/src/routes/estimate-erp.ts](<../../../backend-node/src/routes/estimate-erp.ts>) | 131–149 |
| `lockEstimateForErp` | [backend-node/src/routes/estimate-erp.ts](<../../../backend-node/src/routes/estimate-erp.ts>) | 152–166 |
| `parseGroupMembers` | [backend-node/src/routes/estimate-erp.ts](<../../../backend-node/src/routes/estimate-erp.ts>) | 168–184 |
| `parseGroupShape` | [backend-node/src/routes/estimate-erp.ts](<../../../backend-node/src/routes/estimate-erp.ts>) | 186–194 |
| `assertGroupMembers` | [backend-node/src/routes/estimate-erp.ts](<../../../backend-node/src/routes/estimate-erp.ts>) | 197–217 |
| `touchEstimateForErp` | [backend-node/src/routes/estimate-erp.ts](<../../../backend-node/src/routes/estimate-erp.ts>) | 219–224 |
| `parseMappings` | [backend-node/src/routes/estimate-erp.ts](<../../../backend-node/src/routes/estimate-erp.ts>) | 233–257 |
| `parseExportEvent` | [backend-node/src/routes/estimate-erp.ts](<../../../backend-node/src/routes/estimate-erp.ts>) | 259–276 |
| `createEstimateErpSender` | [backend-node/src/routes/estimate-erp.ts](<../../../backend-node/src/routes/estimate-erp.ts>) | 288–372 |
| `registerEstimateErpRoutes` | [backend-node/src/routes/estimate-erp.ts](<../../../backend-node/src/routes/estimate-erp.ts>) | 374–624 |

## Direct local dependencies

- [backend-node/src/estimate-labor-category.ts](<../../../backend-node/src/estimate-labor-category.ts>)
- [backend-node/src/audit.ts](<../../../backend-node/src/audit.ts>)
- [backend-node/src/db.ts](<../../../backend-node/src/db.ts>)
- [backend-node/src/errors.ts](<../../../backend-node/src/errors.ts>)
- [backend-node/src/user-roles.ts](<../../../backend-node/src/user-roles.ts>)
- [backend-node/src/estimate-erp.ts](<../../../backend-node/src/estimate-erp.ts>)
- [backend-node/src/http.ts](<../../../backend-node/src/http.ts>)
- [backend-node/src/erp-purchasing.ts](<../../../backend-node/src/erp-purchasing.ts>)
- [backend-node/src/erp-cost-estimate.ts](<../../../backend-node/src/erp-cost-estimate.ts>)
- [backend-node/src/feature-flags.ts](<../../../backend-node/src/feature-flags.ts>)
- [backend-node/src/types.ts](<../../../backend-node/src/types.ts>)
- [backend-node/src/users.ts](<../../../backend-node/src/users.ts>)

## SQL references (literal scan, not a complete schema or write-set)

`dbo.audit_log`, `dbo.cost_items`, `dbo.customers`, `dbo.estimate_erp_groups`, `dbo.estimate_erp_links`, `dbo.estimate_erp_mappings`, `dbo.estimates`, `dbo.expense_lines`, `dbo.manhour_lines`, `dbo.other_cost_lines`, `dbo.projects`, `dbo.suppliers`, `dbo.user_effective_permissions`, `dbo.users`, `dbo.v_estimate_cost_amounts`, `dbo.v_estimate_totals`

## Change boundary

Read the selected handler and helpers it calls, then its caller in api-client.ts. Verify permission checks, record scope, transaction, rowVersion and audit on that path; a route name alone does not prove authorization. Dynamic routes/SQL, helper side effects and runtime config require source inspection.
