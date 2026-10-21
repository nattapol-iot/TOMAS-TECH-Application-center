# Master Data / Customers / Admin

[Context index](../../../AGENTS.md) · [Architecture](../ARCHITECTURE.md) · [Change guide](../WORKFLOW.md)

ลูกค้า supplier พนักงาน role audit และ settings

Evidence: snapshot `8c91db80`; source map, not a live availability claim. Test candidates use filename matching and are not exhaustive coverage.

## Read only the operation you change

- [master API and function map](../api/master.md) — registered in Node app
- [sales-customers API and function map](../api/sales-customers.md) — registered in Node app
- [admin API and function map](../api/admin.md) — registered in Node app
- [sign-in-requests API and function map](../api/sign-in-requests.md) — registered in Node app

## UI function locator

Shared screens contain other modules: use the symbol and line range instead of reading the whole file.

| Symbol | Source | Lines |
|---|---|---|
| `toError` | [app/system/production/CoreScreens.tsx](<../../../app/system/production/CoreScreens.tsx>) | 107–107 |
| `formText` | [app/system/production/CoreScreens.tsx](<../../../app/system/production/CoreScreens.tsx>) | 108–108 |
| `optionalFormText` | [app/system/production/CoreScreens.tsx](<../../../app/system/production/CoreScreens.tsx>) | 109–109 |
| `formNumber` | [app/system/production/CoreScreens.tsx](<../../../app/system/production/CoreScreens.tsx>) | 110–110 |
| `formatDate` | [app/system/production/CoreScreens.tsx](<../../../app/system/production/CoreScreens.tsx>) | 111–111 |
| `formatDateTime` | [app/system/production/CoreScreens.tsx](<../../../app/system/production/CoreScreens.tsx>) | 112–112 |
| `formatMoney` | [app/system/production/CoreScreens.tsx](<../../../app/system/production/CoreScreens.tsx>) | 113–113 |
| `businessDate` | [app/system/production/CoreScreens.tsx](<../../../app/system/production/CoreScreens.tsx>) | 115–124 |
| `futureDate` | [app/system/production/CoreScreens.tsx](<../../../app/system/production/CoreScreens.tsx>) | 125–125 |
| `today` | [app/system/production/CoreScreens.tsx](<../../../app/system/production/CoreScreens.tsx>) | 126–126 |
| `formatFileSize` | [app/system/production/CoreScreens.tsx](<../../../app/system/production/CoreScreens.tsx>) | 145–156 |
| `LoadError` | [app/system/production/CoreScreens.tsx](<../../../app/system/production/CoreScreens.tsx>) | 158–166 |
| `dashboardDateKey` | [app/system/production/CoreScreens.tsx](<../../../app/system/production/CoreScreens.tsx>) | 199–199 |
| `dashboardDayDistance` | [app/system/production/CoreScreens.tsx](<../../../app/system/production/CoreScreens.tsx>) | 200–204 |
| `dashboardDueDate` | [app/system/production/CoreScreens.tsx](<../../../app/system/production/CoreScreens.tsx>) | 206–206 |
| `dashboardClampedDate` | [app/system/production/CoreScreens.tsx](<../../../app/system/production/CoreScreens.tsx>) | 207–210 |
| `dashboardTenure` | [app/system/production/CoreScreens.tsx](<../../../app/system/production/CoreScreens.tsx>) | 211–235 |
| `dashboardTaskTone` | [app/system/production/CoreScreens.tsx](<../../../app/system/production/CoreScreens.tsx>) | 236–242 |
| `ProductionDashboard` | [app/system/production/CoreScreens.tsx](<../../../app/system/production/CoreScreens.tsx>) | 244–481 |
| `formatDay` | [app/system/production/CoreScreens.tsx](<../../../app/system/production/CoreScreens.tsx>) | 490–490 |
| `PortfolioSortHeader` | [app/system/production/CoreScreens.tsx](<../../../app/system/production/CoreScreens.tsx>) | 492–498 |
| `PortfolioProgress` | [app/system/production/CoreScreens.tsx](<../../../app/system/production/CoreScreens.tsx>) | 501–513 |
| `RowDisclosure` | [app/system/production/CoreScreens.tsx](<../../../app/system/production/CoreScreens.tsx>) | 521–569 |
| `CloseProjectModal` | [app/system/production/CoreScreens.tsx](<../../../app/system/production/CoreScreens.tsx>) | 573–586 |
| `portfolioModeStorageKey` | [app/system/production/CoreScreens.tsx](<../../../app/system/production/CoreScreens.tsx>) | 593–593 |
| `ProductionProjects` | [app/system/production/CoreScreens.tsx](<../../../app/system/production/CoreScreens.tsx>) | 595–798 |
| `DeleteProjectModal` | [app/system/production/CoreScreens.tsx](<../../../app/system/production/CoreScreens.tsx>) | 802–821 |
| `ProjectMembersModal` | [app/system/production/CoreScreens.tsx](<../../../app/system/production/CoreScreens.tsx>) | 823–900 |
| `planRowLocked` | [app/system/production/CoreScreens.tsx](<../../../app/system/production/CoreScreens.tsx>) | 907–907 |
| `EditProjectModal` | [app/system/production/CoreScreens.tsx](<../../../app/system/production/CoreScreens.tsx>) | 911–1053 |
| `ProjectDocumentsModal` | [app/system/production/CoreScreens.tsx](<../../../app/system/production/CoreScreens.tsx>) | 1054–1202 |
| `CreateProjectModal` | [app/system/production/CoreScreens.tsx](<../../../app/system/production/CoreScreens.tsx>) | 1215–1334 |
| `ProductionInventory` | [app/system/production/CoreScreens.tsx](<../../../app/system/production/CoreScreens.tsx>) | 1336–1353 |
| `ProductionMasterData` | [app/system/production/CoreScreens.tsx](<../../../app/system/production/CoreScreens.tsx>) | 1357–1389 |
| `useMasterForm` | [app/system/production/CoreScreens.tsx](<../../../app/system/production/CoreScreens.tsx>) | 1393–1423 |
| `MasterFormError` | [app/system/production/CoreScreens.tsx](<../../../app/system/production/CoreScreens.tsx>) | 1425–1428 |
| `SupplierMasterTab` | [app/system/production/CoreScreens.tsx](<../../../app/system/production/CoreScreens.tsx>) | 1430–1493 |
| `SupplierEditModal` | [app/system/production/CoreScreens.tsx](<../../../app/system/production/CoreScreens.tsx>) | 1495–1543 |
| `SupplierCreateForm` | [app/system/production/CoreScreens.tsx](<../../../app/system/production/CoreScreens.tsx>) | 1547–1610 |
| `InventoryItemMasterTab` | [app/system/production/CoreScreens.tsx](<../../../app/system/production/CoreScreens.tsx>) | 1612–1627 |
| `InventoryMasterList` | [app/system/production/CoreScreens.tsx](<../../../app/system/production/CoreScreens.tsx>) | 1629–1656 |
| `InventoryItemCreateForm` | [app/system/production/CoreScreens.tsx](<../../../app/system/production/CoreScreens.tsx>) | 1658–1698 |
| `ChoiceSelect` | [app/system/production/CoreScreens.tsx](<../../../app/system/production/CoreScreens.tsx>) | 1709–1727 |
| `employeeDuration` | [app/system/production/CoreScreens.tsx](<../../../app/system/production/CoreScreens.tsx>) | 1736–1747 |
| `EmployeeMasterTab` | [app/system/production/CoreScreens.tsx](<../../../app/system/production/CoreScreens.tsx>) | 1749–1854 |
| `EmployeeModal` | [app/system/production/CoreScreens.tsx](<../../../app/system/production/CoreScreens.tsx>) | 1856–1916 |
| `TeamReferenceTab` | [app/system/production/CoreScreens.tsx](<../../../app/system/production/CoreScreens.tsx>) | 1920–1936 |
| `UserRoleModal` | [app/system/production/CoreScreens.tsx](<../../../app/system/production/CoreScreens.tsx>) | 1938–2037 |
| `EMPTY_PAGE` | [app/system/production/AdminAnalyticsScreens.tsx](<../../../app/system/production/AdminAnalyticsScreens.tsx>) | 183–183 |
| `toError` | [app/system/production/AdminAnalyticsScreens.tsx](<../../../app/system/production/AdminAnalyticsScreens.tsx>) | 184–184 |
| `formatMoney` | [app/system/production/AdminAnalyticsScreens.tsx](<../../../app/system/production/AdminAnalyticsScreens.tsx>) | 185–185 |
| `formatNumber` | [app/system/production/AdminAnalyticsScreens.tsx](<../../../app/system/production/AdminAnalyticsScreens.tsx>) | 186–186 |
| `formatPercent` | [app/system/production/AdminAnalyticsScreens.tsx](<../../../app/system/production/AdminAnalyticsScreens.tsx>) | 187–187 |
| `formatDate` | [app/system/production/AdminAnalyticsScreens.tsx](<../../../app/system/production/AdminAnalyticsScreens.tsx>) | 188–190 |
| `formatDateTime` | [app/system/production/AdminAnalyticsScreens.tsx](<../../../app/system/production/AdminAnalyticsScreens.tsx>) | 191–193 |
| `businessDate` | [app/system/production/AdminAnalyticsScreens.tsx](<../../../app/system/production/AdminAnalyticsScreens.tsx>) | 194–198 |
| `today` | [app/system/production/AdminAnalyticsScreens.tsx](<../../../app/system/production/AdminAnalyticsScreens.tsx>) | 199–199 |
| `yearAgo` | [app/system/production/AdminAnalyticsScreens.tsx](<../../../app/system/production/AdminAnalyticsScreens.tsx>) | 200–200 |
| `query` | [app/system/production/AdminAnalyticsScreens.tsx](<../../../app/system/production/AdminAnalyticsScreens.tsx>) | 201–208 |
| `LoadError` | [app/system/production/AdminAnalyticsScreens.tsx](<../../../app/system/production/AdminAnalyticsScreens.tsx>) | 210–218 |
| `PermissionNotice` | [app/system/production/AdminAnalyticsScreens.tsx](<../../../app/system/production/AdminAnalyticsScreens.tsx>) | 220–226 |
| `ProductionCustomers` | [app/system/production/AdminAnalyticsScreens.tsx](<../../../app/system/production/AdminAnalyticsScreens.tsx>) | 228–302 |
| `CustomerContactsModal` | [app/system/production/AdminAnalyticsScreens.tsx](<../../../app/system/production/AdminAnalyticsScreens.tsx>) | 318–482 |
| `LocalizedNameStack` | [app/system/production/AdminAnalyticsScreens.tsx](<../../../app/system/production/AdminAnalyticsScreens.tsx>) | 483–487 |
| `CustomerModal` | [app/system/production/AdminAnalyticsScreens.tsx](<../../../app/system/production/AdminAnalyticsScreens.tsx>) | 489–604 |
| `ProductionReports` | [app/system/production/AdminAnalyticsScreens.tsx](<../../../app/system/production/AdminAnalyticsScreens.tsx>) | 608–701 |
| `InventoryReportView` | [app/system/production/AdminAnalyticsScreens.tsx](<../../../app/system/production/AdminAnalyticsScreens.tsx>) | 703–718 |
| `SupplierReportView` | [app/system/production/AdminAnalyticsScreens.tsx](<../../../app/system/production/AdminAnalyticsScreens.tsx>) | 720–727 |
| `PrCycleReportView` | [app/system/production/AdminAnalyticsScreens.tsx](<../../../app/system/production/AdminAnalyticsScreens.tsx>) | 729–743 |
| `ProjectCostReportView` | [app/system/production/AdminAnalyticsScreens.tsx](<../../../app/system/production/AdminAnalyticsScreens.tsx>) | 745–767 |
| `ProductionEngineeringRates` | [app/system/production/AdminAnalyticsScreens.tsx](<../../../app/system/production/AdminAnalyticsScreens.tsx>) | 769–806 |
| `CreateRateModal` | [app/system/production/AdminAnalyticsScreens.tsx](<../../../app/system/production/AdminAnalyticsScreens.tsx>) | 808–845 |
| `ProductionAuditLog` | [app/system/production/AdminAnalyticsScreens.tsx](<../../../app/system/production/AdminAnalyticsScreens.tsx>) | 847–882 |
| `StorageCheckPanel` | [app/system/production/AdminAnalyticsScreens.tsx](<../../../app/system/production/AdminAnalyticsScreens.tsx>) | 886–969 |
| `ProductionSettings` | [app/system/production/AdminAnalyticsScreens.tsx](<../../../app/system/production/AdminAnalyticsScreens.tsx>) | 971–992 |

## Domain helpers / direct dependencies

- [backend-node/src/engineering-rate-access.ts](<../../../backend-node/src/engineering-rate-access.ts>)
- [backend-node/src/user-roles.ts](<../../../backend-node/src/user-roles.ts>)
- [backend-node/src/routes/sales-customers.ts](<../../../backend-node/src/routes/sales-customers.ts>)
- [app/system/i18n.ts](<../../../app/system/i18n.ts>)
- [app/system/LocalizedText.tsx](<../../../app/system/LocalizedText.tsx>)
- [app/system/api-client.ts](<../../../app/system/api-client.ts>)
- [app/system/project-overview-client.ts](<../../../app/system/project-overview-client.ts>)
- [app/system/production/ProjectPortfolioGantt.tsx](<../../../app/system/production/ProjectPortfolioGantt.tsx>)
- [app/system/use-activity-presence.ts](<../../../app/system/use-activity-presence.ts>)
- [lib/project-portfolio.ts](<../../../lib/project-portfolio.ts>)
- [backend-node/src/project-lifecycle.ts](<../../../backend-node/src/project-lifecycle.ts>)
- [app/system/production/EndUserCompanyField.tsx](<../../../app/system/production/EndUserCompanyField.tsx>)
- [app/system/production/ProjectPlanFields.tsx](<../../../app/system/production/ProjectPlanFields.tsx>)
- [app/system/production/AdminAnalyticsScreens.tsx](<../../../app/system/production/AdminAnalyticsScreens.tsx>)
- [app/system/production/SearchSelect.tsx](<../../../app/system/production/SearchSelect.tsx>)
- [app/system/production/BusinessCardScanner.tsx](<../../../app/system/production/BusinessCardScanner.tsx>)
- [lib/business-card.ts](<../../../lib/business-card.ts>)
- [lib/supplier-code.ts](<../../../lib/supplier-code.ts>)
- [app/system/production/master-data.css](<../../../app/system/production/master-data.css>)
- [app/system/segment-filters.css](<../../../app/system/segment-filters.css>)
- [app/system/production/project-portfolio.css](<../../../app/system/production/project-portfolio.css>)
- [app/system/ui.tsx](<../../../app/system/ui.tsx>)
- [app/system/production/customer-localized-names.ts](<../../../app/system/production/customer-localized-names.ts>)

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
- [backend-node/tests/estimate-admin-self-decision.test.ts](<../../../backend-node/tests/estimate-admin-self-decision.test.ts>)
- [backend-node/tests/sales-customers.test.ts](<../../../backend-node/tests/sales-customers.test.ts>)

## Client contract lookup

Search the selected API path or function in [app/system/api-client.ts](<../../../app/system/api-client.ts>); follow its screen callers. Common UI/language changes require [app/system/ui.tsx](<../../../app/system/ui.tsx>) and [app/system/i18n.ts](<../../../app/system/i18n.ts>). For SQL changes use [schema map](../SCHEMA.md).
