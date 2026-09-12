# report-templates

[Module](../modules/reports.md) · [Index](../../../AGENTS.md)

Evidence: source snapshot `e867e48e`; generated, do not edit. [backend-node/src/routes/report-templates.ts](<../../../backend-node/src/routes/report-templates.ts>). Ranges are hints: search symbol after edits.

## API operations

| Method | Path | Source lines |
|---|---|---|


## Named functions

| Symbol | Source | Lines |
|---|---|---|
| `registerReportTemplateRoutes` | [backend-node/src/routes/report-templates.ts](<../../../backend-node/src/routes/report-templates.ts>) | 11–64 |

## Direct local dependencies

- [backend-node/src/db.ts](<../../../backend-node/src/db.ts>)
- [backend-node/src/users.ts](<../../../backend-node/src/users.ts>)
- [backend-node/src/http.ts](<../../../backend-node/src/http.ts>)
- [backend-node/src/errors.ts](<../../../backend-node/src/errors.ts>)
- [backend-node/src/audit.ts](<../../../backend-node/src/audit.ts>)
- [backend-node/src/unified-report-service.ts](<../../../backend-node/src/unified-report-service.ts>)
- [backend-node/src/report-template-service.ts](<../../../backend-node/src/report-template-service.ts>)

## SQL references (literal scan, not a complete schema or write-set)

`dbo.report_templates`

## Change boundary

Read the selected handler and helpers it calls, then its caller in api-client.ts. Verify permission checks, record scope, transaction, rowVersion and audit on that path; a route name alone does not prove authorization. Dynamic routes/SQL, helper side effects and runtime config require source inspection.
