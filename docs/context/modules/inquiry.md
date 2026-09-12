# Inquiry / Sales intake

[Context index](../../../AGENTS.md) · [Architecture](../ARCHITECTURE.md) · [Change guide](../WORKFLOW.md)

รับงาน ลูกค้า end user และส่งต่อสำรวจ

Evidence: snapshot `84fdd5bc`; source map, not a live availability claim. Test candidates use filename matching and are not exhaustive coverage.

## Read only the operation you change

- [inquiries API and function map](../api/inquiries.md) — registered in Node app
- [inquiry-attachments API and function map](../api/inquiry-attachments.md) — registered in Node app
- [sales-intakes API and function map](../api/sales-intakes.md) — registered in Node app

## UI function locator

Shared screens contain other modules: use the symbol and line range instead of reading the whole file.

| Symbol | Source | Lines |
|---|---|---|
| `toError` | [app/system/production/InquiryScreens.tsx](<../../../app/system/production/InquiryScreens.tsx>) | 82–82 |
| `formatDate` | [app/system/production/InquiryScreens.tsx](<../../../app/system/production/InquiryScreens.tsx>) | 83–83 |
| `formatDateTime` | [app/system/production/InquiryScreens.tsx](<../../../app/system/production/InquiryScreens.tsx>) | 84–84 |
| `formatMoney` | [app/system/production/InquiryScreens.tsx](<../../../app/system/production/InquiryScreens.tsx>) | 85–85 |
| `formatFileSize` | [app/system/production/InquiryScreens.tsx](<../../../app/system/production/InquiryScreens.tsx>) | 86–86 |
| `initials` | [app/system/production/InquiryScreens.tsx](<../../../app/system/production/InquiryScreens.tsx>) | 87–87 |
| `businessDate` | [app/system/production/InquiryScreens.tsx](<../../../app/system/production/InquiryScreens.tsx>) | 88–92 |
| `today` | [app/system/production/InquiryScreens.tsx](<../../../app/system/production/InquiryScreens.tsx>) | 93–93 |
| `futureDate` | [app/system/production/InquiryScreens.tsx](<../../../app/system/production/InquiryScreens.tsx>) | 94–94 |
| `priorityTone` | [app/system/production/InquiryScreens.tsx](<../../../app/system/production/InquiryScreens.tsx>) | 95–95 |
| `probabilityTone` | [app/system/production/InquiryScreens.tsx](<../../../app/system/production/InquiryScreens.tsx>) | 96–96 |
| `interestTone` | [app/system/production/InquiryScreens.tsx](<../../../app/system/production/InquiryScreens.tsx>) | 97–97 |
| `interestLabel` | [app/system/production/InquiryScreens.tsx](<../../../app/system/production/InquiryScreens.tsx>) | 98–98 |
| `compactJson` | [app/system/production/InquiryScreens.tsx](<../../../app/system/production/InquiryScreens.tsx>) | 99–105 |
| `LoadError` | [app/system/production/InquiryScreens.tsx](<../../../app/system/production/InquiryScreens.tsx>) | 107–109 |
| `ProductionInquiries` | [app/system/production/InquiryScreens.tsx](<../../../app/system/production/InquiryScreens.tsx>) | 111–116 |
| `InquiryList` | [app/system/production/InquiryScreens.tsx](<../../../app/system/production/InquiryScreens.tsx>) | 118–256 |
| `InquiryCreate` | [app/system/production/InquiryScreens.tsx](<../../../app/system/production/InquiryScreens.tsx>) | 260–332 |
| `InquiryDetailScreen` | [app/system/production/InquiryScreens.tsx](<../../../app/system/production/InquiryScreens.tsx>) | 334–461 |
| `InquiryOverview` | [app/system/production/InquiryScreens.tsx](<../../../app/system/production/InquiryScreens.tsx>) | 463–470 |
| `InquiryRequirement` | [app/system/production/InquiryScreens.tsx](<../../../app/system/production/InquiryScreens.tsx>) | 472–475 |
| `MeetingLog` | [app/system/production/InquiryScreens.tsx](<../../../app/system/production/InquiryScreens.tsx>) | 477–479 |
| `InquiryEstimateTab` | [app/system/production/InquiryScreens.tsx](<../../../app/system/production/InquiryScreens.tsx>) | 481–488 |
| `InquiryAttachments` | [app/system/production/InquiryScreens.tsx](<../../../app/system/production/InquiryScreens.tsx>) | 490–503 |
| `InquiryActivityTab` | [app/system/production/InquiryScreens.tsx](<../../../app/system/production/InquiryScreens.tsx>) | 505–508 |
| `MeetingDrawer` | [app/system/production/InquiryScreens.tsx](<../../../app/system/production/InquiryScreens.tsx>) | 510–521 |
| `AssignOwnerDrawer` | [app/system/production/InquiryScreens.tsx](<../../../app/system/production/InquiryScreens.tsx>) | 523–530 |
| `QualificationDrawer` | [app/system/production/InquiryScreens.tsx](<../../../app/system/production/InquiryScreens.tsx>) | 532–563 |
| `AttachmentDrawer` | [app/system/production/InquiryScreens.tsx](<../../../app/system/production/InquiryScreens.tsx>) | 565–572 |

## Domain helpers / direct dependencies

- [backend-node/src/end-user.ts](<../../../backend-node/src/end-user.ts>)
- [backend-node/src/document-storage.ts](<../../../backend-node/src/document-storage.ts>)
- [backend-node/src/document-number.ts](<../../../backend-node/src/document-number.ts>)
- [backend-node/src/site-visit-common.ts](<../../../backend-node/src/site-visit-common.ts>)
- [app/system/i18n.ts](<../../../app/system/i18n.ts>)
- [app/system/LocalizedText.tsx](<../../../app/system/LocalizedText.tsx>)
- [app/system/production/SiteVisitScreens.tsx](<../../../app/system/production/SiteVisitScreens.tsx>)
- [app/system/production/EndUserCompanyField.tsx](<../../../app/system/production/EndUserCompanyField.tsx>)
- [app/system/production/InquiryCustomerFields.tsx](<../../../app/system/production/InquiryCustomerFields.tsx>)
- [lib/inquiry-queue.ts](<../../../lib/inquiry-queue.ts>)
- [app/system/api-client.ts](<../../../app/system/api-client.ts>)
- [app/system/ui.tsx](<../../../app/system/ui.tsx>)

## Candidate regression tests

- [tests/end-user-ui.test.mjs](<../../../tests/end-user-ui.test.mjs>)
- [tests/inquiry-queue.test.mjs](<../../../tests/inquiry-queue.test.mjs>)
- [tests/inquiry-visit-flow.test.mjs](<../../../tests/inquiry-visit-flow.test.mjs>)
- [backend-node/tests/end-user.test.ts](<../../../backend-node/tests/end-user.test.ts>)

## Client contract lookup

Search the selected API path or function in [app/system/api-client.ts](<../../../app/system/api-client.ts>); follow its screen callers. Common UI/language changes require [app/system/ui.tsx](<../../../app/system/ui.tsx>) and [app/system/i18n.ts](<../../../app/system/i18n.ts>). For SQL changes use [schema map](../SCHEMA.md).
