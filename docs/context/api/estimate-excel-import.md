# estimate-excel-import

[Module](../modules/estimate-erp.md) · [Index](../../../AGENTS.md)

Evidence: source snapshot `e867e48e`; generated, do not edit. [backend-node/src/routes/estimate-excel-import.ts](<../../../backend-node/src/routes/estimate-excel-import.ts>). Ranges are hints: search symbol after edits.

## API operations

| Method | Path | Source lines |
|---|---|---|
| GET | `/api/v1/estimates/:id/excel-imports` | 79–84 |
| GET | `/api/v1/estimates/:id/excel-imports/:revision/:hash/content` | 85–95 |
| POST | `/api/v1/estimates/:id/excel-import` | 96–172 |

## Named functions

| Symbol | Source | Lines |
|---|---|---|
| `decimal` | [backend-node/src/routes/estimate-excel-import.ts](<../../../backend-node/src/routes/estimate-excel-import.ts>) | 16–19 |
| `parseExcelImport` | [backend-node/src/routes/estimate-excel-import.ts](<../../../backend-node/src/routes/estimate-excel-import.ts>) | 20–53 |
| `validateOriginalEstimateWorkbook` | [backend-node/src/routes/estimate-excel-import.ts](<../../../backend-node/src/routes/estimate-excel-import.ts>) | 55–71 |
| `registerEstimateExcelImportRoutes` | [backend-node/src/routes/estimate-excel-import.ts](<../../../backend-node/src/routes/estimate-excel-import.ts>) | 73–173 |

## Direct local dependencies

- [backend-node/src/audit.ts](<../../../backend-node/src/audit.ts>)
- [backend-node/src/db.ts](<../../../backend-node/src/db.ts>)
- [backend-node/src/config.ts](<../../../backend-node/src/config.ts>)
- [backend-node/src/document-storage.ts](<../../../backend-node/src/document-storage.ts>)
- [backend-node/src/users.ts](<../../../backend-node/src/users.ts>)
- [backend-node/src/errors.ts](<../../../backend-node/src/errors.ts>)
- [backend-node/src/http.ts](<../../../backend-node/src/http.ts>)
- [backend-node/src/estimate-workbook.ts](<../../../backend-node/src/estimate-workbook.ts>)
- [backend-node/src/estimate-total-guard.ts](<../../../backend-node/src/estimate-total-guard.ts>)

## SQL references (literal scan, not a complete schema or write-set)

`dbo.audit_log`, `dbo.cost_items`, `dbo.estimate_assignments`, `dbo.estimates`, `dbo.manhour_lines`, `dbo.roles`, `dbo.schema_versions`, `dbo.suppliers`, `dbo.users`

## Change boundary

Read the selected handler and helpers it calls, then its caller in api-client.ts. Verify permission checks, record scope, transaction, rowVersion and audit on that path; a route name alone does not prove authorization. Dynamic routes/SQL, helper side effects and runtime config require source inspection.
