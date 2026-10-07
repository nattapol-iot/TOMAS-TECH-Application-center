# project-documents

[Module](../modules/projects.md) · [Index](../../../AGENTS.md)

Evidence: source snapshot `1dd38b9`; generated, do not edit. [backend-node/src/routes/project-documents.ts](<../../../backend-node/src/routes/project-documents.ts>). Ranges are hints: search symbol after edits.

## API operations

| Method | Path | Source lines |
|---|---|---|
| GET | `/api/v1/projects/:projectId/drawing-tasks` | 75–89 |
| GET | `/api/v1/projects/:projectId/documents` | 90–114 |
| POST | `/api/v1/projects/:projectId/documents` | 116–191 |
| GET | `/api/v1/projects/:projectId/documents/:documentId/content` | 193–213 |
| DELETE | `/api/v1/projects/:projectId/documents/:documentId` | 218–243 |

## Named functions

| Symbol | Source | Lines |
|---|---|---|
| `summary` | [backend-node/src/routes/project-documents.ts](<../../../backend-node/src/routes/project-documents.ts>) | 29–45 |
| `projectFolder` | [backend-node/src/routes/project-documents.ts](<../../../backend-node/src/routes/project-documents.ts>) | 47–67 |
| `registerProjectDocumentRoutes` | [backend-node/src/routes/project-documents.ts](<../../../backend-node/src/routes/project-documents.ts>) | 69–244 |

## Direct local dependencies

- [backend-node/src/config.ts](<../../../backend-node/src/config.ts>)
- [backend-node/src/db.ts](<../../../backend-node/src/db.ts>)
- [backend-node/src/document-storage.ts](<../../../backend-node/src/document-storage.ts>)
- [backend-node/src/errors.ts](<../../../backend-node/src/errors.ts>)
- [backend-node/src/http.ts](<../../../backend-node/src/http.ts>)
- [backend-node/src/schedule-service.ts](<../../../backend-node/src/schedule-service.ts>)
- [backend-node/src/project-scope.ts](<../../../backend-node/src/project-scope.ts>)
- [backend-node/src/audit.ts](<../../../backend-node/src/audit.ts>)
- [backend-node/src/types.ts](<../../../backend-node/src/types.ts>)
- [backend-node/src/users.ts](<../../../backend-node/src/users.ts>)
- [backend-node/src/drawing-workflow.ts](<../../../backend-node/src/drawing-workflow.ts>)
- [backend-node/src/user-roles.ts](<../../../backend-node/src/user-roles.ts>)

## SQL references (literal scan, not a complete schema or write-set)

`dbo.document_files`, `dbo.project_docs`, `dbo.project_folders`, `dbo.projects`, `dbo.schedule_task_pics`, `dbo.schedule_tasks`, `dbo.signature_marks`, `dbo.user_effective_permissions`, `dbo.users`, `dbo.withdraw_project_document`

## Change boundary

Read the selected handler and helpers it calls, then its caller in api-client.ts. Verify permission checks, record scope, transaction, rowVersion and audit on that path; a route name alone does not prove authorization. Dynamic routes/SQL, helper side effects and runtime config require source inspection.
