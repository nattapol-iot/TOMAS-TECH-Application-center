# site-monitor

[Module](../modules/site-monitor.md) · [Index](../../../AGENTS.md)

Evidence: source snapshot `b7bdc97d`; generated, do not edit. [backend-node/src/routes/site-monitor.ts](<../../../backend-node/src/routes/site-monitor.ts>). Ranges are hints: search symbol after edits.

## API operations

| Method | Path | Source lines |
|---|---|---|
| GET | `/api/v1/monitor/agent/ping` | 499–502 |
| POST | `/api/v1/monitor/agent/heartbeat` | 508–686 |
| GET | `/api/v1/monitor/agent/commands` | 689–728 |
| POST | `/api/v1/monitor/agent/commands/:commandId/result` | 730–764 |
| GET | `/api/v1/monitor/agent/deployments/:deploymentId/artifact` | 815–815 |
| HEAD | `/api/v1/monitor/agent/deployments/:deploymentId/artifact` | 816–816 |
| GET | `/api/v1/monitor/sites` | 820–832 |
| GET | `/api/v1/monitor/sites/:siteId` | 834–901 |
| GET | `/api/v1/monitor/sites/:siteId/logs` | 903–936 |
| GET | `/api/v1/monitor/commands/:commandId` | 938–946 |
| POST | `/api/v1/monitor/programs/:programId/commands` | 950–1000 |
| POST | `/api/v1/monitor/incidents/:incidentId/acknowledge` | 1002–1021 |
| POST | `/api/v1/monitor/sites` | 1044–1075 |
| PUT | `/api/v1/monitor/sites/:siteId` | 1077–1120 |
| POST | `/api/v1/monitor/sites/:siteId/agents` | 1122–1150 |
| POST | `/api/v1/monitor/agents/:agentId/rotate-key` | 1152–1172 |
| POST | `/api/v1/monitor/agents/:agentId/revoke` | 1174–1200 |
| PUT | `/api/v1/monitor/agents/:agentId/tmtdesk` | 1204–1225 |

## Named functions

| Symbol | Source | Lines |
|---|---|---|
| `iso` | [backend-node/src/routes/site-monitor.ts](<../../../backend-node/src/routes/site-monitor.ts>) | 59–61 |
| `numberOrNull` | [backend-node/src/routes/site-monitor.ts](<../../../backend-node/src/routes/site-monitor.ts>) | 63–65 |
| `id` | [backend-node/src/routes/site-monitor.ts](<../../../backend-node/src/routes/site-monitor.ts>) | 67–71 |
| `body` | [backend-node/src/routes/site-monitor.ts](<../../../backend-node/src/routes/site-monitor.ts>) | 73–76 |
| `requiredText` | [backend-node/src/routes/site-monitor.ts](<../../../backend-node/src/routes/site-monitor.ts>) | 78–83 |
| `optionalText` | [backend-node/src/routes/site-monitor.ts](<../../../backend-node/src/routes/site-monitor.ts>) | 85–89 |
| `integerInRange` | [backend-node/src/routes/site-monitor.ts](<../../../backend-node/src/routes/site-monitor.ts>) | 91–96 |
| `verb` | [backend-node/src/routes/site-monitor.ts](<../../../backend-node/src/routes/site-monitor.ts>) | 98–101 |
| `header` | [backend-node/src/routes/site-monitor.ts](<../../../backend-node/src/routes/site-monitor.ts>) | 103–106 |
| `isDuplicateKey` | [backend-node/src/routes/site-monitor.ts](<../../../backend-node/src/routes/site-monitor.ts>) | 108–111 |
| `coordinate` | [backend-node/src/routes/site-monitor.ts](<../../../backend-node/src/routes/site-monitor.ts>) | 126–133 |
| `parseSitePosition` | [backend-node/src/routes/site-monitor.ts](<../../../backend-node/src/routes/site-monitor.ts>) | 136–143 |
| `parseSiteInput` | [backend-node/src/routes/site-monitor.ts](<../../../backend-node/src/routes/site-monitor.ts>) | 146–168 |
| `siteDto` | [backend-node/src/routes/site-monitor.ts](<../../../backend-node/src/routes/site-monitor.ts>) | 230–252 |
| `parseTmtdeskId` | [backend-node/src/routes/site-monitor.ts](<../../../backend-node/src/routes/site-monitor.ts>) | 258–265 |
| `agentDto` | [backend-node/src/routes/site-monitor.ts](<../../../backend-node/src/routes/site-monitor.ts>) | 267–305 |
| `commandDto` | [backend-node/src/routes/site-monitor.ts](<../../../backend-node/src/routes/site-monitor.ts>) | 307–314 |
| `cutUtf8` | [backend-node/src/routes/site-monitor.ts](<../../../backend-node/src/routes/site-monitor.ts>) | 366–377 |
| `parseScriptResult` | [backend-node/src/routes/site-monitor.ts](<../../../backend-node/src/routes/site-monitor.ts>) | 379–392 |
| `scriptTargetStatus` | [backend-node/src/routes/site-monitor.ts](<../../../backend-node/src/routes/site-monitor.ts>) | 395–398 |
| `registerSiteMonitorRoutes` | [backend-node/src/routes/site-monitor.ts](<../../../backend-node/src/routes/site-monitor.ts>) | 452–1226 |

## Direct local dependencies

- [backend-node/src/audit.ts](<../../../backend-node/src/audit.ts>)
- [backend-node/src/config.ts](<../../../backend-node/src/config.ts>)
- [backend-node/src/db.ts](<../../../backend-node/src/db.ts>)
- [backend-node/src/document-storage.ts](<../../../backend-node/src/document-storage.ts>)
- [backend-node/src/email.ts](<../../../backend-node/src/email.ts>)
- [backend-node/src/routes/download-center.ts](<../../../backend-node/src/routes/download-center.ts>)
- [backend-node/src/errors.ts](<../../../backend-node/src/errors.ts>)
- [backend-node/src/monitor-alerts.ts](<../../../backend-node/src/monitor-alerts.ts>)
- [backend-node/src/rate-limits.ts](<../../../backend-node/src/rate-limits.ts>)
- [backend-node/src/site-monitor.ts](<../../../backend-node/src/site-monitor.ts>)
- [backend-node/src/users.ts](<../../../backend-node/src/users.ts>)

## SQL references (literal scan, not a complete schema or write-set)

`dbo.installed_asset_events`, `dbo.installed_assets`, `dbo.monitor_agent_samples`, `dbo.monitor_agents`, `dbo.monitor_commands`, `dbo.monitor_deployments`, `dbo.monitor_incidents`, `dbo.monitor_logs`, `dbo.monitor_programs`, `dbo.monitor_script_jobs`, `dbo.monitor_script_targets`, `dbo.monitor_site_contacts`, `dbo.monitor_sites`, `dbo.users`

## Change boundary

Read the selected handler and helpers it calls, then its caller in api-client.ts. Verify permission checks, record scope, transaction, rowVersion and audit on that path; a route name alone does not prove authorization. Dynamic routes/SQL, helper side effects and runtime config require source inspection.
