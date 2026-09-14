# project-documents

[Module](../modules/projects.md) · [Index](../../../AGENTS.md)

Evidence: source snapshot `32e38249`; generated, do not edit. [backend-node/src/routes/project-documents.ts](<../../../backend-node/src/routes/project-documents.ts>). Ranges are hints: search symbol after edits.

## API operations

| Method | Path | Source lines |
|---|---|---|
| GET | `/api/v1/projects/:projectId/drawing-tasks` | 72–86 |
| GET | `/api/v1/projects/:projectId/documents` | 87–103 |
| POST | `/api/v1/projects/:projectId/documents` | 105–175 |
| GET | `/api/v1/projects/:projectId/documents/:documentId/content` | 177–197 |

## Named functions

| Symbol | Source | Lines |
|---|---|---|
| `summary` | [backend-node/src/routes/project-documents.ts](<../../../backend-node/src/routes/project-documents.ts>) | 27–42 |
| `projectFolder` | [backend-node/src/routes/project-documents.ts](<../../../backend-node/src/routes/project-documents.ts>) | 44–64 |
| `registerProjectDocumentRoutes` | [backend-node/src/routes/project-documents.ts](<../../../backend-node/src/routes/project-documents.ts>) | 66–198 |

## Direct local dependencies

- [backend-node/src/config.ts](<../../../backend-node/src/config.ts>)
- [backend-node/src/db.ts](<../../../backend-node/src/db.ts>)
- [backend-node/src/document-storage.ts](<../../../backend-node/src/document-storage.ts>)
- [backend-node/src/errors.ts](<../../../backend-node/src/errors.ts>)
- [backend-node/src/http.ts](<../../../backend-node/src/http.ts>)
- [backend-node/src/project-scope.ts](<../../../backend-node/src/project-scope.ts>)
- [backend-node/src/audit.ts](<../../../backend-node/src/audit.ts>)
- [backend-node/src/types.ts](<../../../backend-node/src/types.ts>)
- [backend-node/src/users.ts](<../../../backend-node/src/users.ts>)
- [backend-node/src/drawing-workflow.ts](<../../../backend-node/src/drawing-workflow.ts>)

## SQL references (literal scan, not a complete schema or write-set)

`dbo.project_docs`, `dbo.project_folders`, `dbo.projects`, `dbo.schedule_task_pics`, `dbo.schedule_tasks`, `dbo.users`

## Change boundary

Read the selected handler and helpers it calls, then its caller in api-client.ts. Verify permission checks, record scope, transaction, rowVersion and audit on that path; a route name alone does not prove authorization. Dynamic routes/SQL, helper side effects and runtime config require source inspection.
