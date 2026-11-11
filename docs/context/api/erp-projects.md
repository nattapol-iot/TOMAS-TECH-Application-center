# erp-projects

[Module](../modules/projects.md) · [Index](../../../AGENTS.md)

Evidence: source snapshot `f6cd0d36`; generated, do not edit. [backend-node/src/routes/erp-projects.ts](<../../../backend-node/src/routes/erp-projects.ts>). Ranges are hints: search symbol after edits.

## API operations

| Method | Path | Source lines |
|---|---|---|
| GET | `/api/v1/erp/projects` | 17–50 |

## Named functions

| Symbol | Source | Lines |
|---|---|---|
| `registerErpProjectRoutes` | [backend-node/src/routes/erp-projects.ts](<../../../backend-node/src/routes/erp-projects.ts>) | 16–51 |

## Direct local dependencies

- [backend-node/src/db.ts](<../../../backend-node/src/db.ts>)
- [backend-node/src/erp-purchasing.ts](<../../../backend-node/src/erp-purchasing.ts>)
- [backend-node/src/erp-projects.ts](<../../../backend-node/src/erp-projects.ts>)
- [backend-node/src/http.ts](<../../../backend-node/src/http.ts>)
- [backend-node/src/users.ts](<../../../backend-node/src/users.ts>)

## SQL references (literal scan, not a complete schema or write-set)

`dbo.customers`, `dbo.projects`

## Change boundary

Read the selected handler and helpers it calls, then its caller in api-client.ts. Verify permission checks, record scope, transaction, rowVersion and audit on that path; a route name alone does not prove authorization. Dynamic routes/SQL, helper side effects and runtime config require source inspection.
