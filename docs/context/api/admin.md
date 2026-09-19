# admin

[Module](../modules/master.md) · [Index](../../../AGENTS.md)

Evidence: source snapshot `543450fe`; generated, do not edit. [backend-node/src/routes/admin.ts](<../../../backend-node/src/routes/admin.ts>). Ranges are hints: search symbol after edits.

## API operations

| Method | Path | Source lines |
|---|---|---|
| GET | `/api/v1/admin/storage-check` | 137–141 |
| GET | `/api/v1/admin/nas-settings` | 143–162 |
| PUT | `/api/v1/admin/nas-settings` | 164–188 |
| POST | `/api/v1/admin/nas-settings/test` | 190–199 |
| GET | `/api/v1/admin/roles` | 200–209 |
| PUT | `/api/v1/admin/users/:id/role` | 211–264 |
| GET | `/api/v1/admin/users/:id/roles` | 266–293 |
| POST | `/api/v1/admin/users/:id/roles` | 295–345 |
| DELETE | `/api/v1/admin/users/:id/roles/:roleCode` | 347–367 |
| GET | `/api/v1/admin/engineering-rates` | 369–417 |
| GET | `/api/v1/estimates/engineering-rate-options` | 419–450 |
| GET | `/api/v1/admin/audit` | 452–525 |

## Named functions

| Symbol | Source | Lines |
|---|---|---|
| `nasInput` | [backend-node/src/routes/admin.ts](<../../../backend-node/src/routes/admin.ts>) | 74–87 |
| `tcpCheck` | [backend-node/src/routes/admin.ts](<../../../backend-node/src/routes/admin.ts>) | 89–99 |
| `storageCheck` | [backend-node/src/routes/admin.ts](<../../../backend-node/src/routes/admin.ts>) | 101–116 |
| `registerAdminRoutes` | [backend-node/src/routes/admin.ts](<../../../backend-node/src/routes/admin.ts>) | 125–125 |
| `registerAdminRoutes` | [backend-node/src/routes/admin.ts](<../../../backend-node/src/routes/admin.ts>) | 126–126 |
| `registerAdminRoutes` | [backend-node/src/routes/admin.ts](<../../../backend-node/src/routes/admin.ts>) | 127–526 |

## Direct local dependencies

- [backend-node/src/config.ts](<../../../backend-node/src/config.ts>)
- [backend-node/src/audit.ts](<../../../backend-node/src/audit.ts>)
- [backend-node/src/db.ts](<../../../backend-node/src/db.ts>)
- [backend-node/src/engineering-rate-access.ts](<../../../backend-node/src/engineering-rate-access.ts>)
- [backend-node/src/user-roles.ts](<../../../backend-node/src/user-roles.ts>)
- [backend-node/src/errors.ts](<../../../backend-node/src/errors.ts>)
- [backend-node/src/http.ts](<../../../backend-node/src/http.ts>)
- [backend-node/src/users.ts](<../../../backend-node/src/users.ts>)

## SQL references (literal scan, not a complete schema or write-set)

`dbo.audit_log`, `dbo.engineering_rates`, `dbo.mat_audit`, `dbo.nas_storage_settings`, `dbo.roles`, `dbo.user_business_roles`, `dbo.users`

## Change boundary

Read the selected handler and helpers it calls, then its caller in api-client.ts. Verify permission checks, record scope, transaction, rowVersion and audit on that path; a route name alone does not prove authorization. Dynamic routes/SQL, helper side effects and runtime config require source inspection.
