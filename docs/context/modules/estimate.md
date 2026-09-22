# Estimate Cost

[Context index](../../../AGENTS.md) · [Architecture](../ARCHITECTURE.md) · [Change guide](../WORKFLOW.md)

สร้าง revision รายการต้นทุน ค่าใช้จ่าย validation และ workflow

Evidence: snapshot `d471fc2c`; source map, not a live availability claim. Test candidates use filename matching and are not exhaustive coverage.

## Read only the operation you change

- [estimates API and function map](../api/estimates.md) — registered in Node app
- [estimate-workspace-read API and function map](../api/estimate-workspace-read.md) — registered in Node app
- [estimate-cost-write API and function map](../api/estimate-cost-write.md) — registered in Node app
- [estimate-workspace-write API and function map](../api/estimate-workspace-write.md) — registered in Node app
- [estimate-cost-lookup API and function map](../api/estimate-cost-lookup.md) — registered in Node app
- [estimate-order API and function map](../api/estimate-order.md) — registered in Node app
- [estimate-price-sets API and function map](../api/estimate-price-sets.md) — registered in Node app

## UI function locator

Shared screens contain other modules: use the symbol and line range instead of reading the whole file.

| Symbol | Source | Lines |
|---|---|---|
| `EMPTY_PAGE` | [app/system/production/EstimateScreens.tsx](<../../../app/system/production/EstimateScreens.tsx>) | 154–154 |
| `priceAgeInDays` | [app/system/production/EstimateScreens.tsx](<../../../app/system/production/EstimateScreens.tsx>) | 162–162 |
| `loadAllEstimateSummaries` | [app/system/production/EstimateScreens.tsx](<../../../app/system/production/EstimateScreens.tsx>) | 172–179 |
| `loadAllSupplierPriceHistoryRecords` | [app/system/production/EstimateScreens.tsx](<../../../app/system/production/EstimateScreens.tsx>) | 181–188 |
| `mapLimited` | [app/system/production/EstimateScreens.tsx](<../../../app/system/production/EstimateScreens.tsx>) | 190–201 |
| `loadPriceLibraryRecords` | [app/system/production/EstimateScreens.tsx](<../../../app/system/production/EstimateScreens.tsx>) | 203–258 |
| `toError` | [app/system/production/EstimateScreens.tsx](<../../../app/system/production/EstimateScreens.tsx>) | 260–260 |
| `isCriticalValidationIssue` | [app/system/production/EstimateScreens.tsx](<../../../app/system/production/EstimateScreens.tsx>) | 261–261 |
| `numberOf` | [app/system/production/EstimateScreens.tsx](<../../../app/system/production/EstimateScreens.tsx>) | 262–262 |
| `formatMoney` | [app/system/production/EstimateScreens.tsx](<../../../app/system/production/EstimateScreens.tsx>) | 263–263 |
| `formatNumber` | [app/system/production/EstimateScreens.tsx](<../../../app/system/production/EstimateScreens.tsx>) | 264–264 |
| `dateValue` | [app/system/production/EstimateScreens.tsx](<../../../app/system/production/EstimateScreens.tsx>) | 265–265 |
| `formatDate` | [app/system/production/EstimateScreens.tsx](<../../../app/system/production/EstimateScreens.tsx>) | 266–270 |
| `formatDateTime` | [app/system/production/EstimateScreens.tsx](<../../../app/system/production/EstimateScreens.tsx>) | 271–275 |
| `businessDate` | [app/system/production/EstimateScreens.tsx](<../../../app/system/production/EstimateScreens.tsx>) | 276–280 |
| `futureDate` | [app/system/production/EstimateScreens.tsx](<../../../app/system/production/EstimateScreens.tsx>) | 281–281 |
| `normalizeEstimateDueDate` | [app/system/production/EstimateScreens.tsx](<../../../app/system/production/EstimateScreens.tsx>) | 282–282 |
| `canOwnEstimate` | [app/system/production/EstimateScreens.tsx](<../../../app/system/production/EstimateScreens.tsx>) | 283–283 |
| `canAssignEstimateOwner` | [app/system/production/EstimateScreens.tsx](<../../../app/system/production/EstimateScreens.tsx>) | 284–284 |
| `assignmentResultMessage` | [app/system/production/EstimateScreens.tsx](<../../../app/system/production/EstimateScreens.tsx>) | 285–291 |
| `revisionCode` | [app/system/production/EstimateScreens.tsx](<../../../app/system/production/EstimateScreens.tsx>) | 292–292 |
| `copyResultMessage` | [app/system/production/EstimateScreens.tsx](<../../../app/system/production/EstimateScreens.tsx>) | 293–305 |
| `LoadError` | [app/system/production/EstimateScreens.tsx](<../../../app/system/production/EstimateScreens.tsx>) | 307–309 |
| `FilterSelect` | [app/system/production/EstimateScreens.tsx](<../../../app/system/production/EstimateScreens.tsx>) | 311–313 |
| `listAllNewInquiries` | [app/system/production/EstimateScreens.tsx](<../../../app/system/production/EstimateScreens.tsx>) | 315–325 |
| `ProductionEstimates` | [app/system/production/EstimateScreens.tsx](<../../../app/system/production/EstimateScreens.tsx>) | 327–460 |
| `CreateEstimateModal` | [app/system/production/EstimateScreens.tsx](<../../../app/system/production/EstimateScreens.tsx>) | 462–514 |
| `ProductionEstimateWorkspace` | [app/system/production/EstimateScreens.tsx](<../../../app/system/production/EstimateScreens.tsx>) | 516–853 |
| `moduleKeyOf` | [app/system/production/EstimateScreens.tsx](<../../../app/system/production/EstimateScreens.tsx>) | 870–870 |
| `costModuleGroups` | [app/system/production/EstimateScreens.tsx](<../../../app/system/production/EstimateScreens.tsx>) | 872–893 |
| `EstimateNextSteps` | [app/system/production/EstimateScreens.tsx](<../../../app/system/production/EstimateScreens.tsx>) | 895–936 |
| `EstimateSummaryTab` | [app/system/production/EstimateScreens.tsx](<../../../app/system/production/EstimateScreens.tsx>) | 938–958 |
| `EstimateCostItemsTab` | [app/system/production/EstimateScreens.tsx](<../../../app/system/production/EstimateScreens.tsx>) | 960–1253 |
| `costSeedFromLine` | [app/system/production/EstimateScreens.tsx](<../../../app/system/production/EstimateScreens.tsx>) | 1255–1263 |
| `PriceLibraryPicker` | [app/system/production/EstimateScreens.tsx](<../../../app/system/production/EstimateScreens.tsx>) | 1265–1289 |
| `CopyPreviousEstimateModal` | [app/system/production/EstimateScreens.tsx](<../../../app/system/production/EstimateScreens.tsx>) | 1296–1349 |
| `normalizedHeader` | [app/system/production/EstimateScreens.tsx](<../../../app/system/production/EstimateScreens.tsx>) | 1353–1353 |
| `spreadsheetValue` | [app/system/production/EstimateScreens.tsx](<../../../app/system/production/EstimateScreens.tsx>) | 1354–1357 |
| `spreadsheetText` | [app/system/production/EstimateScreens.tsx](<../../../app/system/production/EstimateScreens.tsx>) | 1358–1358 |
| `spreadsheetNumber` | [app/system/production/EstimateScreens.tsx](<../../../app/system/production/EstimateScreens.tsx>) | 1359–1362 |
| `excelDate` | [app/system/production/EstimateScreens.tsx](<../../../app/system/production/EstimateScreens.tsx>) | 1363–1367 |
| `ImportCostItemsModal` | [app/system/production/EstimateScreens.tsx](<../../../app/system/production/EstimateScreens.tsx>) | 1369–1404 |
| `ApplyModuleTemplateModal` | [app/system/production/EstimateScreens.tsx](<../../../app/system/production/EstimateScreens.tsx>) | 1408–1499 |
| `SaveModuleTemplateModal` | [app/system/production/EstimateScreens.tsx](<../../../app/system/production/EstimateScreens.tsx>) | 1503–1529 |
| `CopyCostModuleModal` | [app/system/production/EstimateScreens.tsx](<../../../app/system/production/EstimateScreens.tsx>) | 1531–1560 |
| `MainModuleEditor` | [app/system/production/EstimateScreens.tsx](<../../../app/system/production/EstimateScreens.tsx>) | 1562–1577 |
| `EstimateManhourTab` | [app/system/production/EstimateScreens.tsx](<../../../app/system/production/EstimateScreens.tsx>) | 1579–1744 |
| `EstimateOtherCostTab` | [app/system/production/EstimateScreens.tsx](<../../../app/system/production/EstimateScreens.tsx>) | 1746–1774 |
| `EstimateAssignmentTab` | [app/system/production/EstimateScreens.tsx](<../../../app/system/production/EstimateScreens.tsx>) | 1776–1781 |
| `EstimateValidationTab` | [app/system/production/EstimateScreens.tsx](<../../../app/system/production/EstimateScreens.tsx>) | 1783–1792 |
| `revisionWithCurrent` | [app/system/production/EstimateScreens.tsx](<../../../app/system/production/EstimateScreens.tsx>) | 1794–1798 |
| `RevisionDescription` | [app/system/production/EstimateScreens.tsx](<../../../app/system/production/EstimateScreens.tsx>) | 1800–1812 |
| `EstimateRevisionTab` | [app/system/production/EstimateScreens.tsx](<../../../app/system/production/EstimateScreens.tsx>) | 1814–1817 |
| `EstimateCompareTab` | [app/system/production/EstimateScreens.tsx](<../../../app/system/production/EstimateScreens.tsx>) | 1819–1833 |
| `EstimateReviewTab` | [app/system/production/EstimateScreens.tsx](<../../../app/system/production/EstimateScreens.tsx>) | 1835–1850 |
| `CostItemEditor` | [app/system/production/EstimateScreens.tsx](<../../../app/system/production/EstimateScreens.tsx>) | 1852–1899 |
| `WorkPackageEditor` | [app/system/production/EstimateScreens.tsx](<../../../app/system/production/EstimateScreens.tsx>) | 1901–1910 |
| `ManhourEditor` | [app/system/production/EstimateScreens.tsx](<../../../app/system/production/EstimateScreens.tsx>) | 1912–1996 |
| `ExpenseEditor` | [app/system/production/EstimateScreens.tsx](<../../../app/system/production/EstimateScreens.tsx>) | 1998–2009 |
| `OtherCostEditor` | [app/system/production/EstimateScreens.tsx](<../../../app/system/production/EstimateScreens.tsx>) | 2011–2018 |
| `CreateAssignmentModal` | [app/system/production/EstimateScreens.tsx](<../../../app/system/production/EstimateScreens.tsx>) | 2020–2045 |
| `AssignmentEditor` | [app/system/production/EstimateScreens.tsx](<../../../app/system/production/EstimateScreens.tsx>) | 2047–2057 |
| `WorkflowModal` | [app/system/production/EstimateScreens.tsx](<../../../app/system/production/EstimateScreens.tsx>) | 2059–2068 |
| `formatMoney` | [app/system/production/CostItemFields.tsx](<../../../app/system/production/CostItemFields.tsx>) | 16–16 |
| `CostItemFields` | [app/system/production/CostItemFields.tsx](<../../../app/system/production/CostItemFields.tsx>) | 30–78 |
| `copy` | [app/system/production/CostItemLookup.tsx](<../../../app/system/production/CostItemLookup.tsx>) | 22–22 |
| `money` | [app/system/production/CostItemLookup.tsx](<../../../app/system/production/CostItemLookup.tsx>) | 23–23 |
| `shortDate` | [app/system/production/CostItemLookup.tsx](<../../../app/system/production/CostItemLookup.tsx>) | 24–28 |
| `placeUnder` | [app/system/production/CostItemLookup.tsx](<../../../app/system/production/CostItemLookup.tsx>) | 38–48 |
| `LookupMenu` | [app/system/production/CostItemLookup.tsx](<../../../app/system/production/CostItemLookup.tsx>) | 53–65 |
| `handleMenuKeys` | [app/system/production/CostItemLookup.tsx](<../../../app/system/production/CostItemLookup.tsx>) | 70–98 |
| `textOfField` | [app/system/production/CostItemLookup.tsx](<../../../app/system/production/CostItemLookup.tsx>) | 104–104 |
| `CostItemLookupInput` | [app/system/production/CostItemLookup.tsx](<../../../app/system/production/CostItemLookup.tsx>) | 106–208 |
| `SupplierLookupInput` | [app/system/production/CostItemLookup.tsx](<../../../app/system/production/CostItemLookup.tsx>) | 212–282 |
| `errorText` | [app/system/production/DocumentLifecycle.tsx](<../../../app/system/production/DocumentLifecycle.tsx>) | 27–27 |
| `DocumentLifecycleButton` | [app/system/production/DocumentLifecycle.tsx](<../../../app/system/production/DocumentLifecycle.tsx>) | 30–34 |
| `LifecycleDialog` | [app/system/production/DocumentLifecycle.tsx](<../../../app/system/production/DocumentLifecycle.tsx>) | 36–101 |
| `DocumentHistoryButton` | [app/system/production/DocumentLifecycle.tsx](<../../../app/system/production/DocumentLifecycle.tsx>) | 104–108 |
| `DocumentHistory` | [app/system/production/DocumentLifecycle.tsx](<../../../app/system/production/DocumentLifecycle.tsx>) | 109–136 |
| `InquiryDeleteDialog` | [app/system/production/DocumentLifecycle.tsx](<../../../app/system/production/DocumentLifecycle.tsx>) | 140–171 |

## Domain helpers / direct dependencies

- [backend-node/src/estimate-duplicate-policy.ts](<../../../backend-node/src/estimate-duplicate-policy.ts>)
- [backend-node/src/estimate-labor-category.ts](<../../../backend-node/src/estimate-labor-category.ts>)
- [backend-node/src/document-number.ts](<../../../backend-node/src/document-number.ts>)
- [backend-node/src/crm.ts](<../../../backend-node/src/crm.ts>)
- [backend-node/src/user-roles.ts](<../../../backend-node/src/user-roles.ts>)
- [backend-node/src/estimate-total-guard.ts](<../../../backend-node/src/estimate-total-guard.ts>)
- [backend-node/src/overhead.ts](<../../../backend-node/src/overhead.ts>)
- [backend-node/src/feature-flags.ts](<../../../backend-node/src/feature-flags.ts>)
- [backend-node/src/estimate-module-details.ts](<../../../backend-node/src/estimate-module-details.ts>)
- [backend-node/src/email.ts](<../../../backend-node/src/email.ts>)
- [backend-node/src/estimate-sections.ts](<../../../backend-node/src/estimate-sections.ts>)
- [backend-node/src/routes/estimate-cost-write.ts](<../../../backend-node/src/routes/estimate-cost-write.ts>)
- [app/system/production/use-estimate-navigation.ts](<../../../app/system/production/use-estimate-navigation.ts>)
- [lib/estimate-navigation.ts](<../../../lib/estimate-navigation.ts>)
- [app/system/production/DocumentLifecycle.tsx](<../../../app/system/production/DocumentLifecycle.tsx>)
- [app/system/production/EstimateModuleQuantityCells.tsx](<../../../app/system/production/EstimateModuleQuantityCells.tsx>)
- [app/system/production/EstimatePriceSetEditor.tsx](<../../../app/system/production/EstimatePriceSetEditor.tsx>)
- [app/system/production/EstimateEffortCells.tsx](<../../../app/system/production/EstimateEffortCells.tsx>)
- [app/system/production/EstimateModuleEditor.tsx](<../../../app/system/production/EstimateModuleEditor.tsx>)
- [app/system/i18n.ts](<../../../app/system/i18n.ts>)
- [app/system/production/EstimateExcelImport.tsx](<../../../app/system/production/EstimateExcelImport.tsx>)
- [app/system/production/EstimateOverheadPanel.tsx](<../../../app/system/production/EstimateOverheadPanel.tsx>)
- [lib/feature-flags.ts](<../../../lib/feature-flags.ts>)
- [lib/estimate-sections.ts](<../../../lib/estimate-sections.ts>)
- [lib/estimate-order.ts](<../../../lib/estimate-order.ts>)
- [app/system/production/EstimateErpSheet.tsx](<../../../app/system/production/EstimateErpSheet.tsx>)
- [app/system/production/LaborPackagePicker.tsx](<../../../app/system/production/LaborPackagePicker.tsx>)
- [app/system/production/LaborPackageMaster.tsx](<../../../app/system/production/LaborPackageMaster.tsx>)
- [app/system/LocalizedText.tsx](<../../../app/system/LocalizedText.tsx>)
- [app/system/production/CostItemFields.tsx](<../../../app/system/production/CostItemFields.tsx>)
- [app/system/production/CostItemLookup.tsx](<../../../app/system/production/CostItemLookup.tsx>)
- [lib/cost-item-lookup.ts](<../../../lib/cost-item-lookup.ts>)
- [lib/cost-item-validation.ts](<../../../lib/cost-item-validation.ts>)
- [lib/estimate-ux.ts](<../../../lib/estimate-ux.ts>)
- [app/system/api-client.ts](<../../../app/system/api-client.ts>)
- [app/system/ui.tsx](<../../../app/system/ui.tsx>)
- [lib/export-xlsx.ts](<../../../lib/export-xlsx.ts>)
- [lib/import-spreadsheet.ts](<../../../lib/import-spreadsheet.ts>)

## Candidate regression tests

- [tests/cost-item-lookup.test.mjs](<../../../tests/cost-item-lookup.test.mjs>)
- [tests/cost-item-validation.test.mjs](<../../../tests/cost-item-validation.test.mjs>)
- [tests/erp-estimate-groups.test.mjs](<../../../tests/erp-estimate-groups.test.mjs>)
- [tests/erp-estimate-workbook.test.mjs](<../../../tests/erp-estimate-workbook.test.mjs>)
- [tests/estimate-assignment-email.test.mjs](<../../../tests/estimate-assignment-email.test.mjs>)
- [tests/estimate-assignment-queue.test.mjs](<../../../tests/estimate-assignment-queue.test.mjs>)
- [tests/estimate-copy-assignment-contract.test.mjs](<../../../tests/estimate-copy-assignment-contract.test.mjs>)
- [tests/estimate-cost-breakdown.test.mjs](<../../../tests/estimate-cost-breakdown.test.mjs>)
- [tests/estimate-create-revision-contract.test.mjs](<../../../tests/estimate-create-revision-contract.test.mjs>)
- [tests/estimate-excel-import.test.mjs](<../../../tests/estimate-excel-import.test.mjs>)
- [tests/estimate-labor-category.test.mjs](<../../../tests/estimate-labor-category.test.mjs>)
- [tests/estimate-navigation.test.mjs](<../../../tests/estimate-navigation.test.mjs>)
- [tests/estimate-order.test.mjs](<../../../tests/estimate-order.test.mjs>)
- [tests/estimate-readiness.test.mjs](<../../../tests/estimate-readiness.test.mjs>)
- [tests/estimate-template-selection.test.mjs](<../../../tests/estimate-template-selection.test.mjs>)
- [tests/estimate-total-guardrails.test.mjs](<../../../tests/estimate-total-guardrails.test.mjs>)
- [tests/estimate-ux.test.mjs](<../../../tests/estimate-ux.test.mjs>)
- [backend-node/tests/document-lifecycle.test.ts](<../../../backend-node/tests/document-lifecycle.test.ts>)
- [backend-node/tests/estimate-admin-self-decision.test.ts](<../../../backend-node/tests/estimate-admin-self-decision.test.ts>)
- [backend-node/tests/estimate-assignments-read.test.ts](<../../../backend-node/tests/estimate-assignments-read.test.ts>)
- [backend-node/tests/estimate-copy-plan.test.ts](<../../../backend-node/tests/estimate-copy-plan.test.ts>)
- [backend-node/tests/estimate-copy-route.test.ts](<../../../backend-node/tests/estimate-copy-route.test.ts>)
- [backend-node/tests/estimate-cost-drag.test.ts](<../../../backend-node/tests/estimate-cost-drag.test.ts>)
- [backend-node/tests/estimate-cost-lookup.test.ts](<../../../backend-node/tests/estimate-cost-lookup.test.ts>)
- [backend-node/tests/estimate-duplicate-policy.test.ts](<../../../backend-node/tests/estimate-duplicate-policy.test.ts>)
- [backend-node/tests/estimate-effort.test.ts](<../../../backend-node/tests/estimate-effort.test.ts>)
- [backend-node/tests/estimate-erp-groups.test.ts](<../../../backend-node/tests/estimate-erp-groups.test.ts>)
- [backend-node/tests/estimate-erp-manual-override.test.ts](<../../../backend-node/tests/estimate-erp-manual-override.test.ts>)
- [backend-node/tests/estimate-erp.test.ts](<../../../backend-node/tests/estimate-erp.test.ts>)
- [backend-node/tests/estimate-excel-import.test.ts](<../../../backend-node/tests/estimate-excel-import.test.ts>)
- [backend-node/tests/estimate-mine-filter.test.ts](<../../../backend-node/tests/estimate-mine-filter.test.ts>)
- [backend-node/tests/estimate-module-copy.test.ts](<../../../backend-node/tests/estimate-module-copy.test.ts>)
- [backend-node/tests/estimate-module-description-rows.test.ts](<../../../backend-node/tests/estimate-module-description-rows.test.ts>)
- [backend-node/tests/estimate-module-details.test.ts](<../../../backend-node/tests/estimate-module-details.test.ts>)
- [backend-node/tests/estimate-module-remove.test.ts](<../../../backend-node/tests/estimate-module-remove.test.ts>)
- [backend-node/tests/estimate-order.test.ts](<../../../backend-node/tests/estimate-order.test.ts>)
- [backend-node/tests/estimate-price-sets.test.ts](<../../../backend-node/tests/estimate-price-sets.test.ts>)
- [backend-node/tests/estimate-product-codes.test.ts](<../../../backend-node/tests/estimate-product-codes.test.ts>)
- [backend-node/tests/estimate-readiness.test.ts](<../../../backend-node/tests/estimate-readiness.test.ts>)
- [backend-node/tests/estimate-sections.test.ts](<../../../backend-node/tests/estimate-sections.test.ts>)
- [backend-node/tests/estimate-standalone.test.ts](<../../../backend-node/tests/estimate-standalone.test.ts>)
- [backend-node/tests/estimate-total-guard.test.ts](<../../../backend-node/tests/estimate-total-guard.test.ts>)

## Client contract lookup

Search the selected API path or function in [app/system/api-client.ts](<../../../app/system/api-client.ts>); follow its screen callers. Common UI/language changes require [app/system/ui.tsx](<../../../app/system/ui.tsx>) and [app/system/i18n.ts](<../../../app/system/i18n.ts>). For SQL changes use [schema map](../SCHEMA.md).
