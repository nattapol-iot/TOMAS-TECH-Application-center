# visit-master

[Module](../modules/site-visit.md) · [Index](../../../AGENTS.md)

Evidence: source snapshot `32e38249`; generated, do not edit. [backend-node/src/routes/visit-master.ts](<../../../backend-node/src/routes/visit-master.ts>). Ranges are hints: search symbol after edits.

## API operations

| Method | Path | Source lines |
|---|---|---|
| GET | `/api/v1/visit-master/` | 63–197 |
| POST | `/api/v1/visit-master/visit-types` | 199–265 |
| POST | `/api/v1/visit-master/skills` | 267–310 |
| POST | `/api/v1/visit-master/checklist-templates` | 312–411 |
| POST | `/api/v1/visit-master/sla-policies` | 413–462 |
| POST | `/api/v1/visit-master/engineer-skills` | 464–499 |
| DELETE | `/api/v1/visit-master/engineer-skills/:id` | 500–530 |
| POST | `/api/v1/visit-master/availability` | 532–616 |
| DELETE | `/api/v1/visit-master/availability/:id` | 617–670 |
| GET | `/api/v1/visit-master/customers/:customerId/sites` | 672–728 |
| POST | `/api/v1/visit-master/customers/:customerId/sites` | 730–808 |
| POST | `/api/v1/visit-master/sites/:siteId/contacts` | 810–881 |
| GET | `/api/v1/me/notifications/` | 883–907 |
| POST | `/api/v1/me/notifications/read` | 908–931 |

## Named functions

| Symbol | Source | Lines |
|---|---|---|
| `clean` | [backend-node/src/routes/visit-master.ts](<../../../backend-node/src/routes/visit-master.ts>) | 23–24 |
| `code` | [backend-node/src/routes/visit-master.ts](<../../../backend-node/src/routes/visit-master.ts>) | 25–36 |
| `bool` | [backend-node/src/routes/visit-master.ts](<../../../backend-node/src/routes/visit-master.ts>) | 37–48 |
| `timestamp` | [backend-node/src/routes/visit-master.ts](<../../../backend-node/src/routes/visit-master.ts>) | 49–56 |
| `registerVisitMasterRoutes` | [backend-node/src/routes/visit-master.ts](<../../../backend-node/src/routes/visit-master.ts>) | 58–932 |

## Direct local dependencies

- [backend-node/src/db.ts](<../../../backend-node/src/db.ts>)
- [backend-node/src/errors.ts](<../../../backend-node/src/errors.ts>)
- [backend-node/src/http.ts](<../../../backend-node/src/http.ts>)
- [backend-node/src/site-visit-common.ts](<../../../backend-node/src/site-visit-common.ts>)
- [backend-node/src/routes/sales-customers.ts](<../../../backend-node/src/routes/sales-customers.ts>)
- [backend-node/src/users.ts](<../../../backend-node/src/users.ts>)

## SQL references (literal scan, not a complete schema or write-set)

`dbo.customer_site_contacts`, `dbo.customer_sites`, `dbo.customers`, `dbo.engineer_availability`, `dbo.engineer_skills`, `dbo.notifications`, `dbo.site_visit_assignments`, `dbo.site_visit_checklist_responses`, `dbo.site_visits`, `dbo.users`, `dbo.visit_checklist_items`, `dbo.visit_checklist_templates`, `dbo.visit_skills`, `dbo.visit_sla_policies`, `dbo.visit_types`

## Change boundary

Read the selected handler and helpers it calls, then its caller in api-client.ts. Verify permission checks, record scope, transaction, rowVersion and audit on that path; a route name alone does not prove authorization. Dynamic routes/SQL, helper side effects and runtime config require source inspection.
