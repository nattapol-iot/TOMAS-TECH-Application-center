# Estimate Cost

[Context index](../../../AGENTS.md) · [Architecture](../ARCHITECTURE.md) · [Change guide](../WORKFLOW.md)

สร้าง revision รายการต้นทุน ค่าใช้จ่าย validation และ workflow

Evidence: snapshot `df41e727`; source map, not a live availability claim. Test candidates use filename matching and are not exhaustive coverage.

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
| `EMPTY_PAGE` | [app/system/production/EstimateScreens.tsx](<../../../app/system/production/EstimateScreens.tsx>) | 132–132 |
| `priceAgeInDays` | [app/system/production/EstimateScreens.tsx](<../../../app/system/production/EstimateScreens.tsx>) | 140–140 |
| `loadAllEstimateSummaries` | [app/system/production/EstimateScreens.tsx](<../../../app/system/production/EstimateScreens.tsx>) | 150–157 |
| `loadAllSupplierPriceHistoryRecords` | [app/system/production/EstimateScreens.tsx](<../../../app/system/production/EstimateScreens.tsx>) | 159–166 |
| `mapLimited` | [app/system/production/EstimateScreens.tsx](<../../../app/system/production/EstimateScreens.tsx>) | 168–179 |
| `loadPriceLibraryRecords` | [app/system/production/EstimateScreens.tsx](<../../../app/system/production/EstimateScreens.tsx>) | 181–236 |
| `toError` | [app/system/production/EstimateScreens.tsx](<../../../app/system/production/EstimateScreens.tsx>) | 238–238 |
| `isCriticalValidationIssue` | [app/system/production/EstimateScreens.tsx](<../../../app/system/production/EstimateScreens.tsx>) | 239–239 |
| `numberOf` | [app/system/production/EstimateScreens.tsx](<../../../app/system/production/EstimateScreens.tsx>) | 240–240 |
| `formatMoney` | [app/system/production/EstimateScreens.tsx](<../../../app/system/production/EstimateScreens.tsx>) | 241–241 |
| `formatNumber` | [app/system/production/EstimateScreens.tsx](<../../../app/system/production/EstimateScreens.tsx>) | 242–242 |
| `dateValue` | [app/system/production/EstimateScreens.tsx](<../../../app/system/production/EstimateScreens.tsx>) | 243–243 |
| `formatDate` | [app/system/production/EstimateScreens.tsx](<../../../app/system/production/EstimateScreens.tsx>) | 244–248 |
| `formatDateTime` | [app/system/production/EstimateScreens.tsx](<../../../app/system/production/EstimateScreens.tsx>) | 249–253 |
| `businessDate` | [app/system/production/EstimateScreens.tsx](<../../../app/system/production/EstimateScreens.tsx>) | 254–258 |
| `futureDate` | [app/system/production/EstimateScreens.tsx](<../../../app/system/production/EstimateScreens.tsx>) | 259–259 |
| `normalizeEstimateDueDate` | [app/system/production/EstimateScreens.tsx](<../../../app/system/production/EstimateScreens.tsx>) | 260–260 |
| `canOwnEstimate` | [app/system/production/EstimateScreens.tsx](<../../../app/system/production/EstimateScreens.tsx>) | 261–261 |
| `canAssignEstimateOwner` | [app/system/production/EstimateScreens.tsx](<../../../app/system/production/EstimateScreens.tsx>) | 262–262 |
| `assignmentResultMessage` | [app/system/production/EstimateScreens.tsx](<../../../app/system/production/EstimateScreens.tsx>) | 263–269 |
| `revisionCode` | [app/system/production/EstimateScreens.tsx](<../../../app/system/production/EstimateScreens.tsx>) | 270–270 |
| `estimateCopy` | [app/system/production/EstimateScreens.tsx](<../../../app/system/production/EstimateScreens.tsx>) | 271–271 |
| `estimateStatusView` | [app/system/production/EstimateScreens.tsx](<../../../app/system/production/EstimateScreens.tsx>) | 283–289 |
| `isClosedEstimateStatus` | [app/system/production/EstimateScreens.tsx](<../../../app/system/production/EstimateScreens.tsx>) | 290–290 |
| `dueDistance` | [app/system/production/EstimateScreens.tsx](<../../../app/system/production/EstimateScreens.tsx>) | 292–298 |
| `latestSendBack` | [app/system/production/EstimateScreens.tsx](<../../../app/system/production/EstimateScreens.tsx>) | 301–307 |
| `copyResultMessage` | [app/system/production/EstimateScreens.tsx](<../../../app/system/production/EstimateScreens.tsx>) | 308–320 |
| `LoadError` | [app/system/production/EstimateScreens.tsx](<../../../app/system/production/EstimateScreens.tsx>) | 322–324 |
| `FilterSelect` | [app/system/production/EstimateScreens.tsx](<../../../app/system/production/EstimateScreens.tsx>) | 326–328 |
| `listAllNewInquiries` | [app/system/production/EstimateScreens.tsx](<../../../app/system/production/EstimateScreens.tsx>) | 330–340 |
| `ProductionEstimates` | [app/system/production/EstimateScreens.tsx](<../../../app/system/production/EstimateScreens.tsx>) | 342–510 |
| `EstimateStartPanel` | [app/system/production/EstimateScreens.tsx](<../../../app/system/production/EstimateScreens.tsx>) | 514–553 |
| `CreateEstimateModal` | [app/system/production/EstimateScreens.tsx](<../../../app/system/production/EstimateScreens.tsx>) | 559–620 |
| `ProductionEstimateWorkspace` | [app/system/production/EstimateScreens.tsx](<../../../app/system/production/EstimateScreens.tsx>) | 622–1117 |
| `moduleKeyOf` | [app/system/production/EstimateScreens.tsx](<../../../app/system/production/EstimateScreens.tsx>) | 1134–1134 |
| `costGroupKeyOf` | [app/system/production/EstimateScreens.tsx](<../../../app/system/production/EstimateScreens.tsx>) | 1136–1139 |
| `lineNeedsPrice` | [app/system/production/EstimateScreens.tsx](<../../../app/system/production/EstimateScreens.tsx>) | 1141–1141 |
| `lineNeedsSupplier` | [app/system/production/EstimateScreens.tsx](<../../../app/system/production/EstimateScreens.tsx>) | 1142–1142 |
| `costModuleGroups` | [app/system/production/EstimateScreens.tsx](<../../../app/system/production/EstimateScreens.tsx>) | 1144–1165 |
| `EstimateNextSteps` | [app/system/production/EstimateScreens.tsx](<../../../app/system/production/EstimateScreens.tsx>) | 1167–1194 |
| `EstimateSummaryTab` | [app/system/production/EstimateScreens.tsx](<../../../app/system/production/EstimateScreens.tsx>) | 1196–1216 |
| `EstimateCostItemsTab` | [app/system/production/EstimateScreens.tsx](<../../../app/system/production/EstimateScreens.tsx>) | 1218–1566 |
| `costSeedFromLine` | [app/system/production/EstimateScreens.tsx](<../../../app/system/production/EstimateScreens.tsx>) | 1568–1576 |
| `AddItemsSources` | [app/system/production/EstimateScreens.tsx](<../../../app/system/production/EstimateScreens.tsx>) | 1590–1594 |
| `PriceLibraryPicker` | [app/system/production/EstimateScreens.tsx](<../../../app/system/production/EstimateScreens.tsx>) | 1596–1623 |
| `CopyPreviousEstimateModal` | [app/system/production/EstimateScreens.tsx](<../../../app/system/production/EstimateScreens.tsx>) | 1630–1727 |
| `normalizedHeader` | [app/system/production/EstimateScreens.tsx](<../../../app/system/production/EstimateScreens.tsx>) | 1731–1731 |
| `spreadsheetValue` | [app/system/production/EstimateScreens.tsx](<../../../app/system/production/EstimateScreens.tsx>) | 1732–1735 |
| `spreadsheetText` | [app/system/production/EstimateScreens.tsx](<../../../app/system/production/EstimateScreens.tsx>) | 1736–1736 |
| `spreadsheetNumber` | [app/system/production/EstimateScreens.tsx](<../../../app/system/production/EstimateScreens.tsx>) | 1737–1740 |
| `excelDate` | [app/system/production/EstimateScreens.tsx](<../../../app/system/production/EstimateScreens.tsx>) | 1741–1745 |
| `ImportCostItemsModal` | [app/system/production/EstimateScreens.tsx](<../../../app/system/production/EstimateScreens.tsx>) | 1747–1782 |
| `ApplyModuleTemplateModal` | [app/system/production/EstimateScreens.tsx](<../../../app/system/production/EstimateScreens.tsx>) | 1786–1878 |
| `SaveModuleTemplateModal` | [app/system/production/EstimateScreens.tsx](<../../../app/system/production/EstimateScreens.tsx>) | 1882–1908 |
| `CopyCostModuleModal` | [app/system/production/EstimateScreens.tsx](<../../../app/system/production/EstimateScreens.tsx>) | 1910–1939 |
| `MainModuleEditor` | [app/system/production/EstimateScreens.tsx](<../../../app/system/production/EstimateScreens.tsx>) | 1941–1956 |
| `EstimateOtherCostTab` | [app/system/production/EstimateScreens.tsx](<../../../app/system/production/EstimateScreens.tsx>) | 1958–2034 |
| `EstimateAssignmentTab` | [app/system/production/EstimateScreens.tsx](<../../../app/system/production/EstimateScreens.tsx>) | 2036–2041 |
| `EstimateValidationTab` | [app/system/production/EstimateScreens.tsx](<../../../app/system/production/EstimateScreens.tsx>) | 2043–2052 |
| `revisionWithCurrent` | [app/system/production/EstimateScreens.tsx](<../../../app/system/production/EstimateScreens.tsx>) | 2054–2058 |
| `RevisionDescription` | [app/system/production/EstimateScreens.tsx](<../../../app/system/production/EstimateScreens.tsx>) | 2062–2074 |
| `revisionStatusView` | [app/system/production/EstimateScreens.tsx](<../../../app/system/production/EstimateScreens.tsx>) | 2076–2082 |
| `revisionReasonText` | [app/system/production/EstimateScreens.tsx](<../../../app/system/production/EstimateScreens.tsx>) | 2083–2085 |
| `EstimateRevisionTab` | [app/system/production/EstimateScreens.tsx](<../../../app/system/production/EstimateScreens.tsx>) | 2087–2105 |
| `EstimateCompareTab` | [app/system/production/EstimateScreens.tsx](<../../../app/system/production/EstimateScreens.tsx>) | 2107–2121 |
| `EstimateReviewSummary` | [app/system/production/EstimateScreens.tsx](<../../../app/system/production/EstimateScreens.tsx>) | 2126–2208 |
| `CostItemEditor` | [app/system/production/EstimateScreens.tsx](<../../../app/system/production/EstimateScreens.tsx>) | 2210–2257 |
| `WorkPackageEditor` | [app/system/production/EstimateScreens.tsx](<../../../app/system/production/EstimateScreens.tsx>) | 2259–2267 |
| `DisciplineSelect` | [app/system/production/EstimateScreens.tsx](<../../../app/system/production/EstimateScreens.tsx>) | 2269–2274 |
| `ManhourEditor` | [app/system/production/EstimateScreens.tsx](<../../../app/system/production/EstimateScreens.tsx>) | 2276–2328 |
| `ExpenseEditor` | [app/system/production/EstimateScreens.tsx](<../../../app/system/production/EstimateScreens.tsx>) | 2330–2346 |
| `OtherCostEditor` | [app/system/production/EstimateScreens.tsx](<../../../app/system/production/EstimateScreens.tsx>) | 2348–2355 |
| `CreateAssignmentModal` | [app/system/production/EstimateScreens.tsx](<../../../app/system/production/EstimateScreens.tsx>) | 2357–2382 |
| `AssignmentEditor` | [app/system/production/EstimateScreens.tsx](<../../../app/system/production/EstimateScreens.tsx>) | 2384–2394 |
| `WorkflowModal` | [app/system/production/EstimateScreens.tsx](<../../../app/system/production/EstimateScreens.tsx>) | 2404–2444 |
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
- [lib/erp-estimate-workbook.ts](<../../../lib/erp-estimate-workbook.ts>)
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
