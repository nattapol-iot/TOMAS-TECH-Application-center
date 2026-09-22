# estimate-order

[Module](../modules/estimate.md) · [Index](../../../AGENTS.md)

Evidence: source snapshot `52125692`; generated, do not edit. [backend-node/src/routes/estimate-order.ts](<../../../backend-node/src/routes/estimate-order.ts>). Ranges are hints: search symbol after edits.

## API operations

| Method | Path | Source lines |
|---|---|---|
| PUT | `/api/v1/estimates/:id/line-order` | 38–109 |

## Named functions

| Symbol | Source | Lines |
|---|---|---|
| `parseOrder` | [backend-node/src/routes/estimate-order.ts](<../../../backend-node/src/routes/estimate-order.ts>) | 11–16 |
| `assertCompleteOrder` | [backend-node/src/routes/estimate-order.ts](<../../../backend-node/src/routes/estimate-order.ts>) | 17–20 |
| `parseCostMove` | [backend-node/src/routes/estimate-order.ts](<../../../backend-node/src/routes/estimate-order.ts>) | 25–36 |
| `registerEstimateOrderRoutes` | [backend-node/src/routes/estimate-order.ts](<../../../backend-node/src/routes/estimate-order.ts>) | 37–110 |

## Direct local dependencies

- [backend-node/src/db.ts](<../../../backend-node/src/db.ts>)
- [backend-node/src/users.ts](<../../../backend-node/src/users.ts>)
- [backend-node/src/errors.ts](<../../../backend-node/src/errors.ts>)
- [backend-node/src/http.ts](<../../../backend-node/src/http.ts>)
- [backend-node/src/audit.ts](<../../../backend-node/src/audit.ts>)
- [backend-node/src/routes/estimate-cost-write.ts](<../../../backend-node/src/routes/estimate-cost-write.ts>)

## SQL references (literal scan, not a complete schema or write-set)

`dbo.cost_items`, `dbo.estimate_module_details`

## Change boundary

Read the selected handler and helpers it calls, then its caller in api-client.ts. Verify permission checks, record scope, transaction, rowVersion and audit on that path; a route name alone does not prove authorization. Dynamic routes/SQL, helper side effects and runtime config require source inspection.
