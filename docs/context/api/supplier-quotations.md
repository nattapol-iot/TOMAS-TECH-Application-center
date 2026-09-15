# supplier-quotations

[Module](../modules/pricing.md) · [Index](../../../AGENTS.md)

Evidence: source snapshot `6b6809b`; generated, do not edit. [backend-node/src/routes/supplier-quotations.ts](<../../../backend-node/src/routes/supplier-quotations.ts>). Ranges are hints: search symbol after edits.

## API operations

| Method | Path | Source lines |
|---|---|---|
| GET | `/api/v1/supplier-quotations` | 56–92 |
| POST | `/api/v1/supplier-quotations` | 94–163 |
| GET | `/api/v1/supplier-quotations/:id/content` | 165–178 |
| PUT | `/api/v1/supplier-quotations/:id/lines` | 225–250 |
| GET | `/api/v1/supplier-quotations/:id/lines` | 252–265 |
| POST | `/api/v1/supplier-quotations/parse-pdf` | 271–312 |
| PATCH | `/api/v1/supplier-quotations/:id` | 316–392 |
| DELETE | `/api/v1/supplier-quotations/:id` | 394–419 |
| GET | `/api/v1/supplier-quotation-lines` | 422–449 |

## Named functions

| Symbol | Source | Lines |
|---|---|---|
| `todayIn` | [backend-node/src/routes/supplier-quotations.ts](<../../../backend-node/src/routes/supplier-quotations.ts>) | 23–27 |
| `multipartPositiveId` | [backend-node/src/routes/supplier-quotations.ts](<../../../backend-node/src/routes/supplier-quotations.ts>) | 29–36 |
| `quotation` | [backend-node/src/routes/supplier-quotations.ts](<../../../backend-node/src/routes/supplier-quotations.ts>) | 38–48 |
| `registerSupplierQuotationRoutes` | [backend-node/src/routes/supplier-quotations.ts](<../../../backend-node/src/routes/supplier-quotations.ts>) | 50–450 |

## Direct local dependencies

- [backend-node/src/config.ts](<../../../backend-node/src/config.ts>)
- [backend-node/src/db.ts](<../../../backend-node/src/db.ts>)
- [backend-node/src/document-storage.ts](<../../../backend-node/src/document-storage.ts>)
- [backend-node/src/document-number.ts](<../../../backend-node/src/document-number.ts>)
- [backend-node/src/errors.ts](<../../../backend-node/src/errors.ts>)
- [backend-node/src/http.ts](<../../../backend-node/src/http.ts>)
- [backend-node/src/users.ts](<../../../backend-node/src/users.ts>)

## SQL references (literal scan, not a complete schema or write-set)

`dbo.audit_log`, `dbo.inquiries`, `dbo.supplier_quotation_lines`, `dbo.supplier_quotations`, `dbo.suppliers`, `dbo.users`

## Change boundary

Read the selected handler and helpers it calls, then its caller in api-client.ts. Verify permission checks, record scope, transaction, rowVersion and audit on that path; a route name alone does not prove authorization. Dynamic routes/SQL, helper side effects and runtime config require source inspection.
