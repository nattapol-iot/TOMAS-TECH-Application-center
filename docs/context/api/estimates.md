# estimates

[Module](../modules/estimate.md) · [Index](../../../AGENTS.md)

Evidence: source snapshot `064219fd`; generated, do not edit. [backend-node/src/routes/estimates.ts](<../../../backend-node/src/routes/estimates.ts>). Ranges are hints: search symbol after edits.

## API operations

| Method | Path | Source lines |
|---|---|---|
| GET | `/api/v1/estimates` | 456–493 |
| POST | `/api/v1/estimates` | 495–544 |
| GET | `/api/v1/estimates/:id/validation` | 546–552 |
| POST | `/api/v1/estimates/:id/submit` | 554–559 |
| POST | `/api/v1/estimates/:id/approve` | 561–575 |
| POST | `/api/v1/estimates/:id/create-revision` | 577–612 |
| POST | `/api/v1/estimates/:id/request-revision` | 614–654 |

## Named functions

| Symbol | Source | Lines |
|---|---|---|
| `todayIn` | [backend-node/src/routes/estimates.ts](<../../../backend-node/src/routes/estimates.ts>) | 38–42 |
| `addYears` | [backend-node/src/routes/estimates.ts](<../../../backend-node/src/routes/estimates.ts>) | 44–46 |
| `optionalNonnegativeInteger` | [backend-node/src/routes/estimates.ts](<../../../backend-node/src/routes/estimates.ts>) | 48–52 |
| `percentage` | [backend-node/src/routes/estimates.ts](<../../../backend-node/src/routes/estimates.ts>) | 54–62 |
| `managerOverride` | [backend-node/src/routes/estimates.ts](<../../../backend-node/src/routes/estimates.ts>) | 64–66 |
| `nextEstimateRevision` | [backend-node/src/routes/estimates.ts](<../../../backend-node/src/routes/estimates.ts>) | 69–77 |
| `adminSelfDecision` | [backend-node/src/routes/estimates.ts](<../../../backend-node/src/routes/estimates.ts>) | 80–82 |
| `validationIssues` | [backend-node/src/routes/estimates.ts](<../../../backend-node/src/routes/estimates.ts>) | 84–95 |
| `snapshotSubmission` | [backend-node/src/routes/estimates.ts](<../../../backend-node/src/routes/estimates.ts>) | 97–143 |
| `snapshotRevision` | [backend-node/src/routes/estimates.ts](<../../../backend-node/src/routes/estimates.ts>) | 145–176 |
| `updateInquiry` | [backend-node/src/routes/estimates.ts](<../../../backend-node/src/routes/estimates.ts>) | 178–183 |
| `ensureRevisionSnapshot` | [backend-node/src/routes/estimates.ts](<../../../backend-node/src/routes/estimates.ts>) | 185–191 |
| `cloneRevisionLines` | [backend-node/src/routes/estimates.ts](<../../../backend-node/src/routes/estimates.ts>) | 193–254 |
| `materializeErpMappings` | [backend-node/src/routes/estimates.ts](<../../../backend-node/src/routes/estimates.ts>) | 256–317 |
| `withdrawEstimateReview` | [backend-node/src/routes/estimates.ts](<../../../backend-node/src/routes/estimates.ts>) | 320–329 |
| `revisionCode` | [backend-node/src/routes/estimates.ts](<../../../backend-node/src/routes/estimates.ts>) | 333–333 |
| `estimateFacts` | [backend-node/src/routes/estimates.ts](<../../../backend-node/src/routes/estimates.ts>) | 336–342 |
| `noticeDecision` | [backend-node/src/routes/estimates.ts](<../../../backend-node/src/routes/estimates.ts>) | 345–361 |
| `transition` | [backend-node/src/routes/estimates.ts](<../../../backend-node/src/routes/estimates.ts>) | 363–445 |
| `registerEstimateRoutes` | [backend-node/src/routes/estimates.ts](<../../../backend-node/src/routes/estimates.ts>) | 447–655 |

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
- [backend-node/src/routes/estimate-erp.ts](<../../../backend-node/src/routes/estimate-erp.ts>)
- [backend-node/src/erp-cost-estimate.ts](<../../../backend-node/src/erp-cost-estimate.ts>)
- [backend-node/src/email.ts](<../../../backend-node/src/email.ts>)
- [backend-node/src/estimate-review.ts](<../../../backend-node/src/estimate-review.ts>)
- [backend-node/src/site-visit-common.ts](<../../../backend-node/src/site-visit-common.ts>)

## SQL references (literal scan, not a complete schema or write-set)

`dbo.audit_log`, `dbo.cost_items`, `dbo.customers`, `dbo.document_lifecycle_events`, `dbo.estimate_assignments`, `dbo.estimate_erp_mappings`, `dbo.estimate_module_details`, `dbo.estimate_overhead_snapshots`, `dbo.estimate_revisions`, `dbo.estimate_submission_snapshots`, `dbo.estimates`, `dbo.expense_lines`, `dbo.fn_estimate_validation`, `dbo.inquiries`, `dbo.inquiry_attachments`, `dbo.manhour_lines`, `dbo.other_cost_lines`, `dbo.roles`, `dbo.users`, `dbo.v_estimate_totals`

## Change boundary

Read the selected handler and helpers it calls, then its caller in api-client.ts. Verify permission checks, record scope, transaction, rowVersion and audit on that path; a route name alone does not prove authorization. Dynamic routes/SQL, helper side effects and runtime config require source inspection.
