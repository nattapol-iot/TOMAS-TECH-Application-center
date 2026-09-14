# bootstrap

[Module](../modules/shell.md) · [Index](../../../AGENTS.md)

Evidence: source snapshot `9ed694e3`; generated, do not edit. [backend-node/src/routes/bootstrap.ts](<../../../backend-node/src/routes/bootstrap.ts>). Ranges are hints: search symbol after edits.

## API operations

| Method | Path | Source lines |
|---|---|---|
| GET | `/api/v1/me` | 23–23 |
| GET | `/api/v1/bootstrap` | 25–125 |

## Named functions

| Symbol | Source | Lines |
|---|---|---|
| `registerBootstrapRoutes` | [backend-node/src/routes/bootstrap.ts](<../../../backend-node/src/routes/bootstrap.ts>) | 22–126 |

## Direct local dependencies

- [backend-node/src/db.ts](<../../../backend-node/src/db.ts>)
- [backend-node/src/http.ts](<../../../backend-node/src/http.ts>)
- [backend-node/src/users.ts](<../../../backend-node/src/users.ts>)
- [backend-node/src/routes/sales-customers.ts](<../../../backend-node/src/routes/sales-customers.ts>)

## SQL references (literal scan, not a complete schema or write-set)

`dbo.customers`, `dbo.employees`, `dbo.estimates`, `dbo.inquiries`, `dbo.permissions`, `dbo.projects`, `dbo.role_permissions`, `dbo.roles`, `dbo.suppliers`, `dbo.user_signing_permissions`, `dbo.users`

## Change boundary

Read the selected handler and helpers it calls, then its caller in api-client.ts. Verify permission checks, record scope, transaction, rowVersion and audit on that path; a route name alone does not prove authorization. Dynamic routes/SQL, helper side effects and runtime config require source inspection.
