# estimates

[Module](../modules/estimate.md) · [Index](../../../AGENTS.md)

Evidence: source snapshot `5eb9231a`; generated, do not edit. [backend-node/src/routes/estimates.ts](<../../../backend-node/src/routes/estimates.ts>). Ranges are hints: search symbol after edits.

## API operations

| Method | Path | Source lines |
|---|---|---|
| GET | `/api/v1/estimates` | 347–379 |
| POST | `/api/v1/estimates` | 381–418 |
| GET | `/api/v1/estimates/:id/validation` | 420–426 |
| POST | `/api/v1/estimates/:id/submit` | 428–429 |
| POST | `/api/v1/estimates/:id/approve` | 430–431 |
| POST | `/api/v1/estimates/:id/create-revision` | 433–468 |
| POST | `/api/v1/estimates/:id/request-revision` | 470–504 |

## Named functions

| Symbol | Source | Lines |
|---|---|---|
| `todayIn` | [backend-node/src/routes/estimates.ts](<../../../backend-node/src/routes/estimates.ts>) | 25–29 |
| `addYears` | [backend-node/src/routes/estimates.ts](<../../../backend-node/src/routes/estimates.ts>) | 31–33 |
| `optionalNonnegativeInteger` | [backend-node/src/routes/estimates.ts](<../../../backend-node/src/routes/estimates.ts>) | 35–39 |
| `percentage` | [backend-node/src/routes/estimates.ts](<../../../backend-node/src/routes/estimates.ts>) | 41–49 |
| `managerOverride` | [backend-node/src/routes/estimates.ts](<../../../backend-node/src/routes/estimates.ts>) | 51–53 |
| `adminSelfDecision` | [backend-node/src/routes/estimates.ts](<../../../backend-node/src/routes/estimates.ts>) | 56–58 |
| `validationIssues` | [backend-node/src/routes/estimates.ts](<../../../backend-node/src/routes/estimates.ts>) | 60–71 |
| `snapshotSubmission` | [backend-node/src/routes/estimates.ts](<../../../backend-node/src/routes/estimates.ts>) | 73–117 |
| `snapshotRevision` | [backend-node/src/routes/estimates.ts](<../../../backend-node/src/routes/estimates.ts>) | 119–150 |
| `updateInquiry` | [backend-node/src/routes/estimates.ts](<../../../backend-node/src/routes/estimates.ts>) | 152–157 |
| `ensureRevisionSnapshot` | [backend-node/src/routes/estimates.ts](<../../../backend-node/src/routes/estimates.ts>) | 159–165 |
| `cloneRevisionLines` | [backend-node/src/routes/estimates.ts](<../../../backend-node/src/routes/estimates.ts>) | 167–225 |
| `materializeErpMappings` | [backend-node/src/routes/estimates.ts](<../../../backend-node/src/routes/estimates.ts>) | 227–280 |
| `transition` | [backend-node/src/routes/estimates.ts](<../../../backend-node/src/routes/estimates.ts>) | 282–344 |
| `registerEstimateRoutes` | [backend-node/src/routes/estimates.ts](<../../../backend-node/src/routes/estimates.ts>) | 346–505 |

## Direct local dependencies

- [backend-node/src/config.ts](<../../../backend-node/src/config.ts>)
- [backend-node/src/audit.ts](<../../../backend-node/src/audit.ts>)
- [backend-node/src/db.ts](<../../../backend-node/src/db.ts>)
- [backend-node/src/document-number.ts](<../../../backend-node/src/document-number.ts>)
- [backend-node/src/errors.ts](<../../../backend-node/src/errors.ts>)
- [backend-node/src/estimate-total-guard.ts](<../../../backend-node/src/estimate-total-guard.ts>)
- [backend-node/src/http.ts](<../../../backend-node/src/http.ts>)
- [backend-node/src/types.ts](<../../../backend-node/src/types.ts>)
- [backend-node/src/users.ts](<../../../backend-node/src/users.ts>)
- [backend-node/src/overhead.ts](<../../../backend-node/src/overhead.ts>)

## SQL references (literal scan, not a complete schema or write-set)

`dbo.audit_log`, `dbo.cost_items`, `dbo.customers`, `dbo.estimate_erp_mappings`, `dbo.estimate_overhead_snapshots`, `dbo.estimate_revisions`, `dbo.estimate_submission_snapshots`, `dbo.estimates`, `dbo.expense_lines`, `dbo.fn_estimate_validation`, `dbo.inquiries`, `dbo.inquiry_attachments`, `dbo.manhour_lines`, `dbo.other_cost_lines`, `dbo.roles`, `dbo.users`, `dbo.v_estimate_totals`

## Change boundary

Read the selected handler and helpers it calls, then its caller in api-client.ts. Verify permission checks, record scope, transaction, rowVersion and audit on that path; a route name alone does not prove authorization. Dynamic routes/SQL, helper side effects and runtime config require source inspection.
