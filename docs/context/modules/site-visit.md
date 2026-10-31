# Site Visit / My Assignments

[Context index](../../../AGENTS.md) · [Architecture](../ARCHITECTURE.md) · [Change guide](../WORKFLOW.md)

นัดหมาย มอบหมาย สำรวจ รายงาน และอนุมัติ

Evidence: snapshot `4a0666d4`; source map, not a live availability claim. Test candidates use filename matching and are not exhaustive coverage.

## Read only the operation you change

- [site-visits-read API and function map](../api/site-visits-read.md) — registered in Node app
- [site-visits-workflow API and function map](../api/site-visits-workflow.md) — registered in Node app
- [site-visit-reports API and function map](../api/site-visit-reports.md) — registered in Node app
- [visit-master API and function map](../api/visit-master.md) — registered in Node app

## UI function locator

Shared screens contain other modules: use the symbol and line range instead of reading the whole file.

| Symbol | Source | Lines |
|---|---|---|
| `toError` | [app/system/production/SiteVisitScreens.tsx](<../../../app/system/production/SiteVisitScreens.tsx>) | 131–131 |
| `formatDate` | [app/system/production/SiteVisitScreens.tsx](<../../../app/system/production/SiteVisitScreens.tsx>) | 132–133 |
| `formatDateTime` | [app/system/production/SiteVisitScreens.tsx](<../../../app/system/production/SiteVisitScreens.tsx>) | 134–135 |
| `formatTime` | [app/system/production/SiteVisitScreens.tsx](<../../../app/system/production/SiteVisitScreens.tsx>) | 136–137 |
| `formatFileSize` | [app/system/production/SiteVisitScreens.tsx](<../../../app/system/production/SiteVisitScreens.tsx>) | 138–139 |
| `initials` | [app/system/production/SiteVisitScreens.tsx](<../../../app/system/production/SiteVisitScreens.tsx>) | 140–140 |
| `businessDate` | [app/system/production/SiteVisitScreens.tsx](<../../../app/system/production/SiteVisitScreens.tsx>) | 141–145 |
| `today` | [app/system/production/SiteVisitScreens.tsx](<../../../app/system/production/SiteVisitScreens.tsx>) | 146–146 |
| `futureDate` | [app/system/production/SiteVisitScreens.tsx](<../../../app/system/production/SiteVisitScreens.tsx>) | 147–147 |
| `toLocalInput` | [app/system/production/SiteVisitScreens.tsx](<../../../app/system/production/SiteVisitScreens.tsx>) | 149–154 |
| `fromLocalInput` | [app/system/production/SiteVisitScreens.tsx](<../../../app/system/production/SiteVisitScreens.tsx>) | 155–155 |
| `priorityTone` | [app/system/production/SiteVisitScreens.tsx](<../../../app/system/production/SiteVisitScreens.tsx>) | 156–157 |
| `readinessTone` | [app/system/production/SiteVisitScreens.tsx](<../../../app/system/production/SiteVisitScreens.tsx>) | 158–159 |
| `slaTone` | [app/system/production/SiteVisitScreens.tsx](<../../../app/system/production/SiteVisitScreens.tsx>) | 160–162 |
| `slaLabel` | [app/system/production/SiteVisitScreens.tsx](<../../../app/system/production/SiteVisitScreens.tsx>) | 163–165 |
| `matchTone` | [app/system/production/SiteVisitScreens.tsx](<../../../app/system/production/SiteVisitScreens.tsx>) | 166–166 |
| `LoadError` | [app/system/production/SiteVisitScreens.tsx](<../../../app/system/production/SiteVisitScreens.tsx>) | 168–175 |
| `Loading` | [app/system/production/SiteVisitScreens.tsx](<../../../app/system/production/SiteVisitScreens.tsx>) | 177–180 |
| `NoPermission` | [app/system/production/SiteVisitScreens.tsx](<../../../app/system/production/SiteVisitScreens.tsx>) | 182–185 |
| `WorkflowTimeline` | [app/system/production/SiteVisitScreens.tsx](<../../../app/system/production/SiteVisitScreens.tsx>) | 188–198 |
| `useMasterData` | [app/system/production/SiteVisitScreens.tsx](<../../../app/system/production/SiteVisitScreens.tsx>) | 220–229 |
| `ProductionSalesIntake` | [app/system/production/SiteVisitScreens.tsx](<../../../app/system/production/SiteVisitScreens.tsx>) | 241–284 |
| `IntakeList` | [app/system/production/SiteVisitScreens.tsx](<../../../app/system/production/SiteVisitScreens.tsx>) | 288–373 |
| `ReviewQueue` | [app/system/production/SiteVisitScreens.tsx](<../../../app/system/production/SiteVisitScreens.tsx>) | 375–428 |
| `SalesDashboard` | [app/system/production/SiteVisitScreens.tsx](<../../../app/system/production/SiteVisitScreens.tsx>) | 430–481 |
| `ReadinessMeter` | [app/system/production/SiteVisitScreens.tsx](<../../../app/system/production/SiteVisitScreens.tsx>) | 507–533 |
| `IntakeEditor` | [app/system/production/SiteVisitScreens.tsx](<../../../app/system/production/SiteVisitScreens.tsx>) | 535–948 |
| `DefinitionList` | [app/system/production/SiteVisitScreens.tsx](<../../../app/system/production/SiteVisitScreens.tsx>) | 954–961 |
| `IntakeDetailScreen` | [app/system/production/SiteVisitScreens.tsx](<../../../app/system/production/SiteVisitScreens.tsx>) | 963–1315 |
| `TechnicalReviewDrawer` | [app/system/production/SiteVisitScreens.tsx](<../../../app/system/production/SiteVisitScreens.tsx>) | 1317–1404 |
| `RequestVisitDrawer` | [app/system/production/SiteVisitScreens.tsx](<../../../app/system/production/SiteVisitScreens.tsx>) | 1406–1480 |
| `ProductionSiteVisits` | [app/system/production/SiteVisitScreens.tsx](<../../../app/system/production/SiteVisitScreens.tsx>) | 1488–1515 |
| `VisitList` | [app/system/production/SiteVisitScreens.tsx](<../../../app/system/production/SiteVisitScreens.tsx>) | 1517–1614 |
| `VisitCalendar` | [app/system/production/SiteVisitScreens.tsx](<../../../app/system/production/SiteVisitScreens.tsx>) | 1622–1752 |
| `EngineeringDashboard` | [app/system/production/SiteVisitScreens.tsx](<../../../app/system/production/SiteVisitScreens.tsx>) | 1754–1856 |
| `SiteVisitDetailScreen` | [app/system/production/SiteVisitScreens.tsx](<../../../app/system/production/SiteVisitScreens.tsx>) | 1864–2146 |
| `AssignmentTab` | [app/system/production/SiteVisitScreens.tsx](<../../../app/system/production/SiteVisitScreens.tsx>) | 2148–2227 |
| `AssignDrawer` | [app/system/production/SiteVisitScreens.tsx](<../../../app/system/production/SiteVisitScreens.tsx>) | 2229–2328 |
| `RespondDrawer` | [app/system/production/SiteVisitScreens.tsx](<../../../app/system/production/SiteVisitScreens.tsx>) | 2330–2380 |
| `ConfirmationDrawer` | [app/system/production/SiteVisitScreens.tsx](<../../../app/system/production/SiteVisitScreens.tsx>) | 2382–2426 |
| `RescheduleDrawer` | [app/system/production/SiteVisitScreens.tsx](<../../../app/system/production/SiteVisitScreens.tsx>) | 2428–2477 |
| `CloseVisitModal` | [app/system/production/SiteVisitScreens.tsx](<../../../app/system/production/SiteVisitScreens.tsx>) | 2479–2513 |
| `CreateInquiryDrawer` | [app/system/production/SiteVisitScreens.tsx](<../../../app/system/production/SiteVisitScreens.tsx>) | 2515–2575 |
| `PreVisitBrief` | [app/system/production/SiteVisitScreens.tsx](<../../../app/system/production/SiteVisitScreens.tsx>) | 2577–2687 |
| `ExecutionTab` | [app/system/production/SiteVisitScreens.tsx](<../../../app/system/production/SiteVisitScreens.tsx>) | 2697–2959 |
| `FindingDrawer` | [app/system/production/SiteVisitScreens.tsx](<../../../app/system/production/SiteVisitScreens.tsx>) | 2961–3008 |
| `CheckInModal` | [app/system/production/SiteVisitScreens.tsx](<../../../app/system/production/SiteVisitScreens.tsx>) | 3010–3060 |
| `CheckOutModal` | [app/system/production/SiteVisitScreens.tsx](<../../../app/system/production/SiteVisitScreens.tsx>) | 3062–3097 |
| `ReportTab` | [app/system/production/SiteVisitScreens.tsx](<../../../app/system/production/SiteVisitScreens.tsx>) | 3122–3278 |
| `ReviewReportModal` | [app/system/production/SiteVisitScreens.tsx](<../../../app/system/production/SiteVisitScreens.tsx>) | 3280–3323 |
| `AcknowledgeModal` | [app/system/production/SiteVisitScreens.tsx](<../../../app/system/production/SiteVisitScreens.tsx>) | 3325–3358 |
| `ActionItemDrawer` | [app/system/production/SiteVisitScreens.tsx](<../../../app/system/production/SiteVisitScreens.tsx>) | 3360–3408 |
| `ProductionMyAssignments` | [app/system/production/SiteVisitScreens.tsx](<../../../app/system/production/SiteVisitScreens.tsx>) | 3414–3535 |
| `MyResponseModal` | [app/system/production/SiteVisitScreens.tsx](<../../../app/system/production/SiteVisitScreens.tsx>) | 3537–3574 |
| `ProductionVisitMasterData` | [app/system/production/SiteVisitScreens.tsx](<../../../app/system/production/SiteVisitScreens.tsx>) | 3580–3616 |
| `VisitTypeAdmin` | [app/system/production/SiteVisitScreens.tsx](<../../../app/system/production/SiteVisitScreens.tsx>) | 3622–3661 |
| `VisitTypeDrawer` | [app/system/production/SiteVisitScreens.tsx](<../../../app/system/production/SiteVisitScreens.tsx>) | 3663–3710 |
| `SkillAdmin` | [app/system/production/SiteVisitScreens.tsx](<../../../app/system/production/SiteVisitScreens.tsx>) | 3712–3779 |
| `ChecklistAdmin` | [app/system/production/SiteVisitScreens.tsx](<../../../app/system/production/SiteVisitScreens.tsx>) | 3781–3857 |
| `SlaAdmin` | [app/system/production/SiteVisitScreens.tsx](<../../../app/system/production/SiteVisitScreens.tsx>) | 3859–3903 |
| `EngineerSkillAdmin` | [app/system/production/SiteVisitScreens.tsx](<../../../app/system/production/SiteVisitScreens.tsx>) | 3905–3959 |
| `AvailabilityAdmin` | [app/system/production/SiteVisitScreens.tsx](<../../../app/system/production/SiteVisitScreens.tsx>) | 3961–4013 |

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

## Candidate regression tests

- [tests/inquiry-visit-flow.test.mjs](<../../../tests/inquiry-visit-flow.test.mjs>)
- [tests/site-visit-guardrails.test.mjs](<../../../tests/site-visit-guardrails.test.mjs>)
- [tests/site-visit-workspace.test.mjs](<../../../tests/site-visit-workspace.test.mjs>)
- [backend-node/tests/site-visit.test.ts](<../../../backend-node/tests/site-visit.test.ts>)

## Client contract lookup

Search the selected API path or function in [app/system/api-client.ts](<../../../app/system/api-client.ts>); follow its screen callers. Common UI/language changes require [app/system/ui.tsx](<../../../app/system/ui.tsx>) and [app/system/i18n.ts](<../../../app/system/i18n.ts>). For SQL changes use [schema map](../SCHEMA.md).
