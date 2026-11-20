# purchase-requisitions

[Module](../modules/procurement.md) · [Index](../../../AGENTS.md)

Evidence: source snapshot `c56ffc0c`; generated, do not edit. [backend-node/src/routes/purchase-requisitions.ts](<../../../backend-node/src/routes/purchase-requisitions.ts>). Ranges are hints: search symbol after edits.

## API operations

| Method | Path | Source lines |
|---|---|---|
| GET | `/api/v1/purchase-requisitions` | 297–323 |
| GET | `/api/v1/purchase-requisitions/approval-route` | 327–336 |
| GET | `/api/v1/purchase-requisitions/:id` | 338–361 |
| POST | `/api/v1/purchase-requisitions` | 363–382 |
| PUT | `/api/v1/purchase-requisitions/:id` | 386–407 |
| POST | `/api/v1/purchase-requisitions/:id/submit` | 409–421 |
| POST | `/api/v1/purchase-requisitions/:id/decide` | 423–486 |
| POST | `/api/v1/purchase-requisitions/:id/erp-send` | 489–498 |
| POST | `/api/v1/purchase-requisitions/erp-sync` | 503–526 |
| POST | `/api/v1/purchase-requisitions/:id/erp-sync` | 529–543 |
| GET | `/api/v1/erp/purchasing/options` | 546–552 |
| POST | `/api/v1/purchase-requisitions/:id/withdraw` | 581–597 |
| POST | `/api/v1/purchase-requisitions/:id/cancel` | 601–614 |
| GET | `/api/v1/procurement/approvals/attention` | 617–627 |

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
| `registerPurchaseRequisitionRoutes` | [backend-node/src/routes/purchase-requisitions.ts](<../../../backend-node/src/routes/purchase-requisitions.ts>) | 212–629 |

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
