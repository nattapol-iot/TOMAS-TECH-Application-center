# estimate-price-sets

[Module](../modules/estimate.md) · [Index](../../../AGENTS.md)

Evidence: source snapshot `dff9a24`; generated, do not edit. [backend-node/src/routes/estimate-price-sets.ts](<../../../backend-node/src/routes/estimate-price-sets.ts>). Ranges are hints: search symbol after edits.

## API operations

| Method | Path | Source lines |
|---|---|---|
| POST | `/api/v1/estimates/:id/price-sets` | 22–53 |
| POST | `/api/v1/estimates/:id/price-set-detach` | 54–67 |

## Named functions

| Symbol | Source | Lines |
|---|---|---|
| `setNumber` | [backend-node/src/routes/estimate-price-sets.ts](<../../../backend-node/src/routes/estimate-price-sets.ts>) | 10–13 |
| `validateSetMembers` | [backend-node/src/routes/estimate-price-sets.ts](<../../../backend-node/src/routes/estimate-price-sets.ts>) | 15–20 |
| `registerEstimatePriceSetRoutes` | [backend-node/src/routes/estimate-price-sets.ts](<../../../backend-node/src/routes/estimate-price-sets.ts>) | 21–68 |

## Direct local dependencies

- [backend-node/src/db.ts](<../../../backend-node/src/db.ts>)
- [backend-node/src/users.ts](<../../../backend-node/src/users.ts>)
- [backend-node/src/errors.ts](<../../../backend-node/src/errors.ts>)
- [backend-node/src/audit.ts](<../../../backend-node/src/audit.ts>)
- [backend-node/src/http.ts](<../../../backend-node/src/http.ts>)
- [backend-node/src/routes/estimate-cost-write.ts](<../../../backend-node/src/routes/estimate-cost-write.ts>)

## SQL references (literal scan, not a complete schema or write-set)

`dbo.cost_items`

## Change boundary

Read the selected handler and helpers it calls, then its caller in api-client.ts. Verify permission checks, record scope, transaction, rowVersion and audit on that path; a route name alone does not prove authorization. Dynamic routes/SQL, helper side effects and runtime config require source inspection.
