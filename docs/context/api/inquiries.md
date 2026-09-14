# inquiries

[Module](../modules/inquiry.md) · [Index](../../../AGENTS.md)

Evidence: source snapshot `32e38249`; generated, do not edit. [backend-node/src/routes/inquiries.ts](<../../../backend-node/src/routes/inquiries.ts>). Ranges are hints: search symbol after edits.

## API operations

| Method | Path | Source lines |
|---|---|---|
| GET | `/api/v1/inquiries` | 108–195 |
| GET | `/api/v1/inquiries/:id` | 197–289 |
| POST | `/api/v1/inquiries` | 291–379 |
| PUT | `/api/v1/inquiries/:id/assignment` | 381–420 |
| PUT | `/api/v1/inquiries/:id/qualification` | 422–457 |
| POST | `/api/v1/inquiries/:id/meetings` | 459–509 |

## Named functions

| Symbol | Source | Lines |
|---|---|---|
| `optionalInteger` | [backend-node/src/routes/inquiries.ts](<../../../backend-node/src/routes/inquiries.ts>) | 74–81 |
| `nullableNumber` | [backend-node/src/routes/inquiries.ts](<../../../backend-node/src/routes/inquiries.ts>) | 83–85 |
| `todayIn` | [backend-node/src/routes/inquiries.ts](<../../../backend-node/src/routes/inquiries.ts>) | 87–93 |
| `addYears` | [backend-node/src/routes/inquiries.ts](<../../../backend-node/src/routes/inquiries.ts>) | 95–99 |
| `registerInquiryRoutes` | [backend-node/src/routes/inquiries.ts](<../../../backend-node/src/routes/inquiries.ts>) | 101–510 |

## Direct local dependencies

- [backend-node/src/audit.ts](<../../../backend-node/src/audit.ts>)
- [backend-node/src/config.ts](<../../../backend-node/src/config.ts>)
- [backend-node/src/db.ts](<../../../backend-node/src/db.ts>)
- [backend-node/src/errors.ts](<../../../backend-node/src/errors.ts>)
- [backend-node/src/end-user.ts](<../../../backend-node/src/end-user.ts>)
- [backend-node/src/http.ts](<../../../backend-node/src/http.ts>)
- [backend-node/src/users.ts](<../../../backend-node/src/users.ts>)

## SQL references (literal scan, not a complete schema or write-set)

`dbo.audit_log`, `dbo.customers`, `dbo.estimates`, `dbo.inquiries`, `dbo.inquiry_attachments`, `dbo.inquiry_meetings`, `dbo.issue_document_number`, `dbo.roles`, `dbo.users`, `dbo.v_estimate_totals`

## Change boundary

Read the selected handler and helpers it calls, then its caller in api-client.ts. Verify permission checks, record scope, transaction, rowVersion and audit on that path; a route name alone does not prove authorization. Dynamic routes/SQL, helper side effects and runtime config require source inspection.
