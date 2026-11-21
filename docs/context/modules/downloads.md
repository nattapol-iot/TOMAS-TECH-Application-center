# Download Center

[Context index](../../../AGENTS.md) · [Architecture](../ARCHITECTURE.md) · [Change guide](../WORKFLOW.md)

โปรแกรมและไฟล์ของแผนกจากโฟลเดอร์ download-center บน NAS และ Repository source code ของแต่ละโครงการ (tree โค้ด README ประวัติ zip) จำนวนครั้งที่ดาวน์โหลด และ Skill Hub ติดตั้ง skill ของ Claude Code / Codex

Evidence: snapshot `df74958e`; source map, not a live availability claim. Test candidates use filename matching and are not exhaustive coverage.

## Read only the operation you change

- [download-center API and function map](../api/download-center.md) — registered in Node app
- [source-repositories API and function map](../api/source-repositories.md) — registered in Node app
- [tmthub-repositories API and function map](../api/tmthub-repositories.md) — registered in Node app
- [skill-hub API and function map](../api/skill-hub.md) — registered in Node app

## UI function locator

Shared screens contain other modules: use the symbol and line range instead of reading the whole file.

| Symbol | Source | Lines |
|---|---|---|
| `formatSize` | [app/system/production/DownloadCenterScreen.tsx](<../../../app/system/production/DownloadCenterScreen.tsx>) | 16–21 |
| `matches` | [app/system/production/DownloadCenterScreen.tsx](<../../../app/system/production/DownloadCenterScreen.tsx>) | 23–27 |
| `loadErrorText` | [app/system/production/DownloadCenterScreen.tsx](<../../../app/system/production/DownloadCenterScreen.tsx>) | 30–34 |
| `DownloadCenterScreen` | [app/system/production/DownloadCenterScreen.tsx](<../../../app/system/production/DownloadCenterScreen.tsx>) | 41–167 |
| `errorText` | [app/system/production/SourceRepositories.tsx](<../../../app/system/production/SourceRepositories.tsx>) | 23–25 |
| `formatRepositorySize` | [app/system/production/SourceRepositories.tsx](<../../../app/system/production/SourceRepositories.tsx>) | 27–32 |
| `projectLabel` | [app/system/production/SourceRepositories.tsx](<../../../app/system/production/SourceRepositories.tsx>) | 34–37 |
| `readPreference` | [app/system/production/SourceRepositories.tsx](<../../../app/system/production/SourceRepositories.tsx>) | 50–60 |
| `writePreference` | [app/system/production/SourceRepositories.tsx](<../../../app/system/production/SourceRepositories.tsx>) | 61–63 |
| `copyText` | [app/system/production/SourceRepositories.tsx](<../../../app/system/production/SourceRepositories.tsx>) | 65–67 |
| `SourceRepositories` | [app/system/production/SourceRepositories.tsx](<../../../app/system/production/SourceRepositories.tsx>) | 70–195 |
| `RepositoryRow` | [app/system/production/SourceRepositories.tsx](<../../../app/system/production/SourceRepositories.tsx>) | 197–239 |
| `ProjectPicker` | [app/system/production/SourceRepositories.tsx](<../../../app/system/production/SourceRepositories.tsx>) | 241–264 |
| `CreateRepositoryModal` | [app/system/production/SourceRepositories.tsx](<../../../app/system/production/SourceRepositories.tsx>) | 266–308 |
| `RepositoryView` | [app/system/production/SourceRepositories.tsx](<../../../app/system/production/SourceRepositories.tsx>) | 310–444 |
| `Breadcrumb` | [app/system/production/SourceRepositories.tsx](<../../../app/system/production/SourceRepositories.tsx>) | 446–459 |
| `TreePanel` | [app/system/production/SourceRepositories.tsx](<../../../app/system/production/SourceRepositories.tsx>) | 461–571 |
| `BlobPanel` | [app/system/production/SourceRepositories.tsx](<../../../app/system/production/SourceRepositories.tsx>) | 573–635 |
| `CommandBlock` | [app/system/production/SourceRepositories.tsx](<../../../app/system/production/SourceRepositories.tsx>) | 638–649 |
| `QuickSetup` | [app/system/production/SourceRepositories.tsx](<../../../app/system/production/SourceRepositories.tsx>) | 652–669 |
| `HistoryPanel` | [app/system/production/SourceRepositories.tsx](<../../../app/system/production/SourceRepositories.tsx>) | 671–701 |
| `UploadModal` | [app/system/production/SourceRepositories.tsx](<../../../app/system/production/SourceRepositories.tsx>) | 703–786 |
| `EditRepositoryModal` | [app/system/production/SourceRepositories.tsx](<../../../app/system/production/SourceRepositories.tsx>) | 788–820 |
| `Markdown` | [app/system/production/SourceRepositories.tsx](<../../../app/system/production/SourceRepositories.tsx>) | 823–869 |
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
- [app/system/production/pegasus-skin.css](<../../../app/system/production/pegasus-skin.css>)
- [app/system/production/pegasus-screens.css](<../../../app/system/production/pegasus-screens.css>)
- [app/system/dialogs.ts](<../../../app/system/dialogs.ts>)
- [app/system/screen-link.ts](<../../../app/system/screen-link.ts>)
- [app/system/production/form-bubbles.ts](<../../../app/system/production/form-bubbles.ts>)

## Candidate regression tests

- [backend-node/tests/download-center.test.ts](<../../../backend-node/tests/download-center.test.ts>)
- [backend-node/tests/skill-hub.test.ts](<../../../backend-node/tests/skill-hub.test.ts>)
- [backend-node/tests/source-repositories.test.ts](<../../../backend-node/tests/source-repositories.test.ts>)
- [backend-node/tests/tmthub-repositories.test.ts](<../../../backend-node/tests/tmthub-repositories.test.ts>)

## Client contract lookup

Search the selected API path or function in [app/system/api-client.ts](<../../../app/system/api-client.ts>); follow its screen callers. Common UI/language changes require [app/system/ui.tsx](<../../../app/system/ui.tsx>) and [app/system/i18n.ts](<../../../app/system/i18n.ts>). For SQL changes use [schema map](../SCHEMA.md).
