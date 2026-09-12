# activity

[Module](../modules/performance.md) · [Index](../../../AGENTS.md)

Evidence: source snapshot `84fdd5bc`; generated, do not edit. [backend-node/src/routes/activity.ts](<../../../backend-node/src/routes/activity.ts>). Ranges are hints: search symbol after edits.

## API operations

| Method | Path | Source lines |
|---|---|---|
| POST | `/api/v1/activity/presence` | 35–57 |
| GET | `/api/v1/activity/meta` | 58–66 |
| GET | `/api/v1/activity/overview` | 67–89 |
| GET | `/api/v1/activity/members/:id` | 90–97 |
| POST | `/api/v1/activity/rules` | 98–111 |
| POST | `/api/v1/activity/rules/:id/stop` | 112–122 |
| POST | `/api/v1/activity/reports` | 123–136 |
| POST | `/api/v1/activity/exceptions` | 137–147 |
| POST | `/api/v1/activity/quality` | 148–166 |
| POST | `/api/v1/activity/clarifications` | 167–170 |
| POST | `/api/v1/activity/cycle-policy` | 171–181 |

## Named functions

| Symbol | Source | Lines |
|---|---|---|
| `positiveId` | [backend-node/src/routes/activity.ts](<../../../backend-node/src/routes/activity.ts>) | 13–13 |
| `invalid` | [backend-node/src/routes/activity.ts](<../../../backend-node/src/routes/activity.ts>) | 14–14 |
| `missing` | [backend-node/src/routes/activity.ts](<../../../backend-node/src/routes/activity.ts>) | 15–15 |
| `textDate` | [backend-node/src/routes/activity.ts](<../../../backend-node/src/routes/activity.ts>) | 16–16 |
| `periodDays` | [backend-node/src/routes/activity.ts](<../../../backend-node/src/routes/activity.ts>) | 17–17 |
| `uuid` | [backend-node/src/routes/activity.ts](<../../../backend-node/src/routes/activity.ts>) | 18–18 |
| `registerActivityRoutes` | [backend-node/src/routes/activity.ts](<../../../backend-node/src/routes/activity.ts>) | 21–182 |

## Direct local dependencies

- [backend-node/src/db.ts](<../../../backend-node/src/db.ts>)
- [backend-node/src/users.ts](<../../../backend-node/src/users.ts>)
- [backend-node/src/errors.ts](<../../../backend-node/src/errors.ts>)
- [backend-node/src/http.ts](<../../../backend-node/src/http.ts>)
- [backend-node/src/audit.ts](<../../../backend-node/src/audit.ts>)
- [backend-node/src/activity-rules.ts](<../../../backend-node/src/activity-rules.ts>)
- [backend-node/src/activity-service.ts](<../../../backend-node/src/activity-service.ts>)
- [backend-node/src/types.ts](<../../../backend-node/src/types.ts>)

## SQL references (literal scan, not a complete schema or write-set)

`dbo.activity_clarifications`, `dbo.activity_cycle_policies`, `dbo.activity_events`, `dbo.activity_exceptions`, `dbo.activity_quality`, `dbo.activity_rules`, `dbo.activity_sessions`, `dbo.activity_settings`, `dbo.inquiries`, `dbo.kpi_review_cycles`, `dbo.projects`, `dbo.resource_tasks`, `dbo.schedule_task_pics`, `dbo.schedule_tasks`, `dbo.users`

## Change boundary

Read the selected handler and helpers it calls, then its caller in api-client.ts. Verify permission checks, record scope, transaction, rowVersion and audit on that path; a route name alone does not prove authorization. Dynamic routes/SQL, helper side effects and runtime config require source inspection.
