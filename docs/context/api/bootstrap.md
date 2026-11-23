# bootstrap

[Module](../modules/shell.md) · [Index](../../../AGENTS.md)

Evidence: source snapshot `c868f0e0`; generated, do not edit. [backend-node/src/routes/bootstrap.ts](<../../../backend-node/src/routes/bootstrap.ts>). Ranges are hints: search symbol after edits.

## API operations

| Method | Path | Source lines |
|---|---|---|
| GET | `/api/v1/me` | 141–141 |
| PUT | `/api/v1/me/menu-favorites` | 143–152 |
| GET | `/api/v1/bootstrap` | 154–292 |

## Named functions

| Symbol | Source | Lines |
|---|---|---|
| `menuFavoritesInput` | [backend-node/src/routes/bootstrap.ts](<../../../backend-node/src/routes/bootstrap.ts>) | 117–125 |
| `registerBootstrapRoutes` | [backend-node/src/routes/bootstrap.ts](<../../../backend-node/src/routes/bootstrap.ts>) | 134–293 |

## Direct local dependencies

- [backend-node/src/db.ts](<../../../backend-node/src/db.ts>)
- [backend-node/src/errors.ts](<../../../backend-node/src/errors.ts>)
- [backend-node/src/http.ts](<../../../backend-node/src/http.ts>)
- [backend-node/src/master-data/services.ts](<../../../backend-node/src/master-data/services.ts>)
- [backend-node/src/tmt-id/token-vault.ts](<../../../backend-node/src/tmt-id/token-vault.ts>)
- [backend-node/src/users.ts](<../../../backend-node/src/users.ts>)
- [backend-node/src/routes/sales-customers.ts](<../../../backend-node/src/routes/sales-customers.ts>)

## SQL references (literal scan, not a complete schema or write-set)

`dbo.customers`, `dbo.employees`, `dbo.estimates`, `dbo.inquiries`, `dbo.projects`, `dbo.roles`, `dbo.suppliers`, `dbo.user_effective_permissions`, `dbo.user_effective_roles`, `dbo.user_menu_favorites`, `dbo.users`

## Change boundary

Read the selected handler and helpers it calls, then its caller in api-client.ts. Verify permission checks, record scope, transaction, rowVersion and audit on that path; a route name alone does not prove authorization. Dynamic routes/SQL, helper side effects and runtime config require source inspection.
