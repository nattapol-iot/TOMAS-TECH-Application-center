# issue-batches

[Module](../modules/planning.md) · [Index](../../../AGENTS.md)

Evidence: source snapshot `6a4fff66`; generated, do not edit. [backend-node/src/routes/issue-batches.ts](<../../../backend-node/src/routes/issue-batches.ts>). Ranges are hints: search symbol after edits.

## API operations

| Method | Path | Source lines |
|---|---|---|
| GET | `/api/v1/issue-batches` | 278–303 |
| GET | `/api/v1/issue-batches/:id` | 305–309 |
| POST | `/api/v1/issue-batches` | 311–339 |
| PUT | `/api/v1/issue-batches/:id` | 341–369 |
| POST | `/api/v1/issue-batches/:id/items` | 371–390 |
| PUT | `/api/v1/issue-items/:id` | 392–420 |
| POST | `/api/v1/issue-items/:id/:action` | 422–481 |
| POST | `/api/v1/issue-items/:id/images` | 483–522 |
| GET | `/api/v1/issue-items/:id/images/:imageId/content` | 524–538 |
| DELETE | `/api/v1/issue-items/:id/images/:imageId` | 540–557 |
| GET | `/api/v1/me/issues` | 560–586 |
| GET | `/api/v1/projects/:projectId/issues` | 589–598 |

## Named functions

| Symbol | Source | Lines |
|---|---|---|
| `num` | [backend-node/src/routes/issue-batches.ts](<../../../backend-node/src/routes/issue-batches.ts>) | 111–111 |
| `str` | [backend-node/src/routes/issue-batches.ts](<../../../backend-node/src/routes/issue-batches.ts>) | 112–112 |
| `version` | [backend-node/src/routes/issue-batches.ts](<../../../backend-node/src/routes/issue-batches.ts>) | 113–113 |
| `escapeLike` | [backend-node/src/routes/issue-batches.ts](<../../../backend-node/src/routes/issue-batches.ts>) | 114–114 |
| `batchDto` | [backend-node/src/routes/issue-batches.ts](<../../../backend-node/src/routes/issue-batches.ts>) | 116–127 |
| `listDto` | [backend-node/src/routes/issue-batches.ts](<../../../backend-node/src/routes/issue-batches.ts>) | 129–136 |
| `itemDto` | [backend-node/src/routes/issue-batches.ts](<../../../backend-node/src/routes/issue-batches.ts>) | 138–150 |
| `imageDto` | [backend-node/src/routes/issue-batches.ts](<../../../backend-node/src/routes/issue-batches.ts>) | 153–156 |
| `batchProject` | [backend-node/src/routes/issue-batches.ts](<../../../backend-node/src/routes/issue-batches.ts>) | 159–160 |
| `sameVersion` | [backend-node/src/routes/issue-batches.ts](<../../../backend-node/src/routes/issue-batches.ts>) | 163–167 |
| `registerIssueBatchRoutes` | [backend-node/src/routes/issue-batches.ts](<../../../backend-node/src/routes/issue-batches.ts>) | 169–599 |

## Direct local dependencies

- [backend-node/src/config.ts](<../../../backend-node/src/config.ts>)
- [backend-node/src/db.ts](<../../../backend-node/src/db.ts>)
- [backend-node/src/document-storage.ts](<../../../backend-node/src/document-storage.ts>)
- [backend-node/src/errors.ts](<../../../backend-node/src/errors.ts>)
- [backend-node/src/http.ts](<../../../backend-node/src/http.ts>)
- [backend-node/src/audit.ts](<../../../backend-node/src/audit.ts>)
- [backend-node/src/project-scope.ts](<../../../backend-node/src/project-scope.ts>)
- [backend-node/src/schedule-service.ts](<../../../backend-node/src/schedule-service.ts>)
- [backend-node/src/types.ts](<../../../backend-node/src/types.ts>)
- [backend-node/src/users.ts](<../../../backend-node/src/users.ts>)
- [backend-node/src/issue-batches.ts](<../../../backend-node/src/issue-batches.ts>)

## SQL references (literal scan, not a complete schema or write-set)

`dbo.customers`, `dbo.issue_batches`, `dbo.issue_item_images`, `dbo.issue_items`, `dbo.project_members`, `dbo.projects`, `dbo.users`

## Change boundary

Read the selected handler and helpers it calls, then its caller in api-client.ts. Verify permission checks, record scope, transaction, rowVersion and audit on that path; a route name alone does not prove authorization. Dynamic routes/SQL, helper side effects and runtime config require source inspection.
