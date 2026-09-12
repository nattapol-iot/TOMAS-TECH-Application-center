# overhead-policies

[Module](../modules/estimate-erp.md) · [Index](../../../AGENTS.md)

Evidence: source snapshot `84fdd5bc`; generated, do not edit. [backend-node/src/routes/overhead-policies.ts](<../../../backend-node/src/routes/overhead-policies.ts>). Ranges are hints: search symbol after edits.

## API operations

| Method | Path | Source lines |
|---|---|---|
| GET | `/api/v1/overhead-policies` | 36–45 |
| POST | `/api/v1/overhead-policies` | 47–73 |
| POST | `/api/v1/estimates/:id/overhead/apply` | 75–100 |

## Named functions

| Symbol | Source | Lines |
|---|---|---|
| `todayIn` | [backend-node/src/routes/overhead-policies.ts](<../../../backend-node/src/routes/overhead-policies.ts>) | 14–18 |
| `mapPolicy` | [backend-node/src/routes/overhead-policies.ts](<../../../backend-node/src/routes/overhead-policies.ts>) | 20–25 |
| `mapSnapshot` | [backend-node/src/routes/overhead-policies.ts](<../../../backend-node/src/routes/overhead-policies.ts>) | 27–33 |
| `registerOverheadPolicyRoutes` | [backend-node/src/routes/overhead-policies.ts](<../../../backend-node/src/routes/overhead-policies.ts>) | 35–101 |

## Direct local dependencies

- [backend-node/src/config.ts](<../../../backend-node/src/config.ts>)
- [backend-node/src/audit.ts](<../../../backend-node/src/audit.ts>)
- [backend-node/src/db.ts](<../../../backend-node/src/db.ts>)
- [backend-node/src/errors.ts](<../../../backend-node/src/errors.ts>)
- [backend-node/src/http.ts](<../../../backend-node/src/http.ts>)
- [backend-node/src/overhead.ts](<../../../backend-node/src/overhead.ts>)
- [backend-node/src/estimate-total-guard.ts](<../../../backend-node/src/estimate-total-guard.ts>)
- [backend-node/src/users.ts](<../../../backend-node/src/users.ts>)

## SQL references (literal scan, not a complete schema or write-set)

`dbo.estimates`, `dbo.overhead_policies`, `dbo.users`, `dbo.v_estimate_totals`

## Change boundary

Read the selected handler and helpers it calls, then its caller in api-client.ts. Verify permission checks, record scope, transaction, rowVersion and audit on that path; a route name alone does not prove authorization. Dynamic routes/SQL, helper side effects and runtime config require source inspection.
