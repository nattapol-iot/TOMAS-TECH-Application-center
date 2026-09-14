# labor-packages

[Module](../modules/labor.md) · [Index](../../../AGENTS.md)

Evidence: source snapshot `32e38249`; generated, do not edit. [backend-node/src/routes/labor-packages.ts](<../../../backend-node/src/routes/labor-packages.ts>). Ranges are hints: search symbol after edits.

## API operations

| Method | Path | Source lines |
|---|---|---|
| GET | `/api/v1/labor-packages` | 345–393 |
| POST | `/api/v1/labor-packages/install-standard-library` | 400–542 |
| GET | `/api/v1/labor-packages/:id` | 544–569 |
| POST | `/api/v1/labor-packages` | 571–607 |
| PUT | `/api/v1/labor-packages/:id` | 609–659 |
| POST | `/api/v1/labor-packages/:id/retire` | 661–689 |
| POST | `/api/v1/labor-packages/from-estimate` | 694–785 |
| POST | `/api/v1/estimates/:id/apply-labor-package` | 797–992 |

## Named functions

| Symbol | Source | Lines |
|---|---|---|
| `validation` | [backend-node/src/routes/labor-packages.ts](<../../../backend-node/src/routes/labor-packages.ts>) | 60–62 |
| `todayIn` | [backend-node/src/routes/labor-packages.ts](<../../../backend-node/src/routes/labor-packages.ts>) | 64–68 |
| `packageCode` | [backend-node/src/routes/labor-packages.ts](<../../../backend-node/src/routes/labor-packages.ts>) | 70–76 |
| `decimal` | [backend-node/src/routes/labor-packages.ts](<../../../backend-node/src/routes/labor-packages.ts>) | 78–88 |
| `optionalDecimal` | [backend-node/src/routes/labor-packages.ts](<../../../backend-node/src/routes/labor-packages.ts>) | 90–92 |
| `parsePackageLine` | [backend-node/src/routes/labor-packages.ts](<../../../backend-node/src/routes/labor-packages.ts>) | 122–169 |
| `parsePackage` | [backend-node/src/routes/labor-packages.ts](<../../../backend-node/src/routes/labor-packages.ts>) | 171–190 |
| `mapPackage` | [backend-node/src/routes/labor-packages.ts](<../../../backend-node/src/routes/labor-packages.ts>) | 200–214 |
| `mapPackageLine` | [backend-node/src/routes/labor-packages.ts](<../../../backend-node/src/routes/labor-packages.ts>) | 237–251 |
| `replacePackageLines` | [backend-node/src/routes/labor-packages.ts](<../../../backend-node/src/routes/labor-packages.ts>) | 253–281 |
| `parseApplyOverride` | [backend-node/src/routes/labor-packages.ts](<../../../backend-node/src/routes/labor-packages.ts>) | 300–321 |
| `registerLaborPackageRoutes` | [backend-node/src/routes/labor-packages.ts](<../../../backend-node/src/routes/labor-packages.ts>) | 323–993 |

## Direct local dependencies

- [backend-node/src/audit.ts](<../../../backend-node/src/audit.ts>)
- [backend-node/src/config.ts](<../../../backend-node/src/config.ts>)
- [backend-node/src/db.ts](<../../../backend-node/src/db.ts>)
- [backend-node/src/errors.ts](<../../../backend-node/src/errors.ts>)
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
