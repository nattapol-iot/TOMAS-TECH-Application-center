# activity

[Module](../modules/performance.md) · [Index](../../../AGENTS.md)

Evidence: source snapshot `543450fe`; generated, do not edit. [backend-node/src/routes/activity.ts](<../../../backend-node/src/routes/activity.ts>). Ranges are hints: search symbol after edits.

## API operations

| Method | Path | Source lines |
|---|---|---|
| POST | `/api/v1/activity/presence` | 36–58 |
| GET | `/api/v1/activity/meta` | 59–67 |
| GET | `/api/v1/activity/overview` | 68–90 |
| GET | `/api/v1/activity/members/:id` | 91–98 |
| POST | `/api/v1/activity/rules` | 99–112 |
| POST | `/api/v1/activity/rules/:id/stop` | 113–123 |
| POST | `/api/v1/activity/reports` | 124–137 |
| POST | `/api/v1/activity/exceptions` | 138–148 |
| POST | `/api/v1/activity/quality` | 149–167 |
| POST | `/api/v1/activity/clarifications` | 168–171 |
| POST | `/api/v1/activity/cycle-policy` | 172–182 |

## Named functions

| Symbol | Source | Lines |
|---|---|---|
| `positiveId` | [backend-node/src/routes/activity.ts](<../../../backend-node/src/routes/activity.ts>) | 14–14 |
| `invalid` | [backend-node/src/routes/activity.ts](<../../../backend-node/src/routes/activity.ts>) | 15–15 |
| `missing` | [backend-node/src/routes/activity.ts](<../../../backend-node/src/routes/activity.ts>) | 16–16 |
| `textDate` | [backend-node/src/routes/activity.ts](<../../../backend-node/src/routes/activity.ts>) | 17–17 |
| `periodDays` | [backend-node/src/routes/activity.ts](<../../../backend-node/src/routes/activity.ts>) | 18–18 |
| `uuid` | [backend-node/src/routes/activity.ts](<../../../backend-node/src/routes/activity.ts>) | 19–19 |
| `registerActivityRoutes` | [backend-node/src/routes/activity.ts](<../../../backend-node/src/routes/activity.ts>) | 22–183 |

## Direct local dependencies

- [backend-node/src/db.ts](<../../../backend-node/src/db.ts>)
- [backend-node/src/users.ts](<../../../backend-node/src/users.ts>)
- [backend-node/src/errors.ts](<../../../backend-node/src/errors.ts>)
- [backend-node/src/user-roles.ts](<../../../backend-node/src/user-roles.ts>)
- [backend-node/src/http.ts](<../../../backend-node/src/http.ts>)
- [backend-node/src/audit.ts](<../../../backend-node/src/audit.ts>)
- [backend-node/src/activity-rules.ts](<../../../backend-node/src/activity-rules.ts>)
- [backend-node/src/activity-service.ts](<../../../backend-node/src/activity-service.ts>)
- [backend-node/src/types.ts](<../../../backend-node/src/types.ts>)

## SQL references (literal scan, not a complete schema or write-set)

`dbo.activity_clarifications`, `dbo.activity_cycle_policies`, `dbo.activity_events`, `dbo.activity_exceptions`, `dbo.activity_quality`, `dbo.activity_rules`, `dbo.activity_sessions`, `dbo.activity_settings`, `dbo.inquiries`, `dbo.kpi_review_cycles`, `dbo.projects`, `dbo.resource_tasks`, `dbo.schedule_task_pics`, `dbo.schedule_tasks`, `dbo.users`

## Change boundary

Read the selected handler and helpers it calls, then its caller in api-client.ts. Verify permission checks, record scope, transaction, rowVersion and audit on that path; a route name alone does not prove authorization. Dynamic routes/SQL, helper side effects and runtime config require source inspection.
