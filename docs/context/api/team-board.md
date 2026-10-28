# team-board

[Module](../modules/planning.md) · [Index](../../../AGENTS.md)

Evidence: source snapshot `89e3c066`; generated, do not edit. [backend-node/src/routes/team-board.ts](<../../../backend-node/src/routes/team-board.ts>). Ranges are hints: search symbol after edits.

## API operations

| Method | Path | Source lines |
|---|---|---|
| GET | `/api/v1/team-board` | 364–418 |
| POST | `/api/v1/team-board/outlook-sync` | 421–424 |
| POST | `/api/v1/team-tasks` | 426–449 |
| PUT | `/api/v1/team-tasks/:id` | 451–490 |
| DELETE | `/api/v1/team-tasks/:id` | 492–514 |
| GET | `/api/v1/team-tasks/:id/history` | 517–527 |

## Named functions

| Symbol | Source | Lines |
|---|---|---|
| `dayNumber` | [backend-node/src/routes/team-board.ts](<../../../backend-node/src/routes/team-board.ts>) | 57–57 |
| `choice` | [backend-node/src/routes/team-board.ts](<../../../backend-node/src/routes/team-board.ts>) | 58–63 |
| `optionalId` | [backend-node/src/routes/team-board.ts](<../../../backend-node/src/routes/team-board.ts>) | 65–66 |
| `parseTeamTask` | [backend-node/src/routes/team-board.ts](<../../../backend-node/src/routes/team-board.ts>) | 69–118 |
| `defaultManDays` | [backend-node/src/routes/team-board.ts](<../../../backend-node/src/routes/team-board.ts>) | 125–136 |
| `minutesOf` | [backend-node/src/routes/team-board.ts](<../../../backend-node/src/routes/team-board.ts>) | 138–138 |
| `timeRangeManDays` | [backend-node/src/routes/team-board.ts](<../../../backend-node/src/routes/team-board.ts>) | 140–144 |
| `canAssignOthers` | [backend-node/src/routes/team-board.ts](<../../../backend-node/src/routes/team-board.ts>) | 151–151 |
| `assertMayAssign` | [backend-node/src/routes/team-board.ts](<../../../backend-node/src/routes/team-board.ts>) | 154–158 |
| `canChangeTeamTask` | [backend-node/src/routes/team-board.ts](<../../../backend-node/src/routes/team-board.ts>) | 160–161 |
| `idList` | [backend-node/src/routes/team-board.ts](<../../../backend-node/src/routes/team-board.ts>) | 164–164 |
| `redactWork` | [backend-node/src/routes/team-board.ts](<../../../backend-node/src/routes/team-board.ts>) | 167–174 |
| `teamTaskDto` | [backend-node/src/routes/team-board.ts](<../../../backend-node/src/routes/team-board.ts>) | 219–244 |
| `prepare` | [backend-node/src/routes/team-board.ts](<../../../backend-node/src/routes/team-board.ts>) | 247–268 |
| `bind` | [backend-node/src/routes/team-board.ts](<../../../backend-node/src/routes/team-board.ts>) | 270–277 |
| `savePeople` | [backend-node/src/routes/team-board.ts](<../../../backend-node/src/routes/team-board.ts>) | 280–285 |
| `currentPeople` | [backend-node/src/routes/team-board.ts](<../../../backend-node/src/routes/team-board.ts>) | 288–292 |
| `tellPeople` | [backend-node/src/routes/team-board.ts](<../../../backend-node/src/routes/team-board.ts>) | 295–301 |
| `calendarState` | [backend-node/src/routes/team-board.ts](<../../../backend-node/src/routes/team-board.ts>) | 304–307 |
| `clock` | [backend-node/src/routes/team-board.ts](<../../../backend-node/src/routes/team-board.ts>) | 309–309 |
| `rowState` | [backend-node/src/routes/team-board.ts](<../../../backend-node/src/routes/team-board.ts>) | 310–315 |
| `deliverCalendar` | [backend-node/src/routes/team-board.ts](<../../../backend-node/src/routes/team-board.ts>) | 325–354 |
| `graphOf` | [backend-node/src/routes/team-board.ts](<../../../backend-node/src/routes/team-board.ts>) | 358–360 |
| `registerTeamBoardRoutes` | [backend-node/src/routes/team-board.ts](<../../../backend-node/src/routes/team-board.ts>) | 362–528 |

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
- [backend-node/src/outlook-calendar.ts](<../../../backend-node/src/outlook-calendar.ts>)
- [backend-node/src/user-roles.ts](<../../../backend-node/src/user-roles.ts>)

## SQL references (literal scan, not a complete schema or write-set)

`dbo.audit_log`, `dbo.customers`, `dbo.engineer_availability`, `dbo.holidays`, `dbo.inquiries`, `dbo.projects`, `dbo.resource_capacity`, `dbo.sales_intakes`, `dbo.site_visit_assignments`, `dbo.site_visits`, `dbo.team_task_assignees`, `dbo.team_tasks`, `dbo.user_effective_permissions`, `dbo.users`

## Change boundary

Read the selected handler and helpers it calls, then its caller in api-client.ts. Verify permission checks, record scope, transaction, rowVersion and audit on that path; a route name alone does not prove authorization. Dynamic routes/SQL, helper side effects and runtime config require source inspection.
