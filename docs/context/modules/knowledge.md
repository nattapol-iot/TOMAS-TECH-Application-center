# Knowledge Hub

[Context index](../../../AGENTS.md) · [Architecture](../ARCHITECTURE.md) · [Change guide](../WORKFLOW.md)

บทความ เอกสาร collaboration workflow และ sales materials

Evidence: snapshot `4a0666d4`; source map, not a live availability claim. Test candidates use filename matching and are not exhaustive coverage.

## Read only the operation you change

- [knowledge-admin API and function map](../api/knowledge-admin.md) — registered in Node app
- [knowledge-articles API and function map](../api/knowledge-articles.md) — registered in Node app
- [knowledge-collaboration API and function map](../api/knowledge-collaboration.md) — registered in Node app
- [knowledge-documents API and function map](../api/knowledge-documents.md) — registered in Node app
- [knowledge-workflow API and function map](../api/knowledge-workflow.md) — registered in Node app
- [knowledge-sales-materials API and function map](../api/knowledge-sales-materials.md) — registered in Node app

## UI function locator

Shared screens contain other modules: use the symbol and line range instead of reading the whole file.

| Symbol | Source | Lines |
|---|---|---|
| `initialsOf` | [app/system/production/KnowledgeScreens.tsx](<../../../app/system/production/KnowledgeScreens.tsx>) | 105–106 |
| `errorText` | [app/system/production/KnowledgeScreens.tsx](<../../../app/system/production/KnowledgeScreens.tsx>) | 108–109 |
| `ProductionKnowledgeHub` | [app/system/production/KnowledgeScreens.tsx](<../../../app/system/production/KnowledgeScreens.tsx>) | 111–432 |
| `PresentationLibrary` | [app/system/production/KnowledgeScreens.tsx](<../../../app/system/production/KnowledgeScreens.tsx>) | 438–475 |
| `SharedWorkspace` | [app/system/production/KnowledgeScreens.tsx](<../../../app/system/production/KnowledgeScreens.tsx>) | 477–486 |
| `AcknowledgementList` | [app/system/production/KnowledgeScreens.tsx](<../../../app/system/production/KnowledgeScreens.tsx>) | 491–560 |
| `ArticleLibrary` | [app/system/production/KnowledgeScreens.tsx](<../../../app/system/production/KnowledgeScreens.tsx>) | 565–622 |
| `ArticleEditorModal` | [app/system/production/KnowledgeScreens.tsx](<../../../app/system/production/KnowledgeScreens.tsx>) | 624–671 |
| `ArticleDrawer` | [app/system/production/KnowledgeScreens.tsx](<../../../app/system/production/KnowledgeScreens.tsx>) | 673–697 |
| `KnowledgeAdmin` | [app/system/production/KnowledgeScreens.tsx](<../../../app/system/production/KnowledgeScreens.tsx>) | 699–729 |
| `CategoryEditorModal` | [app/system/production/KnowledgeScreens.tsx](<../../../app/system/production/KnowledgeScreens.tsx>) | 731–766 |
| `SequenceEditorModal` | [app/system/production/KnowledgeScreens.tsx](<../../../app/system/production/KnowledgeScreens.tsx>) | 768–797 |
| `CreateDocumentModal` | [app/system/production/KnowledgeScreens.tsx](<../../../app/system/production/KnowledgeScreens.tsx>) | 799–921 |
| `DocumentDrawer` | [app/system/production/KnowledgeScreens.tsx](<../../../app/system/production/KnowledgeScreens.tsx>) | 926–1250 |
| `AcknowledgementAssignment` | [app/system/production/KnowledgeScreens.tsx](<../../../app/system/production/KnowledgeScreens.tsx>) | 1252–1269 |
| `DocumentRelations` | [app/system/production/KnowledgeScreens.tsx](<../../../app/system/production/KnowledgeScreens.tsx>) | 1271–1290 |
| `DocumentComments` | [app/system/production/KnowledgeScreens.tsx](<../../../app/system/production/KnowledgeScreens.tsx>) | 1292–1346 |
| `DocumentPermissions` | [app/system/production/KnowledgeScreens.tsx](<../../../app/system/production/KnowledgeScreens.tsx>) | 1348–1399 |
| `SubmitForReviewForm` | [app/system/production/KnowledgeScreens.tsx](<../../../app/system/production/KnowledgeScreens.tsx>) | 1401–1449 |
| `UploadRevisionForm` | [app/system/production/KnowledgeScreens.tsx](<../../../app/system/production/KnowledgeScreens.tsx>) | 1451–1494 |

## Domain helpers / direct dependencies

- [backend-node/src/knowledge-common.ts](<../../../backend-node/src/knowledge-common.ts>)
- [backend-node/src/document-storage.ts](<../../../backend-node/src/document-storage.ts>)
- [app/system/screen-link.ts](<../../../app/system/screen-link.ts>)
- [app/system/LocalizedText.tsx](<../../../app/system/LocalizedText.tsx>)
- [app/system/i18n.ts](<../../../app/system/i18n.ts>)
- [app/system/api-client.ts](<../../../app/system/api-client.ts>)
- [app/system/SolutionLibrary.tsx](<../../../app/system/SolutionLibrary.tsx>)
- [app/system/ui.tsx](<../../../app/system/ui.tsx>)

## Candidate regression tests

- [backend-node/tests/knowledge-sales-materials.test.ts](<../../../backend-node/tests/knowledge-sales-materials.test.ts>)

## Client contract lookup

Search the selected API path or function in [app/system/api-client.ts](<../../../app/system/api-client.ts>); follow its screen callers. Common UI/language changes require [app/system/ui.tsx](<../../../app/system/ui.tsx>) and [app/system/i18n.ts](<../../../app/system/i18n.ts>). For SQL changes use [schema map](../SCHEMA.md).
