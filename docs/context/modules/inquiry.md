# Inquiry / Sales intake

[Context index](../../../AGENTS.md) · [Architecture](../ARCHITECTURE.md) · [Change guide](../WORKFLOW.md)

รับงาน ลูกค้า end user และส่งต่อสำรวจ

Evidence: snapshot `80a5348e`; source map, not a live availability claim. Test candidates use filename matching and are not exhaustive coverage.

## Read only the operation you change

- [inquiries API and function map](../api/inquiries.md) — registered in Node app
- [inquiry-attachments API and function map](../api/inquiry-attachments.md) — registered in Node app
- [sales-intakes API and function map](../api/sales-intakes.md) — registered in Node app

## UI function locator

Shared screens contain other modules: use the symbol and line range instead of reading the whole file.

| Symbol | Source | Lines |
|---|---|---|
| `toError` | [app/system/production/InquiryScreens.tsx](<../../../app/system/production/InquiryScreens.tsx>) | 85–85 |
| `formatDate` | [app/system/production/InquiryScreens.tsx](<../../../app/system/production/InquiryScreens.tsx>) | 86–86 |
| `formatDateTime` | [app/system/production/InquiryScreens.tsx](<../../../app/system/production/InquiryScreens.tsx>) | 87–87 |
| `formatMoney` | [app/system/production/InquiryScreens.tsx](<../../../app/system/production/InquiryScreens.tsx>) | 88–88 |
| `formatFileSize` | [app/system/production/InquiryScreens.tsx](<../../../app/system/production/InquiryScreens.tsx>) | 89–89 |
| `initials` | [app/system/production/InquiryScreens.tsx](<../../../app/system/production/InquiryScreens.tsx>) | 90–90 |
| `businessDate` | [app/system/production/InquiryScreens.tsx](<../../../app/system/production/InquiryScreens.tsx>) | 91–95 |
| `today` | [app/system/production/InquiryScreens.tsx](<../../../app/system/production/InquiryScreens.tsx>) | 96–96 |
| `futureDate` | [app/system/production/InquiryScreens.tsx](<../../../app/system/production/InquiryScreens.tsx>) | 97–97 |
| `priorityTone` | [app/system/production/InquiryScreens.tsx](<../../../app/system/production/InquiryScreens.tsx>) | 98–98 |
| `probabilityTone` | [app/system/production/InquiryScreens.tsx](<../../../app/system/production/InquiryScreens.tsx>) | 99–99 |
| `interestTone` | [app/system/production/InquiryScreens.tsx](<../../../app/system/production/InquiryScreens.tsx>) | 100–100 |
| `interestLabel` | [app/system/production/InquiryScreens.tsx](<../../../app/system/production/InquiryScreens.tsx>) | 101–101 |
| `compactJson` | [app/system/production/InquiryScreens.tsx](<../../../app/system/production/InquiryScreens.tsx>) | 102–108 |
| `LoadError` | [app/system/production/InquiryScreens.tsx](<../../../app/system/production/InquiryScreens.tsx>) | 110–112 |
| `ProductionInquiries` | [app/system/production/InquiryScreens.tsx](<../../../app/system/production/InquiryScreens.tsx>) | 114–119 |
| `InquiryList` | [app/system/production/InquiryScreens.tsx](<../../../app/system/production/InquiryScreens.tsx>) | 121–259 |
| `InquiryCreate` | [app/system/production/InquiryScreens.tsx](<../../../app/system/production/InquiryScreens.tsx>) | 263–338 |
| `InquiryDetailScreen` | [app/system/production/InquiryScreens.tsx](<../../../app/system/production/InquiryScreens.tsx>) | 340–468 |
| `InquiryOverview` | [app/system/production/InquiryScreens.tsx](<../../../app/system/production/InquiryScreens.tsx>) | 470–477 |
| `InquiryRequirement` | [app/system/production/InquiryScreens.tsx](<../../../app/system/production/InquiryScreens.tsx>) | 479–482 |
| `MeetingLog` | [app/system/production/InquiryScreens.tsx](<../../../app/system/production/InquiryScreens.tsx>) | 484–486 |
| `InquiryEstimateTab` | [app/system/production/InquiryScreens.tsx](<../../../app/system/production/InquiryScreens.tsx>) | 488–495 |
| `InquiryAttachments` | [app/system/production/InquiryScreens.tsx](<../../../app/system/production/InquiryScreens.tsx>) | 497–510 |
| `InquiryActivityTab` | [app/system/production/InquiryScreens.tsx](<../../../app/system/production/InquiryScreens.tsx>) | 512–515 |
| `MeetingDrawer` | [app/system/production/InquiryScreens.tsx](<../../../app/system/production/InquiryScreens.tsx>) | 517–528 |
| `AssignOwnerDrawer` | [app/system/production/InquiryScreens.tsx](<../../../app/system/production/InquiryScreens.tsx>) | 530–537 |
| `QualificationDrawer` | [app/system/production/InquiryScreens.tsx](<../../../app/system/production/InquiryScreens.tsx>) | 539–570 |
| `AttachmentDrawer` | [app/system/production/InquiryScreens.tsx](<../../../app/system/production/InquiryScreens.tsx>) | 572–579 |

## Domain helpers / direct dependencies

- [backend-node/src/end-user.ts](<../../../backend-node/src/end-user.ts>)
- [backend-node/src/crm.ts](<../../../backend-node/src/crm.ts>)
- [backend-node/src/document-storage.ts](<../../../backend-node/src/document-storage.ts>)
- [backend-node/src/document-number.ts](<../../../backend-node/src/document-number.ts>)
- [backend-node/src/site-visit-common.ts](<../../../backend-node/src/site-visit-common.ts>)
- [app/system/production/CrmScreens.tsx](<../../../app/system/production/CrmScreens.tsx>)
- [lib/feature-flags.ts](<../../../lib/feature-flags.ts>)
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
