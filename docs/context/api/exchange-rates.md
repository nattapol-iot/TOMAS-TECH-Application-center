# exchange-rates

[Module](../modules/pricing.md) · [Index](../../../AGENTS.md)

Evidence: source snapshot `0bb11f4f`; generated, do not edit. [backend-node/src/routes/exchange-rates.ts](<../../../backend-node/src/routes/exchange-rates.ts>). Ranges are hints: search symbol after edits.

## API operations

| Method | Path | Source lines |
|---|---|---|
| GET | `/api/v1/exchange-rates/thb` | 9–17 |

## Named functions

| Symbol | Source | Lines |
|---|---|---|
| `registerExchangeRateRoutes` | [backend-node/src/routes/exchange-rates.ts](<../../../backend-node/src/routes/exchange-rates.ts>) | 8–18 |

## Direct local dependencies

- [backend-node/src/errors.ts](<../../../backend-node/src/errors.ts>)
- [backend-node/src/http.ts](<../../../backend-node/src/http.ts>)
- [backend-node/src/master-data/services.ts](<../../../backend-node/src/master-data/services.ts>)
- [backend-node/src/users.ts](<../../../backend-node/src/users.ts>)

## SQL references (literal scan, not a complete schema or write-set)

No literal dbo reference in this file; follow dependencies.

## Change boundary

Read the selected handler and helpers it calls, then its caller in api-client.ts. Verify permission checks, record scope, transaction, rowVersion and audit on that path; a route name alone does not prove authorization. Dynamic routes/SQL, helper side effects and runtime config require source inspection.
