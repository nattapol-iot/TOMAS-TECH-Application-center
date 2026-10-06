# schedule

[Module](../modules/planning.md) · [Index](../../../AGENTS.md)

Evidence: source snapshot `68f83bd3`; generated, do not edit. [backend-node/src/routes/schedule.ts](<../../../backend-node/src/routes/schedule.ts>). Ranges are hints: search symbol after edits.

## API operations

| Method | Path | Source lines |
|---|---|---|
| GET | `/api/v1/projects/:projectId/schedule` | 101–107 |
| POST | `/api/v1/projects/:projectId/schedule/tasks` | 109–124 |
| PUT | `/api/v1/schedule/tasks/:id` | 126–143 |
| POST | `/api/v1/schedule/tasks/:id/updates` | 145–161 |
| POST | `/api/v1/schedule/tasks/:id/day-requests` | 163–172 |
| POST | `/api/v1/schedule/day-requests/:id/answer` | 174–184 |
| POST | `/api/v1/schedule/tasks/:id/details` | 186–190 |
| DELETE | `/api/v1/schedule/tasks/:id/details` | 192–195 |
| POST | `/api/v1/projects/:projectId/schedule/baseline` | 197–201 |
| GET | `/api/v1/me/work` | 203–209 |
| GET | `/api/v1/me/work/updates` | 211–214 |

## Named functions

| Symbol | Source | Lines |
|---|---|---|
| `bindPlan` | [backend-node/src/routes/schedule.ts](<../../../backend-node/src/routes/schedule.ts>) | 23–32 |
| `planAudit` | [backend-node/src/routes/schedule.ts](<../../../backend-node/src/routes/schedule.ts>) | 34–39 |
| `existingPlan` | [backend-node/src/routes/schedule.ts](<../../../backend-node/src/routes/schedule.ts>) | 41–45 |
| `readBaselines` | [backend-node/src/routes/schedule.ts](<../../../backend-node/src/routes/schedule.ts>) | 49–55 |
| `readUpdates` | [backend-node/src/routes/schedule.ts](<../../../backend-node/src/routes/schedule.ts>) | 57–68 |
| `projectSchedule` | [backend-node/src/routes/schedule.ts](<../../../backend-node/src/routes/schedule.ts>) | 70–96 |
| `registerScheduleRoutes` | [backend-node/src/routes/schedule.ts](<../../../backend-node/src/routes/schedule.ts>) | 99–215 |

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

## SQL references (literal scan, not a complete schema or write-set)

`dbo.answer_schedule_day_request`, `dbo.project_members`, `dbo.projects`, `dbo.resource_tasks`, `dbo.schedule_baselines`, `dbo.schedule_task_pics`, `dbo.schedule_tasks`, `dbo.schedule_updates`, `dbo.users`

## Change boundary

Read the selected handler and helpers it calls, then its caller in api-client.ts. Verify permission checks, record scope, transaction, rowVersion and audit on that path; a route name alone does not prove authorization. Dynamic routes/SQL, helper side effects and runtime config require source inspection.
