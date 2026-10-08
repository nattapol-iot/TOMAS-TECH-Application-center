# supplier-quotations

[Module](../modules/pricing.md) · [Index](../../../AGENTS.md)

Evidence: source snapshot `564bcc7d`; generated, do not edit. [backend-node/src/routes/supplier-quotations.ts](<../../../backend-node/src/routes/supplier-quotations.ts>). Ranges are hints: search symbol after edits.

## API operations

| Method | Path | Source lines |
|---|---|---|
| GET | `/api/v1/supplier-quotations` | 81–120 |
| POST | `/api/v1/supplier-quotations` | 122–201 |
| POST | `/api/v1/supplier-quotations/reference` | 209–259 |
| GET | `/api/v1/supplier-quotations/:id/content` | 261–278 |
| PUT | `/api/v1/supplier-quotations/:id/lines` | 353–366 |
| GET | `/api/v1/supplier-quotations/:id/lines` | 368–381 |
| POST | `/api/v1/supplier-quotations/parse-pdf` | 387–428 |
| PATCH | `/api/v1/supplier-quotations/:id` | 432–520 |
| DELETE | `/api/v1/supplier-quotations/:id` | 522–548 |
| GET | `/api/v1/supplier-quotation-lines` | 551–582 |

## Named functions

| Symbol | Source | Lines |
|---|---|---|
| `todayIn` | [backend-node/src/routes/supplier-quotations.ts](<../../../backend-node/src/routes/supplier-quotations.ts>) | 23–27 |
| `multipartPositiveId` | [backend-node/src/routes/supplier-quotations.ts](<../../../backend-node/src/routes/supplier-quotations.ts>) | 29–36 |
| `bodyId` | [backend-node/src/routes/supplier-quotations.ts](<../../../backend-node/src/routes/supplier-quotations.ts>) | 42–42 |
| `parseSourceUrl` | [backend-node/src/routes/supplier-quotations.ts](<../../../backend-node/src/routes/supplier-quotations.ts>) | 49–55 |
| `quotation` | [backend-node/src/routes/supplier-quotations.ts](<../../../backend-node/src/routes/supplier-quotations.ts>) | 57–73 |
| `registerSupplierQuotationRoutes` | [backend-node/src/routes/supplier-quotations.ts](<../../../backend-node/src/routes/supplier-quotations.ts>) | 75–583 |

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
