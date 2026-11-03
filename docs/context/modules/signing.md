# Sign Drawing / Documents / Stamps

[Context index](../../../AGENTS.md) · [Architecture](../ARCHITECTURE.md) · [Change guide](../WORKFLOW.md)

ลงนาม inbox ลายเซ็น ตราบริษัท และตรวจ certificate

Evidence: snapshot `b4c05204`; source map, not a live availability claim. Test candidates use filename matching and are not exhaustive coverage.

## Read only the operation you change

- [signing API and function map](../api/signing.md) — registered in Node app
- [signature-master API and function map](../api/signature-master.md) — registered in Node app

## UI function locator

Shared screens contain other modules: use the symbol and line range instead of reading the whole file.

| Symbol | Source | Lines |
|---|---|---|
| `toError` | [app/system/production/SigningScreens.tsx](<../../../app/system/production/SigningScreens.tsx>) | 79–79 |
| `money` | [app/system/production/SigningScreens.tsx](<../../../app/system/production/SigningScreens.tsx>) | 80–82 |
| `date` | [app/system/production/SigningScreens.tsx](<../../../app/system/production/SigningScreens.tsx>) | 83–85 |
| `dateTime` | [app/system/production/SigningScreens.tsx](<../../../app/system/production/SigningScreens.tsx>) | 86–88 |
| `isoToday` | [app/system/production/SigningScreens.tsx](<../../../app/system/production/SigningScreens.tsx>) | 90–90 |
| `hasPermission` | [app/system/production/SigningScreens.tsx](<../../../app/system/production/SigningScreens.tsx>) | 91–91 |
| `shortHash` | [app/system/production/SigningScreens.tsx](<../../../app/system/production/SigningScreens.tsx>) | 92–92 |
| `classLabel` | [app/system/production/SigningScreens.tsx](<../../../app/system/production/SigningScreens.tsx>) | 123–123 |
| `blockLabel` | [app/system/production/SigningScreens.tsx](<../../../app/system/production/SigningScreens.tsx>) | 124–124 |
| `markLabel` | [app/system/production/SigningScreens.tsx](<../../../app/system/production/SigningScreens.tsx>) | 125–125 |
| `useEndpoint` | [app/system/production/SigningScreens.tsx](<../../../app/system/production/SigningScreens.tsx>) | 143–172 |
| `Loading` | [app/system/production/SigningScreens.tsx](<../../../app/system/production/SigningScreens.tsx>) | 174–176 |
| `LoadError` | [app/system/production/SigningScreens.tsx](<../../../app/system/production/SigningScreens.tsx>) | 178–189 |
| `ActionError` | [app/system/production/SigningScreens.tsx](<../../../app/system/production/SigningScreens.tsx>) | 191–195 |
| `RefreshButton` | [app/system/production/SigningScreens.tsx](<../../../app/system/production/SigningScreens.tsx>) | 197–199 |
| `ReasonPrompt` | [app/system/production/SigningScreens.tsx](<../../../app/system/production/SigningScreens.tsx>) | 201–231 |
| `ProductionSignInbox` | [app/system/production/SigningScreens.tsx](<../../../app/system/production/SigningScreens.tsx>) | 237–335 |
| `SignTaskRow` | [app/system/production/SigningScreens.tsx](<../../../app/system/production/SigningScreens.tsx>) | 337–376 |
| `DocumentTable` | [app/system/production/SigningScreens.tsx](<../../../app/system/production/SigningScreens.tsx>) | 378–406 |
| `SignDocumentDrawer` | [app/system/production/SigningScreens.tsx](<../../../app/system/production/SigningScreens.tsx>) | 412–698 |
| `PaperStepPanel` | [app/system/production/SigningScreens.tsx](<../../../app/system/production/SigningScreens.tsx>) | 700–756 |
| `StepTable` | [app/system/production/SigningScreens.tsx](<../../../app/system/production/SigningScreens.tsx>) | 758–799 |
| `SignPanel` | [app/system/production/SigningScreens.tsx](<../../../app/system/production/SigningScreens.tsx>) | 807–914 |
| `DelegatePrompt` | [app/system/production/SigningScreens.tsx](<../../../app/system/production/SigningScreens.tsx>) | 916–948 |
| `ProductionSignedDocuments` | [app/system/production/SigningScreens.tsx](<../../../app/system/production/SigningScreens.tsx>) | 954–1036 |
| `CreateSignableDocumentModal` | [app/system/production/SigningScreens.tsx](<../../../app/system/production/SigningScreens.tsx>) | 1038–1146 |
| `FreezeRevisionModal` | [app/system/production/SigningScreens.tsx](<../../../app/system/production/SigningScreens.tsx>) | 1148–1209 |
| `VerifyModal` | [app/system/production/SigningScreens.tsx](<../../../app/system/production/SigningScreens.tsx>) | 1212–1307 |
| `ProductionMySignature` | [app/system/production/SigningScreens.tsx](<../../../app/system/production/SigningScreens.tsx>) | 1313–1377 |
| `MySignatureModal` | [app/system/production/SigningScreens.tsx](<../../../app/system/production/SigningScreens.tsx>) | 1379–1461 |
| `SignaturePad` | [app/system/production/SigningScreens.tsx](<../../../app/system/production/SigningScreens.tsx>) | 1470–1553 |
| `renderTypedSignature` | [app/system/production/SigningScreens.tsx](<../../../app/system/production/SigningScreens.tsx>) | 1555–1569 |
| `ProductionCompanyStamps` | [app/system/production/SigningScreens.tsx](<../../../app/system/production/SigningScreens.tsx>) | 1575–1731 |
| `StampArtworkModal` | [app/system/production/SigningScreens.tsx](<../../../app/system/production/SigningScreens.tsx>) | 1740–1781 |
| `CreateStampModal` | [app/system/production/SigningScreens.tsx](<../../../app/system/production/SigningScreens.tsx>) | 1783–1861 |
| `GrantAuthorityModal` | [app/system/production/SigningScreens.tsx](<../../../app/system/production/SigningScreens.tsx>) | 1863–1942 |
| `message` | [app/system/production/SigningPreview.tsx](<../../../app/system/production/SigningPreview.tsx>) | 12–12 |
| `decode` | [app/system/production/SigningPreview.tsx](<../../../app/system/production/SigningPreview.tsx>) | 13–13 |
| `PdfCanvas` | [app/system/production/SigningPreview.tsx](<../../../app/system/production/SigningPreview.tsx>) | 15–34 |
| `SigningPreview` | [app/system/production/SigningPreview.tsx](<../../../app/system/production/SigningPreview.tsx>) | 36–84 |
| `SignedFilePreview` | [app/system/production/SigningPreview.tsx](<../../../app/system/production/SigningPreview.tsx>) | 86–98 |

## Domain helpers / direct dependencies

- [backend-node/src/signing-pdf.ts](<../../../backend-node/src/signing-pdf.ts>)
- [backend-node/src/document-storage.ts](<../../../backend-node/src/document-storage.ts>)
- [backend-node/src/document-number.ts](<../../../backend-node/src/document-number.ts>)
- [backend-node/src/drawing-workflow.ts](<../../../backend-node/src/drawing-workflow.ts>)
- [backend-node/src/project-scope.ts](<../../../backend-node/src/project-scope.ts>)
- [backend-node/src/signing-certificate.ts](<../../../backend-node/src/signing-certificate.ts>)
- [backend-node/src/signing-core.ts](<../../../backend-node/src/signing-core.ts>)
- [backend-node/src/business-date.ts](<../../../backend-node/src/business-date.ts>)
- [app/system/screen-link.ts](<../../../app/system/screen-link.ts>)
- [app/system/i18n.ts](<../../../app/system/i18n.ts>)
- [app/system/LocalizedText.tsx](<../../../app/system/LocalizedText.tsx>)
- [app/system/production/SigningPreview.tsx](<../../../app/system/production/SigningPreview.tsx>)
- [lib/estimate-ux.ts](<../../../lib/estimate-ux.ts>)
- [app/system/production/signing-stamp-form.css](<../../../app/system/production/signing-stamp-form.css>)
- [app/system/production/signing-preview-client.ts](<../../../app/system/production/signing-preview-client.ts>)
- [app/system/project-overview-client.ts](<../../../app/system/project-overview-client.ts>)
- [app/system/api-client.ts](<../../../app/system/api-client.ts>)
- [app/system/ui.tsx](<../../../app/system/ui.tsx>)
- [app/system/production/signing-preview.css](<../../../app/system/production/signing-preview.css>)

## Candidate regression tests

- [backend-node/tests/drawing-workflow.test.ts](<../../../backend-node/tests/drawing-workflow.test.ts>)
- [backend-node/tests/signing-pdf.test.ts](<../../../backend-node/tests/signing-pdf.test.ts>)
- [backend-node/tests/signing.test.ts](<../../../backend-node/tests/signing.test.ts>)

## Client contract lookup

Search the selected API path or function in [app/system/api-client.ts](<../../../app/system/api-client.ts>); follow its screen callers. Common UI/language changes require [app/system/ui.tsx](<../../../app/system/ui.tsx>) and [app/system/i18n.ts](<../../../app/system/i18n.ts>). For SQL changes use [schema map](../SCHEMA.md).
