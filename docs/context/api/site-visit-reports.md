# site-visit-reports

[Module](../modules/site-visit.md) · [Index](../../../AGENTS.md)

Evidence: source snapshot `09f9bd3c`; generated, do not edit. [backend-node/src/routes/site-visit-reports.ts](<../../../backend-node/src/routes/site-visit-reports.ts>). Ranges are hints: search symbol after edits.

## API operations

| Method | Path | Source lines |
|---|---|---|
| PUT | `/api/v1/site-visits/:id/report` | 176–237 |
| POST | `/api/v1/site-visits/:id/report/submit` | 239–316 |
| POST | `/api/v1/site-visits/:id/report/review` | 318–455 |
| POST | `/api/v1/site-visits/:id/report/acknowledge` | 457–511 |
| POST | `/api/v1/site-visits/:id/close` | 513–579 |
| POST | `/api/v1/site-visits/:id/links` | 581–660 |
| POST | `/api/v1/site-visits/:id/inquiry` | 662–822 |
| POST | `/api/v1/site-visits/:id/estimate` | 824–990 |

## Named functions

| Symbol | Source | Lines |
|---|---|---|
| `todayIn` | [backend-node/src/routes/site-visit-reports.ts](<../../../backend-node/src/routes/site-visit-reports.ts>) | 57–68 |
| `timestamp` | [backend-node/src/routes/site-visit-reports.ts](<../../../backend-node/src/routes/site-visit-reports.ts>) | 70–76 |
| `updateReportStatus` | [backend-node/src/routes/site-visit-reports.ts](<../../../backend-node/src/routes/site-visit-reports.ts>) | 78–102 |
| `insertLink` | [backend-node/src/routes/site-visit-reports.ts](<../../../backend-node/src/routes/site-visit-reports.ts>) | 104–127 |
| `loadCarryOver` | [backend-node/src/routes/site-visit-reports.ts](<../../../backend-node/src/routes/site-visit-reports.ts>) | 129–168 |
| `registerSiteVisitReportRoutes` | [backend-node/src/routes/site-visit-reports.ts](<../../../backend-node/src/routes/site-visit-reports.ts>) | 170–991 |

## Direct local dependencies

- [backend-node/src/config.ts](<../../../backend-node/src/config.ts>)
- [backend-node/src/db.ts](<../../../backend-node/src/db.ts>)
- [backend-node/src/document-number.ts](<../../../backend-node/src/document-number.ts>)
- [backend-node/src/errors.ts](<../../../backend-node/src/errors.ts>)
- [backend-node/src/estimate-total-guard.ts](<../../../backend-node/src/estimate-total-guard.ts>)
- [backend-node/src/http.ts](<../../../backend-node/src/http.ts>)
- [backend-node/src/site-visit-operations.ts](<../../../backend-node/src/site-visit-operations.ts>)
- [backend-node/src/site-visit-common.ts](<../../../backend-node/src/site-visit-common.ts>)
- [backend-node/src/users.ts](<../../../backend-node/src/users.ts>)

## SQL references (literal scan, not a complete schema or write-set)

`dbo.estimates`, `dbo.inquiries`, `dbo.sales_intakes`, `dbo.site_visit_links`, `dbo.site_visit_report_revisions`, `dbo.site_visit_reports`, `dbo.site_visits`, `dbo.users`

## Change boundary

Read the selected handler and helpers it calls, then its caller in api-client.ts. Verify permission checks, record scope, transaction, rowVersion and audit on that path; a route name alone does not prove authorization. Dynamic routes/SQL, helper side effects and runtime config require source inspection.
