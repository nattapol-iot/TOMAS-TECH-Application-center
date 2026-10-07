# estimates

[Module](../modules/estimate.md) · [Index](../../../AGENTS.md)

Evidence: source snapshot `aa4e8e9a`; generated, do not edit. [backend-node/src/routes/estimates.ts](<../../../backend-node/src/routes/estimates.ts>). Ranges are hints: search symbol after edits.

## API operations

| Method | Path | Source lines |
|---|---|---|
| GET | `/api/v1/estimates` | 391–428 |
| POST | `/api/v1/estimates` | 430–479 |
| GET | `/api/v1/estimates/:id/validation` | 481–487 |
| POST | `/api/v1/estimates/:id/submit` | 489–490 |
| POST | `/api/v1/estimates/:id/approve` | 491–492 |
| POST | `/api/v1/estimates/:id/create-revision` | 494–529 |
| POST | `/api/v1/estimates/:id/request-revision` | 531–565 |

## Named functions

| Symbol | Source | Lines |
|---|---|---|
| `todayIn` | [backend-node/src/routes/estimates.ts](<../../../backend-node/src/routes/estimates.ts>) | 33–37 |
| `addYears` | [backend-node/src/routes/estimates.ts](<../../../backend-node/src/routes/estimates.ts>) | 39–41 |
| `optionalNonnegativeInteger` | [backend-node/src/routes/estimates.ts](<../../../backend-node/src/routes/estimates.ts>) | 43–47 |
| `percentage` | [backend-node/src/routes/estimates.ts](<../../../backend-node/src/routes/estimates.ts>) | 49–57 |
| `managerOverride` | [backend-node/src/routes/estimates.ts](<../../../backend-node/src/routes/estimates.ts>) | 59–61 |
| `nextEstimateRevision` | [backend-node/src/routes/estimates.ts](<../../../backend-node/src/routes/estimates.ts>) | 64–72 |
| `adminSelfDecision` | [backend-node/src/routes/estimates.ts](<../../../backend-node/src/routes/estimates.ts>) | 75–77 |
| `validationIssues` | [backend-node/src/routes/estimates.ts](<../../../backend-node/src/routes/estimates.ts>) | 79–90 |
| `snapshotSubmission` | [backend-node/src/routes/estimates.ts](<../../../backend-node/src/routes/estimates.ts>) | 92–138 |
| `snapshotRevision` | [backend-node/src/routes/estimates.ts](<../../../backend-node/src/routes/estimates.ts>) | 140–171 |
| `updateInquiry` | [backend-node/src/routes/estimates.ts](<../../../backend-node/src/routes/estimates.ts>) | 173–178 |
| `ensureRevisionSnapshot` | [backend-node/src/routes/estimates.ts](<../../../backend-node/src/routes/estimates.ts>) | 180–186 |
| `cloneRevisionLines` | [backend-node/src/routes/estimates.ts](<../../../backend-node/src/routes/estimates.ts>) | 188–249 |
| `materializeErpMappings` | [backend-node/src/routes/estimates.ts](<../../../backend-node/src/routes/estimates.ts>) | 251–312 |
| `withdrawEstimateReview` | [backend-node/src/routes/estimates.ts](<../../../backend-node/src/routes/estimates.ts>) | 315–324 |
| `transition` | [backend-node/src/routes/estimates.ts](<../../../backend-node/src/routes/estimates.ts>) | 326–388 |
| `registerEstimateRoutes` | [backend-node/src/routes/estimates.ts](<../../../backend-node/src/routes/estimates.ts>) | 390–566 |

## Direct local dependencies

- [backend-node/src/estimate-duplicate-policy.ts](<../../../backend-node/src/estimate-duplicate-policy.ts>)
- [backend-node/src/http.ts](<../../../backend-node/src/http.ts>)
- [backend-node/src/estimate-labor-category.ts](<../../../backend-node/src/estimate-labor-category.ts>)
- [backend-node/src/config.ts](<../../../backend-node/src/config.ts>)
- [backend-node/src/audit.ts](<../../../backend-node/src/audit.ts>)
- [backend-node/src/db.ts](<../../../backend-node/src/db.ts>)
- [backend-node/src/document-number.ts](<../../../backend-node/src/document-number.ts>)
- [backend-node/src/errors.ts](<../../../backend-node/src/errors.ts>)
- [backend-node/src/user-roles.ts](<../../../backend-node/src/user-roles.ts>)
- [backend-node/src/estimate-total-guard.ts](<../../../backend-node/src/estimate-total-guard.ts>)
- [backend-node/src/http.ts](<../../../backend-node/src/http.ts>)
- [backend-node/src/types.ts](<../../../backend-node/src/types.ts>)
- [backend-node/src/users.ts](<../../../backend-node/src/users.ts>)
- [backend-node/src/overhead.ts](<../../../backend-node/src/overhead.ts>)
- [backend-node/src/estimate-copy-plan.ts](<../../../backend-node/src/estimate-copy-plan.ts>)
- [backend-node/src/routes/estimate-cost-write.ts](<../../../backend-node/src/routes/estimate-cost-write.ts>)
- [backend-node/src/routes/estimate-copy.ts](<../../../backend-node/src/routes/estimate-copy.ts>)

## SQL references (literal scan, not a complete schema or write-set)

`dbo.audit_log`, `dbo.cost_items`, `dbo.customers`, `dbo.document_lifecycle_events`, `dbo.estimate_assignments`, `dbo.estimate_erp_mappings`, `dbo.estimate_module_details`, `dbo.estimate_overhead_snapshots`, `dbo.estimate_revisions`, `dbo.estimate_submission_snapshots`, `dbo.estimates`, `dbo.expense_lines`, `dbo.fn_estimate_validation`, `dbo.inquiries`, `dbo.inquiry_attachments`, `dbo.manhour_lines`, `dbo.other_cost_lines`, `dbo.roles`, `dbo.users`, `dbo.v_estimate_totals`

## Change boundary

Read the selected handler and helpers it calls, then its caller in api-client.ts. Verify permission checks, record scope, transaction, rowVersion and audit on that path; a route name alone does not prove authorization. Dynamic routes/SQL, helper side effects and runtime config require source inspection.
