# Sign Drawing / Documents / Stamps

[Context index](../../../AGENTS.md) · [Architecture](../ARCHITECTURE.md) · [Change guide](../WORKFLOW.md)

ลงนาม inbox ลายเซ็น ตราบริษัท และตรวจ certificate

Evidence: snapshot `84fdd5bc`; source map, not a live availability claim. Test candidates use filename matching and are not exhaustive coverage.

## Read only the operation you change

- [signing API and function map](../api/signing.md) — registered in Node app
- [signature-master API and function map](../api/signature-master.md) — registered in Node app

## UI function locator

Shared screens contain other modules: use the symbol and line range instead of reading the whole file.

| Symbol | Source | Lines |
|---|---|---|
| `toError` | [app/system/production/SigningScreens.tsx](<../../../app/system/production/SigningScreens.tsx>) | 76–76 |
| `money` | [app/system/production/SigningScreens.tsx](<../../../app/system/production/SigningScreens.tsx>) | 77–79 |
| `date` | [app/system/production/SigningScreens.tsx](<../../../app/system/production/SigningScreens.tsx>) | 80–82 |
| `dateTime` | [app/system/production/SigningScreens.tsx](<../../../app/system/production/SigningScreens.tsx>) | 83–85 |
| `isoToday` | [app/system/production/SigningScreens.tsx](<../../../app/system/production/SigningScreens.tsx>) | 86–86 |
| `hasPermission` | [app/system/production/SigningScreens.tsx](<../../../app/system/production/SigningScreens.tsx>) | 87–87 |
| `shortHash` | [app/system/production/SigningScreens.tsx](<../../../app/system/production/SigningScreens.tsx>) | 88–88 |
| `classLabel` | [app/system/production/SigningScreens.tsx](<../../../app/system/production/SigningScreens.tsx>) | 119–119 |
| `blockLabel` | [app/system/production/SigningScreens.tsx](<../../../app/system/production/SigningScreens.tsx>) | 120–120 |
| `markLabel` | [app/system/production/SigningScreens.tsx](<../../../app/system/production/SigningScreens.tsx>) | 121–121 |
| `useEndpoint` | [app/system/production/SigningScreens.tsx](<../../../app/system/production/SigningScreens.tsx>) | 139–168 |
| `Loading` | [app/system/production/SigningScreens.tsx](<../../../app/system/production/SigningScreens.tsx>) | 170–172 |
| `LoadError` | [app/system/production/SigningScreens.tsx](<../../../app/system/production/SigningScreens.tsx>) | 174–185 |
| `ActionError` | [app/system/production/SigningScreens.tsx](<../../../app/system/production/SigningScreens.tsx>) | 187–191 |
| `RefreshButton` | [app/system/production/SigningScreens.tsx](<../../../app/system/production/SigningScreens.tsx>) | 193–195 |
| `ReasonPrompt` | [app/system/production/SigningScreens.tsx](<../../../app/system/production/SigningScreens.tsx>) | 197–227 |
| `ProductionSignInbox` | [app/system/production/SigningScreens.tsx](<../../../app/system/production/SigningScreens.tsx>) | 233–330 |
| `SignTaskRow` | [app/system/production/SigningScreens.tsx](<../../../app/system/production/SigningScreens.tsx>) | 332–371 |
| `DocumentTable` | [app/system/production/SigningScreens.tsx](<../../../app/system/production/SigningScreens.tsx>) | 373–401 |
| `SignDocumentDrawer` | [app/system/production/SigningScreens.tsx](<../../../app/system/production/SigningScreens.tsx>) | 407–693 |
| `PaperStepPanel` | [app/system/production/SigningScreens.tsx](<../../../app/system/production/SigningScreens.tsx>) | 695–751 |
| `StepTable` | [app/system/production/SigningScreens.tsx](<../../../app/system/production/SigningScreens.tsx>) | 753–794 |
| `SignPanel` | [app/system/production/SigningScreens.tsx](<../../../app/system/production/SigningScreens.tsx>) | 802–909 |
| `DelegatePrompt` | [app/system/production/SigningScreens.tsx](<../../../app/system/production/SigningScreens.tsx>) | 911–943 |
| `ProductionSignedDocuments` | [app/system/production/SigningScreens.tsx](<../../../app/system/production/SigningScreens.tsx>) | 949–1031 |
| `CreateSignableDocumentModal` | [app/system/production/SigningScreens.tsx](<../../../app/system/production/SigningScreens.tsx>) | 1033–1142 |
| `FreezeRevisionModal` | [app/system/production/SigningScreens.tsx](<../../../app/system/production/SigningScreens.tsx>) | 1144–1205 |
| `VerifyModal` | [app/system/production/SigningScreens.tsx](<../../../app/system/production/SigningScreens.tsx>) | 1208–1303 |
| `ProductionMySignature` | [app/system/production/SigningScreens.tsx](<../../../app/system/production/SigningScreens.tsx>) | 1309–1373 |
| `MySignatureModal` | [app/system/production/SigningScreens.tsx](<../../../app/system/production/SigningScreens.tsx>) | 1375–1457 |
| `SignaturePad` | [app/system/production/SigningScreens.tsx](<../../../app/system/production/SigningScreens.tsx>) | 1466–1549 |
| `renderTypedSignature` | [app/system/production/SigningScreens.tsx](<../../../app/system/production/SigningScreens.tsx>) | 1551–1565 |
| `ProductionCompanyStamps` | [app/system/production/SigningScreens.tsx](<../../../app/system/production/SigningScreens.tsx>) | 1571–1719 |
| `CreateStampModal` | [app/system/production/SigningScreens.tsx](<../../../app/system/production/SigningScreens.tsx>) | 1721–1799 |
| `GrantAuthorityModal` | [app/system/production/SigningScreens.tsx](<../../../app/system/production/SigningScreens.tsx>) | 1801–1880 |
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
- [app/system/i18n.ts](<../../../app/system/i18n.ts>)
- [app/system/LocalizedText.tsx](<../../../app/system/LocalizedText.tsx>)
- [app/system/production/SigningPreview.tsx](<../../../app/system/production/SigningPreview.tsx>)
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
