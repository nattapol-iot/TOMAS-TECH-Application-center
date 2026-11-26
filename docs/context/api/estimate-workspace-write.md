# estimate-workspace-write

[Module](../modules/estimate.md) · [Index](../../../AGENTS.md)

Evidence: source snapshot `1b09d40e`; generated, do not edit. [backend-node/src/routes/estimate-workspace-write.ts](<../../../backend-node/src/routes/estimate-workspace-write.ts>). Ranges are hints: search symbol after edits.

## API operations

| Method | Path | Source lines |
|---|---|---|
| POST | `/api/v1/estimates/:id/manhour-lines` | 416–453 |
| PUT | `/api/v1/estimates/:id/manhour-lines/:lineId/effort` | 455–492 |
| PUT | `/api/v1/estimates/:id/manhour-lines/:lineId` | 494–552 |
| POST | `/api/v1/estimates/:id/manhour-lines/:lineId/remove` | 554–579 |
| POST | `/api/v1/estimates/:id/expense-lines` | 581–615 |
| PUT | `/api/v1/estimates/:id/expense-lines/:lineId` | 617–664 |
| POST | `/api/v1/estimates/:id/expense-lines/:lineId/remove` | 666–692 |
| POST | `/api/v1/estimates/:id/other-cost-lines` | 694–727 |
| PUT | `/api/v1/estimates/:id/other-cost-lines/:lineId` | 729–774 |
| POST | `/api/v1/estimates/:id/other-cost-lines/:lineId/remove` | 776–811 |
| POST | `/api/v1/estimates/:id/assignments` | 813–881 |
| PUT | `/api/v1/estimates/:id/assignments/:assignmentId` | 883–967 |
| PUT | `/api/v1/estimates/:id/contingency` | 969–1001 |

## Named functions

| Symbol | Source | Lines |
|---|---|---|
| `businessToday` | [backend-node/src/routes/estimate-workspace-write.ts](<../../../backend-node/src/routes/estimate-workspace-write.ts>) | 27–31 |
| `decimal` | [backend-node/src/routes/estimate-workspace-write.ts](<../../../backend-node/src/routes/estimate-workspace-write.ts>) | 33–42 |
| `optionalId` | [backend-node/src/routes/estimate-workspace-write.ts](<../../../backend-node/src/routes/estimate-workspace-write.ts>) | 44–46 |
| `optionalLineVersion` | [backend-node/src/routes/estimate-workspace-write.ts](<../../../backend-node/src/routes/estimate-workspace-write.ts>) | 48–52 |
| `lockEstimate` | [backend-node/src/routes/estimate-workspace-write.ts](<../../../backend-node/src/routes/estimate-workspace-write.ts>) | 54–67 |
| `elevated` | [backend-node/src/routes/estimate-workspace-write.ts](<../../../backend-node/src/routes/estimate-workspace-write.ts>) | 69–71 |
| `demandNewSection` | [backend-node/src/routes/estimate-workspace-write.ts](<../../../backend-node/src/routes/estimate-workspace-write.ts>) | 75–84 |
| `demandExistingSection` | [backend-node/src/routes/estimate-workspace-write.ts](<../../../backend-node/src/routes/estimate-workspace-write.ts>) | 86–101 |
| `validateOwnerSupplier` | [backend-node/src/routes/estimate-workspace-write.ts](<../../../backend-node/src/routes/estimate-workspace-write.ts>) | 103–116 |
| `assignmentRecipients` | [backend-node/src/routes/estimate-workspace-write.ts](<../../../backend-node/src/routes/estimate-workspace-write.ts>) | 118–131 |
| `deliverAssignmentEmail` | [backend-node/src/routes/estimate-workspace-write.ts](<../../../backend-node/src/routes/estimate-workspace-write.ts>) | 133–135 |
| `touchEstimate` | [backend-node/src/routes/estimate-workspace-write.ts](<../../../backend-node/src/routes/estimate-workspace-write.ts>) | 137–148 |
| `snapshot` | [backend-node/src/routes/estimate-workspace-write.ts](<../../../backend-node/src/routes/estimate-workspace-write.ts>) | 150–175 |
| `softDelete` | [backend-node/src/routes/estimate-workspace-write.ts](<../../../backend-node/src/routes/estimate-workspace-write.ts>) | 177–192 |
| `removeBody` | [backend-node/src/routes/estimate-workspace-write.ts](<../../../backend-node/src/routes/estimate-workspace-write.ts>) | 194–197 |
| `parseManhour` | [backend-node/src/routes/estimate-workspace-write.ts](<../../../backend-node/src/routes/estimate-workspace-write.ts>) | 220–256 |
| `resolveInternalDailyRate` | [backend-node/src/routes/estimate-workspace-write.ts](<../../../backend-node/src/routes/estimate-workspace-write.ts>) | 261–280 |
| `resolveRate` | [backend-node/src/routes/estimate-workspace-write.ts](<../../../backend-node/src/routes/estimate-workspace-write.ts>) | 282–285 |
| `bindManhour` | [backend-node/src/routes/estimate-workspace-write.ts](<../../../backend-node/src/routes/estimate-workspace-write.ts>) | 287–307 |
| `parseExpense` | [backend-node/src/routes/estimate-workspace-write.ts](<../../../backend-node/src/routes/estimate-workspace-write.ts>) | 326–350 |
| `expenseSection` | [backend-node/src/routes/estimate-workspace-write.ts](<../../../backend-node/src/routes/estimate-workspace-write.ts>) | 352–357 |
| `bindExpense` | [backend-node/src/routes/estimate-workspace-write.ts](<../../../backend-node/src/routes/estimate-workspace-write.ts>) | 359–375 |
| `parseOther` | [backend-node/src/routes/estimate-workspace-write.ts](<../../../backend-node/src/routes/estimate-workspace-write.ts>) | 378–393 |
| `bindOther` | [backend-node/src/routes/estimate-workspace-write.ts](<../../../backend-node/src/routes/estimate-workspace-write.ts>) | 394–404 |
| `registerEstimateWorkspaceWriteRoutes` | [backend-node/src/routes/estimate-workspace-write.ts](<../../../backend-node/src/routes/estimate-workspace-write.ts>) | 406–1002 |

## Direct local dependencies

- [backend-node/src/audit.ts](<../../../backend-node/src/audit.ts>)
- [backend-node/src/config.ts](<../../../backend-node/src/config.ts>)
- [backend-node/src/db.ts](<../../../backend-node/src/db.ts>)
- [backend-node/src/email.ts](<../../../backend-node/src/email.ts>)
- [backend-node/src/errors.ts](<../../../backend-node/src/errors.ts>)
- [backend-node/src/user-roles.ts](<../../../backend-node/src/user-roles.ts>)
- [backend-node/src/estimate-sections.ts](<../../../backend-node/src/estimate-sections.ts>)
- [backend-node/src/estimate-disciplines.ts](<../../../backend-node/src/estimate-disciplines.ts>)
- [backend-node/src/estimate-total-guard.ts](<../../../backend-node/src/estimate-total-guard.ts>)
- [backend-node/src/http.ts](<../../../backend-node/src/http.ts>)
- [backend-node/src/types.ts](<../../../backend-node/src/types.ts>)
- [backend-node/src/users.ts](<../../../backend-node/src/users.ts>)
- [backend-node/src/routes/estimate-cost-write.ts](<../../../backend-node/src/routes/estimate-cost-write.ts>)

## SQL references (literal scan, not a complete schema or write-set)

`dbo.engineering_rates`, `dbo.estimate_assignments`, `dbo.estimates`, `dbo.expense_lines`, `dbo.manhour_lines`, `dbo.other_cost_lines`, `dbo.suppliers`, `dbo.user_effective_roles`, `dbo.users`

## Change boundary

Read the selected handler and helpers it calls, then its caller in api-client.ts. Verify permission checks, record scope, transaction, rowVersion and audit on that path; a route name alone does not prove authorization. Dynamic routes/SQL, helper side effects and runtime config require source inspection.
