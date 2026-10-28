# Site Monitor

[Context index](../../../AGENTS.md) · [Architecture](../ARCHITECTURE.md) · [Change guide](../WORKFLOW.md)

สถานะโปรแกรม resource และ log ที่ TMT Control Panel (agent) ส่งมา สั่ง start/stop/restart และแจ้งเมลผู้ดูแลลำดับ 1-2-3

Evidence: snapshot `89e3c066`; source map, not a live availability claim. Test candidates use filename matching and are not exhaustive coverage.

## Read only the operation you change

- [site-monitor API and function map](../api/site-monitor.md) — registered in Node app
- [release-deployments API and function map](../api/release-deployments.md) — registered in Node app

## UI function locator

Shared screens contain other modules: use the symbol and line range instead of reading the whole file.

| Symbol | Source | Lines |
|---|---|---|
| `siteHealth` | [app/system/production/SiteMonitorScreen.tsx](<../../../app/system/production/SiteMonitorScreen.tsx>) | 32–38 |
| `errorText` | [app/system/production/SiteMonitorScreen.tsx](<../../../app/system/production/SiteMonitorScreen.tsx>) | 40–42 |
| `formatBytes` | [app/system/production/SiteMonitorScreen.tsx](<../../../app/system/production/SiteMonitorScreen.tsx>) | 44–51 |
| `percentText` | [app/system/production/SiteMonitorScreen.tsx](<../../../app/system/production/SiteMonitorScreen.tsx>) | 53–55 |
| `useDuration` | [app/system/production/SiteMonitorScreen.tsx](<../../../app/system/production/SiteMonitorScreen.tsx>) | 58–72 |
| `minutesText` | [app/system/production/SiteMonitorScreen.tsx](<../../../app/system/production/SiteMonitorScreen.tsx>) | 74–76 |
| `relativeTime` | [app/system/production/SiteMonitorScreen.tsx](<../../../app/system/production/SiteMonitorScreen.tsx>) | 79–90 |
| `useDateTime` | [app/system/production/SiteMonitorScreen.tsx](<../../../app/system/production/SiteMonitorScreen.tsx>) | 92–96 |
| `tmtdeskIdText` | [app/system/production/SiteMonitorScreen.tsx](<../../../app/system/production/SiteMonitorScreen.tsx>) | 99–101 |
| `tmtdeskLink` | [app/system/production/SiteMonitorScreen.tsx](<../../../app/system/production/SiteMonitorScreen.tsx>) | 104–106 |
| `internalServerUrl` | [app/system/production/SiteMonitorScreen.tsx](<../../../app/system/production/SiteMonitorScreen.tsx>) | 109–112 |
| `SiteMonitorScreen` | [app/system/production/SiteMonitorScreen.tsx](<../../../app/system/production/SiteMonitorScreen.tsx>) | 116–145 |
| `SiteOverview` | [app/system/production/SiteMonitorScreen.tsx](<../../../app/system/production/SiteMonitorScreen.tsx>) | 149–252 |
| `SiteDetailView` | [app/system/production/SiteMonitorScreen.tsx](<../../../app/system/production/SiteMonitorScreen.tsx>) | 261–677 |
| `BackLink` | [app/system/production/SiteMonitorScreen.tsx](<../../../app/system/production/SiteMonitorScreen.tsx>) | 680–686 |
| `LogsPanel` | [app/system/production/SiteMonitorScreen.tsx](<../../../app/system/production/SiteMonitorScreen.tsx>) | 693–790 |
| `ConfirmModal` | [app/system/production/SiteMonitorScreen.tsx](<../../../app/system/production/SiteMonitorScreen.tsx>) | 794–808 |
| `AddMachineModal` | [app/system/production/SiteMonitorScreen.tsx](<../../../app/system/production/SiteMonitorScreen.tsx>) | 810–839 |
| `TmtdeskIdModal` | [app/system/production/SiteMonitorScreen.tsx](<../../../app/system/production/SiteMonitorScreen.tsx>) | 841–871 |
| `AgentKeyModal` | [app/system/production/SiteMonitorScreen.tsx](<../../../app/system/production/SiteMonitorScreen.tsx>) | 873–916 |
| `SiteEditorModal` | [app/system/production/SiteMonitorScreen.tsx](<../../../app/system/production/SiteMonitorScreen.tsx>) | 918–1012 |
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
