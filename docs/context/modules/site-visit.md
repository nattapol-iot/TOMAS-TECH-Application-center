# Site Visit / My Assignments

[Context index](../../../AGENTS.md) · [Architecture](../ARCHITECTURE.md) · [Change guide](../WORKFLOW.md)

นัดหมาย มอบหมาย สำรวจ รายงาน และอนุมัติ

Evidence: snapshot `94985f6d`; source map, not a live availability claim. Test candidates use filename matching and are not exhaustive coverage.

## Read only the operation you change

- [site-visits-read API and function map](../api/site-visits-read.md) — registered in Node app
- [site-visits-workflow API and function map](../api/site-visits-workflow.md) — registered in Node app
- [site-visit-reports API and function map](../api/site-visit-reports.md) — registered in Node app
- [visit-master API and function map](../api/visit-master.md) — registered in Node app

## UI function locator

Shared screens contain other modules: use the symbol and line range instead of reading the whole file.

| Symbol | Source | Lines |
|---|---|---|
| `toError` | [app/system/production/SiteVisitScreens.tsx](<../../../app/system/production/SiteVisitScreens.tsx>) | 133–133 |
| `formatDate` | [app/system/production/SiteVisitScreens.tsx](<../../../app/system/production/SiteVisitScreens.tsx>) | 134–134 |
| `formatDateTime` | [app/system/production/SiteVisitScreens.tsx](<../../../app/system/production/SiteVisitScreens.tsx>) | 135–135 |
| `formatTime` | [app/system/production/SiteVisitScreens.tsx](<../../../app/system/production/SiteVisitScreens.tsx>) | 136–136 |
| `formatFileSize` | [app/system/production/SiteVisitScreens.tsx](<../../../app/system/production/SiteVisitScreens.tsx>) | 137–137 |
| `initials` | [app/system/production/SiteVisitScreens.tsx](<../../../app/system/production/SiteVisitScreens.tsx>) | 138–145 |
| `businessDate` | [app/system/production/SiteVisitScreens.tsx](<../../../app/system/production/SiteVisitScreens.tsx>) | 146–150 |
| `today` | [app/system/production/SiteVisitScreens.tsx](<../../../app/system/production/SiteVisitScreens.tsx>) | 151–151 |
| `futureDate` | [app/system/production/SiteVisitScreens.tsx](<../../../app/system/production/SiteVisitScreens.tsx>) | 152–152 |
| `toLocalInput` | [app/system/production/SiteVisitScreens.tsx](<../../../app/system/production/SiteVisitScreens.tsx>) | 154–159 |
| `fromLocalInput` | [app/system/production/SiteVisitScreens.tsx](<../../../app/system/production/SiteVisitScreens.tsx>) | 160–160 |
| `priorityTone` | [app/system/production/SiteVisitScreens.tsx](<../../../app/system/production/SiteVisitScreens.tsx>) | 161–161 |
| `readinessTone` | [app/system/production/SiteVisitScreens.tsx](<../../../app/system/production/SiteVisitScreens.tsx>) | 162–162 |
| `slaTone` | [app/system/production/SiteVisitScreens.tsx](<../../../app/system/production/SiteVisitScreens.tsx>) | 163–163 |
| `slaLabel` | [app/system/production/SiteVisitScreens.tsx](<../../../app/system/production/SiteVisitScreens.tsx>) | 164–172 |
| `matchTone` | [app/system/production/SiteVisitScreens.tsx](<../../../app/system/production/SiteVisitScreens.tsx>) | 173–173 |
| `LoadError` | [app/system/production/SiteVisitScreens.tsx](<../../../app/system/production/SiteVisitScreens.tsx>) | 175–190 |
| `Loading` | [app/system/production/SiteVisitScreens.tsx](<../../../app/system/production/SiteVisitScreens.tsx>) | 192–200 |
| `NoPermission` | [app/system/production/SiteVisitScreens.tsx](<../../../app/system/production/SiteVisitScreens.tsx>) | 202–205 |
| `WorkflowTimeline` | [app/system/production/SiteVisitScreens.tsx](<../../../app/system/production/SiteVisitScreens.tsx>) | 208–220 |
| `useMasterData` | [app/system/production/SiteVisitScreens.tsx](<../../../app/system/production/SiteVisitScreens.tsx>) | 251–269 |
| `ProductionSalesIntake` | [app/system/production/SiteVisitScreens.tsx](<../../../app/system/production/SiteVisitScreens.tsx>) | 277–311 |
| `IntakeList` | [app/system/production/SiteVisitScreens.tsx](<../../../app/system/production/SiteVisitScreens.tsx>) | 315–549 |
| `ReviewQueue` | [app/system/production/SiteVisitScreens.tsx](<../../../app/system/production/SiteVisitScreens.tsx>) | 551–659 |
| `SalesDashboard` | [app/system/production/SiteVisitScreens.tsx](<../../../app/system/production/SiteVisitScreens.tsx>) | 661–763 |
| `ReadinessMeter` | [app/system/production/SiteVisitScreens.tsx](<../../../app/system/production/SiteVisitScreens.tsx>) | 815–853 |
| `IntakeEditor` | [app/system/production/SiteVisitScreens.tsx](<../../../app/system/production/SiteVisitScreens.tsx>) | 855–1655 |
| `DefinitionList` | [app/system/production/SiteVisitScreens.tsx](<../../../app/system/production/SiteVisitScreens.tsx>) | 1661–1675 |
| `IntakeDetailScreen` | [app/system/production/SiteVisitScreens.tsx](<../../../app/system/production/SiteVisitScreens.tsx>) | 1677–2303 |
| `TechnicalReviewDrawer` | [app/system/production/SiteVisitScreens.tsx](<../../../app/system/production/SiteVisitScreens.tsx>) | 2305–2447 |
| `RequestVisitDrawer` | [app/system/production/SiteVisitScreens.tsx](<../../../app/system/production/SiteVisitScreens.tsx>) | 2449–2586 |
| `ProductionSiteVisits` | [app/system/production/SiteVisitScreens.tsx](<../../../app/system/production/SiteVisitScreens.tsx>) | 2594–2623 |
| `VisitList` | [app/system/production/SiteVisitScreens.tsx](<../../../app/system/production/SiteVisitScreens.tsx>) | 2625–2878 |
| `VisitCalendar` | [app/system/production/SiteVisitScreens.tsx](<../../../app/system/production/SiteVisitScreens.tsx>) | 2886–3103 |
| `EngineeringDashboard` | [app/system/production/SiteVisitScreens.tsx](<../../../app/system/production/SiteVisitScreens.tsx>) | 3105–3288 |
| `SiteVisitDetailScreen` | [app/system/production/SiteVisitScreens.tsx](<../../../app/system/production/SiteVisitScreens.tsx>) | 3296–3880 |
| `AssignmentTab` | [app/system/production/SiteVisitScreens.tsx](<../../../app/system/production/SiteVisitScreens.tsx>) | 3882–4069 |
| `AssignDrawer` | [app/system/production/SiteVisitScreens.tsx](<../../../app/system/production/SiteVisitScreens.tsx>) | 4071–4271 |
| `RespondDrawer` | [app/system/production/SiteVisitScreens.tsx](<../../../app/system/production/SiteVisitScreens.tsx>) | 4273–4366 |
| `ConfirmationDrawer` | [app/system/production/SiteVisitScreens.tsx](<../../../app/system/production/SiteVisitScreens.tsx>) | 4368–4465 |
| `RescheduleDrawer` | [app/system/production/SiteVisitScreens.tsx](<../../../app/system/production/SiteVisitScreens.tsx>) | 4467–4556 |
| `CloseVisitModal` | [app/system/production/SiteVisitScreens.tsx](<../../../app/system/production/SiteVisitScreens.tsx>) | 4558–4627 |
| `CreateInquiryDrawer` | [app/system/production/SiteVisitScreens.tsx](<../../../app/system/production/SiteVisitScreens.tsx>) | 4629–4748 |
| `PreVisitBrief` | [app/system/production/SiteVisitScreens.tsx](<../../../app/system/production/SiteVisitScreens.tsx>) | 4750–4937 |
| `ExecutionTab` | [app/system/production/SiteVisitScreens.tsx](<../../../app/system/production/SiteVisitScreens.tsx>) | 4947–5428 |
| `FindingDrawer` | [app/system/production/SiteVisitScreens.tsx](<../../../app/system/production/SiteVisitScreens.tsx>) | 5430–5528 |
| `CheckInModal` | [app/system/production/SiteVisitScreens.tsx](<../../../app/system/production/SiteVisitScreens.tsx>) | 5530–5633 |
| `CheckOutModal` | [app/system/production/SiteVisitScreens.tsx](<../../../app/system/production/SiteVisitScreens.tsx>) | 5635–5714 |
| `ReportTab` | [app/system/production/SiteVisitScreens.tsx](<../../../app/system/production/SiteVisitScreens.tsx>) | 5739–6105 |
| `ReviewReportModal` | [app/system/production/SiteVisitScreens.tsx](<../../../app/system/production/SiteVisitScreens.tsx>) | 6107–6185 |
| `AcknowledgeModal` | [app/system/production/SiteVisitScreens.tsx](<../../../app/system/production/SiteVisitScreens.tsx>) | 6187–6252 |
| `ActionItemDrawer` | [app/system/production/SiteVisitScreens.tsx](<../../../app/system/production/SiteVisitScreens.tsx>) | 6254–6347 |
| `ProductionMyAssignments` | [app/system/production/SiteVisitScreens.tsx](<../../../app/system/production/SiteVisitScreens.tsx>) | 6353–6606 |
| `MyResponseModal` | [app/system/production/SiteVisitScreens.tsx](<../../../app/system/production/SiteVisitScreens.tsx>) | 6608–6675 |
| `ProductionVisitMasterData` | [app/system/production/SiteVisitScreens.tsx](<../../../app/system/production/SiteVisitScreens.tsx>) | 6681–6733 |
| `VisitTypeAdmin` | [app/system/production/SiteVisitScreens.tsx](<../../../app/system/production/SiteVisitScreens.tsx>) | 6742–6861 |
| `VisitTypeDrawer` | [app/system/production/SiteVisitScreens.tsx](<../../../app/system/production/SiteVisitScreens.tsx>) | 6863–6958 |
| `SkillAdmin` | [app/system/production/SiteVisitScreens.tsx](<../../../app/system/production/SiteVisitScreens.tsx>) | 6960–7139 |
| `ChecklistAdmin` | [app/system/production/SiteVisitScreens.tsx](<../../../app/system/production/SiteVisitScreens.tsx>) | 7141–7330 |
| `SlaAdmin` | [app/system/production/SiteVisitScreens.tsx](<../../../app/system/production/SiteVisitScreens.tsx>) | 7332–7444 |
| `EngineerSkillAdmin` | [app/system/production/SiteVisitScreens.tsx](<../../../app/system/production/SiteVisitScreens.tsx>) | 7446–7575 |
| `AvailabilityAdmin` | [app/system/production/SiteVisitScreens.tsx](<../../../app/system/production/SiteVisitScreens.tsx>) | 7577–7691 |

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
- [backend-node/src/user-roles.ts](<../../../backend-node/src/user-roles.ts>)

## Candidate regression tests

- [tests/inquiry-visit-flow.test.mjs](<../../../tests/inquiry-visit-flow.test.mjs>)
- [tests/site-visit-guardrails.test.mjs](<../../../tests/site-visit-guardrails.test.mjs>)
- [tests/site-visit-workspace.test.mjs](<../../../tests/site-visit-workspace.test.mjs>)
- [backend-node/tests/site-visit.test.ts](<../../../backend-node/tests/site-visit.test.ts>)

## Client contract lookup

Search the selected API path or function in [app/system/api-client.ts](<../../../app/system/api-client.ts>); follow its screen callers. Common UI/language changes require [app/system/ui.tsx](<../../../app/system/ui.tsx>) and [app/system/i18n.ts](<../../../app/system/i18n.ts>). For SQL changes use [schema map](../SCHEMA.md).
