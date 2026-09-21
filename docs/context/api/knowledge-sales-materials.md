# knowledge-sales-materials

[Module](../modules/knowledge.md) · [Index](../../../AGENTS.md)

Evidence: source snapshot `80a5348e`; generated, do not edit. [backend-node/src/routes/knowledge-sales-materials.ts](<../../../backend-node/src/routes/knowledge-sales-materials.ts>). Ranges are hints: search symbol after edits.

## API operations

| Method | Path | Source lines |
|---|---|---|
| GET | `/api/v1/knowledge/sales-materials` | 85–90 |
| PUT | `/api/v1/knowledge/sales-materials` | 91–98 |

## Named functions

| Symbol | Source | Lines |
|---|---|---|
| `object` | [backend-node/src/routes/knowledge-sales-materials.ts](<../../../backend-node/src/routes/knowledge-sales-materials.ts>) | 19–22 |
| `text` | [backend-node/src/routes/knowledge-sales-materials.ts](<../../../backend-node/src/routes/knowledge-sales-materials.ts>) | 24–27 |
| `validateSalesMaterialCatalog` | [backend-node/src/routes/knowledge-sales-materials.ts](<../../../backend-node/src/routes/knowledge-sales-materials.ts>) | 29–60 |
| `readCatalog` | [backend-node/src/routes/knowledge-sales-materials.ts](<../../../backend-node/src/routes/knowledge-sales-materials.ts>) | 62–69 |
| `replaceCatalog` | [backend-node/src/routes/knowledge-sales-materials.ts](<../../../backend-node/src/routes/knowledge-sales-materials.ts>) | 71–81 |
| `registerKnowledgeSalesMaterialRoutes` | [backend-node/src/routes/knowledge-sales-materials.ts](<../../../backend-node/src/routes/knowledge-sales-materials.ts>) | 83–99 |

## Direct local dependencies

- [backend-node/src/config.ts](<../../../backend-node/src/config.ts>)
- [backend-node/src/db.ts](<../../../backend-node/src/db.ts>)
- [backend-node/src/errors.ts](<../../../backend-node/src/errors.ts>)
- [backend-node/src/document-storage.ts](<../../../backend-node/src/document-storage.ts>)
- [backend-node/src/users.ts](<../../../backend-node/src/users.ts>)

## SQL references (literal scan, not a complete schema or write-set)

No literal dbo reference in this file; follow dependencies.

## Change boundary

Read the selected handler and helpers it calls, then its caller in api-client.ts. Verify permission checks, record scope, transaction, rowVersion and audit on that path; a route name alone does not prove authorization. Dynamic routes/SQL, helper side effects and runtime config require source inspection.
