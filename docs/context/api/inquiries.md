# inquiries

[Module](../modules/inquiry.md) · [Index](../../../AGENTS.md)

Evidence: source snapshot `543450fe`; generated, do not edit. [backend-node/src/routes/inquiries.ts](<../../../backend-node/src/routes/inquiries.ts>). Ranges are hints: search symbol after edits.

## API operations

| Method | Path | Source lines |
|---|---|---|
| GET | `/api/v1/inquiries` | 109–196 |
| GET | `/api/v1/inquiries/:id` | 198–290 |
| POST | `/api/v1/inquiries` | 292–401 |
| PUT | `/api/v1/inquiries/:id/assignment` | 403–442 |
| PUT | `/api/v1/inquiries/:id/qualification` | 444–479 |
| POST | `/api/v1/inquiries/:id/meetings` | 481–531 |

## Named functions

| Symbol | Source | Lines |
|---|---|---|
| `optionalInteger` | [backend-node/src/routes/inquiries.ts](<../../../backend-node/src/routes/inquiries.ts>) | 75–82 |
| `nullableNumber` | [backend-node/src/routes/inquiries.ts](<../../../backend-node/src/routes/inquiries.ts>) | 84–86 |
| `todayIn` | [backend-node/src/routes/inquiries.ts](<../../../backend-node/src/routes/inquiries.ts>) | 88–94 |
| `addYears` | [backend-node/src/routes/inquiries.ts](<../../../backend-node/src/routes/inquiries.ts>) | 96–100 |
| `registerInquiryRoutes` | [backend-node/src/routes/inquiries.ts](<../../../backend-node/src/routes/inquiries.ts>) | 102–532 |

## Direct local dependencies

- [backend-node/src/audit.ts](<../../../backend-node/src/audit.ts>)
- [backend-node/src/config.ts](<../../../backend-node/src/config.ts>)
- [backend-node/src/db.ts](<../../../backend-node/src/db.ts>)
- [backend-node/src/errors.ts](<../../../backend-node/src/errors.ts>)
- [backend-node/src/end-user.ts](<../../../backend-node/src/end-user.ts>)
- [backend-node/src/http.ts](<../../../backend-node/src/http.ts>)
- [backend-node/src/users.ts](<../../../backend-node/src/users.ts>)
- [backend-node/src/crm.ts](<../../../backend-node/src/crm.ts>)

## SQL references (literal scan, not a complete schema or write-set)

`dbo.audit_log`, `dbo.customer_site_contacts`, `dbo.customer_sites`, `dbo.customers`, `dbo.estimates`, `dbo.inquiries`, `dbo.inquiry_attachments`, `dbo.inquiry_meetings`, `dbo.issue_document_number`, `dbo.roles`, `dbo.users`, `dbo.v_estimate_totals`

## Change boundary

Read the selected handler and helpers it calls, then its caller in api-client.ts. Verify permission checks, record scope, transaction, rowVersion and audit on that path; a route name alone does not prove authorization. Dynamic routes/SQL, helper side effects and runtime config require source inspection.
