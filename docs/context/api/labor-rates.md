# labor-rates

[Module](../modules/labor.md) · [Index](../../../AGENTS.md)

Evidence: source snapshot `4e44d2e`; generated, do not edit. [backend-node/src/routes/labor-rates.ts](<../../../backend-node/src/routes/labor-rates.ts>). Ranges are hints: search symbol after edits.

## API operations

| Method | Path | Source lines |
|---|---|---|
| GET | `/api/v1/labor-rates` | 181–218 |
| POST | `/api/v1/master/engineering-rates/:id/supersede` | 231–371 |
| POST | `/api/v1/master/engineering-rates/:id/retire` | 382–466 |

## Named functions

| Symbol | Source | Lines |
|---|---|---|
| `validation` | [backend-node/src/routes/labor-rates.ts](<../../../backend-node/src/routes/labor-rates.ts>) | 40–42 |
| `todayIn` | [backend-node/src/routes/labor-rates.ts](<../../../backend-node/src/routes/labor-rates.ts>) | 44–48 |
| `rateAmount` | [backend-node/src/routes/labor-rates.ts](<../../../backend-node/src/routes/labor-rates.ts>) | 50–59 |
| `rateQuery` | [backend-node/src/routes/labor-rates.ts](<../../../backend-node/src/routes/labor-rates.ts>) | 90–113 |
| `registerLaborRateRoutes` | [backend-node/src/routes/labor-rates.ts](<../../../backend-node/src/routes/labor-rates.ts>) | 115–467 |

## Direct local dependencies

- [backend-node/src/audit.ts](<../../../backend-node/src/audit.ts>)
- [backend-node/src/config.ts](<../../../backend-node/src/config.ts>)
- [backend-node/src/db.ts](<../../../backend-node/src/db.ts>)
- [backend-node/src/engineering-rate-access.ts](<../../../backend-node/src/engineering-rate-access.ts>)
- [backend-node/src/user-roles.ts](<../../../backend-node/src/user-roles.ts>)
- [backend-node/src/errors.ts](<../../../backend-node/src/errors.ts>)
- [backend-node/src/http.ts](<../../../backend-node/src/http.ts>)
- [backend-node/src/labor-master.ts](<../../../backend-node/src/labor-master.ts>)
- [backend-node/src/users.ts](<../../../backend-node/src/users.ts>)

## SQL references (literal scan, not a complete schema or write-set)

`dbo.engineering_rates`, `dbo.estimates`, `dbo.manhour_lines`, `dbo.users`

## Change boundary

Read the selected handler and helpers it calls, then its caller in api-client.ts. Verify permission checks, record scope, transaction, rowVersion and audit on that path; a route name alone does not prove authorization. Dynamic routes/SQL, helper side effects and runtime config require source inspection.
