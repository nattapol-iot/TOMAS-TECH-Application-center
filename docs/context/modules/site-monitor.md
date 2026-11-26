# Site Monitor

[Context index](../../../AGENTS.md) · [Architecture](../ARCHITECTURE.md) · [Change guide](../WORKFLOW.md)

สถานะโปรแกรม resource และ log ที่ TMT Control Panel (agent) ส่งมา สั่ง start/stop/restart และแจ้งเมลผู้ดูแลลำดับ 1-2-3

Evidence: snapshot `019ed16c`; source map, not a live availability claim. Test candidates use filename matching and are not exhaustive coverage.

## Read only the operation you change

- [site-monitor API and function map](../api/site-monitor.md) — registered in Node app
- [release-deployments API and function map](../api/release-deployments.md) — registered in Node app
- [monitor-fleet API and function map](../api/monitor-fleet.md) — registered in Node app

## UI function locator

Shared screens contain other modules: use the symbol and line range instead of reading the whole file.

| Symbol | Source | Lines |
|---|---|---|
| `siteHealth` | [app/system/production/SiteMonitorScreen.tsx](<../../../app/system/production/SiteMonitorScreen.tsx>) | 35–41 |
| `errorText` | [app/system/production/SiteMonitorScreen.tsx](<../../../app/system/production/SiteMonitorScreen.tsx>) | 43–45 |
| `formatBytes` | [app/system/production/SiteMonitorScreen.tsx](<../../../app/system/production/SiteMonitorScreen.tsx>) | 47–54 |
| `percentText` | [app/system/production/SiteMonitorScreen.tsx](<../../../app/system/production/SiteMonitorScreen.tsx>) | 56–58 |
| `useDuration` | [app/system/production/SiteMonitorScreen.tsx](<../../../app/system/production/SiteMonitorScreen.tsx>) | 61–75 |
| `minutesText` | [app/system/production/SiteMonitorScreen.tsx](<../../../app/system/production/SiteMonitorScreen.tsx>) | 77–79 |
| `relativeTime` | [app/system/production/SiteMonitorScreen.tsx](<../../../app/system/production/SiteMonitorScreen.tsx>) | 82–93 |
| `useDateTime` | [app/system/production/SiteMonitorScreen.tsx](<../../../app/system/production/SiteMonitorScreen.tsx>) | 95–99 |
| `tmtdeskIdText` | [app/system/production/SiteMonitorScreen.tsx](<../../../app/system/production/SiteMonitorScreen.tsx>) | 102–104 |
| `tmtdeskLink` | [app/system/production/SiteMonitorScreen.tsx](<../../../app/system/production/SiteMonitorScreen.tsx>) | 107–109 |
| `internalServerUrl` | [app/system/production/SiteMonitorScreen.tsx](<../../../app/system/production/SiteMonitorScreen.tsx>) | 112–115 |
| `SiteMonitorScreen` | [app/system/production/SiteMonitorScreen.tsx](<../../../app/system/production/SiteMonitorScreen.tsx>) | 119–148 |
| `SiteOverview` | [app/system/production/SiteMonitorScreen.tsx](<../../../app/system/production/SiteMonitorScreen.tsx>) | 152–257 |
| `SiteDetailView` | [app/system/production/SiteMonitorScreen.tsx](<../../../app/system/production/SiteMonitorScreen.tsx>) | 266–685 |
| `BackLink` | [app/system/production/SiteMonitorScreen.tsx](<../../../app/system/production/SiteMonitorScreen.tsx>) | 688–694 |
| `LogsPanel` | [app/system/production/SiteMonitorScreen.tsx](<../../../app/system/production/SiteMonitorScreen.tsx>) | 701–798 |
| `ConfirmModal` | [app/system/production/SiteMonitorScreen.tsx](<../../../app/system/production/SiteMonitorScreen.tsx>) | 802–816 |
| `AddMachineModal` | [app/system/production/SiteMonitorScreen.tsx](<../../../app/system/production/SiteMonitorScreen.tsx>) | 818–847 |
| `TmtdeskIdModal` | [app/system/production/SiteMonitorScreen.tsx](<../../../app/system/production/SiteMonitorScreen.tsx>) | 849–879 |
| `AgentKeyModal` | [app/system/production/SiteMonitorScreen.tsx](<../../../app/system/production/SiteMonitorScreen.tsx>) | 881–924 |
| `SiteEditorModal` | [app/system/production/SiteMonitorScreen.tsx](<../../../app/system/production/SiteMonitorScreen.tsx>) | 926–1035 |
| `errorText` | [app/system/production/MonitorDeployments.tsx](<../../../app/system/production/MonitorDeployments.tsx>) | 19–21 |
| `formatSize` | [app/system/production/MonitorDeployments.tsx](<../../../app/system/production/MonitorDeployments.tsx>) | 23–27 |
| `DeploymentsPanel` | [app/system/production/MonitorDeployments.tsx](<../../../app/system/production/MonitorDeployments.tsx>) | 33–101 |
| `DecisionModal` | [app/system/production/MonitorDeployments.tsx](<../../../app/system/production/MonitorDeployments.tsx>) | 103–144 |
| `DeployModal` | [app/system/production/MonitorDeployments.tsx](<../../../app/system/production/MonitorDeployments.tsx>) | 147–274 |

## Domain helpers / direct dependencies

- [backend-node/src/document-storage.ts](<../../../backend-node/src/document-storage.ts>)
- [backend-node/src/email.ts](<../../../backend-node/src/email.ts>)
- [backend-node/src/routes/download-center.ts](<../../../backend-node/src/routes/download-center.ts>)
- [backend-node/src/monitor-alerts.ts](<../../../backend-node/src/monitor-alerts.ts>)
- [backend-node/src/rate-limits.ts](<../../../backend-node/src/rate-limits.ts>)
- [backend-node/src/site-monitor.ts](<../../../backend-node/src/site-monitor.ts>)
- [backend-node/src/release-deployment.ts](<../../../backend-node/src/release-deployment.ts>)
- [backend-node/src/schedule-service.ts](<../../../backend-node/src/schedule-service.ts>)
- [backend-node/src/site-visit-common.ts](<../../../backend-node/src/site-visit-common.ts>)
- [backend-node/src/routes/tmthub-repositories.ts](<../../../backend-node/src/routes/tmthub-repositories.ts>)
- [backend-node/src/routes/site-monitor.ts](<../../../backend-node/src/routes/site-monitor.ts>)
- [app/system/screen-link.ts](<../../../app/system/screen-link.ts>)
- [app/system/api-client.ts](<../../../app/system/api-client.ts>)
- [app/system/api-origin.ts](<../../../app/system/api-origin.ts>)
- [app/system/i18n.ts](<../../../app/system/i18n.ts>)
- [app/system/LocalizedText.tsx](<../../../app/system/LocalizedText.tsx>)
- [app/system/ui.tsx](<../../../app/system/ui.tsx>)
- [app/system/production/MonitorDeployments.tsx](<../../../app/system/production/MonitorDeployments.tsx>)
- [app/system/production/MonitorAlerts.tsx](<../../../app/system/production/MonitorAlerts.tsx>)
- [app/system/production/FleetParts.tsx](<../../../app/system/production/FleetParts.tsx>)

## Candidate regression tests

- [backend-node/tests/release-deployment.test.ts](<../../../backend-node/tests/release-deployment.test.ts>)
- [backend-node/tests/site-monitor-public-host.test.ts](<../../../backend-node/tests/site-monitor-public-host.test.ts>)
- [backend-node/tests/site-monitor.test.ts](<../../../backend-node/tests/site-monitor.test.ts>)

## Client contract lookup

Search the selected API path or function in [app/system/api-client.ts](<../../../app/system/api-client.ts>); follow its screen callers. Common UI/language changes require [app/system/ui.tsx](<../../../app/system/ui.tsx>) and [app/system/i18n.ts](<../../../app/system/i18n.ts>). For SQL changes use [schema map](../SCHEMA.md).
