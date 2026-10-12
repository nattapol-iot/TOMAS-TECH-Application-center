# tmthub-repositories

[Module](../modules/downloads.md) · [Index](../../../AGENTS.md)

Evidence: source snapshot `fa2a9ed3`; generated, do not edit. [backend-node/src/routes/tmthub-repositories.ts](<../../../backend-node/src/routes/tmthub-repositories.ts>). Ranges are hints: search symbol after edits.

## API operations

| Method | Path | Source lines |
|---|---|---|
| GET | `/api/v1/download-center/repositories` | 198–209 |
| POST | `/api/v1/download-center/repositories` | 211–229 |
| GET | `/api/v1/download-center/repositories/:repo` | 231–255 |
| PATCH | `/api/v1/download-center/repositories/:repo` | 257–274 |
| DELETE | `/api/v1/download-center/repositories/:repo` | 276–283 |
| GET | `/api/v1/download-center/repositories/:repo/tree` | 290–311 |
| GET | `/api/v1/download-center/repositories/:repo/blob` | 313–324 |
| GET | `/api/v1/download-center/repositories/:repo/raw` | 339–339 |
| HEAD | `/api/v1/download-center/repositories/:repo/raw` | 340–340 |
| GET | `/api/v1/download-center/repositories/:repo/archive` | 355–355 |
| HEAD | `/api/v1/download-center/repositories/:repo/archive` | 356–356 |
| POST | `/api/v1/download-center/repositories/:repo/upload` | 359–407 |
| DELETE | `/api/v1/download-center/repositories/:repo/files` | 409–427 |

## Named functions

| Symbol | Source | Lines |
|---|---|---|
| `projectIdFromTopics` | [backend-node/src/routes/tmthub-repositories.ts](<../../../backend-node/src/routes/tmthub-repositories.ts>) | 42–48 |
| `encodePath` | [backend-node/src/routes/tmthub-repositories.ts](<../../../backend-node/src/routes/tmthub-repositories.ts>) | 50–52 |
| `createHubClient` | [backend-node/src/routes/tmthub-repositories.ts](<../../../backend-node/src/routes/tmthub-repositories.ts>) | 54–138 |
| `authorOf` | [backend-node/src/routes/tmthub-repositories.ts](<../../../backend-node/src/routes/tmthub-repositories.ts>) | 142–144 |
| `pipeDownload` | [backend-node/src/routes/tmthub-repositories.ts](<../../../backend-node/src/routes/tmthub-repositories.ts>) | 147–157 |
| `registerTmthubRepositoryRoutes` | [backend-node/src/routes/tmthub-repositories.ts](<../../../backend-node/src/routes/tmthub-repositories.ts>) | 159–428 |

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
