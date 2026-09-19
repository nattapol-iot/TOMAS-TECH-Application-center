# crm-documents

[Module](../modules/crm.md) · [Index](../../../AGENTS.md)

Evidence: source snapshot `543450fe`; generated, do not edit. [backend-node/src/routes/crm-documents.ts](<../../../backend-node/src/routes/crm-documents.ts>). Ranges are hints: search symbol after edits.

## API operations

| Method | Path | Source lines |
|---|---|---|
| GET | `/api/v1/crm/inquiries/:id/source` | 13–16 |
| GET | `/api/v1/crm/documents` | 17–20 |
| POST | `/api/v1/crm/documents` | 21–42 |
| GET | `/api/v1/crm/documents/:id/content` | 43–48 |

## Named functions

| Symbol | Source | Lines |
|---|---|---|
| `registerCrmDocumentRoutes` | [backend-node/src/routes/crm-documents.ts](<../../../backend-node/src/routes/crm-documents.ts>) | 12–49 |

## Direct local dependencies

- [backend-node/src/config.ts](<../../../backend-node/src/config.ts>)
- [backend-node/src/db.ts](<../../../backend-node/src/db.ts>)
- [backend-node/src/users.ts](<../../../backend-node/src/users.ts>)
- [backend-node/src/crm.ts](<../../../backend-node/src/crm.ts>)
- [backend-node/src/errors.ts](<../../../backend-node/src/errors.ts>)
- [backend-node/src/http.ts](<../../../backend-node/src/http.ts>)
- [backend-node/src/audit.ts](<../../../backend-node/src/audit.ts>)
- [backend-node/src/document-storage.ts](<../../../backend-node/src/document-storage.ts>)

## SQL references (literal scan, not a complete schema or write-set)

`dbo.crm_activities`, `dbo.crm_documents`, `dbo.crm_opportunities`, `dbo.customers`, `dbo.inquiries`, `dbo.users`

## Change boundary

Read the selected handler and helpers it calls, then its caller in api-client.ts. Verify permission checks, record scope, transaction, rowVersion and audit on that path; a route name alone does not prove authorization. Dynamic routes/SQL, helper side effects and runtime config require source inspection.
