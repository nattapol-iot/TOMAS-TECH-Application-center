# team-week

[Module](../modules/planning.md) · [Index](../../../AGENTS.md)

Evidence: source snapshot `19c56afd`; generated, do not edit. [backend-node/src/routes/team-week.ts](<../../../backend-node/src/routes/team-week.ts>). Ranges are hints: search symbol after edits.

## API operations

| Method | Path | Source lines |
|---|---|---|
| GET | `/api/v1/team-week` | 102–114 |

## Named functions

| Symbol | Source | Lines |
|---|---|---|
| `day` | [backend-node/src/routes/team-week.ts](<../../../backend-node/src/routes/team-week.ts>) | 45–45 |
| `text` | [backend-node/src/routes/team-week.ts](<../../../backend-node/src/routes/team-week.ts>) | 46–46 |
| `optionalId` | [backend-node/src/routes/team-week.ts](<../../../backend-node/src/routes/team-week.ts>) | 47–47 |
| `teamWeekRead` | [backend-node/src/routes/team-week.ts](<../../../backend-node/src/routes/team-week.ts>) | 50–99 |
| `registerTeamWeekRoutes` | [backend-node/src/routes/team-week.ts](<../../../backend-node/src/routes/team-week.ts>) | 101–115 |

## Direct local dependencies

- [backend-node/src/db.ts](<../../../backend-node/src/db.ts>)
- [backend-node/src/errors.ts](<../../../backend-node/src/errors.ts>)
- [backend-node/src/http.ts](<../../../backend-node/src/http.ts>)
- [backend-node/src/issue-batches.ts](<../../../backend-node/src/issue-batches.ts>)
- [backend-node/src/project-scope.ts](<../../../backend-node/src/project-scope.ts>)
- [backend-node/src/team-week.ts](<../../../backend-node/src/team-week.ts>)
- [backend-node/src/users.ts](<../../../backend-node/src/users.ts>)
- [backend-node/src/work-days.ts](<../../../backend-node/src/work-days.ts>)

## SQL references (literal scan, not a complete schema or write-set)

`dbo.engineer_availability`, `dbo.holidays`, `dbo.outlook_events`, `dbo.project_members`, `dbo.projects`, `dbo.team_task_assignees`, `dbo.team_tasks`, `dbo.users`, `dbo.work_blocks`, `dbo.work_days`, `dbo.work_hours`

## Change boundary

Read the selected handler and helpers it calls, then its caller in api-client.ts. Verify permission checks, record scope, transaction, rowVersion and audit on that path; a route name alone does not prove authorization. Dynamic routes/SQL, helper side effects and runtime config require source inspection.
