# Dashboard / Executive

[Context index](../../../AGENTS.md) · [Architecture](../ARCHITECTURE.md) · [Change guide](../WORKFLOW.md)

ภาพรวมผู้บริหารและข้อมูลทีม

Evidence: snapshot `0ede4efb`; source map, not a live availability claim. Test candidates use filename matching and are not exhaustive coverage.

## Read only the operation you change

- [executive-dashboard API and function map](../api/executive-dashboard.md) — registered in Node app

## UI function locator

Shared screens contain other modules: use the symbol and line range instead of reading the whole file.

| Symbol | Source | Lines |
|---|---|---|
| `ExecutiveDashboard` | [app/system/production/ExecutiveDashboard.tsx](<../../../app/system/production/ExecutiveDashboard.tsx>) | 14–143 |
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

## Domain helpers / direct dependencies

- [backend-node/src/user-roles.ts](<../../../backend-node/src/user-roles.ts>)
- [backend-node/src/schedule-service.ts](<../../../backend-node/src/schedule-service.ts>)
- [backend-node/src/project-overview.ts](<../../../backend-node/src/project-overview.ts>)
- [backend-node/src/project-health.ts](<../../../backend-node/src/project-health.ts>)
- [backend-node/src/executive-dashboard-model.ts](<../../../backend-node/src/executive-dashboard-model.ts>)
- [app/system/api-client.ts](<../../../app/system/api-client.ts>)
- [app/system/i18n.ts](<../../../app/system/i18n.ts>)
- [app/system/ui.tsx](<../../../app/system/ui.tsx>)
- [app/system/production/executive-metrics.ts](<../../../app/system/production/executive-metrics.ts>)
- [app/system/production/executive-dashboard.css](<../../../app/system/production/executive-dashboard.css>)
- [app/system/LocalizedText.tsx](<../../../app/system/LocalizedText.tsx>)
- [app/system/project-overview-client.ts](<../../../app/system/project-overview-client.ts>)
- [app/system/production/ProjectPortfolioGantt.tsx](<../../../app/system/production/ProjectPortfolioGantt.tsx>)
- [app/system/use-activity-presence.ts](<../../../app/system/use-activity-presence.ts>)
- [lib/project-portfolio.ts](<../../../lib/project-portfolio.ts>)
- [backend-node/src/project-lifecycle.ts](<../../../backend-node/src/project-lifecycle.ts>)
- [app/system/production/EndUserCompanyField.tsx](<../../../app/system/production/EndUserCompanyField.tsx>)
- [app/system/production/ProjectPlanFields.tsx](<../../../app/system/production/ProjectPlanFields.tsx>)
- [app/system/production/AdminAnalyticsScreens.tsx](<../../../app/system/production/AdminAnalyticsScreens.tsx>)
- [app/system/production/SearchSelect.tsx](<../../../app/system/production/SearchSelect.tsx>)
- [backend-node/src/engineering-rate-access.ts](<../../../backend-node/src/engineering-rate-access.ts>)
- [app/system/production/BusinessCardScanner.tsx](<../../../app/system/production/BusinessCardScanner.tsx>)
- [lib/business-card.ts](<../../../lib/business-card.ts>)
- [lib/supplier-code.ts](<../../../lib/supplier-code.ts>)
- [app/system/production/master-data.css](<../../../app/system/production/master-data.css>)
- [app/system/segment-filters.css](<../../../app/system/segment-filters.css>)
- [app/system/production/project-portfolio.css](<../../../app/system/production/project-portfolio.css>)

## Candidate regression tests

- [tests/executive-dashboard.test.mjs](<../../../tests/executive-dashboard.test.mjs>)
- [backend-node/tests/executive-dashboard.test.ts](<../../../backend-node/tests/executive-dashboard.test.ts>)

## Client contract lookup

Search the selected API path or function in [app/system/api-client.ts](<../../../app/system/api-client.ts>); follow its screen callers. Common UI/language changes require [app/system/ui.tsx](<../../../app/system/ui.tsx>) and [app/system/i18n.ts](<../../../app/system/i18n.ts>). For SQL changes use [schema map](../SCHEMA.md).
