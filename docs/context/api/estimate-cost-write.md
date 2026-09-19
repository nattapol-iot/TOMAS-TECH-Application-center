# estimate-cost-write

[Module](../modules/estimate.md) · [Index](../../../AGENTS.md)

Evidence: source snapshot `543450fe`; generated, do not edit. [backend-node/src/routes/estimate-cost-write.ts](<../../../backend-node/src/routes/estimate-cost-write.ts>). Ranges are hints: search symbol after edits.

## API operations

| Method | Path | Source lines |
|---|---|---|
| GET | `/api/v1/estimates/:id/module-details` | 163–171 |
| PUT | `/api/v1/estimates/:id/module-details` | 172–277 |
| POST | `/api/v1/estimates/:id/cost-items` | 279–305 |
| PUT | `/api/v1/estimates/:id/cost-items/:lineId` | 307–333 |
| POST | `/api/v1/estimates/:id/cost-items/:lineId/remove` | 335–360 |
| POST | `/api/v1/estimates/:id/cost-modules/remove` | 362–397 |
| POST | `/api/v1/estimates/:id/apply-template` | 402–478 |

## Named functions

| Symbol | Source | Lines |
|---|---|---|
| `decimal` | [backend-node/src/routes/estimate-cost-write.ts](<../../../backend-node/src/routes/estimate-cost-write.ts>) | 35–44 |
| `parseCostInput` | [backend-node/src/routes/estimate-cost-write.ts](<../../../backend-node/src/routes/estimate-cost-write.ts>) | 46–74 |
| `lockEditableEstimate` | [backend-node/src/routes/estimate-cost-write.ts](<../../../backend-node/src/routes/estimate-cost-write.ts>) | 76–88 |
| `validateReferences` | [backend-node/src/routes/estimate-cost-write.ts](<../../../backend-node/src/routes/estimate-cost-write.ts>) | 90–101 |
| `estimateAssignees` | [backend-node/src/routes/estimate-cost-write.ts](<../../../backend-node/src/routes/estimate-cost-write.ts>) | 106–116 |
| `elevated` | [backend-node/src/routes/estimate-cost-write.ts](<../../../backend-node/src/routes/estimate-cost-write.ts>) | 118–120 |
| `assigned` | [backend-node/src/routes/estimate-cost-write.ts](<../../../backend-node/src/routes/estimate-cost-write.ts>) | 121–123 |
| `costSnapshot` | [backend-node/src/routes/estimate-cost-write.ts](<../../../backend-node/src/routes/estimate-cost-write.ts>) | 125–137 |
| `bindCost` | [backend-node/src/routes/estimate-cost-write.ts](<../../../backend-node/src/routes/estimate-cost-write.ts>) | 139–151 |
| `touchEstimate` | [backend-node/src/routes/estimate-cost-write.ts](<../../../backend-node/src/routes/estimate-cost-write.ts>) | 153–160 |
| `registerEstimateCostWriteRoutes` | [backend-node/src/routes/estimate-cost-write.ts](<../../../backend-node/src/routes/estimate-cost-write.ts>) | 162–479 |

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

`dbo.cost_items`, `dbo.estimate_assignments`, `dbo.estimate_module_details`, `dbo.estimates`, `dbo.expense_lines`, `dbo.manhour_lines`, `dbo.module_template_lines`, `dbo.module_templates`, `dbo.roles`, `dbo.suppliers`, `dbo.users`

## Change boundary

Read the selected handler and helpers it calls, then its caller in api-client.ts. Verify permission checks, record scope, transaction, rowVersion and audit on that path; a route name alone does not prove authorization. Dynamic routes/SQL, helper side effects and runtime config require source inspection.
