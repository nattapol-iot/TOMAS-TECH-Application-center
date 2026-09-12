# visit-master

[Module](../modules/site-visit.md) · [Index](../../../AGENTS.md)

Evidence: source snapshot `5eb9231a`; generated, do not edit. [backend-node/src/routes/visit-master.ts](<../../../backend-node/src/routes/visit-master.ts>). Ranges are hints: search symbol after edits.

## API operations

| Method | Path | Source lines |
|---|---|---|
| GET | `/api/v1/visit-master/` | 62–196 |
| POST | `/api/v1/visit-master/visit-types` | 198–264 |
| POST | `/api/v1/visit-master/skills` | 266–309 |
| POST | `/api/v1/visit-master/checklist-templates` | 311–410 |
| POST | `/api/v1/visit-master/sla-policies` | 412–461 |
| POST | `/api/v1/visit-master/engineer-skills` | 463–498 |
| DELETE | `/api/v1/visit-master/engineer-skills/:id` | 499–529 |
| POST | `/api/v1/visit-master/availability` | 531–615 |
| DELETE | `/api/v1/visit-master/availability/:id` | 616–669 |
| GET | `/api/v1/visit-master/customers/:customerId/sites` | 671–727 |
| POST | `/api/v1/visit-master/customers/:customerId/sites` | 729–807 |
| POST | `/api/v1/visit-master/sites/:siteId/contacts` | 809–872 |
| GET | `/api/v1/me/notifications/` | 874–898 |
| POST | `/api/v1/me/notifications/read` | 899–922 |

## Named functions

| Symbol | Source | Lines |
|---|---|---|
| `clean` | [backend-node/src/routes/visit-master.ts](<../../../backend-node/src/routes/visit-master.ts>) | 22–23 |
| `code` | [backend-node/src/routes/visit-master.ts](<../../../backend-node/src/routes/visit-master.ts>) | 24–35 |
| `bool` | [backend-node/src/routes/visit-master.ts](<../../../backend-node/src/routes/visit-master.ts>) | 36–47 |
| `timestamp` | [backend-node/src/routes/visit-master.ts](<../../../backend-node/src/routes/visit-master.ts>) | 48–55 |
| `registerVisitMasterRoutes` | [backend-node/src/routes/visit-master.ts](<../../../backend-node/src/routes/visit-master.ts>) | 57–923 |

## Direct local dependencies

- [backend-node/src/db.ts](<../../../backend-node/src/db.ts>)
- [backend-node/src/errors.ts](<../../../backend-node/src/errors.ts>)
- [backend-node/src/http.ts](<../../../backend-node/src/http.ts>)
- [backend-node/src/site-visit-common.ts](<../../../backend-node/src/site-visit-common.ts>)
- [backend-node/src/users.ts](<../../../backend-node/src/users.ts>)

## SQL references (literal scan, not a complete schema or write-set)

`dbo.customer_site_contacts`, `dbo.customer_sites`, `dbo.customers`, `dbo.engineer_availability`, `dbo.engineer_skills`, `dbo.notifications`, `dbo.site_visit_assignments`, `dbo.site_visit_checklist_responses`, `dbo.site_visits`, `dbo.users`, `dbo.visit_checklist_items`, `dbo.visit_checklist_templates`, `dbo.visit_skills`, `dbo.visit_sla_policies`, `dbo.visit_types`

## Change boundary

Read the selected handler and helpers it calls, then its caller in api-client.ts. Verify permission checks, record scope, transaction, rowVersion and audit on that path; a route name alone does not prove authorization. Dynamic routes/SQL, helper side effects and runtime config require source inspection.
