# historical-pr

[Module](../modules/procurement.md) · [Index](../../../AGENTS.md)

Evidence: source snapshot `543450fe`; generated, do not edit. [backend-node/src/routes/historical-pr.ts](<../../../backend-node/src/routes/historical-pr.ts>). Ranges are hints: search symbol after edits.

## API operations

| Method | Path | Source lines |
|---|---|---|


## Named functions

| Symbol | Source | Lines |
|---|---|---|
| `normalize` | [backend-node/src/routes/historical-pr.ts](<../../../backend-node/src/routes/historical-pr.ts>) | 16–16 |
| `publicRow` | [backend-node/src/routes/historical-pr.ts](<../../../backend-node/src/routes/historical-pr.ts>) | 18–20 |
| `registerHistoricalPrRoutes` | [backend-node/src/routes/historical-pr.ts](<../../../backend-node/src/routes/historical-pr.ts>) | 22–196 |

## Direct local dependencies

- [backend-node/src/audit.ts](<../../../backend-node/src/audit.ts>)
- [backend-node/src/db.ts](<../../../backend-node/src/db.ts>)
- [backend-node/src/users.ts](<../../../backend-node/src/users.ts>)
- [backend-node/src/types.ts](<../../../backend-node/src/types.ts>)
- [backend-node/src/errors.ts](<../../../backend-node/src/errors.ts>)
- [backend-node/src/http.ts](<../../../backend-node/src/http.ts>)
- [backend-node/src/project-scope.ts](<../../../backend-node/src/project-scope.ts>)
- [backend-node/src/historical-pr.ts](<../../../backend-node/src/historical-pr.ts>)

## SQL references (literal scan, not a complete schema or write-set)

`dbo.cost_items`, `dbo.estimates`, `dbo.historical_pr_imports`, `dbo.project_members`, `dbo.projects`, `dbo.users`

## Change boundary

Read the selected handler and helpers it calls, then its caller in api-client.ts. Verify permission checks, record scope, transaction, rowVersion and audit on that path; a route name alone does not prove authorization. Dynamic routes/SQL, helper side effects and runtime config require source inspection.
