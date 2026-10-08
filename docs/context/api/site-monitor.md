# site-monitor

[Module](../modules/site-monitor.md) · [Index](../../../AGENTS.md)

Evidence: source snapshot `5fe25aa6`; generated, do not edit. [backend-node/src/routes/site-monitor.ts](<../../../backend-node/src/routes/site-monitor.ts>). Ranges are hints: search symbol after edits.

## API operations

| Method | Path | Source lines |
|---|---|---|
| GET | `/api/v1/monitor/agent/ping` | 268–271 |
| POST | `/api/v1/monitor/agent/heartbeat` | 277–396 |
| GET | `/api/v1/monitor/agent/commands` | 399–424 |
| POST | `/api/v1/monitor/agent/commands/:commandId/result` | 426–445 |
| GET | `/api/v1/monitor/sites` | 449–461 |
| GET | `/api/v1/monitor/sites/:siteId` | 463–529 |
| GET | `/api/v1/monitor/sites/:siteId/logs` | 531–564 |
| GET | `/api/v1/monitor/commands/:commandId` | 566–574 |
| POST | `/api/v1/monitor/programs/:programId/commands` | 578–628 |
| POST | `/api/v1/monitor/incidents/:incidentId/acknowledge` | 630–649 |
| POST | `/api/v1/monitor/sites` | 672–701 |
| PUT | `/api/v1/monitor/sites/:siteId` | 703–743 |
| POST | `/api/v1/monitor/sites/:siteId/agents` | 745–773 |
| POST | `/api/v1/monitor/agents/:agentId/rotate-key` | 775–795 |
| POST | `/api/v1/monitor/agents/:agentId/revoke` | 797–823 |

## Named functions

| Symbol | Source | Lines |
|---|---|---|
| `iso` | [backend-node/src/routes/site-monitor.ts](<../../../backend-node/src/routes/site-monitor.ts>) | 41–43 |
| `numberOrNull` | [backend-node/src/routes/site-monitor.ts](<../../../backend-node/src/routes/site-monitor.ts>) | 45–47 |
| `id` | [backend-node/src/routes/site-monitor.ts](<../../../backend-node/src/routes/site-monitor.ts>) | 49–53 |
| `body` | [backend-node/src/routes/site-monitor.ts](<../../../backend-node/src/routes/site-monitor.ts>) | 55–58 |
| `requiredText` | [backend-node/src/routes/site-monitor.ts](<../../../backend-node/src/routes/site-monitor.ts>) | 60–65 |
| `optionalText` | [backend-node/src/routes/site-monitor.ts](<../../../backend-node/src/routes/site-monitor.ts>) | 67–71 |
| `integerInRange` | [backend-node/src/routes/site-monitor.ts](<../../../backend-node/src/routes/site-monitor.ts>) | 73–78 |
| `verb` | [backend-node/src/routes/site-monitor.ts](<../../../backend-node/src/routes/site-monitor.ts>) | 80–83 |
| `header` | [backend-node/src/routes/site-monitor.ts](<../../../backend-node/src/routes/site-monitor.ts>) | 85–88 |
| `isDuplicateKey` | [backend-node/src/routes/site-monitor.ts](<../../../backend-node/src/routes/site-monitor.ts>) | 90–93 |
| `parseSiteInput` | [backend-node/src/routes/site-monitor.ts](<../../../backend-node/src/routes/site-monitor.ts>) | 106–127 |
| `siteDto` | [backend-node/src/routes/site-monitor.ts](<../../../backend-node/src/routes/site-monitor.ts>) | 173–193 |
| `agentDto` | [backend-node/src/routes/site-monitor.ts](<../../../backend-node/src/routes/site-monitor.ts>) | 195–216 |
| `commandDto` | [backend-node/src/routes/site-monitor.ts](<../../../backend-node/src/routes/site-monitor.ts>) | 218–224 |
| `registerSiteMonitorRoutes` | [backend-node/src/routes/site-monitor.ts](<../../../backend-node/src/routes/site-monitor.ts>) | 233–824 |

## Direct local dependencies

- [backend-node/src/audit.ts](<../../../backend-node/src/audit.ts>)
- [backend-node/src/config.ts](<../../../backend-node/src/config.ts>)
- [backend-node/src/db.ts](<../../../backend-node/src/db.ts>)
- [backend-node/src/email.ts](<../../../backend-node/src/email.ts>)
- [backend-node/src/errors.ts](<../../../backend-node/src/errors.ts>)
- [backend-node/src/site-monitor.ts](<../../../backend-node/src/site-monitor.ts>)
- [backend-node/src/users.ts](<../../../backend-node/src/users.ts>)

## SQL references (literal scan, not a complete schema or write-set)

`dbo.monitor_agents`, `dbo.monitor_commands`, `dbo.monitor_incidents`, `dbo.monitor_logs`, `dbo.monitor_programs`, `dbo.monitor_site_contacts`, `dbo.monitor_sites`, `dbo.users`

## Change boundary

Read the selected handler and helpers it calls, then its caller in api-client.ts. Verify permission checks, record scope, transaction, rowVersion and audit on that path; a route name alone does not prove authorization. Dynamic routes/SQL, helper side effects and runtime config require source inspection.
