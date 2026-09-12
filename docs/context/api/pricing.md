# pricing

[Module](../modules/pricing.md) · [Index](../../../AGENTS.md)

Evidence: source snapshot `1e58594b`; generated, do not edit. [backend-node/src/routes/pricing.ts](<../../../backend-node/src/routes/pricing.ts>). Ranges are hints: search symbol after edits.

## API operations

| Method | Path | Source lines |
|---|---|---|
| GET | `/api/v1/pricing/history` | 41–96 |

## Named functions

| Symbol | Source | Lines |
|---|---|---|
| `registerPricingRoutes` | [backend-node/src/routes/pricing.ts](<../../../backend-node/src/routes/pricing.ts>) | 40–97 |

## Direct local dependencies

- [backend-node/src/db.ts](<../../../backend-node/src/db.ts>)
- [backend-node/src/http.ts](<../../../backend-node/src/http.ts>)
- [backend-node/src/users.ts](<../../../backend-node/src/users.ts>)

## SQL references (literal scan, not a complete schema or write-set)

`dbo.supplier_price_history`

## Change boundary

Read the selected handler and helpers it calls, then its caller in api-client.ts. Verify permission checks, record scope, transaction, rowVersion and audit on that path; a route name alone does not prove authorization. Dynamic routes/SQL, helper side effects and runtime config require source inspection.
