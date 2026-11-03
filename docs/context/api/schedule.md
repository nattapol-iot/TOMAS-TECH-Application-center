# schedule

[Module](../modules/planning.md) · [Index](../../../AGENTS.md)

Evidence: source snapshot `e88d2624`; generated, do not edit. [backend-node/src/routes/schedule.ts](<../../../backend-node/src/routes/schedule.ts>). Ranges are hints: search symbol after edits.

## API operations

| Method | Path | Source lines |
|---|---|---|
| GET | `/api/v1/projects/:projectId/schedule` | 107–113 |
| POST | `/api/v1/projects/:projectId/schedule/tasks` | 115–146 |
| PUT | `/api/v1/schedule/tasks/:id` | 148–171 |
| POST | `/api/v1/schedule/tasks/:id/move` | 175–211 |
| POST | `/api/v1/schedule/tasks/:id/updates` | 213–229 |
| POST | `/api/v1/schedule/tasks/:id/day-requests` | 231–240 |
| POST | `/api/v1/schedule/day-requests/:id/answer` | 242–252 |
| POST | `/api/v1/schedule/tasks/:id/details` | 254–258 |
| DELETE | `/api/v1/schedule/tasks/:id/details` | 260–263 |
| POST | `/api/v1/projects/:projectId/schedule/baseline` | 265–269 |
| GET | `/api/v1/schedule/day-requests/pending` | 273–295 |
| GET | `/api/v1/schedule/search` | 300–319 |
| GET | `/api/v1/me/work` | 321–329 |
| GET | `/api/v1/me/work/updates` | 331–334 |

## Named functions

| Symbol | Source | Lines |
|---|---|---|
| `bindPlan` | [backend-node/src/routes/schedule.ts](<../../../backend-node/src/routes/schedule.ts>) | 25–34 |
| `planAudit` | [backend-node/src/routes/schedule.ts](<../../../backend-node/src/routes/schedule.ts>) | 36–41 |
| `existingPlan` | [backend-node/src/routes/schedule.ts](<../../../backend-node/src/routes/schedule.ts>) | 43–47 |
| `readBaselines` | [backend-node/src/routes/schedule.ts](<../../../backend-node/src/routes/schedule.ts>) | 51–57 |
| `readUpdates` | [backend-node/src/routes/schedule.ts](<../../../backend-node/src/routes/schedule.ts>) | 59–70 |
| `projectSchedule` | [backend-node/src/routes/schedule.ts](<../../../backend-node/src/routes/schedule.ts>) | 72–102 |
| `registerScheduleRoutes` | [backend-node/src/routes/schedule.ts](<../../../backend-node/src/routes/schedule.ts>) | 105–335 |

## Direct local dependencies

- [backend-node/src/audit.ts](<../../../backend-node/src/audit.ts>)
- [backend-node/src/db.ts](<../../../backend-node/src/db.ts>)
- [backend-node/src/errors.ts](<../../../backend-node/src/errors.ts>)
- [backend-node/src/user-roles.ts](<../../../backend-node/src/user-roles.ts>)
- [backend-node/src/http.ts](<../../../backend-node/src/http.ts>)
- [backend-node/src/project-scope.ts](<../../../backend-node/src/project-scope.ts>)
- [backend-node/src/schedule-calculator.ts](<../../../backend-node/src/schedule-calculator.ts>)
- [backend-node/src/business-date.ts](<../../../backend-node/src/business-date.ts>)
- [backend-node/src/config.ts](<../../../backend-node/src/config.ts>)
- [backend-node/src/project-health.ts](<../../../backend-node/src/project-health.ts>)
- [backend-node/src/schedule-service.ts](<../../../backend-node/src/schedule-service.ts>)
- [backend-node/src/types.ts](<../../../backend-node/src/types.ts>)
- [backend-node/src/users.ts](<../../../backend-node/src/users.ts>)
- [backend-node/src/email.ts](<../../../backend-node/src/email.ts>)
- [backend-node/src/project-notices.ts](<../../../backend-node/src/project-notices.ts>)

## SQL references (literal scan, not a complete schema or write-set)

`dbo.answer_schedule_day_request`, `dbo.project_members`, `dbo.projects`, `dbo.resource_tasks`, `dbo.schedule_baselines`, `dbo.schedule_task_pics`, `dbo.schedule_tasks`, `dbo.schedule_updates`, `dbo.users`

## Change boundary

Read the selected handler and helpers it calls, then its caller in api-client.ts. Verify permission checks, record scope, transaction, rowVersion and audit on that path; a route name alone does not prove authorization. Dynamic routes/SQL, helper side effects and runtime config require source inspection.
