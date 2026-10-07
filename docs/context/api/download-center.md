# download-center

[Module](../modules/downloads.md) · [Index](../../../AGENTS.md)

Evidence: source snapshot `c2f7d169`; generated, do not edit. [backend-node/src/routes/download-center.ts](<../../../backend-node/src/routes/download-center.ts>). Ranges are hints: search symbol after edits.

## API operations

| Method | Path | Source lines |
|---|---|---|
| GET | `/api/v1/download-center` | 177–180 |
| GET | `/api/v1/download-center/content` | 230–230 |
| HEAD | `/api/v1/download-center/content` | 231–231 |

## Named functions

| Symbol | Source | Lines |
|---|---|---|
| `isPublishedName` | [backend-node/src/routes/download-center.ts](<../../../backend-node/src/routes/download-center.ts>) | 53–57 |
| `text` | [backend-node/src/routes/download-center.ts](<../../../backend-node/src/routes/download-center.ts>) | 59–61 |
| `order` | [backend-node/src/routes/download-center.ts](<../../../backend-node/src/routes/download-center.ts>) | 63–65 |
| `parseFolderInfo` | [backend-node/src/routes/download-center.ts](<../../../backend-node/src/routes/download-center.ts>) | 68–89 |
| `readInfo` | [backend-node/src/routes/download-center.ts](<../../../backend-node/src/routes/download-center.ts>) | 91–97 |
| `readDownloadCatalog` | [backend-node/src/routes/download-center.ts](<../../../backend-node/src/routes/download-center.ts>) | 100–151 |
| `parseByteRange` | [backend-node/src/routes/download-center.ts](<../../../backend-node/src/routes/download-center.ts>) | 154–171 |
| `registerDownloadCenterRoutes` | [backend-node/src/routes/download-center.ts](<../../../backend-node/src/routes/download-center.ts>) | 173–232 |

## Direct local dependencies

- [backend-node/src/config.ts](<../../../backend-node/src/config.ts>)
- [backend-node/src/db.ts](<../../../backend-node/src/db.ts>)
- [backend-node/src/errors.ts](<../../../backend-node/src/errors.ts>)
- [backend-node/src/document-storage.ts](<../../../backend-node/src/document-storage.ts>)
- [backend-node/src/users.ts](<../../../backend-node/src/users.ts>)

## SQL references (literal scan, not a complete schema or write-set)

No literal dbo reference in this file; follow dependencies.

## Change boundary

Read the selected handler and helpers it calls, then its caller in api-client.ts. Verify permission checks, record scope, transaction, rowVersion and audit on that path; a route name alone does not prove authorization. Dynamic routes/SQL, helper side effects and runtime config require source inspection.
