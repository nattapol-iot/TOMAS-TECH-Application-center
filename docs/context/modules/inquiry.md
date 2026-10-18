# Inquiry / Sales intake

[Context index](../../../AGENTS.md) · [Architecture](../ARCHITECTURE.md) · [Change guide](../WORKFLOW.md)

รับงาน ลูกค้า end user และส่งต่อสำรวจ

Evidence: snapshot `cdd904e3`; source map, not a live availability claim. Test candidates use filename matching and are not exhaustive coverage.

## Read only the operation you change

- [inquiries API and function map](../api/inquiries.md) — registered in Node app
- [inquiry-attachments API and function map](../api/inquiry-attachments.md) — registered in Node app
- [sales-intakes API and function map](../api/sales-intakes.md) — registered in Node app
- [document-lifecycle API and function map](../api/document-lifecycle.md) — registered in Node app

## UI function locator

Shared screens contain other modules: use the symbol and line range instead of reading the whole file.

| Symbol | Source | Lines |
|---|---|---|
| `toError` | [app/system/production/InquiryScreens.tsx](<../../../app/system/production/InquiryScreens.tsx>) | 99–99 |
| `formatDate` | [app/system/production/InquiryScreens.tsx](<../../../app/system/production/InquiryScreens.tsx>) | 100–100 |
| `formatDateTime` | [app/system/production/InquiryScreens.tsx](<../../../app/system/production/InquiryScreens.tsx>) | 101–101 |
| `formatMoney` | [app/system/production/InquiryScreens.tsx](<../../../app/system/production/InquiryScreens.tsx>) | 102–102 |
| `formatFileSize` | [app/system/production/InquiryScreens.tsx](<../../../app/system/production/InquiryScreens.tsx>) | 103–103 |
| `initials` | [app/system/production/InquiryScreens.tsx](<../../../app/system/production/InquiryScreens.tsx>) | 104–104 |
| `businessDate` | [app/system/production/InquiryScreens.tsx](<../../../app/system/production/InquiryScreens.tsx>) | 105–109 |
| `today` | [app/system/production/InquiryScreens.tsx](<../../../app/system/production/InquiryScreens.tsx>) | 110–110 |
| `futureDate` | [app/system/production/InquiryScreens.tsx](<../../../app/system/production/InquiryScreens.tsx>) | 111–111 |
| `priorityTone` | [app/system/production/InquiryScreens.tsx](<../../../app/system/production/InquiryScreens.tsx>) | 112–112 |
| `probabilityTone` | [app/system/production/InquiryScreens.tsx](<../../../app/system/production/InquiryScreens.tsx>) | 113–113 |
| `interestTone` | [app/system/production/InquiryScreens.tsx](<../../../app/system/production/InquiryScreens.tsx>) | 114–114 |
| `interestLabel` | [app/system/production/InquiryScreens.tsx](<../../../app/system/production/InquiryScreens.tsx>) | 115–115 |
| `compactJson` | [app/system/production/InquiryScreens.tsx](<../../../app/system/production/InquiryScreens.tsx>) | 116–122 |
| `LoadError` | [app/system/production/InquiryScreens.tsx](<../../../app/system/production/InquiryScreens.tsx>) | 124–126 |
| `ProductionInquiries` | [app/system/production/InquiryScreens.tsx](<../../../app/system/production/InquiryScreens.tsx>) | 128–135 |
| `InquiryList` | [app/system/production/InquiryScreens.tsx](<../../../app/system/production/InquiryScreens.tsx>) | 137–290 |
| `InquiryCreate` | [app/system/production/InquiryScreens.tsx](<../../../app/system/production/InquiryScreens.tsx>) | 294–414 |
| `InquiryDetailScreen` | [app/system/production/InquiryScreens.tsx](<../../../app/system/production/InquiryScreens.tsx>) | 416–556 |
| `InquiryOverview` | [app/system/production/InquiryScreens.tsx](<../../../app/system/production/InquiryScreens.tsx>) | 558–565 |
| `InquiryRequirement` | [app/system/production/InquiryScreens.tsx](<../../../app/system/production/InquiryScreens.tsx>) | 567–570 |
| `MeetingLog` | [app/system/production/InquiryScreens.tsx](<../../../app/system/production/InquiryScreens.tsx>) | 572–574 |
| `InquiryEstimateTab` | [app/system/production/InquiryScreens.tsx](<../../../app/system/production/InquiryScreens.tsx>) | 576–583 |
| `InquiryAttachments` | [app/system/production/InquiryScreens.tsx](<../../../app/system/production/InquiryScreens.tsx>) | 585–598 |
| `InquiryActivityTab` | [app/system/production/InquiryScreens.tsx](<../../../app/system/production/InquiryScreens.tsx>) | 600–603 |
| `MeetingDrawer` | [app/system/production/InquiryScreens.tsx](<../../../app/system/production/InquiryScreens.tsx>) | 605–616 |
| `AssignOwnerDrawer` | [app/system/production/InquiryScreens.tsx](<../../../app/system/production/InquiryScreens.tsx>) | 618–625 |
| `QualificationDrawer` | [app/system/production/InquiryScreens.tsx](<../../../app/system/production/InquiryScreens.tsx>) | 627–658 |
| `AttachmentDrawer` | [app/system/production/InquiryScreens.tsx](<../../../app/system/production/InquiryScreens.tsx>) | 660–667 |
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
- [app/system/production/inquiry-intake.css](<../../../app/system/production/inquiry-intake.css>)
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
- [app/system/api-client.ts](<../../../app/system/api-client.ts>)
- [app/system/ui.tsx](<../../../app/system/ui.tsx>)

## Candidate regression tests

- [tests/end-user-ui.test.mjs](<../../../tests/end-user-ui.test.mjs>)
- [tests/inquiry-assignment-notification.test.mjs](<../../../tests/inquiry-assignment-notification.test.mjs>)
- [tests/inquiry-queue.test.mjs](<../../../tests/inquiry-queue.test.mjs>)
- [tests/inquiry-visit-flow.test.mjs](<../../../tests/inquiry-visit-flow.test.mjs>)
- [backend-node/tests/document-lifecycle.test.ts](<../../../backend-node/tests/document-lifecycle.test.ts>)
- [backend-node/tests/end-user.test.ts](<../../../backend-node/tests/end-user.test.ts>)

## Client contract lookup

Search the selected API path or function in [app/system/api-client.ts](<../../../app/system/api-client.ts>); follow its screen callers. Common UI/language changes require [app/system/ui.tsx](<../../../app/system/ui.tsx>) and [app/system/i18n.ts](<../../../app/system/i18n.ts>). For SQL changes use [schema map](../SCHEMA.md).
