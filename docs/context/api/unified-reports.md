# unified-reports

[Module](../modules/reports.md) · [Index](../../../AGENTS.md)

Evidence: source snapshot `1e58594b`; generated, do not edit. [backend-node/src/routes/unified-reports.ts](<../../../backend-node/src/routes/unified-reports.ts>). Ranges are hints: search symbol after edits.

## API operations

| Method | Path | Source lines |
|---|---|---|
| GET | `/api/v1/reports/workspace/templates` | 34–37 |
| GET | `/api/v1/reports/workspace/people` | 38–50 |
| GET | `/api/v1/reports/workspace/sources` | 51–60 |
| GET | `/api/v1/reports/workspace` | 61–73 |
| GET | `/api/v1/reports/workspace/:id` | 74–78 |
| POST | `/api/v1/reports/workspace` | 79–97 |
| PUT | `/api/v1/reports/workspace/:id` | 98–106 |
| POST | `/api/v1/reports/workspace/:id/evidence` | 107–128 |
| GET | `/api/v1/reports/workspace/:id/evidence/:attachmentId/content` | 129–133 |
| POST | `/api/v1/reports/workspace/:id/exports` | 134–150 |
| GET | `/api/v1/reports/workspace/:id/exports` | 151–158 |
| GET | `/api/v1/reports/workspace/:id/exports/:exportId/content` | 159–163 |
| POST | `/api/v1/reports/workspace/:id/:action` | 164–218 |
| GET | `/api/v1/report-acknowledgments/:token` | 220–224 |
| GET | `/api/v1/report-acknowledgments/:token/evidence/:attachmentId` | 225–234 |
| POST | `/api/v1/report-acknowledgments/:token` | 235–247 |

## Named functions

| Symbol | Source | Lines |
|---|---|---|
| `validateReportEvidenceImage` | [backend-node/src/routes/unified-reports.ts](<../../../backend-node/src/routes/unified-reports.ts>) | 23–26 |
| `registerUnifiedReportRoutes` | [backend-node/src/routes/unified-reports.ts](<../../../backend-node/src/routes/unified-reports.ts>) | 27–248 |
| `bindDraft` | [backend-node/src/routes/unified-reports.ts](<../../../backend-node/src/routes/unified-reports.ts>) | 250–252 |
| `insertRevision` | [backend-node/src/routes/unified-reports.ts](<../../../backend-node/src/routes/unified-reports.ts>) | 253–256 |
| `customerRevision` | [backend-node/src/routes/unified-reports.ts](<../../../backend-node/src/routes/unified-reports.ts>) | 257–268 |

## Direct local dependencies

- [backend-node/src/config.ts](<../../../backend-node/src/config.ts>)
- [backend-node/src/db.ts](<../../../backend-node/src/db.ts>)
- [backend-node/src/users.ts](<../../../backend-node/src/users.ts>)
- [backend-node/src/types.ts](<../../../backend-node/src/types.ts>)
- [backend-node/src/errors.ts](<../../../backend-node/src/errors.ts>)
- [backend-node/src/http.ts](<../../../backend-node/src/http.ts>)
- [backend-node/src/audit.ts](<../../../backend-node/src/audit.ts>)
- [backend-node/src/document-number.ts](<../../../backend-node/src/document-number.ts>)
- [backend-node/src/signing-core.ts](<../../../backend-node/src/signing-core.ts>)
- [backend-node/src/report-template-service.ts](<../../../backend-node/src/report-template-service.ts>)
- [backend-node/src/document-storage.ts](<../../../backend-node/src/document-storage.ts>)
- [backend-node/src/unified-report-service.ts](<../../../backend-node/src/unified-report-service.ts>)

## SQL references (literal scan, not a complete schema or write-set)

`dbo.inquiries`, `dbo.permissions`, `dbo.project_members`, `dbo.projects`, `dbo.role_permissions`, `dbo.roles`, `dbo.schedule_tasks`, `dbo.unified_report_acknowledgments`, `dbo.unified_report_customer_links`, `dbo.unified_report_evidence_files`, `dbo.unified_report_exports`, `dbo.unified_report_revisions`, `dbo.unified_reports`, `dbo.users`

## Change boundary

Read the selected handler and helpers it calls, then its caller in api-client.ts. Verify permission checks, record scope, transaction, rowVersion and audit on that path; a route name alone does not prove authorization. Dynamic routes/SQL, helper side effects and runtime config require source inspection.
