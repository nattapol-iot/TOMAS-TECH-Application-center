# crm-customers

[Module](../modules/crm.md) · [Index](../../../AGENTS.md)

Evidence: source snapshot `c4a8bb9b`; generated, do not edit. [backend-node/src/routes/crm-customers.ts](<../../../backend-node/src/routes/crm-customers.ts>). Ranges are hints: search symbol after edits.

## API operations

| Method | Path | Source lines |
|---|---|---|
| GET | `/api/v1/crm/customers` | 14–26 |
| GET | `/api/v1/crm/customers/:id` | 27–47 |
| PUT | `/api/v1/crm/customers/:id` | 48–64 |
| GET | `/api/v1/crm/contacts` | 65–69 |
| PUT | `/api/v1/crm/contacts/:id/metadata` | 70–82 |

## Named functions

| Symbol | Source | Lines |
|---|---|---|
| `registerCrmCustomerRoutes` | [backend-node/src/routes/crm-customers.ts](<../../../backend-node/src/routes/crm-customers.ts>) | 13–99 |

## Direct local dependencies

- [backend-node/src/db.ts](<../../../backend-node/src/db.ts>)
- [backend-node/src/users.ts](<../../../backend-node/src/users.ts>)
- [backend-node/src/audit.ts](<../../../backend-node/src/audit.ts>)
- [backend-node/src/errors.ts](<../../../backend-node/src/errors.ts>)
- [backend-node/src/http.ts](<../../../backend-node/src/http.ts>)
- [backend-node/src/project-scope.ts](<../../../backend-node/src/project-scope.ts>)
- [backend-node/src/unified-report-service.ts](<../../../backend-node/src/unified-report-service.ts>)
- [backend-node/src/routes/sales-customers.ts](<../../../backend-node/src/routes/sales-customers.ts>)
- [backend-node/src/crm.ts](<../../../backend-node/src/crm.ts>)

## SQL references (literal scan, not a complete schema or write-set)

`dbo.crm_opportunities`, `dbo.crm_options`, `dbo.customer_site_contacts`, `dbo.customer_sites`, `dbo.customers`, `dbo.estimates`, `dbo.inquiries`, `dbo.project_members`, `dbo.projects`, `dbo.unified_report_revisions`, `dbo.unified_reports`, `dbo.users`, `dbo.v_estimate_totals`

## Change boundary

Read the selected handler and helpers it calls, then its caller in api-client.ts. Verify permission checks, record scope, transaction, rowVersion and audit on that path; a route name alone does not prove authorization. Dynamic routes/SQL, helper side effects and runtime config require source inspection.
