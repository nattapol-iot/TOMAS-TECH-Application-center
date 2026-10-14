# installed-assets

[Module](../modules/installed-base.md) · [Index](../../../AGENTS.md)

Evidence: source snapshot `c91268be`; generated, do not edit. [backend-node/src/routes/installed-assets.ts](<../../../backend-node/src/routes/installed-assets.ts>). Ranges are hints: search symbol after edits.

## API operations

| Method | Path | Source lines |
|---|---|---|
| GET | `/api/v1/assets` | 248–282 |
| GET | `/api/v1/assets/options` | 284–306 |
| GET | `/api/v1/assets/:id` | 308–324 |
| POST | `/api/v1/assets` | 326–348 |
| PUT | `/api/v1/assets/:id` | 350–381 |
| POST | `/api/v1/assets/:id/events` | 383–402 |
| DELETE | `/api/v1/assets/:id` | 404–419 |

## Named functions

| Symbol | Source | Lines |
|---|---|---|
| `nullableId` | [backend-node/src/routes/installed-assets.ts](<../../../backend-node/src/routes/installed-assets.ts>) | 63–63 |
| `assetDto` | [backend-node/src/routes/installed-assets.ts](<../../../backend-node/src/routes/installed-assets.ts>) | 65–98 |
| `inputFromRow` | [backend-node/src/routes/installed-assets.ts](<../../../backend-node/src/routes/installed-assets.ts>) | 100–109 |
| `isDuplicateKey` | [backend-node/src/routes/installed-assets.ts](<../../../backend-node/src/routes/installed-assets.ts>) | 111–115 |
| `checkReferences` | [backend-node/src/routes/installed-assets.ts](<../../../backend-node/src/routes/installed-assets.ts>) | 183–200 |
| `insertEvent` | [backend-node/src/routes/installed-assets.ts](<../../../backend-node/src/routes/installed-assets.ts>) | 202–212 |
| `bindInput` | [backend-node/src/routes/installed-assets.ts](<../../../backend-node/src/routes/installed-assets.ts>) | 214–235 |
| `registerInstalledAssetRoutes` | [backend-node/src/routes/installed-assets.ts](<../../../backend-node/src/routes/installed-assets.ts>) | 237–420 |

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

`dbo.customer_sites`, `dbo.customers`, `dbo.installed_asset_events`, `dbo.installed_assets`, `dbo.monitor_agents`, `dbo.monitor_programs`, `dbo.monitor_sites`, `dbo.projects`, `dbo.users`

## Change boundary

Read the selected handler and helpers it calls, then its caller in api-client.ts. Verify permission checks, record scope, transaction, rowVersion and audit on that path; a route name alone does not prove authorization. Dynamic routes/SQL, helper side effects and runtime config require source inspection.
