# schedule

[Module](../modules/planning.md) · [Index](../../../AGENTS.md)

Evidence: source snapshot `64bf1ed9`; generated, do not edit. [backend-node/src/routes/schedule.ts](<../../../backend-node/src/routes/schedule.ts>). Ranges are hints: search symbol after edits.

## API operations

| Method | Path | Source lines |
|---|---|---|
| GET | `/api/v1/projects/:projectId/schedule` | 403–410 |
| POST | `/api/v1/projects/:projectId/schedule/tasks` | 412–467 |
| PUT | `/api/v1/schedule/tasks/:id` | 469–535 |
| POST | `/api/v1/schedule/tasks/:id/assign` | 540–572 |
| PUT | `/api/v1/schedule/tasks/:id/purchase-request` | 575–608 |
| PUT | `/api/v1/schedule/tasks/:id/holiday-decision` | 612–637 |
| DELETE | `/api/v1/schedule/tasks/:id` | 639–683 |
| PUT | `/api/v1/projects/:projectId/schedule/people` | 688–761 |
| POST | `/api/v1/schedule/tasks/:id/move` | 765–838 |
| POST | `/api/v1/schedule/tasks/:id/updates` | 840–902 |
| POST | `/api/v1/schedule/tasks/:id/day-requests` | 904–937 |
| POST | `/api/v1/schedule/day-requests/:id/answer` | 939–1013 |
| POST | `/api/v1/schedule/tasks/:id/details` | 1015–1092 |
| DELETE | `/api/v1/schedule/tasks/:id/details` | 1094–1144 |
| POST | `/api/v1/projects/:projectId/schedule/baseline` | 1146–1227 |
| PUT | `/api/v1/projects/:projectId/manhour-budget` | 1232–1251 |
| GET | `/api/v1/schedule/day-requests/pending` | 1253–1296 |
| GET | `/api/v1/schedule/search` | 1301–1327 |
| GET | `/api/v1/me/work` | 1329–1456 |
| GET | `/api/v1/me/work/updates` | 1458–1494 |

## Named functions

| Symbol | Source | Lines |
|---|---|---|
| `membersFor` | [backend-node/src/routes/schedule.ts](<../../../backend-node/src/routes/schedule.ts>) | 67–72 |
| `bindPlan` | [backend-node/src/routes/schedule.ts](<../../../backend-node/src/routes/schedule.ts>) | 74–94 |
| `planAudit` | [backend-node/src/routes/schedule.ts](<../../../backend-node/src/routes/schedule.ts>) | 96–114 |
| `existingPlan` | [backend-node/src/routes/schedule.ts](<../../../backend-node/src/routes/schedule.ts>) | 116–134 |
| `readBaselines` | [backend-node/src/routes/schedule.ts](<../../../backend-node/src/routes/schedule.ts>) | 138–155 |
| `readUpdates` | [backend-node/src/routes/schedule.ts](<../../../backend-node/src/routes/schedule.ts>) | 157–182 |
| `projectSchedule` | [backend-node/src/routes/schedule.ts](<../../../backend-node/src/routes/schedule.ts>) | 184–260 |
| `readProjectRequests` | [backend-node/src/routes/schedule.ts](<../../../backend-node/src/routes/schedule.ts>) | 268–273 |
| `readHolidayList` | [backend-node/src/routes/schedule.ts](<../../../backend-node/src/routes/schedule.ts>) | 282–294 |
| `readFollowUpFacts` | [backend-node/src/routes/schedule.ts](<../../../backend-node/src/routes/schedule.ts>) | 336–391 |
| `readRowHours` | [backend-node/src/routes/schedule.ts](<../../../backend-node/src/routes/schedule.ts>) | 393–398 |
| `registerScheduleRoutes` | [backend-node/src/routes/schedule.ts](<../../../backend-node/src/routes/schedule.ts>) | 401–1495 |

## Direct local dependencies

- [backend-node/src/audit.ts](<../../../backend-node/src/audit.ts>)
- [backend-node/src/db.ts](<../../../backend-node/src/db.ts>)
- [backend-node/src/errors.ts](<../../../backend-node/src/errors.ts>)
- [backend-node/src/user-roles.ts](<../../../backend-node/src/user-roles.ts>)
- [backend-node/src/http.ts](<../../../backend-node/src/http.ts>)
- [backend-node/src/project-scope.ts](<../../../backend-node/src/project-scope.ts>)
- [backend-node/src/leader-scope.ts](<../../../backend-node/src/leader-scope.ts>)
- [backend-node/src/manhour-budget.ts](<../../../backend-node/src/manhour-budget.ts>)
- [backend-node/src/schedule-calculator.ts](<../../../backend-node/src/schedule-calculator.ts>)
- [backend-node/src/plan-people.ts](<../../../backend-node/src/plan-people.ts>)
- [backend-node/src/business-date.ts](<../../../backend-node/src/business-date.ts>)
- [backend-node/src/config.ts](<../../../backend-node/src/config.ts>)
- [backend-node/src/project-health.ts](<../../../backend-node/src/project-health.ts>)
- [backend-node/src/team-week.ts](<../../../backend-node/src/team-week.ts>)
- [backend-node/src/work-days.ts](<../../../backend-node/src/work-days.ts>)
- [backend-node/src/schedule-service.ts](<../../../backend-node/src/schedule-service.ts>)
- [backend-node/src/types.ts](<../../../backend-node/src/types.ts>)
- [backend-node/src/users.ts](<../../../backend-node/src/users.ts>)
- [backend-node/src/email.ts](<../../../backend-node/src/email.ts>)
- [backend-node/src/project-notices.ts](<../../../backend-node/src/project-notices.ts>)
- [backend-node/src/project-initial-plan.ts](<../../../backend-node/src/project-initial-plan.ts>)

## SQL references (literal scan, not a complete schema or write-set)

`dbo.answer_schedule_day_request`, `dbo.engineer_availability`, `dbo.holidays`, `dbo.mat_prs`, `dbo.project_docs`, `dbo.project_members`, `dbo.projects`, `dbo.schedule_baselines`, `dbo.schedule_holiday_decisions`, `dbo.schedule_task_pics`, `dbo.schedule_tasks`, `dbo.schedule_updates`, `dbo.schedule_vendor_hours`, `dbo.team_task_assignees`, `dbo.team_tasks`, `dbo.users`, `dbo.work_days`, `dbo.work_hours`

## Change boundary

Read the selected handler and helpers it calls, then its caller in api-client.ts. Verify permission checks, record scope, transaction, rowVersion and audit on that path; a route name alone does not prove authorization. Dynamic routes/SQL, helper side effects and runtime config require source inspection.
