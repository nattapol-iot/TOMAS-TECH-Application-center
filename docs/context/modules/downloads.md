# Download Center

[Context index](../../../AGENTS.md) · [Architecture](../ARCHITECTURE.md) · [Change guide](../WORKFLOW.md)

โปรแกรมและไฟล์ของแผนกจากโฟลเดอร์ download-center บน NAS และ Repository source code ของแต่ละโครงการ (tree โค้ด README ประวัติ zip)

Evidence: snapshot `6aff3090`; source map, not a live availability claim. Test candidates use filename matching and are not exhaustive coverage.

## Read only the operation you change

- [download-center API and function map](../api/download-center.md) — registered in Node app
- [source-repositories API and function map](../api/source-repositories.md) — registered in Node app

## UI function locator

Shared screens contain other modules: use the symbol and line range instead of reading the whole file.

| Symbol | Source | Lines |
|---|---|---|
| `formatSize` | [app/system/production/DownloadCenterScreen.tsx](<../../../app/system/production/DownloadCenterScreen.tsx>) | 12–17 |
| `matches` | [app/system/production/DownloadCenterScreen.tsx](<../../../app/system/production/DownloadCenterScreen.tsx>) | 19–23 |
| `DownloadCenterScreen` | [app/system/production/DownloadCenterScreen.tsx](<../../../app/system/production/DownloadCenterScreen.tsx>) | 30–148 |
| `errorText` | [app/system/production/SourceRepositories.tsx](<../../../app/system/production/SourceRepositories.tsx>) | 20–22 |
| `formatRepositorySize` | [app/system/production/SourceRepositories.tsx](<../../../app/system/production/SourceRepositories.tsx>) | 24–29 |
| `projectLabel` | [app/system/production/SourceRepositories.tsx](<../../../app/system/production/SourceRepositories.tsx>) | 31–34 |
| `SourceRepositories` | [app/system/production/SourceRepositories.tsx](<../../../app/system/production/SourceRepositories.tsx>) | 37–144 |
| `ProjectPicker` | [app/system/production/SourceRepositories.tsx](<../../../app/system/production/SourceRepositories.tsx>) | 146–169 |
| `CreateRepositoryModal` | [app/system/production/SourceRepositories.tsx](<../../../app/system/production/SourceRepositories.tsx>) | 171–205 |
| `RepositoryView` | [app/system/production/SourceRepositories.tsx](<../../../app/system/production/SourceRepositories.tsx>) | 207–297 |
| `Breadcrumb` | [app/system/production/SourceRepositories.tsx](<../../../app/system/production/SourceRepositories.tsx>) | 299–312 |
| `TreePanel` | [app/system/production/SourceRepositories.tsx](<../../../app/system/production/SourceRepositories.tsx>) | 314–403 |
| `BlobPanel` | [app/system/production/SourceRepositories.tsx](<../../../app/system/production/SourceRepositories.tsx>) | 405–467 |
| `HistoryPanel` | [app/system/production/SourceRepositories.tsx](<../../../app/system/production/SourceRepositories.tsx>) | 469–496 |
| `UploadModal` | [app/system/production/SourceRepositories.tsx](<../../../app/system/production/SourceRepositories.tsx>) | 498–559 |
| `EditRepositoryModal` | [app/system/production/SourceRepositories.tsx](<../../../app/system/production/SourceRepositories.tsx>) | 561–593 |
| `Markdown` | [app/system/production/SourceRepositories.tsx](<../../../app/system/production/SourceRepositories.tsx>) | 596–642 |

## Domain helpers / direct dependencies

- [backend-node/src/document-storage.ts](<../../../backend-node/src/document-storage.ts>)
- [app/system/api-client.ts](<../../../app/system/api-client.ts>)
- [app/system/i18n.ts](<../../../app/system/i18n.ts>)
- [app/system/LocalizedText.tsx](<../../../app/system/LocalizedText.tsx>)
- [app/system/ui.tsx](<../../../app/system/ui.tsx>)
- [app/system/production/SourceRepositories.tsx](<../../../app/system/production/SourceRepositories.tsx>)

## Candidate regression tests

- [backend-node/tests/download-center.test.ts](<../../../backend-node/tests/download-center.test.ts>)
- [backend-node/tests/source-repositories.test.ts](<../../../backend-node/tests/source-repositories.test.ts>)

## Client contract lookup

Search the selected API path or function in [app/system/api-client.ts](<../../../app/system/api-client.ts>); follow its screen callers. Common UI/language changes require [app/system/ui.tsx](<../../../app/system/ui.tsx>) and [app/system/i18n.ts](<../../../app/system/i18n.ts>). For SQL changes use [schema map](../SCHEMA.md).
