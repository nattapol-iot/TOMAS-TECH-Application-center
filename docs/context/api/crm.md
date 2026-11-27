# crm

[Module](../modules/crm.md) · [Index](../../../AGENTS.md)

Evidence: source snapshot `94a2ee70`; generated, do not edit. [backend-node/src/routes/crm.ts](<../../../backend-node/src/routes/crm.ts>). Ranges are hints: search symbol after edits.

## API operations

| Method | Path | Source lines |
|---|---|---|
| POST | `/api/v1/crm/inquiries/:id/opportunity` | 108–174 |
| GET | `/api/v1/crm/dashboard` | 176–267 |
| GET | `/api/v1/crm/options` | 269–272 |
| PUT | `/api/v1/crm/options/:kind/:code` | 273–302 |
| GET | `/api/v1/crm/opportunities` | 304–358 |
| POST | `/api/v1/crm/opportunities` | 360–383 |
| GET | `/api/v1/crm/opportunity-duplicates` | 385–400 |
| PUT | `/api/v1/crm/opportunities/:id` | 402–429 |
| GET | `/api/v1/crm/opportunities/:id` | 431–479 |
| POST | `/api/v1/crm/opportunities/:id/followups` | 481–490 |
| PUT | `/api/v1/crm/opportunities/:id/followups/:followupId` | 491–521 |
| GET | `/api/v1/crm/activities` | 526–576 |
| POST | `/api/v1/crm/activities` | 577–648 |
| GET | `/api/v1/crm/my-work` | 650–670 |

## Named functions

| Symbol | Source | Lines |
|---|---|---|
| `column` | [backend-node/src/routes/crm.ts](<../../../backend-node/src/routes/crm.ts>) | 56–56 |
| `stale` | [backend-node/src/routes/crm.ts](<../../../backend-node/src/routes/crm.ts>) | 57–59 |
| `businessDayStart` | [backend-node/src/routes/crm.ts](<../../../backend-node/src/routes/crm.ts>) | 61–66 |
| `closeWindow` | [backend-node/src/routes/crm.ts](<../../../backend-node/src/routes/crm.ts>) | 71–81 |
| `activeOwner` | [backend-node/src/routes/crm.ts](<../../../backend-node/src/routes/crm.ts>) | 82–85 |
| `addFollowup` | [backend-node/src/routes/crm.ts](<../../../backend-node/src/routes/crm.ts>) | 86–103 |
| `registerCrmRoutes` | [backend-node/src/routes/crm.ts](<../../../backend-node/src/routes/crm.ts>) | 105–671 |

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
