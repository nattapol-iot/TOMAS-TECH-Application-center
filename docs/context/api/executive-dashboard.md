# executive-dashboard

[Module](../modules/dashboard.md) · [Index](../../../AGENTS.md)

Evidence: source snapshot `e867e48e`; generated, do not edit. [backend-node/src/routes/executive-dashboard.ts](<../../../backend-node/src/routes/executive-dashboard.ts>). Ranges are hints: search symbol after edits.

## API operations

| Method | Path | Source lines |
|---|---|---|
| GET | `/api/v1/dashboard/management` | 16–151 |

## Named functions

| Symbol | Source | Lines |
|---|---|---|
| `n` | [backend-node/src/routes/executive-dashboard.ts](<../../../backend-node/src/routes/executive-dashboard.ts>) | 11–11 |
| `s` | [backend-node/src/routes/executive-dashboard.ts](<../../../backend-node/src/routes/executive-dashboard.ts>) | 12–12 |
| `d` | [backend-node/src/routes/executive-dashboard.ts](<../../../backend-node/src/routes/executive-dashboard.ts>) | 13–13 |
| `registerExecutiveDashboardRoutes` | [backend-node/src/routes/executive-dashboard.ts](<../../../backend-node/src/routes/executive-dashboard.ts>) | 15–152 |

## Direct local dependencies

- [backend-node/src/db.ts](<../../../backend-node/src/db.ts>)
- [backend-node/src/users.ts](<../../../backend-node/src/users.ts>)
- [backend-node/src/errors.ts](<../../../backend-node/src/errors.ts>)
- [backend-node/src/http.ts](<../../../backend-node/src/http.ts>)
- [backend-node/src/schedule-service.ts](<../../../backend-node/src/schedule-service.ts>)
- [backend-node/src/executive-dashboard-model.ts](<../../../backend-node/src/executive-dashboard-model.ts>)

## SQL references (literal scan, not a complete schema or write-set)

`dbo.customers`, `dbo.estimate_assignments`, `dbo.estimates`, `dbo.grn_lines`, `dbo.grns`, `dbo.holidays`, `dbo.inquiries`, `dbo.mat_po_lines`, `dbo.mat_pos`, `dbo.mat_pr_approval_steps`, `dbo.mat_pr_lines`, `dbo.mat_prs`, `dbo.permissions`, `dbo.project_members`, `dbo.projects`, `dbo.resource_capacity`, `dbo.resource_effort`, `dbo.resource_task_sources`, `dbo.resource_tasks`, `dbo.role_permissions`, `dbo.roles`, `dbo.schedule_task_pics`, `dbo.schedule_tasks`, `dbo.sign_requests`, `dbo.sign_steps`, `dbo.signable_documents`, `dbo.suppliers`, `dbo.user_signing_permissions`, `dbo.users`, `dbo.v_estimate_totals`

## Change boundary

Read the selected handler and helpers it calls, then its caller in api-client.ts. Verify permission checks, record scope, transaction, rowVersion and audit on that path; a route name alone does not prove authorization. Dynamic routes/SQL, helper side effects and runtime config require source inspection.
