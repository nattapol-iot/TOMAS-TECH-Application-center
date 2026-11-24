# download-center

[Module](../modules/downloads.md) · [Index](../../../AGENTS.md)

Evidence: source snapshot `6fa18e02`; generated, do not edit. [backend-node/src/routes/download-center.ts](<../../../backend-node/src/routes/download-center.ts>). Ranges are hints: search symbol after edits.

## API operations

| Method | Path | Source lines |
|---|---|---|
| GET | `/api/v1/download-center` | 186–199 |
| GET | `/api/v1/download-center/content` | 264–264 |
| HEAD | `/api/v1/download-center/content` | 265–265 |

## Named functions

| Symbol | Source | Lines |
|---|---|---|
| `isPublishedName` | [backend-node/src/routes/download-center.ts](<../../../backend-node/src/routes/download-center.ts>) | 54–58 |
| `text` | [backend-node/src/routes/download-center.ts](<../../../backend-node/src/routes/download-center.ts>) | 60–62 |
| `order` | [backend-node/src/routes/download-center.ts](<../../../backend-node/src/routes/download-center.ts>) | 64–66 |
| `parseFolderInfo` | [backend-node/src/routes/download-center.ts](<../../../backend-node/src/routes/download-center.ts>) | 69–90 |
| `readInfo` | [backend-node/src/routes/download-center.ts](<../../../backend-node/src/routes/download-center.ts>) | 92–98 |
| `readDownloadCatalog` | [backend-node/src/routes/download-center.ts](<../../../backend-node/src/routes/download-center.ts>) | 104–160 |
| `parseByteRange` | [backend-node/src/routes/download-center.ts](<../../../backend-node/src/routes/download-center.ts>) | 163–180 |
| `registerDownloadCenterRoutes` | [backend-node/src/routes/download-center.ts](<../../../backend-node/src/routes/download-center.ts>) | 182–266 |

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
