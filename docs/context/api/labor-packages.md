# labor-packages

[Module](../modules/labor.md) · [Index](../../../AGENTS.md)

Evidence: source snapshot `e867e48e`; generated, do not edit. [backend-node/src/routes/labor-packages.ts](<../../../backend-node/src/routes/labor-packages.ts>). Ranges are hints: search symbol after edits.

## API operations

| Method | Path | Source lines |
|---|---|---|
| GET | `/api/v1/labor-packages` | 339–387 |
| GET | `/api/v1/labor-packages/:id` | 389–414 |
| POST | `/api/v1/labor-packages` | 416–452 |
| PUT | `/api/v1/labor-packages/:id` | 454–504 |
| POST | `/api/v1/labor-packages/:id/retire` | 506–534 |
| POST | `/api/v1/labor-packages/from-estimate` | 539–630 |
| POST | `/api/v1/estimates/:id/apply-labor-package` | 642–837 |

## Named functions

| Symbol | Source | Lines |
|---|---|---|
| `validation` | [backend-node/src/routes/labor-packages.ts](<../../../backend-node/src/routes/labor-packages.ts>) | 54–56 |
| `todayIn` | [backend-node/src/routes/labor-packages.ts](<../../../backend-node/src/routes/labor-packages.ts>) | 58–62 |
| `packageCode` | [backend-node/src/routes/labor-packages.ts](<../../../backend-node/src/routes/labor-packages.ts>) | 64–70 |
| `decimal` | [backend-node/src/routes/labor-packages.ts](<../../../backend-node/src/routes/labor-packages.ts>) | 72–82 |
| `optionalDecimal` | [backend-node/src/routes/labor-packages.ts](<../../../backend-node/src/routes/labor-packages.ts>) | 84–86 |
| `parsePackageLine` | [backend-node/src/routes/labor-packages.ts](<../../../backend-node/src/routes/labor-packages.ts>) | 116–163 |
| `parsePackage` | [backend-node/src/routes/labor-packages.ts](<../../../backend-node/src/routes/labor-packages.ts>) | 165–184 |
| `mapPackage` | [backend-node/src/routes/labor-packages.ts](<../../../backend-node/src/routes/labor-packages.ts>) | 194–208 |
| `mapPackageLine` | [backend-node/src/routes/labor-packages.ts](<../../../backend-node/src/routes/labor-packages.ts>) | 231–245 |
| `replacePackageLines` | [backend-node/src/routes/labor-packages.ts](<../../../backend-node/src/routes/labor-packages.ts>) | 247–275 |
| `parseApplyOverride` | [backend-node/src/routes/labor-packages.ts](<../../../backend-node/src/routes/labor-packages.ts>) | 294–315 |
| `registerLaborPackageRoutes` | [backend-node/src/routes/labor-packages.ts](<../../../backend-node/src/routes/labor-packages.ts>) | 317–838 |

## Direct local dependencies

- [backend-node/src/audit.ts](<../../../backend-node/src/audit.ts>)
- [backend-node/src/config.ts](<../../../backend-node/src/config.ts>)
- [backend-node/src/db.ts](<../../../backend-node/src/db.ts>)
- [backend-node/src/errors.ts](<../../../backend-node/src/errors.ts>)
- [backend-node/src/estimate-total-guard.ts](<../../../backend-node/src/estimate-total-guard.ts>)
- [backend-node/src/http.ts](<../../../backend-node/src/http.ts>)
- [backend-node/src/labor-master.ts](<../../../backend-node/src/labor-master.ts>)
- [backend-node/src/users.ts](<../../../backend-node/src/users.ts>)
- [backend-node/src/routes/estimate-workspace-write.ts](<../../../backend-node/src/routes/estimate-workspace-write.ts>)

## SQL references (literal scan, not a complete schema or write-set)

`dbo.engineering_rates`, `dbo.estimate_erp_mappings`, `dbo.estimates`, `dbo.labor_package_lines`, `dbo.labor_packages`, `dbo.manhour_lines`, `dbo.module_templates`, `dbo.users`

## Change boundary

Read the selected handler and helpers it calls, then its caller in api-client.ts. Verify permission checks, record scope, transaction, rowVersion and audit on that path; a route name alone does not prove authorization. Dynamic routes/SQL, helper side effects and runtime config require source inspection.
