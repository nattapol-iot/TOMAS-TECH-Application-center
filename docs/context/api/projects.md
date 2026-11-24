# projects

[Module](../modules/projects.md) · [Index](../../../AGENTS.md)

Evidence: source snapshot `9e1405be`; generated, do not edit. [backend-node/src/routes/projects.ts](<../../../backend-node/src/routes/projects.ts>). Ranges are hints: search symbol after edits.

## API operations

| Method | Path | Source lines |
|---|---|---|
| GET | `/api/v1/projects/creation-options` | 104–153 |
| GET | `/api/v1/projects/handover/:inquiryId` | 155–186 |
| GET | `/api/v1/projects/contact-options` | 188–208 |
| GET | `/api/v1/projects` | 210–245 |
| GET | `/api/v1/projects/attention` | 301–327 |
| GET | `/api/v1/projects/overview` | 331–414 |
| GET | `/api/v1/projects/cost-overview` | 443–470 |
| GET | `/api/v1/projects/:id/cost` | 475–563 |
| POST | `/api/v1/projects` | 565–800 |
| GET | `/api/v1/projects/:id/members` | 802–842 |
| POST | `/api/v1/projects/:id/members` | 844–869 |
| DELETE | `/api/v1/projects/:id/members/:userId` | 871–894 |
| GET | `/api/v1/projects/:id/deletion` | 916–924 |
| DELETE | `/api/v1/projects/:id` | 926–963 |
| PUT | `/api/v1/projects/:id` | 965–1139 |

## Named functions

| Symbol | Source | Lines |
|---|---|---|
| `shiftDate` | [backend-node/src/routes/projects.ts](<../../../backend-node/src/routes/projects.ts>) | 87–92 |
| `registerProjectRoutes` | [backend-node/src/routes/projects.ts](<../../../backend-node/src/routes/projects.ts>) | 102–1140 |

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
- [backend-node/src/user-roles.ts](<../../../backend-node/src/user-roles.ts>)
- [backend-node/src/types.ts](<../../../backend-node/src/types.ts>)
- [backend-node/src/users.ts](<../../../backend-node/src/users.ts>)
- [backend-node/src/email.ts](<../../../backend-node/src/email.ts>)
- [backend-node/src/crm.ts](<../../../backend-node/src/crm.ts>)

## SQL references (literal scan, not a complete schema or write-set)

`dbo.cost_items`, `dbo.crm_opportunities`, `dbo.customer_site_contacts`, `dbo.customer_sites`, `dbo.customers`, `dbo.delete_unstarted_project`, `dbo.estimates`, `dbo.inquiries`, `dbo.manhour_lines`, `dbo.mat_pr_lines`, `dbo.mat_prs`, `dbo.project_contacts`, `dbo.project_folders`, `dbo.project_members`, `dbo.project_payment_milestones`, `dbo.project_purchase_units`, `dbo.projects`, `dbo.roles`, `dbo.schedule_updates`, `dbo.soft_delete_project`, `dbo.user_effective_permissions`, `dbo.user_effective_roles`, `dbo.users`, `dbo.v_estimate_cost_amounts`, `dbo.work_hours`

## Change boundary

Read the selected handler and helpers it calls, then its caller in api-client.ts. Verify permission checks, record scope, transaction, rowVersion and audit on that path; a route name alone does not prove authorization. Dynamic routes/SQL, helper side effects and runtime config require source inspection.
