# Site Visit / My Assignments

[Context index](../../../AGENTS.md) · [Architecture](../ARCHITECTURE.md) · [Change guide](../WORKFLOW.md)

นัดหมาย มอบหมาย สำรวจ รายงาน และอนุมัติ

Evidence: snapshot `9ed694e3`; source map, not a live availability claim. Test candidates use filename matching and are not exhaustive coverage.

## Read only the operation you change

- [site-visits-read API and function map](../api/site-visits-read.md) — registered in Node app
- [site-visits-workflow API and function map](../api/site-visits-workflow.md) — registered in Node app
- [site-visit-reports API and function map](../api/site-visit-reports.md) — registered in Node app
- [visit-master API and function map](../api/visit-master.md) — registered in Node app

## UI function locator

Shared screens contain other modules: use the symbol and line range instead of reading the whole file.

| Symbol | Source | Lines |
|---|---|---|
| `toError` | [app/system/production/SiteVisitScreens.tsx](<../../../app/system/production/SiteVisitScreens.tsx>) | 129–129 |
| `formatDate` | [app/system/production/SiteVisitScreens.tsx](<../../../app/system/production/SiteVisitScreens.tsx>) | 130–131 |
| `formatDateTime` | [app/system/production/SiteVisitScreens.tsx](<../../../app/system/production/SiteVisitScreens.tsx>) | 132–133 |
| `formatTime` | [app/system/production/SiteVisitScreens.tsx](<../../../app/system/production/SiteVisitScreens.tsx>) | 134–135 |
| `formatFileSize` | [app/system/production/SiteVisitScreens.tsx](<../../../app/system/production/SiteVisitScreens.tsx>) | 136–137 |
| `initials` | [app/system/production/SiteVisitScreens.tsx](<../../../app/system/production/SiteVisitScreens.tsx>) | 138–138 |
| `businessDate` | [app/system/production/SiteVisitScreens.tsx](<../../../app/system/production/SiteVisitScreens.tsx>) | 139–143 |
| `today` | [app/system/production/SiteVisitScreens.tsx](<../../../app/system/production/SiteVisitScreens.tsx>) | 144–144 |
| `futureDate` | [app/system/production/SiteVisitScreens.tsx](<../../../app/system/production/SiteVisitScreens.tsx>) | 145–145 |
| `toLocalInput` | [app/system/production/SiteVisitScreens.tsx](<../../../app/system/production/SiteVisitScreens.tsx>) | 147–152 |
| `fromLocalInput` | [app/system/production/SiteVisitScreens.tsx](<../../../app/system/production/SiteVisitScreens.tsx>) | 153–153 |
| `priorityTone` | [app/system/production/SiteVisitScreens.tsx](<../../../app/system/production/SiteVisitScreens.tsx>) | 154–155 |
| `readinessTone` | [app/system/production/SiteVisitScreens.tsx](<../../../app/system/production/SiteVisitScreens.tsx>) | 156–157 |
| `slaTone` | [app/system/production/SiteVisitScreens.tsx](<../../../app/system/production/SiteVisitScreens.tsx>) | 158–160 |
| `slaLabel` | [app/system/production/SiteVisitScreens.tsx](<../../../app/system/production/SiteVisitScreens.tsx>) | 161–163 |
| `matchTone` | [app/system/production/SiteVisitScreens.tsx](<../../../app/system/production/SiteVisitScreens.tsx>) | 164–164 |
| `LoadError` | [app/system/production/SiteVisitScreens.tsx](<../../../app/system/production/SiteVisitScreens.tsx>) | 166–173 |
| `Loading` | [app/system/production/SiteVisitScreens.tsx](<../../../app/system/production/SiteVisitScreens.tsx>) | 175–178 |
| `NoPermission` | [app/system/production/SiteVisitScreens.tsx](<../../../app/system/production/SiteVisitScreens.tsx>) | 180–183 |
| `WorkflowTimeline` | [app/system/production/SiteVisitScreens.tsx](<../../../app/system/production/SiteVisitScreens.tsx>) | 186–196 |
| `useMasterData` | [app/system/production/SiteVisitScreens.tsx](<../../../app/system/production/SiteVisitScreens.tsx>) | 218–227 |
| `ProductionSalesIntake` | [app/system/production/SiteVisitScreens.tsx](<../../../app/system/production/SiteVisitScreens.tsx>) | 239–282 |
| `IntakeList` | [app/system/production/SiteVisitScreens.tsx](<../../../app/system/production/SiteVisitScreens.tsx>) | 286–371 |
| `ReviewQueue` | [app/system/production/SiteVisitScreens.tsx](<../../../app/system/production/SiteVisitScreens.tsx>) | 373–426 |
| `SalesDashboard` | [app/system/production/SiteVisitScreens.tsx](<../../../app/system/production/SiteVisitScreens.tsx>) | 428–479 |
| `ReadinessMeter` | [app/system/production/SiteVisitScreens.tsx](<../../../app/system/production/SiteVisitScreens.tsx>) | 505–531 |
| `IntakeEditor` | [app/system/production/SiteVisitScreens.tsx](<../../../app/system/production/SiteVisitScreens.tsx>) | 533–946 |
| `DefinitionList` | [app/system/production/SiteVisitScreens.tsx](<../../../app/system/production/SiteVisitScreens.tsx>) | 952–959 |
| `IntakeDetailScreen` | [app/system/production/SiteVisitScreens.tsx](<../../../app/system/production/SiteVisitScreens.tsx>) | 961–1313 |
| `TechnicalReviewDrawer` | [app/system/production/SiteVisitScreens.tsx](<../../../app/system/production/SiteVisitScreens.tsx>) | 1315–1402 |
| `RequestVisitDrawer` | [app/system/production/SiteVisitScreens.tsx](<../../../app/system/production/SiteVisitScreens.tsx>) | 1404–1478 |
| `ProductionSiteVisits` | [app/system/production/SiteVisitScreens.tsx](<../../../app/system/production/SiteVisitScreens.tsx>) | 1486–1513 |
| `VisitList` | [app/system/production/SiteVisitScreens.tsx](<../../../app/system/production/SiteVisitScreens.tsx>) | 1515–1612 |
| `VisitCalendar` | [app/system/production/SiteVisitScreens.tsx](<../../../app/system/production/SiteVisitScreens.tsx>) | 1620–1750 |
| `EngineeringDashboard` | [app/system/production/SiteVisitScreens.tsx](<../../../app/system/production/SiteVisitScreens.tsx>) | 1752–1854 |
| `SiteVisitDetailScreen` | [app/system/production/SiteVisitScreens.tsx](<../../../app/system/production/SiteVisitScreens.tsx>) | 1862–2144 |
| `AssignmentTab` | [app/system/production/SiteVisitScreens.tsx](<../../../app/system/production/SiteVisitScreens.tsx>) | 2146–2225 |
| `AssignDrawer` | [app/system/production/SiteVisitScreens.tsx](<../../../app/system/production/SiteVisitScreens.tsx>) | 2227–2326 |
| `RespondDrawer` | [app/system/production/SiteVisitScreens.tsx](<../../../app/system/production/SiteVisitScreens.tsx>) | 2328–2378 |
| `ConfirmationDrawer` | [app/system/production/SiteVisitScreens.tsx](<../../../app/system/production/SiteVisitScreens.tsx>) | 2380–2424 |
| `RescheduleDrawer` | [app/system/production/SiteVisitScreens.tsx](<../../../app/system/production/SiteVisitScreens.tsx>) | 2426–2475 |
| `CloseVisitModal` | [app/system/production/SiteVisitScreens.tsx](<../../../app/system/production/SiteVisitScreens.tsx>) | 2477–2511 |
| `CreateInquiryDrawer` | [app/system/production/SiteVisitScreens.tsx](<../../../app/system/production/SiteVisitScreens.tsx>) | 2513–2573 |
| `PreVisitBrief` | [app/system/production/SiteVisitScreens.tsx](<../../../app/system/production/SiteVisitScreens.tsx>) | 2575–2685 |
| `ExecutionTab` | [app/system/production/SiteVisitScreens.tsx](<../../../app/system/production/SiteVisitScreens.tsx>) | 2695–2957 |
| `FindingDrawer` | [app/system/production/SiteVisitScreens.tsx](<../../../app/system/production/SiteVisitScreens.tsx>) | 2959–3006 |
| `CheckInModal` | [app/system/production/SiteVisitScreens.tsx](<../../../app/system/production/SiteVisitScreens.tsx>) | 3008–3058 |
| `CheckOutModal` | [app/system/production/SiteVisitScreens.tsx](<../../../app/system/production/SiteVisitScreens.tsx>) | 3060–3095 |
| `ReportTab` | [app/system/production/SiteVisitScreens.tsx](<../../../app/system/production/SiteVisitScreens.tsx>) | 3120–3276 |
| `ReviewReportModal` | [app/system/production/SiteVisitScreens.tsx](<../../../app/system/production/SiteVisitScreens.tsx>) | 3278–3321 |
| `AcknowledgeModal` | [app/system/production/SiteVisitScreens.tsx](<../../../app/system/production/SiteVisitScreens.tsx>) | 3323–3356 |
| `ActionItemDrawer` | [app/system/production/SiteVisitScreens.tsx](<../../../app/system/production/SiteVisitScreens.tsx>) | 3358–3406 |
| `ProductionMyAssignments` | [app/system/production/SiteVisitScreens.tsx](<../../../app/system/production/SiteVisitScreens.tsx>) | 3412–3530 |
| `MyResponseModal` | [app/system/production/SiteVisitScreens.tsx](<../../../app/system/production/SiteVisitScreens.tsx>) | 3532–3569 |
| `ProductionVisitMasterData` | [app/system/production/SiteVisitScreens.tsx](<../../../app/system/production/SiteVisitScreens.tsx>) | 3575–3611 |
| `VisitTypeAdmin` | [app/system/production/SiteVisitScreens.tsx](<../../../app/system/production/SiteVisitScreens.tsx>) | 3617–3656 |
| `VisitTypeDrawer` | [app/system/production/SiteVisitScreens.tsx](<../../../app/system/production/SiteVisitScreens.tsx>) | 3658–3705 |
| `SkillAdmin` | [app/system/production/SiteVisitScreens.tsx](<../../../app/system/production/SiteVisitScreens.tsx>) | 3707–3774 |
| `ChecklistAdmin` | [app/system/production/SiteVisitScreens.tsx](<../../../app/system/production/SiteVisitScreens.tsx>) | 3776–3852 |
| `SlaAdmin` | [app/system/production/SiteVisitScreens.tsx](<../../../app/system/production/SiteVisitScreens.tsx>) | 3854–3898 |
| `EngineerSkillAdmin` | [app/system/production/SiteVisitScreens.tsx](<../../../app/system/production/SiteVisitScreens.tsx>) | 3900–3954 |
| `AvailabilityAdmin` | [app/system/production/SiteVisitScreens.tsx](<../../../app/system/production/SiteVisitScreens.tsx>) | 3956–4008 |

## Domain helpers / direct dependencies

- [backend-node/src/site-visit-common.ts](<../../../backend-node/src/site-visit-common.ts>)
- [backend-node/src/site-visit-data.ts](<../../../backend-node/src/site-visit-data.ts>)
- [backend-node/src/routes/sales-intakes.ts](<../../../backend-node/src/routes/sales-intakes.ts>)
- [backend-node/src/document-storage.ts](<../../../backend-node/src/document-storage.ts>)
- [backend-node/src/document-number.ts](<../../../backend-node/src/document-number.ts>)
- [backend-node/src/site-visit-operations.ts](<../../../backend-node/src/site-visit-operations.ts>)
- [backend-node/src/estimate-total-guard.ts](<../../../backend-node/src/estimate-total-guard.ts>)
- [backend-node/src/routes/sales-customers.ts](<../../../backend-node/src/routes/sales-customers.ts>)
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
- [tests/site-visit-rules.test.mjs](<../../../tests/site-visit-rules.test.mjs>)
- [tests/site-visit-workspace.test.mjs](<../../../tests/site-visit-workspace.test.mjs>)
- [backend-node/tests/site-visit.test.ts](<../../../backend-node/tests/site-visit.test.ts>)

## Client contract lookup

Search the selected API path or function in [app/system/api-client.ts](<../../../app/system/api-client.ts>); follow its screen callers. Common UI/language changes require [app/system/ui.tsx](<../../../app/system/ui.tsx>) and [app/system/i18n.ts](<../../../app/system/i18n.ts>). For SQL changes use [schema map](../SCHEMA.md).
