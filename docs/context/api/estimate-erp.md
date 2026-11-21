# estimate-erp

[Module](../modules/estimate-erp.md) · [Index](../../../AGENTS.md)

Evidence: source snapshot `df74958e`; generated, do not edit. [backend-node/src/routes/estimate-erp.ts](<../../../backend-node/src/routes/estimate-erp.ts>). Ranges are hints: search symbol after edits.

## API operations

| Method | Path | Source lines |
|---|---|---|
| GET | `/api/v1/estimates/:id/erp-summary` | 429–434 |
| POST | `/api/v1/estimates/:id/erp-send` | 438–451 |
| POST | `/api/v1/estimates/:id/erp-refresh` | 453–461 |
| PUT | `/api/v1/estimates/:id/erp-mappings` | 463–542 |
| POST | `/api/v1/estimates/:id/erp-groups` | 550–575 |
| PUT | `/api/v1/estimates/:id/erp-groups/:groupId` | 577–605 |
| DELETE | `/api/v1/estimates/:id/erp-groups/:groupId` | 607–630 |
| POST | `/api/v1/estimates/:id/erp-export-events` | 632–675 |

## Named functions

| Symbol | Source | Lines |
|---|---|---|
| `erpLinkView` | [backend-node/src/routes/estimate-erp.ts](<../../../backend-node/src/routes/estimate-erp.ts>) | 136–143 |
| `loadSummary` | [backend-node/src/routes/estimate-erp.ts](<../../../backend-node/src/routes/estimate-erp.ts>) | 145–166 |
| `lockEstimateForErp` | [backend-node/src/routes/estimate-erp.ts](<../../../backend-node/src/routes/estimate-erp.ts>) | 169–183 |
| `parseGroupMembers` | [backend-node/src/routes/estimate-erp.ts](<../../../backend-node/src/routes/estimate-erp.ts>) | 185–201 |
| `parseGroupShape` | [backend-node/src/routes/estimate-erp.ts](<../../../backend-node/src/routes/estimate-erp.ts>) | 203–211 |
| `assertGroupMembers` | [backend-node/src/routes/estimate-erp.ts](<../../../backend-node/src/routes/estimate-erp.ts>) | 214–234 |
| `touchEstimateForErp` | [backend-node/src/routes/estimate-erp.ts](<../../../backend-node/src/routes/estimate-erp.ts>) | 236–241 |
| `parseMappings` | [backend-node/src/routes/estimate-erp.ts](<../../../backend-node/src/routes/estimate-erp.ts>) | 250–274 |
| `parseExportEvent` | [backend-node/src/routes/estimate-erp.ts](<../../../backend-node/src/routes/estimate-erp.ts>) | 276–293 |
| `createEstimateErpSender` | [backend-node/src/routes/estimate-erp.ts](<../../../backend-node/src/routes/estimate-erp.ts>) | 306–423 |
| `registerEstimateErpRoutes` | [backend-node/src/routes/estimate-erp.ts](<../../../backend-node/src/routes/estimate-erp.ts>) | 425–676 |

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
