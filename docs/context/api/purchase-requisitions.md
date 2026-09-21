# purchase-requisitions

[Module](../modules/procurement.md) · [Index](../../../AGENTS.md)

Evidence: source snapshot `80a5348e`; generated, do not edit. [backend-node/src/routes/purchase-requisitions.ts](<../../../backend-node/src/routes/purchase-requisitions.ts>). Ranges are hints: search symbol after edits.

## API operations

| Method | Path | Source lines |
|---|---|---|
| GET | `/api/v1/purchase-requisitions` | 87–103 |
| GET | `/api/v1/purchase-requisitions/:id` | 105–127 |
| POST | `/api/v1/purchase-requisitions` | 129–144 |
| POST | `/api/v1/purchase-requisitions/:id/submit` | 146–156 |
| POST | `/api/v1/purchase-requisitions/:id/decide` | 158–176 |
| POST | `/api/v1/purchase-requisitions/:id/convert` | 178–192 |

## Named functions

| Symbol | Source | Lines |
|---|---|---|
| `todayIn` | [backend-node/src/routes/purchase-requisitions.ts](<../../../backend-node/src/routes/purchase-requisitions.ts>) | 22–23 |
| `decimal` | [backend-node/src/routes/purchase-requisitions.ts](<../../../backend-node/src/routes/purchase-requisitions.ts>) | 24–25 |
| `readHeader` | [backend-node/src/routes/purchase-requisitions.ts](<../../../backend-node/src/routes/purchase-requisitions.ts>) | 26–28 |
| `parseLines` | [backend-node/src/routes/purchase-requisitions.ts](<../../../backend-node/src/routes/purchase-requisitions.ts>) | 30–35 |
| `insertLine` | [backend-node/src/routes/purchase-requisitions.ts](<../../../backend-node/src/routes/purchase-requisitions.ts>) | 37–67 |
| `buildApprovalRoute` | [backend-node/src/routes/purchase-requisitions.ts](<../../../backend-node/src/routes/purchase-requisitions.ts>) | 69–84 |
| `registerPurchaseRequisitionRoutes` | [backend-node/src/routes/purchase-requisitions.ts](<../../../backend-node/src/routes/purchase-requisitions.ts>) | 86–193 |

## Direct local dependencies

- [backend-node/src/config.ts](<../../../backend-node/src/config.ts>)
- [backend-node/src/db.ts](<../../../backend-node/src/db.ts>)
- [backend-node/src/document-number.ts](<../../../backend-node/src/document-number.ts>)
- [backend-node/src/errors.ts](<../../../backend-node/src/errors.ts>)
- [backend-node/src/user-roles.ts](<../../../backend-node/src/user-roles.ts>)
- [backend-node/src/user-roles.ts](<../../../backend-node/src/user-roles.ts>)
- [backend-node/src/http.ts](<../../../backend-node/src/http.ts>)
- [backend-node/src/material-audit.ts](<../../../backend-node/src/material-audit.ts>)
- [backend-node/src/procurement-rules.ts](<../../../backend-node/src/procurement-rules.ts>)
- [backend-node/src/project-scope.ts](<../../../backend-node/src/project-scope.ts>)
- [backend-node/src/types.ts](<../../../backend-node/src/types.ts>)
- [backend-node/src/users.ts](<../../../backend-node/src/users.ts>)

## SQL references (literal scan, not a complete schema or write-set)

`dbo.bom_lines`, `dbo.boms`, `dbo.cost_items`, `dbo.grn_lines`, `dbo.grns`, `dbo.mat_items`, `dbo.mat_po_lines`, `dbo.mat_pos`, `dbo.mat_pr_approval_steps`, `dbo.mat_pr_lines`, `dbo.mat_prs`, `dbo.mir_lines`, `dbo.mirs`, `dbo.project_members`, `dbo.projects`, `dbo.reservations`, `dbo.suppliers`, `dbo.user_effective_roles`, `dbo.users`, `dbo.v_item_balances`

## Change boundary

Read the selected handler and helpers it calls, then its caller in api-client.ts. Verify permission checks, record scope, transaction, rowVersion and audit on that path; a route name alone does not prove authorization. Dynamic routes/SQL, helper side effects and runtime config require source inspection.
