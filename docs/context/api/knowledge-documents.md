# knowledge-documents

[Module](../modules/knowledge.md) · [Index](../../../AGENTS.md)

Evidence: source snapshot `84fdd5bc`; generated, do not edit. [backend-node/src/routes/knowledge-documents.ts](<../../../backend-node/src/routes/knowledge-documents.ts>). Ranges are hints: search symbol after edits.

## API operations

| Method | Path | Source lines |
|---|---|---|
| GET | `/api/v1/knowledge/documents` | 25–32 |
| GET | `/api/v1/knowledge/documents/:id` | 34–45 |
| POST | `/api/v1/knowledge/documents` | 47–53 |
| POST | `/api/v1/knowledge/documents/:id/versions` | 55–58 |
| GET | `/api/v1/knowledge/versions/:versionId/content` | 60–62 |

## Named functions

| Symbol | Source | Lines |
|---|---|---|
| `dateValue` | [backend-node/src/routes/knowledge-documents.ts](<../../../backend-node/src/routes/knowledge-documents.ts>) | 12–12 |
| `asId` | [backend-node/src/routes/knowledge-documents.ts](<../../../backend-node/src/routes/knowledge-documents.ts>) | 13–13 |
| `todayIn` | [backend-node/src/routes/knowledge-documents.ts](<../../../backend-node/src/routes/knowledge-documents.ts>) | 14–14 |
| `documentRow` | [backend-node/src/routes/knowledge-documents.ts](<../../../backend-node/src/routes/knowledge-documents.ts>) | 16–18 |
| `bindFile` | [backend-node/src/routes/knowledge-documents.ts](<../../../backend-node/src/routes/knowledge-documents.ts>) | 20–22 |
| `registerKnowledgeDocumentRoutes` | [backend-node/src/routes/knowledge-documents.ts](<../../../backend-node/src/routes/knowledge-documents.ts>) | 24–63 |

## Direct local dependencies

- [backend-node/src/config.ts](<../../../backend-node/src/config.ts>)
- [backend-node/src/db.ts](<../../../backend-node/src/db.ts>)
- [backend-node/src/document-storage.ts](<../../../backend-node/src/document-storage.ts>)
- [backend-node/src/errors.ts](<../../../backend-node/src/errors.ts>)
- [backend-node/src/http.ts](<../../../backend-node/src/http.ts>)
- [backend-node/src/knowledge-common.ts](<../../../backend-node/src/knowledge-common.ts>)
- [backend-node/src/users.ts](<../../../backend-node/src/users.ts>)

## SQL references (literal scan, not a complete schema or write-set)

`dbo.knowledge_categories`, `dbo.knowledge_document_acknowledgements`, `dbo.knowledge_document_approvals`, `dbo.knowledge_document_files`, `dbo.knowledge_document_permissions`, `dbo.knowledge_document_relations`, `dbo.knowledge_document_versions`, `dbo.knowledge_documents`, `dbo.users`

## Change boundary

Read the selected handler and helpers it calls, then its caller in api-client.ts. Verify permission checks, record scope, transaction, rowVersion and audit on that path; a route name alone does not prove authorization. Dynamic routes/SQL, helper side effects and runtime config require source inspection.
