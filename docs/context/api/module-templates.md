# module-templates

[Module](../modules/templates.md) · [Index](../../../AGENTS.md)

Evidence: source snapshot `e2819388`; generated, do not edit. [backend-node/src/routes/module-templates.ts](<../../../backend-node/src/routes/module-templates.ts>). Ranges are hints: search symbol after edits.

## API operations

| Method | Path | Source lines |
|---|---|---|
| GET | `/api/v1/module-templates` | 195–237 |
| GET | `/api/v1/module-templates/:id` | 239–276 |
| POST | `/api/v1/module-templates` | 278–307 |
| PUT | `/api/v1/module-templates/:id` | 309–351 |
| POST | `/api/v1/module-templates/:id/retire` | 355–380 |
| POST | `/api/v1/module-templates/from-estimate` | 384–443 |

## Named functions

| Symbol | Source | Lines |
|---|---|---|
| `validation` | [backend-node/src/routes/module-templates.ts](<../../../backend-node/src/routes/module-templates.ts>) | 39–41 |
| `templateCode` | [backend-node/src/routes/module-templates.ts](<../../../backend-node/src/routes/module-templates.ts>) | 43–49 |
| `categoryCode` | [backend-node/src/routes/module-templates.ts](<../../../backend-node/src/routes/module-templates.ts>) | 51–55 |
| `decimal` | [backend-node/src/routes/module-templates.ts](<../../../backend-node/src/routes/module-templates.ts>) | 57–66 |
| `parseLine` | [backend-node/src/routes/module-templates.ts](<../../../backend-node/src/routes/module-templates.ts>) | 68–89 |
| `parseTemplate` | [backend-node/src/routes/module-templates.ts](<../../../backend-node/src/routes/module-templates.ts>) | 91–108 |
| `assertSuppliersUsable` | [backend-node/src/routes/module-templates.ts](<../../../backend-node/src/routes/module-templates.ts>) | 110–120 |
| `replaceLines` | [backend-node/src/routes/module-templates.ts](<../../../backend-node/src/routes/module-templates.ts>) | 122–149 |
| `dateOnlyText` | [backend-node/src/routes/module-templates.ts](<../../../backend-node/src/routes/module-templates.ts>) | 159–162 |
| `mapTemplate` | [backend-node/src/routes/module-templates.ts](<../../../backend-node/src/routes/module-templates.ts>) | 164–175 |
| `registerModuleTemplateRoutes` | [backend-node/src/routes/module-templates.ts](<../../../backend-node/src/routes/module-templates.ts>) | 194–444 |

## Direct local dependencies

- [backend-node/src/audit.ts](<../../../backend-node/src/audit.ts>)
- [backend-node/src/db.ts](<../../../backend-node/src/db.ts>)
- [backend-node/src/errors.ts](<../../../backend-node/src/errors.ts>)
- [backend-node/src/http.ts](<../../../backend-node/src/http.ts>)
- [backend-node/src/users.ts](<../../../backend-node/src/users.ts>)

## SQL references (literal scan, not a complete schema or write-set)

`dbo.cost_items`, `dbo.estimates`, `dbo.module_template_lines`, `dbo.module_templates`, `dbo.suppliers`, `dbo.users`

## Change boundary

Read the selected handler and helpers it calls, then its caller in api-client.ts. Verify permission checks, record scope, transaction, rowVersion and audit on that path; a route name alone does not prove authorization. Dynamic routes/SQL, helper side effects and runtime config require source inspection.
