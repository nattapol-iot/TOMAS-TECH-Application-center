# Site Monitor

[Context index](../../../AGENTS.md) · [Architecture](../ARCHITECTURE.md) · [Change guide](../WORKFLOW.md)

สถานะโปรแกรม resource และ log ที่ TMT Control Panel (agent) ส่งมา สั่ง start/stop/restart และแจ้งเมลผู้ดูแลลำดับ 1-2-3

Evidence: snapshot `4a0666d4`; source map, not a live availability claim. Test candidates use filename matching and are not exhaustive coverage.

## Read only the operation you change

- [site-monitor API and function map](../api/site-monitor.md) — registered in Node app
- [release-deployments API and function map](../api/release-deployments.md) — registered in Node app

## UI function locator

Shared screens contain other modules: use the symbol and line range instead of reading the whole file.

| Symbol | Source | Lines |
|---|---|---|
| `siteHealth` | [app/system/production/SiteMonitorScreen.tsx](<../../../app/system/production/SiteMonitorScreen.tsx>) | 33–39 |
| `errorText` | [app/system/production/SiteMonitorScreen.tsx](<../../../app/system/production/SiteMonitorScreen.tsx>) | 41–43 |
| `formatBytes` | [app/system/production/SiteMonitorScreen.tsx](<../../../app/system/production/SiteMonitorScreen.tsx>) | 45–52 |
| `percentText` | [app/system/production/SiteMonitorScreen.tsx](<../../../app/system/production/SiteMonitorScreen.tsx>) | 54–56 |
| `useDuration` | [app/system/production/SiteMonitorScreen.tsx](<../../../app/system/production/SiteMonitorScreen.tsx>) | 59–73 |
| `minutesText` | [app/system/production/SiteMonitorScreen.tsx](<../../../app/system/production/SiteMonitorScreen.tsx>) | 75–77 |
| `relativeTime` | [app/system/production/SiteMonitorScreen.tsx](<../../../app/system/production/SiteMonitorScreen.tsx>) | 80–91 |
| `useDateTime` | [app/system/production/SiteMonitorScreen.tsx](<../../../app/system/production/SiteMonitorScreen.tsx>) | 93–97 |
| `tmtdeskIdText` | [app/system/production/SiteMonitorScreen.tsx](<../../../app/system/production/SiteMonitorScreen.tsx>) | 100–102 |
| `tmtdeskLink` | [app/system/production/SiteMonitorScreen.tsx](<../../../app/system/production/SiteMonitorScreen.tsx>) | 105–107 |
| `internalServerUrl` | [app/system/production/SiteMonitorScreen.tsx](<../../../app/system/production/SiteMonitorScreen.tsx>) | 110–113 |
| `SiteMonitorScreen` | [app/system/production/SiteMonitorScreen.tsx](<../../../app/system/production/SiteMonitorScreen.tsx>) | 117–146 |
| `SiteOverview` | [app/system/production/SiteMonitorScreen.tsx](<../../../app/system/production/SiteMonitorScreen.tsx>) | 150–253 |
| `SiteDetailView` | [app/system/production/SiteMonitorScreen.tsx](<../../../app/system/production/SiteMonitorScreen.tsx>) | 262–678 |
| `BackLink` | [app/system/production/SiteMonitorScreen.tsx](<../../../app/system/production/SiteMonitorScreen.tsx>) | 681–687 |
| `LogsPanel` | [app/system/production/SiteMonitorScreen.tsx](<../../../app/system/production/SiteMonitorScreen.tsx>) | 694–791 |
| `ConfirmModal` | [app/system/production/SiteMonitorScreen.tsx](<../../../app/system/production/SiteMonitorScreen.tsx>) | 795–809 |
| `AddMachineModal` | [app/system/production/SiteMonitorScreen.tsx](<../../../app/system/production/SiteMonitorScreen.tsx>) | 811–840 |
| `TmtdeskIdModal` | [app/system/production/SiteMonitorScreen.tsx](<../../../app/system/production/SiteMonitorScreen.tsx>) | 842–872 |
| `AgentKeyModal` | [app/system/production/SiteMonitorScreen.tsx](<../../../app/system/production/SiteMonitorScreen.tsx>) | 874–917 |
| `SiteEditorModal` | [app/system/production/SiteMonitorScreen.tsx](<../../../app/system/production/SiteMonitorScreen.tsx>) | 919–1013 |
| `errorText` | [app/system/production/MonitorDeployments.tsx](<../../../app/system/production/MonitorDeployments.tsx>) | 19–21 |
| `formatSize` | [app/system/production/MonitorDeployments.tsx](<../../../app/system/production/MonitorDeployments.tsx>) | 23–27 |
| `DeploymentsPanel` | [app/system/production/MonitorDeployments.tsx](<../../../app/system/production/MonitorDeployments.tsx>) | 33–101 |
| `DecisionModal` | [app/system/production/MonitorDeployments.tsx](<../../../app/system/production/MonitorDeployments.tsx>) | 103–144 |
| `DeployModal` | [app/system/production/MonitorDeployments.tsx](<../../../app/system/production/MonitorDeployments.tsx>) | 147–274 |

## Domain helpers / direct dependencies

- [backend-node/src/document-storage.ts](<../../../backend-node/src/document-storage.ts>)
- [backend-node/src/email.ts](<../../../backend-node/src/email.ts>)
- [backend-node/src/routes/download-center.ts](<../../../backend-node/src/routes/download-center.ts>)
- [backend-node/src/rate-limits.ts](<../../../backend-node/src/rate-limits.ts>)
- [backend-node/src/site-monitor.ts](<../../../backend-node/src/site-monitor.ts>)
- [backend-node/src/release-deployment.ts](<../../../backend-node/src/release-deployment.ts>)
- [backend-node/src/schedule-service.ts](<../../../backend-node/src/schedule-service.ts>)
- [backend-node/src/site-visit-common.ts](<../../../backend-node/src/site-visit-common.ts>)
- [backend-node/src/routes/tmthub-repositories.ts](<../../../backend-node/src/routes/tmthub-repositories.ts>)
- [app/system/screen-link.ts](<../../../app/system/screen-link.ts>)
- [app/system/api-client.ts](<../../../app/system/api-client.ts>)
- [app/system/api-origin.ts](<../../../app/system/api-origin.ts>)
- [app/system/i18n.ts](<../../../app/system/i18n.ts>)
- [app/system/LocalizedText.tsx](<../../../app/system/LocalizedText.tsx>)
- [app/system/ui.tsx](<../../../app/system/ui.tsx>)
- [app/system/production/MonitorDeployments.tsx](<../../../app/system/production/MonitorDeployments.tsx>)

## Candidate regression tests

- [backend-node/tests/release-deployment.test.ts](<../../../backend-node/tests/release-deployment.test.ts>)
- [backend-node/tests/site-monitor-public-host.test.ts](<../../../backend-node/tests/site-monitor-public-host.test.ts>)
- [backend-node/tests/site-monitor.test.ts](<../../../backend-node/tests/site-monitor.test.ts>)

## Client contract lookup

Search the selected API path or function in [app/system/api-client.ts](<../../../app/system/api-client.ts>); follow its screen callers. Common UI/language changes require [app/system/ui.tsx](<../../../app/system/ui.tsx>) and [app/system/i18n.ts](<../../../app/system/i18n.ts>). For SQL changes use [schema map](../SCHEMA.md).
