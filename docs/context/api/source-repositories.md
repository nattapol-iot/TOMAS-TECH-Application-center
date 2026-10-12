# source-repositories

[Module](../modules/downloads.md) · [Index](../../../AGENTS.md)

Evidence: source snapshot `6aff3090`; generated, do not edit. [backend-node/src/routes/source-repositories.ts](<../../../backend-node/src/routes/source-repositories.ts>). Ranges are hints: search symbol after edits.

## API operations

| Method | Path | Source lines |
|---|---|---|
| GET | `/api/v1/download-center/repositories` | 326–345 |
| POST | `/api/v1/download-center/repositories` | 347–370 |
| GET | `/api/v1/download-center/repositories/:repo` | 372–378 |
| PATCH | `/api/v1/download-center/repositories/:repo` | 380–389 |
| DELETE | `/api/v1/download-center/repositories/:repo` | 391–402 |
| GET | `/api/v1/download-center/repositories/:repo/tree` | 404–416 |
| GET | `/api/v1/download-center/repositories/:repo/blob` | 431–438 |
| GET | `/api/v1/download-center/repositories/:repo/raw` | 455–455 |
| HEAD | `/api/v1/download-center/repositories/:repo/raw` | 456–456 |
| GET | `/api/v1/download-center/repositories/:repo/archive` | 498–498 |
| HEAD | `/api/v1/download-center/repositories/:repo/archive` | 499–499 |
| POST | `/api/v1/download-center/repositories/:repo/upload` | 505–562 |
| DELETE | `/api/v1/download-center/repositories/:repo/files` | 564–581 |

## Named functions

| Symbol | Source | Lines |
|---|---|---|
| `repositoryName` | [backend-node/src/routes/source-repositories.ts](<../../../backend-node/src/routes/source-repositories.ts>) | 53–59 |
| `isIgnoredName` | [backend-node/src/routes/source-repositories.ts](<../../../backend-node/src/routes/source-repositories.ts>) | 62–65 |
| `repositoryPath` | [backend-node/src/routes/source-repositories.ts](<../../../backend-node/src/routes/source-repositories.ts>) | 71–86 |
| `actorOf` | [backend-node/src/routes/source-repositories.ts](<../../../backend-node/src/routes/source-repositories.ts>) | 88–90 |
| `text` | [backend-node/src/routes/source-repositories.ts](<../../../backend-node/src/routes/source-repositories.ts>) | 92–94 |
| `actorValue` | [backend-node/src/routes/source-repositories.ts](<../../../backend-node/src/routes/source-repositories.ts>) | 96–99 |
| `parseRepositoryMeta` | [backend-node/src/routes/source-repositories.ts](<../../../backend-node/src/routes/source-repositories.ts>) | 102–127 |
| `writeAtomic` | [backend-node/src/routes/source-repositories.ts](<../../../backend-node/src/routes/source-repositories.ts>) | 129–145 |
| `walkFiles` | [backend-node/src/routes/source-repositories.ts](<../../../backend-node/src/routes/source-repositories.ts>) | 148–171 |
| `readTree` | [backend-node/src/routes/source-repositories.ts](<../../../backend-node/src/routes/source-repositories.ts>) | 174–203 |
| `decodeSource` | [backend-node/src/routes/source-repositories.ts](<../../../backend-node/src/routes/source-repositories.ts>) | 206–211 |
| `planZipExtraction` | [backend-node/src/routes/source-repositories.ts](<../../../backend-node/src/routes/source-repositories.ts>) | 218–253 |
| `loadProjects` | [backend-node/src/routes/source-repositories.ts](<../../../backend-node/src/routes/source-repositories.ts>) | 257–265 |
| `registerSourceRepositoryRoutes` | [backend-node/src/routes/source-repositories.ts](<../../../backend-node/src/routes/source-repositories.ts>) | 267–582 |

## Direct local dependencies

- [backend-node/src/config.ts](<../../../backend-node/src/config.ts>)
- [backend-node/src/db.ts](<../../../backend-node/src/db.ts>)
- [backend-node/src/errors.ts](<../../../backend-node/src/errors.ts>)
- [backend-node/src/document-storage.ts](<../../../backend-node/src/document-storage.ts>)
- [backend-node/src/types.ts](<../../../backend-node/src/types.ts>)
- [backend-node/src/users.ts](<../../../backend-node/src/users.ts>)

## SQL references (literal scan, not a complete schema or write-set)

`dbo.projects`

## Change boundary

Read the selected handler and helpers it calls, then its caller in api-client.ts. Verify permission checks, record scope, transaction, rowVersion and audit on that path; a route name alone does not prove authorization. Dynamic routes/SQL, helper side effects and runtime config require source inspection.
