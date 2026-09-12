# goods-receipts

[Module](../modules/inventory.md) · [Index](../../../AGENTS.md)

Evidence: source snapshot `e867e48e`; generated, do not edit. [backend-node/src/routes/goods-receipts.ts](<../../../backend-node/src/routes/goods-receipts.ts>). Ranges are hints: search symbol after edits.

## API operations

| Method | Path | Source lines |
|---|---|---|
| GET | `/api/v1/purchase-orders` | 61–75 |
| GET | `/api/v1/purchase-orders/:id` | 77–89 |
| GET | `/api/v1/goods-receipts` | 91–99 |
| GET | `/api/v1/goods-receipts/:id` | 101–113 |
| POST | `/api/v1/goods-receipts` | 115–123 |
| POST | `/api/v1/goods-receipts/:id/confirm` | 125–148 |

## Named functions

| Symbol | Source | Lines |
|---|---|---|
| `todayIn` | [backend-node/src/routes/goods-receipts.ts](<../../../backend-node/src/routes/goods-receipts.ts>) | 19–20 |
| `amount` | [backend-node/src/routes/goods-receipts.ts](<../../../backend-node/src/routes/goods-receipts.ts>) | 21–22 |
| `parseLines` | [backend-node/src/routes/goods-receipts.ts](<../../../backend-node/src/routes/goods-receipts.ts>) | 23–33 |
| `insertLine` | [backend-node/src/routes/goods-receipts.ts](<../../../backend-node/src/routes/goods-receipts.ts>) | 35–51 |
| `refreshPo` | [backend-node/src/routes/goods-receipts.ts](<../../../backend-node/src/routes/goods-receipts.ts>) | 53–58 |
| `registerGoodsReceiptRoutes` | [backend-node/src/routes/goods-receipts.ts](<../../../backend-node/src/routes/goods-receipts.ts>) | 60–149 |

## Direct local dependencies

- [backend-node/src/config.ts](<../../../backend-node/src/config.ts>)
- [backend-node/src/db.ts](<../../../backend-node/src/db.ts>)
- [backend-node/src/document-number.ts](<../../../backend-node/src/document-number.ts>)
- [backend-node/src/errors.ts](<../../../backend-node/src/errors.ts>)
- [backend-node/src/http.ts](<../../../backend-node/src/http.ts>)
- [backend-node/src/material-audit.ts](<../../../backend-node/src/material-audit.ts>)
- [backend-node/src/project-scope.ts](<../../../backend-node/src/project-scope.ts>)
- [backend-node/src/stock-ledger.ts](<../../../backend-node/src/stock-ledger.ts>)
- [backend-node/src/site-visit-common.ts](<../../../backend-node/src/site-visit-common.ts>)
- [backend-node/src/users.ts](<../../../backend-node/src/users.ts>)

## SQL references (literal scan, not a complete schema or write-set)

`dbo.grn_lines`, `dbo.grns`, `dbo.mat_items`, `dbo.mat_po_lines`, `dbo.mat_pos`, `dbo.mat_pr_lines`, `dbo.mat_prs`, `dbo.project_members`, `dbo.projects`, `dbo.suppliers`, `dbo.users`

## Change boundary

Read the selected handler and helpers it calls, then its caller in api-client.ts. Verify permission checks, record scope, transaction, rowVersion and audit on that path; a route name alone does not prove authorization. Dynamic routes/SQL, helper side effects and runtime config require source inspection.
