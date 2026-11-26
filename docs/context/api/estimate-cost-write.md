# estimate-cost-write

[Module](../modules/estimate.md) · [Index](../../../AGENTS.md)

Evidence: source snapshot `45c9e572`; generated, do not edit. [backend-node/src/routes/estimate-cost-write.ts](<../../../backend-node/src/routes/estimate-cost-write.ts>). Ranges are hints: search symbol after edits.

## API operations

| Method | Path | Source lines |
|---|---|---|
| GET | `/api/v1/estimates/:id/module-details` | 255–268 |
| PUT | `/api/v1/estimates/:id/module-details` | 269–434 |
| POST | `/api/v1/estimates/:id/cost-items` | 436–469 |
| PUT | `/api/v1/estimates/:id/cost-items/:lineId` | 471–507 |
| POST | `/api/v1/estimates/:id/cost-items/:lineId/remove` | 509–545 |
| POST | `/api/v1/estimates/:id/cost-modules/copy` | 547–644 |
| POST | `/api/v1/estimates/:id/cost-modules/remove` | 646–696 |
| POST | `/api/v1/estimates/:id/apply-template` | 701–818 |
| POST | `/api/v1/estimates/:id/apply-quotation` | 824–963 |

## Named functions

| Symbol | Source | Lines |
|---|---|---|
| `decimal` | [backend-node/src/routes/estimate-cost-write.ts](<../../../backend-node/src/routes/estimate-cost-write.ts>) | 70–79 |
| `parseCostInput` | [backend-node/src/routes/estimate-cost-write.ts](<../../../backend-node/src/routes/estimate-cost-write.ts>) | 81–118 |
| `lockEditableEstimate` | [backend-node/src/routes/estimate-cost-write.ts](<../../../backend-node/src/routes/estimate-cost-write.ts>) | 120–135 |
| `validateReferences` | [backend-node/src/routes/estimate-cost-write.ts](<../../../backend-node/src/routes/estimate-cost-write.ts>) | 137–152 |
| `estimateAssignees` | [backend-node/src/routes/estimate-cost-write.ts](<../../../backend-node/src/routes/estimate-cost-write.ts>) | 157–174 |
| `elevated` | [backend-node/src/routes/estimate-cost-write.ts](<../../../backend-node/src/routes/estimate-cost-write.ts>) | 176–178 |
| `assigned` | [backend-node/src/routes/estimate-cost-write.ts](<../../../backend-node/src/routes/estimate-cost-write.ts>) | 179–181 |
| `costSnapshot` | [backend-node/src/routes/estimate-cost-write.ts](<../../../backend-node/src/routes/estimate-cost-write.ts>) | 183–200 |
| `bindCost` | [backend-node/src/routes/estimate-cost-write.ts](<../../../backend-node/src/routes/estimate-cost-write.ts>) | 202–225 |
| `parseQuotationPicks` | [backend-node/src/routes/estimate-cost-write.ts](<../../../backend-node/src/routes/estimate-cost-write.ts>) | 228–239 |
| `touchEstimate` | [backend-node/src/routes/estimate-cost-write.ts](<../../../backend-node/src/routes/estimate-cost-write.ts>) | 241–252 |
| `registerEstimateCostWriteRoutes` | [backend-node/src/routes/estimate-cost-write.ts](<../../../backend-node/src/routes/estimate-cost-write.ts>) | 254–964 |

## Direct local dependencies

- [backend-node/src/estimate-module-details.ts](<../../../backend-node/src/estimate-module-details.ts>)
- [backend-node/src/audit.ts](<../../../backend-node/src/audit.ts>)
- [backend-node/src/db.ts](<../../../backend-node/src/db.ts>)
- [backend-node/src/errors.ts](<../../../backend-node/src/errors.ts>)
- [backend-node/src/user-roles.ts](<../../../backend-node/src/user-roles.ts>)
- [backend-node/src/estimate-total-guard.ts](<../../../backend-node/src/estimate-total-guard.ts>)
- [backend-node/src/http.ts](<../../../backend-node/src/http.ts>)
- [backend-node/src/types.ts](<../../../backend-node/src/types.ts>)
- [backend-node/src/users.ts](<../../../backend-node/src/users.ts>)

## SQL references (literal scan, not a complete schema or write-set)

`dbo.cost_items`, `dbo.estimate_assignments`, `dbo.estimate_erp_mappings`, `dbo.estimate_module_details`, `dbo.estimates`, `dbo.expense_lines`, `dbo.manhour_lines`, `dbo.module_template_lines`, `dbo.module_templates`, `dbo.supplier_quotation_lines`, `dbo.supplier_quotations`, `dbo.suppliers`, `dbo.user_effective_roles`, `dbo.users`

## Change boundary

Read the selected handler and helpers it calls, then its caller in api-client.ts. Verify permission checks, record scope, transaction, rowVersion and audit on that path; a route name alone does not prove authorization. Dynamic routes/SQL, helper side effects and runtime config require source inspection.
