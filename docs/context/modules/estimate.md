# Estimate Cost

[Context index](../../../AGENTS.md) · [Architecture](../ARCHITECTURE.md) · [Change guide](../WORKFLOW.md)

สร้าง revision รายการต้นทุน ค่าใช้จ่าย validation และ workflow

Evidence: snapshot `7169175d`; source map, not a live availability claim. Test candidates use filename matching and are not exhaustive coverage.

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
| `EMPTY_PAGE` | [app/system/production/EstimateScreens.tsx](<../../../app/system/production/EstimateScreens.tsx>) | 131–131 |
| `priceAgeInDays` | [app/system/production/EstimateScreens.tsx](<../../../app/system/production/EstimateScreens.tsx>) | 139–139 |
| `loadAllEstimateSummaries` | [app/system/production/EstimateScreens.tsx](<../../../app/system/production/EstimateScreens.tsx>) | 149–156 |
| `loadAllSupplierPriceHistoryRecords` | [app/system/production/EstimateScreens.tsx](<../../../app/system/production/EstimateScreens.tsx>) | 158–165 |
| `mapLimited` | [app/system/production/EstimateScreens.tsx](<../../../app/system/production/EstimateScreens.tsx>) | 167–178 |
| `loadPriceLibraryRecords` | [app/system/production/EstimateScreens.tsx](<../../../app/system/production/EstimateScreens.tsx>) | 180–235 |
| `toError` | [app/system/production/EstimateScreens.tsx](<../../../app/system/production/EstimateScreens.tsx>) | 237–237 |
| `isCriticalValidationIssue` | [app/system/production/EstimateScreens.tsx](<../../../app/system/production/EstimateScreens.tsx>) | 238–238 |
| `numberOf` | [app/system/production/EstimateScreens.tsx](<../../../app/system/production/EstimateScreens.tsx>) | 239–239 |
| `formatMoney` | [app/system/production/EstimateScreens.tsx](<../../../app/system/production/EstimateScreens.tsx>) | 240–240 |
| `formatNumber` | [app/system/production/EstimateScreens.tsx](<../../../app/system/production/EstimateScreens.tsx>) | 241–241 |
| `dateValue` | [app/system/production/EstimateScreens.tsx](<../../../app/system/production/EstimateScreens.tsx>) | 242–242 |
| `formatDate` | [app/system/production/EstimateScreens.tsx](<../../../app/system/production/EstimateScreens.tsx>) | 243–247 |
| `formatDateTime` | [app/system/production/EstimateScreens.tsx](<../../../app/system/production/EstimateScreens.tsx>) | 248–252 |
| `businessDate` | [app/system/production/EstimateScreens.tsx](<../../../app/system/production/EstimateScreens.tsx>) | 253–257 |
| `futureDate` | [app/system/production/EstimateScreens.tsx](<../../../app/system/production/EstimateScreens.tsx>) | 258–258 |
| `normalizeEstimateDueDate` | [app/system/production/EstimateScreens.tsx](<../../../app/system/production/EstimateScreens.tsx>) | 259–259 |
| `canOwnEstimate` | [app/system/production/EstimateScreens.tsx](<../../../app/system/production/EstimateScreens.tsx>) | 260–260 |
| `canAssignEstimateOwner` | [app/system/production/EstimateScreens.tsx](<../../../app/system/production/EstimateScreens.tsx>) | 261–261 |
| `assignmentResultMessage` | [app/system/production/EstimateScreens.tsx](<../../../app/system/production/EstimateScreens.tsx>) | 262–268 |
| `revisionCode` | [app/system/production/EstimateScreens.tsx](<../../../app/system/production/EstimateScreens.tsx>) | 269–269 |
| `estimateCopy` | [app/system/production/EstimateScreens.tsx](<../../../app/system/production/EstimateScreens.tsx>) | 270–270 |
| `estimateStatusView` | [app/system/production/EstimateScreens.tsx](<../../../app/system/production/EstimateScreens.tsx>) | 282–288 |
| `isClosedEstimateStatus` | [app/system/production/EstimateScreens.tsx](<../../../app/system/production/EstimateScreens.tsx>) | 289–289 |
| `dueDistance` | [app/system/production/EstimateScreens.tsx](<../../../app/system/production/EstimateScreens.tsx>) | 291–297 |
| `latestSendBack` | [app/system/production/EstimateScreens.tsx](<../../../app/system/production/EstimateScreens.tsx>) | 300–306 |
| `copyResultMessage` | [app/system/production/EstimateScreens.tsx](<../../../app/system/production/EstimateScreens.tsx>) | 307–319 |
| `LoadError` | [app/system/production/EstimateScreens.tsx](<../../../app/system/production/EstimateScreens.tsx>) | 321–323 |
| `FilterSelect` | [app/system/production/EstimateScreens.tsx](<../../../app/system/production/EstimateScreens.tsx>) | 325–327 |
| `listAllNewInquiries` | [app/system/production/EstimateScreens.tsx](<../../../app/system/production/EstimateScreens.tsx>) | 329–339 |
| `ProductionEstimates` | [app/system/production/EstimateScreens.tsx](<../../../app/system/production/EstimateScreens.tsx>) | 341–509 |
| `EstimateStartPanel` | [app/system/production/EstimateScreens.tsx](<../../../app/system/production/EstimateScreens.tsx>) | 513–552 |
| `CreateEstimateModal` | [app/system/production/EstimateScreens.tsx](<../../../app/system/production/EstimateScreens.tsx>) | 558–619 |
| `ProductionEstimateWorkspace` | [app/system/production/EstimateScreens.tsx](<../../../app/system/production/EstimateScreens.tsx>) | 621–1116 |
| `moduleKeyOf` | [app/system/production/EstimateScreens.tsx](<../../../app/system/production/EstimateScreens.tsx>) | 1133–1133 |
| `lineNeedsPrice` | [app/system/production/EstimateScreens.tsx](<../../../app/system/production/EstimateScreens.tsx>) | 1135–1135 |
| `lineNeedsSupplier` | [app/system/production/EstimateScreens.tsx](<../../../app/system/production/EstimateScreens.tsx>) | 1136–1136 |
| `costModuleGroups` | [app/system/production/EstimateScreens.tsx](<../../../app/system/production/EstimateScreens.tsx>) | 1138–1159 |
| `EstimateNextSteps` | [app/system/production/EstimateScreens.tsx](<../../../app/system/production/EstimateScreens.tsx>) | 1161–1188 |
| `EstimateSummaryTab` | [app/system/production/EstimateScreens.tsx](<../../../app/system/production/EstimateScreens.tsx>) | 1190–1210 |
| `EstimateCostItemsTab` | [app/system/production/EstimateScreens.tsx](<../../../app/system/production/EstimateScreens.tsx>) | 1212–1538 |
| `costSeedFromLine` | [app/system/production/EstimateScreens.tsx](<../../../app/system/production/EstimateScreens.tsx>) | 1540–1548 |
| `AddItemsSources` | [app/system/production/EstimateScreens.tsx](<../../../app/system/production/EstimateScreens.tsx>) | 1562–1566 |
| `PriceLibraryPicker` | [app/system/production/EstimateScreens.tsx](<../../../app/system/production/EstimateScreens.tsx>) | 1568–1595 |
| `CopyPreviousEstimateModal` | [app/system/production/EstimateScreens.tsx](<../../../app/system/production/EstimateScreens.tsx>) | 1602–1658 |
| `normalizedHeader` | [app/system/production/EstimateScreens.tsx](<../../../app/system/production/EstimateScreens.tsx>) | 1662–1662 |
| `spreadsheetValue` | [app/system/production/EstimateScreens.tsx](<../../../app/system/production/EstimateScreens.tsx>) | 1663–1666 |
| `spreadsheetText` | [app/system/production/EstimateScreens.tsx](<../../../app/system/production/EstimateScreens.tsx>) | 1667–1667 |
| `spreadsheetNumber` | [app/system/production/EstimateScreens.tsx](<../../../app/system/production/EstimateScreens.tsx>) | 1668–1671 |
| `excelDate` | [app/system/production/EstimateScreens.tsx](<../../../app/system/production/EstimateScreens.tsx>) | 1672–1676 |
| `ImportCostItemsModal` | [app/system/production/EstimateScreens.tsx](<../../../app/system/production/EstimateScreens.tsx>) | 1678–1713 |
| `ApplyModuleTemplateModal` | [app/system/production/EstimateScreens.tsx](<../../../app/system/production/EstimateScreens.tsx>) | 1717–1809 |
| `SaveModuleTemplateModal` | [app/system/production/EstimateScreens.tsx](<../../../app/system/production/EstimateScreens.tsx>) | 1813–1839 |
| `CopyCostModuleModal` | [app/system/production/EstimateScreens.tsx](<../../../app/system/production/EstimateScreens.tsx>) | 1841–1870 |
| `MainModuleEditor` | [app/system/production/EstimateScreens.tsx](<../../../app/system/production/EstimateScreens.tsx>) | 1872–1887 |
| `EstimateOtherCostTab` | [app/system/production/EstimateScreens.tsx](<../../../app/system/production/EstimateScreens.tsx>) | 1889–1965 |
| `EstimateAssignmentTab` | [app/system/production/EstimateScreens.tsx](<../../../app/system/production/EstimateScreens.tsx>) | 1967–1972 |
| `EstimateValidationTab` | [app/system/production/EstimateScreens.tsx](<../../../app/system/production/EstimateScreens.tsx>) | 1974–1983 |
| `revisionWithCurrent` | [app/system/production/EstimateScreens.tsx](<../../../app/system/production/EstimateScreens.tsx>) | 1985–1989 |
| `RevisionDescription` | [app/system/production/EstimateScreens.tsx](<../../../app/system/production/EstimateScreens.tsx>) | 1993–2005 |
| `revisionStatusView` | [app/system/production/EstimateScreens.tsx](<../../../app/system/production/EstimateScreens.tsx>) | 2007–2013 |
| `revisionReasonText` | [app/system/production/EstimateScreens.tsx](<../../../app/system/production/EstimateScreens.tsx>) | 2014–2016 |
| `EstimateRevisionTab` | [app/system/production/EstimateScreens.tsx](<../../../app/system/production/EstimateScreens.tsx>) | 2018–2036 |
| `EstimateCompareTab` | [app/system/production/EstimateScreens.tsx](<../../../app/system/production/EstimateScreens.tsx>) | 2038–2052 |
| `EstimateReviewSummary` | [app/system/production/EstimateScreens.tsx](<../../../app/system/production/EstimateScreens.tsx>) | 2057–2139 |
| `CostItemEditor` | [app/system/production/EstimateScreens.tsx](<../../../app/system/production/EstimateScreens.tsx>) | 2141–2188 |
| `WorkPackageEditor` | [app/system/production/EstimateScreens.tsx](<../../../app/system/production/EstimateScreens.tsx>) | 2190–2198 |
| `DisciplineSelect` | [app/system/production/EstimateScreens.tsx](<../../../app/system/production/EstimateScreens.tsx>) | 2200–2205 |
| `ManhourEditor` | [app/system/production/EstimateScreens.tsx](<../../../app/system/production/EstimateScreens.tsx>) | 2207–2259 |
| `ExpenseEditor` | [app/system/production/EstimateScreens.tsx](<../../../app/system/production/EstimateScreens.tsx>) | 2261–2277 |
| `OtherCostEditor` | [app/system/production/EstimateScreens.tsx](<../../../app/system/production/EstimateScreens.tsx>) | 2279–2286 |
| `CreateAssignmentModal` | [app/system/production/EstimateScreens.tsx](<../../../app/system/production/EstimateScreens.tsx>) | 2288–2313 |
| `AssignmentEditor` | [app/system/production/EstimateScreens.tsx](<../../../app/system/production/EstimateScreens.tsx>) | 2315–2325 |
| `WorkflowModal` | [app/system/production/EstimateScreens.tsx](<../../../app/system/production/EstimateScreens.tsx>) | 2335–2375 |
| `numberOf` | [app/system/production/EstimateLaborSheet.tsx](<../../../app/system/production/EstimateLaborSheet.tsx>) | 54–54 |
| `formatMoney` | [app/system/production/EstimateLaborSheet.tsx](<../../../app/system/production/EstimateLaborSheet.tsx>) | 55–55 |
| `formatNumber` | [app/system/production/EstimateLaborSheet.tsx](<../../../app/system/production/EstimateLaborSheet.tsx>) | 56–56 |
| `copy` | [app/system/production/EstimateLaborSheet.tsx](<../../../app/system/production/EstimateLaborSheet.tsx>) | 57–57 |
| `canOwnEstimate` | [app/system/production/EstimateLaborSheet.tsx](<../../../app/system/production/EstimateLaborSheet.tsx>) | 58–58 |
| `disciplineLabel` | [app/system/production/EstimateLaborSheet.tsx](<../../../app/system/production/EstimateLaborSheet.tsx>) | 61–69 |
| `defaultWorkPackage` | [app/system/production/EstimateLaborSheet.tsx](<../../../app/system/production/EstimateLaborSheet.tsx>) | 72–74 |
| `useEngineeringRateOptions` | [app/system/production/EstimateLaborSheet.tsx](<../../../app/system/production/EstimateLaborSheet.tsx>) | 80–105 |
| `disciplineRates` | [app/system/production/EstimateLaborSheet.tsx](<../../../app/system/production/EstimateLaborSheet.tsx>) | 108–111 |
| `EstimateLaborTab` | [app/system/production/EstimateLaborSheet.tsx](<../../../app/system/production/EstimateLaborSheet.tsx>) | 113–411 |
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
- [backend-node/src/user-roles.ts](<../../../backend-node/src/user-roles.ts>)
- [backend-node/src/estimate-total-guard.ts](<../../../backend-node/src/estimate-total-guard.ts>)
- [backend-node/src/overhead.ts](<../../../backend-node/src/overhead.ts>)
- [backend-node/src/estimate-copy-plan.ts](<../../../backend-node/src/estimate-copy-plan.ts>)
- [backend-node/src/routes/estimate-cost-write.ts](<../../../backend-node/src/routes/estimate-cost-write.ts>)
- [backend-node/src/routes/estimate-copy.ts](<../../../backend-node/src/routes/estimate-copy.ts>)
- [backend-node/src/feature-flags.ts](<../../../backend-node/src/feature-flags.ts>)
- [backend-node/src/estimate-disciplines.ts](<../../../backend-node/src/estimate-disciplines.ts>)
- [backend-node/src/estimate-module-details.ts](<../../../backend-node/src/estimate-module-details.ts>)
- [backend-node/src/email.ts](<../../../backend-node/src/email.ts>)
- [backend-node/src/estimate-sections.ts](<../../../backend-node/src/estimate-sections.ts>)
- [lib/remembered-view.ts](<../../../lib/remembered-view.ts>)
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
- [app/system/production/EstimateEffortCells.tsx](<../../../app/system/production/EstimateEffortCells.tsx>)
- [app/system/production/LaborPackagePicker.tsx](<../../../app/system/production/LaborPackagePicker.tsx>)
- [app/system/production/LaborPackageMaster.tsx](<../../../app/system/production/LaborPackageMaster.tsx>)

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
- [tests/estimate-labor-discipline.test.mjs](<../../../tests/estimate-labor-discipline.test.mjs>)
- [tests/estimate-navigation.test.mjs](<../../../tests/estimate-navigation.test.mjs>)
- [tests/estimate-order.test.mjs](<../../../tests/estimate-order.test.mjs>)
- [tests/estimate-template-selection.test.mjs](<../../../tests/estimate-template-selection.test.mjs>)
- [tests/estimate-total-guardrails.test.mjs](<../../../tests/estimate-total-guardrails.test.mjs>)
- [tests/estimate-ux.test.mjs](<../../../tests/estimate-ux.test.mjs>)
- [tests/project-without-estimate.test.mjs](<../../../tests/project-without-estimate.test.mjs>)
- [backend-node/tests/document-lifecycle.test.ts](<../../../backend-node/tests/document-lifecycle.test.ts>)
- [backend-node/tests/estimate-admin-self-decision.test.ts](<../../../backend-node/tests/estimate-admin-self-decision.test.ts>)
- [backend-node/tests/estimate-assignments-read.test.ts](<../../../backend-node/tests/estimate-assignments-read.test.ts>)
- [backend-node/tests/estimate-copy-plan.test.ts](<../../../backend-node/tests/estimate-copy-plan.test.ts>)
- [backend-node/tests/estimate-copy-route.test.ts](<../../../backend-node/tests/estimate-copy-route.test.ts>)
- [backend-node/tests/estimate-cost-drag.test.ts](<../../../backend-node/tests/estimate-cost-drag.test.ts>)
- [backend-node/tests/estimate-cost-lookup.test.ts](<../../../backend-node/tests/estimate-cost-lookup.test.ts>)
- [backend-node/tests/estimate-disciplines.test.ts](<../../../backend-node/tests/estimate-disciplines.test.ts>)
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
- [backend-node/tests/estimate-sections.test.ts](<../../../backend-node/tests/estimate-sections.test.ts>)
- [backend-node/tests/estimate-standalone.test.ts](<../../../backend-node/tests/estimate-standalone.test.ts>)
- [backend-node/tests/estimate-total-guard.test.ts](<../../../backend-node/tests/estimate-total-guard.test.ts>)

## Client contract lookup

Search the selected API path or function in [app/system/api-client.ts](<../../../app/system/api-client.ts>); follow its screen callers. Common UI/language changes require [app/system/ui.tsx](<../../../app/system/ui.tsx>) and [app/system/i18n.ts](<../../../app/system/i18n.ts>). For SQL changes use [schema map](../SCHEMA.md).
