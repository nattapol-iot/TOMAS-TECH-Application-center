# estimate-workspace-write

[Module](../modules/estimate.md) · [Index](../../../AGENTS.md)

Evidence: source snapshot `80a5348e`; generated, do not edit. [backend-node/src/routes/estimate-workspace-write.ts](<../../../backend-node/src/routes/estimate-workspace-write.ts>). Ranges are hints: search symbol after edits.

## API operations

| Method | Path | Source lines |
|---|---|---|
| POST | `/api/v1/estimates/:id/manhour-lines` | 260–275 |
| PUT | `/api/v1/estimates/:id/manhour-lines/:lineId/effort` | 277–306 |
| PUT | `/api/v1/estimates/:id/manhour-lines/:lineId` | 308–325 |
| POST | `/api/v1/estimates/:id/manhour-lines/:lineId/remove` | 327–334 |
| POST | `/api/v1/estimates/:id/expense-lines` | 336–348 |
| PUT | `/api/v1/estimates/:id/expense-lines/:lineId` | 350–362 |
| POST | `/api/v1/estimates/:id/expense-lines/:lineId/remove` | 364–370 |
| POST | `/api/v1/estimates/:id/other-cost-lines` | 372–383 |
| PUT | `/api/v1/estimates/:id/other-cost-lines/:lineId` | 385–395 |
| POST | `/api/v1/estimates/:id/other-cost-lines/:lineId/remove` | 397–404 |
| POST | `/api/v1/estimates/:id/assignments` | 406–441 |
| PUT | `/api/v1/estimates/:id/assignments/:assignmentId` | 443–480 |
| PUT | `/api/v1/estimates/:id/contingency` | 482–493 |

## Named functions

| Symbol | Source | Lines |
|---|---|---|
| `businessToday` | [backend-node/src/routes/estimate-workspace-write.ts](<../../../backend-node/src/routes/estimate-workspace-write.ts>) | 26–30 |
| `decimal` | [backend-node/src/routes/estimate-workspace-write.ts](<../../../backend-node/src/routes/estimate-workspace-write.ts>) | 32–41 |
| `optionalId` | [backend-node/src/routes/estimate-workspace-write.ts](<../../../backend-node/src/routes/estimate-workspace-write.ts>) | 43–45 |
| `optionalLineVersion` | [backend-node/src/routes/estimate-workspace-write.ts](<../../../backend-node/src/routes/estimate-workspace-write.ts>) | 47–51 |
| `lockEstimate` | [backend-node/src/routes/estimate-workspace-write.ts](<../../../backend-node/src/routes/estimate-workspace-write.ts>) | 53–63 |
| `elevated` | [backend-node/src/routes/estimate-workspace-write.ts](<../../../backend-node/src/routes/estimate-workspace-write.ts>) | 65–67 |
| `demandNewSection` | [backend-node/src/routes/estimate-workspace-write.ts](<../../../backend-node/src/routes/estimate-workspace-write.ts>) | 71–76 |
| `demandExistingSection` | [backend-node/src/routes/estimate-workspace-write.ts](<../../../backend-node/src/routes/estimate-workspace-write.ts>) | 78–85 |
| `validateOwnerSupplier` | [backend-node/src/routes/estimate-workspace-write.ts](<../../../backend-node/src/routes/estimate-workspace-write.ts>) | 87–96 |
| `assignmentRecipients` | [backend-node/src/routes/estimate-workspace-write.ts](<../../../backend-node/src/routes/estimate-workspace-write.ts>) | 98–109 |
| `deliverAssignmentEmail` | [backend-node/src/routes/estimate-workspace-write.ts](<../../../backend-node/src/routes/estimate-workspace-write.ts>) | 111–115 |
| `touchEstimate` | [backend-node/src/routes/estimate-workspace-write.ts](<../../../backend-node/src/routes/estimate-workspace-write.ts>) | 117–124 |
| `snapshot` | [backend-node/src/routes/estimate-workspace-write.ts](<../../../backend-node/src/routes/estimate-workspace-write.ts>) | 126–136 |
| `softDelete` | [backend-node/src/routes/estimate-workspace-write.ts](<../../../backend-node/src/routes/estimate-workspace-write.ts>) | 138–147 |
| `removeBody` | [backend-node/src/routes/estimate-workspace-write.ts](<../../../backend-node/src/routes/estimate-workspace-write.ts>) | 149–152 |
| `parseManhour` | [backend-node/src/routes/estimate-workspace-write.ts](<../../../backend-node/src/routes/estimate-workspace-write.ts>) | 158–173 |
| `resolveInternalDailyRate` | [backend-node/src/routes/estimate-workspace-write.ts](<../../../backend-node/src/routes/estimate-workspace-write.ts>) | 178–191 |
| `resolveRate` | [backend-node/src/routes/estimate-workspace-write.ts](<../../../backend-node/src/routes/estimate-workspace-write.ts>) | 193–196 |
| `bindManhour` | [backend-node/src/routes/estimate-workspace-write.ts](<../../../backend-node/src/routes/estimate-workspace-write.ts>) | 198–208 |
| `parseExpense` | [backend-node/src/routes/estimate-workspace-write.ts](<../../../backend-node/src/routes/estimate-workspace-write.ts>) | 213–222 |
| `expenseSection` | [backend-node/src/routes/estimate-workspace-write.ts](<../../../backend-node/src/routes/estimate-workspace-write.ts>) | 224–227 |
| `bindExpense` | [backend-node/src/routes/estimate-workspace-write.ts](<../../../backend-node/src/routes/estimate-workspace-write.ts>) | 229–236 |
| `parseOther` | [backend-node/src/routes/estimate-workspace-write.ts](<../../../backend-node/src/routes/estimate-workspace-write.ts>) | 239–246 |
| `bindOther` | [backend-node/src/routes/estimate-workspace-write.ts](<../../../backend-node/src/routes/estimate-workspace-write.ts>) | 247–252 |
| `registerEstimateWorkspaceWriteRoutes` | [backend-node/src/routes/estimate-workspace-write.ts](<../../../backend-node/src/routes/estimate-workspace-write.ts>) | 254–494 |

## Direct local dependencies

- [backend-node/src/audit.ts](<../../../backend-node/src/audit.ts>)
- [backend-node/src/config.ts](<../../../backend-node/src/config.ts>)
- [backend-node/src/db.ts](<../../../backend-node/src/db.ts>)
- [backend-node/src/email.ts](<../../../backend-node/src/email.ts>)
- [backend-node/src/errors.ts](<../../../backend-node/src/errors.ts>)
- [backend-node/src/user-roles.ts](<../../../backend-node/src/user-roles.ts>)
- [backend-node/src/estimate-sections.ts](<../../../backend-node/src/estimate-sections.ts>)
- [backend-node/src/estimate-total-guard.ts](<../../../backend-node/src/estimate-total-guard.ts>)
- [backend-node/src/http.ts](<../../../backend-node/src/http.ts>)
- [backend-node/src/types.ts](<../../../backend-node/src/types.ts>)
- [backend-node/src/users.ts](<../../../backend-node/src/users.ts>)
- [backend-node/src/routes/estimate-cost-write.ts](<../../../backend-node/src/routes/estimate-cost-write.ts>)

## SQL references (literal scan, not a complete schema or write-set)

`dbo.engineering_rates`, `dbo.estimate_assignments`, `dbo.estimates`, `dbo.expense_lines`, `dbo.manhour_lines`, `dbo.other_cost_lines`, `dbo.roles`, `dbo.suppliers`, `dbo.users`

## Change boundary

Read the selected handler and helpers it calls, then its caller in api-client.ts. Verify permission checks, record scope, transaction, rowVersion and audit on that path; a route name alone does not prove authorization. Dynamic routes/SQL, helper side effects and runtime config require source inspection.
