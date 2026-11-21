# Projects / Project Documents

[Context index](../../../AGENTS.md) · [Architecture](../ARCHITECTURE.md) · [Change guide](../WORKFLOW.md)

ทะเบียนโครงการ end user เลขโครงการค้นจาก Pegasus ERP และรับส่งเอกสารจาก inquiry/site visit

Evidence: snapshot `04c03d25`; source map, not a live availability claim. Test candidates use filename matching and are not exhaustive coverage.

## Read only the operation you change

- [projects API and function map](../api/projects.md) — registered in Node app
- [project-documents API and function map](../api/project-documents.md) — registered in Node app
- [erp-projects API and function map](../api/erp-projects.md) — registered in Node app

## UI function locator

Shared screens contain other modules: use the symbol and line range instead of reading the whole file.

| Symbol | Source | Lines |
|---|---|---|
| `toError` | [app/system/production/CoreScreens.tsx](<../../../app/system/production/CoreScreens.tsx>) | 113–113 |
| `formText` | [app/system/production/CoreScreens.tsx](<../../../app/system/production/CoreScreens.tsx>) | 114–114 |
| `optionalFormText` | [app/system/production/CoreScreens.tsx](<../../../app/system/production/CoreScreens.tsx>) | 115–115 |
| `formNumber` | [app/system/production/CoreScreens.tsx](<../../../app/system/production/CoreScreens.tsx>) | 116–116 |
| `formatDate` | [app/system/production/CoreScreens.tsx](<../../../app/system/production/CoreScreens.tsx>) | 117–117 |
| `formatDateTime` | [app/system/production/CoreScreens.tsx](<../../../app/system/production/CoreScreens.tsx>) | 118–118 |
| `formatMoney` | [app/system/production/CoreScreens.tsx](<../../../app/system/production/CoreScreens.tsx>) | 119–119 |
| `businessDate` | [app/system/production/CoreScreens.tsx](<../../../app/system/production/CoreScreens.tsx>) | 121–130 |
| `futureDate` | [app/system/production/CoreScreens.tsx](<../../../app/system/production/CoreScreens.tsx>) | 131–131 |
| `today` | [app/system/production/CoreScreens.tsx](<../../../app/system/production/CoreScreens.tsx>) | 132–132 |
| `formatFileSize` | [app/system/production/CoreScreens.tsx](<../../../app/system/production/CoreScreens.tsx>) | 151–162 |
| `LoadError` | [app/system/production/CoreScreens.tsx](<../../../app/system/production/CoreScreens.tsx>) | 164–172 |
| `dashboardDateKey` | [app/system/production/CoreScreens.tsx](<../../../app/system/production/CoreScreens.tsx>) | 205–205 |
| `dashboardDayDistance` | [app/system/production/CoreScreens.tsx](<../../../app/system/production/CoreScreens.tsx>) | 206–210 |
| `dashboardDueDate` | [app/system/production/CoreScreens.tsx](<../../../app/system/production/CoreScreens.tsx>) | 212–212 |
| `dashboardClampedDate` | [app/system/production/CoreScreens.tsx](<../../../app/system/production/CoreScreens.tsx>) | 213–216 |
| `dashboardTenure` | [app/system/production/CoreScreens.tsx](<../../../app/system/production/CoreScreens.tsx>) | 217–241 |
| `dashboardTaskTone` | [app/system/production/CoreScreens.tsx](<../../../app/system/production/CoreScreens.tsx>) | 242–248 |
| `ProductionDashboard` | [app/system/production/CoreScreens.tsx](<../../../app/system/production/CoreScreens.tsx>) | 250–487 |
| `formatDay` | [app/system/production/CoreScreens.tsx](<../../../app/system/production/CoreScreens.tsx>) | 495–495 |
| `PortfolioSortHeader` | [app/system/production/CoreScreens.tsx](<../../../app/system/production/CoreScreens.tsx>) | 497–503 |
| `PortfolioProgress` | [app/system/production/CoreScreens.tsx](<../../../app/system/production/CoreScreens.tsx>) | 506–518 |
| `RowDisclosure` | [app/system/production/CoreScreens.tsx](<../../../app/system/production/CoreScreens.tsx>) | 526–575 |
| `CloseProjectModal` | [app/system/production/CoreScreens.tsx](<../../../app/system/production/CoreScreens.tsx>) | 579–592 |
| `ProductionProjects` | [app/system/production/CoreScreens.tsx](<../../../app/system/production/CoreScreens.tsx>) | 605–807 |
| `DeleteProjectModal` | [app/system/production/CoreScreens.tsx](<../../../app/system/production/CoreScreens.tsx>) | 812–836 |
| `ProjectMembersModal` | [app/system/production/CoreScreens.tsx](<../../../app/system/production/CoreScreens.tsx>) | 838–915 |
| `planRowStarted` | [app/system/production/CoreScreens.tsx](<../../../app/system/production/CoreScreens.tsx>) | 922–922 |
| `planRowLocked` | [app/system/production/CoreScreens.tsx](<../../../app/system/production/CoreScreens.tsx>) | 924–924 |
| `datesDerived` | [app/system/production/CoreScreens.tsx](<../../../app/system/production/CoreScreens.tsx>) | 925–925 |
| `shiftPlanDate` | [app/system/production/CoreScreens.tsx](<../../../app/system/production/CoreScreens.tsx>) | 926–926 |
| `planDrafts` | [app/system/production/CoreScreens.tsx](<../../../app/system/production/CoreScreens.tsx>) | 929–944 |
| `useProjectPlan` | [app/system/production/CoreScreens.tsx](<../../../app/system/production/CoreScreens.tsx>) | 947–967 |
| `useScheduleTemplates` | [app/system/production/CoreScreens.tsx](<../../../app/system/production/CoreScreens.tsx>) | 969–973 |
| `EditMasterPlanModal` | [app/system/production/CoreScreens.tsx](<../../../app/system/production/CoreScreens.tsx>) | 980–1023 |
| `EditProjectModal` | [app/system/production/CoreScreens.tsx](<../../../app/system/production/CoreScreens.tsx>) | 1027–1155 |
| `ProjectDocumentsModal` | [app/system/production/CoreScreens.tsx](<../../../app/system/production/CoreScreens.tsx>) | 1156–1304 |
| `CreateProjectModal` | [app/system/production/CoreScreens.tsx](<../../../app/system/production/CoreScreens.tsx>) | 1317–1437 |
| `ProductionInventory` | [app/system/production/CoreScreens.tsx](<../../../app/system/production/CoreScreens.tsx>) | 1439–1456 |
| `ProductionMasterData` | [app/system/production/CoreScreens.tsx](<../../../app/system/production/CoreScreens.tsx>) | 1460–1496 |
| `useMasterForm` | [app/system/production/CoreScreens.tsx](<../../../app/system/production/CoreScreens.tsx>) | 1500–1530 |
| `MasterFormError` | [app/system/production/CoreScreens.tsx](<../../../app/system/production/CoreScreens.tsx>) | 1532–1535 |
| `SupplierMasterTab` | [app/system/production/CoreScreens.tsx](<../../../app/system/production/CoreScreens.tsx>) | 1537–1601 |
| `SupplierEditModal` | [app/system/production/CoreScreens.tsx](<../../../app/system/production/CoreScreens.tsx>) | 1603–1651 |
| `SupplierCreateForm` | [app/system/production/CoreScreens.tsx](<../../../app/system/production/CoreScreens.tsx>) | 1655–1718 |
| `InventoryItemMasterTab` | [app/system/production/CoreScreens.tsx](<../../../app/system/production/CoreScreens.tsx>) | 1720–1735 |
| `InventoryMasterList` | [app/system/production/CoreScreens.tsx](<../../../app/system/production/CoreScreens.tsx>) | 1737–1764 |
| `InventoryItemCreateForm` | [app/system/production/CoreScreens.tsx](<../../../app/system/production/CoreScreens.tsx>) | 1766–1806 |
| `ChoiceSelect` | [app/system/production/CoreScreens.tsx](<../../../app/system/production/CoreScreens.tsx>) | 1817–1835 |
| `employeeDuration` | [app/system/production/CoreScreens.tsx](<../../../app/system/production/CoreScreens.tsx>) | 1844–1855 |
| `EmployeeMasterTab` | [app/system/production/CoreScreens.tsx](<../../../app/system/production/CoreScreens.tsx>) | 1857–1961 |
| `EmployeeModal` | [app/system/production/CoreScreens.tsx](<../../../app/system/production/CoreScreens.tsx>) | 1963–2024 |
| `TeamReferenceTab` | [app/system/production/CoreScreens.tsx](<../../../app/system/production/CoreScreens.tsx>) | 2028–2044 |
| `UserRoleModal` | [app/system/production/CoreScreens.tsx](<../../../app/system/production/CoreScreens.tsx>) | 2046–2145 |
| `isPlaceholderProjectNumber` | [app/system/production/ErpProjectNumber.tsx](<../../../app/system/production/ErpProjectNumber.tsx>) | 21–21 |
| `sameNumber` | [app/system/production/ErpProjectNumber.tsx](<../../../app/system/production/ErpProjectNumber.tsx>) | 23–23 |
| `ErpProjectNumberField` | [app/system/production/ErpProjectNumber.tsx](<../../../app/system/production/ErpProjectNumber.tsx>) | 25–103 |

## Domain helpers / direct dependencies

- [backend-node/src/business-date.ts](<../../../backend-node/src/business-date.ts>)
- [backend-node/src/document-storage.ts](<../../../backend-node/src/document-storage.ts>)
- [backend-node/src/project-handover.ts](<../../../backend-node/src/project-handover.ts>)
- [backend-node/src/estimate-total-guard.ts](<../../../backend-node/src/estimate-total-guard.ts>)
- [backend-node/src/end-user.ts](<../../../backend-node/src/end-user.ts>)
- [backend-node/src/project-lifecycle.ts](<../../../backend-node/src/project-lifecycle.ts>)
- [backend-node/src/project-initial-plan.ts](<../../../backend-node/src/project-initial-plan.ts>)
- [backend-node/src/project-health.ts](<../../../backend-node/src/project-health.ts>)
- [backend-node/src/project-overview.ts](<../../../backend-node/src/project-overview.ts>)
- [backend-node/src/manhour-budget.ts](<../../../backend-node/src/manhour-budget.ts>)
- [backend-node/src/project-cost.ts](<../../../backend-node/src/project-cost.ts>)
- [backend-node/src/project-cost-model.ts](<../../../backend-node/src/project-cost-model.ts>)
- [backend-node/src/procurement-rules.ts](<../../../backend-node/src/procurement-rules.ts>)
- [backend-node/src/project-notices.ts](<../../../backend-node/src/project-notices.ts>)
- [backend-node/src/project-scope.ts](<../../../backend-node/src/project-scope.ts>)
- [backend-node/src/schedule-service.ts](<../../../backend-node/src/schedule-service.ts>)
- [backend-node/src/user-roles.ts](<../../../backend-node/src/user-roles.ts>)
- [backend-node/src/email.ts](<../../../backend-node/src/email.ts>)
- [backend-node/src/crm.ts](<../../../backend-node/src/crm.ts>)
- [backend-node/src/drawing-workflow.ts](<../../../backend-node/src/drawing-workflow.ts>)
- [backend-node/src/erp-purchasing.ts](<../../../backend-node/src/erp-purchasing.ts>)
- [backend-node/src/erp-projects.ts](<../../../backend-node/src/erp-projects.ts>)
- [backend-node/src/master-data/services.ts](<../../../backend-node/src/master-data/services.ts>)
- [app/system/dialogs.ts](<../../../app/system/dialogs.ts>)
- [app/system/i18n.ts](<../../../app/system/i18n.ts>)
- [app/system/LocalizedText.tsx](<../../../app/system/LocalizedText.tsx>)
- [app/system/api-client.ts](<../../../app/system/api-client.ts>)
- [app/system/project-overview-client.ts](<../../../app/system/project-overview-client.ts>)
- [app/system/production/ProjectPortfolioGantt.tsx](<../../../app/system/production/ProjectPortfolioGantt.tsx>)
- [app/system/use-activity-presence.ts](<../../../app/system/use-activity-presence.ts>)
- [app/system/screen-link.ts](<../../../app/system/screen-link.ts>)
- [lib/project-portfolio.ts](<../../../lib/project-portfolio.ts>)
- [app/system/production/EndUserCompanyField.tsx](<../../../app/system/production/EndUserCompanyField.tsx>)
- [app/system/production/ProjectPlanFields.tsx](<../../../app/system/production/ProjectPlanFields.tsx>)
- [app/system/production/AdminAnalyticsScreens.tsx](<../../../app/system/production/AdminAnalyticsScreens.tsx>)
- [app/system/production/ErpMasterPanel.tsx](<../../../app/system/production/ErpMasterPanel.tsx>)
- [app/system/production/PegasusScreen.tsx](<../../../app/system/production/PegasusScreen.tsx>)
- [app/system/production/ErpProjectNumber.tsx](<../../../app/system/production/ErpProjectNumber.tsx>)
- [app/system/production/SearchSelect.tsx](<../../../app/system/production/SearchSelect.tsx>)
- [backend-node/src/engineering-rate-access.ts](<../../../backend-node/src/engineering-rate-access.ts>)
- [app/system/production/BusinessCardScanner.tsx](<../../../app/system/production/BusinessCardScanner.tsx>)
- [lib/business-card.ts](<../../../lib/business-card.ts>)
- [lib/supplier-code.ts](<../../../lib/supplier-code.ts>)
- [app/system/production/master-data.css](<../../../app/system/production/master-data.css>)
- [app/system/segment-filters.css](<../../../app/system/segment-filters.css>)
- [app/system/production/project-portfolio.css](<../../../app/system/production/project-portfolio.css>)
- [app/system/ui.tsx](<../../../app/system/ui.tsx>)
- [app/system/DateInput.tsx](<../../../app/system/DateInput.tsx>)
- [app/system/production/CostItemLookup.tsx](<../../../app/system/production/CostItemLookup.tsx>)

## Candidate regression tests

- [tests/end-user-ui.test.mjs](<../../../tests/end-user-ui.test.mjs>)
- [tests/project-closed-health.test.mjs](<../../../tests/project-closed-health.test.mjs>)
- [tests/project-edit-contract.test.mjs](<../../../tests/project-edit-contract.test.mjs>)
- [tests/project-followups-ui.test.mjs](<../../../tests/project-followups-ui.test.mjs>)
- [tests/project-input-editing.test.mjs](<../../../tests/project-input-editing.test.mjs>)
- [tests/project-plan-add-child.test.mjs](<../../../tests/project-plan-add-child.test.mjs>)
- [tests/project-portfolio-ui.test.mjs](<../../../tests/project-portfolio-ui.test.mjs>)
- [tests/project-portfolio.test.mjs](<../../../tests/project-portfolio.test.mjs>)
- [tests/project-without-estimate.test.mjs](<../../../tests/project-without-estimate.test.mjs>)
- [tests/team-board-closed-projects.test.mjs](<../../../tests/team-board-closed-projects.test.mjs>)
- [backend-node/tests/end-user.test.ts](<../../../backend-node/tests/end-user.test.ts>)
- [backend-node/tests/erp-projects.test.ts](<../../../backend-node/tests/erp-projects.test.ts>)
- [backend-node/tests/project-cost-route.test.ts](<../../../backend-node/tests/project-cost-route.test.ts>)
- [backend-node/tests/project-cost.test.ts](<../../../backend-node/tests/project-cost.test.ts>)
- [backend-node/tests/project-documents-withdraw.test.ts](<../../../backend-node/tests/project-documents-withdraw.test.ts>)
- [backend-node/tests/project-edit-route.test.ts](<../../../backend-node/tests/project-edit-route.test.ts>)
- [backend-node/tests/project-handover.test.ts](<../../../backend-node/tests/project-handover.test.ts>)
- [backend-node/tests/project-health.test.ts](<../../../backend-node/tests/project-health.test.ts>)
- [backend-node/tests/project-initial-plan.test.ts](<../../../backend-node/tests/project-initial-plan.test.ts>)
- [backend-node/tests/project-lifecycle.test.ts](<../../../backend-node/tests/project-lifecycle.test.ts>)
- [backend-node/tests/project-notices.test.ts](<../../../backend-node/tests/project-notices.test.ts>)
- [backend-node/tests/project-overview.test.ts](<../../../backend-node/tests/project-overview.test.ts>)

## Client contract lookup

Search the selected API path or function in [app/system/api-client.ts](<../../../app/system/api-client.ts>); follow its screen callers. Common UI/language changes require [app/system/ui.tsx](<../../../app/system/ui.tsx>) and [app/system/i18n.ts](<../../../app/system/i18n.ts>). For SQL changes use [schema map](../SCHEMA.md).
