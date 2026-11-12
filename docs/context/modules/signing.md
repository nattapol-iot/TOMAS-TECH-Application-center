# Sign Drawing / Documents / Stamps

[Context index](../../../AGENTS.md) · [Architecture](../ARCHITECTURE.md) · [Change guide](../WORKFLOW.md)

ลงนาม inbox ลายเซ็น ตราบริษัท และตรวจ certificate

Evidence: snapshot `781d8326`; source map, not a live availability claim. Test candidates use filename matching and are not exhaustive coverage.

## Read only the operation you change

- [signing API and function map](../api/signing.md) — registered in Node app
- [signature-master API and function map](../api/signature-master.md) — registered in Node app

## UI function locator

Shared screens contain other modules: use the symbol and line range instead of reading the whole file.

| Symbol | Source | Lines |
|---|---|---|
| `toError` | [app/system/production/SigningScreens.tsx](<../../../app/system/production/SigningScreens.tsx>) | 80–80 |
| `money` | [app/system/production/SigningScreens.tsx](<../../../app/system/production/SigningScreens.tsx>) | 81–83 |
| `date` | [app/system/production/SigningScreens.tsx](<../../../app/system/production/SigningScreens.tsx>) | 84–86 |
| `dateTime` | [app/system/production/SigningScreens.tsx](<../../../app/system/production/SigningScreens.tsx>) | 87–89 |
| `isoToday` | [app/system/production/SigningScreens.tsx](<../../../app/system/production/SigningScreens.tsx>) | 91–91 |
| `hasPermission` | [app/system/production/SigningScreens.tsx](<../../../app/system/production/SigningScreens.tsx>) | 92–92 |
| `shortHash` | [app/system/production/SigningScreens.tsx](<../../../app/system/production/SigningScreens.tsx>) | 93–93 |
| `classLabel` | [app/system/production/SigningScreens.tsx](<../../../app/system/production/SigningScreens.tsx>) | 124–124 |
| `blockLabel` | [app/system/production/SigningScreens.tsx](<../../../app/system/production/SigningScreens.tsx>) | 125–125 |
| `markLabel` | [app/system/production/SigningScreens.tsx](<../../../app/system/production/SigningScreens.tsx>) | 126–126 |
| `useEndpoint` | [app/system/production/SigningScreens.tsx](<../../../app/system/production/SigningScreens.tsx>) | 144–173 |
| `Loading` | [app/system/production/SigningScreens.tsx](<../../../app/system/production/SigningScreens.tsx>) | 175–177 |
| `LoadError` | [app/system/production/SigningScreens.tsx](<../../../app/system/production/SigningScreens.tsx>) | 179–190 |
| `ActionError` | [app/system/production/SigningScreens.tsx](<../../../app/system/production/SigningScreens.tsx>) | 192–196 |
| `RefreshButton` | [app/system/production/SigningScreens.tsx](<../../../app/system/production/SigningScreens.tsx>) | 198–200 |
| `ReasonPrompt` | [app/system/production/SigningScreens.tsx](<../../../app/system/production/SigningScreens.tsx>) | 202–232 |
| `ProductionSignInbox` | [app/system/production/SigningScreens.tsx](<../../../app/system/production/SigningScreens.tsx>) | 238–336 |
| `SignTaskRow` | [app/system/production/SigningScreens.tsx](<../../../app/system/production/SigningScreens.tsx>) | 338–377 |
| `DocumentTable` | [app/system/production/SigningScreens.tsx](<../../../app/system/production/SigningScreens.tsx>) | 379–407 |
| `SignDocumentDrawer` | [app/system/production/SigningScreens.tsx](<../../../app/system/production/SigningScreens.tsx>) | 413–699 |
| `PaperStepPanel` | [app/system/production/SigningScreens.tsx](<../../../app/system/production/SigningScreens.tsx>) | 701–757 |
| `StepTable` | [app/system/production/SigningScreens.tsx](<../../../app/system/production/SigningScreens.tsx>) | 759–800 |
| `SignPanel` | [app/system/production/SigningScreens.tsx](<../../../app/system/production/SigningScreens.tsx>) | 808–915 |
| `DelegatePrompt` | [app/system/production/SigningScreens.tsx](<../../../app/system/production/SigningScreens.tsx>) | 917–949 |
| `ProductionSignedDocuments` | [app/system/production/SigningScreens.tsx](<../../../app/system/production/SigningScreens.tsx>) | 955–1037 |
| `CreateSignableDocumentModal` | [app/system/production/SigningScreens.tsx](<../../../app/system/production/SigningScreens.tsx>) | 1039–1147 |
| `FreezeRevisionModal` | [app/system/production/SigningScreens.tsx](<../../../app/system/production/SigningScreens.tsx>) | 1149–1210 |
| `VerifyModal` | [app/system/production/SigningScreens.tsx](<../../../app/system/production/SigningScreens.tsx>) | 1213–1308 |
| `ProductionMySignature` | [app/system/production/SigningScreens.tsx](<../../../app/system/production/SigningScreens.tsx>) | 1314–1378 |
| `MySignatureModal` | [app/system/production/SigningScreens.tsx](<../../../app/system/production/SigningScreens.tsx>) | 1380–1462 |
| `SignaturePad` | [app/system/production/SigningScreens.tsx](<../../../app/system/production/SigningScreens.tsx>) | 1471–1554 |
| `renderTypedSignature` | [app/system/production/SigningScreens.tsx](<../../../app/system/production/SigningScreens.tsx>) | 1556–1570 |
| `ProductionCompanyStamps` | [app/system/production/SigningScreens.tsx](<../../../app/system/production/SigningScreens.tsx>) | 1576–1732 |
| `StampArtworkModal` | [app/system/production/SigningScreens.tsx](<../../../app/system/production/SigningScreens.tsx>) | 1741–1782 |
| `CreateStampModal` | [app/system/production/SigningScreens.tsx](<../../../app/system/production/SigningScreens.tsx>) | 1784–1862 |
| `GrantAuthorityModal` | [app/system/production/SigningScreens.tsx](<../../../app/system/production/SigningScreens.tsx>) | 1864–1943 |
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
- [app/system/DateInput.tsx](<../../../app/system/DateInput.tsx>)
- [app/system/production/signing-preview.css](<../../../app/system/production/signing-preview.css>)

## Candidate regression tests

- [backend-node/tests/drawing-workflow.test.ts](<../../../backend-node/tests/drawing-workflow.test.ts>)
- [backend-node/tests/signing-pdf.test.ts](<../../../backend-node/tests/signing-pdf.test.ts>)
- [backend-node/tests/signing.test.ts](<../../../backend-node/tests/signing.test.ts>)

## Client contract lookup

Search the selected API path or function in [app/system/api-client.ts](<../../../app/system/api-client.ts>); follow its screen callers. Common UI/language changes require [app/system/ui.tsx](<../../../app/system/ui.tsx>) and [app/system/i18n.ts](<../../../app/system/i18n.ts>). For SQL changes use [schema map](../SCHEMA.md).
