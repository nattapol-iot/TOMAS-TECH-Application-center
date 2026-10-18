# Inventory / Receiving / Issues

[Context index](../../../AGENTS.md) · [Architecture](../ARCHITECTURE.md) · [Change guide](../WORKFLOW.md)

รับของ เบิกของ stock ledger และการควบคุมยอด

Evidence: snapshot `7169175d`; source map, not a live availability claim. Test candidates use filename matching and are not exhaustive coverage.

## Read only the operation you change

- [inventory API and function map](../api/inventory.md) — registered in Node app
- [goods-receipts API and function map](../api/goods-receipts.md) — registered in Node app
- [material-issues API and function map](../api/material-issues.md) — registered in Node app
- [stock-control API and function map](../api/stock-control.md) — registered in Node app

## UI function locator

Shared screens contain other modules: use the symbol and line range instead of reading the whole file.

| Symbol | Source | Lines |
|---|---|---|
| `toError` | [app/system/production/MaterialScreens.tsx](<../../../app/system/production/MaterialScreens.tsx>) | 421–421 |
| `body` | [app/system/production/MaterialScreens.tsx](<../../../app/system/production/MaterialScreens.tsx>) | 422–422 |
| `money` | [app/system/production/MaterialScreens.tsx](<../../../app/system/production/MaterialScreens.tsx>) | 423–423 |
| `quantity` | [app/system/production/MaterialScreens.tsx](<../../../app/system/production/MaterialScreens.tsx>) | 424–424 |
| `date` | [app/system/production/MaterialScreens.tsx](<../../../app/system/production/MaterialScreens.tsx>) | 425–425 |
| `dateTime` | [app/system/production/MaterialScreens.tsx](<../../../app/system/production/MaterialScreens.tsx>) | 426–426 |
| `isoDate` | [app/system/production/MaterialScreens.tsx](<../../../app/system/production/MaterialScreens.tsx>) | 428–428 |
| `contains` | [app/system/production/MaterialScreens.tsx](<../../../app/system/production/MaterialScreens.tsx>) | 429–429 |
| `hasPermission` | [app/system/production/MaterialScreens.tsx](<../../../app/system/production/MaterialScreens.tsx>) | 430–430 |
| `isOpenPurchaseOrder` | [app/system/production/MaterialScreens.tsx](<../../../app/system/production/MaterialScreens.tsx>) | 431–433 |
| `LoadError` | [app/system/production/MaterialScreens.tsx](<../../../app/system/production/MaterialScreens.tsx>) | 435–443 |
| `ActionError` | [app/system/production/MaterialScreens.tsx](<../../../app/system/production/MaterialScreens.tsx>) | 445–447 |
| `Loading` | [app/system/production/MaterialScreens.tsx](<../../../app/system/production/MaterialScreens.tsx>) | 449–451 |
| `RefreshButton` | [app/system/production/MaterialScreens.tsx](<../../../app/system/production/MaterialScreens.tsx>) | 453–455 |
| `CommentPrompt` | [app/system/production/MaterialScreens.tsx](<../../../app/system/production/MaterialScreens.tsx>) | 457–487 |
| `ProductionProcurementDashboard` | [app/system/production/MaterialScreens.tsx](<../../../app/system/production/MaterialScreens.tsx>) | 489–532 |
| `ProductionBoms` | [app/system/production/MaterialScreens.tsx](<../../../app/system/production/MaterialScreens.tsx>) | 534–575 |
| `BomDetailModal` | [app/system/production/MaterialScreens.tsx](<../../../app/system/production/MaterialScreens.tsx>) | 577–588 |
| `ReserveStockModal` | [app/system/production/MaterialScreens.tsx](<../../../app/system/production/MaterialScreens.tsx>) | 590–607 |
| `GenerateBomModal` | [app/system/production/MaterialScreens.tsx](<../../../app/system/production/MaterialScreens.tsx>) | 609–633 |
| `prStatusLabel` | [app/system/production/MaterialScreens.tsx](<../../../app/system/production/MaterialScreens.tsx>) | 639–639 |
| `ProductionPurchaseRequisitions` | [app/system/production/MaterialScreens.tsx](<../../../app/system/production/MaterialScreens.tsx>) | 641–730 |
| `PrDetailModal` | [app/system/production/MaterialScreens.tsx](<../../../app/system/production/MaterialScreens.tsx>) | 734–789 |
| `ErpOrderModal` | [app/system/production/MaterialScreens.tsx](<../../../app/system/production/MaterialScreens.tsx>) | 792–812 |
| `ProductionPurchaseOrders` | [app/system/production/MaterialScreens.tsx](<../../../app/system/production/MaterialScreens.tsx>) | 814–842 |
| `PoDetailModal` | [app/system/production/MaterialScreens.tsx](<../../../app/system/production/MaterialScreens.tsx>) | 844–853 |
| `CreateGrnModal` | [app/system/production/MaterialScreens.tsx](<../../../app/system/production/MaterialScreens.tsx>) | 869–934 |
| `ProductionGoodsReceiving` | [app/system/production/MaterialScreens.tsx](<../../../app/system/production/MaterialScreens.tsx>) | 936–971 |
| `GrnDetailModal` | [app/system/production/MaterialScreens.tsx](<../../../app/system/production/MaterialScreens.tsx>) | 973–982 |
| `ProductionMaterialIssues` | [app/system/production/MaterialScreens.tsx](<../../../app/system/production/MaterialScreens.tsx>) | 986–1032 |
| `CreateMirModal` | [app/system/production/MaterialScreens.tsx](<../../../app/system/production/MaterialScreens.tsx>) | 1036–1076 |
| `MirDetailModal` | [app/system/production/MaterialScreens.tsx](<../../../app/system/production/MaterialScreens.tsx>) | 1078–1091 |
| `ReturnMaterialModal` | [app/system/production/MaterialScreens.tsx](<../../../app/system/production/MaterialScreens.tsx>) | 1093–1109 |
| `ProductionApprovals` | [app/system/production/MaterialScreens.tsx](<../../../app/system/production/MaterialScreens.tsx>) | 1118–1161 |
| `ProductionInventoryOperations` | [app/system/production/MaterialScreens.tsx](<../../../app/system/production/MaterialScreens.tsx>) | 1163–1196 |
| `CreateAdjustmentModal` | [app/system/production/MaterialScreens.tsx](<../../../app/system/production/MaterialScreens.tsx>) | 1198–1221 |
| `ReleaseQuarantineModal` | [app/system/production/MaterialScreens.tsx](<../../../app/system/production/MaterialScreens.tsx>) | 1223–1244 |
| `toError` | [app/system/production/CoreScreens.tsx](<../../../app/system/production/CoreScreens.tsx>) | 106–106 |
| `formText` | [app/system/production/CoreScreens.tsx](<../../../app/system/production/CoreScreens.tsx>) | 107–107 |
| `optionalFormText` | [app/system/production/CoreScreens.tsx](<../../../app/system/production/CoreScreens.tsx>) | 108–108 |
| `formNumber` | [app/system/production/CoreScreens.tsx](<../../../app/system/production/CoreScreens.tsx>) | 109–109 |
| `formatDate` | [app/system/production/CoreScreens.tsx](<../../../app/system/production/CoreScreens.tsx>) | 110–110 |
| `formatDateTime` | [app/system/production/CoreScreens.tsx](<../../../app/system/production/CoreScreens.tsx>) | 111–111 |
| `formatMoney` | [app/system/production/CoreScreens.tsx](<../../../app/system/production/CoreScreens.tsx>) | 112–112 |
| `businessDate` | [app/system/production/CoreScreens.tsx](<../../../app/system/production/CoreScreens.tsx>) | 114–123 |
| `futureDate` | [app/system/production/CoreScreens.tsx](<../../../app/system/production/CoreScreens.tsx>) | 124–124 |
| `today` | [app/system/production/CoreScreens.tsx](<../../../app/system/production/CoreScreens.tsx>) | 125–125 |
| `formatFileSize` | [app/system/production/CoreScreens.tsx](<../../../app/system/production/CoreScreens.tsx>) | 144–155 |
| `LoadError` | [app/system/production/CoreScreens.tsx](<../../../app/system/production/CoreScreens.tsx>) | 157–165 |
| `dashboardDateKey` | [app/system/production/CoreScreens.tsx](<../../../app/system/production/CoreScreens.tsx>) | 198–198 |
| `dashboardDayDistance` | [app/system/production/CoreScreens.tsx](<../../../app/system/production/CoreScreens.tsx>) | 199–203 |
| `dashboardDueDate` | [app/system/production/CoreScreens.tsx](<../../../app/system/production/CoreScreens.tsx>) | 205–205 |
| `dashboardClampedDate` | [app/system/production/CoreScreens.tsx](<../../../app/system/production/CoreScreens.tsx>) | 206–209 |
| `dashboardTenure` | [app/system/production/CoreScreens.tsx](<../../../app/system/production/CoreScreens.tsx>) | 210–234 |
| `dashboardTaskTone` | [app/system/production/CoreScreens.tsx](<../../../app/system/production/CoreScreens.tsx>) | 235–241 |
| `ProductionDashboard` | [app/system/production/CoreScreens.tsx](<../../../app/system/production/CoreScreens.tsx>) | 243–480 |
| `formatDay` | [app/system/production/CoreScreens.tsx](<../../../app/system/production/CoreScreens.tsx>) | 489–489 |
| `PortfolioSortHeader` | [app/system/production/CoreScreens.tsx](<../../../app/system/production/CoreScreens.tsx>) | 491–497 |
| `PortfolioProgress` | [app/system/production/CoreScreens.tsx](<../../../app/system/production/CoreScreens.tsx>) | 500–512 |
| `RowDisclosure` | [app/system/production/CoreScreens.tsx](<../../../app/system/production/CoreScreens.tsx>) | 520–568 |
| `CloseProjectModal` | [app/system/production/CoreScreens.tsx](<../../../app/system/production/CoreScreens.tsx>) | 572–585 |
| `portfolioModeStorageKey` | [app/system/production/CoreScreens.tsx](<../../../app/system/production/CoreScreens.tsx>) | 592–592 |
| `ProductionProjects` | [app/system/production/CoreScreens.tsx](<../../../app/system/production/CoreScreens.tsx>) | 594–797 |
| `DeleteProjectModal` | [app/system/production/CoreScreens.tsx](<../../../app/system/production/CoreScreens.tsx>) | 801–820 |
| `ProjectMembersModal` | [app/system/production/CoreScreens.tsx](<../../../app/system/production/CoreScreens.tsx>) | 822–899 |
| `planRowLocked` | [app/system/production/CoreScreens.tsx](<../../../app/system/production/CoreScreens.tsx>) | 906–906 |
| `EditProjectModal` | [app/system/production/CoreScreens.tsx](<../../../app/system/production/CoreScreens.tsx>) | 910–1052 |
| `ProjectDocumentsModal` | [app/system/production/CoreScreens.tsx](<../../../app/system/production/CoreScreens.tsx>) | 1053–1201 |
| `CreateProjectModal` | [app/system/production/CoreScreens.tsx](<../../../app/system/production/CoreScreens.tsx>) | 1214–1327 |
| `ProductionInventory` | [app/system/production/CoreScreens.tsx](<../../../app/system/production/CoreScreens.tsx>) | 1329–1346 |
| `ProductionMasterData` | [app/system/production/CoreScreens.tsx](<../../../app/system/production/CoreScreens.tsx>) | 1350–1382 |
| `useMasterForm` | [app/system/production/CoreScreens.tsx](<../../../app/system/production/CoreScreens.tsx>) | 1386–1416 |
| `MasterFormError` | [app/system/production/CoreScreens.tsx](<../../../app/system/production/CoreScreens.tsx>) | 1418–1421 |
| `SupplierMasterTab` | [app/system/production/CoreScreens.tsx](<../../../app/system/production/CoreScreens.tsx>) | 1423–1486 |
| `SupplierEditModal` | [app/system/production/CoreScreens.tsx](<../../../app/system/production/CoreScreens.tsx>) | 1488–1536 |
| `SupplierCreateForm` | [app/system/production/CoreScreens.tsx](<../../../app/system/production/CoreScreens.tsx>) | 1540–1603 |
| `InventoryItemMasterTab` | [app/system/production/CoreScreens.tsx](<../../../app/system/production/CoreScreens.tsx>) | 1605–1620 |
| `InventoryMasterList` | [app/system/production/CoreScreens.tsx](<../../../app/system/production/CoreScreens.tsx>) | 1622–1649 |
| `InventoryItemCreateForm` | [app/system/production/CoreScreens.tsx](<../../../app/system/production/CoreScreens.tsx>) | 1651–1691 |
| `ChoiceSelect` | [app/system/production/CoreScreens.tsx](<../../../app/system/production/CoreScreens.tsx>) | 1702–1720 |
| `employeeDuration` | [app/system/production/CoreScreens.tsx](<../../../app/system/production/CoreScreens.tsx>) | 1729–1740 |
| `EmployeeMasterTab` | [app/system/production/CoreScreens.tsx](<../../../app/system/production/CoreScreens.tsx>) | 1742–1847 |
| `EmployeeModal` | [app/system/production/CoreScreens.tsx](<../../../app/system/production/CoreScreens.tsx>) | 1849–1909 |
| `TeamReferenceTab` | [app/system/production/CoreScreens.tsx](<../../../app/system/production/CoreScreens.tsx>) | 1913–1929 |
| `UserRoleModal` | [app/system/production/CoreScreens.tsx](<../../../app/system/production/CoreScreens.tsx>) | 1931–2030 |

## Domain helpers / direct dependencies

- [backend-node/src/document-number.ts](<../../../backend-node/src/document-number.ts>)
- [backend-node/src/material-audit.ts](<../../../backend-node/src/material-audit.ts>)
- [backend-node/src/project-scope.ts](<../../../backend-node/src/project-scope.ts>)
- [backend-node/src/stock-ledger.ts](<../../../backend-node/src/stock-ledger.ts>)
- [backend-node/src/site-visit-common.ts](<../../../backend-node/src/site-visit-common.ts>)
- [app/system/i18n.ts](<../../../app/system/i18n.ts>)
- [app/system/LocalizedText.tsx](<../../../app/system/LocalizedText.tsx>)
- [app/system/production/HistoricalPrPanel.tsx](<../../../app/system/production/HistoricalPrPanel.tsx>)
- [app/system/production/PurchaseRequestEditor.tsx](<../../../app/system/production/PurchaseRequestEditor.tsx>)
- [app/system/project-overview-client.ts](<../../../app/system/project-overview-client.ts>)
- [lib/estimate-ux.ts](<../../../lib/estimate-ux.ts>)
- [app/system/api-client.ts](<../../../app/system/api-client.ts>)
- [app/system/production/material-endpoint.ts](<../../../app/system/production/material-endpoint.ts>)
- [app/system/ui.tsx](<../../../app/system/ui.tsx>)
- [app/system/production/ProjectPortfolioGantt.tsx](<../../../app/system/production/ProjectPortfolioGantt.tsx>)
- [app/system/use-activity-presence.ts](<../../../app/system/use-activity-presence.ts>)
- [lib/project-portfolio.ts](<../../../lib/project-portfolio.ts>)
- [backend-node/src/project-lifecycle.ts](<../../../backend-node/src/project-lifecycle.ts>)
- [app/system/production/EndUserCompanyField.tsx](<../../../app/system/production/EndUserCompanyField.tsx>)
- [app/system/production/ProjectPlanFields.tsx](<../../../app/system/production/ProjectPlanFields.tsx>)
- [app/system/production/AdminAnalyticsScreens.tsx](<../../../app/system/production/AdminAnalyticsScreens.tsx>)
- [backend-node/src/engineering-rate-access.ts](<../../../backend-node/src/engineering-rate-access.ts>)
- [app/system/production/BusinessCardScanner.tsx](<../../../app/system/production/BusinessCardScanner.tsx>)
- [lib/business-card.ts](<../../../lib/business-card.ts>)
- [lib/supplier-code.ts](<../../../lib/supplier-code.ts>)
- [app/system/production/master-data.css](<../../../app/system/production/master-data.css>)
- [app/system/segment-filters.css](<../../../app/system/segment-filters.css>)
- [app/system/production/project-portfolio.css](<../../../app/system/production/project-portfolio.css>)

## Candidate regression tests

- [backend-node/tests/knowledge-sales-materials.test.ts](<../../../backend-node/tests/knowledge-sales-materials.test.ts>)

## Client contract lookup

Search the selected API path or function in [app/system/api-client.ts](<../../../app/system/api-client.ts>); follow its screen callers. Common UI/language changes require [app/system/ui.tsx](<../../../app/system/ui.tsx>) and [app/system/i18n.ts](<../../../app/system/i18n.ts>). For SQL changes use [schema map](../SCHEMA.md).
