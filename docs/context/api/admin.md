# admin

[Module](../modules/master.md) · [Index](../../../AGENTS.md)

Evidence: source snapshot `056c73a4`; generated, do not edit. [backend-node/src/routes/admin.ts](<../../../backend-node/src/routes/admin.ts>). Ranges are hints: search symbol after edits.

## API operations

| Method | Path | Source lines |
|---|---|---|
| GET | `/api/v1/admin/storage-check` | 132–136 |
| GET | `/api/v1/admin/nas-settings` | 138–157 |
| PUT | `/api/v1/admin/nas-settings` | 159–183 |
| POST | `/api/v1/admin/nas-settings/test` | 185–194 |
| GET | `/api/v1/admin/roles` | 195–204 |
| PUT | `/api/v1/admin/users/:id/role` | 206–259 |
| GET | `/api/v1/admin/engineering-rates` | 261–309 |
| GET | `/api/v1/estimates/engineering-rate-options` | 311–342 |
| GET | `/api/v1/admin/audit` | 344–417 |

## Named functions

| Symbol | Source | Lines |
|---|---|---|
| `nasInput` | [backend-node/src/routes/admin.ts](<../../../backend-node/src/routes/admin.ts>) | 73–86 |
| `tcpCheck` | [backend-node/src/routes/admin.ts](<../../../backend-node/src/routes/admin.ts>) | 88–98 |
| `storageCheck` | [backend-node/src/routes/admin.ts](<../../../backend-node/src/routes/admin.ts>) | 100–115 |
| `registerAdminRoutes` | [backend-node/src/routes/admin.ts](<../../../backend-node/src/routes/admin.ts>) | 120–120 |
| `registerAdminRoutes` | [backend-node/src/routes/admin.ts](<../../../backend-node/src/routes/admin.ts>) | 121–121 |
| `registerAdminRoutes` | [backend-node/src/routes/admin.ts](<../../../backend-node/src/routes/admin.ts>) | 122–418 |

## Direct local dependencies

- [backend-node/src/config.ts](<../../../backend-node/src/config.ts>)
- [backend-node/src/audit.ts](<../../../backend-node/src/audit.ts>)
- [backend-node/src/db.ts](<../../../backend-node/src/db.ts>)
- [backend-node/src/engineering-rate-access.ts](<../../../backend-node/src/engineering-rate-access.ts>)
- [backend-node/src/errors.ts](<../../../backend-node/src/errors.ts>)
- [backend-node/src/http.ts](<../../../backend-node/src/http.ts>)
- [backend-node/src/users.ts](<../../../backend-node/src/users.ts>)

## SQL references (literal scan, not a complete schema or write-set)

`dbo.audit_log`, `dbo.engineering_rates`, `dbo.mat_audit`, `dbo.nas_storage_settings`, `dbo.roles`, `dbo.users`

## Change boundary

Read the selected handler and helpers it calls, then its caller in api-client.ts. Verify permission checks, record scope, transaction, rowVersion and audit on that path; a route name alone does not prove authorization. Dynamic routes/SQL, helper side effects and runtime config require source inspection.
