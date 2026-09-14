# support

[Module](../modules/support.md) · [Index](../../../AGENTS.md)

Evidence: source snapshot `32e38249`; generated, do not edit. [backend-node/src/routes/support.ts](<../../../backend-node/src/routes/support.ts>). Ranges are hints: search symbol after edits.

## API operations

| Method | Path | Source lines |
|---|---|---|
| GET | `/api/v1/support/bootstrap` | 16–21 |
| POST | `/api/v1/support/members` | 22–37 |
| GET | `/api/v1/support/tickets` | 38–47 |
| GET | `/api/v1/me/support-contributions` | 48–54 |
| POST | `/api/v1/support/tickets` | 55–68 |
| GET | `/api/v1/support/tickets/:id` | 69–72 |
| POST | `/api/v1/support/tickets/:id/attachments` | 120–144 |
| GET | `/api/v1/support/tickets/:id/attachments/:attachmentId/content` | 145–149 |

## Named functions

| Symbol | Source | Lines |
|---|---|---|
| `registerSupportRoutes` | [backend-node/src/routes/support.ts](<../../../backend-node/src/routes/support.ts>) | 14–150 |

## Direct local dependencies

- [backend-node/src/config.ts](<../../../backend-node/src/config.ts>)
- [backend-node/src/db.ts](<../../../backend-node/src/db.ts>)
- [backend-node/src/users.ts](<../../../backend-node/src/users.ts>)
- [backend-node/src/errors.ts](<../../../backend-node/src/errors.ts>)
- [backend-node/src/http.ts](<../../../backend-node/src/http.ts>)
- [backend-node/src/document-storage.ts](<../../../backend-node/src/document-storage.ts>)
- [backend-node/src/audit.ts](<../../../backend-node/src/audit.ts>)
- [backend-node/src/support-rules.ts](<../../../backend-node/src/support-rules.ts>)
- [backend-node/src/support-service.ts](<../../../backend-node/src/support-service.ts>)

## SQL references (literal scan, not a complete schema or write-set)

`dbo.permissions`, `dbo.role_permissions`, `dbo.support_attachments`, `dbo.support_members`, `dbo.support_recognition`, `dbo.support_tickets`, `dbo.users`

## Change boundary

Read the selected handler and helpers it calls, then its caller in api-client.ts. Verify permission checks, record scope, transaction, rowVersion and audit on that path; a route name alone does not prove authorization. Dynamic routes/SQL, helper side effects and runtime config require source inspection.
