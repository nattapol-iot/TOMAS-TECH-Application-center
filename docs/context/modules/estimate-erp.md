# ERP Summary / Excel

[Context index](../../../AGENTS.md) · [Architecture](../ARCHITECTURE.md) · [Change guide](../WORKFLOW.md)

จัดหมวด ERP สรุปยอด export และ import workbook

Evidence: snapshot `3371fb5d`; source map, not a live availability claim. Test candidates use filename matching and are not exhaustive coverage.

## Read only the operation you change

- [estimate-erp API and function map](../api/estimate-erp.md) — registered in Node app
- [estimate-excel-import API and function map](../api/estimate-excel-import.md) — registered in Node app
- [overhead-policies API and function map](../api/overhead-policies.md) — registered in Node app

## UI function locator

Shared screens contain other modules: use the symbol and line range instead of reading the whole file.

| Symbol | Source | Lines |
|---|---|---|
| `EMPTY_PAGE` | [app/system/production/EstimateScreens.tsx](<../../../app/system/production/EstimateScreens.tsx>) | 130–130 |
| `priceAgeInDays` | [app/system/production/EstimateScreens.tsx](<../../../app/system/production/EstimateScreens.tsx>) | 138–138 |
| `loadAllEstimateSummaries` | [app/system/production/EstimateScreens.tsx](<../../../app/system/production/EstimateScreens.tsx>) | 148–155 |
| `loadAllSupplierPriceHistoryRecords` | [app/system/production/EstimateScreens.tsx](<../../../app/system/production/EstimateScreens.tsx>) | 157–164 |
| `mapLimited` | [app/system/production/EstimateScreens.tsx](<../../../app/system/production/EstimateScreens.tsx>) | 166–177 |
| `loadPriceLibraryRecords` | [app/system/production/EstimateScreens.tsx](<../../../app/system/production/EstimateScreens.tsx>) | 179–234 |
| `toError` | [app/system/production/EstimateScreens.tsx](<../../../app/system/production/EstimateScreens.tsx>) | 236–236 |
| `isCriticalValidationIssue` | [app/system/production/EstimateScreens.tsx](<../../../app/system/production/EstimateScreens.tsx>) | 237–237 |
| `numberOf` | [app/system/production/EstimateScreens.tsx](<../../../app/system/production/EstimateScreens.tsx>) | 238–238 |
| `formatMoney` | [app/system/production/EstimateScreens.tsx](<../../../app/system/production/EstimateScreens.tsx>) | 239–239 |
| `formatNumber` | [app/system/production/EstimateScreens.tsx](<../../../app/system/production/EstimateScreens.tsx>) | 240–240 |
| `dateValue` | [app/system/production/EstimateScreens.tsx](<../../../app/system/production/EstimateScreens.tsx>) | 241–241 |
| `formatDate` | [app/system/production/EstimateScreens.tsx](<../../../app/system/production/EstimateScreens.tsx>) | 242–246 |
| `formatDateTime` | [app/system/production/EstimateScreens.tsx](<../../../app/system/production/EstimateScreens.tsx>) | 247–251 |
| `businessDate` | [app/system/production/EstimateScreens.tsx](<../../../app/system/production/EstimateScreens.tsx>) | 252–256 |
| `futureDate` | [app/system/production/EstimateScreens.tsx](<../../../app/system/production/EstimateScreens.tsx>) | 257–257 |
| `normalizeEstimateDueDate` | [app/system/production/EstimateScreens.tsx](<../../../app/system/production/EstimateScreens.tsx>) | 258–258 |
| `canOwnEstimate` | [app/system/production/EstimateScreens.tsx](<../../../app/system/production/EstimateScreens.tsx>) | 259–259 |
| `canAssignEstimateOwner` | [app/system/production/EstimateScreens.tsx](<../../../app/system/production/EstimateScreens.tsx>) | 260–260 |
| `assignmentResultMessage` | [app/system/production/EstimateScreens.tsx](<../../../app/system/production/EstimateScreens.tsx>) | 261–267 |
| `revisionCode` | [app/system/production/EstimateScreens.tsx](<../../../app/system/production/EstimateScreens.tsx>) | 268–268 |
| `estimateCopy` | [app/system/production/EstimateScreens.tsx](<../../../app/system/production/EstimateScreens.tsx>) | 269–269 |
| `estimateStatusView` | [app/system/production/EstimateScreens.tsx](<../../../app/system/production/EstimateScreens.tsx>) | 281–287 |
| `isClosedEstimateStatus` | [app/system/production/EstimateScreens.tsx](<../../../app/system/production/EstimateScreens.tsx>) | 288–288 |
| `dueDistance` | [app/system/production/EstimateScreens.tsx](<../../../app/system/production/EstimateScreens.tsx>) | 290–296 |
| `latestSendBack` | [app/system/production/EstimateScreens.tsx](<../../../app/system/production/EstimateScreens.tsx>) | 299–305 |
| `copyResultMessage` | [app/system/production/EstimateScreens.tsx](<../../../app/system/production/EstimateScreens.tsx>) | 306–318 |
| `LoadError` | [app/system/production/EstimateScreens.tsx](<../../../app/system/production/EstimateScreens.tsx>) | 320–322 |
| `FilterSelect` | [app/system/production/EstimateScreens.tsx](<../../../app/system/production/EstimateScreens.tsx>) | 324–326 |
| `listAllNewInquiries` | [app/system/production/EstimateScreens.tsx](<../../../app/system/production/EstimateScreens.tsx>) | 328–338 |
| `ProductionEstimates` | [app/system/production/EstimateScreens.tsx](<../../../app/system/production/EstimateScreens.tsx>) | 340–508 |
| `EstimateStartPanel` | [app/system/production/EstimateScreens.tsx](<../../../app/system/production/EstimateScreens.tsx>) | 512–551 |
| `CreateEstimateModal` | [app/system/production/EstimateScreens.tsx](<../../../app/system/production/EstimateScreens.tsx>) | 557–618 |
| `ProductionEstimateWorkspace` | [app/system/production/EstimateScreens.tsx](<../../../app/system/production/EstimateScreens.tsx>) | 620–1096 |
| `moduleKeyOf` | [app/system/production/EstimateScreens.tsx](<../../../app/system/production/EstimateScreens.tsx>) | 1113–1113 |
| `lineNeedsPrice` | [app/system/production/EstimateScreens.tsx](<../../../app/system/production/EstimateScreens.tsx>) | 1115–1115 |
| `lineNeedsSupplier` | [app/system/production/EstimateScreens.tsx](<../../../app/system/production/EstimateScreens.tsx>) | 1116–1116 |
| `costModuleGroups` | [app/system/production/EstimateScreens.tsx](<../../../app/system/production/EstimateScreens.tsx>) | 1118–1139 |
| `EstimateNextSteps` | [app/system/production/EstimateScreens.tsx](<../../../app/system/production/EstimateScreens.tsx>) | 1141–1168 |
| `EstimateSummaryTab` | [app/system/production/EstimateScreens.tsx](<../../../app/system/production/EstimateScreens.tsx>) | 1170–1190 |
| `EstimateCostItemsTab` | [app/system/production/EstimateScreens.tsx](<../../../app/system/production/EstimateScreens.tsx>) | 1192–1518 |
| `costSeedFromLine` | [app/system/production/EstimateScreens.tsx](<../../../app/system/production/EstimateScreens.tsx>) | 1520–1528 |
| `AddItemsSources` | [app/system/production/EstimateScreens.tsx](<../../../app/system/production/EstimateScreens.tsx>) | 1542–1546 |
| `PriceLibraryPicker` | [app/system/production/EstimateScreens.tsx](<../../../app/system/production/EstimateScreens.tsx>) | 1548–1575 |
| `CopyPreviousEstimateModal` | [app/system/production/EstimateScreens.tsx](<../../../app/system/production/EstimateScreens.tsx>) | 1582–1638 |
| `normalizedHeader` | [app/system/production/EstimateScreens.tsx](<../../../app/system/production/EstimateScreens.tsx>) | 1642–1642 |
| `spreadsheetValue` | [app/system/production/EstimateScreens.tsx](<../../../app/system/production/EstimateScreens.tsx>) | 1643–1646 |
| `spreadsheetText` | [app/system/production/EstimateScreens.tsx](<../../../app/system/production/EstimateScreens.tsx>) | 1647–1647 |
| `spreadsheetNumber` | [app/system/production/EstimateScreens.tsx](<../../../app/system/production/EstimateScreens.tsx>) | 1648–1651 |
| `excelDate` | [app/system/production/EstimateScreens.tsx](<../../../app/system/production/EstimateScreens.tsx>) | 1652–1656 |
| `ImportCostItemsModal` | [app/system/production/EstimateScreens.tsx](<../../../app/system/production/EstimateScreens.tsx>) | 1658–1693 |
| `ApplyModuleTemplateModal` | [app/system/production/EstimateScreens.tsx](<../../../app/system/production/EstimateScreens.tsx>) | 1697–1789 |
| `SaveModuleTemplateModal` | [app/system/production/EstimateScreens.tsx](<../../../app/system/production/EstimateScreens.tsx>) | 1793–1819 |
| `CopyCostModuleModal` | [app/system/production/EstimateScreens.tsx](<../../../app/system/production/EstimateScreens.tsx>) | 1821–1850 |
| `MainModuleEditor` | [app/system/production/EstimateScreens.tsx](<../../../app/system/production/EstimateScreens.tsx>) | 1852–1867 |
| `EstimateOtherCostTab` | [app/system/production/EstimateScreens.tsx](<../../../app/system/production/EstimateScreens.tsx>) | 1869–1945 |
| `EstimateAssignmentTab` | [app/system/production/EstimateScreens.tsx](<../../../app/system/production/EstimateScreens.tsx>) | 1947–1952 |
| `EstimateValidationTab` | [app/system/production/EstimateScreens.tsx](<../../../app/system/production/EstimateScreens.tsx>) | 1954–1963 |
| `revisionWithCurrent` | [app/system/production/EstimateScreens.tsx](<../../../app/system/production/EstimateScreens.tsx>) | 1965–1969 |
| `RevisionDescription` | [app/system/production/EstimateScreens.tsx](<../../../app/system/production/EstimateScreens.tsx>) | 1973–1985 |
| `revisionStatusView` | [app/system/production/EstimateScreens.tsx](<../../../app/system/production/EstimateScreens.tsx>) | 1987–1993 |
| `revisionReasonText` | [app/system/production/EstimateScreens.tsx](<../../../app/system/production/EstimateScreens.tsx>) | 1994–1996 |
| `EstimateRevisionTab` | [app/system/production/EstimateScreens.tsx](<../../../app/system/production/EstimateScreens.tsx>) | 1998–2016 |
| `EstimateCompareTab` | [app/system/production/EstimateScreens.tsx](<../../../app/system/production/EstimateScreens.tsx>) | 2018–2032 |
| `EstimateReviewTab` | [app/system/production/EstimateScreens.tsx](<../../../app/system/production/EstimateScreens.tsx>) | 2034–2049 |
| `CostItemEditor` | [app/system/production/EstimateScreens.tsx](<../../../app/system/production/EstimateScreens.tsx>) | 2051–2098 |
| `WorkPackageEditor` | [app/system/production/EstimateScreens.tsx](<../../../app/system/production/EstimateScreens.tsx>) | 2100–2108 |
| `DisciplineSelect` | [app/system/production/EstimateScreens.tsx](<../../../app/system/production/EstimateScreens.tsx>) | 2110–2115 |
| `ManhourEditor` | [app/system/production/EstimateScreens.tsx](<../../../app/system/production/EstimateScreens.tsx>) | 2117–2169 |
| `ExpenseEditor` | [app/system/production/EstimateScreens.tsx](<../../../app/system/production/EstimateScreens.tsx>) | 2171–2187 |
| `OtherCostEditor` | [app/system/production/EstimateScreens.tsx](<../../../app/system/production/EstimateScreens.tsx>) | 2189–2196 |
| `CreateAssignmentModal` | [app/system/production/EstimateScreens.tsx](<../../../app/system/production/EstimateScreens.tsx>) | 2198–2223 |
| `AssignmentEditor` | [app/system/production/EstimateScreens.tsx](<../../../app/system/production/EstimateScreens.tsx>) | 2225–2235 |
| `WorkflowModal` | [app/system/production/EstimateScreens.tsx](<../../../app/system/production/EstimateScreens.tsx>) | 2245–2285 |

## Domain helpers / direct dependencies

- [backend-node/src/estimate-labor-category.ts](<../../../backend-node/src/estimate-labor-category.ts>)
- [backend-node/src/user-roles.ts](<../../../backend-node/src/user-roles.ts>)
- [backend-node/src/estimate-erp.ts](<../../../backend-node/src/estimate-erp.ts>)
- [backend-node/src/document-storage.ts](<../../../backend-node/src/document-storage.ts>)
- [backend-node/src/estimate-workbook.ts](<../../../backend-node/src/estimate-workbook.ts>)
- [backend-node/src/estimate-total-guard.ts](<../../../backend-node/src/estimate-total-guard.ts>)
- [backend-node/src/estimate-disciplines.ts](<../../../backend-node/src/estimate-disciplines.ts>)
- [backend-node/src/overhead.ts](<../../../backend-node/src/overhead.ts>)
- [app/system/production/use-estimate-navigation.ts](<../../../app/system/production/use-estimate-navigation.ts>)
- [lib/estimate-navigation.ts](<../../../lib/estimate-navigation.ts>)
- [app/system/production/DocumentLifecycle.tsx](<../../../app/system/production/DocumentLifecycle.tsx>)
- [app/system/production/EstimateModuleQuantityCells.tsx](<../../../app/system/production/EstimateModuleQuantityCells.tsx>)
- [app/system/production/EstimatePriceSetEditor.tsx](<../../../app/system/production/EstimatePriceSetEditor.tsx>)
- [app/system/production/EstimateModuleEditor.tsx](<../../../app/system/production/EstimateModuleEditor.tsx>)
- [app/system/i18n.ts](<../../../app/system/i18n.ts>)
- [app/system/production/EstimateExcelImport.tsx](<../../../app/system/production/EstimateExcelImport.tsx>)
- [app/system/production/EstimateOverheadPanel.tsx](<../../../app/system/production/EstimateOverheadPanel.tsx>)
- [lib/feature-flags.ts](<../../../lib/feature-flags.ts>)
- [lib/estimate-sections.ts](<../../../lib/estimate-sections.ts>)
- [lib/estimate-order.ts](<../../../lib/estimate-order.ts>)
- [app/system/production/EstimateErpSheet.tsx](<../../../app/system/production/EstimateErpSheet.tsx>)
- [app/system/production/estimate-flow.css](<../../../app/system/production/estimate-flow.css>)
- [app/system/production/EstimateStartFrom.tsx](<../../../app/system/production/EstimateStartFrom.tsx>)
- [app/system/production/EstimateLaborSheet.tsx](<../../../app/system/production/EstimateLaborSheet.tsx>)
- [lib/estimate-disciplines.ts](<../../../lib/estimate-disciplines.ts>)
- [app/system/LocalizedText.tsx](<../../../app/system/LocalizedText.tsx>)
- [app/system/production/CostItemFields.tsx](<../../../app/system/production/CostItemFields.tsx>)
- [app/system/production/CostItemLookup.tsx](<../../../app/system/production/CostItemLookup.tsx>)
- [lib/cost-item-lookup.ts](<../../../lib/cost-item-lookup.ts>)
- [lib/cost-item-validation.ts](<../../../lib/cost-item-validation.ts>)
- [lib/estimate-ux.ts](<../../../lib/estimate-ux.ts>)
- [lib/record-live-sync.ts](<../../../lib/record-live-sync.ts>)
- [app/system/production/RecordPresence.tsx](<../../../app/system/production/RecordPresence.tsx>)
- [app/system/api-client.ts](<../../../app/system/api-client.ts>)
- [app/system/ui.tsx](<../../../app/system/ui.tsx>)
- [lib/export-xlsx.ts](<../../../lib/export-xlsx.ts>)
- [lib/import-spreadsheet.ts](<../../../lib/import-spreadsheet.ts>)

## Candidate regression tests

- [tests/erp-estimate-groups.test.mjs](<../../../tests/erp-estimate-groups.test.mjs>)
- [tests/erp-estimate-workbook.test.mjs](<../../../tests/erp-estimate-workbook.test.mjs>)
- [tests/estimate-excel-import.test.mjs](<../../../tests/estimate-excel-import.test.mjs>)
- [tests/estimate-total-guardrails.test.mjs](<../../../tests/estimate-total-guardrails.test.mjs>)
- [backend-node/tests/estimate-erp-groups.test.ts](<../../../backend-node/tests/estimate-erp-groups.test.ts>)
- [backend-node/tests/estimate-erp-manual-override.test.ts](<../../../backend-node/tests/estimate-erp-manual-override.test.ts>)
- [backend-node/tests/estimate-erp.test.ts](<../../../backend-node/tests/estimate-erp.test.ts>)
- [backend-node/tests/estimate-excel-import.test.ts](<../../../backend-node/tests/estimate-excel-import.test.ts>)
- [backend-node/tests/estimate-total-guard.test.ts](<../../../backend-node/tests/estimate-total-guard.test.ts>)
- [backend-node/tests/overhead.test.ts](<../../../backend-node/tests/overhead.test.ts>)

## Client contract lookup

Search the selected API path or function in [app/system/api-client.ts](<../../../app/system/api-client.ts>); follow its screen callers. Common UI/language changes require [app/system/ui.tsx](<../../../app/system/ui.tsx>) and [app/system/i18n.ts](<../../../app/system/i18n.ts>). For SQL changes use [schema map](../SCHEMA.md).
