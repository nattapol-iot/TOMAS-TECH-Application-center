# knowledge-articles

[Module](../modules/knowledge.md) · [Index](../../../AGENTS.md)

Evidence: source snapshot `e867e48e`; generated, do not edit. [backend-node/src/routes/knowledge-articles.ts](<../../../backend-node/src/routes/knowledge-articles.ts>). Ranges are hints: search symbol after edits.

## API operations

| Method | Path | Source lines |
|---|---|---|
| GET | `/api/v1/knowledge/articles` | 17–17 |
| GET | `/api/v1/knowledge/articles/:id` | 19–19 |
| POST | `/api/v1/knowledge/articles` | 21–21 |
| PUT | `/api/v1/knowledge/articles/:id` | 23–23 |
| POST | `/api/v1/knowledge/articles/:id/feedback` | 25–25 |

## Named functions

| Symbol | Source | Lines |
|---|---|---|
| `articleValue` | [backend-node/src/routes/knowledge-articles.ts](<../../../backend-node/src/routes/knowledge-articles.ts>) | 11–11 |
| `bindArticle` | [backend-node/src/routes/knowledge-articles.ts](<../../../backend-node/src/routes/knowledge-articles.ts>) | 12–12 |
| `row` | [backend-node/src/routes/knowledge-articles.ts](<../../../backend-node/src/routes/knowledge-articles.ts>) | 13–13 |
| `slugify` | [backend-node/src/routes/knowledge-articles.ts](<../../../backend-node/src/routes/knowledge-articles.ts>) | 14–14 |
| `registerKnowledgeArticleRoutes` | [backend-node/src/routes/knowledge-articles.ts](<../../../backend-node/src/routes/knowledge-articles.ts>) | 16–26 |

## Direct local dependencies

- [backend-node/src/db.ts](<../../../backend-node/src/db.ts>)
- [backend-node/src/errors.ts](<../../../backend-node/src/errors.ts>)
- [backend-node/src/http.ts](<../../../backend-node/src/http.ts>)
- [backend-node/src/knowledge-common.ts](<../../../backend-node/src/knowledge-common.ts>)
- [backend-node/src/users.ts](<../../../backend-node/src/users.ts>)

## SQL references (literal scan, not a complete schema or write-set)

`dbo.knowledge_articles`, `dbo.knowledge_categories`, `dbo.users`

## Change boundary

Read the selected handler and helpers it calls, then its caller in api-client.ts. Verify permission checks, record scope, transaction, rowVersion and audit on that path; a route name alone does not prove authorization. Dynamic routes/SQL, helper side effects and runtime config require source inspection.
