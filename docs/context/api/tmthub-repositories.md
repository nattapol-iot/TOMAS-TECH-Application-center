# tmthub-repositories

[Module](../modules/downloads.md) · [Index](../../../AGENTS.md)

Evidence: source snapshot `8f4da29c`; generated, do not edit. [backend-node/src/routes/tmthub-repositories.ts](<../../../backend-node/src/routes/tmthub-repositories.ts>). Ranges are hints: search symbol after edits.

## API operations

| Method | Path | Source lines |
|---|---|---|
| GET | `/api/v1/download-center/repositories` | 223–235 |
| POST | `/api/v1/download-center/repositories` | 237–255 |
| GET | `/api/v1/download-center/repositories/:repo` | 257–282 |
| PATCH | `/api/v1/download-center/repositories/:repo` | 284–301 |
| DELETE | `/api/v1/download-center/repositories/:repo` | 303–310 |
| GET | `/api/v1/download-center/repositories/:repo/tree` | 317–338 |
| GET | `/api/v1/download-center/repositories/:repo/blob` | 340–351 |
| GET | `/api/v1/download-center/repositories/:repo/raw` | 366–366 |
| HEAD | `/api/v1/download-center/repositories/:repo/raw` | 367–367 |
| GET | `/api/v1/download-center/repositories/:repo/archive` | 382–382 |
| HEAD | `/api/v1/download-center/repositories/:repo/archive` | 383–383 |
| POST | `/api/v1/download-center/repositories/:repo/upload` | 386–444 |
| DELETE | `/api/v1/download-center/repositories/:repo/files` | 446–464 |

## Named functions

| Symbol | Source | Lines |
|---|---|---|
| `projectIdFromTopics` | [backend-node/src/routes/tmthub-repositories.ts](<../../../backend-node/src/routes/tmthub-repositories.ts>) | 49–55 |
| `encodePath` | [backend-node/src/routes/tmthub-repositories.ts](<../../../backend-node/src/routes/tmthub-repositories.ts>) | 57–59 |
| `createHubClient` | [backend-node/src/routes/tmthub-repositories.ts](<../../../backend-node/src/routes/tmthub-repositories.ts>) | 61–163 |
| `authorOf` | [backend-node/src/routes/tmthub-repositories.ts](<../../../backend-node/src/routes/tmthub-repositories.ts>) | 167–169 |
| `pipeDownload` | [backend-node/src/routes/tmthub-repositories.ts](<../../../backend-node/src/routes/tmthub-repositories.ts>) | 172–182 |
| `registerTmthubRepositoryRoutes` | [backend-node/src/routes/tmthub-repositories.ts](<../../../backend-node/src/routes/tmthub-repositories.ts>) | 184–465 |

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
