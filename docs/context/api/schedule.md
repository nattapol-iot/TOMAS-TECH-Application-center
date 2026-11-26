# schedule

[Module](../modules/planning.md) · [Index](../../../AGENTS.md)

Evidence: source snapshot `5f8bc310`; generated, do not edit. [backend-node/src/routes/schedule.ts](<../../../backend-node/src/routes/schedule.ts>). Ranges are hints: search symbol after edits.

## API operations

| Method | Path | Source lines |
|---|---|---|
| GET | `/api/v1/projects/:projectId/schedule` | 428–435 |
| POST | `/api/v1/projects/:projectId/schedule/tasks` | 437–492 |
| PUT | `/api/v1/schedule/tasks/:id` | 494–560 |
| POST | `/api/v1/schedule/tasks/:id/assign` | 565–597 |
| PUT | `/api/v1/schedule/tasks/:id/purchase-request` | 600–633 |
| PUT | `/api/v1/schedule/tasks/:id/holiday-decision` | 637–662 |
| DELETE | `/api/v1/schedule/tasks/:id` | 664–708 |
| PUT | `/api/v1/projects/:projectId/schedule/people` | 713–786 |
| POST | `/api/v1/schedule/tasks/:id/move` | 790–863 |
| POST | `/api/v1/schedule/tasks/:id/updates` | 865–927 |
| POST | `/api/v1/schedule/tasks/:id/day-requests` | 929–962 |
| POST | `/api/v1/schedule/day-requests/:id/answer` | 964–1038 |
| POST | `/api/v1/schedule/tasks/:id/details` | 1040–1117 |
| DELETE | `/api/v1/schedule/tasks/:id/details` | 1119–1169 |
| POST | `/api/v1/projects/:projectId/schedule/baseline` | 1171–1252 |
| PUT | `/api/v1/projects/:projectId/manhour-budget` | 1257–1276 |
| GET | `/api/v1/schedule/day-requests/pending` | 1278–1321 |
| GET | `/api/v1/schedule/search` | 1326–1352 |
| GET | `/api/v1/me/work` | 1354–1481 |
| GET | `/api/v1/me/work/updates` | 1483–1519 |

## Named functions

| Symbol | Source | Lines |
|---|---|---|
| `membersFor` | [backend-node/src/routes/schedule.ts](<../../../backend-node/src/routes/schedule.ts>) | 68–73 |
| `bindPlan` | [backend-node/src/routes/schedule.ts](<../../../backend-node/src/routes/schedule.ts>) | 75–95 |
| `planAudit` | [backend-node/src/routes/schedule.ts](<../../../backend-node/src/routes/schedule.ts>) | 97–115 |
| `existingPlan` | [backend-node/src/routes/schedule.ts](<../../../backend-node/src/routes/schedule.ts>) | 117–135 |
| `readBaselines` | [backend-node/src/routes/schedule.ts](<../../../backend-node/src/routes/schedule.ts>) | 139–156 |
| `readUpdates` | [backend-node/src/routes/schedule.ts](<../../../backend-node/src/routes/schedule.ts>) | 158–183 |
| `projectSchedule` | [backend-node/src/routes/schedule.ts](<../../../backend-node/src/routes/schedule.ts>) | 185–263 |
| `readProjectRequests` | [backend-node/src/routes/schedule.ts](<../../../backend-node/src/routes/schedule.ts>) | 271–276 |
| `readHolidayList` | [backend-node/src/routes/schedule.ts](<../../../backend-node/src/routes/schedule.ts>) | 285–297 |
| `readFollowUpFacts` | [backend-node/src/routes/schedule.ts](<../../../backend-node/src/routes/schedule.ts>) | 339–394 |
| `readActualByDiscipline` | [backend-node/src/routes/schedule.ts](<../../../backend-node/src/routes/schedule.ts>) | 403–416 |
| `readRowHours` | [backend-node/src/routes/schedule.ts](<../../../backend-node/src/routes/schedule.ts>) | 418–423 |
| `registerScheduleRoutes` | [backend-node/src/routes/schedule.ts](<../../../backend-node/src/routes/schedule.ts>) | 426–1520 |

## Direct local dependencies

- [backend-node/src/audit.ts](<../../../backend-node/src/audit.ts>)
- [backend-node/src/db.ts](<../../../backend-node/src/db.ts>)
- [backend-node/src/errors.ts](<../../../backend-node/src/errors.ts>)
- [backend-node/src/user-roles.ts](<../../../backend-node/src/user-roles.ts>)
- [backend-node/src/http.ts](<../../../backend-node/src/http.ts>)
- [backend-node/src/project-scope.ts](<../../../backend-node/src/project-scope.ts>)
- [backend-node/src/leader-scope.ts](<../../../backend-node/src/leader-scope.ts>)
- [backend-node/src/manhour-budget.ts](<../../../backend-node/src/manhour-budget.ts>)
- [backend-node/src/project-cost-model.ts](<../../../backend-node/src/project-cost-model.ts>)
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
