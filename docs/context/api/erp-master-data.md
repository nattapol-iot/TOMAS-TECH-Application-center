# erp-master-data

[Module](../modules/master.md) · [Index](../../../AGENTS.md)

Evidence: source snapshot `458c6a00`; generated, do not edit. [backend-node/src/routes/erp-master-data.ts](<../../../backend-node/src/routes/erp-master-data.ts>). Ranges are hints: search symbol after edits.

## API operations

| Method | Path | Source lines |
|---|---|---|
| GET | `/api/v1/erp/master-data` | 48–52 |
| POST | `/api/v1/erp/master-data/:kind/sync` | 54–59 |
| GET | `/api/v1/erp/master-data/:kind/review` | 61–65 |
| POST | `/api/v1/erp/master-data/:kind/review/:key` | 67–74 |

## Named functions

| Symbol | Source | Lines |
|---|---|---|
| `kindOf` | [backend-node/src/routes/erp-master-data.ts](<../../../backend-node/src/routes/erp-master-data.ts>) | 16–20 |
| `registerErpMasterDataRoutes` | [backend-node/src/routes/erp-master-data.ts](<../../../backend-node/src/routes/erp-master-data.ts>) | 27–75 |

## Direct local dependencies

- [backend-node/src/db.ts](<../../../backend-node/src/db.ts>)
- [backend-node/src/errors.ts](<../../../backend-node/src/errors.ts>)
- [backend-node/src/erp-master-data.ts](<../../../backend-node/src/erp-master-data.ts>)
- [backend-node/src/erp-master-sync.ts](<../../../backend-node/src/erp-master-sync.ts>)
- [backend-node/src/erp-purchasing.ts](<../../../backend-node/src/erp-purchasing.ts>)
- [backend-node/src/http.ts](<../../../backend-node/src/http.ts>)
- [backend-node/src/master-data/services.ts](<../../../backend-node/src/master-data/services.ts>)
- [backend-node/src/user-roles.ts](<../../../backend-node/src/user-roles.ts>)
- [backend-node/src/users.ts](<../../../backend-node/src/users.ts>)

## SQL references (literal scan, not a complete schema or write-set)

`dbo.user_effective_permissions`

## Change boundary

Read the selected handler and helpers it calls, then its caller in api-client.ts. Verify permission checks, record scope, transaction, rowVersion and audit on that path; a route name alone does not prove authorization. Dynamic routes/SQL, helper side effects and runtime config require source inspection.
