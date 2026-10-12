# source-repositories

[Module](../modules/downloads.md) · [Index](../../../AGENTS.md)

Evidence: source snapshot `87e54075`; generated, do not edit. [backend-node/src/routes/source-repositories.ts](<../../../backend-node/src/routes/source-repositories.ts>). Ranges are hints: search symbol after edits.

## API operations

| Method | Path | Source lines |
|---|---|---|
| GET | `/api/v1/download-center/repositories` | 368–387 |
| POST | `/api/v1/download-center/repositories` | 389–412 |
| GET | `/api/v1/download-center/repositories/:repo` | 414–420 |
| PATCH | `/api/v1/download-center/repositories/:repo` | 422–431 |
| DELETE | `/api/v1/download-center/repositories/:repo` | 433–444 |
| GET | `/api/v1/download-center/repositories/:repo/tree` | 446–458 |
| GET | `/api/v1/download-center/repositories/:repo/blob` | 473–480 |
| GET | `/api/v1/download-center/repositories/:repo/raw` | 497–497 |
| HEAD | `/api/v1/download-center/repositories/:repo/raw` | 498–498 |
| GET | `/api/v1/download-center/repositories/:repo/archive` | 540–540 |
| HEAD | `/api/v1/download-center/repositories/:repo/archive` | 541–541 |
| POST | `/api/v1/download-center/repositories/:repo/upload` | 547–604 |
| DELETE | `/api/v1/download-center/repositories/:repo/files` | 606–623 |

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
| `listZipEntries` | [backend-node/src/routes/source-repositories.ts](<../../../backend-node/src/routes/source-repositories.ts>) | 221–254 |
| `readZipEntries` | [backend-node/src/routes/source-repositories.ts](<../../../backend-node/src/routes/source-repositories.ts>) | 257–266 |
| `batchZipEntries` | [backend-node/src/routes/source-repositories.ts](<../../../backend-node/src/routes/source-repositories.ts>) | 269–284 |
| `planZipExtraction` | [backend-node/src/routes/source-repositories.ts](<../../../backend-node/src/routes/source-repositories.ts>) | 287–290 |
| `repositoryUploadLimit` | [backend-node/src/routes/source-repositories.ts](<../../../backend-node/src/routes/source-repositories.ts>) | 293–295 |
| `loadProjects` | [backend-node/src/routes/source-repositories.ts](<../../../backend-node/src/routes/source-repositories.ts>) | 299–307 |
| `registerSourceRepositoryRoutes` | [backend-node/src/routes/source-repositories.ts](<../../../backend-node/src/routes/source-repositories.ts>) | 309–624 |

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
