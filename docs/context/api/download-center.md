# download-center

[Module](../modules/downloads.md) · [Index](../../../AGENTS.md)

Evidence: source snapshot `156ad7f5`; generated, do not edit. [backend-node/src/routes/download-center.ts](<../../../backend-node/src/routes/download-center.ts>). Ranges are hints: search symbol after edits.

## API operations

| Method | Path | Source lines |
|---|---|---|
| GET | `/api/v1/download-center` | 178–191 |
| GET | `/api/v1/download-center/content` | 256–256 |
| HEAD | `/api/v1/download-center/content` | 257–257 |

## Named functions

| Symbol | Source | Lines |
|---|---|---|
| `isPublishedName` | [backend-node/src/routes/download-center.ts](<../../../backend-node/src/routes/download-center.ts>) | 54–58 |
| `text` | [backend-node/src/routes/download-center.ts](<../../../backend-node/src/routes/download-center.ts>) | 60–62 |
| `order` | [backend-node/src/routes/download-center.ts](<../../../backend-node/src/routes/download-center.ts>) | 64–66 |
| `parseFolderInfo` | [backend-node/src/routes/download-center.ts](<../../../backend-node/src/routes/download-center.ts>) | 69–90 |
| `readInfo` | [backend-node/src/routes/download-center.ts](<../../../backend-node/src/routes/download-center.ts>) | 92–98 |
| `readDownloadCatalog` | [backend-node/src/routes/download-center.ts](<../../../backend-node/src/routes/download-center.ts>) | 101–152 |
| `parseByteRange` | [backend-node/src/routes/download-center.ts](<../../../backend-node/src/routes/download-center.ts>) | 155–172 |
| `registerDownloadCenterRoutes` | [backend-node/src/routes/download-center.ts](<../../../backend-node/src/routes/download-center.ts>) | 174–258 |

## Direct local dependencies

- [backend-node/src/config.ts](<../../../backend-node/src/config.ts>)
- [backend-node/src/db.ts](<../../../backend-node/src/db.ts>)
- [backend-node/src/errors.ts](<../../../backend-node/src/errors.ts>)
- [backend-node/src/document-storage.ts](<../../../backend-node/src/document-storage.ts>)
- [backend-node/src/users.ts](<../../../backend-node/src/users.ts>)

## SQL references (literal scan, not a complete schema or write-set)

`dbo.download_center_downloads`

## Change boundary

Read the selected handler and helpers it calls, then its caller in api-client.ts. Verify permission checks, record scope, transaction, rowVersion and audit on that path; a route name alone does not prove authorization. Dynamic routes/SQL, helper side effects and runtime config require source inspection.
