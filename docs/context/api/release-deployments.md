# release-deployments

[Module](../modules/site-monitor.md) · [Index](../../../AGENTS.md)

Evidence: source snapshot `2f73d953`; generated, do not edit. [backend-node/src/routes/release-deployments.ts](<../../../backend-node/src/routes/release-deployments.ts>). Ranges are hints: search symbol after edits.

## API operations

| Method | Path | Source lines |
|---|---|---|
| GET | `/api/v1/monitor/programs/:programId/releases` | 156–173 |
| PUT | `/api/v1/monitor/programs/:programId/repository` | 175–192 |
| GET | `/api/v1/monitor/deployments` | 194–215 |
| POST | `/api/v1/monitor/programs/:programId/deployments` | 217–282 |
| POST | `/api/v1/monitor/deployments/:id/approve` | 284–325 |
| POST | `/api/v1/monitor/deployments/:id/reject` | 360–363 |
| POST | `/api/v1/monitor/deployments/:id/cancel` | 364–367 |

## Named functions

| Symbol | Source | Lines |
|---|---|---|
| `iso` | [backend-node/src/routes/release-deployments.ts](<../../../backend-node/src/routes/release-deployments.ts>) | 87–87 |
| `deploymentDto` | [backend-node/src/routes/release-deployments.ts](<../../../backend-node/src/routes/release-deployments.ts>) | 89–107 |
| `programState` | [backend-node/src/routes/release-deployments.ts](<../../../backend-node/src/routes/release-deployments.ts>) | 109–114 |
| `isDuplicateKey` | [backend-node/src/routes/release-deployments.ts](<../../../backend-node/src/routes/release-deployments.ts>) | 116–119 |
| `noteOf` | [backend-node/src/routes/release-deployments.ts](<../../../backend-node/src/routes/release-deployments.ts>) | 121–125 |
| `registerReleaseDeploymentRoutes` | [backend-node/src/routes/release-deployments.ts](<../../../backend-node/src/routes/release-deployments.ts>) | 127–368 |

## Direct local dependencies

- [backend-node/src/audit.ts](<../../../backend-node/src/audit.ts>)
- [backend-node/src/config.ts](<../../../backend-node/src/config.ts>)
- [backend-node/src/db.ts](<../../../backend-node/src/db.ts>)
- [backend-node/src/document-storage.ts](<../../../backend-node/src/document-storage.ts>)
- [backend-node/src/errors.ts](<../../../backend-node/src/errors.ts>)
- [backend-node/src/http.ts](<../../../backend-node/src/http.ts>)
- [backend-node/src/release-deployment.ts](<../../../backend-node/src/release-deployment.ts>)
- [backend-node/src/schedule-service.ts](<../../../backend-node/src/schedule-service.ts>)
- [backend-node/src/site-visit-common.ts](<../../../backend-node/src/site-visit-common.ts>)
- [backend-node/src/site-monitor.ts](<../../../backend-node/src/site-monitor.ts>)
- [backend-node/src/users.ts](<../../../backend-node/src/users.ts>)
- [backend-node/src/routes/tmthub-repositories.ts](<../../../backend-node/src/routes/tmthub-repositories.ts>)

## SQL references (literal scan, not a complete schema or write-set)

`dbo.monitor_agents`, `dbo.monitor_commands`, `dbo.monitor_deployments`, `dbo.monitor_programs`, `dbo.monitor_sites`, `dbo.user_effective_permissions`, `dbo.users`

## Change boundary

Read the selected handler and helpers it calls, then its caller in api-client.ts. Verify permission checks, record scope, transaction, rowVersion and audit on that path; a route name alone does not prove authorization. Dynamic routes/SQL, helper side effects and runtime config require source inspection.
