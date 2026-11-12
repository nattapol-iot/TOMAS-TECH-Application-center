# schedule

[Module](../modules/planning.md) · [Index](../../../AGENTS.md)

Evidence: source snapshot `781d8326`; generated, do not edit. [backend-node/src/routes/schedule.ts](<../../../backend-node/src/routes/schedule.ts>). Ranges are hints: search symbol after edits.

## API operations

| Method | Path | Source lines |
|---|---|---|
| GET | `/api/v1/projects/:projectId/schedule` | 117–123 |
| POST | `/api/v1/projects/:projectId/schedule/tasks` | 125–157 |
| PUT | `/api/v1/schedule/tasks/:id` | 159–184 |
| DELETE | `/api/v1/schedule/tasks/:id` | 186–216 |
| POST | `/api/v1/schedule/tasks/:id/move` | 220–257 |
| POST | `/api/v1/schedule/tasks/:id/updates` | 259–275 |
| POST | `/api/v1/schedule/tasks/:id/day-requests` | 277–286 |
| POST | `/api/v1/schedule/day-requests/:id/answer` | 288–298 |
| POST | `/api/v1/schedule/tasks/:id/details` | 300–304 |
| DELETE | `/api/v1/schedule/tasks/:id/details` | 306–309 |
| POST | `/api/v1/projects/:projectId/schedule/baseline` | 311–315 |
| GET | `/api/v1/schedule/day-requests/pending` | 319–341 |
| GET | `/api/v1/schedule/search` | 346–365 |
| GET | `/api/v1/me/work` | 367–375 |
| GET | `/api/v1/me/work/updates` | 377–380 |

## Named functions

| Symbol | Source | Lines |
|---|---|---|
| `membersFor` | [backend-node/src/routes/schedule.ts](<../../../backend-node/src/routes/schedule.ts>) | 27–32 |
| `bindPlan` | [backend-node/src/routes/schedule.ts](<../../../backend-node/src/routes/schedule.ts>) | 34–43 |
| `planAudit` | [backend-node/src/routes/schedule.ts](<../../../backend-node/src/routes/schedule.ts>) | 45–50 |
| `existingPlan` | [backend-node/src/routes/schedule.ts](<../../../backend-node/src/routes/schedule.ts>) | 52–56 |
| `readBaselines` | [backend-node/src/routes/schedule.ts](<../../../backend-node/src/routes/schedule.ts>) | 60–66 |
| `readUpdates` | [backend-node/src/routes/schedule.ts](<../../../backend-node/src/routes/schedule.ts>) | 68–79 |
| `projectSchedule` | [backend-node/src/routes/schedule.ts](<../../../backend-node/src/routes/schedule.ts>) | 81–112 |
| `registerScheduleRoutes` | [backend-node/src/routes/schedule.ts](<../../../backend-node/src/routes/schedule.ts>) | 115–381 |

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
- [backend-node/src/project-initial-plan.ts](<../../../backend-node/src/project-initial-plan.ts>)

## SQL references (literal scan, not a complete schema or write-set)

`dbo.answer_schedule_day_request`, `dbo.project_members`, `dbo.projects`, `dbo.resource_tasks`, `dbo.schedule_baselines`, `dbo.schedule_task_pics`, `dbo.schedule_tasks`, `dbo.schedule_updates`, `dbo.users`

## Change boundary

Read the selected handler and helpers it calls, then its caller in api-client.ts. Verify permission checks, record scope, transaction, rowVersion and audit on that path; a route name alone does not prove authorization. Dynamic routes/SQL, helper side effects and runtime config require source inspection.
