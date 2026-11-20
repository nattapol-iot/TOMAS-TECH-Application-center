# purchase-requisitions

[Module](../modules/procurement.md) · [Index](../../../AGENTS.md)

Evidence: source snapshot `ab865b7c`; generated, do not edit. [backend-node/src/routes/purchase-requisitions.ts](<../../../backend-node/src/routes/purchase-requisitions.ts>). Ranges are hints: search symbol after edits.

## API operations

| Method | Path | Source lines |
|---|---|---|
| GET | `/api/v1/purchase-requisitions` | 444–472 |
| GET | `/api/v1/purchase-requisitions/approval-route` | 476–485 |
| GET | `/api/v1/purchase-requisitions/:id` | 487–528 |
| POST | `/api/v1/purchase-requisitions` | 530–549 |
| PUT | `/api/v1/purchase-requisitions/:id` | 553–577 |
| POST | `/api/v1/purchase-requisitions/:id/submit` | 579–597 |
| POST | `/api/v1/purchase-requisitions/:id/decide` | 599–663 |
| POST | `/api/v1/purchase-requisitions/:id/erp-send` | 666–675 |
| POST | `/api/v1/purchase-requisitions/erp-sync` | 680–710 |
| POST | `/api/v1/purchase-requisitions/:id/erp-sync` | 713–742 |
| GET | `/api/v1/erp/purchasing/options` | 745–751 |
| POST | `/api/v1/purchase-requisitions/:id/withdraw` | 788–807 |
| POST | `/api/v1/purchase-requisitions/:id/cancel` | 811–824 |
| POST | `/api/v1/purchase-requisitions/:id/request-list-uploaded` | 828–836 |
| GET | `/api/v1/procurement/approvals/attention` | 839–849 |

## Named functions

| Symbol | Source | Lines |
|---|---|---|
| `textOrNull` | [backend-node/src/routes/purchase-requisitions.ts](<../../../backend-node/src/routes/purchase-requisitions.ts>) | 41–41 |
| `erpView` | [backend-node/src/routes/purchase-requisitions.ts](<../../../backend-node/src/routes/purchase-requisitions.ts>) | 42–45 |
| `decimal` | [backend-node/src/routes/purchase-requisitions.ts](<../../../backend-node/src/routes/purchase-requisitions.ts>) | 47–48 |
| `readHeader` | [backend-node/src/routes/purchase-requisitions.ts](<../../../backend-node/src/routes/purchase-requisitions.ts>) | 49–51 |
| `optionalLink` | [backend-node/src/routes/purchase-requisitions.ts](<../../../backend-node/src/routes/purchase-requisitions.ts>) | 54–61 |
| `parseLineForm` | [backend-node/src/routes/purchase-requisitions.ts](<../../../backend-node/src/routes/purchase-requisitions.ts>) | 64–70 |
| `parseLines` | [backend-node/src/routes/purchase-requisitions.ts](<../../../backend-node/src/routes/purchase-requisitions.ts>) | 73–96 |
| `parseRequestFields` | [backend-node/src/routes/purchase-requisitions.ts](<../../../backend-node/src/routes/purchase-requisitions.ts>) | 99–104 |
| `issueRequestNumber` | [backend-node/src/routes/purchase-requisitions.ts](<../../../backend-node/src/routes/purchase-requisitions.ts>) | 111–124 |
| `assertUnitOfProject` | [backend-node/src/routes/purchase-requisitions.ts](<../../../backend-node/src/routes/purchase-requisitions.ts>) | 127–132 |
| `requestableBomLines` | [backend-node/src/routes/purchase-requisitions.ts](<../../../backend-node/src/routes/purchase-requisitions.ts>) | 135–152 |
| `assertActiveSuppliers` | [backend-node/src/routes/purchase-requisitions.ts](<../../../backend-node/src/routes/purchase-requisitions.ts>) | 154–159 |
| `insertLines` | [backend-node/src/routes/purchase-requisitions.ts](<../../../backend-node/src/routes/purchase-requisitions.ts>) | 166–189 |
| `approvalRoute` | [backend-node/src/routes/purchase-requisitions.ts](<../../../backend-node/src/routes/purchase-requisitions.ts>) | 192–203 |
| `buildApprovalRoute` | [backend-node/src/routes/purchase-requisitions.ts](<../../../backend-node/src/routes/purchase-requisitions.ts>) | 205–214 |
| `stepsOf` | [backend-node/src/routes/purchase-requisitions.ts](<../../../backend-node/src/routes/purchase-requisitions.ts>) | 217–219 |
| `demandPrScope` | [backend-node/src/routes/purchase-requisitions.ts](<../../../backend-node/src/routes/purchase-requisitions.ts>) | 233–237 |
| `noticeWaiting` | [backend-node/src/routes/purchase-requisitions.ts](<../../../backend-node/src/routes/purchase-requisitions.ts>) | 244–263 |
| `noticeRequester` | [backend-node/src/routes/purchase-requisitions.ts](<../../../backend-node/src/routes/purchase-requisitions.ts>) | 269–283 |
| `registerPurchaseRequisitionRoutes` | [backend-node/src/routes/purchase-requisitions.ts](<../../../backend-node/src/routes/purchase-requisitions.ts>) | 285–851 |

## Direct local dependencies

- [backend-node/src/config.ts](<../../../backend-node/src/config.ts>)
- [backend-node/src/db.ts](<../../../backend-node/src/db.ts>)
- [backend-node/src/errors.ts](<../../../backend-node/src/errors.ts>)
- [backend-node/src/user-roles.ts](<../../../backend-node/src/user-roles.ts>)
- [backend-node/src/http.ts](<../../../backend-node/src/http.ts>)
- [backend-node/src/material-audit.ts](<../../../backend-node/src/material-audit.ts>)
- [backend-node/src/procurement-rules.ts](<../../../backend-node/src/procurement-rules.ts>)
- [backend-node/src/procurement-rules.ts](<../../../backend-node/src/procurement-rules.ts>)
- [backend-node/src/email.ts](<../../../backend-node/src/email.ts>)
- [backend-node/src/erp-purchasing.ts](<../../../backend-node/src/erp-purchasing.ts>)
- [backend-node/src/erp-request-list.ts](<../../../backend-node/src/erp-request-list.ts>)
- [backend-node/src/project-scope.ts](<../../../backend-node/src/project-scope.ts>)
- [backend-node/src/site-visit-common.ts](<../../../backend-node/src/site-visit-common.ts>)
- [backend-node/src/types.ts](<../../../backend-node/src/types.ts>)
- [backend-node/src/users.ts](<../../../backend-node/src/users.ts>)

## SQL references (literal scan, not a complete schema or write-set)

`dbo.bom_lines`, `dbo.boms`, `dbo.cost_items`, `dbo.mat_items`, `dbo.mat_pr_approval_steps`, `dbo.mat_pr_line_erp_orders`, `dbo.mat_pr_lines`, `dbo.mat_prs`, `dbo.mir_lines`, `dbo.mirs`, `dbo.pr_approval_settings`, `dbo.pr_department_approvers`, `dbo.project_members`, `dbo.project_purchase_units`, `dbo.projects`, `dbo.reservations`, `dbo.stock_adjustments`, `dbo.suppliers`, `dbo.user_effective_permissions`, `dbo.user_effective_roles`, `dbo.users`

## Change boundary

Read the selected handler and helpers it calls, then its caller in api-client.ts. Verify permission checks, record scope, transaction, rowVersion and audit on that path; a route name alone does not prove authorization. Dynamic routes/SQL, helper side effects and runtime config require source inspection.
