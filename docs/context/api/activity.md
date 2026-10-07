# activity

[Module](../modules/performance.md) · [Index](../../../AGENTS.md)

Evidence: source snapshot `c580425a`; generated, do not edit. [backend-node/src/routes/activity.ts](<../../../backend-node/src/routes/activity.ts>). Ranges are hints: search symbol after edits.

## API operations

| Method | Path | Source lines |
|---|---|---|
| POST | `/api/v1/activity/presence` | 41–69 |
| GET | `/api/v1/activity/meta` | 70–78 |
| GET | `/api/v1/activity/overview` | 79–101 |
| GET | `/api/v1/activity/members/:id` | 102–109 |
| POST | `/api/v1/activity/rules` | 110–123 |
| POST | `/api/v1/activity/rules/:id/stop` | 124–134 |
| POST | `/api/v1/activity/reports` | 135–148 |
| POST | `/api/v1/activity/exceptions` | 149–159 |
| POST | `/api/v1/activity/quality` | 160–178 |
| POST | `/api/v1/activity/clarifications` | 179–182 |
| POST | `/api/v1/activity/cycle-policy` | 183–193 |

## Named functions

| Symbol | Source | Lines |
|---|---|---|
| `positiveId` | [backend-node/src/routes/activity.ts](<../../../backend-node/src/routes/activity.ts>) | 14–14 |
| `invalid` | [backend-node/src/routes/activity.ts](<../../../backend-node/src/routes/activity.ts>) | 15–15 |
| `missing` | [backend-node/src/routes/activity.ts](<../../../backend-node/src/routes/activity.ts>) | 16–16 |
| `textDate` | [backend-node/src/routes/activity.ts](<../../../backend-node/src/routes/activity.ts>) | 17–17 |
| `periodDays` | [backend-node/src/routes/activity.ts](<../../../backend-node/src/routes/activity.ts>) | 18–18 |
| `uuid` | [backend-node/src/routes/activity.ts](<../../../backend-node/src/routes/activity.ts>) | 19–19 |
| `registerActivityRoutes` | [backend-node/src/routes/activity.ts](<../../../backend-node/src/routes/activity.ts>) | 27–194 |

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
