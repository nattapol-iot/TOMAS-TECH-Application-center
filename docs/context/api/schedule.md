# schedule

[Module](../modules/planning.md) · [Index](../../../AGENTS.md)

Evidence: source snapshot `aeeccd77`; generated, do not edit. [backend-node/src/routes/schedule.ts](<../../../backend-node/src/routes/schedule.ts>). Ranges are hints: search symbol after edits.

## API operations

| Method | Path | Source lines |
|---|---|---|
| GET | `/api/v1/projects/:projectId/schedule` | 301–308 |
| POST | `/api/v1/projects/:projectId/schedule/tasks` | 310–365 |
| PUT | `/api/v1/schedule/tasks/:id` | 367–433 |
| POST | `/api/v1/schedule/tasks/:id/assign` | 438–470 |
| PUT | `/api/v1/schedule/tasks/:id/purchase-request` | 473–506 |
| PUT | `/api/v1/schedule/tasks/:id/holiday-decision` | 510–535 |
| DELETE | `/api/v1/schedule/tasks/:id` | 537–581 |
| PUT | `/api/v1/projects/:projectId/schedule/people` | 586–659 |
| POST | `/api/v1/schedule/tasks/:id/move` | 663–736 |
| POST | `/api/v1/schedule/tasks/:id/updates` | 738–800 |
| POST | `/api/v1/schedule/tasks/:id/day-requests` | 802–835 |
| POST | `/api/v1/schedule/day-requests/:id/answer` | 837–911 |
| POST | `/api/v1/schedule/tasks/:id/details` | 913–990 |
| DELETE | `/api/v1/schedule/tasks/:id/details` | 992–1042 |
| POST | `/api/v1/projects/:projectId/schedule/baseline` | 1044–1125 |
| PUT | `/api/v1/projects/:projectId/manhour-budget` | 1130–1149 |
| GET | `/api/v1/schedule/day-requests/pending` | 1151–1193 |
| GET | `/api/v1/schedule/search` | 1198–1224 |
| GET | `/api/v1/me/work` | 1226–1353 |
| GET | `/api/v1/me/work/updates` | 1355–1391 |

## Named functions

| Symbol | Source | Lines |
|---|---|---|
| `membersFor` | [backend-node/src/routes/schedule.ts](<../../../backend-node/src/routes/schedule.ts>) | 63–68 |
| `bindPlan` | [backend-node/src/routes/schedule.ts](<../../../backend-node/src/routes/schedule.ts>) | 70–90 |
| `planAudit` | [backend-node/src/routes/schedule.ts](<../../../backend-node/src/routes/schedule.ts>) | 92–110 |
| `existingPlan` | [backend-node/src/routes/schedule.ts](<../../../backend-node/src/routes/schedule.ts>) | 112–130 |
| `readBaselines` | [backend-node/src/routes/schedule.ts](<../../../backend-node/src/routes/schedule.ts>) | 134–151 |
| `readUpdates` | [backend-node/src/routes/schedule.ts](<../../../backend-node/src/routes/schedule.ts>) | 153–178 |
| `projectSchedule` | [backend-node/src/routes/schedule.ts](<../../../backend-node/src/routes/schedule.ts>) | 180–255 |
| `readProjectRequests` | [backend-node/src/routes/schedule.ts](<../../../backend-node/src/routes/schedule.ts>) | 263–268 |
| `readHolidayList` | [backend-node/src/routes/schedule.ts](<../../../backend-node/src/routes/schedule.ts>) | 277–289 |
| `readRowHours` | [backend-node/src/routes/schedule.ts](<../../../backend-node/src/routes/schedule.ts>) | 291–296 |
| `registerScheduleRoutes` | [backend-node/src/routes/schedule.ts](<../../../backend-node/src/routes/schedule.ts>) | 299–1392 |

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

`dbo.answer_schedule_day_request`, `dbo.holidays`, `dbo.mat_prs`, `dbo.project_members`, `dbo.projects`, `dbo.schedule_baselines`, `dbo.schedule_holiday_decisions`, `dbo.schedule_task_pics`, `dbo.schedule_tasks`, `dbo.schedule_updates`, `dbo.schedule_vendor_hours`, `dbo.users`, `dbo.work_hours`

## Change boundary

Read the selected handler and helpers it calls, then its caller in api-client.ts. Verify permission checks, record scope, transaction, rowVersion and audit on that path; a route name alone does not prove authorization. Dynamic routes/SQL, helper side effects and runtime config require source inspection.
