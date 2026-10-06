# Sign Drawing / Documents / Stamps

[Context index](../../../AGENTS.md) · [Architecture](../ARCHITECTURE.md) · [Change guide](../WORKFLOW.md)

ลงนาม inbox ลายเซ็น ตราบริษัท และตรวจ certificate

Evidence: snapshot `d3966892`; source map, not a live availability claim. Test candidates use filename matching and are not exhaustive coverage.

## Read only the operation you change

- [signing API and function map](../api/signing.md) — registered in Node app
- [signature-master API and function map](../api/signature-master.md) — registered in Node app

## UI function locator

Shared screens contain other modules: use the symbol and line range instead of reading the whole file.

| Symbol | Source | Lines |
|---|---|---|
| `toError` | [app/system/production/SigningScreens.tsx](<../../../app/system/production/SigningScreens.tsx>) | 77–77 |
| `money` | [app/system/production/SigningScreens.tsx](<../../../app/system/production/SigningScreens.tsx>) | 78–80 |
| `date` | [app/system/production/SigningScreens.tsx](<../../../app/system/production/SigningScreens.tsx>) | 81–83 |
| `dateTime` | [app/system/production/SigningScreens.tsx](<../../../app/system/production/SigningScreens.tsx>) | 84–86 |
| `isoToday` | [app/system/production/SigningScreens.tsx](<../../../app/system/production/SigningScreens.tsx>) | 88–88 |
| `hasPermission` | [app/system/production/SigningScreens.tsx](<../../../app/system/production/SigningScreens.tsx>) | 89–89 |
| `shortHash` | [app/system/production/SigningScreens.tsx](<../../../app/system/production/SigningScreens.tsx>) | 90–90 |
| `classLabel` | [app/system/production/SigningScreens.tsx](<../../../app/system/production/SigningScreens.tsx>) | 121–121 |
| `blockLabel` | [app/system/production/SigningScreens.tsx](<../../../app/system/production/SigningScreens.tsx>) | 122–122 |
| `markLabel` | [app/system/production/SigningScreens.tsx](<../../../app/system/production/SigningScreens.tsx>) | 123–123 |
| `useEndpoint` | [app/system/production/SigningScreens.tsx](<../../../app/system/production/SigningScreens.tsx>) | 141–170 |
| `Loading` | [app/system/production/SigningScreens.tsx](<../../../app/system/production/SigningScreens.tsx>) | 172–174 |
| `LoadError` | [app/system/production/SigningScreens.tsx](<../../../app/system/production/SigningScreens.tsx>) | 176–187 |
| `ActionError` | [app/system/production/SigningScreens.tsx](<../../../app/system/production/SigningScreens.tsx>) | 189–193 |
| `RefreshButton` | [app/system/production/SigningScreens.tsx](<../../../app/system/production/SigningScreens.tsx>) | 195–197 |
| `ReasonPrompt` | [app/system/production/SigningScreens.tsx](<../../../app/system/production/SigningScreens.tsx>) | 199–229 |
| `ProductionSignInbox` | [app/system/production/SigningScreens.tsx](<../../../app/system/production/SigningScreens.tsx>) | 235–332 |
| `SignTaskRow` | [app/system/production/SigningScreens.tsx](<../../../app/system/production/SigningScreens.tsx>) | 334–373 |
| `DocumentTable` | [app/system/production/SigningScreens.tsx](<../../../app/system/production/SigningScreens.tsx>) | 375–403 |
| `SignDocumentDrawer` | [app/system/production/SigningScreens.tsx](<../../../app/system/production/SigningScreens.tsx>) | 409–695 |
| `PaperStepPanel` | [app/system/production/SigningScreens.tsx](<../../../app/system/production/SigningScreens.tsx>) | 697–753 |
| `StepTable` | [app/system/production/SigningScreens.tsx](<../../../app/system/production/SigningScreens.tsx>) | 755–796 |
| `SignPanel` | [app/system/production/SigningScreens.tsx](<../../../app/system/production/SigningScreens.tsx>) | 804–911 |
| `DelegatePrompt` | [app/system/production/SigningScreens.tsx](<../../../app/system/production/SigningScreens.tsx>) | 913–945 |
| `ProductionSignedDocuments` | [app/system/production/SigningScreens.tsx](<../../../app/system/production/SigningScreens.tsx>) | 951–1033 |
| `CreateSignableDocumentModal` | [app/system/production/SigningScreens.tsx](<../../../app/system/production/SigningScreens.tsx>) | 1035–1144 |
| `FreezeRevisionModal` | [app/system/production/SigningScreens.tsx](<../../../app/system/production/SigningScreens.tsx>) | 1146–1207 |
| `VerifyModal` | [app/system/production/SigningScreens.tsx](<../../../app/system/production/SigningScreens.tsx>) | 1210–1305 |
| `ProductionMySignature` | [app/system/production/SigningScreens.tsx](<../../../app/system/production/SigningScreens.tsx>) | 1311–1375 |
| `MySignatureModal` | [app/system/production/SigningScreens.tsx](<../../../app/system/production/SigningScreens.tsx>) | 1377–1459 |
| `SignaturePad` | [app/system/production/SigningScreens.tsx](<../../../app/system/production/SigningScreens.tsx>) | 1468–1551 |
| `renderTypedSignature` | [app/system/production/SigningScreens.tsx](<../../../app/system/production/SigningScreens.tsx>) | 1553–1567 |
| `ProductionCompanyStamps` | [app/system/production/SigningScreens.tsx](<../../../app/system/production/SigningScreens.tsx>) | 1573–1721 |
| `CreateStampModal` | [app/system/production/SigningScreens.tsx](<../../../app/system/production/SigningScreens.tsx>) | 1723–1801 |
| `GrantAuthorityModal` | [app/system/production/SigningScreens.tsx](<../../../app/system/production/SigningScreens.tsx>) | 1803–1882 |
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
- [app/system/i18n.ts](<../../../app/system/i18n.ts>)
- [app/system/LocalizedText.tsx](<../../../app/system/LocalizedText.tsx>)
- [app/system/production/SigningPreview.tsx](<../../../app/system/production/SigningPreview.tsx>)
- [lib/estimate-ux.ts](<../../../lib/estimate-ux.ts>)
- [app/system/production/signing-stamp-form.css](<../../../app/system/production/signing-stamp-form.css>)
- [app/system/production/signing-preview-client.ts](<../../../app/system/production/signing-preview-client.ts>)
- [app/system/api-client.ts](<../../../app/system/api-client.ts>)
- [app/system/ui.tsx](<../../../app/system/ui.tsx>)
- [app/system/production/signing-preview.css](<../../../app/system/production/signing-preview.css>)

## Candidate regression tests

- [backend-node/tests/drawing-workflow.test.ts](<../../../backend-node/tests/drawing-workflow.test.ts>)
- [backend-node/tests/signing-pdf.test.ts](<../../../backend-node/tests/signing-pdf.test.ts>)
- [backend-node/tests/signing.test.ts](<../../../backend-node/tests/signing.test.ts>)

## Client contract lookup

Search the selected API path or function in [app/system/api-client.ts](<../../../app/system/api-client.ts>); follow its screen callers. Common UI/language changes require [app/system/ui.tsx](<../../../app/system/ui.tsx>) and [app/system/i18n.ts](<../../../app/system/i18n.ts>). For SQL changes use [schema map](../SCHEMA.md).
