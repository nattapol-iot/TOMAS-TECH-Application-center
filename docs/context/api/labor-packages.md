# labor-packages

[Module](../modules/labor.md) · [Index](../../../AGENTS.md)

Evidence: source snapshot `7c72bae7`; generated, do not edit. [backend-node/src/routes/labor-packages.ts](<../../../backend-node/src/routes/labor-packages.ts>). Ranges are hints: search symbol after edits.

## API operations

| Method | Path | Source lines |
|---|---|---|
| GET | `/api/v1/labor-packages` | 346–394 |
| POST | `/api/v1/labor-packages/install-standard-library` | 401–543 |
| GET | `/api/v1/labor-packages/:id` | 545–570 |
| POST | `/api/v1/labor-packages` | 572–608 |
| PUT | `/api/v1/labor-packages/:id` | 610–660 |
| POST | `/api/v1/labor-packages/:id/retire` | 662–690 |
| POST | `/api/v1/labor-packages/from-estimate` | 695–786 |
| POST | `/api/v1/estimates/:id/apply-labor-package` | 798–999 |

## Named functions

| Symbol | Source | Lines |
|---|---|---|
| `validation` | [backend-node/src/routes/labor-packages.ts](<../../../backend-node/src/routes/labor-packages.ts>) | 61–63 |
| `todayIn` | [backend-node/src/routes/labor-packages.ts](<../../../backend-node/src/routes/labor-packages.ts>) | 65–69 |
| `packageCode` | [backend-node/src/routes/labor-packages.ts](<../../../backend-node/src/routes/labor-packages.ts>) | 71–77 |
| `decimal` | [backend-node/src/routes/labor-packages.ts](<../../../backend-node/src/routes/labor-packages.ts>) | 79–89 |
| `optionalDecimal` | [backend-node/src/routes/labor-packages.ts](<../../../backend-node/src/routes/labor-packages.ts>) | 91–93 |
| `parsePackageLine` | [backend-node/src/routes/labor-packages.ts](<../../../backend-node/src/routes/labor-packages.ts>) | 123–170 |
| `parsePackage` | [backend-node/src/routes/labor-packages.ts](<../../../backend-node/src/routes/labor-packages.ts>) | 172–191 |
| `mapPackage` | [backend-node/src/routes/labor-packages.ts](<../../../backend-node/src/routes/labor-packages.ts>) | 201–215 |
| `mapPackageLine` | [backend-node/src/routes/labor-packages.ts](<../../../backend-node/src/routes/labor-packages.ts>) | 238–252 |
| `replacePackageLines` | [backend-node/src/routes/labor-packages.ts](<../../../backend-node/src/routes/labor-packages.ts>) | 254–282 |
| `parseApplyOverride` | [backend-node/src/routes/labor-packages.ts](<../../../backend-node/src/routes/labor-packages.ts>) | 301–322 |
| `registerLaborPackageRoutes` | [backend-node/src/routes/labor-packages.ts](<../../../backend-node/src/routes/labor-packages.ts>) | 324–1000 |

## Direct local dependencies

- [backend-node/src/audit.ts](<../../../backend-node/src/audit.ts>)
- [backend-node/src/config.ts](<../../../backend-node/src/config.ts>)
- [backend-node/src/db.ts](<../../../backend-node/src/db.ts>)
- [backend-node/src/errors.ts](<../../../backend-node/src/errors.ts>)
- [backend-node/src/estimate-disciplines.ts](<../../../backend-node/src/estimate-disciplines.ts>)
- [backend-node/src/estimate-total-guard.ts](<../../../backend-node/src/estimate-total-guard.ts>)
- [backend-node/src/http.ts](<../../../backend-node/src/http.ts>)
- [backend-node/src/labor-master.ts](<../../../backend-node/src/labor-master.ts>)
- [backend-node/src/users.ts](<../../../backend-node/src/users.ts>)
- [backend-node/src/standard-labor-cost-masters.ts](<../../../backend-node/src/standard-labor-cost-masters.ts>)
- [backend-node/src/routes/estimate-workspace-write.ts](<../../../backend-node/src/routes/estimate-workspace-write.ts>)

## SQL references (literal scan, not a complete schema or write-set)

`dbo.engineering_rates`, `dbo.estimate_erp_mappings`, `dbo.estimates`, `dbo.labor_package_lines`, `dbo.labor_packages`, `dbo.manhour_lines`, `dbo.module_template_lines`, `dbo.module_templates`, `dbo.users`

## Change boundary

Read the selected handler and helpers it calls, then its caller in api-client.ts. Verify permission checks, record scope, transaction, rowVersion and audit on that path; a route name alone does not prove authorization. Dynamic routes/SQL, helper side effects and runtime config require source inspection.
