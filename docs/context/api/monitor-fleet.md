# monitor-fleet

[Module](../modules/site-monitor.md) · [Index](../../../AGENTS.md)

Evidence: source snapshot `9c192c2a`; generated, do not edit. [backend-node/src/routes/monitor-fleet.ts](<../../../backend-node/src/routes/monitor-fleet.ts>). Ranges are hints: search symbol after edits.

## API operations

| Method | Path | Source lines |
|---|---|---|
| GET | `/api/v1/monitor/fleet` | 219–248 |
| GET | `/api/v1/monitor/command-center` | 250–306 |
| GET | `/api/v1/monitor/script-jobs` | 318–331 |
| GET | `/api/v1/monitor/script-jobs/:id` | 334–350 |
| POST | `/api/v1/monitor/script-jobs` | 352–404 |
| POST | `/api/v1/monitor/script-jobs/:id/approve` | 406–431 |
| POST | `/api/v1/monitor/script-jobs/:id/reject` | 466–469 |
| POST | `/api/v1/monitor/script-jobs/:id/cancel` | 470–473 |
| GET | `/api/v1/monitor/sites/:siteId/alert-channels` | 496–513 |
| PUT | `/api/v1/monitor/sites/:siteId/alert-channels/:channel` | 515–564 |
| POST | `/api/v1/monitor/sites/:siteId/alert-channels/:channel/test` | 566–594 |

## Named functions

| Symbol | Source | Lines |
|---|---|---|
| `iso` | [backend-node/src/routes/monitor-fleet.ts](<../../../backend-node/src/routes/monitor-fleet.ts>) | 54–54 |
| `numberOrNull` | [backend-node/src/routes/monitor-fleet.ts](<../../../backend-node/src/routes/monitor-fleet.ts>) | 55–55 |
| `body` | [backend-node/src/routes/monitor-fleet.ts](<../../../backend-node/src/routes/monitor-fleet.ts>) | 57–60 |
| `noteOf` | [backend-node/src/routes/monitor-fleet.ts](<../../../backend-node/src/routes/monitor-fleet.ts>) | 62–66 |
| `parseScriptJobInput` | [backend-node/src/routes/monitor-fleet.ts](<../../../backend-node/src/routes/monitor-fleet.ts>) | 78–98 |
| `scriptDigest` | [backend-node/src/routes/monitor-fleet.ts](<../../../backend-node/src/routes/monitor-fleet.ts>) | 100–102 |
| `jobDto` | [backend-node/src/routes/monitor-fleet.ts](<../../../backend-node/src/routes/monitor-fleet.ts>) | 144–160 |
| `targetDto` | [backend-node/src/routes/monitor-fleet.ts](<../../../backend-node/src/routes/monitor-fleet.ts>) | 162–169 |
| `registerMonitorFleetRoutes` | [backend-node/src/routes/monitor-fleet.ts](<../../../backend-node/src/routes/monitor-fleet.ts>) | 210–595 |

## Direct local dependencies

- [backend-node/src/audit.ts](<../../../backend-node/src/audit.ts>)
- [backend-node/src/config.ts](<../../../backend-node/src/config.ts>)
- [backend-node/src/db.ts](<../../../backend-node/src/db.ts>)
- [backend-node/src/errors.ts](<../../../backend-node/src/errors.ts>)
- [backend-node/src/http.ts](<../../../backend-node/src/http.ts>)
- [backend-node/src/monitor-alerts.ts](<../../../backend-node/src/monitor-alerts.ts>)
- [backend-node/src/schedule-service.ts](<../../../backend-node/src/schedule-service.ts>)
- [backend-node/src/site-visit-common.ts](<../../../backend-node/src/site-visit-common.ts>)
- [backend-node/src/site-monitor.ts](<../../../backend-node/src/site-monitor.ts>)
- [backend-node/src/users.ts](<../../../backend-node/src/users.ts>)
- [backend-node/src/routes/site-monitor.ts](<../../../backend-node/src/routes/site-monitor.ts>)

## SQL references (literal scan, not a complete schema or write-set)

`dbo.monitor_agent_samples`, `dbo.monitor_agents`, `dbo.monitor_commands`, `dbo.monitor_incidents`, `dbo.monitor_programs`, `dbo.monitor_script_jobs`, `dbo.monitor_script_targets`, `dbo.monitor_site_alert_channels`, `dbo.monitor_sites`, `dbo.user_effective_permissions`, `dbo.users`

## Change boundary

Read the selected handler and helpers it calls, then its caller in api-client.ts. Verify permission checks, record scope, transaction, rowVersion and audit on that path; a route name alone does not prove authorization. Dynamic routes/SQL, helper side effects and runtime config require source inspection.
