# activity

[Module](../modules/performance.md) · [Index](../../../AGENTS.md)

Evidence: source snapshot `a56a7c23`; generated, do not edit. [backend-node/src/routes/activity.ts](<../../../backend-node/src/routes/activity.ts>). Ranges are hints: search symbol after edits.

## API operations

| Method | Path | Source lines |
|---|---|---|
| POST | `/api/v1/activity/presence` | 159–191 |
| GET | `/api/v1/activity/meta` | 192–222 |
| GET | `/api/v1/activity/overview` | 223–267 |
| GET | `/api/v1/activity/members/:id` | 268–282 |
| POST | `/api/v1/activity/rules` | 283–325 |
| POST | `/api/v1/activity/rules/:id/stop` | 326–350 |
| POST | `/api/v1/activity/reports` | 351–408 |
| POST | `/api/v1/activity/exceptions` | 409–438 |
| POST | `/api/v1/activity/quality` | 439–484 |
| POST | `/api/v1/activity/clarifications` | 485–497 |
| POST | `/api/v1/activity/cycle-policy` | 498–521 |

## Named functions

| Symbol | Source | Lines |
|---|---|---|
| `positiveId` | [backend-node/src/routes/activity.ts](<../../../backend-node/src/routes/activity.ts>) | 28–28 |
| `invalid` | [backend-node/src/routes/activity.ts](<../../../backend-node/src/routes/activity.ts>) | 29–29 |
| `missing` | [backend-node/src/routes/activity.ts](<../../../backend-node/src/routes/activity.ts>) | 30–30 |
| `textDate` | [backend-node/src/routes/activity.ts](<../../../backend-node/src/routes/activity.ts>) | 31–31 |
| `periodDays` | [backend-node/src/routes/activity.ts](<../../../backend-node/src/routes/activity.ts>) | 32–32 |
| `uuid` | [backend-node/src/routes/activity.ts](<../../../backend-node/src/routes/activity.ts>) | 33–37 |
| `registerActivityRoutes` | [backend-node/src/routes/activity.ts](<../../../backend-node/src/routes/activity.ts>) | 114–522 |

## Direct local dependencies

- [backend-node/src/db.ts](<../../../backend-node/src/db.ts>)
- [backend-node/src/users.ts](<../../../backend-node/src/users.ts>)
- [backend-node/src/errors.ts](<../../../backend-node/src/errors.ts>)
- [backend-node/src/user-roles.ts](<../../../backend-node/src/user-roles.ts>)
- [backend-node/src/performance-framework.ts](<../../../backend-node/src/performance-framework.ts>)
- [backend-node/src/team-scope.ts](<../../../backend-node/src/team-scope.ts>)
- [backend-node/src/http.ts](<../../../backend-node/src/http.ts>)
- [backend-node/src/audit.ts](<../../../backend-node/src/audit.ts>)
- [backend-node/src/activity-rules.ts](<../../../backend-node/src/activity-rules.ts>)
- [backend-node/src/activity-service.ts](<../../../backend-node/src/activity-service.ts>)
- [backend-node/src/types.ts](<../../../backend-node/src/types.ts>)

## SQL references (literal scan, not a complete schema or write-set)

`dbo.activity_clarifications`, `dbo.activity_cycle_policies`, `dbo.activity_events`, `dbo.activity_exceptions`, `dbo.activity_quality`, `dbo.activity_rules`, `dbo.activity_sessions`, `dbo.activity_settings`, `dbo.inquiries`, `dbo.kpi_review_cycles`, `dbo.projects`, `dbo.resource_tasks`, `dbo.schedule_task_pics`, `dbo.schedule_tasks`, `dbo.users`

## Change boundary

Read the selected handler and helpers it calls, then its caller in api-client.ts. Verify permission checks, record scope, transaction, rowVersion and audit on that path; a route name alone does not prove authorization. Dynamic routes/SQL, helper side effects and runtime config require source inspection.
