# schedule

[Module](../modules/planning.md) · [Index](../../../AGENTS.md)

Evidence: source snapshot `df41e727`; generated, do not edit. [backend-node/src/routes/schedule.ts](<../../../backend-node/src/routes/schedule.ts>). Ranges are hints: search symbol after edits.

## API operations

| Method | Path | Source lines |
|---|---|---|
| GET | `/api/v1/projects/:projectId/schedule` | 107–113 |
| POST | `/api/v1/projects/:projectId/schedule/tasks` | 115–132 |
| PUT | `/api/v1/schedule/tasks/:id` | 134–157 |
| POST | `/api/v1/schedule/tasks/:id/updates` | 159–175 |
| POST | `/api/v1/schedule/tasks/:id/day-requests` | 177–186 |
| POST | `/api/v1/schedule/day-requests/:id/answer` | 188–198 |
| POST | `/api/v1/schedule/tasks/:id/details` | 200–204 |
| DELETE | `/api/v1/schedule/tasks/:id/details` | 206–209 |
| POST | `/api/v1/projects/:projectId/schedule/baseline` | 211–215 |
| GET | `/api/v1/schedule/day-requests/pending` | 219–241 |
| GET | `/api/v1/schedule/search` | 246–265 |
| GET | `/api/v1/me/work` | 267–275 |
| GET | `/api/v1/me/work/updates` | 277–280 |

## Named functions

| Symbol | Source | Lines |
|---|---|---|
| `bindPlan` | [backend-node/src/routes/schedule.ts](<../../../backend-node/src/routes/schedule.ts>) | 25–34 |
| `planAudit` | [backend-node/src/routes/schedule.ts](<../../../backend-node/src/routes/schedule.ts>) | 36–41 |
| `existingPlan` | [backend-node/src/routes/schedule.ts](<../../../backend-node/src/routes/schedule.ts>) | 43–47 |
| `readBaselines` | [backend-node/src/routes/schedule.ts](<../../../backend-node/src/routes/schedule.ts>) | 51–57 |
| `readUpdates` | [backend-node/src/routes/schedule.ts](<../../../backend-node/src/routes/schedule.ts>) | 59–70 |
| `projectSchedule` | [backend-node/src/routes/schedule.ts](<../../../backend-node/src/routes/schedule.ts>) | 72–102 |
| `registerScheduleRoutes` | [backend-node/src/routes/schedule.ts](<../../../backend-node/src/routes/schedule.ts>) | 105–281 |

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
