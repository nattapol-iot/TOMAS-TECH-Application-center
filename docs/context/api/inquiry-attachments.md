# inquiry-attachments

[Module](../modules/inquiry.md) · [Index](../../../AGENTS.md)

Evidence: source snapshot `543450fe`; generated, do not edit. [backend-node/src/routes/inquiry-attachments.ts](<../../../backend-node/src/routes/inquiry-attachments.ts>). Ranges are hints: search symbol after edits.

## API operations

| Method | Path | Source lines |
|---|---|---|
| POST | `/api/v1/inquiries/:id/attachments` | 37–97 |
| GET | `/api/v1/inquiries/:id/attachments/:attachmentId/content` | 99–118 |

## Named functions

| Symbol | Source | Lines |
|---|---|---|
| `attachment` | [backend-node/src/routes/inquiry-attachments.ts](<../../../backend-node/src/routes/inquiry-attachments.ts>) | 23–29 |
| `registerInquiryAttachmentRoutes` | [backend-node/src/routes/inquiry-attachments.ts](<../../../backend-node/src/routes/inquiry-attachments.ts>) | 31–119 |

## Direct local dependencies

- [backend-node/src/config.ts](<../../../backend-node/src/config.ts>)
- [backend-node/src/db.ts](<../../../backend-node/src/db.ts>)
- [backend-node/src/document-storage.ts](<../../../backend-node/src/document-storage.ts>)
- [backend-node/src/errors.ts](<../../../backend-node/src/errors.ts>)
- [backend-node/src/http.ts](<../../../backend-node/src/http.ts>)
- [backend-node/src/audit.ts](<../../../backend-node/src/audit.ts>)
- [backend-node/src/users.ts](<../../../backend-node/src/users.ts>)

## SQL references (literal scan, not a complete schema or write-set)

`dbo.inquiries`, `dbo.inquiry_attachments`

## Change boundary

Read the selected handler and helpers it calls, then its caller in api-client.ts. Verify permission checks, record scope, transaction, rowVersion and audit on that path; a route name alone does not prove authorization. Dynamic routes/SQL, helper side effects and runtime config require source inspection.
