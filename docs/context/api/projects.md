# projects

[Module](../modules/projects.md) · [Index](../../../AGENTS.md)

Evidence: source snapshot `93491087`; generated, do not edit. [backend-node/src/routes/projects.ts](<../../../backend-node/src/routes/projects.ts>). Ranges are hints: search symbol after edits.

## API operations

| Method | Path | Source lines |
|---|---|---|
| GET | `/api/v1/projects/creation-options` | 50–71 |
| GET | `/api/v1/projects/handover/:inquiryId` | 73–94 |
| GET | `/api/v1/projects` | 95–136 |
| POST | `/api/v1/projects` | 138–266 |
| GET | `/api/v1/projects/:id/members` | 268–293 |
| POST | `/api/v1/projects/:id/members` | 295–318 |
| DELETE | `/api/v1/projects/:id/members/:userId` | 320–341 |
| PUT | `/api/v1/projects/:id` | 343–441 |

## Named functions

| Symbol | Source | Lines |
|---|---|---|
| `businessToday` | [backend-node/src/routes/projects.ts](<../../../backend-node/src/routes/projects.ts>) | 35–39 |
| `shiftDate` | [backend-node/src/routes/projects.ts](<../../../backend-node/src/routes/projects.ts>) | 41–46 |
| `registerProjectRoutes` | [backend-node/src/routes/projects.ts](<../../../backend-node/src/routes/projects.ts>) | 48–442 |

## Direct local dependencies

- [backend-node/src/config.ts](<../../../backend-node/src/config.ts>)
- [backend-node/src/audit.ts](<../../../backend-node/src/audit.ts>)
- [backend-node/src/db.ts](<../../../backend-node/src/db.ts>)
- [backend-node/src/document-storage.ts](<../../../backend-node/src/document-storage.ts>)
- [backend-node/src/project-handover.ts](<../../../backend-node/src/project-handover.ts>)
- [backend-node/src/errors.ts](<../../../backend-node/src/errors.ts>)
- [backend-node/src/estimate-total-guard.ts](<../../../backend-node/src/estimate-total-guard.ts>)
- [backend-node/src/end-user.ts](<../../../backend-node/src/end-user.ts>)
- [backend-node/src/http.ts](<../../../backend-node/src/http.ts>)
- [backend-node/src/project-lifecycle.ts](<../../../backend-node/src/project-lifecycle.ts>)
- [backend-node/src/project-initial-plan.ts](<../../../backend-node/src/project-initial-plan.ts>)
- [backend-node/src/project-scope.ts](<../../../backend-node/src/project-scope.ts>)
- [backend-node/src/schedule-service.ts](<../../../backend-node/src/schedule-service.ts>)
- [backend-node/src/users.ts](<../../../backend-node/src/users.ts>)
- [backend-node/src/crm.ts](<../../../backend-node/src/crm.ts>)

## SQL references (literal scan, not a complete schema or write-set)

`dbo.customers`, `dbo.estimates`, `dbo.inquiries`, `dbo.project_folders`, `dbo.project_members`, `dbo.projects`, `dbo.roles`, `dbo.user_effective_permissions`, `dbo.user_effective_roles`, `dbo.users`

## Change boundary

Read the selected handler and helpers it calls, then its caller in api-client.ts. Verify permission checks, record scope, transaction, rowVersion and audit on that path; a route name alone does not prove authorization. Dynamic routes/SQL, helper side effects and runtime config require source inspection.
