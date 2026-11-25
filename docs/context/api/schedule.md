# schedule

[Module](../modules/planning.md) · [Index](../../../AGENTS.md)

Evidence: source snapshot `9587bdae`; generated, do not edit. [backend-node/src/routes/schedule.ts](<../../../backend-node/src/routes/schedule.ts>). Ranges are hints: search symbol after edits.

## API operations

| Method | Path | Source lines |
|---|---|---|
| GET | `/api/v1/projects/:projectId/schedule` | 402–409 |
| POST | `/api/v1/projects/:projectId/schedule/tasks` | 411–466 |
| PUT | `/api/v1/schedule/tasks/:id` | 468–534 |
| POST | `/api/v1/schedule/tasks/:id/assign` | 539–571 |
| PUT | `/api/v1/schedule/tasks/:id/purchase-request` | 574–607 |
| PUT | `/api/v1/schedule/tasks/:id/holiday-decision` | 611–636 |
| DELETE | `/api/v1/schedule/tasks/:id` | 638–682 |
| PUT | `/api/v1/projects/:projectId/schedule/people` | 687–760 |
| POST | `/api/v1/schedule/tasks/:id/move` | 764–837 |
| POST | `/api/v1/schedule/tasks/:id/updates` | 839–901 |
| POST | `/api/v1/schedule/tasks/:id/day-requests` | 903–936 |
| POST | `/api/v1/schedule/day-requests/:id/answer` | 938–1012 |
| POST | `/api/v1/schedule/tasks/:id/details` | 1014–1091 |
| DELETE | `/api/v1/schedule/tasks/:id/details` | 1093–1143 |
| POST | `/api/v1/projects/:projectId/schedule/baseline` | 1145–1226 |
| PUT | `/api/v1/projects/:projectId/manhour-budget` | 1231–1250 |
| GET | `/api/v1/schedule/day-requests/pending` | 1252–1294 |
| GET | `/api/v1/schedule/search` | 1299–1325 |
| GET | `/api/v1/me/work` | 1327–1454 |
| GET | `/api/v1/me/work/updates` | 1456–1492 |

## Named functions

| Symbol | Source | Lines |
|---|---|---|
| `membersFor` | [backend-node/src/routes/schedule.ts](<../../../backend-node/src/routes/schedule.ts>) | 66–71 |
| `bindPlan` | [backend-node/src/routes/schedule.ts](<../../../backend-node/src/routes/schedule.ts>) | 73–93 |
| `planAudit` | [backend-node/src/routes/schedule.ts](<../../../backend-node/src/routes/schedule.ts>) | 95–113 |
| `existingPlan` | [backend-node/src/routes/schedule.ts](<../../../backend-node/src/routes/schedule.ts>) | 115–133 |
| `readBaselines` | [backend-node/src/routes/schedule.ts](<../../../backend-node/src/routes/schedule.ts>) | 137–154 |
| `readUpdates` | [backend-node/src/routes/schedule.ts](<../../../backend-node/src/routes/schedule.ts>) | 156–181 |
| `projectSchedule` | [backend-node/src/routes/schedule.ts](<../../../backend-node/src/routes/schedule.ts>) | 183–259 |
| `readProjectRequests` | [backend-node/src/routes/schedule.ts](<../../../backend-node/src/routes/schedule.ts>) | 267–272 |
| `readHolidayList` | [backend-node/src/routes/schedule.ts](<../../../backend-node/src/routes/schedule.ts>) | 281–293 |
| `readFollowUpFacts` | [backend-node/src/routes/schedule.ts](<../../../backend-node/src/routes/schedule.ts>) | 335–390 |
| `readRowHours` | [backend-node/src/routes/schedule.ts](<../../../backend-node/src/routes/schedule.ts>) | 392–397 |
| `registerScheduleRoutes` | [backend-node/src/routes/schedule.ts](<../../../backend-node/src/routes/schedule.ts>) | 400–1493 |

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
