# Inventory / Receiving / Issues

[Context index](../../../AGENTS.md) · [Architecture](../ARCHITECTURE.md) · [Change guide](../WORKFLOW.md)

รับของ เบิกของ stock ledger และการควบคุมยอด

Evidence: snapshot `878a3653`; source map, not a live availability claim. Test candidates use filename matching and are not exhaustive coverage.

## Read only the operation you change

- [inventory API and function map](../api/inventory.md) — registered in Node app
- [goods-receipts API and function map](../api/goods-receipts.md) — registered in Node app
- [material-issues API and function map](../api/material-issues.md) — registered in Node app
- [stock-control API and function map](../api/stock-control.md) — registered in Node app

## UI function locator

Shared screens contain other modules: use the symbol and line range instead of reading the whole file.

| Symbol | Source | Lines |
|---|---|---|
| `toError` | [app/system/production/MaterialScreens.tsx](<../../../app/system/production/MaterialScreens.tsx>) | 465–465 |
| `body` | [app/system/production/MaterialScreens.tsx](<../../../app/system/production/MaterialScreens.tsx>) | 466–466 |
| `money` | [app/system/production/MaterialScreens.tsx](<../../../app/system/production/MaterialScreens.tsx>) | 467–467 |
| `quantity` | [app/system/production/MaterialScreens.tsx](<../../../app/system/production/MaterialScreens.tsx>) | 468–468 |
| `date` | [app/system/production/MaterialScreens.tsx](<../../../app/system/production/MaterialScreens.tsx>) | 469–469 |
| `dateTime` | [app/system/production/MaterialScreens.tsx](<../../../app/system/production/MaterialScreens.tsx>) | 470–470 |
| `isoDate` | [app/system/production/MaterialScreens.tsx](<../../../app/system/production/MaterialScreens.tsx>) | 472–472 |
| `contains` | [app/system/production/MaterialScreens.tsx](<../../../app/system/production/MaterialScreens.tsx>) | 473–473 |
| `hasPermission` | [app/system/production/MaterialScreens.tsx](<../../../app/system/production/MaterialScreens.tsx>) | 474–474 |
| `isOpenPurchaseOrder` | [app/system/production/MaterialScreens.tsx](<../../../app/system/production/MaterialScreens.tsx>) | 475–477 |
| `LoadError` | [app/system/production/MaterialScreens.tsx](<../../../app/system/production/MaterialScreens.tsx>) | 479–487 |
| `ActionError` | [app/system/production/MaterialScreens.tsx](<../../../app/system/production/MaterialScreens.tsx>) | 489–491 |
| `Loading` | [app/system/production/MaterialScreens.tsx](<../../../app/system/production/MaterialScreens.tsx>) | 493–495 |
| `RefreshButton` | [app/system/production/MaterialScreens.tsx](<../../../app/system/production/MaterialScreens.tsx>) | 497–499 |
| `StatusBadge` | [app/system/production/MaterialScreens.tsx](<../../../app/system/production/MaterialScreens.tsx>) | 510–513 |
| `RowAction` | [app/system/production/MaterialScreens.tsx](<../../../app/system/production/MaterialScreens.tsx>) | 516–519 |
| `StatusSummary` | [app/system/production/MaterialScreens.tsx](<../../../app/system/production/MaterialScreens.tsx>) | 522–535 |
| `CommentPrompt` | [app/system/production/MaterialScreens.tsx](<../../../app/system/production/MaterialScreens.tsx>) | 537–567 |
| `ProductionProcurementDashboard` | [app/system/production/MaterialScreens.tsx](<../../../app/system/production/MaterialScreens.tsx>) | 569–612 |
| `ProductionBoms` | [app/system/production/MaterialScreens.tsx](<../../../app/system/production/MaterialScreens.tsx>) | 615–665 |
| `BomDetailModal` | [app/system/production/MaterialScreens.tsx](<../../../app/system/production/MaterialScreens.tsx>) | 667–718 |
| `ReserveStockModal` | [app/system/production/MaterialScreens.tsx](<../../../app/system/production/MaterialScreens.tsx>) | 720–737 |
| `GenerateBomModal` | [app/system/production/MaterialScreens.tsx](<../../../app/system/production/MaterialScreens.tsx>) | 739–763 |
| `prStatusLabel` | [app/system/production/MaterialScreens.tsx](<../../../app/system/production/MaterialScreens.tsx>) | 770–770 |
| `ProductionPurchaseRequisitions` | [app/system/production/MaterialScreens.tsx](<../../../app/system/production/MaterialScreens.tsx>) | 772–901 |
| `ErpCell` | [app/system/production/MaterialScreens.tsx](<../../../app/system/production/MaterialScreens.tsx>) | 909–917 |
| `LineErp` | [app/system/production/MaterialScreens.tsx](<../../../app/system/production/MaterialScreens.tsx>) | 923–932 |
| `PrDetailModal` | [app/system/production/MaterialScreens.tsx](<../../../app/system/production/MaterialScreens.tsx>) | 934–1098 |
| `ProductionPurchaseOrders` | [app/system/production/MaterialScreens.tsx](<../../../app/system/production/MaterialScreens.tsx>) | 1100–1128 |
| `PoDetailModal` | [app/system/production/MaterialScreens.tsx](<../../../app/system/production/MaterialScreens.tsx>) | 1130–1139 |
| `CreateGrnModal` | [app/system/production/MaterialScreens.tsx](<../../../app/system/production/MaterialScreens.tsx>) | 1155–1220 |
| `ProductionGoodsReceiving` | [app/system/production/MaterialScreens.tsx](<../../../app/system/production/MaterialScreens.tsx>) | 1222–1257 |
| `GrnDetailModal` | [app/system/production/MaterialScreens.tsx](<../../../app/system/production/MaterialScreens.tsx>) | 1259–1268 |
| `ProductionMaterialIssues` | [app/system/production/MaterialScreens.tsx](<../../../app/system/production/MaterialScreens.tsx>) | 1272–1318 |
| `CreateMirModal` | [app/system/production/MaterialScreens.tsx](<../../../app/system/production/MaterialScreens.tsx>) | 1322–1362 |
| `MirDetailModal` | [app/system/production/MaterialScreens.tsx](<../../../app/system/production/MaterialScreens.tsx>) | 1364–1377 |
| `ReturnMaterialModal` | [app/system/production/MaterialScreens.tsx](<../../../app/system/production/MaterialScreens.tsx>) | 1379–1395 |
| `ProductionApprovals` | [app/system/production/MaterialScreens.tsx](<../../../app/system/production/MaterialScreens.tsx>) | 1404–1451 |
| `ProductionInventoryOperations` | [app/system/production/MaterialScreens.tsx](<../../../app/system/production/MaterialScreens.tsx>) | 1453–1486 |
| `CreateAdjustmentModal` | [app/system/production/MaterialScreens.tsx](<../../../app/system/production/MaterialScreens.tsx>) | 1488–1511 |
| `ReleaseQuarantineModal` | [app/system/production/MaterialScreens.tsx](<../../../app/system/production/MaterialScreens.tsx>) | 1513–1534 |
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

## Domain helpers / direct dependencies

- [backend-node/src/document-number.ts](<../../../backend-node/src/document-number.ts>)
- [backend-node/src/material-audit.ts](<../../../backend-node/src/material-audit.ts>)
- [backend-node/src/project-scope.ts](<../../../backend-node/src/project-scope.ts>)
- [backend-node/src/stock-ledger.ts](<../../../backend-node/src/stock-ledger.ts>)
- [backend-node/src/site-visit-common.ts](<../../../backend-node/src/site-visit-common.ts>)
- [app/system/dialogs.ts](<../../../app/system/dialogs.ts>)
- [app/system/screen-link.ts](<../../../app/system/screen-link.ts>)
- [app/system/i18n.ts](<../../../app/system/i18n.ts>)
- [app/system/LocalizedText.tsx](<../../../app/system/LocalizedText.tsx>)
- [app/system/production/HistoricalPrPanel.tsx](<../../../app/system/production/HistoricalPrPanel.tsx>)
- [app/system/production/PurchaseRequestEditor.tsx](<../../../app/system/production/PurchaseRequestEditor.tsx>)
- [app/system/production/PurchaseUnitsPanel.tsx](<../../../app/system/production/PurchaseUnitsPanel.tsx>)
- [app/system/project-overview-client.ts](<../../../app/system/project-overview-client.ts>)
- [lib/estimate-ux.ts](<../../../lib/estimate-ux.ts>)
- [lib/bom-sheet.ts](<../../../lib/bom-sheet.ts>)
- [lib/request-list-sheet.ts](<../../../lib/request-list-sheet.ts>)
- [lib/export-xlsx.ts](<../../../lib/export-xlsx.ts>)
- [app/system/api-client.ts](<../../../app/system/api-client.ts>)
- [app/system/production/material-endpoint.ts](<../../../app/system/production/material-endpoint.ts>)
- [app/system/ui.tsx](<../../../app/system/ui.tsx>)
- [app/system/DateInput.tsx](<../../../app/system/DateInput.tsx>)
- [app/system/production/pegasus-skin.css](<../../../app/system/production/pegasus-skin.css>)
- [app/system/production/ProjectPortfolioGantt.tsx](<../../../app/system/production/ProjectPortfolioGantt.tsx>)
- [app/system/use-activity-presence.ts](<../../../app/system/use-activity-presence.ts>)
- [lib/project-portfolio.ts](<../../../lib/project-portfolio.ts>)
- [backend-node/src/project-lifecycle.ts](<../../../backend-node/src/project-lifecycle.ts>)
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

## Candidate regression tests

- [backend-node/tests/knowledge-sales-materials.test.ts](<../../../backend-node/tests/knowledge-sales-materials.test.ts>)

## Client contract lookup

Search the selected API path or function in [app/system/api-client.ts](<../../../app/system/api-client.ts>); follow its screen callers. Common UI/language changes require [app/system/ui.tsx](<../../../app/system/ui.tsx>) and [app/system/i18n.ts](<../../../app/system/i18n.ts>). For SQL changes use [schema map](../SCHEMA.md).
