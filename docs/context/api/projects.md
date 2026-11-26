# projects

[Module](../modules/projects.md) · [Index](../../../AGENTS.md)

Evidence: source snapshot `9c192c2a`; generated, do not edit. [backend-node/src/routes/projects.ts](<../../../backend-node/src/routes/projects.ts>). Ranges are hints: search symbol after edits.

## API operations

| Method | Path | Source lines |
|---|---|---|
| GET | `/api/v1/projects/creation-options` | 158–212 |
| GET | `/api/v1/projects/handover/:inquiryId` | 214–248 |
| GET | `/api/v1/projects/contact-options` | 250–270 |
| GET | `/api/v1/projects` | 272–308 |
| GET | `/api/v1/projects/attention` | 365–392 |
| GET | `/api/v1/projects/overview` | 396–480 |
| GET | `/api/v1/projects/cost-overview` | 509–552 |
| PUT | `/api/v1/projects/:id/ceo-note` | 556–586 |
| GET | `/api/v1/projects/:id/page-overview` | 599–652 |
| GET | `/api/v1/projects/:id/cost` | 654–799 |
| POST | `/api/v1/projects` | 801–1045 |
| GET | `/api/v1/projects/:id/members` | 1047–1087 |
| POST | `/api/v1/projects/:id/members` | 1089–1114 |
| DELETE | `/api/v1/projects/:id/members/:userId` | 1116–1139 |
| GET | `/api/v1/projects/:id/deletion` | 1161–1169 |
| DELETE | `/api/v1/projects/:id` | 1171–1208 |
| PUT | `/api/v1/projects/:id` | 1210–1384 |

## Named functions

| Symbol | Source | Lines |
|---|---|---|
| `shiftDate` | [backend-node/src/routes/projects.ts](<../../../backend-node/src/routes/projects.ts>) | 91–96 |
| `registerProjectRoutes` | [backend-node/src/routes/projects.ts](<../../../backend-node/src/routes/projects.ts>) | 156–1385 |

## Direct local dependencies

- [backend-node/src/config.ts](<../../../backend-node/src/config.ts>)
- [backend-node/src/audit.ts](<../../../backend-node/src/audit.ts>)
- [backend-node/src/business-date.ts](<../../../backend-node/src/business-date.ts>)
- [backend-node/src/db.ts](<../../../backend-node/src/db.ts>)
- [backend-node/src/document-storage.ts](<../../../backend-node/src/document-storage.ts>)
- [backend-node/src/project-handover.ts](<../../../backend-node/src/project-handover.ts>)
- [backend-node/src/errors.ts](<../../../backend-node/src/errors.ts>)
- [backend-node/src/estimate-total-guard.ts](<../../../backend-node/src/estimate-total-guard.ts>)
- [backend-node/src/end-user.ts](<../../../backend-node/src/end-user.ts>)
- [backend-node/src/http.ts](<../../../backend-node/src/http.ts>)
- [backend-node/src/project-lifecycle.ts](<../../../backend-node/src/project-lifecycle.ts>)
- [backend-node/src/project-initial-plan.ts](<../../../backend-node/src/project-initial-plan.ts>)
- [backend-node/src/project-health.ts](<../../../backend-node/src/project-health.ts>)
- [backend-node/src/project-overview.ts](<../../../backend-node/src/project-overview.ts>)
- [backend-node/src/manhour-budget.ts](<../../../backend-node/src/manhour-budget.ts>)
- [backend-node/src/project-cost.ts](<../../../backend-node/src/project-cost.ts>)
- [backend-node/src/project-cost-model.ts](<../../../backend-node/src/project-cost-model.ts>)
- [backend-node/src/procurement-rules.ts](<../../../backend-node/src/procurement-rules.ts>)
- [backend-node/src/project-notices.ts](<../../../backend-node/src/project-notices.ts>)
- [backend-node/src/project-scope.ts](<../../../backend-node/src/project-scope.ts>)
- [backend-node/src/schedule-service.ts](<../../../backend-node/src/schedule-service.ts>)
- [backend-node/src/project-health.ts](<../../../backend-node/src/project-health.ts>)
- [backend-node/src/project-page-overview.ts](<../../../backend-node/src/project-page-overview.ts>)
- [backend-node/src/project-cost-curve.ts](<../../../backend-node/src/project-cost-curve.ts>)
- [backend-node/src/user-roles.ts](<../../../backend-node/src/user-roles.ts>)
- [backend-node/src/leader-scope.ts](<../../../backend-node/src/leader-scope.ts>)
- [backend-node/src/types.ts](<../../../backend-node/src/types.ts>)
- [backend-node/src/users.ts](<../../../backend-node/src/users.ts>)
- [backend-node/src/email.ts](<../../../backend-node/src/email.ts>)
- [backend-node/src/crm.ts](<../../../backend-node/src/crm.ts>)

## SQL references (literal scan, not a complete schema or write-set)

`dbo.bom_lines`, `dbo.cost_items`, `dbo.crm_opportunities`, `dbo.customer_site_contacts`, `dbo.customer_sites`, `dbo.customers`, `dbo.delete_unstarted_project`, `dbo.estimates`, `dbo.holidays`, `dbo.inquiries`, `dbo.manhour_lines`, `dbo.mat_pr_lines`, `dbo.mat_prs`, `dbo.project_ceo_notes`, `dbo.project_contacts`, `dbo.project_docs`, `dbo.project_folders`, `dbo.project_members`, `dbo.project_payment_milestones`, `dbo.project_purchase_units`, `dbo.projects`, `dbo.roles`, `dbo.schedule_tasks`, `dbo.schedule_updates`, `dbo.soft_delete_project`, `dbo.user_effective_permissions`, `dbo.user_effective_roles`, `dbo.users`, `dbo.v_estimate_cost_amounts`, `dbo.work_hours`

## Change boundary

Read the selected handler and helpers it calls, then its caller in api-client.ts. Verify permission checks, record scope, transaction, rowVersion and audit on that path; a route name alone does not prove authorization. Dynamic routes/SQL, helper side effects and runtime config require source inspection.
