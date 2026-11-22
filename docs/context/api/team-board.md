# team-board

[Module](../modules/planning.md) · [Index](../../../AGENTS.md)

Evidence: source snapshot `1f3506e9`; generated, do not edit. [backend-node/src/routes/team-board.ts](<../../../backend-node/src/routes/team-board.ts>). Ranges are hints: search symbol after edits.

## API operations

| Method | Path | Source lines |
|---|---|---|
| GET | `/api/v1/team-board` | 555–610 |
| POST | `/api/v1/team-board/outlook-sync` | 613–616 |
| POST | `/api/v1/team-tasks` | 618–629 |
| PUT | `/api/v1/team-tasks/:id` | 631–696 |
| DELETE | `/api/v1/team-tasks/:id` | 698–727 |
| GET | `/api/v1/team-tasks/:id/history` | 730–745 |

## Named functions

| Symbol | Source | Lines |
|---|---|---|
| `dayNumber` | [backend-node/src/routes/team-board.ts](<../../../backend-node/src/routes/team-board.ts>) | 69–69 |
| `choice` | [backend-node/src/routes/team-board.ts](<../../../backend-node/src/routes/team-board.ts>) | 70–75 |
| `optionalId` | [backend-node/src/routes/team-board.ts](<../../../backend-node/src/routes/team-board.ts>) | 77–78 |
| `parseTeamTask` | [backend-node/src/routes/team-board.ts](<../../../backend-node/src/routes/team-board.ts>) | 81–136 |
| `parseApplyTo` | [backend-node/src/routes/team-board.ts](<../../../backend-node/src/routes/team-board.ts>) | 139–139 |
| `defaultManDays` | [backend-node/src/routes/team-board.ts](<../../../backend-node/src/routes/team-board.ts>) | 146–157 |
| `minutesOf` | [backend-node/src/routes/team-board.ts](<../../../backend-node/src/routes/team-board.ts>) | 159–159 |
| `timeRangeManDays` | [backend-node/src/routes/team-board.ts](<../../../backend-node/src/routes/team-board.ts>) | 161–165 |
| `canAssignOthers` | [backend-node/src/routes/team-board.ts](<../../../backend-node/src/routes/team-board.ts>) | 172–172 |
| `assertMayAssign` | [backend-node/src/routes/team-board.ts](<../../../backend-node/src/routes/team-board.ts>) | 175–179 |
| `canChangeTeamTask` | [backend-node/src/routes/team-board.ts](<../../../backend-node/src/routes/team-board.ts>) | 181–182 |
| `idList` | [backend-node/src/routes/team-board.ts](<../../../backend-node/src/routes/team-board.ts>) | 185–185 |
| `redactWork` | [backend-node/src/routes/team-board.ts](<../../../backend-node/src/routes/team-board.ts>) | 188–195 |
| `teamTaskDto` | [backend-node/src/routes/team-board.ts](<../../../backend-node/src/routes/team-board.ts>) | 242–272 |
| `prepare` | [backend-node/src/routes/team-board.ts](<../../../backend-node/src/routes/team-board.ts>) | 278–299 |
| `bind` | [backend-node/src/routes/team-board.ts](<../../../backend-node/src/routes/team-board.ts>) | 301–309 |
| `savePeople` | [backend-node/src/routes/team-board.ts](<../../../backend-node/src/routes/team-board.ts>) | 312–317 |
| `currentPeople` | [backend-node/src/routes/team-board.ts](<../../../backend-node/src/routes/team-board.ts>) | 320–324 |
| `tellPeople` | [backend-node/src/routes/team-board.ts](<../../../backend-node/src/routes/team-board.ts>) | 327–333 |
| `calendarState` | [backend-node/src/routes/team-board.ts](<../../../backend-node/src/routes/team-board.ts>) | 336–340 |
| `clock` | [backend-node/src/routes/team-board.ts](<../../../backend-node/src/routes/team-board.ts>) | 342–342 |
| `rowState` | [backend-node/src/routes/team-board.ts](<../../../backend-node/src/routes/team-board.ts>) | 343–348 |
| `seriesOf` | [backend-node/src/routes/team-board.ts](<../../../backend-node/src/routes/team-board.ts>) | 349–349 |
| `deliverCalendar` | [backend-node/src/routes/team-board.ts](<../../../backend-node/src/routes/team-board.ts>) | 361–391 |
| `worst` | [backend-node/src/routes/team-board.ts](<../../../backend-node/src/routes/team-board.ts>) | 392–393 |
| `deliverAll` | [backend-node/src/routes/team-board.ts](<../../../backend-node/src/routes/team-board.ts>) | 396–400 |
| `readSeries` | [backend-node/src/routes/team-board.ts](<../../../backend-node/src/routes/team-board.ts>) | 403–417 |
| `seriesDeliveries` | [backend-node/src/routes/team-board.ts](<../../../backend-node/src/routes/team-board.ts>) | 420–431 |
| `createSingle` | [backend-node/src/routes/team-board.ts](<../../../backend-node/src/routes/team-board.ts>) | 434–449 |
| `createSeries` | [backend-node/src/routes/team-board.ts](<../../../backend-node/src/routes/team-board.ts>) | 455–501 |
| `removeTask` | [backend-node/src/routes/team-board.ts](<../../../backend-node/src/routes/team-board.ts>) | 504–508 |
| `endSeries` | [backend-node/src/routes/team-board.ts](<../../../backend-node/src/routes/team-board.ts>) | 515–532 |
| `graphOf` | [backend-node/src/routes/team-board.ts](<../../../backend-node/src/routes/team-board.ts>) | 536–538 |
| `seriesDayItems` | [backend-node/src/routes/team-board.ts](<../../../backend-node/src/routes/team-board.ts>) | 541–551 |
| `registerTeamBoardRoutes` | [backend-node/src/routes/team-board.ts](<../../../backend-node/src/routes/team-board.ts>) | 553–746 |

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
- [backend-node/src/team-task-series.ts](<../../../backend-node/src/team-task-series.ts>)

## SQL references (literal scan, not a complete schema or write-set)

`dbo.audit_log`, `dbo.customers`, `dbo.engineer_availability`, `dbo.holidays`, `dbo.inquiries`, `dbo.projects`, `dbo.resource_capacity`, `dbo.sales_intakes`, `dbo.site_visit_assignments`, `dbo.site_visits`, `dbo.team_task_assignees`, `dbo.team_task_series`, `dbo.team_tasks`, `dbo.user_effective_permissions`, `dbo.users`

## Change boundary

Read the selected handler and helpers it calls, then its caller in api-client.ts. Verify permission checks, record scope, transaction, rowVersion and audit on that path; a route name alone does not prove authorization. Dynamic routes/SQL, helper side effects and runtime config require source inspection.
