# Site Visit / My Assignments

[Context index](../../../AGENTS.md) · [Architecture](../ARCHITECTURE.md) · [Change guide](../WORKFLOW.md)

นัดหมาย มอบหมาย สำรวจ รายงาน และอนุมัติ

Evidence: snapshot `2f478694`; source map, not a live availability claim. Test candidates use filename matching and are not exhaustive coverage.

## Read only the operation you change

- [site-visits-read API and function map](../api/site-visits-read.md) — registered in Node app
- [site-visits-workflow API and function map](../api/site-visits-workflow.md) — registered in Node app
- [site-visit-reports API and function map](../api/site-visit-reports.md) — registered in Node app
- [visit-master API and function map](../api/visit-master.md) — registered in Node app

## UI function locator

Shared screens contain other modules: use the symbol and line range instead of reading the whole file.

| Symbol | Source | Lines |
|---|---|---|
| `toError` | [app/system/production/SiteVisitScreens.tsx](<../../../app/system/production/SiteVisitScreens.tsx>) | 130–130 |
| `formatDate` | [app/system/production/SiteVisitScreens.tsx](<../../../app/system/production/SiteVisitScreens.tsx>) | 131–132 |
| `formatDateTime` | [app/system/production/SiteVisitScreens.tsx](<../../../app/system/production/SiteVisitScreens.tsx>) | 133–134 |
| `formatTime` | [app/system/production/SiteVisitScreens.tsx](<../../../app/system/production/SiteVisitScreens.tsx>) | 135–136 |
| `formatFileSize` | [app/system/production/SiteVisitScreens.tsx](<../../../app/system/production/SiteVisitScreens.tsx>) | 137–138 |
| `initials` | [app/system/production/SiteVisitScreens.tsx](<../../../app/system/production/SiteVisitScreens.tsx>) | 139–139 |
| `businessDate` | [app/system/production/SiteVisitScreens.tsx](<../../../app/system/production/SiteVisitScreens.tsx>) | 140–144 |
| `today` | [app/system/production/SiteVisitScreens.tsx](<../../../app/system/production/SiteVisitScreens.tsx>) | 145–145 |
| `futureDate` | [app/system/production/SiteVisitScreens.tsx](<../../../app/system/production/SiteVisitScreens.tsx>) | 146–146 |
| `toLocalInput` | [app/system/production/SiteVisitScreens.tsx](<../../../app/system/production/SiteVisitScreens.tsx>) | 148–153 |
| `fromLocalInput` | [app/system/production/SiteVisitScreens.tsx](<../../../app/system/production/SiteVisitScreens.tsx>) | 154–154 |
| `priorityTone` | [app/system/production/SiteVisitScreens.tsx](<../../../app/system/production/SiteVisitScreens.tsx>) | 155–156 |
| `readinessTone` | [app/system/production/SiteVisitScreens.tsx](<../../../app/system/production/SiteVisitScreens.tsx>) | 157–158 |
| `slaTone` | [app/system/production/SiteVisitScreens.tsx](<../../../app/system/production/SiteVisitScreens.tsx>) | 159–161 |
| `slaLabel` | [app/system/production/SiteVisitScreens.tsx](<../../../app/system/production/SiteVisitScreens.tsx>) | 162–164 |
| `matchTone` | [app/system/production/SiteVisitScreens.tsx](<../../../app/system/production/SiteVisitScreens.tsx>) | 165–165 |
| `LoadError` | [app/system/production/SiteVisitScreens.tsx](<../../../app/system/production/SiteVisitScreens.tsx>) | 167–174 |
| `Loading` | [app/system/production/SiteVisitScreens.tsx](<../../../app/system/production/SiteVisitScreens.tsx>) | 176–179 |
| `NoPermission` | [app/system/production/SiteVisitScreens.tsx](<../../../app/system/production/SiteVisitScreens.tsx>) | 181–184 |
| `WorkflowTimeline` | [app/system/production/SiteVisitScreens.tsx](<../../../app/system/production/SiteVisitScreens.tsx>) | 187–197 |
| `useMasterData` | [app/system/production/SiteVisitScreens.tsx](<../../../app/system/production/SiteVisitScreens.tsx>) | 219–228 |
| `ProductionSalesIntake` | [app/system/production/SiteVisitScreens.tsx](<../../../app/system/production/SiteVisitScreens.tsx>) | 240–283 |
| `IntakeList` | [app/system/production/SiteVisitScreens.tsx](<../../../app/system/production/SiteVisitScreens.tsx>) | 287–372 |
| `ReviewQueue` | [app/system/production/SiteVisitScreens.tsx](<../../../app/system/production/SiteVisitScreens.tsx>) | 374–427 |
| `SalesDashboard` | [app/system/production/SiteVisitScreens.tsx](<../../../app/system/production/SiteVisitScreens.tsx>) | 429–480 |
| `ReadinessMeter` | [app/system/production/SiteVisitScreens.tsx](<../../../app/system/production/SiteVisitScreens.tsx>) | 506–532 |
| `IntakeEditor` | [app/system/production/SiteVisitScreens.tsx](<../../../app/system/production/SiteVisitScreens.tsx>) | 534–947 |
| `DefinitionList` | [app/system/production/SiteVisitScreens.tsx](<../../../app/system/production/SiteVisitScreens.tsx>) | 953–960 |
| `IntakeDetailScreen` | [app/system/production/SiteVisitScreens.tsx](<../../../app/system/production/SiteVisitScreens.tsx>) | 962–1314 |
| `TechnicalReviewDrawer` | [app/system/production/SiteVisitScreens.tsx](<../../../app/system/production/SiteVisitScreens.tsx>) | 1316–1403 |
| `RequestVisitDrawer` | [app/system/production/SiteVisitScreens.tsx](<../../../app/system/production/SiteVisitScreens.tsx>) | 1405–1479 |
| `ProductionSiteVisits` | [app/system/production/SiteVisitScreens.tsx](<../../../app/system/production/SiteVisitScreens.tsx>) | 1487–1514 |
| `VisitList` | [app/system/production/SiteVisitScreens.tsx](<../../../app/system/production/SiteVisitScreens.tsx>) | 1516–1613 |
| `VisitCalendar` | [app/system/production/SiteVisitScreens.tsx](<../../../app/system/production/SiteVisitScreens.tsx>) | 1621–1751 |
| `EngineeringDashboard` | [app/system/production/SiteVisitScreens.tsx](<../../../app/system/production/SiteVisitScreens.tsx>) | 1753–1855 |
| `SiteVisitDetailScreen` | [app/system/production/SiteVisitScreens.tsx](<../../../app/system/production/SiteVisitScreens.tsx>) | 1863–2145 |
| `AssignmentTab` | [app/system/production/SiteVisitScreens.tsx](<../../../app/system/production/SiteVisitScreens.tsx>) | 2147–2226 |
| `AssignDrawer` | [app/system/production/SiteVisitScreens.tsx](<../../../app/system/production/SiteVisitScreens.tsx>) | 2228–2327 |
| `RespondDrawer` | [app/system/production/SiteVisitScreens.tsx](<../../../app/system/production/SiteVisitScreens.tsx>) | 2329–2379 |
| `ConfirmationDrawer` | [app/system/production/SiteVisitScreens.tsx](<../../../app/system/production/SiteVisitScreens.tsx>) | 2381–2425 |
| `RescheduleDrawer` | [app/system/production/SiteVisitScreens.tsx](<../../../app/system/production/SiteVisitScreens.tsx>) | 2427–2476 |
| `CloseVisitModal` | [app/system/production/SiteVisitScreens.tsx](<../../../app/system/production/SiteVisitScreens.tsx>) | 2478–2512 |
| `CreateInquiryDrawer` | [app/system/production/SiteVisitScreens.tsx](<../../../app/system/production/SiteVisitScreens.tsx>) | 2514–2574 |
| `PreVisitBrief` | [app/system/production/SiteVisitScreens.tsx](<../../../app/system/production/SiteVisitScreens.tsx>) | 2576–2686 |
| `ExecutionTab` | [app/system/production/SiteVisitScreens.tsx](<../../../app/system/production/SiteVisitScreens.tsx>) | 2696–2958 |
| `FindingDrawer` | [app/system/production/SiteVisitScreens.tsx](<../../../app/system/production/SiteVisitScreens.tsx>) | 2960–3007 |
| `CheckInModal` | [app/system/production/SiteVisitScreens.tsx](<../../../app/system/production/SiteVisitScreens.tsx>) | 3009–3059 |
| `CheckOutModal` | [app/system/production/SiteVisitScreens.tsx](<../../../app/system/production/SiteVisitScreens.tsx>) | 3061–3096 |
| `ReportTab` | [app/system/production/SiteVisitScreens.tsx](<../../../app/system/production/SiteVisitScreens.tsx>) | 3121–3277 |
| `ReviewReportModal` | [app/system/production/SiteVisitScreens.tsx](<../../../app/system/production/SiteVisitScreens.tsx>) | 3279–3322 |
| `AcknowledgeModal` | [app/system/production/SiteVisitScreens.tsx](<../../../app/system/production/SiteVisitScreens.tsx>) | 3324–3357 |
| `ActionItemDrawer` | [app/system/production/SiteVisitScreens.tsx](<../../../app/system/production/SiteVisitScreens.tsx>) | 3359–3407 |
| `ProductionMyAssignments` | [app/system/production/SiteVisitScreens.tsx](<../../../app/system/production/SiteVisitScreens.tsx>) | 3413–3531 |
| `MyResponseModal` | [app/system/production/SiteVisitScreens.tsx](<../../../app/system/production/SiteVisitScreens.tsx>) | 3533–3570 |
| `ProductionVisitMasterData` | [app/system/production/SiteVisitScreens.tsx](<../../../app/system/production/SiteVisitScreens.tsx>) | 3576–3612 |
| `VisitTypeAdmin` | [app/system/production/SiteVisitScreens.tsx](<../../../app/system/production/SiteVisitScreens.tsx>) | 3618–3657 |
| `VisitTypeDrawer` | [app/system/production/SiteVisitScreens.tsx](<../../../app/system/production/SiteVisitScreens.tsx>) | 3659–3706 |
| `SkillAdmin` | [app/system/production/SiteVisitScreens.tsx](<../../../app/system/production/SiteVisitScreens.tsx>) | 3708–3775 |
| `ChecklistAdmin` | [app/system/production/SiteVisitScreens.tsx](<../../../app/system/production/SiteVisitScreens.tsx>) | 3777–3853 |
| `SlaAdmin` | [app/system/production/SiteVisitScreens.tsx](<../../../app/system/production/SiteVisitScreens.tsx>) | 3855–3899 |
| `EngineerSkillAdmin` | [app/system/production/SiteVisitScreens.tsx](<../../../app/system/production/SiteVisitScreens.tsx>) | 3901–3955 |
| `AvailabilityAdmin` | [app/system/production/SiteVisitScreens.tsx](<../../../app/system/production/SiteVisitScreens.tsx>) | 3957–4009 |

## Domain helpers / direct dependencies

- [backend-node/src/site-visit-common.ts](<../../../backend-node/src/site-visit-common.ts>)
- [backend-node/src/site-visit-data.ts](<../../../backend-node/src/site-visit-data.ts>)
- [backend-node/src/routes/sales-intakes.ts](<../../../backend-node/src/routes/sales-intakes.ts>)
- [backend-node/src/document-storage.ts](<../../../backend-node/src/document-storage.ts>)
- [backend-node/src/document-number.ts](<../../../backend-node/src/document-number.ts>)
- [backend-node/src/site-visit-operations.ts](<../../../backend-node/src/site-visit-operations.ts>)
- [backend-node/src/estimate-total-guard.ts](<../../../backend-node/src/estimate-total-guard.ts>)
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
