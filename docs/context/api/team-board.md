# team-board

[Module](../modules/planning.md) · [Index](../../../AGENTS.md)

Evidence: source snapshot `c0b7e1fa`; generated, do not edit. [backend-node/src/routes/team-board.ts](<../../../backend-node/src/routes/team-board.ts>). Ranges are hints: search symbol after edits.

## API operations

| Method | Path | Source lines |
|---|---|---|
| GET | `/api/v1/team-board` | 706–768 |
| POST | `/api/v1/team-board/outlook-sync` | 771–774 |
| POST | `/api/v1/team-tasks` | 776–787 |
| PUT | `/api/v1/team-tasks/:id` | 789–863 |
| DELETE | `/api/v1/team-tasks/:id` | 865–892 |
| GET | `/api/v1/team-tasks/:id/history` | 895–925 |

## Named functions

| Symbol | Source | Lines |
|---|---|---|
| `dayNumber` | [backend-node/src/routes/team-board.ts](<../../../backend-node/src/routes/team-board.ts>) | 80–80 |
| `choice` | [backend-node/src/routes/team-board.ts](<../../../backend-node/src/routes/team-board.ts>) | 81–85 |
| `optionalId` | [backend-node/src/routes/team-board.ts](<../../../backend-node/src/routes/team-board.ts>) | 87–87 |
| `parseTeamTask` | [backend-node/src/routes/team-board.ts](<../../../backend-node/src/routes/team-board.ts>) | 90–142 |
| `parseApplyTo` | [backend-node/src/routes/team-board.ts](<../../../backend-node/src/routes/team-board.ts>) | 145–145 |
| `defaultManDays` | [backend-node/src/routes/team-board.ts](<../../../backend-node/src/routes/team-board.ts>) | 152–165 |
| `minutesOf` | [backend-node/src/routes/team-board.ts](<../../../backend-node/src/routes/team-board.ts>) | 167–167 |
| `timeRangeManDays` | [backend-node/src/routes/team-board.ts](<../../../backend-node/src/routes/team-board.ts>) | 169–174 |
| `canAssignOthers` | [backend-node/src/routes/team-board.ts](<../../../backend-node/src/routes/team-board.ts>) | 181–181 |
| `assertMayAssign` | [backend-node/src/routes/team-board.ts](<../../../backend-node/src/routes/team-board.ts>) | 184–188 |
| `canChangeTeamTask` | [backend-node/src/routes/team-board.ts](<../../../backend-node/src/routes/team-board.ts>) | 190–191 |
| `idList` | [backend-node/src/routes/team-board.ts](<../../../backend-node/src/routes/team-board.ts>) | 194–200 |
| `redactWork` | [backend-node/src/routes/team-board.ts](<../../../backend-node/src/routes/team-board.ts>) | 203–225 |
| `teamTaskDto` | [backend-node/src/routes/team-board.ts](<../../../backend-node/src/routes/team-board.ts>) | 272–302 |
| `prepare` | [backend-node/src/routes/team-board.ts](<../../../backend-node/src/routes/team-board.ts>) | 308–332 |
| `bind` | [backend-node/src/routes/team-board.ts](<../../../backend-node/src/routes/team-board.ts>) | 334–351 |
| `savePeople` | [backend-node/src/routes/team-board.ts](<../../../backend-node/src/routes/team-board.ts>) | 354–359 |
| `currentPeople` | [backend-node/src/routes/team-board.ts](<../../../backend-node/src/routes/team-board.ts>) | 362–365 |
| `tellPeople` | [backend-node/src/routes/team-board.ts](<../../../backend-node/src/routes/team-board.ts>) | 368–382 |
| `calendarState` | [backend-node/src/routes/team-board.ts](<../../../backend-node/src/routes/team-board.ts>) | 385–413 |
| `clock` | [backend-node/src/routes/team-board.ts](<../../../backend-node/src/routes/team-board.ts>) | 415–415 |
| `rowState` | [backend-node/src/routes/team-board.ts](<../../../backend-node/src/routes/team-board.ts>) | 416–431 |
| `seriesOf` | [backend-node/src/routes/team-board.ts](<../../../backend-node/src/routes/team-board.ts>) | 432–432 |
| `deliverCalendar` | [backend-node/src/routes/team-board.ts](<../../../backend-node/src/routes/team-board.ts>) | 444–499 |
| `worst` | [backend-node/src/routes/team-board.ts](<../../../backend-node/src/routes/team-board.ts>) | 500–501 |
| `deliverAll` | [backend-node/src/routes/team-board.ts](<../../../backend-node/src/routes/team-board.ts>) | 504–508 |
| `readSeries` | [backend-node/src/routes/team-board.ts](<../../../backend-node/src/routes/team-board.ts>) | 511–531 |
| `seriesDeliveries` | [backend-node/src/routes/team-board.ts](<../../../backend-node/src/routes/team-board.ts>) | 534–546 |
| `createSingle` | [backend-node/src/routes/team-board.ts](<../../../backend-node/src/routes/team-board.ts>) | 549–566 |
| `createSeries` | [backend-node/src/routes/team-board.ts](<../../../backend-node/src/routes/team-board.ts>) | 572–632 |
| `removeTask` | [backend-node/src/routes/team-board.ts](<../../../backend-node/src/routes/team-board.ts>) | 635–641 |
| `endSeries` | [backend-node/src/routes/team-board.ts](<../../../backend-node/src/routes/team-board.ts>) | 648–669 |
| `graphOf` | [backend-node/src/routes/team-board.ts](<../../../backend-node/src/routes/team-board.ts>) | 673–676 |
| `seriesDayItems` | [backend-node/src/routes/team-board.ts](<../../../backend-node/src/routes/team-board.ts>) | 679–702 |
| `registerTeamBoardRoutes` | [backend-node/src/routes/team-board.ts](<../../../backend-node/src/routes/team-board.ts>) | 704–926 |

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
