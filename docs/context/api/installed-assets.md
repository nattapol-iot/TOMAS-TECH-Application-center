# installed-assets

[Module](../modules/installed-base.md) · [Index](../../../AGENTS.md)

Evidence: source snapshot `2f02b342`; generated, do not edit. [backend-node/src/routes/installed-assets.ts](<../../../backend-node/src/routes/installed-assets.ts>). Ranges are hints: search symbol after edits.

## API operations

| Method | Path | Source lines |
|---|---|---|
| GET | `/api/v1/assets` | 362–400 |
| GET | `/api/v1/assets/options` | 402–426 |
| POST | `/api/v1/assets/cabinets` | 437–455 |
| PUT | `/api/v1/assets/cabinets/:id` | 457–490 |
| DELETE | `/api/v1/assets/cabinets/:id` | 492–506 |
| GET | `/api/v1/assets/:id` | 508–524 |
| POST | `/api/v1/assets` | 526–555 |
| PUT | `/api/v1/assets/:id` | 557–588 |
| POST | `/api/v1/assets/:id/events` | 590–609 |
| DELETE | `/api/v1/assets/:id` | 611–626 |

## Named functions

| Symbol | Source | Lines |
|---|---|---|
| `nullableId` | [backend-node/src/routes/installed-assets.ts](<../../../backend-node/src/routes/installed-assets.ts>) | 70–70 |
| `assetDto` | [backend-node/src/routes/installed-assets.ts](<../../../backend-node/src/routes/installed-assets.ts>) | 72–106 |
| `inputFromRow` | [backend-node/src/routes/installed-assets.ts](<../../../backend-node/src/routes/installed-assets.ts>) | 108–118 |
| `isDuplicateKey` | [backend-node/src/routes/installed-assets.ts](<../../../backend-node/src/routes/installed-assets.ts>) | 120–124 |
| `isDuplicateOn` | [backend-node/src/routes/installed-assets.ts](<../../../backend-node/src/routes/installed-assets.ts>) | 127–129 |
| `cabinetDto` | [backend-node/src/routes/installed-assets.ts](<../../../backend-node/src/routes/installed-assets.ts>) | 261–272 |
| `checkReferences` | [backend-node/src/routes/installed-assets.ts](<../../../backend-node/src/routes/installed-assets.ts>) | 275–294 |
| `insertEvent` | [backend-node/src/routes/installed-assets.ts](<../../../backend-node/src/routes/installed-assets.ts>) | 296–306 |
| `checkCabinetReferences` | [backend-node/src/routes/installed-assets.ts](<../../../backend-node/src/routes/installed-assets.ts>) | 308–316 |
| `bindCabinet` | [backend-node/src/routes/installed-assets.ts](<../../../backend-node/src/routes/installed-assets.ts>) | 318–325 |
| `bindInput` | [backend-node/src/routes/installed-assets.ts](<../../../backend-node/src/routes/installed-assets.ts>) | 327–349 |
| `registerInstalledAssetRoutes` | [backend-node/src/routes/installed-assets.ts](<../../../backend-node/src/routes/installed-assets.ts>) | 351–627 |

## Direct local dependencies

- [backend-node/src/audit.ts](<../../../backend-node/src/audit.ts>)
- [backend-node/src/business-date.ts](<../../../backend-node/src/business-date.ts>)
- [backend-node/src/config.ts](<../../../backend-node/src/config.ts>)
- [backend-node/src/db.ts](<../../../backend-node/src/db.ts>)
- [backend-node/src/errors.ts](<../../../backend-node/src/errors.ts>)
- [backend-node/src/http.ts](<../../../backend-node/src/http.ts>)
- [backend-node/src/installed-base.ts](<../../../backend-node/src/installed-base.ts>)
- [backend-node/src/users.ts](<../../../backend-node/src/users.ts>)

## SQL references (literal scan, not a complete schema or write-set)

`dbo.customer_sites`, `dbo.customers`, `dbo.installed_asset_events`, `dbo.installed_assets`, `dbo.installed_cabinets`, `dbo.monitor_agents`, `dbo.monitor_programs`, `dbo.monitor_sites`, `dbo.projects`, `dbo.users`

## Change boundary

Read the selected handler and helpers it calls, then its caller in api-client.ts. Verify permission checks, record scope, transaction, rowVersion and audit on that path; a route name alone does not prove authorization. Dynamic routes/SQL, helper side effects and runtime config require source inspection.
