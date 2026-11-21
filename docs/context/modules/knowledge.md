# Knowledge Hub

[Context index](../../../AGENTS.md) · [Architecture](../ARCHITECTURE.md) · [Change guide](../WORKFLOW.md)

บทความ เอกสาร collaboration workflow และ sales materials

Evidence: snapshot `3577fb4b`; source map, not a live availability claim. Test candidates use filename matching and are not exhaustive coverage.

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
| `initialsOf` | [app/system/production/KnowledgeScreens.tsx](<../../../app/system/production/KnowledgeScreens.tsx>) | 108–109 |
| `errorText` | [app/system/production/KnowledgeScreens.tsx](<../../../app/system/production/KnowledgeScreens.tsx>) | 111–112 |
| `ProductionKnowledgeHub` | [app/system/production/KnowledgeScreens.tsx](<../../../app/system/production/KnowledgeScreens.tsx>) | 114–429 |
| `PresentationLibrary` | [app/system/production/KnowledgeScreens.tsx](<../../../app/system/production/KnowledgeScreens.tsx>) | 435–472 |
| `SharedWorkspace` | [app/system/production/KnowledgeScreens.tsx](<../../../app/system/production/KnowledgeScreens.tsx>) | 474–483 |
| `AcknowledgementList` | [app/system/production/KnowledgeScreens.tsx](<../../../app/system/production/KnowledgeScreens.tsx>) | 488–557 |
| `ArticleLibrary` | [app/system/production/KnowledgeScreens.tsx](<../../../app/system/production/KnowledgeScreens.tsx>) | 562–619 |
| `ArticleEditorModal` | [app/system/production/KnowledgeScreens.tsx](<../../../app/system/production/KnowledgeScreens.tsx>) | 621–668 |
| `ArticleDrawer` | [app/system/production/KnowledgeScreens.tsx](<../../../app/system/production/KnowledgeScreens.tsx>) | 670–694 |
| `KnowledgeAdmin` | [app/system/production/KnowledgeScreens.tsx](<../../../app/system/production/KnowledgeScreens.tsx>) | 696–726 |
| `CategoryEditorModal` | [app/system/production/KnowledgeScreens.tsx](<../../../app/system/production/KnowledgeScreens.tsx>) | 728–763 |
| `SequenceEditorModal` | [app/system/production/KnowledgeScreens.tsx](<../../../app/system/production/KnowledgeScreens.tsx>) | 765–794 |
| `CreateDocumentModal` | [app/system/production/KnowledgeScreens.tsx](<../../../app/system/production/KnowledgeScreens.tsx>) | 796–918 |
| `DocumentDrawer` | [app/system/production/KnowledgeScreens.tsx](<../../../app/system/production/KnowledgeScreens.tsx>) | 923–1247 |
| `AcknowledgementAssignment` | [app/system/production/KnowledgeScreens.tsx](<../../../app/system/production/KnowledgeScreens.tsx>) | 1249–1266 |
| `DocumentRelations` | [app/system/production/KnowledgeScreens.tsx](<../../../app/system/production/KnowledgeScreens.tsx>) | 1268–1287 |
| `DocumentComments` | [app/system/production/KnowledgeScreens.tsx](<../../../app/system/production/KnowledgeScreens.tsx>) | 1289–1343 |
| `DocumentPermissions` | [app/system/production/KnowledgeScreens.tsx](<../../../app/system/production/KnowledgeScreens.tsx>) | 1345–1396 |
| `SubmitForReviewForm` | [app/system/production/KnowledgeScreens.tsx](<../../../app/system/production/KnowledgeScreens.tsx>) | 1398–1446 |
| `UploadRevisionForm` | [app/system/production/KnowledgeScreens.tsx](<../../../app/system/production/KnowledgeScreens.tsx>) | 1448–1491 |

## Domain helpers / direct dependencies

- [backend-node/src/knowledge-common.ts](<../../../backend-node/src/knowledge-common.ts>)
- [backend-node/src/document-storage.ts](<../../../backend-node/src/document-storage.ts>)
- [app/system/dialogs.ts](<../../../app/system/dialogs.ts>)
- [app/system/screen-link.ts](<../../../app/system/screen-link.ts>)
- [app/system/LocalizedText.tsx](<../../../app/system/LocalizedText.tsx>)
- [app/system/i18n.ts](<../../../app/system/i18n.ts>)
- [app/system/api-client.ts](<../../../app/system/api-client.ts>)
- [app/system/SolutionLibrary.tsx](<../../../app/system/SolutionLibrary.tsx>)
- [app/system/ui.tsx](<../../../app/system/ui.tsx>)
- [app/system/DateInput.tsx](<../../../app/system/DateInput.tsx>)
- [app/system/production/PegasusScreen.tsx](<../../../app/system/production/PegasusScreen.tsx>)

## Candidate regression tests

- [backend-node/tests/knowledge-sales-materials.test.ts](<../../../backend-node/tests/knowledge-sales-materials.test.ts>)

## Client contract lookup

Search the selected API path or function in [app/system/api-client.ts](<../../../app/system/api-client.ts>); follow its screen callers. Common UI/language changes require [app/system/ui.tsx](<../../../app/system/ui.tsx>) and [app/system/i18n.ts](<../../../app/system/i18n.ts>). For SQL changes use [schema map](../SCHEMA.md).
