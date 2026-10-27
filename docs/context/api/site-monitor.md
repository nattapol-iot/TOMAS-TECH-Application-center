# site-monitor

[Module](../modules/site-monitor.md) · [Index](../../../AGENTS.md)

Evidence: source snapshot `8f4da29c`; generated, do not edit. [backend-node/src/routes/site-monitor.ts](<../../../backend-node/src/routes/site-monitor.ts>). Ranges are hints: search symbol after edits.

## API operations

| Method | Path | Source lines |
|---|---|---|
| GET | `/api/v1/monitor/agent/ping` | 341–344 |
| POST | `/api/v1/monitor/agent/heartbeat` | 350–472 |
| GET | `/api/v1/monitor/agent/commands` | 475–505 |
| POST | `/api/v1/monitor/agent/commands/:commandId/result` | 507–529 |
| GET | `/api/v1/monitor/agent/deployments/:deploymentId/artifact` | 580–580 |
| HEAD | `/api/v1/monitor/agent/deployments/:deploymentId/artifact` | 581–581 |
| GET | `/api/v1/monitor/sites` | 585–597 |
| GET | `/api/v1/monitor/sites/:siteId` | 599–666 |
| GET | `/api/v1/monitor/sites/:siteId/logs` | 668–701 |
| GET | `/api/v1/monitor/commands/:commandId` | 703–711 |
| POST | `/api/v1/monitor/programs/:programId/commands` | 715–765 |
| POST | `/api/v1/monitor/incidents/:incidentId/acknowledge` | 767–786 |
| POST | `/api/v1/monitor/sites` | 809–838 |
| PUT | `/api/v1/monitor/sites/:siteId` | 840–880 |
| POST | `/api/v1/monitor/sites/:siteId/agents` | 882–910 |
| POST | `/api/v1/monitor/agents/:agentId/rotate-key` | 912–932 |
| POST | `/api/v1/monitor/agents/:agentId/revoke` | 934–960 |
| PUT | `/api/v1/monitor/agents/:agentId/tmtdesk` | 963–983 |

## Named functions

| Symbol | Source | Lines |
|---|---|---|
| `iso` | [backend-node/src/routes/site-monitor.ts](<../../../backend-node/src/routes/site-monitor.ts>) | 45–47 |
| `numberOrNull` | [backend-node/src/routes/site-monitor.ts](<../../../backend-node/src/routes/site-monitor.ts>) | 49–51 |
| `id` | [backend-node/src/routes/site-monitor.ts](<../../../backend-node/src/routes/site-monitor.ts>) | 53–57 |
| `body` | [backend-node/src/routes/site-monitor.ts](<../../../backend-node/src/routes/site-monitor.ts>) | 59–62 |
| `requiredText` | [backend-node/src/routes/site-monitor.ts](<../../../backend-node/src/routes/site-monitor.ts>) | 64–69 |
| `optionalText` | [backend-node/src/routes/site-monitor.ts](<../../../backend-node/src/routes/site-monitor.ts>) | 71–75 |
| `integerInRange` | [backend-node/src/routes/site-monitor.ts](<../../../backend-node/src/routes/site-monitor.ts>) | 77–82 |
| `verb` | [backend-node/src/routes/site-monitor.ts](<../../../backend-node/src/routes/site-monitor.ts>) | 84–87 |
| `header` | [backend-node/src/routes/site-monitor.ts](<../../../backend-node/src/routes/site-monitor.ts>) | 89–92 |
| `isDuplicateKey` | [backend-node/src/routes/site-monitor.ts](<../../../backend-node/src/routes/site-monitor.ts>) | 94–97 |
| `parseSiteInput` | [backend-node/src/routes/site-monitor.ts](<../../../backend-node/src/routes/site-monitor.ts>) | 110–131 |
| `siteDto` | [backend-node/src/routes/site-monitor.ts](<../../../backend-node/src/routes/site-monitor.ts>) | 179–199 |
| `parseTmtdeskId` | [backend-node/src/routes/site-monitor.ts](<../../../backend-node/src/routes/site-monitor.ts>) | 205–212 |
| `agentDto` | [backend-node/src/routes/site-monitor.ts](<../../../backend-node/src/routes/site-monitor.ts>) | 214–236 |
| `commandDto` | [backend-node/src/routes/site-monitor.ts](<../../../backend-node/src/routes/site-monitor.ts>) | 238–244 |
| `registerSiteMonitorRoutes` | [backend-node/src/routes/site-monitor.ts](<../../../backend-node/src/routes/site-monitor.ts>) | 306–984 |

## Direct local dependencies

- [backend-node/src/audit.ts](<../../../backend-node/src/audit.ts>)
- [backend-node/src/config.ts](<../../../backend-node/src/config.ts>)
- [backend-node/src/db.ts](<../../../backend-node/src/db.ts>)
- [backend-node/src/document-storage.ts](<../../../backend-node/src/document-storage.ts>)
- [backend-node/src/email.ts](<../../../backend-node/src/email.ts>)
- [backend-node/src/routes/download-center.ts](<../../../backend-node/src/routes/download-center.ts>)
- [backend-node/src/errors.ts](<../../../backend-node/src/errors.ts>)
- [backend-node/src/site-monitor.ts](<../../../backend-node/src/site-monitor.ts>)
- [backend-node/src/users.ts](<../../../backend-node/src/users.ts>)

## SQL references (literal scan, not a complete schema or write-set)

`dbo.installed_asset_events`, `dbo.installed_assets`, `dbo.monitor_agents`, `dbo.monitor_commands`, `dbo.monitor_deployments`, `dbo.monitor_incidents`, `dbo.monitor_logs`, `dbo.monitor_programs`, `dbo.monitor_site_contacts`, `dbo.monitor_sites`, `dbo.users`

## Change boundary

Read the selected handler and helpers it calls, then its caller in api-client.ts. Verify permission checks, record scope, transaction, rowVersion and audit on that path; a route name alone does not prove authorization. Dynamic routes/SQL, helper side effects and runtime config require source inspection.
