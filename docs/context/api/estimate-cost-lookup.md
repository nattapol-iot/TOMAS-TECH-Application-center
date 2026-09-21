# estimate-cost-lookup

[Module](../modules/estimate.md) · [Index](../../../AGENTS.md)

Evidence: source snapshot `80a5348e`; generated, do not edit. [backend-node/src/routes/estimate-cost-lookup.ts](<../../../backend-node/src/routes/estimate-cost-lookup.ts>). Ranges are hints: search symbol after edits.

## API operations

| Method | Path | Source lines |
|---|---|---|
| GET | `/api/v1/estimates/cost-item-lookup` | 124–139 |

## Named functions

| Symbol | Source | Lines |
|---|---|---|
| `escapeLikePattern` | [backend-node/src/routes/estimate-cost-lookup.ts](<../../../backend-node/src/routes/estimate-cost-lookup.ts>) | 21–23 |
| `parseLookupField` | [backend-node/src/routes/estimate-cost-lookup.ts](<../../../backend-node/src/routes/estimate-cost-lookup.ts>) | 25–29 |
| `mapLookupRow` | [backend-node/src/routes/estimate-cost-lookup.ts](<../../../backend-node/src/routes/estimate-cost-lookup.ts>) | 96–121 |
| `registerEstimateCostLookupRoutes` | [backend-node/src/routes/estimate-cost-lookup.ts](<../../../backend-node/src/routes/estimate-cost-lookup.ts>) | 123–140 |

## Direct local dependencies

- [backend-node/src/db.ts](<../../../backend-node/src/db.ts>)
- [backend-node/src/errors.ts](<../../../backend-node/src/errors.ts>)
- [backend-node/src/http.ts](<../../../backend-node/src/http.ts>)
- [backend-node/src/users.ts](<../../../backend-node/src/users.ts>)

## SQL references (literal scan, not a complete schema or write-set)

`dbo.cost_items`, `dbo.estimates`, `dbo.supplier_price_history`, `dbo.suppliers`

## Change boundary

Read the selected handler and helpers it calls, then its caller in api-client.ts. Verify permission checks, record scope, transaction, rowVersion and audit on that path; a route name alone does not prove authorization. Dynamic routes/SQL, helper side effects and runtime config require source inspection.
