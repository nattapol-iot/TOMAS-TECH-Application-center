# schedule

[Module](../modules/planning.md) · [Index](../../../AGENTS.md)

Evidence: source snapshot `b626b0e1`; generated, do not edit. [backend-node/src/routes/schedule.ts](<../../../backend-node/src/routes/schedule.ts>). Ranges are hints: search symbol after edits.

## API operations

| Method | Path | Source lines |
|---|---|---|
| GET | `/api/v1/projects/:projectId/schedule` | 269–276 |
| POST | `/api/v1/projects/:projectId/schedule/tasks` | 278–333 |
| PUT | `/api/v1/schedule/tasks/:id` | 335–401 |
| POST | `/api/v1/schedule/tasks/:id/assign` | 406–438 |
| DELETE | `/api/v1/schedule/tasks/:id` | 440–484 |
| PUT | `/api/v1/projects/:projectId/schedule/people` | 489–562 |
| POST | `/api/v1/schedule/tasks/:id/move` | 566–639 |
| POST | `/api/v1/schedule/tasks/:id/updates` | 641–703 |
| POST | `/api/v1/schedule/tasks/:id/day-requests` | 705–738 |
| POST | `/api/v1/schedule/day-requests/:id/answer` | 740–814 |
| POST | `/api/v1/schedule/tasks/:id/details` | 816–893 |
| DELETE | `/api/v1/schedule/tasks/:id/details` | 895–945 |
| POST | `/api/v1/projects/:projectId/schedule/baseline` | 947–1028 |
| PUT | `/api/v1/projects/:projectId/manhour-budget` | 1033–1052 |
| GET | `/api/v1/schedule/day-requests/pending` | 1054–1096 |
| GET | `/api/v1/schedule/search` | 1101–1127 |
| GET | `/api/v1/me/work` | 1129–1256 |
| GET | `/api/v1/me/work/updates` | 1258–1294 |

## Named functions

| Symbol | Source | Lines |
|---|---|---|
| `membersFor` | [backend-node/src/routes/schedule.ts](<../../../backend-node/src/routes/schedule.ts>) | 63–68 |
| `bindPlan` | [backend-node/src/routes/schedule.ts](<../../../backend-node/src/routes/schedule.ts>) | 70–90 |
| `planAudit` | [backend-node/src/routes/schedule.ts](<../../../backend-node/src/routes/schedule.ts>) | 92–110 |
| `existingPlan` | [backend-node/src/routes/schedule.ts](<../../../backend-node/src/routes/schedule.ts>) | 112–130 |
| `readBaselines` | [backend-node/src/routes/schedule.ts](<../../../backend-node/src/routes/schedule.ts>) | 134–151 |
| `readUpdates` | [backend-node/src/routes/schedule.ts](<../../../backend-node/src/routes/schedule.ts>) | 153–178 |
| `projectSchedule` | [backend-node/src/routes/schedule.ts](<../../../backend-node/src/routes/schedule.ts>) | 180–252 |
| `readRowHours` | [backend-node/src/routes/schedule.ts](<../../../backend-node/src/routes/schedule.ts>) | 259–264 |
| `registerScheduleRoutes` | [backend-node/src/routes/schedule.ts](<../../../backend-node/src/routes/schedule.ts>) | 267–1295 |

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

`dbo.answer_schedule_day_request`, `dbo.project_members`, `dbo.projects`, `dbo.schedule_baselines`, `dbo.schedule_task_pics`, `dbo.schedule_tasks`, `dbo.schedule_updates`, `dbo.schedule_vendor_hours`, `dbo.users`, `dbo.work_hours`

## Change boundary

Read the selected handler and helpers it calls, then its caller in api-client.ts. Verify permission checks, record scope, transaction, rowVersion and audit on that path; a route name alone does not prove authorization. Dynamic routes/SQL, helper side effects and runtime config require source inspection.
