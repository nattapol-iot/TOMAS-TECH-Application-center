# Copy Estimate / Assignment queue

[Context index](../../../AGENTS.md) · [Architecture](../ARCHITECTURE.md) · [Change guide](../WORKFLOW.md)

คัดลอกหลาย ledger และแสดงงานที่ยังไม่เริ่มใน My Work

Evidence: snapshot `e7d7f326`; source map, not a live availability claim. Test candidates use filename matching and are not exhaustive coverage.

## Read only the operation you change

- [estimate-copy API and function map](../api/estimate-copy.md) — registered in Node app
- [estimate-assignments-read API and function map](../api/estimate-assignments-read.md) — registered in Node app

## UI function locator

Shared screens contain other modules: use the symbol and line range instead of reading the whole file.

| Symbol | Source | Lines |
|---|---|---|
| `EMPTY_PAGE` | [app/system/production/EstimateScreens.tsx](<../../../app/system/production/EstimateScreens.tsx>) | 142–142 |
| `priceAgeInDays` | [app/system/production/EstimateScreens.tsx](<../../../app/system/production/EstimateScreens.tsx>) | 150–150 |
| `loadAllEstimateSummaries` | [app/system/production/EstimateScreens.tsx](<../../../app/system/production/EstimateScreens.tsx>) | 160–167 |
| `loadAllSupplierPriceHistoryRecords` | [app/system/production/EstimateScreens.tsx](<../../../app/system/production/EstimateScreens.tsx>) | 169–176 |
| `mapLimited` | [app/system/production/EstimateScreens.tsx](<../../../app/system/production/EstimateScreens.tsx>) | 178–189 |
| `loadPriceLibraryRecords` | [app/system/production/EstimateScreens.tsx](<../../../app/system/production/EstimateScreens.tsx>) | 191–246 |
| `toError` | [app/system/production/EstimateScreens.tsx](<../../../app/system/production/EstimateScreens.tsx>) | 248–248 |
| `isCriticalValidationIssue` | [app/system/production/EstimateScreens.tsx](<../../../app/system/production/EstimateScreens.tsx>) | 249–249 |
| `numberOf` | [app/system/production/EstimateScreens.tsx](<../../../app/system/production/EstimateScreens.tsx>) | 250–250 |
| `formatMoney` | [app/system/production/EstimateScreens.tsx](<../../../app/system/production/EstimateScreens.tsx>) | 251–251 |
| `formatNumber` | [app/system/production/EstimateScreens.tsx](<../../../app/system/production/EstimateScreens.tsx>) | 252–252 |
| `dateValue` | [app/system/production/EstimateScreens.tsx](<../../../app/system/production/EstimateScreens.tsx>) | 253–253 |
| `formatDate` | [app/system/production/EstimateScreens.tsx](<../../../app/system/production/EstimateScreens.tsx>) | 254–258 |
| `formatDateTime` | [app/system/production/EstimateScreens.tsx](<../../../app/system/production/EstimateScreens.tsx>) | 259–263 |
| `businessDate` | [app/system/production/EstimateScreens.tsx](<../../../app/system/production/EstimateScreens.tsx>) | 264–268 |
| `futureDate` | [app/system/production/EstimateScreens.tsx](<../../../app/system/production/EstimateScreens.tsx>) | 269–269 |
| `normalizeEstimateDueDate` | [app/system/production/EstimateScreens.tsx](<../../../app/system/production/EstimateScreens.tsx>) | 270–270 |
| `canOwnEstimate` | [app/system/production/EstimateScreens.tsx](<../../../app/system/production/EstimateScreens.tsx>) | 271–271 |
| `canAssignEstimateOwner` | [app/system/production/EstimateScreens.tsx](<../../../app/system/production/EstimateScreens.tsx>) | 272–272 |
| `assignmentResultMessage` | [app/system/production/EstimateScreens.tsx](<../../../app/system/production/EstimateScreens.tsx>) | 273–279 |
| `revisionCode` | [app/system/production/EstimateScreens.tsx](<../../../app/system/production/EstimateScreens.tsx>) | 280–280 |
| `estimateCopy` | [app/system/production/EstimateScreens.tsx](<../../../app/system/production/EstimateScreens.tsx>) | 281–281 |
| `estimateStatusView` | [app/system/production/EstimateScreens.tsx](<../../../app/system/production/EstimateScreens.tsx>) | 293–299 |
| `isClosedEstimateStatus` | [app/system/production/EstimateScreens.tsx](<../../../app/system/production/EstimateScreens.tsx>) | 300–300 |
| `dueDistance` | [app/system/production/EstimateScreens.tsx](<../../../app/system/production/EstimateScreens.tsx>) | 302–308 |
| `latestSendBack` | [app/system/production/EstimateScreens.tsx](<../../../app/system/production/EstimateScreens.tsx>) | 311–317 |
| `copyResultMessage` | [app/system/production/EstimateScreens.tsx](<../../../app/system/production/EstimateScreens.tsx>) | 318–330 |
| `LoadError` | [app/system/production/EstimateScreens.tsx](<../../../app/system/production/EstimateScreens.tsx>) | 332–334 |
| `FilterSelect` | [app/system/production/EstimateScreens.tsx](<../../../app/system/production/EstimateScreens.tsx>) | 336–338 |
| `listAllNewInquiries` | [app/system/production/EstimateScreens.tsx](<../../../app/system/production/EstimateScreens.tsx>) | 340–350 |
| `ProductionEstimates` | [app/system/production/EstimateScreens.tsx](<../../../app/system/production/EstimateScreens.tsx>) | 352–531 |
| `EstimateStartPanel` | [app/system/production/EstimateScreens.tsx](<../../../app/system/production/EstimateScreens.tsx>) | 535–574 |
| `CreateEstimateModal` | [app/system/production/EstimateScreens.tsx](<../../../app/system/production/EstimateScreens.tsx>) | 580–641 |
| `ProductionEstimateWorkspace` | [app/system/production/EstimateScreens.tsx](<../../../app/system/production/EstimateScreens.tsx>) | 643–1217 |
| `moduleKeyOf` | [app/system/production/EstimateScreens.tsx](<../../../app/system/production/EstimateScreens.tsx>) | 1234–1234 |
| `costGroupKeyOf` | [app/system/production/EstimateScreens.tsx](<../../../app/system/production/EstimateScreens.tsx>) | 1236–1239 |
| `lineNeedsPrice` | [app/system/production/EstimateScreens.tsx](<../../../app/system/production/EstimateScreens.tsx>) | 1241–1241 |
| `lineNeedsSupplier` | [app/system/production/EstimateScreens.tsx](<../../../app/system/production/EstimateScreens.tsx>) | 1242–1242 |
| `costModuleGroups` | [app/system/production/EstimateScreens.tsx](<../../../app/system/production/EstimateScreens.tsx>) | 1244–1265 |
| `EstimateNextSteps` | [app/system/production/EstimateScreens.tsx](<../../../app/system/production/EstimateScreens.tsx>) | 1267–1294 |
| `EstimateSummaryTab` | [app/system/production/EstimateScreens.tsx](<../../../app/system/production/EstimateScreens.tsx>) | 1296–1316 |
| `EstimateCostItemsTab` | [app/system/production/EstimateScreens.tsx](<../../../app/system/production/EstimateScreens.tsx>) | 1318–1671 |
| `costSeedFromLine` | [app/system/production/EstimateScreens.tsx](<../../../app/system/production/EstimateScreens.tsx>) | 1673–1681 |
| `AddItemsSources` | [app/system/production/EstimateScreens.tsx](<../../../app/system/production/EstimateScreens.tsx>) | 1696–1700 |
| `PriceLibraryPicker` | [app/system/production/EstimateScreens.tsx](<../../../app/system/production/EstimateScreens.tsx>) | 1702–1729 |
| `CopyPreviousEstimateModal` | [app/system/production/EstimateScreens.tsx](<../../../app/system/production/EstimateScreens.tsx>) | 1736–1833 |
| `normalizedHeader` | [app/system/production/EstimateScreens.tsx](<../../../app/system/production/EstimateScreens.tsx>) | 1837–1837 |
| `spreadsheetValue` | [app/system/production/EstimateScreens.tsx](<../../../app/system/production/EstimateScreens.tsx>) | 1838–1841 |
| `spreadsheetText` | [app/system/production/EstimateScreens.tsx](<../../../app/system/production/EstimateScreens.tsx>) | 1842–1842 |
| `spreadsheetNumber` | [app/system/production/EstimateScreens.tsx](<../../../app/system/production/EstimateScreens.tsx>) | 1843–1846 |
| `excelDate` | [app/system/production/EstimateScreens.tsx](<../../../app/system/production/EstimateScreens.tsx>) | 1847–1851 |
| `ImportCostItemsModal` | [app/system/production/EstimateScreens.tsx](<../../../app/system/production/EstimateScreens.tsx>) | 1853–1888 |
| `ApplyModuleTemplateModal` | [app/system/production/EstimateScreens.tsx](<../../../app/system/production/EstimateScreens.tsx>) | 1892–1984 |
| `SaveModuleTemplateModal` | [app/system/production/EstimateScreens.tsx](<../../../app/system/production/EstimateScreens.tsx>) | 1988–2014 |
| `CopyCostModuleModal` | [app/system/production/EstimateScreens.tsx](<../../../app/system/production/EstimateScreens.tsx>) | 2016–2045 |
| `MainModuleEditor` | [app/system/production/EstimateScreens.tsx](<../../../app/system/production/EstimateScreens.tsx>) | 2047–2062 |
| `EstimateOtherCostTab` | [app/system/production/EstimateScreens.tsx](<../../../app/system/production/EstimateScreens.tsx>) | 2064–2140 |
| `EstimateAssignmentTab` | [app/system/production/EstimateScreens.tsx](<../../../app/system/production/EstimateScreens.tsx>) | 2142–2147 |
| `EstimateValidationTab` | [app/system/production/EstimateScreens.tsx](<../../../app/system/production/EstimateScreens.tsx>) | 2149–2158 |
| `revisionWithCurrent` | [app/system/production/EstimateScreens.tsx](<../../../app/system/production/EstimateScreens.tsx>) | 2160–2164 |
| `RevisionDescription` | [app/system/production/EstimateScreens.tsx](<../../../app/system/production/EstimateScreens.tsx>) | 2168–2180 |
| `revisionStatusView` | [app/system/production/EstimateScreens.tsx](<../../../app/system/production/EstimateScreens.tsx>) | 2182–2190 |
| `wentBackReason` | [app/system/production/EstimateScreens.tsx](<../../../app/system/production/EstimateScreens.tsx>) | 2192–2197 |
| `revisionReasonText` | [app/system/production/EstimateScreens.tsx](<../../../app/system/production/EstimateScreens.tsx>) | 2198–2200 |
| `EstimateRevisionTab` | [app/system/production/EstimateScreens.tsx](<../../../app/system/production/EstimateScreens.tsx>) | 2202–2230 |
| `EstimateCompareTab` | [app/system/production/EstimateScreens.tsx](<../../../app/system/production/EstimateScreens.tsx>) | 2232–2246 |
| `EstimateReviewSummary` | [app/system/production/EstimateScreens.tsx](<../../../app/system/production/EstimateScreens.tsx>) | 2251–2333 |
| `CostItemEditor` | [app/system/production/EstimateScreens.tsx](<../../../app/system/production/EstimateScreens.tsx>) | 2335–2382 |
| `WorkPackageEditor` | [app/system/production/EstimateScreens.tsx](<../../../app/system/production/EstimateScreens.tsx>) | 2384–2392 |
| `DisciplineSelect` | [app/system/production/EstimateScreens.tsx](<../../../app/system/production/EstimateScreens.tsx>) | 2394–2399 |
| `ManhourEditor` | [app/system/production/EstimateScreens.tsx](<../../../app/system/production/EstimateScreens.tsx>) | 2401–2453 |
| `ExpenseEditor` | [app/system/production/EstimateScreens.tsx](<../../../app/system/production/EstimateScreens.tsx>) | 2455–2471 |
| `OtherCostEditor` | [app/system/production/EstimateScreens.tsx](<../../../app/system/production/EstimateScreens.tsx>) | 2473–2480 |
| `CreateAssignmentModal` | [app/system/production/EstimateScreens.tsx](<../../../app/system/production/EstimateScreens.tsx>) | 2482–2507 |
| `AssignmentEditor` | [app/system/production/EstimateScreens.tsx](<../../../app/system/production/EstimateScreens.tsx>) | 2509–2519 |
| `WorkflowModal` | [app/system/production/EstimateScreens.tsx](<../../../app/system/production/EstimateScreens.tsx>) | 2529–2569 |
| `toError` | [app/system/production/PlanningPricingScreens.tsx](<../../../app/system/production/PlanningPricingScreens.tsx>) | 400–400 |
| `isConcurrencyConflict` | [app/system/production/PlanningPricingScreens.tsx](<../../../app/system/production/PlanningPricingScreens.tsx>) | 401–401 |
| `money` | [app/system/production/PlanningPricingScreens.tsx](<../../../app/system/production/PlanningPricingScreens.tsx>) | 402–407 |
| `number` | [app/system/production/PlanningPricingScreens.tsx](<../../../app/system/production/PlanningPricingScreens.tsx>) | 408–408 |
| `date` | [app/system/production/PlanningPricingScreens.tsx](<../../../app/system/production/PlanningPricingScreens.tsx>) | 409–409 |
| `dateTime` | [app/system/production/PlanningPricingScreens.tsx](<../../../app/system/production/PlanningPricingScreens.tsx>) | 410–414 |
| `isoToday` | [app/system/production/PlanningPricingScreens.tsx](<../../../app/system/production/PlanningPricingScreens.tsx>) | 416–416 |
| `ageInDays` | [app/system/production/PlanningPricingScreens.tsx](<../../../app/system/production/PlanningPricingScreens.tsx>) | 417–423 |
| `hostOf` | [app/system/production/PlanningPricingScreens.tsx](<../../../app/system/production/PlanningPricingScreens.tsx>) | 425–431 |
| `flattenTasks` | [app/system/production/PlanningPricingScreens.tsx](<../../../app/system/production/PlanningPricingScreens.tsx>) | 432–432 |
| `ResourcePlanLock` | [app/system/production/PlanningPricingScreens.tsx](<../../../app/system/production/PlanningPricingScreens.tsx>) | 435–442 |
| `LoadError` | [app/system/production/PlanningPricingScreens.tsx](<../../../app/system/production/PlanningPricingScreens.tsx>) | 444–460 |
| `PermissionNotice` | [app/system/production/PlanningPricingScreens.tsx](<../../../app/system/production/PlanningPricingScreens.tsx>) | 462–469 |
| `loadAllEstimates` | [app/system/production/PlanningPricingScreens.tsx](<../../../app/system/production/PlanningPricingScreens.tsx>) | 471–480 |
| `loadAllProjects` | [app/system/production/PlanningPricingScreens.tsx](<../../../app/system/production/PlanningPricingScreens.tsx>) | 482–491 |
| `loadAllSupplierPriceHistory` | [app/system/production/PlanningPricingScreens.tsx](<../../../app/system/production/PlanningPricingScreens.tsx>) | 493–502 |
| `mapSettledLimited` | [app/system/production/PlanningPricingScreens.tsx](<../../../app/system/production/PlanningPricingScreens.tsx>) | 504–520 |
| `loadPriceRecords` | [app/system/production/PlanningPricingScreens.tsx](<../../../app/system/production/PlanningPricingScreens.tsx>) | 522–634 |
| `loadSchedules` | [app/system/production/PlanningPricingScreens.tsx](<../../../app/system/production/PlanningPricingScreens.tsx>) | 636–644 |
| `usePrices` | [app/system/production/PlanningPricingScreens.tsx](<../../../app/system/production/PlanningPricingScreens.tsx>) | 646–669 |
| `progressProblem` | [app/system/production/PlanningPricingScreens.tsx](<../../../app/system/production/PlanningPricingScreens.tsx>) | 672–683 |
| `ProgressModal` | [app/system/production/PlanningPricingScreens.tsx](<../../../app/system/production/PlanningPricingScreens.tsx>) | 685–888 |
| `workEffectiveFinish` | [app/system/production/PlanningPricingScreens.tsx](<../../../app/system/production/PlanningPricingScreens.tsx>) | 891–891 |
| `workIsLate` | [app/system/production/PlanningPricingScreens.tsx](<../../../app/system/production/PlanningPricingScreens.tsx>) | 893–893 |
| `workNeedsForecast` | [app/system/production/PlanningPricingScreens.tsx](<../../../app/system/production/PlanningPricingScreens.tsx>) | 894–894 |
| `workIsStale` | [app/system/production/PlanningPricingScreens.tsx](<../../../app/system/production/PlanningPricingScreens.tsx>) | 895–895 |
| `workLastReport` | [app/system/production/PlanningPricingScreens.tsx](<../../../app/system/production/PlanningPricingScreens.tsx>) | 897–897 |
| `workNeedsUpdate` | [app/system/production/PlanningPricingScreens.tsx](<../../../app/system/production/PlanningPricingScreens.tsx>) | 898–898 |
| `workUserNote` | [app/system/production/PlanningPricingScreens.tsx](<../../../app/system/production/PlanningPricingScreens.tsx>) | 899–899 |
| `historyReason` | [app/system/production/PlanningPricingScreens.tsx](<../../../app/system/production/PlanningPricingScreens.tsx>) | 901–901 |
| `historyValue` | [app/system/production/PlanningPricingScreens.tsx](<../../../app/system/production/PlanningPricingScreens.tsx>) | 904–904 |
| `historyShown` | [app/system/production/PlanningPricingScreens.tsx](<../../../app/system/production/PlanningPricingScreens.tsx>) | 906–907 |
| `daysFromToday` | [app/system/production/PlanningPricingScreens.tsx](<../../../app/system/production/PlanningPricingScreens.tsx>) | 908–908 |
| `myWorkInitials` | [app/system/production/PlanningPricingScreens.tsx](<../../../app/system/production/PlanningPricingScreens.tsx>) | 909–915 |
| `quietDays` | [app/system/production/PlanningPricingScreens.tsx](<../../../app/system/production/PlanningPricingScreens.tsx>) | 916–919 |
| `myWorkAuditFieldLabel` | [app/system/production/PlanningPricingScreens.tsx](<../../../app/system/production/PlanningPricingScreens.tsx>) | 938–938 |
| `matchesWorkFilter` | [app/system/production/PlanningPricingScreens.tsx](<../../../app/system/production/PlanningPricingScreens.tsx>) | 1013–1024 |
| `groupScheduleWork` | [app/system/production/PlanningPricingScreens.tsx](<../../../app/system/production/PlanningPricingScreens.tsx>) | 1026–1077 |
| `groupEstimateWork` | [app/system/production/PlanningPricingScreens.tsx](<../../../app/system/production/PlanningPricingScreens.tsx>) | 1079–1122 |
| `estimateGroupMatchesFilter` | [app/system/production/PlanningPricingScreens.tsx](<../../../app/system/production/PlanningPricingScreens.tsx>) | 1124–1131 |
| `MyEstimateAssignmentsPanel` | [app/system/production/PlanningPricingScreens.tsx](<../../../app/system/production/PlanningPricingScreens.tsx>) | 1144–1224 |
| `WorkGroupMeta` | [app/system/production/PlanningPricingScreens.tsx](<../../../app/system/production/PlanningPricingScreens.tsx>) | 1227–1291 |
| `EstimateWorkGroupCard` | [app/system/production/PlanningPricingScreens.tsx](<../../../app/system/production/PlanningPricingScreens.tsx>) | 1293–1379 |
| `EstimateNextActionDetail` | [app/system/production/PlanningPricingScreens.tsx](<../../../app/system/production/PlanningPricingScreens.tsx>) | 1381–1419 |
| `useMyEstimateAssignments` | [app/system/production/PlanningPricingScreens.tsx](<../../../app/system/production/PlanningPricingScreens.tsx>) | 1422–1452 |
| `ProductionMyWork` | [app/system/production/PlanningPricingScreens.tsx](<../../../app/system/production/PlanningPricingScreens.tsx>) | 1454–2227 |
| `QuickProgressControls` | [app/system/production/PlanningPricingScreens.tsx](<../../../app/system/production/PlanningPricingScreens.tsx>) | 2250–2401 |
| `workNeedsForecastFor` | [app/system/production/PlanningPricingScreens.tsx](<../../../app/system/production/PlanningPricingScreens.tsx>) | 2403–2403 |
| `myWorkProgressTarget` | [app/system/production/PlanningPricingScreens.tsx](<../../../app/system/production/PlanningPricingScreens.tsx>) | 2405–2416 |
| `ProductionWorkControls` | [app/system/production/PlanningPricingScreens.tsx](<../../../app/system/production/PlanningPricingScreens.tsx>) | 2418–2455 |
| `ProductionScheduleWorkGroup` | [app/system/production/PlanningPricingScreens.tsx](<../../../app/system/production/PlanningPricingScreens.tsx>) | 2457–2562 |
| `ProductionMyTaskRow` | [app/system/production/PlanningPricingScreens.tsx](<../../../app/system/production/PlanningPricingScreens.tsx>) | 2564–2758 |
| `ProductionRequestDaysModal` | [app/system/production/PlanningPricingScreens.tsx](<../../../app/system/production/PlanningPricingScreens.tsx>) | 2760–2824 |
| `ProductionPersonalTaskModal` | [app/system/production/PlanningPricingScreens.tsx](<../../../app/system/production/PlanningPricingScreens.tsx>) | 2826–2929 |
| `usePicOptions` | [app/system/production/PlanningPricingScreens.tsx](<../../../app/system/production/PlanningPricingScreens.tsx>) | 2932–2934 |
| `ensureScheduleMembers` | [app/system/production/PlanningPricingScreens.tsx](<../../../app/system/production/PlanningPricingScreens.tsx>) | 2935–2939 |
| `usePlanTeam` | [app/system/production/PlanningPricingScreens.tsx](<../../../app/system/production/PlanningPricingScreens.tsx>) | 2941–2961 |
| `PicPicker` | [app/system/production/PlanningPricingScreens.tsx](<../../../app/system/production/PlanningPricingScreens.tsx>) | 2962–2980 |
| `startDraftOf` | [app/system/production/PlanningPricingScreens.tsx](<../../../app/system/production/PlanningPricingScreens.tsx>) | 2984–2992 |
| `startReady` | [app/system/production/PlanningPricingScreens.tsx](<../../../app/system/production/PlanningPricingScreens.tsx>) | 2993–2993 |
| `startBody` | [app/system/production/PlanningPricingScreens.tsx](<../../../app/system/production/PlanningPricingScreens.tsx>) | 2995–2998 |
| `predecessorChoices` | [app/system/production/PlanningPricingScreens.tsx](<../../../app/system/production/PlanningPricingScreens.tsx>) | 3004–3024 |
| `PlanStartFields` | [app/system/production/PlanningPricingScreens.tsx](<../../../app/system/production/PlanningPricingScreens.tsx>) | 3027–3089 |
| `draftSpan` | [app/system/production/PlanningPricingScreens.tsx](<../../../app/system/production/PlanningPricingScreens.tsx>) | 3097–3101 |
| `PicFieldsWithLoad` | [app/system/production/PlanningPricingScreens.tsx](<../../../app/system/production/PlanningPricingScreens.tsx>) | 3104–3135 |
| `canTakeSubTasks` | [app/system/production/PlanningPricingScreens.tsx](<../../../app/system/production/PlanningPricingScreens.tsx>) | 3138–3142 |
| `customerPeriod` | [app/system/production/PlanningPricingScreens.tsx](<../../../app/system/production/PlanningPricingScreens.tsx>) | 3145–3146 |
| `periodDays` | [app/system/production/PlanningPricingScreens.tsx](<../../../app/system/production/PlanningPricingScreens.tsx>) | 3147–3147 |
| `customerPeriodReady` | [app/system/production/PlanningPricingScreens.tsx](<../../../app/system/production/PlanningPricingScreens.tsx>) | 3149–3149 |
| `CustomerPeriodFields` | [app/system/production/PlanningPricingScreens.tsx](<../../../app/system/production/PlanningPricingScreens.tsx>) | 3151–3169 |
| `draftDates` | [app/system/production/PlanningPricingScreens.tsx](<../../../app/system/production/PlanningPricingScreens.tsx>) | 3178–3181 |
| `draftLevel` | [app/system/production/PlanningPricingScreens.tsx](<../../../app/system/production/PlanningPricingScreens.tsx>) | 3187–3199 |
| `PlanRowDraftEditor` | [app/system/production/PlanningPricingScreens.tsx](<../../../app/system/production/PlanningPricingScreens.tsx>) | 3206–3353 |
| `EditScheduleTaskModal` | [app/system/production/PlanningPricingScreens.tsx](<../../../app/system/production/PlanningPricingScreens.tsx>) | 3360–3659 |
| `BaselineModal` | [app/system/production/PlanningPricingScreens.tsx](<../../../app/system/production/PlanningPricingScreens.tsx>) | 3661–3739 |
| `ScheduleDayRequestAnswerModal` | [app/system/production/PlanningPricingScreens.tsx](<../../../app/system/production/PlanningPricingScreens.tsx>) | 3741–3841 |
| `planProjectStorageKey` | [app/system/production/PlanningPricingScreens.tsx](<../../../app/system/production/PlanningPricingScreens.tsx>) | 3850–3850 |
| `readLegendOpen` | [app/system/production/PlanningPricingScreens.tsx](<../../../app/system/production/PlanningPricingScreens.tsx>) | 3856–3862 |
| `saveLegendOpen` | [app/system/production/PlanningPricingScreens.tsx](<../../../app/system/production/PlanningPricingScreens.tsx>) | 3863–3869 |
| `planCommitments` | [app/system/production/PlanningPricingScreens.tsx](<../../../app/system/production/PlanningPricingScreens.tsx>) | 3878–3913 |
| `memberWindowOf` | [app/system/production/PlanningPricingScreens.tsx](<../../../app/system/production/PlanningPricingScreens.tsx>) | 3915–3920 |
| `byProjectNumber` | [app/system/production/PlanningPricingScreens.tsx](<../../../app/system/production/PlanningPricingScreens.tsx>) | 3922–3922 |
| `isLeafTask` | [app/system/production/PlanningPricingScreens.tsx](<../../../app/system/production/PlanningPricingScreens.tsx>) | 3923–3923 |
| `taskOrDescendantMatches` | [app/system/production/PlanningPricingScreens.tsx](<../../../app/system/production/PlanningPricingScreens.tsx>) | 3924–3924 |
| `planRows` | [app/system/production/PlanningPricingScreens.tsx](<../../../app/system/production/PlanningPricingScreens.tsx>) | 3927–3938 |
| `memberGanttRows` | [app/system/production/PlanningPricingScreens.tsx](<../../../app/system/production/PlanningPricingScreens.tsx>) | 3946–4140 |
| `ProductionProjectSchedule` | [app/system/production/PlanningPricingScreens.tsx](<../../../app/system/production/PlanningPricingScreens.tsx>) | 4150–5518 |
| `PlanTaskDrawer` | [app/system/production/PlanningPricingScreens.tsx](<../../../app/system/production/PlanningPricingScreens.tsx>) | 5521–5727 |
| `PriceAgeBadge` | [app/system/production/PlanningPricingScreens.tsx](<../../../app/system/production/PlanningPricingScreens.tsx>) | 5729–5753 |
| `PriceLoadWarning` | [app/system/production/PlanningPricingScreens.tsx](<../../../app/system/production/PlanningPricingScreens.tsx>) | 5755–5770 |
| `ProductionPriceLibrary` | [app/system/production/PlanningPricingScreens.tsx](<../../../app/system/production/PlanningPricingScreens.tsx>) | 5772–6057 |
| `supplierQuotationCurrency` | [app/system/production/PlanningPricingScreens.tsx](<../../../app/system/production/PlanningPricingScreens.tsx>) | 6059–6060 |
| `addIsoDays` | [app/system/production/PlanningPricingScreens.tsx](<../../../app/system/production/PlanningPricingScreens.tsx>) | 6062–6066 |
| `quotationFileKind` | [app/system/production/PlanningPricingScreens.tsx](<../../../app/system/production/PlanningPricingScreens.tsx>) | 6068–6074 |
| `blankQuotationLine` | [app/system/production/PlanningPricingScreens.tsx](<../../../app/system/production/PlanningPricingScreens.tsx>) | 6076–6087 |
| `quotationLinesTotal` | [app/system/production/PlanningPricingScreens.tsx](<../../../app/system/production/PlanningPricingScreens.tsx>) | 6089–6089 |
| `thbRateInvalid` | [app/system/production/PlanningPricingScreens.tsx](<../../../app/system/production/PlanningPricingScreens.tsx>) | 6093–6097 |
| `thbRateOf` | [app/system/production/PlanningPricingScreens.tsx](<../../../app/system/production/PlanningPricingScreens.tsx>) | 6099–6099 |
| `catalogueKeyOf` | [app/system/production/PlanningPricingScreens.tsx](<../../../app/system/production/PlanningPricingScreens.tsx>) | 6117–6122 |
| `useCatalogueMatches` | [app/system/production/PlanningPricingScreens.tsx](<../../../app/system/production/PlanningPricingScreens.tsx>) | 6124–6162 |
| `priceChange` | [app/system/production/PlanningPricingScreens.tsx](<../../../app/system/production/PlanningPricingScreens.tsx>) | 6165–6168 |
| `CatalogueComparison` | [app/system/production/PlanningPricingScreens.tsx](<../../../app/system/production/PlanningPricingScreens.tsx>) | 6182–6287 |
| `QuotationLinesEditor` | [app/system/production/PlanningPricingScreens.tsx](<../../../app/system/production/PlanningPricingScreens.tsx>) | 6295–6446 |
| `SupplierQuotationUploadModal` | [app/system/production/PlanningPricingScreens.tsx](<../../../app/system/production/PlanningPricingScreens.tsx>) | 6448–7009 |
| `EditQuotationModal` | [app/system/production/PlanningPricingScreens.tsx](<../../../app/system/production/PlanningPricingScreens.tsx>) | 7011–7203 |
| `ReferencePriceModal` | [app/system/production/PlanningPricingScreens.tsx](<../../../app/system/production/PlanningPricingScreens.tsx>) | 7212–7357 |
| `ProductionSupplierQuotations` | [app/system/production/PlanningPricingScreens.tsx](<../../../app/system/production/PlanningPricingScreens.tsx>) | 7359–7770 |
| `ProductionWaitingSupplierPrice` | [app/system/production/PlanningPricingScreens.tsx](<../../../app/system/production/PlanningPricingScreens.tsx>) | 7772–7909 |

## Domain helpers / direct dependencies

- [backend-node/src/estimate-copy-plan.ts](<../../../backend-node/src/estimate-copy-plan.ts>)
- [backend-node/src/estimate-disciplines.ts](<../../../backend-node/src/estimate-disciplines.ts>)
- [backend-node/src/estimate-total-guard.ts](<../../../backend-node/src/estimate-total-guard.ts>)
- [backend-node/src/routes/estimate-cost-write.ts](<../../../backend-node/src/routes/estimate-cost-write.ts>)
- [app/system/dialogs.ts](<../../../app/system/dialogs.ts>)
- [lib/remembered-view.ts](<../../../lib/remembered-view.ts>)
- [app/system/production/use-estimate-navigation.ts](<../../../app/system/production/use-estimate-navigation.ts>)
- [lib/estimate-navigation.ts](<../../../lib/estimate-navigation.ts>)
- [app/system/production/DocumentLifecycle.tsx](<../../../app/system/production/DocumentLifecycle.tsx>)
- [app/system/production/EstimateModuleQuantityCells.tsx](<../../../app/system/production/EstimateModuleQuantityCells.tsx>)
- [app/system/production/EstimatePriceSetEditor.tsx](<../../../app/system/production/EstimatePriceSetEditor.tsx>)
- [app/system/production/EstimateModuleEditor.tsx](<../../../app/system/production/EstimateModuleEditor.tsx>)
- [app/system/i18n.ts](<../../../app/system/i18n.ts>)
- [app/system/production/EstimateExcelImport.tsx](<../../../app/system/production/EstimateExcelImport.tsx>)
- [app/system/production/EstimateQuotationSource.tsx](<../../../app/system/production/EstimateQuotationSource.tsx>)
- [app/system/production/EstimateOverheadPanel.tsx](<../../../app/system/production/EstimateOverheadPanel.tsx>)
- [lib/feature-flags.ts](<../../../lib/feature-flags.ts>)
- [lib/estimate-sections.ts](<../../../lib/estimate-sections.ts>)
- [lib/estimate-order.ts](<../../../lib/estimate-order.ts>)
- [app/system/production/EstimateErpSheet.tsx](<../../../app/system/production/EstimateErpSheet.tsx>)
- [app/system/production/EstimateRevisionView.tsx](<../../../app/system/production/EstimateRevisionView.tsx>)
- [app/system/production/EstimateLook.tsx](<../../../app/system/production/EstimateLook.tsx>)
- [app/system/production/EstimateV2Parts.tsx](<../../../app/system/production/EstimateV2Parts.tsx>)
- [lib/estimate-look.ts](<../../../lib/estimate-look.ts>)
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
- [app/system/DateInput.tsx](<../../../app/system/DateInput.tsx>)
- [app/system/production/SigningScreens.tsx](<../../../app/system/production/SigningScreens.tsx>)
- [app/system/production/ResourceTaskWorkspace.tsx](<../../../app/system/production/ResourceTaskWorkspace.tsx>)
- [app/system/production/SearchMultiPicker.tsx](<../../../app/system/production/SearchMultiPicker.tsx>)
- [lib/schedule-workbook.ts](<../../../lib/schedule-workbook.ts>)
- [lib/plan-discipline.ts](<../../../lib/plan-discipline.ts>)
- [app/system/production/MyIssues.tsx](<../../../app/system/production/MyIssues.tsx>)
- [app/system/production/issue-batch-client.ts](<../../../app/system/production/issue-batch-client.ts>)
- [lib/issue-batches.ts](<../../../lib/issue-batches.ts>)
- [app/system/use-activity-presence.ts](<../../../app/system/use-activity-presence.ts>)
- [app/system/production/LazyScreens.tsx](<../../../app/system/production/LazyScreens.tsx>)
- [app/system/project-overview-client.ts](<../../../app/system/project-overview-client.ts>)
- [lib/gantt.ts](<../../../lib/gantt.ts>)
- [app/system/production/GanttChart.tsx](<../../../app/system/production/GanttChart.tsx>)
- [app/system/use-fullscreen.ts](<../../../app/system/use-fullscreen.ts>)
- [app/system/resource-workload-client.ts](<../../../app/system/resource-workload-client.ts>)
- [lib/resource-planning.ts](<../../../lib/resource-planning.ts>)
- [lib/team-board.ts](<../../../lib/team-board.ts>)
- [app/system/production/PlanPicLoad.tsx](<../../../app/system/production/PlanPicLoad.tsx>)
- [app/system/screen-link.ts](<../../../app/system/screen-link.ts>)
- [app/system/production/ProjectPlanFields.tsx](<../../../app/system/production/ProjectPlanFields.tsx>)
- [app/system/production/ThbRateField.tsx](<../../../app/system/production/ThbRateField.tsx>)
- [app/system/production/PlanManHours.tsx](<../../../app/system/production/PlanManHours.tsx>)
- [app/system/production/PlanPeopleGrid.tsx](<../../../app/system/production/PlanPeopleGrid.tsx>)
- [app/system/production/PlanSheet.tsx](<../../../app/system/production/PlanSheet.tsx>)
- [app/system/production/CoreScreens.tsx](<../../../app/system/production/CoreScreens.tsx>)
- [app/system/production/ProjectLook.tsx](<../../../app/system/production/ProjectLook.tsx>)
- [app/system/production/SearchSelect.tsx](<../../../app/system/production/SearchSelect.tsx>)
- [lib/plan-people.ts](<../../../lib/plan-people.ts>)
- [lib/manhour-budget.ts](<../../../lib/manhour-budget.ts>)
- [app/system/production/pegasus-skin.css](<../../../app/system/production/pegasus-skin.css>)
- [app/system/production/my-work.css](<../../../app/system/production/my-work.css>)
- [lib/estimate-assignment-queue.ts](<../../../lib/estimate-assignment-queue.ts>)
- [lib/my-work.ts](<../../../lib/my-work.ts>)
- [app/system/production/CrmScreens.tsx](<../../../app/system/production/CrmScreens.tsx>)
- [app/system/production/MyWeekScreen.tsx](<../../../app/system/production/MyWeekScreen.tsx>)

## Candidate regression tests

- [tests/estimate-assignment-email.test.mjs](<../../../tests/estimate-assignment-email.test.mjs>)
- [tests/estimate-assignment-queue.test.mjs](<../../../tests/estimate-assignment-queue.test.mjs>)
- [tests/estimate-copy-assignment-contract.test.mjs](<../../../tests/estimate-copy-assignment-contract.test.mjs>)
- [backend-node/tests/estimate-assignments-read.test.ts](<../../../backend-node/tests/estimate-assignments-read.test.ts>)
- [backend-node/tests/estimate-copy-plan.test.ts](<../../../backend-node/tests/estimate-copy-plan.test.ts>)
- [backend-node/tests/estimate-copy-route.test.ts](<../../../backend-node/tests/estimate-copy-route.test.ts>)

## Client contract lookup

Search the selected API path or function in [app/system/api-client.ts](<../../../app/system/api-client.ts>); follow its screen callers. Common UI/language changes require [app/system/ui.tsx](<../../../app/system/ui.tsx>) and [app/system/i18n.ts](<../../../app/system/i18n.ts>). For SQL changes use [schema map](../SCHEMA.md).
