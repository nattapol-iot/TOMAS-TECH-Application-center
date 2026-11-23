# bootstrap

[Module](../modules/shell.md) · [Index](../../../AGENTS.md)

Evidence: source snapshot `394ba089`; generated, do not edit. [backend-node/src/routes/bootstrap.ts](<../../../backend-node/src/routes/bootstrap.ts>). Ranges are hints: search symbol after edits.

## API operations

| Method | Path | Source lines |
|---|---|---|
| GET | `/api/v1/me` | 62–62 |
| PUT | `/api/v1/me/menu-favorites` | 64–73 |
| GET | `/api/v1/bootstrap` | 75–177 |

## Named functions

| Symbol | Source | Lines |
|---|---|---|
| `menuFavoritesInput` | [backend-node/src/routes/bootstrap.ts](<../../../backend-node/src/routes/bootstrap.ts>) | 44–52 |
| `registerBootstrapRoutes` | [backend-node/src/routes/bootstrap.ts](<../../../backend-node/src/routes/bootstrap.ts>) | 61–178 |

## Direct local dependencies

- [backend-node/src/db.ts](<../../../backend-node/src/db.ts>)
- [backend-node/src/errors.ts](<../../../backend-node/src/errors.ts>)
- [backend-node/src/http.ts](<../../../backend-node/src/http.ts>)
- [backend-node/src/master-data/services.ts](<../../../backend-node/src/master-data/services.ts>)
- [backend-node/src/users.ts](<../../../backend-node/src/users.ts>)
- [backend-node/src/routes/sales-customers.ts](<../../../backend-node/src/routes/sales-customers.ts>)

## SQL references (literal scan, not a complete schema or write-set)

`dbo.customers`, `dbo.employees`, `dbo.estimates`, `dbo.inquiries`, `dbo.projects`, `dbo.roles`, `dbo.suppliers`, `dbo.user_effective_permissions`, `dbo.user_effective_roles`, `dbo.user_menu_favorites`, `dbo.users`

## Change boundary

Read the selected handler and helpers it calls, then its caller in api-client.ts. Verify permission checks, record scope, transaction, rowVersion and audit on that path; a route name alone does not prove authorization. Dynamic routes/SQL, helper side effects and runtime config require source inspection.
