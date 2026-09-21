# resource-tasks

[Module](../modules/planning.md) · [Index](../../../AGENTS.md)

Evidence: source snapshot `80a5348e`; generated, do not edit. [backend-node/src/routes/resource-tasks.ts](<../../../backend-node/src/routes/resource-tasks.ts>). Ranges are hints: search symbol after edits.

## API operations

| Method | Path | Source lines |
|---|---|---|
| GET | `/api/v1/resource-tasks/commitments` | 38–42 |
| GET | `/api/v1/resource-tasks/sources` | 44–54 |
| GET | `/api/v1/resource-tasks` | 55–68 |
| POST | `/api/v1/resource-tasks/preview` | 69–80 |
| POST | `/api/v1/resource-tasks` | 81–94 |
| POST | `/api/v1/resource-tasks/:id/:action` | 95–154 |

## Named functions

| Symbol | Source | Lines |
|---|---|---|
| `registerResourceTaskRoutes` | [backend-node/src/routes/resource-tasks.ts](<../../../backend-node/src/routes/resource-tasks.ts>) | 13–155 |

## Direct local dependencies

- [backend-node/src/db.ts](<../../../backend-node/src/db.ts>)
- [backend-node/src/users.ts](<../../../backend-node/src/users.ts>)
- [backend-node/src/errors.ts](<../../../backend-node/src/errors.ts>)
- [backend-node/src/http.ts](<../../../backend-node/src/http.ts>)
- [backend-node/src/audit.ts](<../../../backend-node/src/audit.ts>)
- [backend-node/src/schedule-service.ts](<../../../backend-node/src/schedule-service.ts>)
- [backend-node/src/resource-task-service.ts](<../../../backend-node/src/resource-task-service.ts>)
- [backend-node/src/resource-task-math.ts](<../../../backend-node/src/resource-task-math.ts>)

## SQL references (literal scan, not a complete schema or write-set)

`dbo.inquiries`, `dbo.permissions`, `dbo.project_members`, `dbo.projects`, `dbo.resource_task_sources`, `dbo.resource_tasks`, `dbo.role_permissions`, `dbo.schedule_tasks`, `dbo.users`

## Change boundary

Read the selected handler and helpers it calls, then its caller in api-client.ts. Verify permission checks, record scope, transaction, rowVersion and audit on that path; a route name alone does not prove authorization. Dynamic routes/SQL, helper side effects and runtime config require source inspection.
