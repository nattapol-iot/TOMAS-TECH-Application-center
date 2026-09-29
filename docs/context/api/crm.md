# crm

[Module](../modules/crm.md) · [Index](../../../AGENTS.md)

Evidence: source snapshot `93491087`; generated, do not edit. [backend-node/src/routes/crm.ts](<../../../backend-node/src/routes/crm.ts>). Ranges are hints: search symbol after edits.

## API operations

| Method | Path | Source lines |
|---|---|---|
| POST | `/api/v1/crm/inquiries/:id/opportunity` | 34–78 |
| GET | `/api/v1/crm/dashboard` | 80–136 |
| GET | `/api/v1/crm/options` | 138–141 |
| PUT | `/api/v1/crm/options/:kind/:code` | 142–157 |
| GET | `/api/v1/crm/opportunities` | 159–189 |
| POST | `/api/v1/crm/opportunities` | 191–208 |
| GET | `/api/v1/crm/opportunity-duplicates` | 210–218 |
| PUT | `/api/v1/crm/opportunities/:id` | 220–236 |
| GET | `/api/v1/crm/opportunities/:id` | 238–255 |
| POST | `/api/v1/crm/opportunities/:id/followups` | 257–260 |
| PUT | `/api/v1/crm/opportunities/:id/followups/:followupId` | 261–276 |
| GET | `/api/v1/crm/activities` | 278–291 |
| POST | `/api/v1/crm/activities` | 292–319 |
| GET | `/api/v1/crm/my-work` | 321–326 |

## Named functions

| Symbol | Source | Lines |
|---|---|---|
| `column` | [backend-node/src/routes/crm.ts](<../../../backend-node/src/routes/crm.ts>) | 14–14 |
| `stale` | [backend-node/src/routes/crm.ts](<../../../backend-node/src/routes/crm.ts>) | 15–17 |
| `activeOwner` | [backend-node/src/routes/crm.ts](<../../../backend-node/src/routes/crm.ts>) | 18–21 |
| `addFollowup` | [backend-node/src/routes/crm.ts](<../../../backend-node/src/routes/crm.ts>) | 22–29 |
| `registerCrmRoutes` | [backend-node/src/routes/crm.ts](<../../../backend-node/src/routes/crm.ts>) | 31–327 |

## Direct local dependencies

- [backend-node/src/crm-sales-evidence.ts](<../../../backend-node/src/crm-sales-evidence.ts>)
- [backend-node/src/db.ts](<../../../backend-node/src/db.ts>)
- [backend-node/src/users.ts](<../../../backend-node/src/users.ts>)
- [backend-node/src/config.ts](<../../../backend-node/src/config.ts>)
- [backend-node/src/project-scope.ts](<../../../backend-node/src/project-scope.ts>)
- [backend-node/src/audit.ts](<../../../backend-node/src/audit.ts>)
- [backend-node/src/errors.ts](<../../../backend-node/src/errors.ts>)
- [backend-node/src/http.ts](<../../../backend-node/src/http.ts>)
- [backend-node/src/crm.ts](<../../../backend-node/src/crm.ts>)

## SQL references (literal scan, not a complete schema or write-set)

`dbo.audit_log`, `dbo.crm_activities`, `dbo.crm_followups`, `dbo.crm_opportunities`, `dbo.crm_opportunity_numbers`, `dbo.crm_options`, `dbo.customer_site_contacts`, `dbo.customer_sites`, `dbo.customers`, `dbo.estimates`, `dbo.inquiries`, `dbo.project_members`, `dbo.projects`, `dbo.users`, `dbo.v_estimate_totals`

## Change boundary

Read the selected handler and helpers it calls, then its caller in api-client.ts. Verify permission checks, record scope, transaction, rowVersion and audit on that path; a route name alone does not prove authorization. Dynamic routes/SQL, helper side effects and runtime config require source inspection.
