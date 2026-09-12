# signature-master

[Module](../modules/signing.md) · [Index](../../../AGENTS.md)

Evidence: source snapshot `5eb9231a`; generated, do not edit. [backend-node/src/routes/signature-master.ts](<../../../backend-node/src/routes/signature-master.ts>). Ranges are hints: search symbol after edits.

## API operations

| Method | Path | Source lines |
|---|---|---|
| GET | `/api/v1/me/signature` | 68–87 |
| PUT | `/api/v1/me/signature` | 94–167 |
| GET | `/api/v1/me/signature/preview` | 170–188 |
| GET | `/api/v1/master/company-stamps` | 193–252 |
| POST | `/api/v1/master/company-stamps` | 254–311 |
| PUT | `/api/v1/master/company-stamps/:stampId/image` | 318–355 |
| POST | `/api/v1/master/company-stamps/:stampId/authorities` | 362–439 |
| POST | `/api/v1/master/company-stamps/:stampId/authorities/:authorityId/revoke` | 441–467 |
| GET | `/api/v1/master/signature-flows` | 472–526 |

## Named functions

| Symbol | Source | Lines |
|---|---|---|
| `decodePng` | [backend-node/src/routes/signature-master.ts](<../../../backend-node/src/routes/signature-master.ts>) | 34–57 |
| `registerSignatureMasterRoutes` | [backend-node/src/routes/signature-master.ts](<../../../backend-node/src/routes/signature-master.ts>) | 59–527 |

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

`dbo.company_stamps`, `dbo.notifications`, `dbo.roles`, `dbo.sign_flow_steps`, `dbo.sign_flow_templates`, `dbo.sign_requests`, `dbo.signature_marks`, `dbo.signature_specimens`, `dbo.stamp_authorities`, `dbo.users`

## Change boundary

Read the selected handler and helpers it calls, then its caller in api-client.ts. Verify permission checks, record scope, transaction, rowVersion and audit on that path; a route name alone does not prove authorization. Dynamic routes/SQL, helper side effects and runtime config require source inspection.
