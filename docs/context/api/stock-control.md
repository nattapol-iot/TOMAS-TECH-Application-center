# stock-control

[Module](../modules/inventory.md) · [Index](../../../AGENTS.md)

Evidence: source snapshot `5eb9231a`; generated, do not edit. [backend-node/src/routes/stock-control.ts](<../../../backend-node/src/routes/stock-control.ts>). Ranges are hints: search symbol after edits.

## API operations

| Method | Path | Source lines |
|---|---|---|
| GET | `/api/v1/stock-adjustments` | 16–17 |
| POST | `/api/v1/stock-adjustments` | 19–19 |
| POST | `/api/v1/stock-adjustments/:id/decide` | 21–22 |
| GET | `/api/v1/quarantine` | 24–24 |
| POST | `/api/v1/quarantine/release` | 26–26 |

## Named functions

| Symbol | Source | Lines |
|---|---|---|
| `todayIn` | [backend-node/src/routes/stock-control.ts](<../../../backend-node/src/routes/stock-control.ts>) | 12–12 |
| `change` | [backend-node/src/routes/stock-control.ts](<../../../backend-node/src/routes/stock-control.ts>) | 13–13 |
| `registerStockControlRoutes` | [backend-node/src/routes/stock-control.ts](<../../../backend-node/src/routes/stock-control.ts>) | 15–27 |

## Direct local dependencies

- [backend-node/src/config.ts](<../../../backend-node/src/config.ts>)
- [backend-node/src/db.ts](<../../../backend-node/src/db.ts>)
- [backend-node/src/document-number.ts](<../../../backend-node/src/document-number.ts>)
- [backend-node/src/errors.ts](<../../../backend-node/src/errors.ts>)
- [backend-node/src/http.ts](<../../../backend-node/src/http.ts>)
- [backend-node/src/material-audit.ts](<../../../backend-node/src/material-audit.ts>)
- [backend-node/src/stock-ledger.ts](<../../../backend-node/src/stock-ledger.ts>)
- [backend-node/src/users.ts](<../../../backend-node/src/users.ts>)

## SQL references (literal scan, not a complete schema or write-set)

`dbo.mat_items`, `dbo.stock_adjustments`, `dbo.stock_txns`, `dbo.users`, `dbo.v_item_balances`

## Change boundary

Read the selected handler and helpers it calls, then its caller in api-client.ts. Verify permission checks, record scope, transaction, rowVersion and audit on that path; a route name alone does not prove authorization. Dynamic routes/SQL, helper side effects and runtime config require source inspection.
