# signature-master

[Module](../modules/signing.md) · [Index](../../../AGENTS.md)

Evidence: source snapshot `fd82cb38`; generated, do not edit. [backend-node/src/routes/signature-master.ts](<../../../backend-node/src/routes/signature-master.ts>). Ranges are hints: search symbol after edits.

## API operations

| Method | Path | Source lines |
|---|---|---|
| GET | `/api/v1/me/signature` | 55–79 |
| PUT | `/api/v1/me/signature` | 86–161 |
| GET | `/api/v1/me/signature/preview` | 164–182 |
| GET | `/api/v1/master/company-stamps` | 187–250 |
| POST | `/api/v1/master/company-stamps` | 252–310 |
| PUT | `/api/v1/master/company-stamps/:stampId/image` | 317–350 |
| POST | `/api/v1/master/company-stamps/:stampId/authorities` | 357–432 |
| POST | `/api/v1/master/company-stamps/:stampId/authorities/:authorityId/revoke` | 434–459 |
| GET | `/api/v1/master/signature-flows` | 464–522 |

## Named functions

| Symbol | Source | Lines |
|---|---|---|
| `decodePng` | [backend-node/src/routes/signature-master.ts](<../../../backend-node/src/routes/signature-master.ts>) | 27–49 |
| `registerSignatureMasterRoutes` | [backend-node/src/routes/signature-master.ts](<../../../backend-node/src/routes/signature-master.ts>) | 51–523 |

## Direct local dependencies

- [backend-node/src/config.ts](<../../../backend-node/src/config.ts>)
- [backend-node/src/db.ts](<../../../backend-node/src/db.ts>)
- [backend-node/src/document-storage.ts](<../../../backend-node/src/document-storage.ts>)
- [backend-node/src/errors.ts](<../../../backend-node/src/errors.ts>)
- [backend-node/src/http.ts](<../../../backend-node/src/http.ts>)
- [backend-node/src/audit.ts](<../../../backend-node/src/audit.ts>)
- [backend-node/src/signing-core.ts](<../../../backend-node/src/signing-core.ts>)
- [backend-node/src/users.ts](<../../../backend-node/src/users.ts>)

## SQL references (literal scan, not a complete schema or write-set)

`dbo.company_stamps`, `dbo.notifications`, `dbo.roles`, `dbo.sign_flow_steps`, `dbo.sign_flow_templates`, `dbo.sign_requests`, `dbo.signature_marks`, `dbo.signature_specimens`, `dbo.stamp_authorities`, `dbo.user_effective_roles`, `dbo.users`

## Change boundary

Read the selected handler and helpers it calls, then its caller in api-client.ts. Verify permission checks, record scope, transaction, rowVersion and audit on that path; a route name alone does not prove authorization. Dynamic routes/SQL, helper side effects and runtime config require source inspection.
