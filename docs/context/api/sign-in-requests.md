# sign-in-requests

[Module](../modules/master.md) · [Index](../../../AGENTS.md)

Evidence: source snapshot `66ad8858`; generated, do not edit. [backend-node/src/routes/sign-in-requests.ts](<../../../backend-node/src/routes/sign-in-requests.ts>). Ranges are hints: search symbol after edits.

## API operations

| Method | Path | Source lines |
|---|---|---|
| GET | `/api/v1/master/sign-in-requests` | 68–81 |
| GET | `/api/v1/master/unlinked-accounts` | 83–97 |
| DELETE | `/api/v1/master/sign-in-requests/:subject` | 100–108 |

## Named functions

| Symbol | Source | Lines |
|---|---|---|
| `iso` | [backend-node/src/routes/sign-in-requests.ts](<../../../backend-node/src/routes/sign-in-requests.ts>) | 64–64 |
| `registerSignInRequestRoutes` | [backend-node/src/routes/sign-in-requests.ts](<../../../backend-node/src/routes/sign-in-requests.ts>) | 66–109 |

## Direct local dependencies

- [backend-node/src/db.ts](<../../../backend-node/src/db.ts>)
- [backend-node/src/errors.ts](<../../../backend-node/src/errors.ts>)
- [backend-node/src/users.ts](<../../../backend-node/src/users.ts>)

## SQL references (literal scan, not a complete schema or write-set)

`dbo.activity_sessions`, `dbo.employees`, `dbo.roles`, `dbo.sign_in_requests`, `dbo.users`

## Change boundary

Read the selected handler and helpers it calls, then its caller in api-client.ts. Verify permission checks, record scope, transaction, rowVersion and audit on that path; a route name alone does not prove authorization. Dynamic routes/SQL, helper side effects and runtime config require source inspection.
