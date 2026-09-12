# estimate-workspace-write

[Module](../modules/estimate.md) · [Index](../../../AGENTS.md)

Evidence: source snapshot `84fdd5bc`; generated, do not edit. [backend-node/src/routes/estimate-workspace-write.ts](<../../../backend-node/src/routes/estimate-workspace-write.ts>). Ranges are hints: search symbol after edits.

## API operations

| Method | Path | Source lines |
|---|---|---|
| POST | `/api/v1/estimates/:id/manhour-lines` | 268–283 |
| PUT | `/api/v1/estimates/:id/manhour-lines/:lineId` | 285–302 |
| POST | `/api/v1/estimates/:id/manhour-lines/:lineId/remove` | 304–311 |
| POST | `/api/v1/estimates/:id/expense-lines` | 313–323 |
| PUT | `/api/v1/estimates/:id/expense-lines/:lineId` | 325–337 |
| POST | `/api/v1/estimates/:id/expense-lines/:lineId/remove` | 339–345 |
| POST | `/api/v1/estimates/:id/other-cost-lines` | 347–356 |
| PUT | `/api/v1/estimates/:id/other-cost-lines/:lineId` | 358–368 |
| POST | `/api/v1/estimates/:id/other-cost-lines/:lineId/remove` | 370–377 |
| POST | `/api/v1/estimates/:id/assignments` | 379–414 |
| PUT | `/api/v1/estimates/:id/assignments/:assignmentId` | 416–453 |
| PUT | `/api/v1/estimates/:id/contingency` | 455–466 |

## Named functions

| Symbol | Source | Lines |
|---|---|---|
| `businessToday` | [backend-node/src/routes/estimate-workspace-write.ts](<../../../backend-node/src/routes/estimate-workspace-write.ts>) | 26–30 |
| `decimal` | [backend-node/src/routes/estimate-workspace-write.ts](<../../../backend-node/src/routes/estimate-workspace-write.ts>) | 32–41 |
| `optionalId` | [backend-node/src/routes/estimate-workspace-write.ts](<../../../backend-node/src/routes/estimate-workspace-write.ts>) | 43–45 |
| `optionalLineVersion` | [backend-node/src/routes/estimate-workspace-write.ts](<../../../backend-node/src/routes/estimate-workspace-write.ts>) | 47–51 |
| `lockEstimate` | [backend-node/src/routes/estimate-workspace-write.ts](<../../../backend-node/src/routes/estimate-workspace-write.ts>) | 53–63 |
| `elevated` | [backend-node/src/routes/estimate-workspace-write.ts](<../../../backend-node/src/routes/estimate-workspace-write.ts>) | 65–67 |
| `hasSection` | [backend-node/src/routes/estimate-workspace-write.ts](<../../../backend-node/src/routes/estimate-workspace-write.ts>) | 69–76 |
| `demandNewSection` | [backend-node/src/routes/estimate-workspace-write.ts](<../../../backend-node/src/routes/estimate-workspace-write.ts>) | 78–83 |
| `demandExistingSection` | [backend-node/src/routes/estimate-workspace-write.ts](<../../../backend-node/src/routes/estimate-workspace-write.ts>) | 85–93 |
| `validateOwnerSupplier` | [backend-node/src/routes/estimate-workspace-write.ts](<../../../backend-node/src/routes/estimate-workspace-write.ts>) | 95–104 |
| `assignmentRecipients` | [backend-node/src/routes/estimate-workspace-write.ts](<../../../backend-node/src/routes/estimate-workspace-write.ts>) | 106–117 |
| `deliverAssignmentEmail` | [backend-node/src/routes/estimate-workspace-write.ts](<../../../backend-node/src/routes/estimate-workspace-write.ts>) | 119–123 |
| `touchEstimate` | [backend-node/src/routes/estimate-workspace-write.ts](<../../../backend-node/src/routes/estimate-workspace-write.ts>) | 125–132 |
| `snapshot` | [backend-node/src/routes/estimate-workspace-write.ts](<../../../backend-node/src/routes/estimate-workspace-write.ts>) | 134–144 |
| `softDelete` | [backend-node/src/routes/estimate-workspace-write.ts](<../../../backend-node/src/routes/estimate-workspace-write.ts>) | 146–155 |
| `removeBody` | [backend-node/src/routes/estimate-workspace-write.ts](<../../../backend-node/src/routes/estimate-workspace-write.ts>) | 157–160 |
| `parseManhour` | [backend-node/src/routes/estimate-workspace-write.ts](<../../../backend-node/src/routes/estimate-workspace-write.ts>) | 166–181 |
| `resolveInternalDailyRate` | [backend-node/src/routes/estimate-workspace-write.ts](<../../../backend-node/src/routes/estimate-workspace-write.ts>) | 186–199 |
| `resolveRate` | [backend-node/src/routes/estimate-workspace-write.ts](<../../../backend-node/src/routes/estimate-workspace-write.ts>) | 201–204 |
| `bindManhour` | [backend-node/src/routes/estimate-workspace-write.ts](<../../../backend-node/src/routes/estimate-workspace-write.ts>) | 206–216 |
| `parseExpense` | [backend-node/src/routes/estimate-workspace-write.ts](<../../../backend-node/src/routes/estimate-workspace-write.ts>) | 221–230 |
| `expenseSection` | [backend-node/src/routes/estimate-workspace-write.ts](<../../../backend-node/src/routes/estimate-workspace-write.ts>) | 232–235 |
| `bindExpense` | [backend-node/src/routes/estimate-workspace-write.ts](<../../../backend-node/src/routes/estimate-workspace-write.ts>) | 237–244 |
| `parseOther` | [backend-node/src/routes/estimate-workspace-write.ts](<../../../backend-node/src/routes/estimate-workspace-write.ts>) | 247–254 |
| `bindOther` | [backend-node/src/routes/estimate-workspace-write.ts](<../../../backend-node/src/routes/estimate-workspace-write.ts>) | 255–260 |
| `registerEstimateWorkspaceWriteRoutes` | [backend-node/src/routes/estimate-workspace-write.ts](<../../../backend-node/src/routes/estimate-workspace-write.ts>) | 262–467 |

## Direct local dependencies

- [backend-node/src/audit.ts](<../../../backend-node/src/audit.ts>)
- [backend-node/src/config.ts](<../../../backend-node/src/config.ts>)
- [backend-node/src/db.ts](<../../../backend-node/src/db.ts>)
- [backend-node/src/email.ts](<../../../backend-node/src/email.ts>)
- [backend-node/src/errors.ts](<../../../backend-node/src/errors.ts>)
- [backend-node/src/estimate-total-guard.ts](<../../../backend-node/src/estimate-total-guard.ts>)
- [backend-node/src/http.ts](<../../../backend-node/src/http.ts>)
- [backend-node/src/types.ts](<../../../backend-node/src/types.ts>)
- [backend-node/src/users.ts](<../../../backend-node/src/users.ts>)

## SQL references (literal scan, not a complete schema or write-set)

`dbo.engineering_rates`, `dbo.estimate_assignments`, `dbo.estimates`, `dbo.expense_lines`, `dbo.manhour_lines`, `dbo.other_cost_lines`, `dbo.roles`, `dbo.suppliers`, `dbo.users`

## Change boundary

Read the selected handler and helpers it calls, then its caller in api-client.ts. Verify permission checks, record scope, transaction, rowVersion and audit on that path; a route name alone does not prove authorization. Dynamic routes/SQL, helper side effects and runtime config require source inspection.
