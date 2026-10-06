# performance

[Module](../modules/performance.md) · [Index](../../../AGENTS.md)

Evidence: source snapshot `6d2356d2`; generated, do not edit. [backend-node/src/routes/performance.ts](<../../../backend-node/src/routes/performance.ts>). Ranges are hints: search symbol after edits.

## API operations

| Method | Path | Source lines |
|---|---|---|
| GET | `/api/v1/performance/overview` | 125–209 |
| GET | `/api/v1/performance/evidence/:employeeId` | 211–322 |
| POST | `/api/v1/performance/cycles` | 324–348 |
| PUT | `/api/v1/performance/assessments/:employeeId` | 350–421 |
| POST | `/api/v1/performance/assessments/:employeeId/complete` | 423–456 |

## Named functions

| Symbol | Source | Lines |
|---|---|---|
| `invalid` | [backend-node/src/routes/performance.ts](<../../../backend-node/src/routes/performance.ts>) | 81–81 |
| `cycleDto` | [backend-node/src/routes/performance.ts](<../../../backend-node/src/routes/performance.ts>) | 82–86 |
| `performanceScores` | [backend-node/src/routes/performance.ts](<../../../backend-node/src/routes/performance.ts>) | 88–104 |
| `targetRow` | [backend-node/src/routes/performance.ts](<../../../backend-node/src/routes/performance.ts>) | 106–122 |
| `registerPerformanceRoutes` | [backend-node/src/routes/performance.ts](<../../../backend-node/src/routes/performance.ts>) | 124–457 |

## Direct local dependencies

- [backend-node/src/activity-service.ts](<../../../backend-node/src/activity-service.ts>)
- [backend-node/src/activity-rules.ts](<../../../backend-node/src/activity-rules.ts>)
- [backend-node/src/audit.ts](<../../../backend-node/src/audit.ts>)
- [backend-node/src/db.ts](<../../../backend-node/src/db.ts>)
- [backend-node/src/errors.ts](<../../../backend-node/src/errors.ts>)
- [backend-node/src/user-roles.ts](<../../../backend-node/src/user-roles.ts>)
- [backend-node/src/http.ts](<../../../backend-node/src/http.ts>)
- [backend-node/src/performance-evidence.ts](<../../../backend-node/src/performance-evidence.ts>)
- [backend-node/src/performance-framework.ts](<../../../backend-node/src/performance-framework.ts>)
- [backend-node/src/team-scope.ts](<../../../backend-node/src/team-scope.ts>)
- [backend-node/src/users.ts](<../../../backend-node/src/users.ts>)

## SQL references (literal scan, not a complete schema or write-set)

`dbo.employees`, `dbo.estimates`, `dbo.inquiries`, `dbo.inquiry_meetings`, `dbo.kpi_assessment_scores`, `dbo.kpi_assessments`, `dbo.kpi_review_cycles`, `dbo.project_members`, `dbo.projects`, `dbo.resource_tasks`, `dbo.roles`, `dbo.schedule_task_pics`, `dbo.schedule_tasks`, `dbo.user_effective_roles`, `dbo.users`, `dbo.v_estimate_totals`

## Change boundary

Read the selected handler and helpers it calls, then its caller in api-client.ts. Verify permission checks, record scope, transaction, rowVersion and audit on that path; a route name alone does not prove authorization. Dynamic routes/SQL, helper side effects and runtime config require source inspection.
