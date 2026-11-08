# supplier-quotations

[Module](../modules/pricing.md) · [Index](../../../AGENTS.md)

Evidence: source snapshot `a014c887`; generated, do not edit. [backend-node/src/routes/supplier-quotations.ts](<../../../backend-node/src/routes/supplier-quotations.ts>). Ranges are hints: search symbol after edits.

## API operations

| Method | Path | Source lines |
|---|---|---|
| GET | `/api/v1/supplier-quotations` | 96–138 |
| POST | `/api/v1/supplier-quotations` | 140–220 |
| POST | `/api/v1/supplier-quotations/reference` | 228–280 |
| GET | `/api/v1/supplier-quotations/:id/content` | 282–299 |
| PUT | `/api/v1/supplier-quotations/:id/lines` | 374–387 |
| GET | `/api/v1/supplier-quotations/:id/lines` | 389–402 |
| POST | `/api/v1/supplier-quotations/parse-pdf` | 408–449 |
| PATCH | `/api/v1/supplier-quotations/:id` | 453–545 |
| DELETE | `/api/v1/supplier-quotations/:id` | 547–573 |
| GET | `/api/v1/supplier-quotation-lines` | 576–607 |

## Named functions

| Symbol | Source | Lines |
|---|---|---|
| `todayIn` | [backend-node/src/routes/supplier-quotations.ts](<../../../backend-node/src/routes/supplier-quotations.ts>) | 23–27 |
| `multipartPositiveId` | [backend-node/src/routes/supplier-quotations.ts](<../../../backend-node/src/routes/supplier-quotations.ts>) | 29–36 |
| `bodyId` | [backend-node/src/routes/supplier-quotations.ts](<../../../backend-node/src/routes/supplier-quotations.ts>) | 42–42 |
| `parseSourceUrl` | [backend-node/src/routes/supplier-quotations.ts](<../../../backend-node/src/routes/supplier-quotations.ts>) | 49–55 |
| `parseThbRate` | [backend-node/src/routes/supplier-quotations.ts](<../../../backend-node/src/routes/supplier-quotations.ts>) | 62–69 |
| `quotation` | [backend-node/src/routes/supplier-quotations.ts](<../../../backend-node/src/routes/supplier-quotations.ts>) | 71–88 |
| `registerSupplierQuotationRoutes` | [backend-node/src/routes/supplier-quotations.ts](<../../../backend-node/src/routes/supplier-quotations.ts>) | 90–608 |

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
