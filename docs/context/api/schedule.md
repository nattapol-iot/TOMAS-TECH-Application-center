# schedule

[Module](../modules/planning.md) · [Index](../../../AGENTS.md)

Evidence: source snapshot `e7d7f326`; generated, do not edit. [backend-node/src/routes/schedule.ts](<../../../backend-node/src/routes/schedule.ts>). Ranges are hints: search symbol after edits.

## API operations

| Method | Path | Source lines |
|---|---|---|
| GET | `/api/v1/projects/:projectId/schedule` | 255–262 |
| POST | `/api/v1/projects/:projectId/schedule/tasks` | 264–319 |
| PUT | `/api/v1/schedule/tasks/:id` | 321–383 |
| POST | `/api/v1/schedule/tasks/:id/assign` | 388–420 |
| DELETE | `/api/v1/schedule/tasks/:id` | 422–466 |
| PUT | `/api/v1/projects/:projectId/schedule/people` | 471–544 |
| POST | `/api/v1/schedule/tasks/:id/move` | 548–621 |
| POST | `/api/v1/schedule/tasks/:id/updates` | 623–685 |
| POST | `/api/v1/schedule/tasks/:id/day-requests` | 687–720 |
| POST | `/api/v1/schedule/day-requests/:id/answer` | 722–796 |
| POST | `/api/v1/schedule/tasks/:id/details` | 798–875 |
| DELETE | `/api/v1/schedule/tasks/:id/details` | 877–927 |
| POST | `/api/v1/projects/:projectId/schedule/baseline` | 929–1010 |
| PUT | `/api/v1/projects/:projectId/manhour-budget` | 1015–1034 |
| GET | `/api/v1/schedule/day-requests/pending` | 1036–1078 |
| GET | `/api/v1/schedule/search` | 1083–1109 |
| GET | `/api/v1/me/work` | 1111–1238 |
| GET | `/api/v1/me/work/updates` | 1240–1276 |

## Named functions

| Symbol | Source | Lines |
|---|---|---|
| `membersFor` | [backend-node/src/routes/schedule.ts](<../../../backend-node/src/routes/schedule.ts>) | 63–68 |
| `bindPlan` | [backend-node/src/routes/schedule.ts](<../../../backend-node/src/routes/schedule.ts>) | 70–90 |
| `planAudit` | [backend-node/src/routes/schedule.ts](<../../../backend-node/src/routes/schedule.ts>) | 92–110 |
| `existingPlan` | [backend-node/src/routes/schedule.ts](<../../../backend-node/src/routes/schedule.ts>) | 112–130 |
| `readBaselines` | [backend-node/src/routes/schedule.ts](<../../../backend-node/src/routes/schedule.ts>) | 134–151 |
| `readUpdates` | [backend-node/src/routes/schedule.ts](<../../../backend-node/src/routes/schedule.ts>) | 153–178 |
| `projectSchedule` | [backend-node/src/routes/schedule.ts](<../../../backend-node/src/routes/schedule.ts>) | 180–250 |
| `registerScheduleRoutes` | [backend-node/src/routes/schedule.ts](<../../../backend-node/src/routes/schedule.ts>) | 253–1277 |

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

`dbo.answer_schedule_day_request`, `dbo.project_members`, `dbo.projects`, `dbo.schedule_baselines`, `dbo.schedule_task_pics`, `dbo.schedule_tasks`, `dbo.schedule_updates`, `dbo.users`

## Change boundary

Read the selected handler and helpers it calls, then its caller in api-client.ts. Verify permission checks, record scope, transaction, rowVersion and audit on that path; a route name alone does not prove authorization. Dynamic routes/SQL, helper side effects and runtime config require source inspection.
