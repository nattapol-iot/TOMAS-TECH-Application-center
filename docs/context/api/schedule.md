# schedule

[Module](../modules/planning.md) · [Index](../../../AGENTS.md)

Evidence: source snapshot `978b0311`; generated, do not edit. [backend-node/src/routes/schedule.ts](<../../../backend-node/src/routes/schedule.ts>). Ranges are hints: search symbol after edits.

## API operations

| Method | Path | Source lines |
|---|---|---|
| GET | `/api/v1/projects/:projectId/schedule` | 279–286 |
| POST | `/api/v1/projects/:projectId/schedule/tasks` | 288–343 |
| PUT | `/api/v1/schedule/tasks/:id` | 345–411 |
| POST | `/api/v1/schedule/tasks/:id/assign` | 416–448 |
| PUT | `/api/v1/schedule/tasks/:id/purchase-request` | 451–483 |
| DELETE | `/api/v1/schedule/tasks/:id` | 485–529 |
| PUT | `/api/v1/projects/:projectId/schedule/people` | 534–607 |
| POST | `/api/v1/schedule/tasks/:id/move` | 611–684 |
| POST | `/api/v1/schedule/tasks/:id/updates` | 686–748 |
| POST | `/api/v1/schedule/tasks/:id/day-requests` | 750–783 |
| POST | `/api/v1/schedule/day-requests/:id/answer` | 785–859 |
| POST | `/api/v1/schedule/tasks/:id/details` | 861–938 |
| DELETE | `/api/v1/schedule/tasks/:id/details` | 940–990 |
| POST | `/api/v1/projects/:projectId/schedule/baseline` | 992–1073 |
| PUT | `/api/v1/projects/:projectId/manhour-budget` | 1078–1097 |
| GET | `/api/v1/schedule/day-requests/pending` | 1099–1141 |
| GET | `/api/v1/schedule/search` | 1146–1172 |
| GET | `/api/v1/me/work` | 1174–1301 |
| GET | `/api/v1/me/work/updates` | 1303–1339 |

## Named functions

| Symbol | Source | Lines |
|---|---|---|
| `membersFor` | [backend-node/src/routes/schedule.ts](<../../../backend-node/src/routes/schedule.ts>) | 63–68 |
| `bindPlan` | [backend-node/src/routes/schedule.ts](<../../../backend-node/src/routes/schedule.ts>) | 70–90 |
| `planAudit` | [backend-node/src/routes/schedule.ts](<../../../backend-node/src/routes/schedule.ts>) | 92–110 |
| `existingPlan` | [backend-node/src/routes/schedule.ts](<../../../backend-node/src/routes/schedule.ts>) | 112–130 |
| `readBaselines` | [backend-node/src/routes/schedule.ts](<../../../backend-node/src/routes/schedule.ts>) | 134–151 |
| `readUpdates` | [backend-node/src/routes/schedule.ts](<../../../backend-node/src/routes/schedule.ts>) | 153–178 |
| `projectSchedule` | [backend-node/src/routes/schedule.ts](<../../../backend-node/src/routes/schedule.ts>) | 180–254 |
| `readProjectRequests` | [backend-node/src/routes/schedule.ts](<../../../backend-node/src/routes/schedule.ts>) | 262–267 |
| `readRowHours` | [backend-node/src/routes/schedule.ts](<../../../backend-node/src/routes/schedule.ts>) | 269–274 |
| `registerScheduleRoutes` | [backend-node/src/routes/schedule.ts](<../../../backend-node/src/routes/schedule.ts>) | 277–1340 |

## Direct local dependencies

- [backend-node/src/audit.ts](<../../../backend-node/src/audit.ts>)
- [backend-node/src/db.ts](<../../../backend-node/src/db.ts>)
- [backend-node/src/errors.ts](<../../../backend-node/src/errors.ts>)
- [backend-node/src/user-roles.ts](<../../../backend-node/src/user-roles.ts>)
- [backend-node/src/http.ts](<../../../backend-node/src/http.ts>)
- [backend-node/src/project-scope.ts](<../../../backend-node/src/project-scope.ts>)
- [backend-node/src/manhour-budget.ts](<../../../backend-node/src/manhour-budget.ts>)
- [backend-node/src/schedule-calculator.ts](<../../../backend-node/src/schedule-calculator.ts>)
- [backend-node/src/plan-people.ts](<../../../backend-node/src/plan-people.ts>)
- [backend-node/src/business-date.ts](<../../../backend-node/src/business-date.ts>)
- [backend-node/src/config.ts](<../../../backend-node/src/config.ts>)
- [backend-node/src/project-health.ts](<../../../backend-node/src/project-health.ts>)
- [backend-node/src/schedule-service.ts](<../../../backend-node/src/schedule-service.ts>)
- [backend-node/src/types.ts](<../../../backend-node/src/types.ts>)
- [backend-node/src/users.ts](<../../../backend-node/src/users.ts>)
- [backend-node/src/email.ts](<../../../backend-node/src/email.ts>)
- [backend-node/src/project-notices.ts](<../../../backend-node/src/project-notices.ts>)
- [backend-node/src/project-initial-plan.ts](<../../../backend-node/src/project-initial-plan.ts>)

## SQL references (literal scan, not a complete schema or write-set)

`dbo.answer_schedule_day_request`, `dbo.mat_prs`, `dbo.project_members`, `dbo.projects`, `dbo.schedule_baselines`, `dbo.schedule_task_pics`, `dbo.schedule_tasks`, `dbo.schedule_updates`, `dbo.schedule_vendor_hours`, `dbo.users`, `dbo.work_hours`

## Change boundary

Read the selected handler and helpers it calls, then its caller in api-client.ts. Verify permission checks, record scope, transaction, rowVersion and audit on that path; a route name alone does not prove authorization. Dynamic routes/SQL, helper side effects and runtime config require source inspection.
