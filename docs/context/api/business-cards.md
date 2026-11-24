# business-cards

[Module](../modules/master.md) · [Index](../../../AGENTS.md)

Evidence: source snapshot `b626b0e1`; generated, do not edit. [backend-node/src/routes/business-cards.ts](<../../../backend-node/src/routes/business-cards.ts>). Ranges are hints: search symbol after edits.

## API operations

| Method | Path | Source lines |
|---|---|---|
| POST | `/api/v1/business-cards/scan` | 13–34 |

## Named functions

| Symbol | Source | Lines |
|---|---|---|
| `registerBusinessCardRoutes` | [backend-node/src/routes/business-cards.ts](<../../../backend-node/src/routes/business-cards.ts>) | 12–35 |

## Direct local dependencies

- [backend-node/src/copilot-ocr/business-card.ts](<../../../backend-node/src/copilot-ocr/business-card.ts>)
- [backend-node/src/copilot-ocr/constants.ts](<../../../backend-node/src/copilot-ocr/constants.ts>)
- [backend-node/src/copilot-ocr/errors.ts](<../../../backend-node/src/copilot-ocr/errors.ts>)
- [backend-node/src/copilot-ocr/types.ts](<../../../backend-node/src/copilot-ocr/types.ts>)
- [backend-node/src/document-storage.ts](<../../../backend-node/src/document-storage.ts>)
- [backend-node/src/errors.ts](<../../../backend-node/src/errors.ts>)
- [backend-node/src/users.ts](<../../../backend-node/src/users.ts>)

## SQL references (literal scan, not a complete schema or write-set)

No literal dbo reference in this file; follow dependencies.

## Change boundary

Read the selected handler and helpers it calls, then its caller in api-client.ts. Verify permission checks, record scope, transaction, rowVersion and audit on that path; a route name alone does not prove authorization. Dynamic routes/SQL, helper side effects and runtime config require source inspection.
