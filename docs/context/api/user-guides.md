# user-guides

[Module](../modules/support.md) · [Index](../../../AGENTS.md)

Evidence: source snapshot `4a0666d4`; generated, do not edit. [backend-node/src/routes/user-guides.ts](<../../../backend-node/src/routes/user-guides.ts>). Ranges are hints: search symbol after edits.

## API operations

| Method | Path | Source lines |
|---|---|---|
| GET | `/api/v1/guides/progress` | 75–81 |
| POST | `/api/v1/guides/progress` | 83–94 |
| GET | `/api/v1/guides/team` | 96–110 |

## Named functions

| Symbol | Source | Lines |
|---|---|---|
| `guideProgressInput` | [backend-node/src/routes/user-guides.ts](<../../../backend-node/src/routes/user-guides.ts>) | 26–35 |
| `iso` | [backend-node/src/routes/user-guides.ts](<../../../backend-node/src/routes/user-guides.ts>) | 68–68 |
| `progressDto` | [backend-node/src/routes/user-guides.ts](<../../../backend-node/src/routes/user-guides.ts>) | 69–72 |
| `registerUserGuideRoutes` | [backend-node/src/routes/user-guides.ts](<../../../backend-node/src/routes/user-guides.ts>) | 74–111 |

## Direct local dependencies

- [backend-node/src/activity-service.ts](<../../../backend-node/src/activity-service.ts>)
- [backend-node/src/db.ts](<../../../backend-node/src/db.ts>)
- [backend-node/src/errors.ts](<../../../backend-node/src/errors.ts>)
- [backend-node/src/http.ts](<../../../backend-node/src/http.ts>)
- [backend-node/src/users.ts](<../../../backend-node/src/users.ts>)

## SQL references (literal scan, not a complete schema or write-set)

`dbo.user_guide_progress`

## Change boundary

Read the selected handler and helpers it calls, then its caller in api-client.ts. Verify permission checks, record scope, transaction, rowVersion and audit on that path; a route name alone does not prove authorization. Dynamic routes/SQL, helper side effects and runtime config require source inspection.
