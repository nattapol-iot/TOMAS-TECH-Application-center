# resource-planning

[Module](../modules/planning.md) · [Index](../../../AGENTS.md)

Evidence: source snapshot `9587bdae`; generated, do not edit. [backend-node/src/routes/resource-planning.ts](<../../../backend-node/src/routes/resource-planning.ts>). Ranges are hints: search symbol after edits.

## API operations

| Method | Path | Source lines |
|---|---|---|
| GET | `/api/v1/resource-planning` | 58–67 |
| GET | `/api/v1/resource-planning/workload` | 69–104 |
| PUT | `/api/v1/resource-planning/work-order/:userId` | 107–125 |
| PUT | `/api/v1/resource-planning/:kind/:id` | 126–183 |

## Named functions

| Symbol | Source | Lines |
|---|---|---|
| `map` | [backend-node/src/routes/resource-planning.ts](<../../../backend-node/src/routes/resource-planning.ts>) | 14–23 |
| `decimal` | [backend-node/src/routes/resource-planning.ts](<../../../backend-node/src/routes/resource-planning.ts>) | 24–28 |
| `holidayDates` | [backend-node/src/routes/resource-planning.ts](<../../../backend-node/src/routes/resource-planning.ts>) | 40–40 |
| `registerResourcePlanningRoutes` | [backend-node/src/routes/resource-planning.ts](<../../../backend-node/src/routes/resource-planning.ts>) | 57–184 |

## Direct local dependencies

- [backend-node/src/db.ts](<../../../backend-node/src/db.ts>)
- [backend-node/src/users.ts](<../../../backend-node/src/users.ts>)
- [backend-node/src/http.ts](<../../../backend-node/src/http.ts>)
- [backend-node/src/errors.ts](<../../../backend-node/src/errors.ts>)
- [backend-node/src/audit.ts](<../../../backend-node/src/audit.ts>)
- [backend-node/src/project-scope.ts](<../../../backend-node/src/project-scope.ts>)
- [backend-node/src/resource-task-service.ts](<../../../backend-node/src/resource-task-service.ts>)
- [backend-node/src/schedule-service.ts](<../../../backend-node/src/schedule-service.ts>)
- [backend-node/src/resource-workload.ts](<../../../backend-node/src/resource-workload.ts>)

## SQL references (literal scan, not a complete schema or write-set)

`dbo.engineer_availability`, `dbo.estimate_assignments`, `dbo.estimates`, `dbo.holidays`, `dbo.inquiries`, `dbo.resource_capacity`, `dbo.resource_effort`, `dbo.resource_task_sources`, `dbo.team_task_assignees`, `dbo.team_tasks`, `dbo.user_effective_permissions`, `dbo.users`, `dbo.work_hours`, `dbo.work_priorities`

## Change boundary

Read the selected handler and helpers it calls, then its caller in api-client.ts. Verify permission checks, record scope, transaction, rowVersion and audit on that path; a route name alone does not prove authorization. Dynamic routes/SQL, helper side effects and runtime config require source inspection.
