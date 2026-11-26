# Inventory / Receiving / Issues

[Context index](../../../AGENTS.md) · [Architecture](../ARCHITECTURE.md) · [Change guide](../WORKFLOW.md)

รับของ เบิกของ stock ledger และการควบคุมยอด

Evidence: snapshot `019ed16c`; source map, not a live availability claim. Test candidates use filename matching and are not exhaustive coverage.

## Read only the operation you change

- [inventory API and function map](../api/inventory.md) — registered in Node app
- [goods-receipts API and function map](../api/goods-receipts.md) — registered in Node app
- [material-issues API and function map](../api/material-issues.md) — registered in Node app
- [stock-control API and function map](../api/stock-control.md) — registered in Node app

## UI function locator

Shared screens contain other modules: use the symbol and line range instead of reading the whole file.

| Symbol | Source | Lines |
|---|---|---|
| `toError` | [app/system/production/MaterialScreens.tsx](<../../../app/system/production/MaterialScreens.tsx>) | 474–474 |
| `body` | [app/system/production/MaterialScreens.tsx](<../../../app/system/production/MaterialScreens.tsx>) | 475–475 |
| `money` | [app/system/production/MaterialScreens.tsx](<../../../app/system/production/MaterialScreens.tsx>) | 476–476 |
| `quantity` | [app/system/production/MaterialScreens.tsx](<../../../app/system/production/MaterialScreens.tsx>) | 477–477 |
| `date` | [app/system/production/MaterialScreens.tsx](<../../../app/system/production/MaterialScreens.tsx>) | 478–478 |
| `dateTime` | [app/system/production/MaterialScreens.tsx](<../../../app/system/production/MaterialScreens.tsx>) | 479–479 |
| `isoDate` | [app/system/production/MaterialScreens.tsx](<../../../app/system/production/MaterialScreens.tsx>) | 481–481 |
| `contains` | [app/system/production/MaterialScreens.tsx](<../../../app/system/production/MaterialScreens.tsx>) | 482–482 |
| `hasPermission` | [app/system/production/MaterialScreens.tsx](<../../../app/system/production/MaterialScreens.tsx>) | 483–483 |
| `isOpenPurchaseOrder` | [app/system/production/MaterialScreens.tsx](<../../../app/system/production/MaterialScreens.tsx>) | 484–484 |
| `LoadError` | [app/system/production/MaterialScreens.tsx](<../../../app/system/production/MaterialScreens.tsx>) | 486–502 |
| `ActionError` | [app/system/production/MaterialScreens.tsx](<../../../app/system/production/MaterialScreens.tsx>) | 504–516 |
| `Loading` | [app/system/production/MaterialScreens.tsx](<../../../app/system/production/MaterialScreens.tsx>) | 518–525 |
| `RefreshButton` | [app/system/production/MaterialScreens.tsx](<../../../app/system/production/MaterialScreens.tsx>) | 527–534 |
| `StatusBadge` | [app/system/production/MaterialScreens.tsx](<../../../app/system/production/MaterialScreens.tsx>) | 554–557 |
| `RowAction` | [app/system/production/MaterialScreens.tsx](<../../../app/system/production/MaterialScreens.tsx>) | 560–567 |
| `StatusSummary` | [app/system/production/MaterialScreens.tsx](<../../../app/system/production/MaterialScreens.tsx>) | 570–595 |
| `CommentPrompt` | [app/system/production/MaterialScreens.tsx](<../../../app/system/production/MaterialScreens.tsx>) | 597–643 |
| `ProductionProcurementDashboard` | [app/system/production/MaterialScreens.tsx](<../../../app/system/production/MaterialScreens.tsx>) | 645–770 |
| `ProductionBoms` | [app/system/production/MaterialScreens.tsx](<../../../app/system/production/MaterialScreens.tsx>) | 773–983 |
| `BomDetailModal` | [app/system/production/MaterialScreens.tsx](<../../../app/system/production/MaterialScreens.tsx>) | 985–1200 |
| `ReserveStockModal` | [app/system/production/MaterialScreens.tsx](<../../../app/system/production/MaterialScreens.tsx>) | 1202–1256 |
| `GenerateBomModal` | [app/system/production/MaterialScreens.tsx](<../../../app/system/production/MaterialScreens.tsx>) | 1258–1321 |
| `prStatusLabel` | [app/system/production/MaterialScreens.tsx](<../../../app/system/production/MaterialScreens.tsx>) | 1328–1328 |
| `ProductionPurchaseRequisitions` | [app/system/production/MaterialScreens.tsx](<../../../app/system/production/MaterialScreens.tsx>) | 1330–1737 |
| `ErpCell` | [app/system/production/MaterialScreens.tsx](<../../../app/system/production/MaterialScreens.tsx>) | 1745–1770 |
| `LineErp` | [app/system/production/MaterialScreens.tsx](<../../../app/system/production/MaterialScreens.tsx>) | 1776–1800 |
| `PrDetailModal` | [app/system/production/MaterialScreens.tsx](<../../../app/system/production/MaterialScreens.tsx>) | 1802–2463 |
| `ProductionPurchaseOrders` | [app/system/production/MaterialScreens.tsx](<../../../app/system/production/MaterialScreens.tsx>) | 2465–2605 |
| `PoDetailModal` | [app/system/production/MaterialScreens.tsx](<../../../app/system/production/MaterialScreens.tsx>) | 2607–2696 |
| `CreateGrnModal` | [app/system/production/MaterialScreens.tsx](<../../../app/system/production/MaterialScreens.tsx>) | 2712–2966 |
| `ProductionGoodsReceiving` | [app/system/production/MaterialScreens.tsx](<../../../app/system/production/MaterialScreens.tsx>) | 2968–3120 |
| `GrnDetailModal` | [app/system/production/MaterialScreens.tsx](<../../../app/system/production/MaterialScreens.tsx>) | 3122–3217 |
| `ProductionMaterialIssues` | [app/system/production/MaterialScreens.tsx](<../../../app/system/production/MaterialScreens.tsx>) | 3221–3425 |
| `CreateMirModal` | [app/system/production/MaterialScreens.tsx](<../../../app/system/production/MaterialScreens.tsx>) | 3429–3625 |
| `MirDetailModal` | [app/system/production/MaterialScreens.tsx](<../../../app/system/production/MaterialScreens.tsx>) | 3627–3810 |
| `ReturnMaterialModal` | [app/system/production/MaterialScreens.tsx](<../../../app/system/production/MaterialScreens.tsx>) | 3812–3875 |
| `ProductionApprovals` | [app/system/production/MaterialScreens.tsx](<../../../app/system/production/MaterialScreens.tsx>) | 3884–4160 |
| `ProductionInventoryOperations` | [app/system/production/MaterialScreens.tsx](<../../../app/system/production/MaterialScreens.tsx>) | 4162–4417 |
| `CreateAdjustmentModal` | [app/system/production/MaterialScreens.tsx](<../../../app/system/production/MaterialScreens.tsx>) | 4419–4491 |
| `ReleaseQuarantineModal` | [app/system/production/MaterialScreens.tsx](<../../../app/system/production/MaterialScreens.tsx>) | 4493–4559 |
| `toError` | [app/system/production/CoreScreens.tsx](<../../../app/system/production/CoreScreens.tsx>) | 142–142 |
| `formText` | [app/system/production/CoreScreens.tsx](<../../../app/system/production/CoreScreens.tsx>) | 143–143 |
| `optionalFormText` | [app/system/production/CoreScreens.tsx](<../../../app/system/production/CoreScreens.tsx>) | 144–144 |
| `formNumber` | [app/system/production/CoreScreens.tsx](<../../../app/system/production/CoreScreens.tsx>) | 145–145 |
| `formatDate` | [app/system/production/CoreScreens.tsx](<../../../app/system/production/CoreScreens.tsx>) | 146–146 |
| `formatDateTime` | [app/system/production/CoreScreens.tsx](<../../../app/system/production/CoreScreens.tsx>) | 147–147 |
| `formatMoney` | [app/system/production/CoreScreens.tsx](<../../../app/system/production/CoreScreens.tsx>) | 148–148 |
| `businessDate` | [app/system/production/CoreScreens.tsx](<../../../app/system/production/CoreScreens.tsx>) | 150–159 |
| `futureDate` | [app/system/production/CoreScreens.tsx](<../../../app/system/production/CoreScreens.tsx>) | 160–160 |
| `today` | [app/system/production/CoreScreens.tsx](<../../../app/system/production/CoreScreens.tsx>) | 161–161 |
| `formatFileSize` | [app/system/production/CoreScreens.tsx](<../../../app/system/production/CoreScreens.tsx>) | 163–174 |
| `LoadError` | [app/system/production/CoreScreens.tsx](<../../../app/system/production/CoreScreens.tsx>) | 176–192 |
| `dashboardDateKey` | [app/system/production/CoreScreens.tsx](<../../../app/system/production/CoreScreens.tsx>) | 223–223 |
| `dashboardDayDistance` | [app/system/production/CoreScreens.tsx](<../../../app/system/production/CoreScreens.tsx>) | 224–228 |
| `dashboardDueDate` | [app/system/production/CoreScreens.tsx](<../../../app/system/production/CoreScreens.tsx>) | 230–230 |
| `dashboardClampedDate` | [app/system/production/CoreScreens.tsx](<../../../app/system/production/CoreScreens.tsx>) | 231–234 |
| `dashboardTenure` | [app/system/production/CoreScreens.tsx](<../../../app/system/production/CoreScreens.tsx>) | 235–259 |
| `dashboardTaskTone` | [app/system/production/CoreScreens.tsx](<../../../app/system/production/CoreScreens.tsx>) | 260–266 |
| `ProductionDashboard` | [app/system/production/CoreScreens.tsx](<../../../app/system/production/CoreScreens.tsx>) | 268–721 |
| `formatDay` | [app/system/production/CoreScreens.tsx](<../../../app/system/production/CoreScreens.tsx>) | 731–731 |
| `formatHours` | [app/system/production/CoreScreens.tsx](<../../../app/system/production/CoreScreens.tsx>) | 734–734 |
| `RowDisclosure` | [app/system/production/CoreScreens.tsx](<../../../app/system/production/CoreScreens.tsx>) | 742–853 |
| `CloseProjectModal` | [app/system/production/CoreScreens.tsx](<../../../app/system/production/CoreScreens.tsx>) | 857–895 |
| `ProductionProjects` | [app/system/production/CoreScreens.tsx](<../../../app/system/production/CoreScreens.tsx>) | 918–1557 |
| `projectPageKey` | [app/system/production/CoreScreens.tsx](<../../../app/system/production/CoreScreens.tsx>) | 1566–1566 |
| `ProjectPage` | [app/system/production/CoreScreens.tsx](<../../../app/system/production/CoreScreens.tsx>) | 1579–1798 |
| `activityText` | [app/system/production/CoreScreens.tsx](<../../../app/system/production/CoreScreens.tsx>) | 1816–1824 |
| `ProjectOverviewTab` | [app/system/production/CoreScreens.tsx](<../../../app/system/production/CoreScreens.tsx>) | 1838–2059 |
| `DeleteProjectModal` | [app/system/production/CoreScreens.tsx](<../../../app/system/production/CoreScreens.tsx>) | 2064–2155 |
| `ProjectMembersModal` | [app/system/production/CoreScreens.tsx](<../../../app/system/production/CoreScreens.tsx>) | 2157–2387 |
| `planRowStarted` | [app/system/production/CoreScreens.tsx](<../../../app/system/production/CoreScreens.tsx>) | 2409–2409 |
| `planRowLocked` | [app/system/production/CoreScreens.tsx](<../../../app/system/production/CoreScreens.tsx>) | 2411–2411 |
| `datesDerived` | [app/system/production/CoreScreens.tsx](<../../../app/system/production/CoreScreens.tsx>) | 2412–2412 |
| `shiftPlanDate` | [app/system/production/CoreScreens.tsx](<../../../app/system/production/CoreScreens.tsx>) | 2413–2417 |
| `planDrafts` | [app/system/production/CoreScreens.tsx](<../../../app/system/production/CoreScreens.tsx>) | 2420–2459 |
| `useProjectPlan` | [app/system/production/CoreScreens.tsx](<../../../app/system/production/CoreScreens.tsx>) | 2462–2488 |
| `useScheduleTemplates` | [app/system/production/CoreScreens.tsx](<../../../app/system/production/CoreScreens.tsx>) | 2490–2504 |
| `EditProjectModal` | [app/system/production/CoreScreens.tsx](<../../../app/system/production/CoreScreens.tsx>) | 2508–2836 |
| `ProjectDocumentsModal` | [app/system/production/CoreScreens.tsx](<../../../app/system/production/CoreScreens.tsx>) | 2837–3217 |
| `CreateProjectModal` | [app/system/production/CoreScreens.tsx](<../../../app/system/production/CoreScreens.tsx>) | 3256–3825 |
| `ProductionInventory` | [app/system/production/CoreScreens.tsx](<../../../app/system/production/CoreScreens.tsx>) | 3827–3986 |
| `ProductionMasterData` | [app/system/production/CoreScreens.tsx](<../../../app/system/production/CoreScreens.tsx>) | 3990–4030 |
| `useMasterForm` | [app/system/production/CoreScreens.tsx](<../../../app/system/production/CoreScreens.tsx>) | 4034–4065 |
| `MasterFormError` | [app/system/production/CoreScreens.tsx](<../../../app/system/production/CoreScreens.tsx>) | 4067–4080 |
| `SupplierMasterTab` | [app/system/production/CoreScreens.tsx](<../../../app/system/production/CoreScreens.tsx>) | 4085–4303 |
| `SupplierEditModal` | [app/system/production/CoreScreens.tsx](<../../../app/system/production/CoreScreens.tsx>) | 4305–4437 |
| `SupplierCreateForm` | [app/system/production/CoreScreens.tsx](<../../../app/system/production/CoreScreens.tsx>) | 4441–4591 |
| `InventoryItemMasterTab` | [app/system/production/CoreScreens.tsx](<../../../app/system/production/CoreScreens.tsx>) | 4593–4671 |
| `InventoryMasterList` | [app/system/production/CoreScreens.tsx](<../../../app/system/production/CoreScreens.tsx>) | 4673–4788 |
| `InventoryItemCreateForm` | [app/system/production/CoreScreens.tsx](<../../../app/system/production/CoreScreens.tsx>) | 4790–4896 |
| `ChoiceSelect` | [app/system/production/CoreScreens.tsx](<../../../app/system/production/CoreScreens.tsx>) | 4909–4951 |
| `employeeDuration` | [app/system/production/CoreScreens.tsx](<../../../app/system/production/CoreScreens.tsx>) | 4972–4983 |
| `EmployeeMasterTab` | [app/system/production/CoreScreens.tsx](<../../../app/system/production/CoreScreens.tsx>) | 4985–5383 |
| `EmployeeModal` | [app/system/production/CoreScreens.tsx](<../../../app/system/production/CoreScreens.tsx>) | 5385–5569 |
| `TeamReferenceTab` | [app/system/production/CoreScreens.tsx](<../../../app/system/production/CoreScreens.tsx>) | 5573–5655 |
| `UserRoleModal` | [app/system/production/CoreScreens.tsx](<../../../app/system/production/CoreScreens.tsx>) | 5657–5887 |

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
- [app/system/approvers.ts](<../../../app/system/approvers.ts>)
- [app/system/production/material-endpoint.ts](<../../../app/system/production/material-endpoint.ts>)
- [app/system/ui.tsx](<../../../app/system/ui.tsx>)
- [app/system/DateInput.tsx](<../../../app/system/DateInput.tsx>)
- [app/system/production/pegasus-skin.css](<../../../app/system/production/pegasus-skin.css>)
- [app/system/production/schedule-change-text.ts](<../../../app/system/production/schedule-change-text.ts>)
- [app/system/tomas-ui/ProjectList.tsx](<../../../app/system/tomas-ui/ProjectList.tsx>)
- [app/system/tomas-ui/tones.ts](<../../../app/system/tomas-ui/tones.ts>)
- [app/system/tomas-ui/ProjectOverviewBoxes.tsx](<../../../app/system/tomas-ui/ProjectOverviewBoxes.tsx>)
- [app/system/production/ProjectPortfolioGantt.tsx](<../../../app/system/production/ProjectPortfolioGantt.tsx>)
- [app/system/use-activity-presence.ts](<../../../app/system/use-activity-presence.ts>)
- [lib/project-portfolio.ts](<../../../lib/project-portfolio.ts>)
- [backend-node/src/project-lifecycle.ts](<../../../backend-node/src/project-lifecycle.ts>)
- [app/system/production/EndUserCompanyField.tsx](<../../../app/system/production/EndUserCompanyField.tsx>)
- [app/system/production/ProjectPlanFields.tsx](<../../../app/system/production/ProjectPlanFields.tsx>)
- [app/system/production/AdminAnalyticsScreens.tsx](<../../../app/system/production/AdminAnalyticsScreens.tsx>)
- [app/system/production/ProjectCostScreen.tsx](<../../../app/system/production/ProjectCostScreen.tsx>)
- [lib/project-documents.ts](<../../../lib/project-documents.ts>)
- [app/system/production/ErpMasterPanel.tsx](<../../../app/system/production/ErpMasterPanel.tsx>)
- [app/system/production/PegasusScreen.tsx](<../../../app/system/production/PegasusScreen.tsx>)
- [app/system/production/form-bubbles.ts](<../../../app/system/production/form-bubbles.ts>)
- [app/system/production/form-draft.ts](<../../../app/system/production/form-draft.ts>)
- [app/system/production/PegasusSelect.tsx](<../../../app/system/production/PegasusSelect.tsx>)
- [app/system/production/ColumnFilter.tsx](<../../../app/system/production/ColumnFilter.tsx>)
- [app/system/production/ProjectScope.tsx](<../../../app/system/production/ProjectScope.tsx>)
- [app/system/list-api.ts](<../../../app/system/list-api.ts>)
- [app/system/production/ErpProjectNumber.tsx](<../../../app/system/production/ErpProjectNumber.tsx>)
- [app/system/production/SearchSelect.tsx](<../../../app/system/production/SearchSelect.tsx>)
- [backend-node/src/engineering-rate-access.ts](<../../../backend-node/src/engineering-rate-access.ts>)
- [backend-node/src/project-create-access.ts](<../../../backend-node/src/project-create-access.ts>)
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
