# Inquiry / Sales intake

[Context index](../../../AGENTS.md) · [Architecture](../ARCHITECTURE.md) · [Change guide](../WORKFLOW.md)

รับงาน ลูกค้า end user และส่งต่อสำรวจ

Evidence: snapshot `978b0311`; source map, not a live availability claim. Test candidates use filename matching and are not exhaustive coverage.

## Read only the operation you change

- [inquiries API and function map](../api/inquiries.md) — registered in Node app
- [inquiry-attachments API and function map](../api/inquiry-attachments.md) — registered in Node app
- [sales-intakes API and function map](../api/sales-intakes.md) — registered in Node app
- [document-lifecycle API and function map](../api/document-lifecycle.md) — registered in Node app

## UI function locator

Shared screens contain other modules: use the symbol and line range instead of reading the whole file.

| Symbol | Source | Lines |
|---|---|---|
| `toError` | [app/system/production/InquiryScreens.tsx](<../../../app/system/production/InquiryScreens.tsx>) | 87–87 |
| `formatDate` | [app/system/production/InquiryScreens.tsx](<../../../app/system/production/InquiryScreens.tsx>) | 88–88 |
| `formatDateTime` | [app/system/production/InquiryScreens.tsx](<../../../app/system/production/InquiryScreens.tsx>) | 89–89 |
| `formatMoney` | [app/system/production/InquiryScreens.tsx](<../../../app/system/production/InquiryScreens.tsx>) | 90–90 |
| `formatFileSize` | [app/system/production/InquiryScreens.tsx](<../../../app/system/production/InquiryScreens.tsx>) | 91–91 |
| `initials` | [app/system/production/InquiryScreens.tsx](<../../../app/system/production/InquiryScreens.tsx>) | 92–99 |
| `businessDate` | [app/system/production/InquiryScreens.tsx](<../../../app/system/production/InquiryScreens.tsx>) | 100–104 |
| `today` | [app/system/production/InquiryScreens.tsx](<../../../app/system/production/InquiryScreens.tsx>) | 105–105 |
| `futureDate` | [app/system/production/InquiryScreens.tsx](<../../../app/system/production/InquiryScreens.tsx>) | 106–106 |
| `priorityTone` | [app/system/production/InquiryScreens.tsx](<../../../app/system/production/InquiryScreens.tsx>) | 107–107 |
| `probabilityTone` | [app/system/production/InquiryScreens.tsx](<../../../app/system/production/InquiryScreens.tsx>) | 108–108 |
| `interestTone` | [app/system/production/InquiryScreens.tsx](<../../../app/system/production/InquiryScreens.tsx>) | 109–109 |
| `interestLabel` | [app/system/production/InquiryScreens.tsx](<../../../app/system/production/InquiryScreens.tsx>) | 110–110 |
| `compactJson` | [app/system/production/InquiryScreens.tsx](<../../../app/system/production/InquiryScreens.tsx>) | 111–119 |
| `LoadError` | [app/system/production/InquiryScreens.tsx](<../../../app/system/production/InquiryScreens.tsx>) | 121–137 |
| `ProductionInquiries` | [app/system/production/InquiryScreens.tsx](<../../../app/system/production/InquiryScreens.tsx>) | 139–152 |
| `InquiryList` | [app/system/production/InquiryScreens.tsx](<../../../app/system/production/InquiryScreens.tsx>) | 154–729 |
| `InquiryCreate` | [app/system/production/InquiryScreens.tsx](<../../../app/system/production/InquiryScreens.tsx>) | 733–1068 |
| `InquiryDetailScreen` | [app/system/production/InquiryScreens.tsx](<../../../app/system/production/InquiryScreens.tsx>) | 1070–1497 |
| `InquiryOverview` | [app/system/production/InquiryScreens.tsx](<../../../app/system/production/InquiryScreens.tsx>) | 1499–1690 |
| `InquiryRequirement` | [app/system/production/InquiryScreens.tsx](<../../../app/system/production/InquiryScreens.tsx>) | 1692–1716 |
| `MeetingLog` | [app/system/production/InquiryScreens.tsx](<../../../app/system/production/InquiryScreens.tsx>) | 1718–1830 |
| `InquiryEstimateTab` | [app/system/production/InquiryScreens.tsx](<../../../app/system/production/InquiryScreens.tsx>) | 1832–1931 |
| `InquiryAttachments` | [app/system/production/InquiryScreens.tsx](<../../../app/system/production/InquiryScreens.tsx>) | 1933–2012 |
| `InquiryActivityTab` | [app/system/production/InquiryScreens.tsx](<../../../app/system/production/InquiryScreens.tsx>) | 2014–2078 |
| `MeetingDrawer` | [app/system/production/InquiryScreens.tsx](<../../../app/system/production/InquiryScreens.tsx>) | 2080–2195 |
| `AssignOwnerDrawer` | [app/system/production/InquiryScreens.tsx](<../../../app/system/production/InquiryScreens.tsx>) | 2197–2258 |
| `QualificationDrawer` | [app/system/production/InquiryScreens.tsx](<../../../app/system/production/InquiryScreens.tsx>) | 2260–2349 |
| `AttachmentDrawer` | [app/system/production/InquiryScreens.tsx](<../../../app/system/production/InquiryScreens.tsx>) | 2351–2431 |
| `ExistingRfqWork` | [app/system/production/ExistingRfqWork.tsx](<../../../app/system/production/ExistingRfqWork.tsx>) | 11–42 |
| `errorText` | [app/system/production/DocumentLifecycle.tsx](<../../../app/system/production/DocumentLifecycle.tsx>) | 27–27 |
| `DocumentLifecycleButton` | [app/system/production/DocumentLifecycle.tsx](<../../../app/system/production/DocumentLifecycle.tsx>) | 30–34 |
| `LifecycleDialog` | [app/system/production/DocumentLifecycle.tsx](<../../../app/system/production/DocumentLifecycle.tsx>) | 36–101 |
| `DocumentHistoryButton` | [app/system/production/DocumentLifecycle.tsx](<../../../app/system/production/DocumentLifecycle.tsx>) | 104–108 |
| `DocumentHistory` | [app/system/production/DocumentLifecycle.tsx](<../../../app/system/production/DocumentLifecycle.tsx>) | 109–136 |
| `InquiryDeleteDialog` | [app/system/production/DocumentLifecycle.tsx](<../../../app/system/production/DocumentLifecycle.tsx>) | 140–171 |

## Domain helpers / direct dependencies

- [backend-node/src/email.ts](<../../../backend-node/src/email.ts>)
- [backend-node/src/end-user.ts](<../../../backend-node/src/end-user.ts>)
- [backend-node/src/site-visit-common.ts](<../../../backend-node/src/site-visit-common.ts>)
- [backend-node/src/crm-sales-evidence.ts](<../../../backend-node/src/crm-sales-evidence.ts>)
- [backend-node/src/crm.ts](<../../../backend-node/src/crm.ts>)
- [backend-node/src/document-storage.ts](<../../../backend-node/src/document-storage.ts>)
- [backend-node/src/document-number.ts](<../../../backend-node/src/document-number.ts>)
- [backend-node/src/document-lifecycle-policy.ts](<../../../backend-node/src/document-lifecycle-policy.ts>)
- [backend-node/src/user-roles.ts](<../../../backend-node/src/user-roles.ts>)
- [backend-node/src/routes/estimates.ts](<../../../backend-node/src/routes/estimates.ts>)
- [app/system/dialogs.ts](<../../../app/system/dialogs.ts>)
- [lib/remembered-view.ts](<../../../lib/remembered-view.ts>)
- [app/system/production/DocumentLifecycle.tsx](<../../../app/system/production/DocumentLifecycle.tsx>)
- [app/system/production/ProjectHandover.tsx](<../../../app/system/production/ProjectHandover.tsx>)
- [app/system/production/InquirySalesFollowup.tsx](<../../../app/system/production/InquirySalesFollowup.tsx>)
- [app/system/production/ExistingRfqWork.tsx](<../../../app/system/production/ExistingRfqWork.tsx>)
- [app/system/production/EstimateStartFrom.tsx](<../../../app/system/production/EstimateStartFrom.tsx>)
- [app/system/production/CrmScreens.tsx](<../../../app/system/production/CrmScreens.tsx>)
- [lib/feature-flags.ts](<../../../lib/feature-flags.ts>)
- [app/system/i18n.ts](<../../../app/system/i18n.ts>)
- [app/system/LocalizedText.tsx](<../../../app/system/LocalizedText.tsx>)
- [lib/record-live-sync.ts](<../../../lib/record-live-sync.ts>)
- [app/system/production/RecordPresence.tsx](<../../../app/system/production/RecordPresence.tsx>)
- [app/system/production/SiteVisitScreens.tsx](<../../../app/system/production/SiteVisitScreens.tsx>)
- [app/system/production/EndUserCompanyField.tsx](<../../../app/system/production/EndUserCompanyField.tsx>)
- [app/system/production/InquiryCustomerFields.tsx](<../../../app/system/production/InquiryCustomerFields.tsx>)
- [lib/inquiry-queue.ts](<../../../lib/inquiry-queue.ts>)
- [lib/sales-look.ts](<../../../lib/sales-look.ts>)
- [app/system/production/SalesLook.tsx](<../../../app/system/production/SalesLook.tsx>)
- [app/system/api-client.ts](<../../../app/system/api-client.ts>)
- [app/system/ui.tsx](<../../../app/system/ui.tsx>)
- [app/system/DateInput.tsx](<../../../app/system/DateInput.tsx>)

## Candidate regression tests

- [tests/end-user-ui.test.mjs](<../../../tests/end-user-ui.test.mjs>)
- [tests/inquiry-assignment-notification.test.mjs](<../../../tests/inquiry-assignment-notification.test.mjs>)
- [tests/inquiry-queue.test.mjs](<../../../tests/inquiry-queue.test.mjs>)
- [tests/inquiry-visit-flow.test.mjs](<../../../tests/inquiry-visit-flow.test.mjs>)
- [backend-node/tests/document-lifecycle.test.ts](<../../../backend-node/tests/document-lifecycle.test.ts>)
- [backend-node/tests/end-user.test.ts](<../../../backend-node/tests/end-user.test.ts>)
- [backend-node/tests/inquiry-list-summary.test.ts](<../../../backend-node/tests/inquiry-list-summary.test.ts>)

## Client contract lookup

Search the selected API path or function in [app/system/api-client.ts](<../../../app/system/api-client.ts>); follow its screen callers. Common UI/language changes require [app/system/ui.tsx](<../../../app/system/ui.tsx>) and [app/system/i18n.ts](<../../../app/system/i18n.ts>). For SQL changes use [schema map](../SCHEMA.md).
