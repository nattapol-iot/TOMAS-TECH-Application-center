# estimate-order

[Module](../modules/estimate.md) · [Index](../../../AGENTS.md)

Evidence: source snapshot `80a5348e`; generated, do not edit. [backend-node/src/routes/estimate-order.ts](<../../../backend-node/src/routes/estimate-order.ts>). Ranges are hints: search symbol after edits.

## API operations

| Method | Path | Source lines |
|---|---|---|
| PUT | `/api/v1/estimates/:id/line-order` | 29–64 |

## Named functions

| Symbol | Source | Lines |
|---|---|---|
| `parseOrder` | [backend-node/src/routes/estimate-order.ts](<../../../backend-node/src/routes/estimate-order.ts>) | 11–16 |
| `assertCompleteOrder` | [backend-node/src/routes/estimate-order.ts](<../../../backend-node/src/routes/estimate-order.ts>) | 17–20 |
| `parseCostMove` | [backend-node/src/routes/estimate-order.ts](<../../../backend-node/src/routes/estimate-order.ts>) | 21–27 |
| `registerEstimateOrderRoutes` | [backend-node/src/routes/estimate-order.ts](<../../../backend-node/src/routes/estimate-order.ts>) | 28–65 |

## Direct local dependencies

- [backend-node/src/db.ts](<../../../backend-node/src/db.ts>)
- [backend-node/src/users.ts](<../../../backend-node/src/users.ts>)
- [backend-node/src/errors.ts](<../../../backend-node/src/errors.ts>)
- [backend-node/src/http.ts](<../../../backend-node/src/http.ts>)
- [backend-node/src/audit.ts](<../../../backend-node/src/audit.ts>)
- [backend-node/src/routes/estimate-cost-write.ts](<../../../backend-node/src/routes/estimate-cost-write.ts>)

## SQL references (literal scan, not a complete schema or write-set)

`dbo.cost_items`

## Change boundary

Read the selected handler and helpers it calls, then its caller in api-client.ts. Verify permission checks, record scope, transaction, rowVersion and audit on that path; a route name alone does not prove authorization. Dynamic routes/SQL, helper side effects and runtime config require source inspection.
