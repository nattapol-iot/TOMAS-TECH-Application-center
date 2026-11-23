# work-days

[Module](../modules/planning.md) · [Index](../../../AGENTS.md)

Evidence: source snapshot `f598047a`; generated, do not edit. [backend-node/src/routes/work-days.ts](<../../../backend-node/src/routes/work-days.ts>). Ranges are hints: search symbol after edits.

## API operations

| Method | Path | Source lines |
|---|---|---|
| GET | `/api/v1/me/work-days` | 322–330 |
| PUT | `/api/v1/me/work-days/:date` | 332–357 |
| POST | `/api/v1/me/work-days/confirm` | 359–390 |

## Named functions

| Symbol | Source | Lines |
|---|---|---|
| `text` | [backend-node/src/routes/work-days.ts](<../../../backend-node/src/routes/work-days.ts>) | 116–116 |
| `optionalId` | [backend-node/src/routes/work-days.ts](<../../../backend-node/src/routes/work-days.ts>) | 117–117 |
| `day` | [backend-node/src/routes/work-days.ts](<../../../backend-node/src/routes/work-days.ts>) | 118–118 |
| `iso` | [backend-node/src/routes/work-days.ts](<../../../backend-node/src/routes/work-days.ts>) | 119–119 |
| `kindOfKey` | [backend-node/src/routes/work-days.ts](<../../../backend-node/src/routes/work-days.ts>) | 131–132 |
| `byKind` | [backend-node/src/routes/work-days.ts](<../../../backend-node/src/routes/work-days.ts>) | 135–139 |
| `workDaysRead` | [backend-node/src/routes/work-days.ts](<../../../backend-node/src/routes/work-days.ts>) | 142–235 |
| `readWorkDays` | [backend-node/src/routes/work-days.ts](<../../../backend-node/src/routes/work-days.ts>) | 237–249 |
| `rowDto` | [backend-node/src/routes/work-days.ts](<../../../backend-node/src/routes/work-days.ts>) | 251–263 |
| `workDaysResponse` | [backend-node/src/routes/work-days.ts](<../../../backend-node/src/routes/work-days.ts>) | 265–293 |
| `saveDay` | [backend-node/src/routes/work-days.ts](<../../../backend-node/src/routes/work-days.ts>) | 306–311 |
| `parseConfirmDates` | [backend-node/src/routes/work-days.ts](<../../../backend-node/src/routes/work-days.ts>) | 314–319 |
| `registerWorkDayRoutes` | [backend-node/src/routes/work-days.ts](<../../../backend-node/src/routes/work-days.ts>) | 321–391 |

## Direct local dependencies

- [backend-node/src/db.ts](<../../../backend-node/src/db.ts>)
- [backend-node/src/errors.ts](<../../../backend-node/src/errors.ts>)
- [backend-node/src/http.ts](<../../../backend-node/src/http.ts>)
- [backend-node/src/issue-batches.ts](<../../../backend-node/src/issue-batches.ts>)
- [backend-node/src/resource-workload.ts](<../../../backend-node/src/resource-workload.ts>)
- [backend-node/src/users.ts](<../../../backend-node/src/users.ts>)
- [backend-node/src/work-days.ts](<../../../backend-node/src/work-days.ts>)
- [backend-node/src/resource-workload.ts](<../../../backend-node/src/resource-workload.ts>)

## SQL references (literal scan, not a complete schema or write-set)

`dbo.engineer_availability`, `dbo.holidays`, `dbo.issue_batches`, `dbo.issue_items`, `dbo.outlook_event_links`, `dbo.outlook_events`, `dbo.project_members`, `dbo.projects`, `dbo.team_task_assignees`, `dbo.team_tasks`, `dbo.work_blocks`, `dbo.work_days`, `dbo.work_hours`

## Change boundary

Read the selected handler and helpers it calls, then its caller in api-client.ts. Verify permission checks, record scope, transaction, rowVersion and audit on that path; a route name alone does not prove authorization. Dynamic routes/SQL, helper side effects and runtime config require source inspection.
