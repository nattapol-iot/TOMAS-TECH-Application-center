# team-board

[Module](../modules/planning.md) · [Index](../../../AGENTS.md)

Evidence: source snapshot `f6cd0d36`; generated, do not edit. [backend-node/src/routes/team-board.ts](<../../../backend-node/src/routes/team-board.ts>). Ranges are hints: search symbol after edits.

## API operations

| Method | Path | Source lines |
|---|---|---|
| GET | `/api/v1/team-board` | 556–611 |
| POST | `/api/v1/team-board/outlook-sync` | 614–617 |
| POST | `/api/v1/team-tasks` | 619–630 |
| PUT | `/api/v1/team-tasks/:id` | 632–697 |
| DELETE | `/api/v1/team-tasks/:id` | 699–728 |
| GET | `/api/v1/team-tasks/:id/history` | 731–746 |

## Named functions

| Symbol | Source | Lines |
|---|---|---|
| `dayNumber` | [backend-node/src/routes/team-board.ts](<../../../backend-node/src/routes/team-board.ts>) | 70–70 |
| `choice` | [backend-node/src/routes/team-board.ts](<../../../backend-node/src/routes/team-board.ts>) | 71–76 |
| `optionalId` | [backend-node/src/routes/team-board.ts](<../../../backend-node/src/routes/team-board.ts>) | 78–79 |
| `parseTeamTask` | [backend-node/src/routes/team-board.ts](<../../../backend-node/src/routes/team-board.ts>) | 82–137 |
| `parseApplyTo` | [backend-node/src/routes/team-board.ts](<../../../backend-node/src/routes/team-board.ts>) | 140–140 |
| `defaultManDays` | [backend-node/src/routes/team-board.ts](<../../../backend-node/src/routes/team-board.ts>) | 147–158 |
| `minutesOf` | [backend-node/src/routes/team-board.ts](<../../../backend-node/src/routes/team-board.ts>) | 160–160 |
| `timeRangeManDays` | [backend-node/src/routes/team-board.ts](<../../../backend-node/src/routes/team-board.ts>) | 162–166 |
| `canAssignOthers` | [backend-node/src/routes/team-board.ts](<../../../backend-node/src/routes/team-board.ts>) | 173–173 |
| `assertMayAssign` | [backend-node/src/routes/team-board.ts](<../../../backend-node/src/routes/team-board.ts>) | 176–180 |
| `canChangeTeamTask` | [backend-node/src/routes/team-board.ts](<../../../backend-node/src/routes/team-board.ts>) | 182–183 |
| `idList` | [backend-node/src/routes/team-board.ts](<../../../backend-node/src/routes/team-board.ts>) | 186–186 |
| `redactWork` | [backend-node/src/routes/team-board.ts](<../../../backend-node/src/routes/team-board.ts>) | 189–196 |
| `teamTaskDto` | [backend-node/src/routes/team-board.ts](<../../../backend-node/src/routes/team-board.ts>) | 243–273 |
| `prepare` | [backend-node/src/routes/team-board.ts](<../../../backend-node/src/routes/team-board.ts>) | 279–300 |
| `bind` | [backend-node/src/routes/team-board.ts](<../../../backend-node/src/routes/team-board.ts>) | 302–310 |
| `savePeople` | [backend-node/src/routes/team-board.ts](<../../../backend-node/src/routes/team-board.ts>) | 313–318 |
| `currentPeople` | [backend-node/src/routes/team-board.ts](<../../../backend-node/src/routes/team-board.ts>) | 321–325 |
| `tellPeople` | [backend-node/src/routes/team-board.ts](<../../../backend-node/src/routes/team-board.ts>) | 328–334 |
| `calendarState` | [backend-node/src/routes/team-board.ts](<../../../backend-node/src/routes/team-board.ts>) | 337–341 |
| `clock` | [backend-node/src/routes/team-board.ts](<../../../backend-node/src/routes/team-board.ts>) | 343–343 |
| `rowState` | [backend-node/src/routes/team-board.ts](<../../../backend-node/src/routes/team-board.ts>) | 344–349 |
| `seriesOf` | [backend-node/src/routes/team-board.ts](<../../../backend-node/src/routes/team-board.ts>) | 350–350 |
| `deliverCalendar` | [backend-node/src/routes/team-board.ts](<../../../backend-node/src/routes/team-board.ts>) | 362–392 |
| `worst` | [backend-node/src/routes/team-board.ts](<../../../backend-node/src/routes/team-board.ts>) | 393–394 |
| `deliverAll` | [backend-node/src/routes/team-board.ts](<../../../backend-node/src/routes/team-board.ts>) | 397–401 |
| `readSeries` | [backend-node/src/routes/team-board.ts](<../../../backend-node/src/routes/team-board.ts>) | 404–418 |
| `seriesDeliveries` | [backend-node/src/routes/team-board.ts](<../../../backend-node/src/routes/team-board.ts>) | 421–432 |
| `createSingle` | [backend-node/src/routes/team-board.ts](<../../../backend-node/src/routes/team-board.ts>) | 435–450 |
| `createSeries` | [backend-node/src/routes/team-board.ts](<../../../backend-node/src/routes/team-board.ts>) | 456–502 |
| `removeTask` | [backend-node/src/routes/team-board.ts](<../../../backend-node/src/routes/team-board.ts>) | 505–509 |
| `endSeries` | [backend-node/src/routes/team-board.ts](<../../../backend-node/src/routes/team-board.ts>) | 516–533 |
| `graphOf` | [backend-node/src/routes/team-board.ts](<../../../backend-node/src/routes/team-board.ts>) | 537–539 |
| `seriesDayItems` | [backend-node/src/routes/team-board.ts](<../../../backend-node/src/routes/team-board.ts>) | 542–552 |
| `registerTeamBoardRoutes` | [backend-node/src/routes/team-board.ts](<../../../backend-node/src/routes/team-board.ts>) | 554–747 |

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
- [backend-node/src/team-task-series.ts](<../../../backend-node/src/team-task-series.ts>)

## SQL references (literal scan, not a complete schema or write-set)

`dbo.audit_log`, `dbo.customers`, `dbo.engineer_availability`, `dbo.holidays`, `dbo.inquiries`, `dbo.projects`, `dbo.resource_capacity`, `dbo.sales_intakes`, `dbo.site_visit_assignments`, `dbo.site_visits`, `dbo.team_task_assignees`, `dbo.team_task_series`, `dbo.team_tasks`, `dbo.user_effective_permissions`, `dbo.users`

## Change boundary

Read the selected handler and helpers it calls, then its caller in api-client.ts. Verify permission checks, record scope, transaction, rowVersion and audit on that path; a route name alone does not prove authorization. Dynamic routes/SQL, helper side effects and runtime config require source inspection.
