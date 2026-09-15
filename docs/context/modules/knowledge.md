# Knowledge Hub

[Context index](../../../AGENTS.md) · [Architecture](../ARCHITECTURE.md) · [Change guide](../WORKFLOW.md)

บทความ เอกสาร collaboration workflow และ sales materials

Evidence: snapshot `09f9bd3c`; source map, not a live availability claim. Test candidates use filename matching and are not exhaustive coverage.

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
| `initialsOf` | [app/system/production/KnowledgeScreens.tsx](<../../../app/system/production/KnowledgeScreens.tsx>) | 104–105 |
| `errorText` | [app/system/production/KnowledgeScreens.tsx](<../../../app/system/production/KnowledgeScreens.tsx>) | 107–108 |
| `ProductionKnowledgeHub` | [app/system/production/KnowledgeScreens.tsx](<../../../app/system/production/KnowledgeScreens.tsx>) | 110–431 |
| `PresentationLibrary` | [app/system/production/KnowledgeScreens.tsx](<../../../app/system/production/KnowledgeScreens.tsx>) | 437–474 |
| `SharedWorkspace` | [app/system/production/KnowledgeScreens.tsx](<../../../app/system/production/KnowledgeScreens.tsx>) | 476–485 |
| `AcknowledgementList` | [app/system/production/KnowledgeScreens.tsx](<../../../app/system/production/KnowledgeScreens.tsx>) | 490–559 |
| `ArticleLibrary` | [app/system/production/KnowledgeScreens.tsx](<../../../app/system/production/KnowledgeScreens.tsx>) | 564–621 |
| `ArticleEditorModal` | [app/system/production/KnowledgeScreens.tsx](<../../../app/system/production/KnowledgeScreens.tsx>) | 623–670 |
| `ArticleDrawer` | [app/system/production/KnowledgeScreens.tsx](<../../../app/system/production/KnowledgeScreens.tsx>) | 672–696 |
| `KnowledgeAdmin` | [app/system/production/KnowledgeScreens.tsx](<../../../app/system/production/KnowledgeScreens.tsx>) | 698–728 |
| `CategoryEditorModal` | [app/system/production/KnowledgeScreens.tsx](<../../../app/system/production/KnowledgeScreens.tsx>) | 730–765 |
| `SequenceEditorModal` | [app/system/production/KnowledgeScreens.tsx](<../../../app/system/production/KnowledgeScreens.tsx>) | 767–796 |
| `CreateDocumentModal` | [app/system/production/KnowledgeScreens.tsx](<../../../app/system/production/KnowledgeScreens.tsx>) | 798–920 |
| `DocumentDrawer` | [app/system/production/KnowledgeScreens.tsx](<../../../app/system/production/KnowledgeScreens.tsx>) | 925–1249 |
| `AcknowledgementAssignment` | [app/system/production/KnowledgeScreens.tsx](<../../../app/system/production/KnowledgeScreens.tsx>) | 1251–1268 |
| `DocumentRelations` | [app/system/production/KnowledgeScreens.tsx](<../../../app/system/production/KnowledgeScreens.tsx>) | 1270–1289 |
| `DocumentComments` | [app/system/production/KnowledgeScreens.tsx](<../../../app/system/production/KnowledgeScreens.tsx>) | 1291–1345 |
| `DocumentPermissions` | [app/system/production/KnowledgeScreens.tsx](<../../../app/system/production/KnowledgeScreens.tsx>) | 1347–1398 |
| `SubmitForReviewForm` | [app/system/production/KnowledgeScreens.tsx](<../../../app/system/production/KnowledgeScreens.tsx>) | 1400–1448 |
| `UploadRevisionForm` | [app/system/production/KnowledgeScreens.tsx](<../../../app/system/production/KnowledgeScreens.tsx>) | 1450–1493 |

## Domain helpers / direct dependencies

- [backend-node/src/knowledge-common.ts](<../../../backend-node/src/knowledge-common.ts>)
- [backend-node/src/document-storage.ts](<../../../backend-node/src/document-storage.ts>)
- [app/system/LocalizedText.tsx](<../../../app/system/LocalizedText.tsx>)
- [app/system/i18n.ts](<../../../app/system/i18n.ts>)
- [app/system/api-client.ts](<../../../app/system/api-client.ts>)
- [app/system/SolutionLibrary.tsx](<../../../app/system/SolutionLibrary.tsx>)
- [app/system/ui.tsx](<../../../app/system/ui.tsx>)

## Candidate regression tests

- [backend-node/tests/knowledge-sales-materials.test.ts](<../../../backend-node/tests/knowledge-sales-materials.test.ts>)

## Client contract lookup

Search the selected API path or function in [app/system/api-client.ts](<../../../app/system/api-client.ts>); follow its screen callers. Common UI/language changes require [app/system/ui.tsx](<../../../app/system/ui.tsx>) and [app/system/i18n.ts](<../../../app/system/i18n.ts>). For SQL changes use [schema map](../SCHEMA.md).
