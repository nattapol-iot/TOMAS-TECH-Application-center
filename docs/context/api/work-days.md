# work-days

[Module](../modules/planning.md) · [Index](../../../AGENTS.md)

Evidence: source snapshot `2e96a4b0`; generated, do not edit. [backend-node/src/routes/work-days.ts](<../../../backend-node/src/routes/work-days.ts>). Ranges are hints: search symbol after edits.

## API operations

| Method | Path | Source lines |
|---|---|---|
| GET | `/api/v1/me/work-days` | 367–375 |
| PUT | `/api/v1/me/work-days/:date` | 377–402 |
| POST | `/api/v1/me/work-days/confirm` | 404–435 |

## Named functions

| Symbol | Source | Lines |
|---|---|---|
| `text` | [backend-node/src/routes/work-days.ts](<../../../backend-node/src/routes/work-days.ts>) | 117–117 |
| `optionalId` | [backend-node/src/routes/work-days.ts](<../../../backend-node/src/routes/work-days.ts>) | 118–118 |
| `day` | [backend-node/src/routes/work-days.ts](<../../../backend-node/src/routes/work-days.ts>) | 119–119 |
| `iso` | [backend-node/src/routes/work-days.ts](<../../../backend-node/src/routes/work-days.ts>) | 120–120 |
| `kindOfKey` | [backend-node/src/routes/work-days.ts](<../../../backend-node/src/routes/work-days.ts>) | 132–133 |
| `byKind` | [backend-node/src/routes/work-days.ts](<../../../backend-node/src/routes/work-days.ts>) | 136–140 |
| `workDaysRead` | [backend-node/src/routes/work-days.ts](<../../../backend-node/src/routes/work-days.ts>) | 143–236 |
| `readWorkDays` | [backend-node/src/routes/work-days.ts](<../../../backend-node/src/routes/work-days.ts>) | 238–250 |
| `rowDto` | [backend-node/src/routes/work-days.ts](<../../../backend-node/src/routes/work-days.ts>) | 252–264 |
| `workDaysResponse` | [backend-node/src/routes/work-days.ts](<../../../backend-node/src/routes/work-days.ts>) | 266–294 |
| `plannedRowsWorked` | [backend-node/src/routes/work-days.ts](<../../../backend-node/src/routes/work-days.ts>) | 308–317 |
| `startWorkedRows` | [backend-node/src/routes/work-days.ts](<../../../backend-node/src/routes/work-days.ts>) | 337–348 |
| `saveDay` | [backend-node/src/routes/work-days.ts](<../../../backend-node/src/routes/work-days.ts>) | 350–356 |
| `parseConfirmDates` | [backend-node/src/routes/work-days.ts](<../../../backend-node/src/routes/work-days.ts>) | 359–364 |
| `registerWorkDayRoutes` | [backend-node/src/routes/work-days.ts](<../../../backend-node/src/routes/work-days.ts>) | 366–436 |

## Direct local dependencies

- [backend-node/src/db.ts](<../../../backend-node/src/db.ts>)
- [backend-node/src/errors.ts](<../../../backend-node/src/errors.ts>)
- [backend-node/src/http.ts](<../../../backend-node/src/http.ts>)
- [backend-node/src/issue-batches.ts](<../../../backend-node/src/issue-batches.ts>)
- [backend-node/src/schedule-service.ts](<../../../backend-node/src/schedule-service.ts>)
- [backend-node/src/resource-workload.ts](<../../../backend-node/src/resource-workload.ts>)
- [backend-node/src/users.ts](<../../../backend-node/src/users.ts>)
- [backend-node/src/work-days.ts](<../../../backend-node/src/work-days.ts>)
- [backend-node/src/resource-workload.ts](<../../../backend-node/src/resource-workload.ts>)

## SQL references (literal scan, not a complete schema or write-set)

`dbo.engineer_availability`, `dbo.holidays`, `dbo.issue_batches`, `dbo.issue_items`, `dbo.outlook_event_links`, `dbo.outlook_events`, `dbo.project_members`, `dbo.projects`, `dbo.resource_tasks`, `dbo.schedule_task_pics`, `dbo.schedule_tasks`, `dbo.team_task_assignees`, `dbo.team_tasks`, `dbo.work_blocks`, `dbo.work_days`, `dbo.work_hours`

## Change boundary

Read the selected handler and helpers it calls, then its caller in api-client.ts. Verify permission checks, record scope, transaction, rowVersion and audit on that path; a route name alone does not prove authorization. Dynamic routes/SQL, helper side effects and runtime config require source inspection.
