# estimates

[Module](../modules/estimate.md) · [Index](../../../AGENTS.md)

Evidence: source snapshot `94a2ee70`; generated, do not edit. [backend-node/src/routes/estimates.ts](<../../../backend-node/src/routes/estimates.ts>). Ranges are hints: search symbol after edits.

## API operations

| Method | Path | Source lines |
|---|---|---|
| GET | `/api/v1/estimates` | 665–751 |
| POST | `/api/v1/estimates` | 753–852 |
| GET | `/api/v1/estimates/:id/validation` | 854–864 |
| POST | `/api/v1/estimates/:id/submit` | 866–884 |
| POST | `/api/v1/estimates/:id/approve` | 886–916 |
| POST | `/api/v1/estimates/:id/create-revision` | 918–994 |
| POST | `/api/v1/estimates/:id/request-revision` | 996–1083 |
| GET | `/api/v1/estimates/:id/revisions/:revision` | 1087–1204 |
| POST | `/api/v1/estimates/:id/restore-revision` | 1208–1329 |

## Named functions

| Symbol | Source | Lines |
|---|---|---|
| `todayIn` | [backend-node/src/routes/estimates.ts](<../../../backend-node/src/routes/estimates.ts>) | 62–66 |
| `addYears` | [backend-node/src/routes/estimates.ts](<../../../backend-node/src/routes/estimates.ts>) | 68–72 |
| `optionalNonnegativeInteger` | [backend-node/src/routes/estimates.ts](<../../../backend-node/src/routes/estimates.ts>) | 74–79 |
| `percentage` | [backend-node/src/routes/estimates.ts](<../../../backend-node/src/routes/estimates.ts>) | 81–89 |
| `managerOverride` | [backend-node/src/routes/estimates.ts](<../../../backend-node/src/routes/estimates.ts>) | 91–93 |
| `nextEstimateRevision` | [backend-node/src/routes/estimates.ts](<../../../backend-node/src/routes/estimates.ts>) | 96–106 |
| `adminSelfDecision` | [backend-node/src/routes/estimates.ts](<../../../backend-node/src/routes/estimates.ts>) | 109–111 |
| `validationIssues` | [backend-node/src/routes/estimates.ts](<../../../backend-node/src/routes/estimates.ts>) | 113–130 |
| `snapshotSubmission` | [backend-node/src/routes/estimates.ts](<../../../backend-node/src/routes/estimates.ts>) | 132–185 |
| `snapshotRevision` | [backend-node/src/routes/estimates.ts](<../../../backend-node/src/routes/estimates.ts>) | 187–221 |
| `updateInquiry` | [backend-node/src/routes/estimates.ts](<../../../backend-node/src/routes/estimates.ts>) | 223–231 |
| `ensureRevisionSnapshot` | [backend-node/src/routes/estimates.ts](<../../../backend-node/src/routes/estimates.ts>) | 233–243 |
| `cloneRevisionLines` | [backend-node/src/routes/estimates.ts](<../../../backend-node/src/routes/estimates.ts>) | 245–329 |
| `materializeErpMappings` | [backend-node/src/routes/estimates.ts](<../../../backend-node/src/routes/estimates.ts>) | 331–392 |
| `withdrawEstimateReview` | [backend-node/src/routes/estimates.ts](<../../../backend-node/src/routes/estimates.ts>) | 395–404 |
| `revisionCode` | [backend-node/src/routes/estimates.ts](<../../../backend-node/src/routes/estimates.ts>) | 408–408 |
| `restoreRevisionPlan` | [backend-node/src/routes/estimates.ts](<../../../backend-node/src/routes/estimates.ts>) | 436–441 |
| `restoreRevisionReason` | [backend-node/src/routes/estimates.ts](<../../../backend-node/src/routes/estimates.ts>) | 444–447 |
| `estimateFacts` | [backend-node/src/routes/estimates.ts](<../../../backend-node/src/routes/estimates.ts>) | 450–459 |
| `noticeDecision` | [backend-node/src/routes/estimates.ts](<../../../backend-node/src/routes/estimates.ts>) | 462–504 |
| `transition` | [backend-node/src/routes/estimates.ts](<../../../backend-node/src/routes/estimates.ts>) | 506–645 |
| `registerEstimateRoutes` | [backend-node/src/routes/estimates.ts](<../../../backend-node/src/routes/estimates.ts>) | 647–1330 |

## Direct local dependencies

- [backend-node/src/estimate-duplicate-policy.ts](<../../../backend-node/src/estimate-duplicate-policy.ts>)
- [backend-node/src/http.ts](<../../../backend-node/src/http.ts>)
- [backend-node/src/estimate-labor-category.ts](<../../../backend-node/src/estimate-labor-category.ts>)
- [backend-node/src/feature-flags.ts](<../../../backend-node/src/feature-flags.ts>)
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

`dbo.audit_log`, `dbo.cost_items`, `dbo.customers`, `dbo.document_lifecycle_events`, `dbo.estimate_assignments`, `dbo.estimate_erp_groups`, `dbo.estimate_erp_mappings`, `dbo.estimate_module_details`, `dbo.estimate_overhead_snapshots`, `dbo.estimate_revisions`, `dbo.estimate_submission_snapshots`, `dbo.estimates`, `dbo.expense_lines`, `dbo.fn_estimate_validation`, `dbo.inquiries`, `dbo.inquiry_attachments`, `dbo.manhour_lines`, `dbo.other_cost_lines`, `dbo.suppliers`, `dbo.user_effective_roles`, `dbo.users`, `dbo.v_estimate_cost_amounts`, `dbo.v_estimate_totals`

## Change boundary

Read the selected handler and helpers it calls, then its caller in api-client.ts. Verify permission checks, record scope, transaction, rowVersion and audit on that path; a route name alone does not prove authorization. Dynamic routes/SQL, helper side effects and runtime config require source inspection.
