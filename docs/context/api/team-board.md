# team-board

[Module](../modules/planning.md) · [Index](../../../AGENTS.md)

Evidence: source snapshot `0ede4efb`; generated, do not edit. [backend-node/src/routes/team-board.ts](<../../../backend-node/src/routes/team-board.ts>). Ranges are hints: search symbol after edits.

## API operations

| Method | Path | Source lines |
|---|---|---|
| GET | `/api/v1/team-board` | 231–278 |
| POST | `/api/v1/team-tasks` | 280–298 |
| PUT | `/api/v1/team-tasks/:id` | 300–332 |
| DELETE | `/api/v1/team-tasks/:id` | 334–352 |
| GET | `/api/v1/team-tasks/:id/history` | 355–365 |

## Named functions

| Symbol | Source | Lines |
|---|---|---|
| `dayNumber` | [backend-node/src/routes/team-board.ts](<../../../backend-node/src/routes/team-board.ts>) | 47–47 |
| `choice` | [backend-node/src/routes/team-board.ts](<../../../backend-node/src/routes/team-board.ts>) | 48–53 |
| `optionalId` | [backend-node/src/routes/team-board.ts](<../../../backend-node/src/routes/team-board.ts>) | 55–56 |
| `parseTeamTask` | [backend-node/src/routes/team-board.ts](<../../../backend-node/src/routes/team-board.ts>) | 59–95 |
| `defaultManDays` | [backend-node/src/routes/team-board.ts](<../../../backend-node/src/routes/team-board.ts>) | 98–108 |
| `canChangeTeamTask` | [backend-node/src/routes/team-board.ts](<../../../backend-node/src/routes/team-board.ts>) | 111–112 |
| `redactWork` | [backend-node/src/routes/team-board.ts](<../../../backend-node/src/routes/team-board.ts>) | 115–122 |
| `teamTaskDto` | [backend-node/src/routes/team-board.ts](<../../../backend-node/src/routes/team-board.ts>) | 165–189 |
| `prepare` | [backend-node/src/routes/team-board.ts](<../../../backend-node/src/routes/team-board.ts>) | 192–211 |
| `bind` | [backend-node/src/routes/team-board.ts](<../../../backend-node/src/routes/team-board.ts>) | 213–220 |
| `tellAssignee` | [backend-node/src/routes/team-board.ts](<../../../backend-node/src/routes/team-board.ts>) | 223–228 |
| `registerTeamBoardRoutes` | [backend-node/src/routes/team-board.ts](<../../../backend-node/src/routes/team-board.ts>) | 230–366 |

## Direct local dependencies

- [backend-node/src/db.ts](<../../../backend-node/src/db.ts>)
- [backend-node/src/users.ts](<../../../backend-node/src/users.ts>)
- [backend-node/src/types.ts](<../../../backend-node/src/types.ts>)
- [backend-node/src/http.ts](<../../../backend-node/src/http.ts>)
- [backend-node/src/errors.ts](<../../../backend-node/src/errors.ts>)
- [backend-node/src/audit.ts](<../../../backend-node/src/audit.ts>)
- [backend-node/src/project-scope.ts](<../../../backend-node/src/project-scope.ts>)
- [backend-node/src/resource-task-service.ts](<../../../backend-node/src/resource-task-service.ts>)
- [backend-node/src/site-visit-common.ts](<../../../backend-node/src/site-visit-common.ts>)
- [backend-node/src/resource-workload.ts](<../../../backend-node/src/resource-workload.ts>)

## SQL references (literal scan, not a complete schema or write-set)

`dbo.audit_log`, `dbo.customers`, `dbo.engineer_availability`, `dbo.holidays`, `dbo.inquiries`, `dbo.projects`, `dbo.resource_capacity`, `dbo.sales_intakes`, `dbo.site_visit_assignments`, `dbo.site_visits`, `dbo.team_tasks`, `dbo.user_effective_permissions`, `dbo.users`

## Change boundary

Read the selected handler and helpers it calls, then its caller in api-client.ts. Verify permission checks, record scope, transaction, rowVersion and audit on that path; a route name alone does not prove authorization. Dynamic routes/SQL, helper side effects and runtime config require source inspection.
