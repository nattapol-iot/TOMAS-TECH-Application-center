# estimate-historical-import

[Module](../modules/estimate-erp.md) · [Index](../../../AGENTS.md)

Evidence: source snapshot `bb826cd0`; generated, do not edit. [backend-node/src/routes/estimate-historical-import.ts](<../../../backend-node/src/routes/estimate-historical-import.ts>). Ranges are hints: search symbol after edits.

## API operations

| Method | Path | Source lines |
|---|---|---|
| GET | `/api/v1/estimates/historical-import/projects` | 71–104 |
| POST | `/api/v1/estimates/historical-import` | 106–286 |

## Named functions

| Symbol | Source | Lines |
|---|---|---|
| `addYears` | [backend-node/src/routes/estimate-historical-import.ts](<../../../backend-node/src/routes/estimate-historical-import.ts>) | 27–31 |
| `mayImportForProject` | [backend-node/src/routes/estimate-historical-import.ts](<../../../backend-node/src/routes/estimate-historical-import.ts>) | 34–36 |
| `parseHistoricalImport` | [backend-node/src/routes/estimate-historical-import.ts](<../../../backend-node/src/routes/estimate-historical-import.ts>) | 38–53 |
| `registerEstimateHistoricalImportRoutes` | [backend-node/src/routes/estimate-historical-import.ts](<../../../backend-node/src/routes/estimate-historical-import.ts>) | 69–287 |

## Direct local dependencies

- [backend-node/src/audit.ts](<../../../backend-node/src/audit.ts>)
- [backend-node/src/business-date.ts](<../../../backend-node/src/business-date.ts>)
- [backend-node/src/config.ts](<../../../backend-node/src/config.ts>)
- [backend-node/src/db.ts](<../../../backend-node/src/db.ts>)
- [backend-node/src/document-number.ts](<../../../backend-node/src/document-number.ts>)
- [backend-node/src/document-storage.ts](<../../../backend-node/src/document-storage.ts>)
- [backend-node/src/errors.ts](<../../../backend-node/src/errors.ts>)
- [backend-node/src/http.ts](<../../../backend-node/src/http.ts>)
- [backend-node/src/overhead.ts](<../../../backend-node/src/overhead.ts>)
- [backend-node/src/estimate-total-guard.ts](<../../../backend-node/src/estimate-total-guard.ts>)
- [backend-node/src/types.ts](<../../../backend-node/src/types.ts>)
- [backend-node/src/user-roles.ts](<../../../backend-node/src/user-roles.ts>)
- [backend-node/src/users.ts](<../../../backend-node/src/users.ts>)
- [backend-node/src/routes/estimate-excel-import.ts](<../../../backend-node/src/routes/estimate-excel-import.ts>)

## SQL references (literal scan, not a complete schema or write-set)

`dbo.audit_log`, `dbo.customers`, `dbo.estimates`, `dbo.inquiries`, `dbo.projects`, `dbo.user_effective_roles`, `dbo.users`

## Change boundary

Read the selected handler and helpers it calls, then its caller in api-client.ts. Verify permission checks, record scope, transaction, rowVersion and audit on that path; a route name alone does not prove authorization. Dynamic routes/SQL, helper side effects and runtime config require source inspection.
