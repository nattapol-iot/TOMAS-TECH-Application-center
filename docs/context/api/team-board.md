# team-board

[Module](../modules/planning.md) · [Index](../../../AGENTS.md)

Evidence: source snapshot `2abf61c7`; generated, do not edit. [backend-node/src/routes/team-board.ts](<../../../backend-node/src/routes/team-board.ts>). Ranges are hints: search symbol after edits.

## API operations

| Method | Path | Source lines |
|---|---|---|
| GET | `/api/v1/team-board` | 313–360 |
| POST | `/api/v1/team-tasks` | 362–382 |
| PUT | `/api/v1/team-tasks/:id` | 384–421 |
| DELETE | `/api/v1/team-tasks/:id` | 423–445 |
| GET | `/api/v1/team-tasks/:id/history` | 448–458 |

## Named functions

| Symbol | Source | Lines |
|---|---|---|
| `dayNumber` | [backend-node/src/routes/team-board.ts](<../../../backend-node/src/routes/team-board.ts>) | 52–52 |
| `choice` | [backend-node/src/routes/team-board.ts](<../../../backend-node/src/routes/team-board.ts>) | 53–58 |
| `optionalId` | [backend-node/src/routes/team-board.ts](<../../../backend-node/src/routes/team-board.ts>) | 60–61 |
| `parseTeamTask` | [backend-node/src/routes/team-board.ts](<../../../backend-node/src/routes/team-board.ts>) | 64–103 |
| `defaultManDays` | [backend-node/src/routes/team-board.ts](<../../../backend-node/src/routes/team-board.ts>) | 106–116 |
| `canChangeTeamTask` | [backend-node/src/routes/team-board.ts](<../../../backend-node/src/routes/team-board.ts>) | 119–120 |
| `idList` | [backend-node/src/routes/team-board.ts](<../../../backend-node/src/routes/team-board.ts>) | 123–123 |
| `redactWork` | [backend-node/src/routes/team-board.ts](<../../../backend-node/src/routes/team-board.ts>) | 126–133 |
| `teamTaskDto` | [backend-node/src/routes/team-board.ts](<../../../backend-node/src/routes/team-board.ts>) | 178–202 |
| `prepare` | [backend-node/src/routes/team-board.ts](<../../../backend-node/src/routes/team-board.ts>) | 205–226 |
| `bind` | [backend-node/src/routes/team-board.ts](<../../../backend-node/src/routes/team-board.ts>) | 228–235 |
| `savePeople` | [backend-node/src/routes/team-board.ts](<../../../backend-node/src/routes/team-board.ts>) | 238–243 |
| `currentPeople` | [backend-node/src/routes/team-board.ts](<../../../backend-node/src/routes/team-board.ts>) | 246–250 |
| `tellPeople` | [backend-node/src/routes/team-board.ts](<../../../backend-node/src/routes/team-board.ts>) | 253–259 |
| `calendarState` | [backend-node/src/routes/team-board.ts](<../../../backend-node/src/routes/team-board.ts>) | 262–265 |
| `rowState` | [backend-node/src/routes/team-board.ts](<../../../backend-node/src/routes/team-board.ts>) | 266–271 |
| `deliverCalendar` | [backend-node/src/routes/team-board.ts](<../../../backend-node/src/routes/team-board.ts>) | 281–310 |
| `registerTeamBoardRoutes` | [backend-node/src/routes/team-board.ts](<../../../backend-node/src/routes/team-board.ts>) | 312–459 |

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
- [backend-node/src/email.ts](<../../../backend-node/src/email.ts>)
- [backend-node/src/team-calendar.ts](<../../../backend-node/src/team-calendar.ts>)

## SQL references (literal scan, not a complete schema or write-set)

`dbo.audit_log`, `dbo.customers`, `dbo.engineer_availability`, `dbo.holidays`, `dbo.inquiries`, `dbo.projects`, `dbo.resource_capacity`, `dbo.sales_intakes`, `dbo.site_visit_assignments`, `dbo.site_visits`, `dbo.team_task_assignees`, `dbo.team_tasks`, `dbo.user_effective_permissions`, `dbo.users`

## Change boundary

Read the selected handler and helpers it calls, then its caller in api-client.ts. Verify permission checks, record scope, transaction, rowVersion and audit on that path; a route name alone does not prove authorization. Dynamic routes/SQL, helper side effects and runtime config require source inspection.
