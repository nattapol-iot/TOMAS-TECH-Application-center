# site-monitor

[Module](../modules/site-monitor.md) · [Index](../../../AGENTS.md)

Evidence: source snapshot `4a0666d4`; generated, do not edit. [backend-node/src/routes/site-monitor.ts](<../../../backend-node/src/routes/site-monitor.ts>). Ranges are hints: search symbol after edits.

## API operations

| Method | Path | Source lines |
|---|---|---|
| GET | `/api/v1/monitor/agent/ping` | 361–364 |
| POST | `/api/v1/monitor/agent/heartbeat` | 370–492 |
| GET | `/api/v1/monitor/agent/commands` | 495–525 |
| POST | `/api/v1/monitor/agent/commands/:commandId/result` | 527–549 |
| GET | `/api/v1/monitor/agent/deployments/:deploymentId/artifact` | 600–600 |
| HEAD | `/api/v1/monitor/agent/deployments/:deploymentId/artifact` | 601–601 |
| GET | `/api/v1/monitor/sites` | 605–617 |
| GET | `/api/v1/monitor/sites/:siteId` | 619–687 |
| GET | `/api/v1/monitor/sites/:siteId/logs` | 689–722 |
| GET | `/api/v1/monitor/commands/:commandId` | 724–732 |
| POST | `/api/v1/monitor/programs/:programId/commands` | 736–786 |
| POST | `/api/v1/monitor/incidents/:incidentId/acknowledge` | 788–807 |
| POST | `/api/v1/monitor/sites` | 830–859 |
| PUT | `/api/v1/monitor/sites/:siteId` | 861–901 |
| POST | `/api/v1/monitor/sites/:siteId/agents` | 903–931 |
| POST | `/api/v1/monitor/agents/:agentId/rotate-key` | 933–953 |
| POST | `/api/v1/monitor/agents/:agentId/revoke` | 955–981 |
| PUT | `/api/v1/monitor/agents/:agentId/tmtdesk` | 984–1004 |

## Named functions

| Symbol | Source | Lines |
|---|---|---|
| `iso` | [backend-node/src/routes/site-monitor.ts](<../../../backend-node/src/routes/site-monitor.ts>) | 54–56 |
| `numberOrNull` | [backend-node/src/routes/site-monitor.ts](<../../../backend-node/src/routes/site-monitor.ts>) | 58–60 |
| `id` | [backend-node/src/routes/site-monitor.ts](<../../../backend-node/src/routes/site-monitor.ts>) | 62–66 |
| `body` | [backend-node/src/routes/site-monitor.ts](<../../../backend-node/src/routes/site-monitor.ts>) | 68–71 |
| `requiredText` | [backend-node/src/routes/site-monitor.ts](<../../../backend-node/src/routes/site-monitor.ts>) | 73–78 |
| `optionalText` | [backend-node/src/routes/site-monitor.ts](<../../../backend-node/src/routes/site-monitor.ts>) | 80–84 |
| `integerInRange` | [backend-node/src/routes/site-monitor.ts](<../../../backend-node/src/routes/site-monitor.ts>) | 86–91 |
| `verb` | [backend-node/src/routes/site-monitor.ts](<../../../backend-node/src/routes/site-monitor.ts>) | 93–96 |
| `header` | [backend-node/src/routes/site-monitor.ts](<../../../backend-node/src/routes/site-monitor.ts>) | 98–101 |
| `isDuplicateKey` | [backend-node/src/routes/site-monitor.ts](<../../../backend-node/src/routes/site-monitor.ts>) | 103–106 |
| `parseSiteInput` | [backend-node/src/routes/site-monitor.ts](<../../../backend-node/src/routes/site-monitor.ts>) | 119–140 |
| `siteDto` | [backend-node/src/routes/site-monitor.ts](<../../../backend-node/src/routes/site-monitor.ts>) | 188–208 |
| `parseTmtdeskId` | [backend-node/src/routes/site-monitor.ts](<../../../backend-node/src/routes/site-monitor.ts>) | 214–221 |
| `agentDto` | [backend-node/src/routes/site-monitor.ts](<../../../backend-node/src/routes/site-monitor.ts>) | 223–245 |
| `commandDto` | [backend-node/src/routes/site-monitor.ts](<../../../backend-node/src/routes/site-monitor.ts>) | 247–253 |
| `registerSiteMonitorRoutes` | [backend-node/src/routes/site-monitor.ts](<../../../backend-node/src/routes/site-monitor.ts>) | 315–1005 |

## Direct local dependencies

- [backend-node/src/audit.ts](<../../../backend-node/src/audit.ts>)
- [backend-node/src/config.ts](<../../../backend-node/src/config.ts>)
- [backend-node/src/db.ts](<../../../backend-node/src/db.ts>)
- [backend-node/src/document-storage.ts](<../../../backend-node/src/document-storage.ts>)
- [backend-node/src/email.ts](<../../../backend-node/src/email.ts>)
- [backend-node/src/routes/download-center.ts](<../../../backend-node/src/routes/download-center.ts>)
- [backend-node/src/errors.ts](<../../../backend-node/src/errors.ts>)
- [backend-node/src/rate-limits.ts](<../../../backend-node/src/rate-limits.ts>)
- [backend-node/src/site-monitor.ts](<../../../backend-node/src/site-monitor.ts>)
- [backend-node/src/users.ts](<../../../backend-node/src/users.ts>)

## SQL references (literal scan, not a complete schema or write-set)

`dbo.installed_asset_events`, `dbo.installed_assets`, `dbo.monitor_agents`, `dbo.monitor_commands`, `dbo.monitor_deployments`, `dbo.monitor_incidents`, `dbo.monitor_logs`, `dbo.monitor_programs`, `dbo.monitor_site_contacts`, `dbo.monitor_sites`, `dbo.users`

## Change boundary

Read the selected handler and helpers it calls, then its caller in api-client.ts. Verify permission checks, record scope, transaction, rowVersion and audit on that path; a route name alone does not prove authorization. Dynamic routes/SQL, helper side effects and runtime config require source inspection.
