# sales-intakes

[Module](../modules/inquiry.md) · [Index](../../../AGENTS.md)

Evidence: source snapshot `0cd46f67`; generated, do not edit. [backend-node/src/routes/sales-intakes.ts](<../../../backend-node/src/routes/sales-intakes.ts>). Ranges are hints: search symbol after edits.

## API operations

| Method | Path | Source lines |
|---|---|---|
| GET | `/api/v1/sales-intakes/` | 761–803 |
| GET | `/api/v1/sales-intakes/review-queue` | 804–810 |
| GET | `/api/v1/sales-intakes/dashboard` | 811–845 |
| GET | `/api/v1/sales-intakes/:id` | 846–854 |
| POST | `/api/v1/sales-intakes/` | 856–909 |
| PUT | `/api/v1/sales-intakes/:id` | 911–971 |
| POST | `/api/v1/sales-intakes/:id/status` | 973–1086 |
| POST | `/api/v1/sales-intakes/:id/review` | 1088–1270 |
| POST | `/api/v1/sales-intakes/:id/attachments` | 1272–1363 |
| GET | `/api/v1/sales-intakes/:id/attachments/:attachmentId/content` | 1364–1394 |
| DELETE | `/api/v1/sales-intakes/:id/attachments/:attachmentId` | 1395–1437 |

## Named functions

| Symbol | Source | Lines |
|---|---|---|
| `nowDate` | [backend-node/src/routes/sales-intakes.ts](<../../../backend-node/src/routes/sales-intakes.ts>) | 124–133 |
| `object` | [backend-node/src/routes/sales-intakes.ts](<../../../backend-node/src/routes/sales-intakes.ts>) | 134–138 |
| `clean` | [backend-node/src/routes/sales-intakes.ts](<../../../backend-node/src/routes/sales-intakes.ts>) | 139–141 |
| `bool` | [backend-node/src/routes/sales-intakes.ts](<../../../backend-node/src/routes/sales-intakes.ts>) | 142–144 |
| `optionalId` | [backend-node/src/routes/sales-intakes.ts](<../../../backend-node/src/routes/sales-intakes.ts>) | 145–147 |
| `idList` | [backend-node/src/routes/sales-intakes.ts](<../../../backend-node/src/routes/sales-intakes.ts>) | 148–158 |
| `summary` | [backend-node/src/routes/sales-intakes.ts](<../../../backend-node/src/routes/sales-intakes.ts>) | 160–189 |
| `validatePayload` | [backend-node/src/routes/sales-intakes.ts](<../../../backend-node/src/routes/sales-intakes.ts>) | 201–335 |
| `bindPayload` | [backend-node/src/routes/sales-intakes.ts](<../../../backend-node/src/routes/sales-intakes.ts>) | 338–373 |
| `validateReferences` | [backend-node/src/routes/sales-intakes.ts](<../../../backend-node/src/routes/sales-intakes.ts>) | 375–390 |
| `replaceChildren` | [backend-node/src/routes/sales-intakes.ts](<../../../backend-node/src/routes/sales-intakes.ts>) | 392–435 |
| `readiness` | [backend-node/src/routes/sales-intakes.ts](<../../../backend-node/src/routes/sales-intakes.ts>) | 437–475 |
| `intakeVersion` | [backend-node/src/routes/sales-intakes.ts](<../../../backend-node/src/routes/sales-intakes.ts>) | 477–488 |
| `mapVisitSummary` | [backend-node/src/routes/sales-intakes.ts](<../../../backend-node/src/routes/sales-intakes.ts>) | 490–530 |
| `loadSalesIntakeDetail` | [backend-node/src/routes/sales-intakes.ts](<../../../backend-node/src/routes/sales-intakes.ts>) | 532–753 |
| `registerSalesIntakeRoutes` | [backend-node/src/routes/sales-intakes.ts](<../../../backend-node/src/routes/sales-intakes.ts>) | 755–1438 |

## Direct local dependencies

- [backend-node/src/config.ts](<../../../backend-node/src/config.ts>)
- [backend-node/src/db.ts](<../../../backend-node/src/db.ts>)
- [backend-node/src/document-storage.ts](<../../../backend-node/src/document-storage.ts>)
- [backend-node/src/errors.ts](<../../../backend-node/src/errors.ts>)
- [backend-node/src/http.ts](<../../../backend-node/src/http.ts>)
- [backend-node/src/document-number.ts](<../../../backend-node/src/document-number.ts>)
- [backend-node/src/site-visit-common.ts](<../../../backend-node/src/site-visit-common.ts>)
- [backend-node/src/users.ts](<../../../backend-node/src/users.ts>)

## SQL references (literal scan, not a complete schema or write-set)

`dbo.customer_site_contacts`, `dbo.customer_sites`, `dbo.customers`, `dbo.inquiries`, `dbo.projects`, `dbo.sales_intake_attachments`, `dbo.sales_intake_purposes`, `dbo.sales_intake_reviews`, `dbo.sales_intake_skills`, `dbo.sales_intake_windows`, `dbo.sales_intakes`, `dbo.site_visit_assignments`, `dbo.site_visit_links`, `dbo.site_visit_reports`, `dbo.site_visits`, `dbo.users`, `dbo.visit_skills`, `dbo.visit_types`

## Change boundary

Read the selected handler and helpers it calls, then its caller in api-client.ts. Verify permission checks, record scope, transaction, rowVersion and audit on that path; a route name alone does not prove authorization. Dynamic routes/SQL, helper side effects and runtime config require source inspection.
