# Knowledge Hub

[Context index](../../../AGENTS.md) · [Architecture](../ARCHITECTURE.md) · [Change guide](../WORKFLOW.md)

บทความ เอกสาร collaboration workflow และ sales materials

Evidence: snapshot `65a519ae`; source map, not a live availability claim. Test candidates use filename matching and are not exhaustive coverage.

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
| `initialsOf` | [app/system/production/KnowledgeScreens.tsx](<../../../app/system/production/KnowledgeScreens.tsx>) | 109–110 |
| `errorText` | [app/system/production/KnowledgeScreens.tsx](<../../../app/system/production/KnowledgeScreens.tsx>) | 112–113 |
| `ProductionKnowledgeHub` | [app/system/production/KnowledgeScreens.tsx](<../../../app/system/production/KnowledgeScreens.tsx>) | 115–430 |
| `PresentationLibrary` | [app/system/production/KnowledgeScreens.tsx](<../../../app/system/production/KnowledgeScreens.tsx>) | 436–473 |
| `SharedWorkspace` | [app/system/production/KnowledgeScreens.tsx](<../../../app/system/production/KnowledgeScreens.tsx>) | 475–484 |
| `AcknowledgementList` | [app/system/production/KnowledgeScreens.tsx](<../../../app/system/production/KnowledgeScreens.tsx>) | 489–558 |
| `ArticleLibrary` | [app/system/production/KnowledgeScreens.tsx](<../../../app/system/production/KnowledgeScreens.tsx>) | 563–620 |
| `ArticleEditorModal` | [app/system/production/KnowledgeScreens.tsx](<../../../app/system/production/KnowledgeScreens.tsx>) | 622–672 |
| `ArticleDrawer` | [app/system/production/KnowledgeScreens.tsx](<../../../app/system/production/KnowledgeScreens.tsx>) | 674–698 |
| `KnowledgeAdmin` | [app/system/production/KnowledgeScreens.tsx](<../../../app/system/production/KnowledgeScreens.tsx>) | 700–730 |
| `CategoryEditorModal` | [app/system/production/KnowledgeScreens.tsx](<../../../app/system/production/KnowledgeScreens.tsx>) | 732–768 |
| `SequenceEditorModal` | [app/system/production/KnowledgeScreens.tsx](<../../../app/system/production/KnowledgeScreens.tsx>) | 770–800 |
| `CreateDocumentModal` | [app/system/production/KnowledgeScreens.tsx](<../../../app/system/production/KnowledgeScreens.tsx>) | 802–921 |
| `DocumentDrawer` | [app/system/production/KnowledgeScreens.tsx](<../../../app/system/production/KnowledgeScreens.tsx>) | 926–1250 |
| `AcknowledgementAssignment` | [app/system/production/KnowledgeScreens.tsx](<../../../app/system/production/KnowledgeScreens.tsx>) | 1252–1271 |
| `DocumentRelations` | [app/system/production/KnowledgeScreens.tsx](<../../../app/system/production/KnowledgeScreens.tsx>) | 1273–1293 |
| `DocumentComments` | [app/system/production/KnowledgeScreens.tsx](<../../../app/system/production/KnowledgeScreens.tsx>) | 1295–1350 |
| `DocumentPermissions` | [app/system/production/KnowledgeScreens.tsx](<../../../app/system/production/KnowledgeScreens.tsx>) | 1352–1403 |
| `SubmitForReviewForm` | [app/system/production/KnowledgeScreens.tsx](<../../../app/system/production/KnowledgeScreens.tsx>) | 1405–1460 |
| `UploadRevisionForm` | [app/system/production/KnowledgeScreens.tsx](<../../../app/system/production/KnowledgeScreens.tsx>) | 1462–1513 |

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
- [app/system/production/form-bubbles.ts](<../../../app/system/production/form-bubbles.ts>)

## Candidate regression tests

- [backend-node/tests/knowledge-sales-materials.test.ts](<../../../backend-node/tests/knowledge-sales-materials.test.ts>)

## Client contract lookup

Search the selected API path or function in [app/system/api-client.ts](<../../../app/system/api-client.ts>); follow its screen callers. Common UI/language changes require [app/system/ui.tsx](<../../../app/system/ui.tsx>) and [app/system/i18n.ts](<../../../app/system/i18n.ts>). For SQL changes use [schema map](../SCHEMA.md).
