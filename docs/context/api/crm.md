# crm

[Module](../modules/crm.md) · [Index](../../../AGENTS.md)

Evidence: source snapshot `543450fe`; generated, do not edit. [backend-node/src/routes/crm.ts](<../../../backend-node/src/routes/crm.ts>). Ranges are hints: search symbol after edits.

## API operations

| Method | Path | Source lines |
|---|---|---|
| GET | `/api/v1/crm/dashboard` | 33–45 |
| GET | `/api/v1/crm/options` | 47–50 |
| PUT | `/api/v1/crm/options/:kind/:code` | 51–66 |
| GET | `/api/v1/crm/opportunities` | 68–95 |
| POST | `/api/v1/crm/opportunities` | 97–113 |
| PUT | `/api/v1/crm/opportunities/:id` | 115–130 |
| GET | `/api/v1/crm/opportunities/:id` | 132–149 |
| POST | `/api/v1/crm/opportunities/:id/followups` | 151–154 |
| PUT | `/api/v1/crm/opportunities/:id/followups/:followupId` | 155–170 |
| GET | `/api/v1/crm/activities` | 172–185 |
| POST | `/api/v1/crm/activities` | 186–213 |
| GET | `/api/v1/crm/my-work` | 215–220 |

## Named functions

| Symbol | Source | Lines |
|---|---|---|
| `column` | [backend-node/src/routes/crm.ts](<../../../backend-node/src/routes/crm.ts>) | 13–13 |
| `stale` | [backend-node/src/routes/crm.ts](<../../../backend-node/src/routes/crm.ts>) | 14–16 |
| `activeOwner` | [backend-node/src/routes/crm.ts](<../../../backend-node/src/routes/crm.ts>) | 17–20 |
| `addFollowup` | [backend-node/src/routes/crm.ts](<../../../backend-node/src/routes/crm.ts>) | 21–28 |
| `registerCrmRoutes` | [backend-node/src/routes/crm.ts](<../../../backend-node/src/routes/crm.ts>) | 30–221 |

## Direct local dependencies

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
