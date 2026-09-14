# resource-planning

[Module](../modules/planning.md) · [Index](../../../AGENTS.md)

Evidence: source snapshot `056c73a4`; generated, do not edit. [backend-node/src/routes/resource-planning.ts](<../../../backend-node/src/routes/resource-planning.ts>). Ranges are hints: search symbol after edits.

## API operations

| Method | Path | Source lines |
|---|---|---|
| GET | `/api/v1/resource-planning` | 46–69 |
| PUT | `/api/v1/resource-planning/:kind/:id` | 70–166 |

## Named functions

| Symbol | Source | Lines |
|---|---|---|
| `map` | [backend-node/src/routes/resource-planning.ts](<../../../backend-node/src/routes/resource-planning.ts>) | 16–25 |
| `decimal` | [backend-node/src/routes/resource-planning.ts](<../../../backend-node/src/routes/resource-planning.ts>) | 26–40 |
| `registerResourcePlanningRoutes` | [backend-node/src/routes/resource-planning.ts](<../../../backend-node/src/routes/resource-planning.ts>) | 41–167 |

## Direct local dependencies

- [backend-node/src/db.ts](<../../../backend-node/src/db.ts>)
- [backend-node/src/users.ts](<../../../backend-node/src/users.ts>)
- [backend-node/src/http.ts](<../../../backend-node/src/http.ts>)
- [backend-node/src/errors.ts](<../../../backend-node/src/errors.ts>)
- [backend-node/src/audit.ts](<../../../backend-node/src/audit.ts>)

## SQL references (literal scan, not a complete schema or write-set)

`dbo.estimates`, `dbo.holidays`, `dbo.inquiries`, `dbo.permissions`, `dbo.resource_capacity`, `dbo.resource_effort`, `dbo.resource_task_sources`, `dbo.role_permissions`, `dbo.roles`

## Change boundary

Read the selected handler and helpers it calls, then its caller in api-client.ts. Verify permission checks, record scope, transaction, rowVersion and audit on that path; a route name alone does not prove authorization. Dynamic routes/SQL, helper side effects and runtime config require source inspection.
