# Site Visit / My Assignments

[Context index](../../../AGENTS.md) · [Architecture](../ARCHITECTURE.md) · [Change guide](../WORKFLOW.md)

นัดหมาย มอบหมาย สำรวจ รายงาน และอนุมัติ

Evidence: snapshot `781d8326`; source map, not a live availability claim. Test candidates use filename matching and are not exhaustive coverage.

## Read only the operation you change

- [site-visits-read API and function map](../api/site-visits-read.md) — registered in Node app
- [site-visits-workflow API and function map](../api/site-visits-workflow.md) — registered in Node app
- [site-visit-reports API and function map](../api/site-visit-reports.md) — registered in Node app
- [visit-master API and function map](../api/visit-master.md) — registered in Node app

## UI function locator

Shared screens contain other modules: use the symbol and line range instead of reading the whole file.

| Symbol | Source | Lines |
|---|---|---|
| `toError` | [app/system/production/SiteVisitScreens.tsx](<../../../app/system/production/SiteVisitScreens.tsx>) | 132–132 |
| `formatDate` | [app/system/production/SiteVisitScreens.tsx](<../../../app/system/production/SiteVisitScreens.tsx>) | 133–134 |
| `formatDateTime` | [app/system/production/SiteVisitScreens.tsx](<../../../app/system/production/SiteVisitScreens.tsx>) | 135–136 |
| `formatTime` | [app/system/production/SiteVisitScreens.tsx](<../../../app/system/production/SiteVisitScreens.tsx>) | 137–138 |
| `formatFileSize` | [app/system/production/SiteVisitScreens.tsx](<../../../app/system/production/SiteVisitScreens.tsx>) | 139–140 |
| `initials` | [app/system/production/SiteVisitScreens.tsx](<../../../app/system/production/SiteVisitScreens.tsx>) | 141–141 |
| `businessDate` | [app/system/production/SiteVisitScreens.tsx](<../../../app/system/production/SiteVisitScreens.tsx>) | 142–146 |
| `today` | [app/system/production/SiteVisitScreens.tsx](<../../../app/system/production/SiteVisitScreens.tsx>) | 147–147 |
| `futureDate` | [app/system/production/SiteVisitScreens.tsx](<../../../app/system/production/SiteVisitScreens.tsx>) | 148–148 |
| `toLocalInput` | [app/system/production/SiteVisitScreens.tsx](<../../../app/system/production/SiteVisitScreens.tsx>) | 150–155 |
| `fromLocalInput` | [app/system/production/SiteVisitScreens.tsx](<../../../app/system/production/SiteVisitScreens.tsx>) | 156–156 |
| `priorityTone` | [app/system/production/SiteVisitScreens.tsx](<../../../app/system/production/SiteVisitScreens.tsx>) | 157–158 |
| `readinessTone` | [app/system/production/SiteVisitScreens.tsx](<../../../app/system/production/SiteVisitScreens.tsx>) | 159–160 |
| `slaTone` | [app/system/production/SiteVisitScreens.tsx](<../../../app/system/production/SiteVisitScreens.tsx>) | 161–163 |
| `slaLabel` | [app/system/production/SiteVisitScreens.tsx](<../../../app/system/production/SiteVisitScreens.tsx>) | 164–166 |
| `matchTone` | [app/system/production/SiteVisitScreens.tsx](<../../../app/system/production/SiteVisitScreens.tsx>) | 167–167 |
| `LoadError` | [app/system/production/SiteVisitScreens.tsx](<../../../app/system/production/SiteVisitScreens.tsx>) | 169–176 |
| `Loading` | [app/system/production/SiteVisitScreens.tsx](<../../../app/system/production/SiteVisitScreens.tsx>) | 178–181 |
| `NoPermission` | [app/system/production/SiteVisitScreens.tsx](<../../../app/system/production/SiteVisitScreens.tsx>) | 183–186 |
| `WorkflowTimeline` | [app/system/production/SiteVisitScreens.tsx](<../../../app/system/production/SiteVisitScreens.tsx>) | 189–199 |
| `useMasterData` | [app/system/production/SiteVisitScreens.tsx](<../../../app/system/production/SiteVisitScreens.tsx>) | 221–230 |
| `ProductionSalesIntake` | [app/system/production/SiteVisitScreens.tsx](<../../../app/system/production/SiteVisitScreens.tsx>) | 242–285 |
| `IntakeList` | [app/system/production/SiteVisitScreens.tsx](<../../../app/system/production/SiteVisitScreens.tsx>) | 289–374 |
| `ReviewQueue` | [app/system/production/SiteVisitScreens.tsx](<../../../app/system/production/SiteVisitScreens.tsx>) | 376–429 |
| `SalesDashboard` | [app/system/production/SiteVisitScreens.tsx](<../../../app/system/production/SiteVisitScreens.tsx>) | 431–482 |
| `ReadinessMeter` | [app/system/production/SiteVisitScreens.tsx](<../../../app/system/production/SiteVisitScreens.tsx>) | 508–534 |
| `IntakeEditor` | [app/system/production/SiteVisitScreens.tsx](<../../../app/system/production/SiteVisitScreens.tsx>) | 536–949 |
| `DefinitionList` | [app/system/production/SiteVisitScreens.tsx](<../../../app/system/production/SiteVisitScreens.tsx>) | 955–962 |
| `IntakeDetailScreen` | [app/system/production/SiteVisitScreens.tsx](<../../../app/system/production/SiteVisitScreens.tsx>) | 964–1316 |
| `TechnicalReviewDrawer` | [app/system/production/SiteVisitScreens.tsx](<../../../app/system/production/SiteVisitScreens.tsx>) | 1318–1405 |
| `RequestVisitDrawer` | [app/system/production/SiteVisitScreens.tsx](<../../../app/system/production/SiteVisitScreens.tsx>) | 1407–1481 |
| `ProductionSiteVisits` | [app/system/production/SiteVisitScreens.tsx](<../../../app/system/production/SiteVisitScreens.tsx>) | 1489–1516 |
| `VisitList` | [app/system/production/SiteVisitScreens.tsx](<../../../app/system/production/SiteVisitScreens.tsx>) | 1518–1615 |
| `VisitCalendar` | [app/system/production/SiteVisitScreens.tsx](<../../../app/system/production/SiteVisitScreens.tsx>) | 1623–1753 |
| `EngineeringDashboard` | [app/system/production/SiteVisitScreens.tsx](<../../../app/system/production/SiteVisitScreens.tsx>) | 1755–1857 |
| `SiteVisitDetailScreen` | [app/system/production/SiteVisitScreens.tsx](<../../../app/system/production/SiteVisitScreens.tsx>) | 1865–2147 |
| `AssignmentTab` | [app/system/production/SiteVisitScreens.tsx](<../../../app/system/production/SiteVisitScreens.tsx>) | 2149–2228 |
| `AssignDrawer` | [app/system/production/SiteVisitScreens.tsx](<../../../app/system/production/SiteVisitScreens.tsx>) | 2230–2329 |
| `RespondDrawer` | [app/system/production/SiteVisitScreens.tsx](<../../../app/system/production/SiteVisitScreens.tsx>) | 2331–2381 |
| `ConfirmationDrawer` | [app/system/production/SiteVisitScreens.tsx](<../../../app/system/production/SiteVisitScreens.tsx>) | 2383–2427 |
| `RescheduleDrawer` | [app/system/production/SiteVisitScreens.tsx](<../../../app/system/production/SiteVisitScreens.tsx>) | 2429–2478 |
| `CloseVisitModal` | [app/system/production/SiteVisitScreens.tsx](<../../../app/system/production/SiteVisitScreens.tsx>) | 2480–2514 |
| `CreateInquiryDrawer` | [app/system/production/SiteVisitScreens.tsx](<../../../app/system/production/SiteVisitScreens.tsx>) | 2516–2576 |
| `PreVisitBrief` | [app/system/production/SiteVisitScreens.tsx](<../../../app/system/production/SiteVisitScreens.tsx>) | 2578–2688 |
| `ExecutionTab` | [app/system/production/SiteVisitScreens.tsx](<../../../app/system/production/SiteVisitScreens.tsx>) | 2698–2960 |
| `FindingDrawer` | [app/system/production/SiteVisitScreens.tsx](<../../../app/system/production/SiteVisitScreens.tsx>) | 2962–3009 |
| `CheckInModal` | [app/system/production/SiteVisitScreens.tsx](<../../../app/system/production/SiteVisitScreens.tsx>) | 3011–3061 |
| `CheckOutModal` | [app/system/production/SiteVisitScreens.tsx](<../../../app/system/production/SiteVisitScreens.tsx>) | 3063–3098 |
| `ReportTab` | [app/system/production/SiteVisitScreens.tsx](<../../../app/system/production/SiteVisitScreens.tsx>) | 3123–3280 |
| `ReviewReportModal` | [app/system/production/SiteVisitScreens.tsx](<../../../app/system/production/SiteVisitScreens.tsx>) | 3282–3325 |
| `AcknowledgeModal` | [app/system/production/SiteVisitScreens.tsx](<../../../app/system/production/SiteVisitScreens.tsx>) | 3327–3360 |
| `ActionItemDrawer` | [app/system/production/SiteVisitScreens.tsx](<../../../app/system/production/SiteVisitScreens.tsx>) | 3362–3410 |
| `ProductionMyAssignments` | [app/system/production/SiteVisitScreens.tsx](<../../../app/system/production/SiteVisitScreens.tsx>) | 3416–3537 |
| `MyResponseModal` | [app/system/production/SiteVisitScreens.tsx](<../../../app/system/production/SiteVisitScreens.tsx>) | 3539–3576 |
| `ProductionVisitMasterData` | [app/system/production/SiteVisitScreens.tsx](<../../../app/system/production/SiteVisitScreens.tsx>) | 3582–3618 |
| `VisitTypeAdmin` | [app/system/production/SiteVisitScreens.tsx](<../../../app/system/production/SiteVisitScreens.tsx>) | 3624–3663 |
| `VisitTypeDrawer` | [app/system/production/SiteVisitScreens.tsx](<../../../app/system/production/SiteVisitScreens.tsx>) | 3665–3712 |
| `SkillAdmin` | [app/system/production/SiteVisitScreens.tsx](<../../../app/system/production/SiteVisitScreens.tsx>) | 3714–3781 |
| `ChecklistAdmin` | [app/system/production/SiteVisitScreens.tsx](<../../../app/system/production/SiteVisitScreens.tsx>) | 3783–3859 |
| `SlaAdmin` | [app/system/production/SiteVisitScreens.tsx](<../../../app/system/production/SiteVisitScreens.tsx>) | 3861–3905 |
| `EngineerSkillAdmin` | [app/system/production/SiteVisitScreens.tsx](<../../../app/system/production/SiteVisitScreens.tsx>) | 3907–3961 |
| `AvailabilityAdmin` | [app/system/production/SiteVisitScreens.tsx](<../../../app/system/production/SiteVisitScreens.tsx>) | 3963–4015 |

## Domain helpers / direct dependencies

- [backend-node/src/site-visit-common.ts](<../../../backend-node/src/site-visit-common.ts>)
- [backend-node/src/site-visit-data.ts](<../../../backend-node/src/site-visit-data.ts>)
- [backend-node/src/routes/sales-intakes.ts](<../../../backend-node/src/routes/sales-intakes.ts>)
- [backend-node/src/document-storage.ts](<../../../backend-node/src/document-storage.ts>)
- [backend-node/src/document-number.ts](<../../../backend-node/src/document-number.ts>)
- [backend-node/src/site-visit-operations.ts](<../../../backend-node/src/site-visit-operations.ts>)
- [backend-node/src/estimate-total-guard.ts](<../../../backend-node/src/estimate-total-guard.ts>)
- [app/system/screen-link.ts](<../../../app/system/screen-link.ts>)
- [app/system/i18n.ts](<../../../app/system/i18n.ts>)
- [app/system/LocalizedText.tsx](<../../../app/system/LocalizedText.tsx>)
- [app/system/api-client.ts](<../../../app/system/api-client.ts>)
- [app/system/ui.tsx](<../../../app/system/ui.tsx>)
- [lib/inquiry-visit-flow.ts](<../../../lib/inquiry-visit-flow.ts>)
- [lib/site-visit-workspace.ts](<../../../lib/site-visit-workspace.ts>)
- [app/system/production/site-visit-workspace.css](<../../../app/system/production/site-visit-workspace.css>)
- [app/system/DateInput.tsx](<../../../app/system/DateInput.tsx>)

## Candidate regression tests

- [tests/inquiry-visit-flow.test.mjs](<../../../tests/inquiry-visit-flow.test.mjs>)
- [tests/site-visit-guardrails.test.mjs](<../../../tests/site-visit-guardrails.test.mjs>)
- [tests/site-visit-workspace.test.mjs](<../../../tests/site-visit-workspace.test.mjs>)
- [backend-node/tests/site-visit.test.ts](<../../../backend-node/tests/site-visit.test.ts>)

## Client contract lookup

Search the selected API path or function in [app/system/api-client.ts](<../../../app/system/api-client.ts>); follow its screen callers. Common UI/language changes require [app/system/ui.tsx](<../../../app/system/ui.tsx>) and [app/system/i18n.ts](<../../../app/system/i18n.ts>). For SQL changes use [schema map](../SCHEMA.md).
