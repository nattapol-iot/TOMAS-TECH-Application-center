# Download Center

[Context index](../../../AGENTS.md) · [Architecture](../ARCHITECTURE.md) · [Change guide](../WORKFLOW.md)

โปรแกรมและไฟล์ของแผนกจากโฟลเดอร์ download-center บน NAS และ Repository source code ของแต่ละโครงการ (tree โค้ด README ประวัติ zip) จำนวนครั้งที่ดาวน์โหลด และ Skill Hub ติดตั้ง skill ของ Claude Code / Codex

Evidence: snapshot `f6cd0d36`; source map, not a live availability claim. Test candidates use filename matching and are not exhaustive coverage.

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
| `errorText` | [app/system/production/SourceRepositories.tsx](<../../../app/system/production/SourceRepositories.tsx>) | 22–24 |
| `formatRepositorySize` | [app/system/production/SourceRepositories.tsx](<../../../app/system/production/SourceRepositories.tsx>) | 26–31 |
| `projectLabel` | [app/system/production/SourceRepositories.tsx](<../../../app/system/production/SourceRepositories.tsx>) | 33–36 |
| `readPreference` | [app/system/production/SourceRepositories.tsx](<../../../app/system/production/SourceRepositories.tsx>) | 49–59 |
| `writePreference` | [app/system/production/SourceRepositories.tsx](<../../../app/system/production/SourceRepositories.tsx>) | 60–62 |
| `copyText` | [app/system/production/SourceRepositories.tsx](<../../../app/system/production/SourceRepositories.tsx>) | 64–66 |
| `SourceRepositories` | [app/system/production/SourceRepositories.tsx](<../../../app/system/production/SourceRepositories.tsx>) | 69–194 |
| `RepositoryRow` | [app/system/production/SourceRepositories.tsx](<../../../app/system/production/SourceRepositories.tsx>) | 196–238 |
| `ProjectPicker` | [app/system/production/SourceRepositories.tsx](<../../../app/system/production/SourceRepositories.tsx>) | 240–263 |
| `CreateRepositoryModal` | [app/system/production/SourceRepositories.tsx](<../../../app/system/production/SourceRepositories.tsx>) | 265–299 |
| `RepositoryView` | [app/system/production/SourceRepositories.tsx](<../../../app/system/production/SourceRepositories.tsx>) | 301–435 |
| `Breadcrumb` | [app/system/production/SourceRepositories.tsx](<../../../app/system/production/SourceRepositories.tsx>) | 437–450 |
| `TreePanel` | [app/system/production/SourceRepositories.tsx](<../../../app/system/production/SourceRepositories.tsx>) | 452–562 |
| `BlobPanel` | [app/system/production/SourceRepositories.tsx](<../../../app/system/production/SourceRepositories.tsx>) | 564–626 |
| `CommandBlock` | [app/system/production/SourceRepositories.tsx](<../../../app/system/production/SourceRepositories.tsx>) | 629–640 |
| `QuickSetup` | [app/system/production/SourceRepositories.tsx](<../../../app/system/production/SourceRepositories.tsx>) | 643–660 |
| `HistoryPanel` | [app/system/production/SourceRepositories.tsx](<../../../app/system/production/SourceRepositories.tsx>) | 662–692 |
| `UploadModal` | [app/system/production/SourceRepositories.tsx](<../../../app/system/production/SourceRepositories.tsx>) | 694–772 |
| `EditRepositoryModal` | [app/system/production/SourceRepositories.tsx](<../../../app/system/production/SourceRepositories.tsx>) | 774–806 |
| `Markdown` | [app/system/production/SourceRepositories.tsx](<../../../app/system/production/SourceRepositories.tsx>) | 809–855 |
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
- [app/system/dialogs.ts](<../../../app/system/dialogs.ts>)
- [app/system/screen-link.ts](<../../../app/system/screen-link.ts>)

## Candidate regression tests

- [backend-node/tests/download-center.test.ts](<../../../backend-node/tests/download-center.test.ts>)
- [backend-node/tests/skill-hub.test.ts](<../../../backend-node/tests/skill-hub.test.ts>)
- [backend-node/tests/source-repositories.test.ts](<../../../backend-node/tests/source-repositories.test.ts>)
- [backend-node/tests/tmthub-repositories.test.ts](<../../../backend-node/tests/tmthub-repositories.test.ts>)

## Client contract lookup

Search the selected API path or function in [app/system/api-client.ts](<../../../app/system/api-client.ts>); follow its screen callers. Common UI/language changes require [app/system/ui.tsx](<../../../app/system/ui.tsx>) and [app/system/i18n.ts](<../../../app/system/i18n.ts>). For SQL changes use [schema map](../SCHEMA.md).
