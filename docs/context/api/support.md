# support

[Module](../modules/support.md) · [Index](../../../AGENTS.md)

Evidence: source snapshot `3e4a891`; generated, do not edit. [backend-node/src/routes/support.ts](<../../../backend-node/src/routes/support.ts>). Ranges are hints: search symbol after edits.

## API operations

| Method | Path | Source lines |
|---|---|---|
| GET | `/api/v1/support/bootstrap` | 17–22 |
| POST | `/api/v1/support/members` | 23–41 |
| GET | `/api/v1/support/tickets` | 42–51 |
| GET | `/api/v1/me/support-contributions` | 52–58 |
| POST | `/api/v1/support/tickets` | 59–75 |
| GET | `/api/v1/support/tickets/:id` | 76–79 |
| POST | `/api/v1/support/tickets/:id/attachments` | 135–159 |
| GET | `/api/v1/support/tickets/:id/attachments/:attachmentId/content` | 160–164 |

## Named functions

| Symbol | Source | Lines |
|---|---|---|
| `registerSupportRoutes` | [backend-node/src/routes/support.ts](<../../../backend-node/src/routes/support.ts>) | 15–165 |

## Direct local dependencies

- [backend-node/src/config.ts](<../../../backend-node/src/config.ts>)
- [backend-node/src/db.ts](<../../../backend-node/src/db.ts>)
- [backend-node/src/users.ts](<../../../backend-node/src/users.ts>)
- [backend-node/src/errors.ts](<../../../backend-node/src/errors.ts>)
- [backend-node/src/http.ts](<../../../backend-node/src/http.ts>)
- [backend-node/src/document-storage.ts](<../../../backend-node/src/document-storage.ts>)
- [backend-node/src/audit.ts](<../../../backend-node/src/audit.ts>)
- [backend-node/src/email.ts](<../../../backend-node/src/email.ts>)
- [backend-node/src/support-rules.ts](<../../../backend-node/src/support-rules.ts>)
- [backend-node/src/support-service.ts](<../../../backend-node/src/support-service.ts>)

## SQL references (literal scan, not a complete schema or write-set)

`dbo.permissions`, `dbo.role_permissions`, `dbo.support_attachments`, `dbo.support_members`, `dbo.support_recognition`, `dbo.support_tickets`, `dbo.users`

## Change boundary

Read the selected handler and helpers it calls, then its caller in api-client.ts. Verify permission checks, record scope, transaction, rowVersion and audit on that path; a route name alone does not prove authorization. Dynamic routes/SQL, helper side effects and runtime config require source inspection.
