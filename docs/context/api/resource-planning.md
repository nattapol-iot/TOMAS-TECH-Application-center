# resource-planning

[Module](../modules/planning.md) · [Index](../../../AGENTS.md)

Evidence: source snapshot `7c72bae7`; generated, do not edit. [backend-node/src/routes/resource-planning.ts](<../../../backend-node/src/routes/resource-planning.ts>). Ranges are hints: search symbol after edits.

## API operations

| Method | Path | Source lines |
|---|---|---|
| GET | `/api/v1/resource-planning` | 59–68 |
| GET | `/api/v1/resource-planning/workload` | 70–92 |
| PUT | `/api/v1/resource-planning/work-order/:userId` | 95–118 |
| PUT | `/api/v1/resource-planning/:kind/:id` | 119–215 |

## Named functions

| Symbol | Source | Lines |
|---|---|---|
| `map` | [backend-node/src/routes/resource-planning.ts](<../../../backend-node/src/routes/resource-planning.ts>) | 19–28 |
| `decimal` | [backend-node/src/routes/resource-planning.ts](<../../../backend-node/src/routes/resource-planning.ts>) | 29–43 |
| `holidayDates` | [backend-node/src/routes/resource-planning.ts](<../../../backend-node/src/routes/resource-planning.ts>) | 53–53 |
| `registerResourcePlanningRoutes` | [backend-node/src/routes/resource-planning.ts](<../../../backend-node/src/routes/resource-planning.ts>) | 54–216 |

## Direct local dependencies

- [backend-node/src/db.ts](<../../../backend-node/src/db.ts>)
- [backend-node/src/users.ts](<../../../backend-node/src/users.ts>)
- [backend-node/src/http.ts](<../../../backend-node/src/http.ts>)
- [backend-node/src/errors.ts](<../../../backend-node/src/errors.ts>)
- [backend-node/src/audit.ts](<../../../backend-node/src/audit.ts>)
- [backend-node/src/project-scope.ts](<../../../backend-node/src/project-scope.ts>)
- [backend-node/src/resource-task-service.ts](<../../../backend-node/src/resource-task-service.ts>)
- [backend-node/src/resource-workload.ts](<../../../backend-node/src/resource-workload.ts>)

## SQL references (literal scan, not a complete schema or write-set)

`dbo.estimates`, `dbo.holidays`, `dbo.inquiries`, `dbo.resource_capacity`, `dbo.resource_effort`, `dbo.resource_task_sources`, `dbo.user_effective_permissions`, `dbo.users`, `dbo.work_priorities`

## Change boundary

Read the selected handler and helpers it calls, then its caller in api-client.ts. Verify permission checks, record scope, transaction, rowVersion and audit on that path; a route name alone does not prove authorization. Dynamic routes/SQL, helper side effects and runtime config require source inspection.
