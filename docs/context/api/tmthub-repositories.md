# tmthub-repositories

[Module](../modules/downloads.md) · [Index](../../../AGENTS.md)

Evidence: source snapshot `87e54075`; generated, do not edit. [backend-node/src/routes/tmthub-repositories.ts](<../../../backend-node/src/routes/tmthub-repositories.ts>). Ranges are hints: search symbol after edits.

## API operations

| Method | Path | Source lines |
|---|---|---|
| GET | `/api/v1/download-center/repositories` | 201–213 |
| POST | `/api/v1/download-center/repositories` | 215–233 |
| GET | `/api/v1/download-center/repositories/:repo` | 235–260 |
| PATCH | `/api/v1/download-center/repositories/:repo` | 262–279 |
| DELETE | `/api/v1/download-center/repositories/:repo` | 281–288 |
| GET | `/api/v1/download-center/repositories/:repo/tree` | 295–316 |
| GET | `/api/v1/download-center/repositories/:repo/blob` | 318–329 |
| GET | `/api/v1/download-center/repositories/:repo/raw` | 344–344 |
| HEAD | `/api/v1/download-center/repositories/:repo/raw` | 345–345 |
| GET | `/api/v1/download-center/repositories/:repo/archive` | 360–360 |
| HEAD | `/api/v1/download-center/repositories/:repo/archive` | 361–361 |
| POST | `/api/v1/download-center/repositories/:repo/upload` | 364–422 |
| DELETE | `/api/v1/download-center/repositories/:repo/files` | 424–442 |

## Named functions

| Symbol | Source | Lines |
|---|---|---|
| `projectIdFromTopics` | [backend-node/src/routes/tmthub-repositories.ts](<../../../backend-node/src/routes/tmthub-repositories.ts>) | 45–51 |
| `encodePath` | [backend-node/src/routes/tmthub-repositories.ts](<../../../backend-node/src/routes/tmthub-repositories.ts>) | 53–55 |
| `createHubClient` | [backend-node/src/routes/tmthub-repositories.ts](<../../../backend-node/src/routes/tmthub-repositories.ts>) | 57–141 |
| `authorOf` | [backend-node/src/routes/tmthub-repositories.ts](<../../../backend-node/src/routes/tmthub-repositories.ts>) | 145–147 |
| `pipeDownload` | [backend-node/src/routes/tmthub-repositories.ts](<../../../backend-node/src/routes/tmthub-repositories.ts>) | 150–160 |
| `registerTmthubRepositoryRoutes` | [backend-node/src/routes/tmthub-repositories.ts](<../../../backend-node/src/routes/tmthub-repositories.ts>) | 162–443 |

## Direct local dependencies

- [backend-node/src/config.ts](<../../../backend-node/src/config.ts>)
- [backend-node/src/db.ts](<../../../backend-node/src/db.ts>)
- [backend-node/src/errors.ts](<../../../backend-node/src/errors.ts>)
- [backend-node/src/document-storage.ts](<../../../backend-node/src/document-storage.ts>)
- [backend-node/src/types.ts](<../../../backend-node/src/types.ts>)
- [backend-node/src/users.ts](<../../../backend-node/src/users.ts>)
- [backend-node/src/routes/source-repositories.ts](<../../../backend-node/src/routes/source-repositories.ts>)

## SQL references (literal scan, not a complete schema or write-set)

No literal dbo reference in this file; follow dependencies.

## Change boundary

Read the selected handler and helpers it calls, then its caller in api-client.ts. Verify permission checks, record scope, transaction, rowVersion and audit on that path; a route name alone does not prove authorization. Dynamic routes/SQL, helper side effects and runtime config require source inspection.
