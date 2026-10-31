# Download Center

[Context index](../../../AGENTS.md) · [Architecture](../ARCHITECTURE.md) · [Change guide](../WORKFLOW.md)

โปรแกรมและไฟล์ของแผนกจากโฟลเดอร์ download-center บน NAS และ Repository source code ของแต่ละโครงการ (tree โค้ด README ประวัติ zip) จำนวนครั้งที่ดาวน์โหลด และ Skill Hub ติดตั้ง skill ของ Claude Code / Codex

Evidence: snapshot `4a0666d4`; source map, not a live availability claim. Test candidates use filename matching and are not exhaustive coverage.

## Read only the operation you change

- [download-center API and function map](../api/download-center.md) — registered in Node app
- [source-repositories API and function map](../api/source-repositories.md) — registered in Node app
- [tmthub-repositories API and function map](../api/tmthub-repositories.md) — registered in Node app
- [skill-hub API and function map](../api/skill-hub.md) — registered in Node app

## UI function locator

Shared screens contain other modules: use the symbol and line range instead of reading the whole file.

| Symbol | Source | Lines |
|---|---|---|
| `formatSize` | [app/system/production/DownloadCenterScreen.tsx](<../../../app/system/production/DownloadCenterScreen.tsx>) | 13–18 |
| `matches` | [app/system/production/DownloadCenterScreen.tsx](<../../../app/system/production/DownloadCenterScreen.tsx>) | 20–24 |
| `DownloadCenterScreen` | [app/system/production/DownloadCenterScreen.tsx](<../../../app/system/production/DownloadCenterScreen.tsx>) | 31–154 |
| `errorText` | [app/system/production/SourceRepositories.tsx](<../../../app/system/production/SourceRepositories.tsx>) | 21–23 |
| `formatRepositorySize` | [app/system/production/SourceRepositories.tsx](<../../../app/system/production/SourceRepositories.tsx>) | 25–30 |
| `projectLabel` | [app/system/production/SourceRepositories.tsx](<../../../app/system/production/SourceRepositories.tsx>) | 32–35 |
| `readPreference` | [app/system/production/SourceRepositories.tsx](<../../../app/system/production/SourceRepositories.tsx>) | 48–58 |
| `writePreference` | [app/system/production/SourceRepositories.tsx](<../../../app/system/production/SourceRepositories.tsx>) | 59–61 |
| `copyText` | [app/system/production/SourceRepositories.tsx](<../../../app/system/production/SourceRepositories.tsx>) | 63–65 |
| `SourceRepositories` | [app/system/production/SourceRepositories.tsx](<../../../app/system/production/SourceRepositories.tsx>) | 68–193 |
| `RepositoryRow` | [app/system/production/SourceRepositories.tsx](<../../../app/system/production/SourceRepositories.tsx>) | 195–237 |
| `ProjectPicker` | [app/system/production/SourceRepositories.tsx](<../../../app/system/production/SourceRepositories.tsx>) | 239–262 |
| `CreateRepositoryModal` | [app/system/production/SourceRepositories.tsx](<../../../app/system/production/SourceRepositories.tsx>) | 264–298 |
| `RepositoryView` | [app/system/production/SourceRepositories.tsx](<../../../app/system/production/SourceRepositories.tsx>) | 300–434 |
| `Breadcrumb` | [app/system/production/SourceRepositories.tsx](<../../../app/system/production/SourceRepositories.tsx>) | 436–449 |
| `TreePanel` | [app/system/production/SourceRepositories.tsx](<../../../app/system/production/SourceRepositories.tsx>) | 451–561 |
| `BlobPanel` | [app/system/production/SourceRepositories.tsx](<../../../app/system/production/SourceRepositories.tsx>) | 563–625 |
| `CommandBlock` | [app/system/production/SourceRepositories.tsx](<../../../app/system/production/SourceRepositories.tsx>) | 628–639 |
| `QuickSetup` | [app/system/production/SourceRepositories.tsx](<../../../app/system/production/SourceRepositories.tsx>) | 642–659 |
| `HistoryPanel` | [app/system/production/SourceRepositories.tsx](<../../../app/system/production/SourceRepositories.tsx>) | 661–691 |
| `UploadModal` | [app/system/production/SourceRepositories.tsx](<../../../app/system/production/SourceRepositories.tsx>) | 693–771 |
| `EditRepositoryModal` | [app/system/production/SourceRepositories.tsx](<../../../app/system/production/SourceRepositories.tsx>) | 773–805 |
| `Markdown` | [app/system/production/SourceRepositories.tsx](<../../../app/system/production/SourceRepositories.tsx>) | 808–854 |
| `SkillCard` | [app/system/production/SkillHub.tsx](<../../../app/system/production/SkillHub.tsx>) | 10–47 |
| `SkillHub` | [app/system/production/SkillHub.tsx](<../../../app/system/production/SkillHub.tsx>) | 49–79 |

## Domain helpers / direct dependencies

- [backend-node/src/document-storage.ts](<../../../backend-node/src/document-storage.ts>)
- [backend-node/src/routes/source-repositories.ts](<../../../backend-node/src/routes/source-repositories.ts>)
- [app/system/api-client.ts](<../../../app/system/api-client.ts>)
- [app/system/i18n.ts](<../../../app/system/i18n.ts>)
- [app/system/LocalizedText.tsx](<../../../app/system/LocalizedText.tsx>)
- [app/system/ui.tsx](<../../../app/system/ui.tsx>)
- [app/system/production/SourceRepositories.tsx](<../../../app/system/production/SourceRepositories.tsx>)
- [app/system/production/SkillHub.tsx](<../../../app/system/production/SkillHub.tsx>)
- [app/system/screen-link.ts](<../../../app/system/screen-link.ts>)

## Candidate regression tests

- [backend-node/tests/download-center.test.ts](<../../../backend-node/tests/download-center.test.ts>)
- [backend-node/tests/skill-hub.test.ts](<../../../backend-node/tests/skill-hub.test.ts>)
- [backend-node/tests/source-repositories.test.ts](<../../../backend-node/tests/source-repositories.test.ts>)
- [backend-node/tests/tmthub-repositories.test.ts](<../../../backend-node/tests/tmthub-repositories.test.ts>)

## Client contract lookup

Search the selected API path or function in [app/system/api-client.ts](<../../../app/system/api-client.ts>); follow its screen callers. Common UI/language changes require [app/system/ui.tsx](<../../../app/system/ui.tsx>) and [app/system/i18n.ts](<../../../app/system/i18n.ts>). For SQL changes use [schema map](../SCHEMA.md).
