# Knowledge Hub

[Context index](../../../AGENTS.md) · [Architecture](../ARCHITECTURE.md) · [Change guide](../WORKFLOW.md)

บทความ เอกสาร collaboration workflow และ sales materials

Evidence: snapshot `83dc9a9d`; source map, not a live availability claim. Test candidates use filename matching and are not exhaustive coverage.

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
| `initialsOf` | [app/system/production/KnowledgeScreens.tsx](<../../../app/system/production/KnowledgeScreens.tsx>) | 110–111 |
| `errorText` | [app/system/production/KnowledgeScreens.tsx](<../../../app/system/production/KnowledgeScreens.tsx>) | 113–114 |
| `ProductionKnowledgeHub` | [app/system/production/KnowledgeScreens.tsx](<../../../app/system/production/KnowledgeScreens.tsx>) | 116–431 |
| `PresentationLibrary` | [app/system/production/KnowledgeScreens.tsx](<../../../app/system/production/KnowledgeScreens.tsx>) | 437–474 |
| `SharedWorkspace` | [app/system/production/KnowledgeScreens.tsx](<../../../app/system/production/KnowledgeScreens.tsx>) | 476–485 |
| `AcknowledgementList` | [app/system/production/KnowledgeScreens.tsx](<../../../app/system/production/KnowledgeScreens.tsx>) | 490–559 |
| `ArticleLibrary` | [app/system/production/KnowledgeScreens.tsx](<../../../app/system/production/KnowledgeScreens.tsx>) | 564–621 |
| `ArticleEditorModal` | [app/system/production/KnowledgeScreens.tsx](<../../../app/system/production/KnowledgeScreens.tsx>) | 623–675 |
| `ArticleDrawer` | [app/system/production/KnowledgeScreens.tsx](<../../../app/system/production/KnowledgeScreens.tsx>) | 677–701 |
| `KnowledgeAdmin` | [app/system/production/KnowledgeScreens.tsx](<../../../app/system/production/KnowledgeScreens.tsx>) | 703–733 |
| `CategoryEditorModal` | [app/system/production/KnowledgeScreens.tsx](<../../../app/system/production/KnowledgeScreens.tsx>) | 735–774 |
| `SequenceEditorModal` | [app/system/production/KnowledgeScreens.tsx](<../../../app/system/production/KnowledgeScreens.tsx>) | 776–809 |
| `CreateDocumentModal` | [app/system/production/KnowledgeScreens.tsx](<../../../app/system/production/KnowledgeScreens.tsx>) | 811–933 |
| `DocumentDrawer` | [app/system/production/KnowledgeScreens.tsx](<../../../app/system/production/KnowledgeScreens.tsx>) | 938–1268 |
| `AcknowledgementAssignment` | [app/system/production/KnowledgeScreens.tsx](<../../../app/system/production/KnowledgeScreens.tsx>) | 1270–1289 |
| `DocumentRelations` | [app/system/production/KnowledgeScreens.tsx](<../../../app/system/production/KnowledgeScreens.tsx>) | 1291–1311 |
| `DocumentComments` | [app/system/production/KnowledgeScreens.tsx](<../../../app/system/production/KnowledgeScreens.tsx>) | 1313–1369 |
| `DocumentPermissions` | [app/system/production/KnowledgeScreens.tsx](<../../../app/system/production/KnowledgeScreens.tsx>) | 1371–1423 |
| `SubmitForReviewForm` | [app/system/production/KnowledgeScreens.tsx](<../../../app/system/production/KnowledgeScreens.tsx>) | 1425–1482 |
| `UploadRevisionForm` | [app/system/production/KnowledgeScreens.tsx](<../../../app/system/production/KnowledgeScreens.tsx>) | 1484–1537 |

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
- [app/system/production/form-draft.ts](<../../../app/system/production/form-draft.ts>)

## Candidate regression tests

- [backend-node/tests/knowledge-sales-materials.test.ts](<../../../backend-node/tests/knowledge-sales-materials.test.ts>)

## Client contract lookup

Search the selected API path or function in [app/system/api-client.ts](<../../../app/system/api-client.ts>); follow its screen callers. Common UI/language changes require [app/system/ui.tsx](<../../../app/system/ui.tsx>) and [app/system/i18n.ts](<../../../app/system/i18n.ts>). For SQL changes use [schema map](../SCHEMA.md).
