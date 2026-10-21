# site-monitor

[Module](../modules/site-monitor.md) · [Index](../../../AGENTS.md)

Evidence: source snapshot `0ede4efb`; generated, do not edit. [backend-node/src/routes/site-monitor.ts](<../../../backend-node/src/routes/site-monitor.ts>). Ranges are hints: search symbol after edits.

## API operations

| Method | Path | Source lines |
|---|---|---|
| GET | `/api/v1/monitor/agent/ping` | 326–329 |
| POST | `/api/v1/monitor/agent/heartbeat` | 335–457 |
| GET | `/api/v1/monitor/agent/commands` | 460–490 |
| POST | `/api/v1/monitor/agent/commands/:commandId/result` | 492–514 |
| GET | `/api/v1/monitor/agent/deployments/:deploymentId/artifact` | 565–565 |
| HEAD | `/api/v1/monitor/agent/deployments/:deploymentId/artifact` | 566–566 |
| GET | `/api/v1/monitor/sites` | 570–582 |
| GET | `/api/v1/monitor/sites/:siteId` | 584–651 |
| GET | `/api/v1/monitor/sites/:siteId/logs` | 653–686 |
| GET | `/api/v1/monitor/commands/:commandId` | 688–696 |
| POST | `/api/v1/monitor/programs/:programId/commands` | 700–750 |
| POST | `/api/v1/monitor/incidents/:incidentId/acknowledge` | 752–771 |
| POST | `/api/v1/monitor/sites` | 794–823 |
| PUT | `/api/v1/monitor/sites/:siteId` | 825–865 |
| POST | `/api/v1/monitor/sites/:siteId/agents` | 867–895 |
| POST | `/api/v1/monitor/agents/:agentId/rotate-key` | 897–917 |
| POST | `/api/v1/monitor/agents/:agentId/revoke` | 919–945 |

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
| `siteDto` | [backend-node/src/routes/site-monitor.ts](<../../../backend-node/src/routes/site-monitor.ts>) | 178–198 |
| `agentDto` | [backend-node/src/routes/site-monitor.ts](<../../../backend-node/src/routes/site-monitor.ts>) | 200–221 |
| `commandDto` | [backend-node/src/routes/site-monitor.ts](<../../../backend-node/src/routes/site-monitor.ts>) | 223–229 |
| `registerSiteMonitorRoutes` | [backend-node/src/routes/site-monitor.ts](<../../../backend-node/src/routes/site-monitor.ts>) | 291–946 |

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
