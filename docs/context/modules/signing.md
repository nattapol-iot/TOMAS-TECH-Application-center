# Sign Drawing / Documents / Stamps

[Context index](../../../AGENTS.md) · [Architecture](../ARCHITECTURE.md) · [Change guide](../WORKFLOW.md)

ลงนาม inbox ลายเซ็น ตราบริษัท และตรวจ certificate

Evidence: snapshot `019ed16c`; source map, not a live availability claim. Test candidates use filename matching and are not exhaustive coverage.

## Read only the operation you change

- [signing API and function map](../api/signing.md) — registered in Node app
- [signature-master API and function map](../api/signature-master.md) — registered in Node app

## UI function locator

Shared screens contain other modules: use the symbol and line range instead of reading the whole file.

| Symbol | Source | Lines |
|---|---|---|
| `toError` | [app/system/production/SigningScreens.tsx](<../../../app/system/production/SigningScreens.tsx>) | 68–68 |
| `money` | [app/system/production/SigningScreens.tsx](<../../../app/system/production/SigningScreens.tsx>) | 69–69 |
| `date` | [app/system/production/SigningScreens.tsx](<../../../app/system/production/SigningScreens.tsx>) | 70–70 |
| `dateTime` | [app/system/production/SigningScreens.tsx](<../../../app/system/production/SigningScreens.tsx>) | 71–71 |
| `isoToday` | [app/system/production/SigningScreens.tsx](<../../../app/system/production/SigningScreens.tsx>) | 73–73 |
| `hasPermission` | [app/system/production/SigningScreens.tsx](<../../../app/system/production/SigningScreens.tsx>) | 74–74 |
| `shortHash` | [app/system/production/SigningScreens.tsx](<../../../app/system/production/SigningScreens.tsx>) | 75–75 |
| `classLabel` | [app/system/production/SigningScreens.tsx](<../../../app/system/production/SigningScreens.tsx>) | 106–106 |
| `blockLabel` | [app/system/production/SigningScreens.tsx](<../../../app/system/production/SigningScreens.tsx>) | 107–107 |
| `markLabel` | [app/system/production/SigningScreens.tsx](<../../../app/system/production/SigningScreens.tsx>) | 108–108 |
| `useEndpoint` | [app/system/production/SigningScreens.tsx](<../../../app/system/production/SigningScreens.tsx>) | 126–162 |
| `Loading` | [app/system/production/SigningScreens.tsx](<../../../app/system/production/SigningScreens.tsx>) | 164–171 |
| `LoadError` | [app/system/production/SigningScreens.tsx](<../../../app/system/production/SigningScreens.tsx>) | 173–190 |
| `ActionError` | [app/system/production/SigningScreens.tsx](<../../../app/system/production/SigningScreens.tsx>) | 192–204 |
| `RefreshButton` | [app/system/production/SigningScreens.tsx](<../../../app/system/production/SigningScreens.tsx>) | 206–213 |
| `ReasonPrompt` | [app/system/production/SigningScreens.tsx](<../../../app/system/production/SigningScreens.tsx>) | 215–255 |
| `ProductionSignInbox` | [app/system/production/SigningScreens.tsx](<../../../app/system/production/SigningScreens.tsx>) | 261–418 |
| `SignTaskRow` | [app/system/production/SigningScreens.tsx](<../../../app/system/production/SigningScreens.tsx>) | 420–482 |
| `DocumentTable` | [app/system/production/SigningScreens.tsx](<../../../app/system/production/SigningScreens.tsx>) | 484–551 |
| `SignDocumentDrawer` | [app/system/production/SigningScreens.tsx](<../../../app/system/production/SigningScreens.tsx>) | 557–1112 |
| `PaperStepPanel` | [app/system/production/SigningScreens.tsx](<../../../app/system/production/SigningScreens.tsx>) | 1114–1180 |
| `StepTable` | [app/system/production/SigningScreens.tsx](<../../../app/system/production/SigningScreens.tsx>) | 1182–1262 |
| `SignPanel` | [app/system/production/SigningScreens.tsx](<../../../app/system/production/SigningScreens.tsx>) | 1270–1473 |
| `DelegatePrompt` | [app/system/production/SigningScreens.tsx](<../../../app/system/production/SigningScreens.tsx>) | 1475–1511 |
| `ProductionSignedDocuments` | [app/system/production/SigningScreens.tsx](<../../../app/system/production/SigningScreens.tsx>) | 1517–1632 |
| `CreateSignableDocumentModal` | [app/system/production/SigningScreens.tsx](<../../../app/system/production/SigningScreens.tsx>) | 1634–1818 |
| `FreezeRevisionModal` | [app/system/production/SigningScreens.tsx](<../../../app/system/production/SigningScreens.tsx>) | 1820–1907 |
| `VerifyModal` | [app/system/production/SigningScreens.tsx](<../../../app/system/production/SigningScreens.tsx>) | 1910–2106 |
| `ProductionMySignature` | [app/system/production/SigningScreens.tsx](<../../../app/system/production/SigningScreens.tsx>) | 2112–2244 |
| `MySignatureModal` | [app/system/production/SigningScreens.tsx](<../../../app/system/production/SigningScreens.tsx>) | 2246–2350 |
| `SignaturePad` | [app/system/production/SigningScreens.tsx](<../../../app/system/production/SigningScreens.tsx>) | 2359–2461 |
| `renderTypedSignature` | [app/system/production/SigningScreens.tsx](<../../../app/system/production/SigningScreens.tsx>) | 2463–2477 |
| `ProductionCompanyStamps` | [app/system/production/SigningScreens.tsx](<../../../app/system/production/SigningScreens.tsx>) | 2483–2837 |
| `StampArtworkModal` | [app/system/production/SigningScreens.tsx](<../../../app/system/production/SigningScreens.tsx>) | 2846–2919 |
| `CreateStampModal` | [app/system/production/SigningScreens.tsx](<../../../app/system/production/SigningScreens.tsx>) | 2921–3045 |
| `GrantAuthorityModal` | [app/system/production/SigningScreens.tsx](<../../../app/system/production/SigningScreens.tsx>) | 3047–3158 |
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
- [backend-node/src/user-roles.ts](<../../../backend-node/src/user-roles.ts>)
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
