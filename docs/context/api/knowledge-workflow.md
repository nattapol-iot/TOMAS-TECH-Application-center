# knowledge-workflow

[Module](../modules/knowledge.md) · [Index](../../../AGENTS.md)

Evidence: source snapshot `1e58594b`; generated, do not edit. [backend-node/src/routes/knowledge-workflow.ts](<../../../backend-node/src/routes/knowledge-workflow.ts>). Ranges are hints: search symbol after edits.

## API operations

| Method | Path | Source lines |
|---|---|---|
| POST | `/api/v1/knowledge/versions/:versionId/submit` | 14–17 |
| POST | `/api/v1/knowledge/versions/:versionId/decide` | 19–22 |
| POST | `/api/v1/knowledge/versions/:versionId/publish` | 24–27 |
| POST | `/api/v1/knowledge/documents/:id/working-status` | 29–31 |
| POST | `/api/v1/knowledge/documents/:id/archive` | 33–33 |
| POST | `/api/v1/knowledge/documents/:id/restore` | 35–35 |

## Named functions

| Symbol | Source | Lines |
|---|---|---|
| `optionalText` | [backend-node/src/routes/knowledge-workflow.ts](<../../../backend-node/src/routes/knowledge-workflow.ts>) | 10–10 |
| `todayIn` | [backend-node/src/routes/knowledge-workflow.ts](<../../../backend-node/src/routes/knowledge-workflow.ts>) | 11–11 |
| `registerKnowledgeWorkflowRoutes` | [backend-node/src/routes/knowledge-workflow.ts](<../../../backend-node/src/routes/knowledge-workflow.ts>) | 13–36 |

## Direct local dependencies

- [backend-node/src/config.ts](<../../../backend-node/src/config.ts>)
- [backend-node/src/db.ts](<../../../backend-node/src/db.ts>)
- [backend-node/src/errors.ts](<../../../backend-node/src/errors.ts>)
- [backend-node/src/http.ts](<../../../backend-node/src/http.ts>)
- [backend-node/src/knowledge-common.ts](<../../../backend-node/src/knowledge-common.ts>)
- [backend-node/src/users.ts](<../../../backend-node/src/users.ts>)

## SQL references (literal scan, not a complete schema or write-set)

`dbo.knowledge_document_approvals`, `dbo.knowledge_document_permissions`, `dbo.knowledge_document_versions`, `dbo.knowledge_documents`, `dbo.users`

## Change boundary

Read the selected handler and helpers it calls, then its caller in api-client.ts. Verify permission checks, record scope, transaction, rowVersion and audit on that path; a route name alone does not prove authorization. Dynamic routes/SQL, helper side effects and runtime config require source inspection.
