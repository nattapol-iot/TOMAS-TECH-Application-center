# site-visits-workflow

[Module](../modules/site-visit.md) · [Index](../../../AGENTS.md)

Evidence: source snapshot `94985f6d`; generated, do not edit. [backend-node/src/routes/site-visits-workflow.ts](<../../../backend-node/src/routes/site-visits-workflow.ts>). Ranges are hints: search symbol after edits.

## API operations

| Method | Path | Source lines |
|---|---|---|
| POST | `/api/v1/site-visits/` | 50–138 |
| POST | `/api/v1/site-visits/:id/status` | 140–198 |
| PUT | `/api/v1/site-visits/:id/schedule` | 200–259 |
| POST | `/api/v1/site-visits/:id/assignments` | 261–363 |
| POST | `/api/v1/site-visits/:id/assignments/:assignmentId/response` | 365–420 |
| DELETE | `/api/v1/site-visits/:id/assignments/:assignmentId` | 422–455 |
| POST | `/api/v1/site-visits/:id/confirmations` | 457–511 |
| POST | `/api/v1/site-visits/:id/check-in` | 513–548 |
| POST | `/api/v1/site-visits/:id/check-out` | 550–608 |
| PUT | `/api/v1/site-visits/:id/checklist` | 610–643 |
| POST | `/api/v1/site-visits/:id/findings` | 645–677 |
| DELETE | `/api/v1/site-visits/:id/findings/:findingId` | 678–698 |
| POST | `/api/v1/site-visits/:id/action-items` | 700–733 |
| POST | `/api/v1/site-visits/:id/attachments` | 735–801 |
| GET | `/api/v1/site-visits/:id/attachments/:attachmentId/content` | 802–821 |

## Named functions

| Symbol | Source | Lines |
|---|---|---|
| `clean` | [backend-node/src/routes/site-visits-workflow.ts](<../../../backend-node/src/routes/site-visits-workflow.ts>) | 27–29 |
| `optionalId` | [backend-node/src/routes/site-visits-workflow.ts](<../../../backend-node/src/routes/site-visits-workflow.ts>) | 30–32 |
| `stamp` | [backend-node/src/routes/site-visits-workflow.ts](<../../../backend-node/src/routes/site-visits-workflow.ts>) | 33–37 |
| `today` | [backend-node/src/routes/site-visits-workflow.ts](<../../../backend-node/src/routes/site-visits-workflow.ts>) | 38–47 |
| `registerSiteVisitWorkflowRoutes` | [backend-node/src/routes/site-visits-workflow.ts](<../../../backend-node/src/routes/site-visits-workflow.ts>) | 49–822 |

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

`dbo.engineer_skills`, `dbo.sales_intake_skills`, `dbo.sales_intakes`, `dbo.site_visit_action_items`, `dbo.site_visit_assignments`, `dbo.site_visit_attachments`, `dbo.site_visit_checklist_responses`, `dbo.site_visit_confirmations`, `dbo.site_visit_findings`, `dbo.site_visit_reports`, `dbo.site_visit_schedule_history`, `dbo.site_visits`, `dbo.user_effective_roles`, `dbo.users`, `dbo.visit_checklist_items`, `dbo.visit_checklist_templates`, `dbo.visit_skills`, `dbo.visit_sla_policies`, `dbo.visit_types`

## Change boundary

Read the selected handler and helpers it calls, then its caller in api-client.ts. Verify permission checks, record scope, transaction, rowVersion and audit on that path; a route name alone does not prove authorization. Dynamic routes/SQL, helper side effects and runtime config require source inspection.
