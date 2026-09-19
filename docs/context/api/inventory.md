# inventory

[Module](../modules/inventory.md) · [Index](../../../AGENTS.md)

Evidence: source snapshot `543450fe`; generated, do not edit. [backend-node/src/routes/inventory.ts](<../../../backend-node/src/routes/inventory.ts>). Ranges are hints: search symbol after edits.

## API operations

| Method | Path | Source lines |
|---|---|---|
| GET | `/api/v1/inventory/items` | 38–63 |
| GET | `/api/v1/inventory/items/:itemId/ledger` | 65–81 |

## Named functions

| Symbol | Source | Lines |
|---|---|---|
| `registerInventoryRoutes` | [backend-node/src/routes/inventory.ts](<../../../backend-node/src/routes/inventory.ts>) | 37–82 |

## Direct local dependencies

- [backend-node/src/db.ts](<../../../backend-node/src/db.ts>)
- [backend-node/src/http.ts](<../../../backend-node/src/http.ts>)
- [backend-node/src/users.ts](<../../../backend-node/src/users.ts>)

## SQL references (literal scan, not a complete schema or write-set)

`dbo.stock_txns`, `dbo.users`, `dbo.v_item_balances`

## Change boundary

Read the selected handler and helpers it calls, then its caller in api-client.ts. Verify permission checks, record scope, transaction, rowVersion and audit on that path; a route name alone does not prove authorization. Dynamic routes/SQL, helper side effects and runtime config require source inspection.
