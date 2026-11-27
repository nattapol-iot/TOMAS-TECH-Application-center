# site-visits-read

[Module](../modules/site-visit.md) · [Index](../../../AGENTS.md)

Evidence: source snapshot `94a2ee70`; generated, do not edit. [backend-node/src/routes/site-visits-read.ts](<../../../backend-node/src/routes/site-visits-read.ts>). Ranges are hints: search symbol after edits.

## API operations

| Method | Path | Source lines |
|---|---|---|
| GET | `/api/v1/site-visits/` | 25–63 |
| GET | `/api/v1/site-visits/calendar` | 65–121 |
| GET | `/api/v1/site-visits/my-assignments` | 123–159 |
| GET | `/api/v1/site-visits/dashboard/engineering` | 161–190 |
| GET | `/api/v1/site-visits/dashboard/management` | 192–225 |
| GET | `/api/v1/site-visits/:id` | 227–234 |
| GET | `/api/v1/site-visits/:id/brief` | 235–280 |
| GET | `/api/v1/site-visits/:id/candidates` | 282–341 |

## Named functions

| Symbol | Source | Lines |
|---|---|---|
| `countRows` | [backend-node/src/routes/site-visits-read.ts](<../../../backend-node/src/routes/site-visits-read.ts>) | 13–18 |
| `dateAt` | [backend-node/src/routes/site-visits-read.ts](<../../../backend-node/src/routes/site-visits-read.ts>) | 19–22 |
| `registerSiteVisitReadRoutes` | [backend-node/src/routes/site-visits-read.ts](<../../../backend-node/src/routes/site-visits-read.ts>) | 24–342 |

## Direct local dependencies

- [backend-node/src/config.ts](<../../../backend-node/src/config.ts>)
- [backend-node/src/db.ts](<../../../backend-node/src/db.ts>)
- [backend-node/src/errors.ts](<../../../backend-node/src/errors.ts>)
- [backend-node/src/http.ts](<../../../backend-node/src/http.ts>)
- [backend-node/src/site-visit-common.ts](<../../../backend-node/src/site-visit-common.ts>)
- [backend-node/src/site-visit-data.ts](<../../../backend-node/src/site-visit-data.ts>)
- [backend-node/src/routes/sales-intakes.ts](<../../../backend-node/src/routes/sales-intakes.ts>)
- [backend-node/src/users.ts](<../../../backend-node/src/users.ts>)

## SQL references (literal scan, not a complete schema or write-set)

`dbo.assert_engineer_available`, `dbo.customer_sites`, `dbo.customers`, `dbo.engineer_availability`, `dbo.engineer_skills`, `dbo.roles`, `dbo.sales_intake_skills`, `dbo.sales_intakes`, `dbo.site_visit_assignments`, `dbo.site_visit_links`, `dbo.site_visit_reports`, `dbo.site_visit_schedule_history`, `dbo.site_visits`, `dbo.user_effective_roles`, `dbo.users`, `dbo.visit_skills`, `dbo.visit_types`

## Change boundary

Read the selected handler and helpers it calls, then its caller in api-client.ts. Verify permission checks, record scope, transaction, rowVersion and audit on that path; a route name alone does not prove authorization. Dynamic routes/SQL, helper side effects and runtime config require source inspection.
