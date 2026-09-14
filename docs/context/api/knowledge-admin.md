# knowledge-admin

[Module](../modules/knowledge.md) · [Index](../../../AGENTS.md)

Evidence: source snapshot `dff9a24`; generated, do not edit. [backend-node/src/routes/knowledge-admin.ts](<../../../backend-node/src/routes/knowledge-admin.ts>). Ranges are hints: search symbol after edits.

## API operations

| Method | Path | Source lines |
|---|---|---|
| GET | `/api/v1/knowledge/dashboard` | 18–18 |
| GET | `/api/v1/knowledge/categories` | 20–20 |
| POST | `/api/v1/knowledge/categories` | 22–22 |
| PUT | `/api/v1/knowledge/categories/:id` | 23–23 |
| GET | `/api/v1/knowledge/number-sequences` | 25–25 |
| POST | `/api/v1/knowledge/number-sequences` | 26–26 |
| PUT | `/api/v1/knowledge/number-sequences/:id` | 27–27 |

## Named functions

| Symbol | Source | Lines |
|---|---|---|
| `todayIn` | [backend-node/src/routes/knowledge-admin.ts](<../../../backend-node/src/routes/knowledge-admin.ts>) | 10–10 |
| `optionalString` | [backend-node/src/routes/knowledge-admin.ts](<../../../backend-node/src/routes/knowledge-admin.ts>) | 11–11 |
| `categoryBody` | [backend-node/src/routes/knowledge-admin.ts](<../../../backend-node/src/routes/knowledge-admin.ts>) | 12–12 |
| `bindCategory` | [backend-node/src/routes/knowledge-admin.ts](<../../../backend-node/src/routes/knowledge-admin.ts>) | 13–13 |
| `sequenceBody` | [backend-node/src/routes/knowledge-admin.ts](<../../../backend-node/src/routes/knowledge-admin.ts>) | 14–14 |
| `bindSequence` | [backend-node/src/routes/knowledge-admin.ts](<../../../backend-node/src/routes/knowledge-admin.ts>) | 15–15 |
| `registerKnowledgeAdminRoutes` | [backend-node/src/routes/knowledge-admin.ts](<../../../backend-node/src/routes/knowledge-admin.ts>) | 17–28 |

## Direct local dependencies

- [backend-node/src/config.ts](<../../../backend-node/src/config.ts>)
- [backend-node/src/db.ts](<../../../backend-node/src/db.ts>)
- [backend-node/src/errors.ts](<../../../backend-node/src/errors.ts>)
- [backend-node/src/http.ts](<../../../backend-node/src/http.ts>)
- [backend-node/src/knowledge-common.ts](<../../../backend-node/src/knowledge-common.ts>)
- [backend-node/src/users.ts](<../../../backend-node/src/users.ts>)

## SQL references (literal scan, not a complete schema or write-set)

`dbo.knowledge_articles`, `dbo.knowledge_categories`, `dbo.knowledge_document_acknowledgements`, `dbo.knowledge_document_approvals`, `dbo.knowledge_document_versions`, `dbo.knowledge_documents`, `dbo.knowledge_number_sequences`, `dbo.users`

## Change boundary

Read the selected handler and helpers it calls, then its caller in api-client.ts. Verify permission checks, record scope, transaction, rowVersion and audit on that path; a route name alone does not prove authorization. Dynamic routes/SQL, helper side effects and runtime config require source inspection.
