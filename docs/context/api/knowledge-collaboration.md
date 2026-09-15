# knowledge-collaboration

[Module](../modules/knowledge.md) · [Index](../../../AGENTS.md)

Evidence: source snapshot `09f9bd3c`; generated, do not edit. [backend-node/src/routes/knowledge-collaboration.ts](<../../../backend-node/src/routes/knowledge-collaboration.ts>). Ranges are hints: search symbol after edits.

## API operations

| Method | Path | Source lines |
|---|---|---|
| POST | `/api/v1/knowledge/documents/:id/relations` | 16–19 |
| DELETE | `/api/v1/knowledge/documents/:id/relations/:relationId` | 21–21 |
| GET | `/api/v1/knowledge/related` | 23–23 |
| POST | `/api/v1/knowledge/versions/:versionId/acknowledgements` | 25–25 |
| POST | `/api/v1/knowledge/acknowledgements/:acknowledgementId/acknowledge` | 27–27 |
| GET | `/api/v1/knowledge/me/acknowledgements` | 29–29 |
| GET | `/api/v1/knowledge/documents/:id/audit` | 31–31 |
| GET | `/api/v1/knowledge/documents/:id/comments` | 33–33 |
| POST | `/api/v1/knowledge/documents/:id/comments` | 35–35 |
| POST | `/api/v1/knowledge/comments/:commentId/resolution` | 37–37 |
| GET | `/api/v1/knowledge/documents/:id/permissions` | 39–39 |
| POST | `/api/v1/knowledge/documents/:id/permissions` | 41–41 |
| DELETE | `/api/v1/knowledge/documents/:id/permissions/:permissionId` | 43–43 |

## Named functions

| Symbol | Source | Lines |
|---|---|---|
| `todayIn` | [backend-node/src/routes/knowledge-collaboration.ts](<../../../backend-node/src/routes/knowledge-collaboration.ts>) | 12–12 |
| `boolBody` | [backend-node/src/routes/knowledge-collaboration.ts](<../../../backend-node/src/routes/knowledge-collaboration.ts>) | 13–13 |
| `registerKnowledgeCollaborationRoutes` | [backend-node/src/routes/knowledge-collaboration.ts](<../../../backend-node/src/routes/knowledge-collaboration.ts>) | 15–44 |

## Direct local dependencies

- [backend-node/src/config.ts](<../../../backend-node/src/config.ts>)
- [backend-node/src/db.ts](<../../../backend-node/src/db.ts>)
- [backend-node/src/errors.ts](<../../../backend-node/src/errors.ts>)
- [backend-node/src/http.ts](<../../../backend-node/src/http.ts>)
- [backend-node/src/knowledge-common.ts](<../../../backend-node/src/knowledge-common.ts>)
- [backend-node/src/users.ts](<../../../backend-node/src/users.ts>)

## SQL references (literal scan, not a complete schema or write-set)

`dbo.knowledge_audit_events`, `dbo.knowledge_document_acknowledgements`, `dbo.knowledge_document_comments`, `dbo.knowledge_document_permissions`, `dbo.knowledge_document_relations`, `dbo.knowledge_document_versions`, `dbo.knowledge_documents`, `dbo.projects`, `dbo.roles`, `dbo.users`

## Change boundary

Read the selected handler and helpers it calls, then its caller in api-client.ts. Verify permission checks, record scope, transaction, rowVersion and audit on that path; a route name alone does not prove authorization. Dynamic routes/SQL, helper side effects and runtime config require source inspection.
