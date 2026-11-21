# Master Data / Customers / Admin

[Context index](../../../AGENTS.md) · [Architecture](../ARCHITECTURE.md) · [Change guide](../WORKFLOW.md)

ลูกค้า supplier (ดึงจาก Pegasus ERP) พนักงาน role audit และ settings

Evidence: snapshot `878a3653`; source map, not a live availability claim. Test candidates use filename matching and are not exhaustive coverage.

## Read only the operation you change

- [master API and function map](../api/master.md) — registered in Node app
- [sales-customers API and function map](../api/sales-customers.md) — registered in Node app
- [admin API and function map](../api/admin.md) — registered in Node app
- [sign-in-requests API and function map](../api/sign-in-requests.md) — registered in Node app
- [erp-master-data API and function map](../api/erp-master-data.md) — registered in Node app

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
| `SupplierCreateForm` | [app/system/production/CoreScreens.tsx](<../../../app/system/production/CoreScreens.tsx>) | 1655–1720 |
| `InventoryItemMasterTab` | [app/system/production/CoreScreens.tsx](<../../../app/system/production/CoreScreens.tsx>) | 1722–1737 |
| `InventoryMasterList` | [app/system/production/CoreScreens.tsx](<../../../app/system/production/CoreScreens.tsx>) | 1739–1766 |
| `InventoryItemCreateForm` | [app/system/production/CoreScreens.tsx](<../../../app/system/production/CoreScreens.tsx>) | 1768–1808 |
| `ChoiceSelect` | [app/system/production/CoreScreens.tsx](<../../../app/system/production/CoreScreens.tsx>) | 1819–1837 |
| `employeeDuration` | [app/system/production/CoreScreens.tsx](<../../../app/system/production/CoreScreens.tsx>) | 1846–1857 |
| `EmployeeMasterTab` | [app/system/production/CoreScreens.tsx](<../../../app/system/production/CoreScreens.tsx>) | 1859–1963 |
| `EmployeeModal` | [app/system/production/CoreScreens.tsx](<../../../app/system/production/CoreScreens.tsx>) | 1965–2026 |
| `TeamReferenceTab` | [app/system/production/CoreScreens.tsx](<../../../app/system/production/CoreScreens.tsx>) | 2030–2046 |
| `UserRoleModal` | [app/system/production/CoreScreens.tsx](<../../../app/system/production/CoreScreens.tsx>) | 2048–2147 |
| `EMPTY_PAGE` | [app/system/production/AdminAnalyticsScreens.tsx](<../../../app/system/production/AdminAnalyticsScreens.tsx>) | 188–188 |
| `toError` | [app/system/production/AdminAnalyticsScreens.tsx](<../../../app/system/production/AdminAnalyticsScreens.tsx>) | 189–189 |
| `formatMoney` | [app/system/production/AdminAnalyticsScreens.tsx](<../../../app/system/production/AdminAnalyticsScreens.tsx>) | 190–190 |
| `formatNumber` | [app/system/production/AdminAnalyticsScreens.tsx](<../../../app/system/production/AdminAnalyticsScreens.tsx>) | 191–191 |
| `formatPercent` | [app/system/production/AdminAnalyticsScreens.tsx](<../../../app/system/production/AdminAnalyticsScreens.tsx>) | 192–192 |
| `formatDate` | [app/system/production/AdminAnalyticsScreens.tsx](<../../../app/system/production/AdminAnalyticsScreens.tsx>) | 193–195 |
| `formatDateTime` | [app/system/production/AdminAnalyticsScreens.tsx](<../../../app/system/production/AdminAnalyticsScreens.tsx>) | 196–198 |
| `businessDate` | [app/system/production/AdminAnalyticsScreens.tsx](<../../../app/system/production/AdminAnalyticsScreens.tsx>) | 199–203 |
| `today` | [app/system/production/AdminAnalyticsScreens.tsx](<../../../app/system/production/AdminAnalyticsScreens.tsx>) | 204–204 |
| `yearAgo` | [app/system/production/AdminAnalyticsScreens.tsx](<../../../app/system/production/AdminAnalyticsScreens.tsx>) | 205–205 |
| `query` | [app/system/production/AdminAnalyticsScreens.tsx](<../../../app/system/production/AdminAnalyticsScreens.tsx>) | 206–213 |
| `LoadError` | [app/system/production/AdminAnalyticsScreens.tsx](<../../../app/system/production/AdminAnalyticsScreens.tsx>) | 215–223 |
| `PermissionNotice` | [app/system/production/AdminAnalyticsScreens.tsx](<../../../app/system/production/AdminAnalyticsScreens.tsx>) | 225–231 |
| `ProductionCustomers` | [app/system/production/AdminAnalyticsScreens.tsx](<../../../app/system/production/AdminAnalyticsScreens.tsx>) | 233–308 |
| `CustomerContactsModal` | [app/system/production/AdminAnalyticsScreens.tsx](<../../../app/system/production/AdminAnalyticsScreens.tsx>) | 324–488 |
| `LocalizedNameStack` | [app/system/production/AdminAnalyticsScreens.tsx](<../../../app/system/production/AdminAnalyticsScreens.tsx>) | 489–493 |
| `CustomerModal` | [app/system/production/AdminAnalyticsScreens.tsx](<../../../app/system/production/AdminAnalyticsScreens.tsx>) | 495–612 |
| `ProductionReports` | [app/system/production/AdminAnalyticsScreens.tsx](<../../../app/system/production/AdminAnalyticsScreens.tsx>) | 616–713 |
| `InventoryReportView` | [app/system/production/AdminAnalyticsScreens.tsx](<../../../app/system/production/AdminAnalyticsScreens.tsx>) | 715–730 |
| `SupplierReportView` | [app/system/production/AdminAnalyticsScreens.tsx](<../../../app/system/production/AdminAnalyticsScreens.tsx>) | 732–739 |
| `PrCycleReportView` | [app/system/production/AdminAnalyticsScreens.tsx](<../../../app/system/production/AdminAnalyticsScreens.tsx>) | 741–755 |
| `ProjectCostReportView` | [app/system/production/AdminAnalyticsScreens.tsx](<../../../app/system/production/AdminAnalyticsScreens.tsx>) | 768–794 |
| `ProductionEngineeringRates` | [app/system/production/AdminAnalyticsScreens.tsx](<../../../app/system/production/AdminAnalyticsScreens.tsx>) | 796–833 |
| `CreateRateModal` | [app/system/production/AdminAnalyticsScreens.tsx](<../../../app/system/production/AdminAnalyticsScreens.tsx>) | 835–872 |
| `ProductionAuditLog` | [app/system/production/AdminAnalyticsScreens.tsx](<../../../app/system/production/AdminAnalyticsScreens.tsx>) | 874–909 |
| `StorageCheckPanel` | [app/system/production/AdminAnalyticsScreens.tsx](<../../../app/system/production/AdminAnalyticsScreens.tsx>) | 913–997 |
| `ProductionSettings` | [app/system/production/AdminAnalyticsScreens.tsx](<../../../app/system/production/AdminAnalyticsScreens.tsx>) | 999–1024 |
| `when` | [app/system/production/ErpMasterPanel.tsx](<../../../app/system/production/ErpMasterPanel.tsx>) | 21–21 |
| `count` | [app/system/production/ErpMasterPanel.tsx](<../../../app/system/production/ErpMasterPanel.tsx>) | 22–22 |
| `messageOf` | [app/system/production/ErpMasterPanel.tsx](<../../../app/system/production/ErpMasterPanel.tsx>) | 23–23 |
| `ErpMasterPanel` | [app/system/production/ErpMasterPanel.tsx](<../../../app/system/production/ErpMasterPanel.tsx>) | 25–79 |
| `ErpReviewModal` | [app/system/production/ErpMasterPanel.tsx](<../../../app/system/production/ErpMasterPanel.tsx>) | 81–141 |

## Domain helpers / direct dependencies

- [backend-node/src/engineering-rate-access.ts](<../../../backend-node/src/engineering-rate-access.ts>)
- [backend-node/src/user-roles.ts](<../../../backend-node/src/user-roles.ts>)
- [backend-node/src/routes/sales-customers.ts](<../../../backend-node/src/routes/sales-customers.ts>)
- [backend-node/src/erp-master-data.ts](<../../../backend-node/src/erp-master-data.ts>)
- [backend-node/src/erp-master-sync.ts](<../../../backend-node/src/erp-master-sync.ts>)
- [app/system/dialogs.ts](<../../../app/system/dialogs.ts>)
- [app/system/i18n.ts](<../../../app/system/i18n.ts>)
- [app/system/LocalizedText.tsx](<../../../app/system/LocalizedText.tsx>)
- [app/system/api-client.ts](<../../../app/system/api-client.ts>)
- [app/system/project-overview-client.ts](<../../../app/system/project-overview-client.ts>)
- [app/system/production/ProjectPortfolioGantt.tsx](<../../../app/system/production/ProjectPortfolioGantt.tsx>)
- [app/system/use-activity-presence.ts](<../../../app/system/use-activity-presence.ts>)
- [app/system/screen-link.ts](<../../../app/system/screen-link.ts>)
- [lib/project-portfolio.ts](<../../../lib/project-portfolio.ts>)
- [backend-node/src/project-lifecycle.ts](<../../../backend-node/src/project-lifecycle.ts>)
- [app/system/production/EndUserCompanyField.tsx](<../../../app/system/production/EndUserCompanyField.tsx>)
- [app/system/production/ProjectPlanFields.tsx](<../../../app/system/production/ProjectPlanFields.tsx>)
- [app/system/production/AdminAnalyticsScreens.tsx](<../../../app/system/production/AdminAnalyticsScreens.tsx>)
- [app/system/production/ErpMasterPanel.tsx](<../../../app/system/production/ErpMasterPanel.tsx>)
- [app/system/production/PegasusScreen.tsx](<../../../app/system/production/PegasusScreen.tsx>)
- [app/system/production/ErpProjectNumber.tsx](<../../../app/system/production/ErpProjectNumber.tsx>)
- [app/system/production/SearchSelect.tsx](<../../../app/system/production/SearchSelect.tsx>)
- [app/system/production/BusinessCardScanner.tsx](<../../../app/system/production/BusinessCardScanner.tsx>)
- [lib/business-card.ts](<../../../lib/business-card.ts>)
- [lib/supplier-code.ts](<../../../lib/supplier-code.ts>)
- [app/system/production/master-data.css](<../../../app/system/production/master-data.css>)
- [app/system/segment-filters.css](<../../../app/system/segment-filters.css>)
- [app/system/production/project-portfolio.css](<../../../app/system/production/project-portfolio.css>)
- [app/system/ui.tsx](<../../../app/system/ui.tsx>)
- [app/system/DateInput.tsx](<../../../app/system/DateInput.tsx>)
- [app/system/production/customer-localized-names.ts](<../../../app/system/production/customer-localized-names.ts>)
- [app/system/tmt-id.constants.ts](<../../../app/system/tmt-id.constants.ts>)

## Candidate regression tests

- [tests/business-card-lifecycle.test.mjs](<../../../tests/business-card-lifecycle.test.mjs>)
- [tests/business-card-multilingual.test.mjs](<../../../tests/business-card-multilingual.test.mjs>)
- [tests/business-card-scanner.test.mjs](<../../../tests/business-card-scanner.test.mjs>)
- [tests/customer-contact-role-ui.test.mjs](<../../../tests/customer-contact-role-ui.test.mjs>)
- [tests/customer-contact-titles-ui.test.mjs](<../../../tests/customer-contact-titles-ui.test.mjs>)
- [tests/customer-multilingual-names.test.mjs](<../../../tests/customer-multilingual-names.test.mjs>)
- [tests/supplier-business-card.test.mjs](<../../../tests/supplier-business-card.test.mjs>)
- [tests/user-role-management.test.mjs](<../../../tests/user-role-management.test.mjs>)
- [backend-node/tests/admin-role-management.test.ts](<../../../backend-node/tests/admin-role-management.test.ts>)
- [backend-node/tests/erp-master-data.test.ts](<../../../backend-node/tests/erp-master-data.test.ts>)
- [backend-node/tests/estimate-admin-self-decision.test.ts](<../../../backend-node/tests/estimate-admin-self-decision.test.ts>)
- [backend-node/tests/sales-customers.test.ts](<../../../backend-node/tests/sales-customers.test.ts>)

## Client contract lookup

Search the selected API path or function in [app/system/api-client.ts](<../../../app/system/api-client.ts>); follow its screen callers. Common UI/language changes require [app/system/ui.tsx](<../../../app/system/ui.tsx>) and [app/system/i18n.ts](<../../../app/system/i18n.ts>). For SQL changes use [schema map](../SCHEMA.md).
