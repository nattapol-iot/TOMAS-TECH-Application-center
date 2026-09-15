# site-visits-workflow

[Module](../modules/site-visit.md) · [Index](../../../AGENTS.md)

Evidence: source snapshot `6b6809b`; generated, do not edit. [backend-node/src/routes/site-visits-workflow.ts](<../../../backend-node/src/routes/site-visits-workflow.ts>). Ranges are hints: search symbol after edits.

## API operations

| Method | Path | Source lines |
|---|---|---|
| POST | `/api/v1/site-visits/` | 81–257 |
| POST | `/api/v1/site-visits/:id/status` | 259–367 |
| PUT | `/api/v1/site-visits/:id/schedule` | 369–475 |
| POST | `/api/v1/site-visits/:id/assignments` | 477–641 |
| POST | `/api/v1/site-visits/:id/assignments/:assignmentId/response` | 643–751 |
| DELETE | `/api/v1/site-visits/:id/assignments/:assignmentId` | 753–816 |
| POST | `/api/v1/site-visits/:id/confirmations` | 818–918 |
| POST | `/api/v1/site-visits/:id/check-in` | 920–1002 |
| POST | `/api/v1/site-visits/:id/check-out` | 1004–1102 |
| PUT | `/api/v1/site-visits/:id/checklist` | 1104–1175 |
| POST | `/api/v1/site-visits/:id/findings` | 1177–1248 |
| DELETE | `/api/v1/site-visits/:id/findings/:findingId` | 1249–1278 |
| POST | `/api/v1/site-visits/:id/action-items` | 1280–1355 |
| POST | `/api/v1/site-visits/:id/attachments` | 1357–1454 |
| GET | `/api/v1/site-visits/:id/attachments/:attachmentId/content` | 1455–1485 |

## Named functions

| Symbol | Source | Lines |
|---|---|---|
| `clean` | [backend-node/src/routes/site-visits-workflow.ts](<../../../backend-node/src/routes/site-visits-workflow.ts>) | 52–54 |
| `optionalId` | [backend-node/src/routes/site-visits-workflow.ts](<../../../backend-node/src/routes/site-visits-workflow.ts>) | 55–57 |
| `stamp` | [backend-node/src/routes/site-visits-workflow.ts](<../../../backend-node/src/routes/site-visits-workflow.ts>) | 58–63 |
| `today` | [backend-node/src/routes/site-visits-workflow.ts](<../../../backend-node/src/routes/site-visits-workflow.ts>) | 64–73 |
| `registerSiteVisitWorkflowRoutes` | [backend-node/src/routes/site-visits-workflow.ts](<../../../backend-node/src/routes/site-visits-workflow.ts>) | 75–1486 |

## Direct local dependencies

- [backend-node/src/config.ts](<../../../backend-node/src/config.ts>)
- [backend-node/src/db.ts](<../../../backend-node/src/db.ts>)
- [backend-node/src/document-storage.ts](<../../../backend-node/src/document-storage.ts>)
- [backend-node/src/errors.ts](<../../../backend-node/src/errors.ts>)
- [backend-node/src/http.ts](<../../../backend-node/src/http.ts>)
- [backend-node/src/document-number.ts](<../../../backend-node/src/document-number.ts>)
- [backend-node/src/site-visit-operations.ts](<../../../backend-node/src/site-visit-operations.ts>)
- [backend-node/src/site-visit-common.ts](<../../../backend-node/src/site-visit-common.ts>)
- [backend-node/src/site-visit-data.ts](<../../../backend-node/src/site-visit-data.ts>)
- [backend-node/src/users.ts](<../../../backend-node/src/users.ts>)

## SQL references (literal scan, not a complete schema or write-set)

`dbo.engineer_skills`, `dbo.roles`, `dbo.sales_intake_skills`, `dbo.sales_intakes`, `dbo.site_visit_action_items`, `dbo.site_visit_assignments`, `dbo.site_visit_attachments`, `dbo.site_visit_checklist_responses`, `dbo.site_visit_confirmations`, `dbo.site_visit_findings`, `dbo.site_visit_reports`, `dbo.site_visit_schedule_history`, `dbo.site_visits`, `dbo.users`, `dbo.visit_checklist_items`, `dbo.visit_checklist_templates`, `dbo.visit_skills`, `dbo.visit_sla_policies`, `dbo.visit_types`

## Change boundary

Read the selected handler and helpers it calls, then its caller in api-client.ts. Verify permission checks, record scope, transaction, rowVersion and audit on that path; a route name alone does not prove authorization. Dynamic routes/SQL, helper side effects and runtime config require source inspection.
