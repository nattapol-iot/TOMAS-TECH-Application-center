# Site Monitor

[Context index](../../../AGENTS.md) · [Architecture](../ARCHITECTURE.md) · [Change guide](../WORKFLOW.md)

สถานะโปรแกรม resource และ log ที่ TMT Control Panel (agent) ส่งมา สั่ง start/stop/restart และแจ้งเมลผู้ดูแลลำดับ 1-2-3

Evidence: snapshot `564bcc7d`; source map, not a live availability claim. Test candidates use filename matching and are not exhaustive coverage.

## Read only the operation you change

- [site-monitor API and function map](../api/site-monitor.md) — registered in Node app

## UI function locator

Shared screens contain other modules: use the symbol and line range instead of reading the whole file.

| Symbol | Source | Lines |
|---|---|---|
| `siteHealth` | [app/system/production/SiteMonitorScreen.tsx](<../../../app/system/production/SiteMonitorScreen.tsx>) | 31–37 |
| `errorText` | [app/system/production/SiteMonitorScreen.tsx](<../../../app/system/production/SiteMonitorScreen.tsx>) | 39–41 |
| `formatBytes` | [app/system/production/SiteMonitorScreen.tsx](<../../../app/system/production/SiteMonitorScreen.tsx>) | 43–50 |
| `percentText` | [app/system/production/SiteMonitorScreen.tsx](<../../../app/system/production/SiteMonitorScreen.tsx>) | 52–54 |
| `useDuration` | [app/system/production/SiteMonitorScreen.tsx](<../../../app/system/production/SiteMonitorScreen.tsx>) | 57–71 |
| `minutesText` | [app/system/production/SiteMonitorScreen.tsx](<../../../app/system/production/SiteMonitorScreen.tsx>) | 73–75 |
| `relativeTime` | [app/system/production/SiteMonitorScreen.tsx](<../../../app/system/production/SiteMonitorScreen.tsx>) | 78–89 |
| `useDateTime` | [app/system/production/SiteMonitorScreen.tsx](<../../../app/system/production/SiteMonitorScreen.tsx>) | 91–95 |
| `serverUrl` | [app/system/production/SiteMonitorScreen.tsx](<../../../app/system/production/SiteMonitorScreen.tsx>) | 97–100 |
| `SiteMonitorScreen` | [app/system/production/SiteMonitorScreen.tsx](<../../../app/system/production/SiteMonitorScreen.tsx>) | 104–126 |
| `SiteOverview` | [app/system/production/SiteMonitorScreen.tsx](<../../../app/system/production/SiteMonitorScreen.tsx>) | 130–233 |
| `SiteDetailView` | [app/system/production/SiteMonitorScreen.tsx](<../../../app/system/production/SiteMonitorScreen.tsx>) | 242–628 |
| `BackLink` | [app/system/production/SiteMonitorScreen.tsx](<../../../app/system/production/SiteMonitorScreen.tsx>) | 631–637 |
| `LogsPanel` | [app/system/production/SiteMonitorScreen.tsx](<../../../app/system/production/SiteMonitorScreen.tsx>) | 644–741 |
| `ConfirmModal` | [app/system/production/SiteMonitorScreen.tsx](<../../../app/system/production/SiteMonitorScreen.tsx>) | 745–759 |
| `AddMachineModal` | [app/system/production/SiteMonitorScreen.tsx](<../../../app/system/production/SiteMonitorScreen.tsx>) | 761–790 |
| `AgentKeyModal` | [app/system/production/SiteMonitorScreen.tsx](<../../../app/system/production/SiteMonitorScreen.tsx>) | 792–825 |
| `SiteEditorModal` | [app/system/production/SiteMonitorScreen.tsx](<../../../app/system/production/SiteMonitorScreen.tsx>) | 827–921 |

## Domain helpers / direct dependencies

- [backend-node/src/email.ts](<../../../backend-node/src/email.ts>)
- [backend-node/src/site-monitor.ts](<../../../backend-node/src/site-monitor.ts>)
- [app/system/api-client.ts](<../../../app/system/api-client.ts>)
- [app/system/api-origin.ts](<../../../app/system/api-origin.ts>)
- [app/system/i18n.ts](<../../../app/system/i18n.ts>)
- [app/system/LocalizedText.tsx](<../../../app/system/LocalizedText.tsx>)
- [app/system/ui.tsx](<../../../app/system/ui.tsx>)

## Candidate regression tests

- [backend-node/tests/site-monitor.test.ts](<../../../backend-node/tests/site-monitor.test.ts>)

## Client contract lookup

Search the selected API path or function in [app/system/api-client.ts](<../../../app/system/api-client.ts>); follow its screen callers. Common UI/language changes require [app/system/ui.tsx](<../../../app/system/ui.tsx>) and [app/system/i18n.ts](<../../../app/system/i18n.ts>). For SQL changes use [schema map](../SCHEMA.md).
