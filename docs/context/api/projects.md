# projects

[Module](../modules/projects.md) · [Index](../../../AGENTS.md)

Evidence: source snapshot `9ed694e3`; generated, do not edit. [backend-node/src/routes/projects.ts](<../../../backend-node/src/routes/projects.ts>). Ranges are hints: search symbol after edits.

## API operations

| Method | Path | Source lines |
|---|---|---|
| GET | `/api/v1/projects` | 46–82 |
| POST | `/api/v1/projects` | 84–191 |
| GET | `/api/v1/projects/:id/members` | 193–218 |
| POST | `/api/v1/projects/:id/members` | 220–243 |
| DELETE | `/api/v1/projects/:id/members/:userId` | 245–266 |
| PUT | `/api/v1/projects/:id` | 268–366 |

## Named functions

| Symbol | Source | Lines |
|---|---|---|
| `businessToday` | [backend-node/src/routes/projects.ts](<../../../backend-node/src/routes/projects.ts>) | 31–35 |
| `shiftDate` | [backend-node/src/routes/projects.ts](<../../../backend-node/src/routes/projects.ts>) | 37–42 |
| `registerProjectRoutes` | [backend-node/src/routes/projects.ts](<../../../backend-node/src/routes/projects.ts>) | 44–367 |

## Direct local dependencies

- [backend-node/src/config.ts](<../../../backend-node/src/config.ts>)
- [backend-node/src/audit.ts](<../../../backend-node/src/audit.ts>)
- [backend-node/src/db.ts](<../../../backend-node/src/db.ts>)
- [backend-node/src/document-storage.ts](<../../../backend-node/src/document-storage.ts>)
- [backend-node/src/project-handover.ts](<../../../backend-node/src/project-handover.ts>)
- [backend-node/src/document-number.ts](<../../../backend-node/src/document-number.ts>)
- [backend-node/src/errors.ts](<../../../backend-node/src/errors.ts>)
- [backend-node/src/estimate-total-guard.ts](<../../../backend-node/src/estimate-total-guard.ts>)
- [backend-node/src/end-user.ts](<../../../backend-node/src/end-user.ts>)
- [backend-node/src/http.ts](<../../../backend-node/src/http.ts>)
- [backend-node/src/project-lifecycle.ts](<../../../backend-node/src/project-lifecycle.ts>)
- [backend-node/src/project-scope.ts](<../../../backend-node/src/project-scope.ts>)
- [backend-node/src/users.ts](<../../../backend-node/src/users.ts>)

## SQL references (literal scan, not a complete schema or write-set)

`dbo.customers`, `dbo.estimates`, `dbo.inquiries`, `dbo.project_folders`, `dbo.project_members`, `dbo.projects`, `dbo.roles`, `dbo.users`

## Change boundary

Read the selected handler and helpers it calls, then its caller in api-client.ts. Verify permission checks, record scope, transaction, rowVersion and audit on that path; a route name alone does not prove authorization. Dynamic routes/SQL, helper side effects and runtime config require source inspection.
