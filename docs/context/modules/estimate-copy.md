# Copy Estimate / Assignment queue

[Context index](../../../AGENTS.md) · [Architecture](../ARCHITECTURE.md) · [Change guide](../WORKFLOW.md)

คัดลอกหลาย ledger และแสดงงานที่ยังไม่เริ่มใน My Work

Evidence: snapshot `df41e727`; source map, not a live availability claim. Test candidates use filename matching and are not exhaustive coverage.

## Read only the operation you change

- [estimate-copy API and function map](../api/estimate-copy.md) — registered in Node app
- [estimate-assignments-read API and function map](../api/estimate-assignments-read.md) — registered in Node app

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
| `toError` | [app/system/production/PlanningPricingScreens.tsx](<../../../app/system/production/PlanningPricingScreens.tsx>) | 345–345 |
| `isConcurrencyConflict` | [app/system/production/PlanningPricingScreens.tsx](<../../../app/system/production/PlanningPricingScreens.tsx>) | 346–348 |
| `money` | [app/system/production/PlanningPricingScreens.tsx](<../../../app/system/production/PlanningPricingScreens.tsx>) | 349–353 |
| `number` | [app/system/production/PlanningPricingScreens.tsx](<../../../app/system/production/PlanningPricingScreens.tsx>) | 354–354 |
| `date` | [app/system/production/PlanningPricingScreens.tsx](<../../../app/system/production/PlanningPricingScreens.tsx>) | 355–357 |
| `dateTime` | [app/system/production/PlanningPricingScreens.tsx](<../../../app/system/production/PlanningPricingScreens.tsx>) | 358–361 |
| `isoToday` | [app/system/production/PlanningPricingScreens.tsx](<../../../app/system/production/PlanningPricingScreens.tsx>) | 363–363 |
| `ageInDays` | [app/system/production/PlanningPricingScreens.tsx](<../../../app/system/production/PlanningPricingScreens.tsx>) | 364–370 |
| `hostOf` | [app/system/production/PlanningPricingScreens.tsx](<../../../app/system/production/PlanningPricingScreens.tsx>) | 372–372 |
| `flattenTasks` | [app/system/production/PlanningPricingScreens.tsx](<../../../app/system/production/PlanningPricingScreens.tsx>) | 373–373 |
| `ResourcePlanLock` | [app/system/production/PlanningPricingScreens.tsx](<../../../app/system/production/PlanningPricingScreens.tsx>) | 376–378 |
| `LoadError` | [app/system/production/PlanningPricingScreens.tsx](<../../../app/system/production/PlanningPricingScreens.tsx>) | 380–386 |
| `PermissionNotice` | [app/system/production/PlanningPricingScreens.tsx](<../../../app/system/production/PlanningPricingScreens.tsx>) | 388–393 |
| `loadAllEstimates` | [app/system/production/PlanningPricingScreens.tsx](<../../../app/system/production/PlanningPricingScreens.tsx>) | 395–404 |
| `loadAllProjects` | [app/system/production/PlanningPricingScreens.tsx](<../../../app/system/production/PlanningPricingScreens.tsx>) | 406–415 |
| `loadAllSupplierPriceHistory` | [app/system/production/PlanningPricingScreens.tsx](<../../../app/system/production/PlanningPricingScreens.tsx>) | 417–426 |
| `mapSettledLimited` | [app/system/production/PlanningPricingScreens.tsx](<../../../app/system/production/PlanningPricingScreens.tsx>) | 428–444 |
| `loadPriceRecords` | [app/system/production/PlanningPricingScreens.tsx](<../../../app/system/production/PlanningPricingScreens.tsx>) | 446–551 |
| `loadSchedules` | [app/system/production/PlanningPricingScreens.tsx](<../../../app/system/production/PlanningPricingScreens.tsx>) | 553–562 |
| `usePrices` | [app/system/production/PlanningPricingScreens.tsx](<../../../app/system/production/PlanningPricingScreens.tsx>) | 564–581 |
| `progressProblem` | [app/system/production/PlanningPricingScreens.tsx](<../../../app/system/production/PlanningPricingScreens.tsx>) | 584–595 |
| `ProgressModal` | [app/system/production/PlanningPricingScreens.tsx](<../../../app/system/production/PlanningPricingScreens.tsx>) | 597–697 |
| `workEffectiveFinish` | [app/system/production/PlanningPricingScreens.tsx](<../../../app/system/production/PlanningPricingScreens.tsx>) | 700–700 |
| `workIsLate` | [app/system/production/PlanningPricingScreens.tsx](<../../../app/system/production/PlanningPricingScreens.tsx>) | 702–702 |
| `workNeedsForecast` | [app/system/production/PlanningPricingScreens.tsx](<../../../app/system/production/PlanningPricingScreens.tsx>) | 703–703 |
| `workIsStale` | [app/system/production/PlanningPricingScreens.tsx](<../../../app/system/production/PlanningPricingScreens.tsx>) | 704–704 |
| `workLastReport` | [app/system/production/PlanningPricingScreens.tsx](<../../../app/system/production/PlanningPricingScreens.tsx>) | 706–706 |
| `workNeedsUpdate` | [app/system/production/PlanningPricingScreens.tsx](<../../../app/system/production/PlanningPricingScreens.tsx>) | 707–707 |
| `workUserNote` | [app/system/production/PlanningPricingScreens.tsx](<../../../app/system/production/PlanningPricingScreens.tsx>) | 708–708 |
| `historyReason` | [app/system/production/PlanningPricingScreens.tsx](<../../../app/system/production/PlanningPricingScreens.tsx>) | 710–710 |
| `historyValue` | [app/system/production/PlanningPricingScreens.tsx](<../../../app/system/production/PlanningPricingScreens.tsx>) | 713–713 |
| `historyShown` | [app/system/production/PlanningPricingScreens.tsx](<../../../app/system/production/PlanningPricingScreens.tsx>) | 715–715 |
| `daysFromToday` | [app/system/production/PlanningPricingScreens.tsx](<../../../app/system/production/PlanningPricingScreens.tsx>) | 716–718 |
| `myWorkInitials` | [app/system/production/PlanningPricingScreens.tsx](<../../../app/system/production/PlanningPricingScreens.tsx>) | 719–719 |
| `quietDays` | [app/system/production/PlanningPricingScreens.tsx](<../../../app/system/production/PlanningPricingScreens.tsx>) | 720–723 |
| `myWorkAuditFieldLabel` | [app/system/production/PlanningPricingScreens.tsx](<../../../app/system/production/PlanningPricingScreens.tsx>) | 742–742 |
| `matchesWorkFilter` | [app/system/production/PlanningPricingScreens.tsx](<../../../app/system/production/PlanningPricingScreens.tsx>) | 813–824 |
| `groupScheduleWork` | [app/system/production/PlanningPricingScreens.tsx](<../../../app/system/production/PlanningPricingScreens.tsx>) | 826–873 |
| `groupEstimateWork` | [app/system/production/PlanningPricingScreens.tsx](<../../../app/system/production/PlanningPricingScreens.tsx>) | 875–913 |
| `estimateGroupMatchesFilter` | [app/system/production/PlanningPricingScreens.tsx](<../../../app/system/production/PlanningPricingScreens.tsx>) | 915–922 |
| `MyEstimateAssignmentsPanel` | [app/system/production/PlanningPricingScreens.tsx](<../../../app/system/production/PlanningPricingScreens.tsx>) | 935–970 |
| `EstimateWorkGroupCard` | [app/system/production/PlanningPricingScreens.tsx](<../../../app/system/production/PlanningPricingScreens.tsx>) | 972–1010 |
| `EstimateNextActionDetail` | [app/system/production/PlanningPricingScreens.tsx](<../../../app/system/production/PlanningPricingScreens.tsx>) | 1012–1019 |
| `useMyEstimateAssignments` | [app/system/production/PlanningPricingScreens.tsx](<../../../app/system/production/PlanningPricingScreens.tsx>) | 1022–1038 |
| `ProductionMyWork` | [app/system/production/PlanningPricingScreens.tsx](<../../../app/system/production/PlanningPricingScreens.tsx>) | 1040–1499 |
| `MyWorkStat` | [app/system/production/PlanningPricingScreens.tsx](<../../../app/system/production/PlanningPricingScreens.tsx>) | 1501–1505 |
| `QuickProgressControls` | [app/system/production/PlanningPricingScreens.tsx](<../../../app/system/production/PlanningPricingScreens.tsx>) | 1528–1610 |
| `workNeedsForecastFor` | [app/system/production/PlanningPricingScreens.tsx](<../../../app/system/production/PlanningPricingScreens.tsx>) | 1612–1612 |
| `myWorkProgressTarget` | [app/system/production/PlanningPricingScreens.tsx](<../../../app/system/production/PlanningPricingScreens.tsx>) | 1614–1618 |
| `ProductionWorkControls` | [app/system/production/PlanningPricingScreens.tsx](<../../../app/system/production/PlanningPricingScreens.tsx>) | 1620–1631 |
| `ProductionScheduleWorkGroup` | [app/system/production/PlanningPricingScreens.tsx](<../../../app/system/production/PlanningPricingScreens.tsx>) | 1633–1695 |
| `ProductionMyTaskRow` | [app/system/production/PlanningPricingScreens.tsx](<../../../app/system/production/PlanningPricingScreens.tsx>) | 1697–1765 |
| `ProductionRequestDaysModal` | [app/system/production/PlanningPricingScreens.tsx](<../../../app/system/production/PlanningPricingScreens.tsx>) | 1767–1793 |
| `ProductionPersonalTaskModal` | [app/system/production/PlanningPricingScreens.tsx](<../../../app/system/production/PlanningPricingScreens.tsx>) | 1795–1844 |
| `usePicOptions` | [app/system/production/PlanningPricingScreens.tsx](<../../../app/system/production/PlanningPricingScreens.tsx>) | 1847–1849 |
| `ensureScheduleMembers` | [app/system/production/PlanningPricingScreens.tsx](<../../../app/system/production/PlanningPricingScreens.tsx>) | 1850–1854 |
| `PicPicker` | [app/system/production/PlanningPricingScreens.tsx](<../../../app/system/production/PlanningPricingScreens.tsx>) | 1855–1861 |
| `startDraftOf` | [app/system/production/PlanningPricingScreens.tsx](<../../../app/system/production/PlanningPricingScreens.tsx>) | 1865–1867 |
| `startReady` | [app/system/production/PlanningPricingScreens.tsx](<../../../app/system/production/PlanningPricingScreens.tsx>) | 1868–1868 |
| `startBody` | [app/system/production/PlanningPricingScreens.tsx](<../../../app/system/production/PlanningPricingScreens.tsx>) | 1870–1872 |
| `predecessorChoices` | [app/system/production/PlanningPricingScreens.tsx](<../../../app/system/production/PlanningPricingScreens.tsx>) | 1878–1888 |
| `PlanStartFields` | [app/system/production/PlanningPricingScreens.tsx](<../../../app/system/production/PlanningPricingScreens.tsx>) | 1891–1920 |
| `draftSpan` | [app/system/production/PlanningPricingScreens.tsx](<../../../app/system/production/PlanningPricingScreens.tsx>) | 1923–1927 |
| `PicFieldsWithLoad` | [app/system/production/PlanningPricingScreens.tsx](<../../../app/system/production/PlanningPricingScreens.tsx>) | 1930–1945 |
| `CreateScheduleTaskModal` | [app/system/production/PlanningPricingScreens.tsx](<../../../app/system/production/PlanningPricingScreens.tsx>) | 1947–2044 |
| `EditScheduleTaskModal` | [app/system/production/PlanningPricingScreens.tsx](<../../../app/system/production/PlanningPricingScreens.tsx>) | 2051–2117 |
| `BaselineModal` | [app/system/production/PlanningPricingScreens.tsx](<../../../app/system/production/PlanningPricingScreens.tsx>) | 2119–2162 |
| `ScheduleDayRequestAnswerModal` | [app/system/production/PlanningPricingScreens.tsx](<../../../app/system/production/PlanningPricingScreens.tsx>) | 2164–2211 |
| `planProjectStorageKey` | [app/system/production/PlanningPricingScreens.tsx](<../../../app/system/production/PlanningPricingScreens.tsx>) | 2220–2220 |
| `byProjectNumber` | [app/system/production/PlanningPricingScreens.tsx](<../../../app/system/production/PlanningPricingScreens.tsx>) | 2222–2222 |
| `isLeafTask` | [app/system/production/PlanningPricingScreens.tsx](<../../../app/system/production/PlanningPricingScreens.tsx>) | 2223–2223 |
| `taskOrDescendantMatches` | [app/system/production/PlanningPricingScreens.tsx](<../../../app/system/production/PlanningPricingScreens.tsx>) | 2224–2225 |
| `planRows` | [app/system/production/PlanningPricingScreens.tsx](<../../../app/system/production/PlanningPricingScreens.tsx>) | 2228–2239 |
| `ProductionProjectSchedule` | [app/system/production/PlanningPricingScreens.tsx](<../../../app/system/production/PlanningPricingScreens.tsx>) | 2246–2552 |
| `PlanTaskDrawer` | [app/system/production/PlanningPricingScreens.tsx](<../../../app/system/production/PlanningPricingScreens.tsx>) | 2555–2623 |
| `PriceAgeBadge` | [app/system/production/PlanningPricingScreens.tsx](<../../../app/system/production/PlanningPricingScreens.tsx>) | 2625–2630 |
| `PriceLoadWarning` | [app/system/production/PlanningPricingScreens.tsx](<../../../app/system/production/PlanningPricingScreens.tsx>) | 2632–2634 |
| `ProductionPriceLibrary` | [app/system/production/PlanningPricingScreens.tsx](<../../../app/system/production/PlanningPricingScreens.tsx>) | 2636–2733 |
| `supplierQuotationCurrency` | [app/system/production/PlanningPricingScreens.tsx](<../../../app/system/production/PlanningPricingScreens.tsx>) | 2735–2736 |
| `addIsoDays` | [app/system/production/PlanningPricingScreens.tsx](<../../../app/system/production/PlanningPricingScreens.tsx>) | 2738–2742 |
| `quotationFileKind` | [app/system/production/PlanningPricingScreens.tsx](<../../../app/system/production/PlanningPricingScreens.tsx>) | 2744–2750 |
| `blankQuotationLine` | [app/system/production/PlanningPricingScreens.tsx](<../../../app/system/production/PlanningPricingScreens.tsx>) | 2752–2755 |
| `quotationLinesTotal` | [app/system/production/PlanningPricingScreens.tsx](<../../../app/system/production/PlanningPricingScreens.tsx>) | 2757–2758 |
| `catalogueKeyOf` | [app/system/production/PlanningPricingScreens.tsx](<../../../app/system/production/PlanningPricingScreens.tsx>) | 2774–2779 |
| `useCatalogueMatches` | [app/system/production/PlanningPricingScreens.tsx](<../../../app/system/production/PlanningPricingScreens.tsx>) | 2781–2816 |
| `priceChange` | [app/system/production/PlanningPricingScreens.tsx](<../../../app/system/production/PlanningPricingScreens.tsx>) | 2819–2822 |
| `CatalogueComparison` | [app/system/production/PlanningPricingScreens.tsx](<../../../app/system/production/PlanningPricingScreens.tsx>) | 2836–2905 |
| `QuotationLinesEditor` | [app/system/production/PlanningPricingScreens.tsx](<../../../app/system/production/PlanningPricingScreens.tsx>) | 2913–2996 |
| `SupplierQuotationUploadModal` | [app/system/production/PlanningPricingScreens.tsx](<../../../app/system/production/PlanningPricingScreens.tsx>) | 2998–3407 |
| `EditQuotationModal` | [app/system/production/PlanningPricingScreens.tsx](<../../../app/system/production/PlanningPricingScreens.tsx>) | 3409–3553 |
| `ReferencePriceModal` | [app/system/production/PlanningPricingScreens.tsx](<../../../app/system/production/PlanningPricingScreens.tsx>) | 3562–3674 |
| `ProductionSupplierQuotations` | [app/system/production/PlanningPricingScreens.tsx](<../../../app/system/production/PlanningPricingScreens.tsx>) | 3676–3877 |
| `ProductionWaitingSupplierPrice` | [app/system/production/PlanningPricingScreens.tsx](<../../../app/system/production/PlanningPricingScreens.tsx>) | 3879–3901 |

## Domain helpers / direct dependencies

- [backend-node/src/estimate-copy-plan.ts](<../../../backend-node/src/estimate-copy-plan.ts>)
- [backend-node/src/estimate-disciplines.ts](<../../../backend-node/src/estimate-disciplines.ts>)
- [backend-node/src/estimate-total-guard.ts](<../../../backend-node/src/estimate-total-guard.ts>)
- [backend-node/src/routes/estimate-cost-write.ts](<../../../backend-node/src/routes/estimate-cost-write.ts>)
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
- [app/system/production/SigningScreens.tsx](<../../../app/system/production/SigningScreens.tsx>)
- [app/system/production/ResourceTaskWorkspace.tsx](<../../../app/system/production/ResourceTaskWorkspace.tsx>)
- [app/system/production/SearchMultiPicker.tsx](<../../../app/system/production/SearchMultiPicker.tsx>)
- [lib/schedule-workbook.ts](<../../../lib/schedule-workbook.ts>)
- [app/system/use-activity-presence.ts](<../../../app/system/use-activity-presence.ts>)
- [app/system/production/LazyScreens.tsx](<../../../app/system/production/LazyScreens.tsx>)
- [app/system/project-overview-client.ts](<../../../app/system/project-overview-client.ts>)
- [lib/gantt.ts](<../../../lib/gantt.ts>)
- [app/system/production/GanttChart.tsx](<../../../app/system/production/GanttChart.tsx>)
- [app/system/production/PlanPicLoad.tsx](<../../../app/system/production/PlanPicLoad.tsx>)
- [app/system/production/ProjectPlanFields.tsx](<../../../app/system/production/ProjectPlanFields.tsx>)
- [app/system/production/my-work.css](<../../../app/system/production/my-work.css>)
- [lib/estimate-assignment-queue.ts](<../../../lib/estimate-assignment-queue.ts>)
- [lib/my-work.ts](<../../../lib/my-work.ts>)
- [app/system/production/CrmScreens.tsx](<../../../app/system/production/CrmScreens.tsx>)

## Candidate regression tests

- [tests/estimate-assignment-email.test.mjs](<../../../tests/estimate-assignment-email.test.mjs>)
- [tests/estimate-assignment-queue.test.mjs](<../../../tests/estimate-assignment-queue.test.mjs>)
- [tests/estimate-copy-assignment-contract.test.mjs](<../../../tests/estimate-copy-assignment-contract.test.mjs>)
- [backend-node/tests/estimate-assignments-read.test.ts](<../../../backend-node/tests/estimate-assignments-read.test.ts>)
- [backend-node/tests/estimate-copy-plan.test.ts](<../../../backend-node/tests/estimate-copy-plan.test.ts>)
- [backend-node/tests/estimate-copy-route.test.ts](<../../../backend-node/tests/estimate-copy-route.test.ts>)

## Client contract lookup

Search the selected API path or function in [app/system/api-client.ts](<../../../app/system/api-client.ts>); follow its screen callers. Common UI/language changes require [app/system/ui.tsx](<../../../app/system/ui.tsx>) and [app/system/i18n.ts](<../../../app/system/i18n.ts>). For SQL changes use [schema map](../SCHEMA.md).
