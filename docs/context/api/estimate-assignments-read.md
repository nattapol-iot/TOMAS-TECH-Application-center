# estimate-assignments-read

[Module](../modules/estimate-copy.md) · [Index](../../../AGENTS.md)

Evidence: source snapshot `543450fe`; generated, do not edit. [backend-node/src/routes/estimate-assignments-read.ts](<../../../backend-node/src/routes/estimate-assignments-read.ts>). Ranges are hints: search symbol after edits.

## API operations

| Method | Path | Source lines |
|---|---|---|
| GET | `/api/v1/me/estimate-assignments` | 27–85 |

## Named functions

| Symbol | Source | Lines |
|---|---|---|
| `registerEstimateAssignmentReadRoutes` | [backend-node/src/routes/estimate-assignments-read.ts](<../../../backend-node/src/routes/estimate-assignments-read.ts>) | 26–86 |

## Direct local dependencies

- [backend-node/src/db.ts](<../../../backend-node/src/db.ts>)
- [backend-node/src/http.ts](<../../../backend-node/src/http.ts>)
- [backend-node/src/users.ts](<../../../backend-node/src/users.ts>)

## SQL references (literal scan, not a complete schema or write-set)

`dbo.cost_items`, `dbo.customers`, `dbo.estimate_assignments`, `dbo.estimates`, `dbo.inquiries`, `dbo.users`

## Change boundary

Read the selected handler and helpers it calls, then its caller in api-client.ts. Verify permission checks, record scope, transaction, rowVersion and audit on that path; a route name alone does not prove authorization. Dynamic routes/SQL, helper side effects and runtime config require source inspection.
