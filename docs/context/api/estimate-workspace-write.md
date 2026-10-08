# estimate-workspace-write

[Module](../modules/estimate.md) · [Index](../../../AGENTS.md)

Evidence: source snapshot `5fe25aa6`; generated, do not edit. [backend-node/src/routes/estimate-workspace-write.ts](<../../../backend-node/src/routes/estimate-workspace-write.ts>). Ranges are hints: search symbol after edits.

## API operations

| Method | Path | Source lines |
|---|---|---|
| POST | `/api/v1/estimates/:id/manhour-lines` | 267–282 |
| PUT | `/api/v1/estimates/:id/manhour-lines/:lineId/effort` | 284–313 |
| PUT | `/api/v1/estimates/:id/manhour-lines/:lineId` | 315–332 |
| POST | `/api/v1/estimates/:id/manhour-lines/:lineId/remove` | 334–341 |
| POST | `/api/v1/estimates/:id/expense-lines` | 343–355 |
| PUT | `/api/v1/estimates/:id/expense-lines/:lineId` | 357–369 |
| POST | `/api/v1/estimates/:id/expense-lines/:lineId/remove` | 371–377 |
| POST | `/api/v1/estimates/:id/other-cost-lines` | 379–390 |
| PUT | `/api/v1/estimates/:id/other-cost-lines/:lineId` | 392–402 |
| POST | `/api/v1/estimates/:id/other-cost-lines/:lineId/remove` | 404–411 |
| POST | `/api/v1/estimates/:id/assignments` | 413–448 |
| PUT | `/api/v1/estimates/:id/assignments/:assignmentId` | 450–487 |
| PUT | `/api/v1/estimates/:id/contingency` | 489–500 |

## Named functions

| Symbol | Source | Lines |
|---|---|---|
| `businessToday` | [backend-node/src/routes/estimate-workspace-write.ts](<../../../backend-node/src/routes/estimate-workspace-write.ts>) | 27–31 |
| `decimal` | [backend-node/src/routes/estimate-workspace-write.ts](<../../../backend-node/src/routes/estimate-workspace-write.ts>) | 33–42 |
| `optionalId` | [backend-node/src/routes/estimate-workspace-write.ts](<../../../backend-node/src/routes/estimate-workspace-write.ts>) | 44–46 |
| `optionalLineVersion` | [backend-node/src/routes/estimate-workspace-write.ts](<../../../backend-node/src/routes/estimate-workspace-write.ts>) | 48–52 |
| `lockEstimate` | [backend-node/src/routes/estimate-workspace-write.ts](<../../../backend-node/src/routes/estimate-workspace-write.ts>) | 54–64 |
| `elevated` | [backend-node/src/routes/estimate-workspace-write.ts](<../../../backend-node/src/routes/estimate-workspace-write.ts>) | 66–68 |
| `demandNewSection` | [backend-node/src/routes/estimate-workspace-write.ts](<../../../backend-node/src/routes/estimate-workspace-write.ts>) | 72–77 |
| `demandExistingSection` | [backend-node/src/routes/estimate-workspace-write.ts](<../../../backend-node/src/routes/estimate-workspace-write.ts>) | 79–86 |
| `validateOwnerSupplier` | [backend-node/src/routes/estimate-workspace-write.ts](<../../../backend-node/src/routes/estimate-workspace-write.ts>) | 88–97 |
| `assignmentRecipients` | [backend-node/src/routes/estimate-workspace-write.ts](<../../../backend-node/src/routes/estimate-workspace-write.ts>) | 99–110 |
| `deliverAssignmentEmail` | [backend-node/src/routes/estimate-workspace-write.ts](<../../../backend-node/src/routes/estimate-workspace-write.ts>) | 112–116 |
| `touchEstimate` | [backend-node/src/routes/estimate-workspace-write.ts](<../../../backend-node/src/routes/estimate-workspace-write.ts>) | 118–125 |
| `snapshot` | [backend-node/src/routes/estimate-workspace-write.ts](<../../../backend-node/src/routes/estimate-workspace-write.ts>) | 127–137 |
| `softDelete` | [backend-node/src/routes/estimate-workspace-write.ts](<../../../backend-node/src/routes/estimate-workspace-write.ts>) | 139–148 |
| `removeBody` | [backend-node/src/routes/estimate-workspace-write.ts](<../../../backend-node/src/routes/estimate-workspace-write.ts>) | 150–153 |
| `parseManhour` | [backend-node/src/routes/estimate-workspace-write.ts](<../../../backend-node/src/routes/estimate-workspace-write.ts>) | 159–176 |
| `resolveInternalDailyRate` | [backend-node/src/routes/estimate-workspace-write.ts](<../../../backend-node/src/routes/estimate-workspace-write.ts>) | 181–194 |
| `resolveRate` | [backend-node/src/routes/estimate-workspace-write.ts](<../../../backend-node/src/routes/estimate-workspace-write.ts>) | 196–199 |
| `bindManhour` | [backend-node/src/routes/estimate-workspace-write.ts](<../../../backend-node/src/routes/estimate-workspace-write.ts>) | 201–212 |
| `parseExpense` | [backend-node/src/routes/estimate-workspace-write.ts](<../../../backend-node/src/routes/estimate-workspace-write.ts>) | 217–228 |
| `expenseSection` | [backend-node/src/routes/estimate-workspace-write.ts](<../../../backend-node/src/routes/estimate-workspace-write.ts>) | 230–233 |
| `bindExpense` | [backend-node/src/routes/estimate-workspace-write.ts](<../../../backend-node/src/routes/estimate-workspace-write.ts>) | 235–243 |
| `parseOther` | [backend-node/src/routes/estimate-workspace-write.ts](<../../../backend-node/src/routes/estimate-workspace-write.ts>) | 246–253 |
| `bindOther` | [backend-node/src/routes/estimate-workspace-write.ts](<../../../backend-node/src/routes/estimate-workspace-write.ts>) | 254–259 |
| `registerEstimateWorkspaceWriteRoutes` | [backend-node/src/routes/estimate-workspace-write.ts](<../../../backend-node/src/routes/estimate-workspace-write.ts>) | 261–501 |

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

`dbo.engineering_rates`, `dbo.estimate_assignments`, `dbo.estimates`, `dbo.expense_lines`, `dbo.manhour_lines`, `dbo.other_cost_lines`, `dbo.roles`, `dbo.suppliers`, `dbo.users`

## Change boundary

Read the selected handler and helpers it calls, then its caller in api-client.ts. Verify permission checks, record scope, transaction, rowVersion and audit on that path; a route name alone does not prove authorization. Dynamic routes/SQL, helper side effects and runtime config require source inspection.
