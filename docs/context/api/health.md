# health

[Module](../modules/platform.md) · [Index](../../../AGENTS.md)

Evidence: source snapshot `e867e48e`; generated, do not edit. [backend-node/src/routes/health.ts](<../../../backend-node/src/routes/health.ts>). Ranges are hints: search symbol after edits.

## API operations

| Method | Path | Source lines |
|---|---|---|
| GET | `/health/live` | 19–23 |
| GET | `/health/ready` | 25–72 |

## Named functions

| Symbol | Source | Lines |
|---|---|---|
| `registerHealthRoutes` | [backend-node/src/routes/health.ts](<../../../backend-node/src/routes/health.ts>) | 14–73 |

## Direct local dependencies

- [backend-node/src/config.ts](<../../../backend-node/src/config.ts>)
- [backend-node/src/db.ts](<../../../backend-node/src/db.ts>)
- [backend-node/src/migration-validation.ts](<../../../backend-node/src/migration-validation.ts>)

## SQL references (literal scan, not a complete schema or write-set)

`dbo.schema_versions`

## Change boundary

Read the selected handler and helpers it calls, then its caller in api-client.ts. Verify permission checks, record scope, transaction, rowVersion and audit on that path; a route name alone does not prove authorization. Dynamic routes/SQL, helper side effects and runtime config require source inspection.
