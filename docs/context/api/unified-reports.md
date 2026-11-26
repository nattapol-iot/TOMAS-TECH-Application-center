# unified-reports

[Module](../modules/reports.md) · [Index](../../../AGENTS.md)

Evidence: source snapshot `fe216837`; generated, do not edit. [backend-node/src/routes/unified-reports.ts](<../../../backend-node/src/routes/unified-reports.ts>). Ranges are hints: search symbol after edits.

## API operations

| Method | Path | Source lines |
|---|---|---|
| GET | `/api/v1/reports/workspace/templates` | 80–95 |
| GET | `/api/v1/reports/workspace/people` | 96–124 |
| GET | `/api/v1/reports/workspace/sources` | 125–158 |
| GET | `/api/v1/reports/workspace` | 159–184 |
| GET | `/api/v1/reports/workspace/:id` | 185–195 |
| GET | `/api/v1/reports/workspace/existing-draft` | 201–221 |
| POST | `/api/v1/reports/workspace` | 222–265 |
| PUT | `/api/v1/reports/workspace/:id` | 266–286 |
| POST | `/api/v1/reports/workspace/:id/evidence` | 287–344 |
| GET | `/api/v1/reports/workspace/:id/evidence/:attachmentId/content` | 345–372 |
| POST | `/api/v1/reports/workspace/:id/exports` | 373–423 |
| GET | `/api/v1/reports/workspace/:id/exports` | 424–451 |
| GET | `/api/v1/reports/workspace/:id/exports/:exportId/content` | 452–479 |
| POST | `/api/v1/reports/workspace/:id/:action` | 480–579 |
| GET | `/api/v1/report-acknowledgments/:token` | 581–605 |
| GET | `/api/v1/report-acknowledgments/:token/evidence/:attachmentId` | 606–632 |
| POST | `/api/v1/report-acknowledgments/:token` | 633–673 |

## Named functions

| Symbol | Source | Lines |
|---|---|---|
| `validateReportEvidenceImage` | [backend-node/src/routes/unified-reports.ts](<../../../backend-node/src/routes/unified-reports.ts>) | 65–69 |
| `registerUnifiedReportRoutes` | [backend-node/src/routes/unified-reports.ts](<../../../backend-node/src/routes/unified-reports.ts>) | 70–674 |
| `bindDraft` | [backend-node/src/routes/unified-reports.ts](<../../../backend-node/src/routes/unified-reports.ts>) | 676–684 |
| `insertRevision` | [backend-node/src/routes/unified-reports.ts](<../../../backend-node/src/routes/unified-reports.ts>) | 685–691 |
| `customerRevision` | [backend-node/src/routes/unified-reports.ts](<../../../backend-node/src/routes/unified-reports.ts>) | 692–710 |

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

`dbo.inquiries`, `dbo.permissions`, `dbo.project_members`, `dbo.projects`, `dbo.role_permissions`, `dbo.roles`, `dbo.schedule_tasks`, `dbo.unified_report_acknowledgments`, `dbo.unified_report_customer_links`, `dbo.unified_report_evidence_files`, `dbo.unified_report_exports`, `dbo.unified_report_revisions`, `dbo.unified_reports`, `dbo.user_effective_roles`, `dbo.users`

## Change boundary

Read the selected handler and helpers it calls, then its caller in api-client.ts. Verify permission checks, record scope, transaction, rowVersion and audit on that path; a route name alone does not prove authorization. Dynamic routes/SQL, helper side effects and runtime config require source inspection.
