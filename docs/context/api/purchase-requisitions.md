# purchase-requisitions

[Module](../modules/procurement.md) · [Index](../../../AGENTS.md)

Evidence: source snapshot `781d8326`; generated, do not edit. [backend-node/src/routes/purchase-requisitions.ts](<../../../backend-node/src/routes/purchase-requisitions.ts>). Ranges are hints: search symbol after edits.

## API operations

| Method | Path | Source lines |
|---|---|---|
| GET | `/api/v1/purchase-requisitions` | 296–322 |
| GET | `/api/v1/purchase-requisitions/approval-route` | 326–335 |
| GET | `/api/v1/purchase-requisitions/:id` | 337–360 |
| POST | `/api/v1/purchase-requisitions` | 362–381 |
| PUT | `/api/v1/purchase-requisitions/:id` | 385–406 |
| POST | `/api/v1/purchase-requisitions/:id/submit` | 408–420 |
| POST | `/api/v1/purchase-requisitions/:id/decide` | 422–485 |
| POST | `/api/v1/purchase-requisitions/:id/erp-send` | 488–497 |
| POST | `/api/v1/purchase-requisitions/erp-sync` | 502–525 |
| POST | `/api/v1/purchase-requisitions/:id/erp-sync` | 528–542 |
| GET | `/api/v1/erp/purchasing/options` | 545–551 |
| POST | `/api/v1/purchase-requisitions/:id/withdraw` | 580–596 |
| POST | `/api/v1/purchase-requisitions/:id/cancel` | 600–613 |
| GET | `/api/v1/procurement/approvals/attention` | 616–626 |

## Named functions

| Symbol | Source | Lines |
|---|---|---|
| `erpView` | [backend-node/src/routes/purchase-requisitions.ts](<../../../backend-node/src/routes/purchase-requisitions.ts>) | 37–38 |
| `todayIn` | [backend-node/src/routes/purchase-requisitions.ts](<../../../backend-node/src/routes/purchase-requisitions.ts>) | 40–41 |
| `decimal` | [backend-node/src/routes/purchase-requisitions.ts](<../../../backend-node/src/routes/purchase-requisitions.ts>) | 42–43 |
| `readHeader` | [backend-node/src/routes/purchase-requisitions.ts](<../../../backend-node/src/routes/purchase-requisitions.ts>) | 44–46 |
| `parseLines` | [backend-node/src/routes/purchase-requisitions.ts](<../../../backend-node/src/routes/purchase-requisitions.ts>) | 49–68 |
| `parseRequestFields` | [backend-node/src/routes/purchase-requisitions.ts](<../../../backend-node/src/routes/purchase-requisitions.ts>) | 71–74 |
| `requestableBomLines` | [backend-node/src/routes/purchase-requisitions.ts](<../../../backend-node/src/routes/purchase-requisitions.ts>) | 77–94 |
| `assertActiveSuppliers` | [backend-node/src/routes/purchase-requisitions.ts](<../../../backend-node/src/routes/purchase-requisitions.ts>) | 96–101 |
| `insertLines` | [backend-node/src/routes/purchase-requisitions.ts](<../../../backend-node/src/routes/purchase-requisitions.ts>) | 104–116 |
| `approvalRoute` | [backend-node/src/routes/purchase-requisitions.ts](<../../../backend-node/src/routes/purchase-requisitions.ts>) | 119–130 |
| `buildApprovalRoute` | [backend-node/src/routes/purchase-requisitions.ts](<../../../backend-node/src/routes/purchase-requisitions.ts>) | 132–141 |
| `stepsOf` | [backend-node/src/routes/purchase-requisitions.ts](<../../../backend-node/src/routes/purchase-requisitions.ts>) | 144–146 |
| `demandPrScope` | [backend-node/src/routes/purchase-requisitions.ts](<../../../backend-node/src/routes/purchase-requisitions.ts>) | 160–164 |
| `noticeWaiting` | [backend-node/src/routes/purchase-requisitions.ts](<../../../backend-node/src/routes/purchase-requisitions.ts>) | 171–190 |
| `noticeRequester` | [backend-node/src/routes/purchase-requisitions.ts](<../../../backend-node/src/routes/purchase-requisitions.ts>) | 196–210 |
| `registerPurchaseRequisitionRoutes` | [backend-node/src/routes/purchase-requisitions.ts](<../../../backend-node/src/routes/purchase-requisitions.ts>) | 212–628 |

## Direct local dependencies

- [backend-node/src/config.ts](<../../../backend-node/src/config.ts>)
- [backend-node/src/db.ts](<../../../backend-node/src/db.ts>)
- [backend-node/src/document-number.ts](<../../../backend-node/src/document-number.ts>)
- [backend-node/src/errors.ts](<../../../backend-node/src/errors.ts>)
- [backend-node/src/user-roles.ts](<../../../backend-node/src/user-roles.ts>)
- [backend-node/src/http.ts](<../../../backend-node/src/http.ts>)
- [backend-node/src/material-audit.ts](<../../../backend-node/src/material-audit.ts>)
- [backend-node/src/procurement-rules.ts](<../../../backend-node/src/procurement-rules.ts>)
- [backend-node/src/email.ts](<../../../backend-node/src/email.ts>)
- [backend-node/src/erp-purchasing.ts](<../../../backend-node/src/erp-purchasing.ts>)
- [backend-node/src/project-scope.ts](<../../../backend-node/src/project-scope.ts>)
- [backend-node/src/site-visit-common.ts](<../../../backend-node/src/site-visit-common.ts>)
- [backend-node/src/types.ts](<../../../backend-node/src/types.ts>)
- [backend-node/src/users.ts](<../../../backend-node/src/users.ts>)

## SQL references (literal scan, not a complete schema or write-set)

`dbo.bom_lines`, `dbo.boms`, `dbo.cost_items`, `dbo.mat_items`, `dbo.mat_pr_approval_steps`, `dbo.mat_pr_lines`, `dbo.mat_prs`, `dbo.mir_lines`, `dbo.mirs`, `dbo.pr_approval_settings`, `dbo.pr_department_approvers`, `dbo.project_members`, `dbo.projects`, `dbo.reservations`, `dbo.stock_adjustments`, `dbo.suppliers`, `dbo.user_effective_permissions`, `dbo.user_effective_roles`, `dbo.users`

## Change boundary

Read the selected handler and helpers it calls, then its caller in api-client.ts. Verify permission checks, record scope, transaction, rowVersion and audit on that path; a route name alone does not prove authorization. Dynamic routes/SQL, helper side effects and runtime config require source inspection.
