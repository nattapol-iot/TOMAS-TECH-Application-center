# purchase-requisitions

[Module](../modules/procurement.md) · [Index](../../../AGENTS.md)

Evidence: source snapshot `94a2ee70`; generated, do not edit. [backend-node/src/routes/purchase-requisitions.ts](<../../../backend-node/src/routes/purchase-requisitions.ts>). Ranges are hints: search symbol after edits.

## API operations

| Method | Path | Source lines |
|---|---|---|
| GET | `/api/v1/purchase-requisitions` | 804–878 |
| GET | `/api/v1/purchase-requisitions/approval-route` | 882–900 |
| GET | `/api/v1/purchase-requisitions/:id` | 902–1032 |
| POST | `/api/v1/purchase-requisitions` | 1034–1094 |
| PUT | `/api/v1/purchase-requisitions/:id` | 1098–1164 |
| POST | `/api/v1/purchase-requisitions/:id/submit` | 1166–1215 |
| POST | `/api/v1/purchase-requisitions/:id/decide` | 1217–1357 |
| POST | `/api/v1/purchase-requisitions/:id/erp-send` | 1360–1377 |
| POST | `/api/v1/purchase-requisitions/erp-sync` | 1382–1440 |
| POST | `/api/v1/purchase-requisitions/:id/erp-sync` | 1443–1479 |
| GET | `/api/v1/erp/purchasing/options` | 1482–1490 |
| POST | `/api/v1/purchase-requisitions/:id/withdraw` | 1534–1579 |
| POST | `/api/v1/purchase-requisitions/:id/cancel` | 1583–1620 |
| POST | `/api/v1/purchase-requisitions/:id/request-list-uploaded` | 1624–1637 |
| GET | `/api/v1/procurement/approvals/attention` | 1640–1656 |

## Named functions

| Symbol | Source | Lines |
|---|---|---|
| `textOrNull` | [backend-node/src/routes/purchase-requisitions.ts](<../../../backend-node/src/routes/purchase-requisitions.ts>) | 104–104 |
| `erpView` | [backend-node/src/routes/purchase-requisitions.ts](<../../../backend-node/src/routes/purchase-requisitions.ts>) | 105–120 |
| `decimal` | [backend-node/src/routes/purchase-requisitions.ts](<../../../backend-node/src/routes/purchase-requisitions.ts>) | 122–127 |
| `readHeader` | [backend-node/src/routes/purchase-requisitions.ts](<../../../backend-node/src/routes/purchase-requisitions.ts>) | 128–134 |
| `optionalLink` | [backend-node/src/routes/purchase-requisitions.ts](<../../../backend-node/src/routes/purchase-requisitions.ts>) | 137–148 |
| `parseLineForm` | [backend-node/src/routes/purchase-requisitions.ts](<../../../backend-node/src/routes/purchase-requisitions.ts>) | 151–162 |
| `parseLines` | [backend-node/src/routes/purchase-requisitions.ts](<../../../backend-node/src/routes/purchase-requisitions.ts>) | 165–197 |
| `parseRequestFields` | [backend-node/src/routes/purchase-requisitions.ts](<../../../backend-node/src/routes/purchase-requisitions.ts>) | 200–210 |
| `issueRequestNumber` | [backend-node/src/routes/purchase-requisitions.ts](<../../../backend-node/src/routes/purchase-requisitions.ts>) | 217–235 |
| `assertUnitOfProject` | [backend-node/src/routes/purchase-requisitions.ts](<../../../backend-node/src/routes/purchase-requisitions.ts>) | 238–245 |
| `requestableBomLines` | [backend-node/src/routes/purchase-requisitions.ts](<../../../backend-node/src/routes/purchase-requisitions.ts>) | 248–285 |
| `assertActiveSuppliers` | [backend-node/src/routes/purchase-requisitions.ts](<../../../backend-node/src/routes/purchase-requisitions.ts>) | 287–297 |
| `insertLines` | [backend-node/src/routes/purchase-requisitions.ts](<../../../backend-node/src/routes/purchase-requisitions.ts>) | 304–331 |
| `approvalRoute` | [backend-node/src/routes/purchase-requisitions.ts](<../../../backend-node/src/routes/purchase-requisitions.ts>) | 339–358 |
| `buildApprovalRoute` | [backend-node/src/routes/purchase-requisitions.ts](<../../../backend-node/src/routes/purchase-requisitions.ts>) | 360–385 |
| `stepsOf` | [backend-node/src/routes/purchase-requisitions.ts](<../../../backend-node/src/routes/purchase-requisitions.ts>) | 388–390 |
| `demandPrScope` | [backend-node/src/routes/purchase-requisitions.ts](<../../../backend-node/src/routes/purchase-requisitions.ts>) | 404–410 |
| `noticeWaiting` | [backend-node/src/routes/purchase-requisitions.ts](<../../../backend-node/src/routes/purchase-requisitions.ts>) | 417–455 |
| `noticeRequester` | [backend-node/src/routes/purchase-requisitions.ts](<../../../backend-node/src/routes/purchase-requisitions.ts>) | 461–503 |
| `registerPurchaseRequisitionRoutes` | [backend-node/src/routes/purchase-requisitions.ts](<../../../backend-node/src/routes/purchase-requisitions.ts>) | 505–1657 |

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

`dbo.bom_lines`, `dbo.boms`, `dbo.cost_items`, `dbo.mat_items`, `dbo.mat_pr_approval_steps`, `dbo.mat_pr_line_erp_orders`, `dbo.mat_pr_lines`, `dbo.mat_prs`, `dbo.mir_lines`, `dbo.mirs`, `dbo.pr_approval_settings`, `dbo.pr_department_approvers`, `dbo.pr_discipline_approvers`, `dbo.project_members`, `dbo.project_purchase_units`, `dbo.projects`, `dbo.reservations`, `dbo.stock_adjustments`, `dbo.suppliers`, `dbo.user_effective_permissions`, `dbo.user_effective_roles`, `dbo.users`

## Change boundary

Read the selected handler and helpers it calls, then its caller in api-client.ts. Verify permission checks, record scope, transaction, rowVersion and audit on that path; a route name alone does not prove authorization. Dynamic routes/SQL, helper side effects and runtime config require source inspection.
