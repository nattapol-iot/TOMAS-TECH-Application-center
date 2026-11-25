# supplier-quotations

[Module](../modules/pricing.md) · [Index](../../../AGENTS.md)

Evidence: source snapshot `2e96a4b0`; generated, do not edit. [backend-node/src/routes/supplier-quotations.ts](<../../../backend-node/src/routes/supplier-quotations.ts>). Ranges are hints: search symbol after edits.

## API operations

| Method | Path | Source lines |
|---|---|---|
| GET | `/api/v1/supplier-quotations` | 106–155 |
| POST | `/api/v1/supplier-quotations` | 157–263 |
| POST | `/api/v1/supplier-quotations/reference` | 271–334 |
| GET | `/api/v1/supplier-quotations/:id/content` | 336–356 |
| PUT | `/api/v1/supplier-quotations/:id/lines` | 455–465 |
| GET | `/api/v1/supplier-quotations/:id/lines` | 467–489 |
| POST | `/api/v1/supplier-quotations/parse-pdf` | 493–548 |
| PATCH | `/api/v1/supplier-quotations/:id` | 552–655 |
| DELETE | `/api/v1/supplier-quotations/:id` | 657–685 |
| GET | `/api/v1/supplier-quotation-lines` | 688–727 |

## Named functions

| Symbol | Source | Lines |
|---|---|---|
| `todayIn` | [backend-node/src/routes/supplier-quotations.ts](<../../../backend-node/src/routes/supplier-quotations.ts>) | 26–30 |
| `multipartPositiveId` | [backend-node/src/routes/supplier-quotations.ts](<../../../backend-node/src/routes/supplier-quotations.ts>) | 32–39 |
| `bodyId` | [backend-node/src/routes/supplier-quotations.ts](<../../../backend-node/src/routes/supplier-quotations.ts>) | 45–45 |
| `parseSourceUrl` | [backend-node/src/routes/supplier-quotations.ts](<../../../backend-node/src/routes/supplier-quotations.ts>) | 52–58 |
| `parseThbRate` | [backend-node/src/routes/supplier-quotations.ts](<../../../backend-node/src/routes/supplier-quotations.ts>) | 65–72 |
| `quotation` | [backend-node/src/routes/supplier-quotations.ts](<../../../backend-node/src/routes/supplier-quotations.ts>) | 74–103 |
| `registerSupplierQuotationRoutes` | [backend-node/src/routes/supplier-quotations.ts](<../../../backend-node/src/routes/supplier-quotations.ts>) | 105–728 |

## Direct local dependencies

- [backend-node/src/config.ts](<../../../backend-node/src/config.ts>)
- [backend-node/src/db.ts](<../../../backend-node/src/db.ts>)
- [backend-node/src/document-storage.ts](<../../../backend-node/src/document-storage.ts>)
- [backend-node/src/document-number.ts](<../../../backend-node/src/document-number.ts>)
- [backend-node/src/errors.ts](<../../../backend-node/src/errors.ts>)
- [backend-node/src/http.ts](<../../../backend-node/src/http.ts>)
- [backend-node/src/users.ts](<../../../backend-node/src/users.ts>)
- [backend-node/src/copilot-ocr/errors.ts](<../../../backend-node/src/copilot-ocr/errors.ts>)
- [backend-node/src/copilot-ocr/quotation.ts](<../../../backend-node/src/copilot-ocr/quotation.ts>)
- [backend-node/src/copilot-ocr/types.ts](<../../../backend-node/src/copilot-ocr/types.ts>)

## SQL references (literal scan, not a complete schema or write-set)

`dbo.audit_log`, `dbo.inquiries`, `dbo.supplier_quotation_lines`, `dbo.supplier_quotations`, `dbo.suppliers`, `dbo.users`

## Change boundary

Read the selected handler and helpers it calls, then its caller in api-client.ts. Verify permission checks, record scope, transaction, rowVersion and audit on that path; a route name alone does not prove authorization. Dynamic routes/SQL, helper side effects and runtime config require source inspection.
