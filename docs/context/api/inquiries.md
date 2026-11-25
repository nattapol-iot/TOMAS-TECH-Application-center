# inquiries

[Module](../modules/inquiry.md) · [Index](../../../AGENTS.md)

Evidence: source snapshot `cabb1a7f`; generated, do not edit. [backend-node/src/routes/inquiries.ts](<../../../backend-node/src/routes/inquiries.ts>). Ranges are hints: search symbol after edits.

## API operations

| Method | Path | Source lines |
|---|---|---|
| GET | `/api/v1/inquiries` | 245–385 |
| GET | `/api/v1/inquiries/:id` | 387–546 |
| GET | `/api/v1/inquiry-duplicates` | 548–561 |
| POST | `/api/v1/inquiries` | 563–773 |
| PUT | `/api/v1/inquiries/:id/assignment` | 775–865 |
| PUT | `/api/v1/inquiries/:id/qualification` | 867–916 |
| POST | `/api/v1/inquiries/:id/meetings` | 918–980 |

## Named functions

| Symbol | Source | Lines |
|---|---|---|
| `optionalInteger` | [backend-node/src/routes/inquiries.ts](<../../../backend-node/src/routes/inquiries.ts>) | 165–172 |
| `nullableNumber` | [backend-node/src/routes/inquiries.ts](<../../../backend-node/src/routes/inquiries.ts>) | 174–176 |
| `todayIn` | [backend-node/src/routes/inquiries.ts](<../../../backend-node/src/routes/inquiries.ts>) | 178–187 |
| `addYears` | [backend-node/src/routes/inquiries.ts](<../../../backend-node/src/routes/inquiries.ts>) | 189–193 |
| `queueAssignmentNotice` | [backend-node/src/routes/inquiries.ts](<../../../backend-node/src/routes/inquiries.ts>) | 214–237 |
| `deliverAssignmentEmail` | [backend-node/src/routes/inquiries.ts](<../../../backend-node/src/routes/inquiries.ts>) | 239–241 |
| `registerInquiryRoutes` | [backend-node/src/routes/inquiries.ts](<../../../backend-node/src/routes/inquiries.ts>) | 243–981 |

## Direct local dependencies

- [backend-node/src/audit.ts](<../../../backend-node/src/audit.ts>)
- [backend-node/src/config.ts](<../../../backend-node/src/config.ts>)
- [backend-node/src/db.ts](<../../../backend-node/src/db.ts>)
- [backend-node/src/email.ts](<../../../backend-node/src/email.ts>)
- [backend-node/src/errors.ts](<../../../backend-node/src/errors.ts>)
- [backend-node/src/end-user.ts](<../../../backend-node/src/end-user.ts>)
- [backend-node/src/http.ts](<../../../backend-node/src/http.ts>)
- [backend-node/src/site-visit-common.ts](<../../../backend-node/src/site-visit-common.ts>)
- [backend-node/src/users.ts](<../../../backend-node/src/users.ts>)
- [backend-node/src/crm-sales-evidence.ts](<../../../backend-node/src/crm-sales-evidence.ts>)
- [backend-node/src/crm.ts](<../../../backend-node/src/crm.ts>)

## SQL references (literal scan, not a complete schema or write-set)

`dbo.audit_log`, `dbo.crm_opportunities`, `dbo.customer_site_contacts`, `dbo.customer_sites`, `dbo.customers`, `dbo.estimates`, `dbo.inquiries`, `dbo.inquiry_attachments`, `dbo.inquiry_meetings`, `dbo.issue_document_number`, `dbo.projects`, `dbo.user_effective_permissions`, `dbo.user_effective_roles`, `dbo.users`, `dbo.v_estimate_totals`

## Change boundary

Read the selected handler and helpers it calls, then its caller in api-client.ts. Verify permission checks, record scope, transaction, rowVersion and audit on that path; a route name alone does not prove authorization. Dynamic routes/SQL, helper side effects and runtime config require source inspection.
