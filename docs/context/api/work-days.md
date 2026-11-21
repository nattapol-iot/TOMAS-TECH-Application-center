# work-days

[Module](../modules/planning.md) · [Index](../../../AGENTS.md)

Evidence: source snapshot `878a3653`; generated, do not edit. [backend-node/src/routes/work-days.ts](<../../../backend-node/src/routes/work-days.ts>). Ranges are hints: search symbol after edits.

## API operations

| Method | Path | Source lines |
|---|---|---|
| GET | `/api/v1/me/work-days` | 197–205 |
| PUT | `/api/v1/me/work-days/:date` | 207–224 |
| POST | `/api/v1/me/work-days/confirm` | 226–246 |

## Named functions

| Symbol | Source | Lines |
|---|---|---|
| `text` | [backend-node/src/routes/work-days.ts](<../../../backend-node/src/routes/work-days.ts>) | 73–73 |
| `optionalId` | [backend-node/src/routes/work-days.ts](<../../../backend-node/src/routes/work-days.ts>) | 74–74 |
| `day` | [backend-node/src/routes/work-days.ts](<../../../backend-node/src/routes/work-days.ts>) | 75–75 |
| `iso` | [backend-node/src/routes/work-days.ts](<../../../backend-node/src/routes/work-days.ts>) | 76–76 |
| `kindOfKey` | [backend-node/src/routes/work-days.ts](<../../../backend-node/src/routes/work-days.ts>) | 81–82 |
| `byKind` | [backend-node/src/routes/work-days.ts](<../../../backend-node/src/routes/work-days.ts>) | 85–87 |
| `workDaysRead` | [backend-node/src/routes/work-days.ts](<../../../backend-node/src/routes/work-days.ts>) | 90–131 |
| `readWorkDays` | [backend-node/src/routes/work-days.ts](<../../../backend-node/src/routes/work-days.ts>) | 133–143 |
| `rowDto` | [backend-node/src/routes/work-days.ts](<../../../backend-node/src/routes/work-days.ts>) | 145–148 |
| `workDaysResponse` | [backend-node/src/routes/work-days.ts](<../../../backend-node/src/routes/work-days.ts>) | 150–168 |
| `saveDay` | [backend-node/src/routes/work-days.ts](<../../../backend-node/src/routes/work-days.ts>) | 181–186 |
| `parseConfirmDates` | [backend-node/src/routes/work-days.ts](<../../../backend-node/src/routes/work-days.ts>) | 189–194 |
| `registerWorkDayRoutes` | [backend-node/src/routes/work-days.ts](<../../../backend-node/src/routes/work-days.ts>) | 196–247 |

## Direct local dependencies

- [backend-node/src/db.ts](<../../../backend-node/src/db.ts>)
- [backend-node/src/errors.ts](<../../../backend-node/src/errors.ts>)
- [backend-node/src/http.ts](<../../../backend-node/src/http.ts>)
- [backend-node/src/issue-batches.ts](<../../../backend-node/src/issue-batches.ts>)
- [backend-node/src/resource-workload.ts](<../../../backend-node/src/resource-workload.ts>)
- [backend-node/src/users.ts](<../../../backend-node/src/users.ts>)
- [backend-node/src/work-days.ts](<../../../backend-node/src/work-days.ts>)

## SQL references (literal scan, not a complete schema or write-set)

`dbo.engineer_availability`, `dbo.holidays`, `dbo.issue_batches`, `dbo.issue_items`, `dbo.outlook_events`, `dbo.project_members`, `dbo.projects`, `dbo.team_task_assignees`, `dbo.team_tasks`, `dbo.work_days`, `dbo.work_hours`

## Change boundary

Read the selected handler and helpers it calls, then its caller in api-client.ts. Verify permission checks, record scope, transaction, rowVersion and audit on that path; a route name alone does not prove authorization. Dynamic routes/SQL, helper side effects and runtime config require source inspection.
