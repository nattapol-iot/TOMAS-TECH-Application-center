# Schedule / Resource / My Work

[Context index](../../../AGENTS.md) · [Architecture](../ARCHITECTURE.md) · [Change guide](../WORKFLOW.md)

แผนงาน timeline กำลังคน lifecycle งานและคำขอปรับวัน

Evidence: snapshot `45c9e572`; source map, not a live availability claim. Test candidates use filename matching and are not exhaustive coverage.

## Read only the operation you change

- [schedule API and function map](../api/schedule.md) — registered in Node app
- [resource-planning API and function map](../api/resource-planning.md) — registered in Node app
- [team-board API and function map](../api/team-board.md) — registered in Node app
- [resource-tasks API and function map](../api/resource-tasks.md) — registered in Node app
- [issue-batches API and function map](../api/issue-batches.md) — registered in Node app
- [schedule-templates API and function map](../api/schedule-templates.md) — registered in Node app
- [work-days API and function map](../api/work-days.md) — registered in Node app
- [work-blocks API and function map](../api/work-blocks.md) — registered in Node app
- [team-week API and function map](../api/team-week.md) — registered in Node app
- [vendor-hours API and function map](../api/vendor-hours.md) — registered in Node app

## UI function locator

Shared screens contain other modules: use the symbol and line range instead of reading the whole file.

| Symbol | Source | Lines |
|---|---|---|
| `toError` | [app/system/production/PlanningPricingScreens.tsx](<../../../app/system/production/PlanningPricingScreens.tsx>) | 399–399 |
| `isConcurrencyConflict` | [app/system/production/PlanningPricingScreens.tsx](<../../../app/system/production/PlanningPricingScreens.tsx>) | 400–400 |
| `money` | [app/system/production/PlanningPricingScreens.tsx](<../../../app/system/production/PlanningPricingScreens.tsx>) | 401–406 |
| `number` | [app/system/production/PlanningPricingScreens.tsx](<../../../app/system/production/PlanningPricingScreens.tsx>) | 407–407 |
| `date` | [app/system/production/PlanningPricingScreens.tsx](<../../../app/system/production/PlanningPricingScreens.tsx>) | 408–408 |
| `dateTime` | [app/system/production/PlanningPricingScreens.tsx](<../../../app/system/production/PlanningPricingScreens.tsx>) | 409–413 |
| `isoToday` | [app/system/production/PlanningPricingScreens.tsx](<../../../app/system/production/PlanningPricingScreens.tsx>) | 415–415 |
| `ageInDays` | [app/system/production/PlanningPricingScreens.tsx](<../../../app/system/production/PlanningPricingScreens.tsx>) | 416–422 |
| `hostOf` | [app/system/production/PlanningPricingScreens.tsx](<../../../app/system/production/PlanningPricingScreens.tsx>) | 424–430 |
| `flattenTasks` | [app/system/production/PlanningPricingScreens.tsx](<../../../app/system/production/PlanningPricingScreens.tsx>) | 431–431 |
| `ResourcePlanLock` | [app/system/production/PlanningPricingScreens.tsx](<../../../app/system/production/PlanningPricingScreens.tsx>) | 434–441 |
| `LoadError` | [app/system/production/PlanningPricingScreens.tsx](<../../../app/system/production/PlanningPricingScreens.tsx>) | 443–459 |
| `PermissionNotice` | [app/system/production/PlanningPricingScreens.tsx](<../../../app/system/production/PlanningPricingScreens.tsx>) | 461–468 |
| `loadAllEstimates` | [app/system/production/PlanningPricingScreens.tsx](<../../../app/system/production/PlanningPricingScreens.tsx>) | 470–479 |
| `loadAllProjects` | [app/system/production/PlanningPricingScreens.tsx](<../../../app/system/production/PlanningPricingScreens.tsx>) | 481–490 |
| `loadAllSupplierPriceHistory` | [app/system/production/PlanningPricingScreens.tsx](<../../../app/system/production/PlanningPricingScreens.tsx>) | 492–501 |
| `mapSettledLimited` | [app/system/production/PlanningPricingScreens.tsx](<../../../app/system/production/PlanningPricingScreens.tsx>) | 503–519 |
| `loadPriceRecords` | [app/system/production/PlanningPricingScreens.tsx](<../../../app/system/production/PlanningPricingScreens.tsx>) | 521–633 |
| `loadSchedules` | [app/system/production/PlanningPricingScreens.tsx](<../../../app/system/production/PlanningPricingScreens.tsx>) | 635–643 |
| `usePrices` | [app/system/production/PlanningPricingScreens.tsx](<../../../app/system/production/PlanningPricingScreens.tsx>) | 645–668 |
| `progressProblem` | [app/system/production/PlanningPricingScreens.tsx](<../../../app/system/production/PlanningPricingScreens.tsx>) | 671–682 |
| `ProgressModal` | [app/system/production/PlanningPricingScreens.tsx](<../../../app/system/production/PlanningPricingScreens.tsx>) | 684–887 |
| `workEffectiveFinish` | [app/system/production/PlanningPricingScreens.tsx](<../../../app/system/production/PlanningPricingScreens.tsx>) | 890–890 |
| `workIsLate` | [app/system/production/PlanningPricingScreens.tsx](<../../../app/system/production/PlanningPricingScreens.tsx>) | 892–892 |
| `workNeedsForecast` | [app/system/production/PlanningPricingScreens.tsx](<../../../app/system/production/PlanningPricingScreens.tsx>) | 893–893 |
| `workIsStale` | [app/system/production/PlanningPricingScreens.tsx](<../../../app/system/production/PlanningPricingScreens.tsx>) | 894–894 |
| `workLastReport` | [app/system/production/PlanningPricingScreens.tsx](<../../../app/system/production/PlanningPricingScreens.tsx>) | 896–896 |
| `workNeedsUpdate` | [app/system/production/PlanningPricingScreens.tsx](<../../../app/system/production/PlanningPricingScreens.tsx>) | 897–897 |
| `workUserNote` | [app/system/production/PlanningPricingScreens.tsx](<../../../app/system/production/PlanningPricingScreens.tsx>) | 898–898 |
| `historyReason` | [app/system/production/PlanningPricingScreens.tsx](<../../../app/system/production/PlanningPricingScreens.tsx>) | 900–900 |
| `historyValue` | [app/system/production/PlanningPricingScreens.tsx](<../../../app/system/production/PlanningPricingScreens.tsx>) | 903–903 |
| `historyShown` | [app/system/production/PlanningPricingScreens.tsx](<../../../app/system/production/PlanningPricingScreens.tsx>) | 905–906 |
| `daysFromToday` | [app/system/production/PlanningPricingScreens.tsx](<../../../app/system/production/PlanningPricingScreens.tsx>) | 907–907 |
| `myWorkInitials` | [app/system/production/PlanningPricingScreens.tsx](<../../../app/system/production/PlanningPricingScreens.tsx>) | 908–914 |
| `quietDays` | [app/system/production/PlanningPricingScreens.tsx](<../../../app/system/production/PlanningPricingScreens.tsx>) | 915–918 |
| `myWorkAuditFieldLabel` | [app/system/production/PlanningPricingScreens.tsx](<../../../app/system/production/PlanningPricingScreens.tsx>) | 937–937 |
| `matchesWorkFilter` | [app/system/production/PlanningPricingScreens.tsx](<../../../app/system/production/PlanningPricingScreens.tsx>) | 1013–1024 |
| `groupScheduleWork` | [app/system/production/PlanningPricingScreens.tsx](<../../../app/system/production/PlanningPricingScreens.tsx>) | 1026–1077 |
| `groupEstimateWork` | [app/system/production/PlanningPricingScreens.tsx](<../../../app/system/production/PlanningPricingScreens.tsx>) | 1079–1122 |
| `estimateGroupMatchesFilter` | [app/system/production/PlanningPricingScreens.tsx](<../../../app/system/production/PlanningPricingScreens.tsx>) | 1124–1131 |
| `MyEstimateAssignmentsPanel` | [app/system/production/PlanningPricingScreens.tsx](<../../../app/system/production/PlanningPricingScreens.tsx>) | 1144–1224 |
| `WorkGroupMeta` | [app/system/production/PlanningPricingScreens.tsx](<../../../app/system/production/PlanningPricingScreens.tsx>) | 1227–1291 |
| `EstimateWorkGroupCard` | [app/system/production/PlanningPricingScreens.tsx](<../../../app/system/production/PlanningPricingScreens.tsx>) | 1293–1379 |
| `EstimateNextActionDetail` | [app/system/production/PlanningPricingScreens.tsx](<../../../app/system/production/PlanningPricingScreens.tsx>) | 1381–1419 |
| `useMyEstimateAssignments` | [app/system/production/PlanningPricingScreens.tsx](<../../../app/system/production/PlanningPricingScreens.tsx>) | 1422–1452 |
| `ProductionMyWork` | [app/system/production/PlanningPricingScreens.tsx](<../../../app/system/production/PlanningPricingScreens.tsx>) | 1454–2244 |
| `QuickProgressControls` | [app/system/production/PlanningPricingScreens.tsx](<../../../app/system/production/PlanningPricingScreens.tsx>) | 2267–2418 |
| `workNeedsForecastFor` | [app/system/production/PlanningPricingScreens.tsx](<../../../app/system/production/PlanningPricingScreens.tsx>) | 2420–2420 |
| `myWorkProgressTarget` | [app/system/production/PlanningPricingScreens.tsx](<../../../app/system/production/PlanningPricingScreens.tsx>) | 2422–2433 |
| `ProductionWorkControls` | [app/system/production/PlanningPricingScreens.tsx](<../../../app/system/production/PlanningPricingScreens.tsx>) | 2435–2472 |
| `ProductionScheduleWorkGroup` | [app/system/production/PlanningPricingScreens.tsx](<../../../app/system/production/PlanningPricingScreens.tsx>) | 2474–2579 |
| `ProductionMyTaskRow` | [app/system/production/PlanningPricingScreens.tsx](<../../../app/system/production/PlanningPricingScreens.tsx>) | 2581–2775 |
| `ProductionRequestDaysModal` | [app/system/production/PlanningPricingScreens.tsx](<../../../app/system/production/PlanningPricingScreens.tsx>) | 2777–2841 |
| `ProductionPersonalTaskModal` | [app/system/production/PlanningPricingScreens.tsx](<../../../app/system/production/PlanningPricingScreens.tsx>) | 2843–2946 |
| `usePicOptions` | [app/system/production/PlanningPricingScreens.tsx](<../../../app/system/production/PlanningPricingScreens.tsx>) | 2949–2951 |
| `ensureScheduleMembers` | [app/system/production/PlanningPricingScreens.tsx](<../../../app/system/production/PlanningPricingScreens.tsx>) | 2952–2956 |
| `usePlanTeam` | [app/system/production/PlanningPricingScreens.tsx](<../../../app/system/production/PlanningPricingScreens.tsx>) | 2958–2978 |
| `PicPicker` | [app/system/production/PlanningPricingScreens.tsx](<../../../app/system/production/PlanningPricingScreens.tsx>) | 2979–2997 |
| `startDraftOf` | [app/system/production/PlanningPricingScreens.tsx](<../../../app/system/production/PlanningPricingScreens.tsx>) | 3001–3009 |
| `startReady` | [app/system/production/PlanningPricingScreens.tsx](<../../../app/system/production/PlanningPricingScreens.tsx>) | 3010–3010 |
| `startBody` | [app/system/production/PlanningPricingScreens.tsx](<../../../app/system/production/PlanningPricingScreens.tsx>) | 3012–3015 |
| `predecessorChoices` | [app/system/production/PlanningPricingScreens.tsx](<../../../app/system/production/PlanningPricingScreens.tsx>) | 3021–3041 |
| `PlanStartFields` | [app/system/production/PlanningPricingScreens.tsx](<../../../app/system/production/PlanningPricingScreens.tsx>) | 3044–3106 |
| `draftSpan` | [app/system/production/PlanningPricingScreens.tsx](<../../../app/system/production/PlanningPricingScreens.tsx>) | 3114–3118 |
| `PicFieldsWithLoad` | [app/system/production/PlanningPricingScreens.tsx](<../../../app/system/production/PlanningPricingScreens.tsx>) | 3121–3152 |
| `canTakeSubTasks` | [app/system/production/PlanningPricingScreens.tsx](<../../../app/system/production/PlanningPricingScreens.tsx>) | 3155–3159 |
| `customerPeriod` | [app/system/production/PlanningPricingScreens.tsx](<../../../app/system/production/PlanningPricingScreens.tsx>) | 3162–3163 |
| `periodDays` | [app/system/production/PlanningPricingScreens.tsx](<../../../app/system/production/PlanningPricingScreens.tsx>) | 3164–3164 |
| `customerPeriodReady` | [app/system/production/PlanningPricingScreens.tsx](<../../../app/system/production/PlanningPricingScreens.tsx>) | 3166–3166 |
| `CustomerPeriodFields` | [app/system/production/PlanningPricingScreens.tsx](<../../../app/system/production/PlanningPricingScreens.tsx>) | 3168–3186 |
| `EditScheduleTaskModal` | [app/system/production/PlanningPricingScreens.tsx](<../../../app/system/production/PlanningPricingScreens.tsx>) | 3193–3492 |
| `BaselineModal` | [app/system/production/PlanningPricingScreens.tsx](<../../../app/system/production/PlanningPricingScreens.tsx>) | 3494–3572 |
| `ScheduleDayRequestAnswerModal` | [app/system/production/PlanningPricingScreens.tsx](<../../../app/system/production/PlanningPricingScreens.tsx>) | 3574–3674 |
| `planProjectStorageKey` | [app/system/production/PlanningPricingScreens.tsx](<../../../app/system/production/PlanningPricingScreens.tsx>) | 3676–3676 |
| `readLegendOpen` | [app/system/production/PlanningPricingScreens.tsx](<../../../app/system/production/PlanningPricingScreens.tsx>) | 3680–3686 |
| `saveLegendOpen` | [app/system/production/PlanningPricingScreens.tsx](<../../../app/system/production/PlanningPricingScreens.tsx>) | 3687–3693 |
| `planCommitments` | [app/system/production/PlanningPricingScreens.tsx](<../../../app/system/production/PlanningPricingScreens.tsx>) | 3706–3741 |
| `memberWindowOf` | [app/system/production/PlanningPricingScreens.tsx](<../../../app/system/production/PlanningPricingScreens.tsx>) | 3743–3748 |
| `byProjectNumber` | [app/system/production/PlanningPricingScreens.tsx](<../../../app/system/production/PlanningPricingScreens.tsx>) | 3750–3750 |
| `isLeafTask` | [app/system/production/PlanningPricingScreens.tsx](<../../../app/system/production/PlanningPricingScreens.tsx>) | 3751–3751 |
| `memberGanttRows` | [app/system/production/PlanningPricingScreens.tsx](<../../../app/system/production/PlanningPricingScreens.tsx>) | 3759–3953 |
| `ProductionProjectSchedule` | [app/system/production/PlanningPricingScreens.tsx](<../../../app/system/production/PlanningPricingScreens.tsx>) | 3960–4754 |
| `PlanTaskDrawer` | [app/system/production/PlanningPricingScreens.tsx](<../../../app/system/production/PlanningPricingScreens.tsx>) | 4757–4963 |
| `PriceAgeBadge` | [app/system/production/PlanningPricingScreens.tsx](<../../../app/system/production/PlanningPricingScreens.tsx>) | 4965–4989 |
| `PriceLoadWarning` | [app/system/production/PlanningPricingScreens.tsx](<../../../app/system/production/PlanningPricingScreens.tsx>) | 4991–5006 |
| `ProductionPriceLibrary` | [app/system/production/PlanningPricingScreens.tsx](<../../../app/system/production/PlanningPricingScreens.tsx>) | 5008–5293 |
| `supplierQuotationCurrency` | [app/system/production/PlanningPricingScreens.tsx](<../../../app/system/production/PlanningPricingScreens.tsx>) | 5295–5296 |
| `addIsoDays` | [app/system/production/PlanningPricingScreens.tsx](<../../../app/system/production/PlanningPricingScreens.tsx>) | 5298–5302 |
| `quotationFileKind` | [app/system/production/PlanningPricingScreens.tsx](<../../../app/system/production/PlanningPricingScreens.tsx>) | 5304–5310 |
| `blankQuotationLine` | [app/system/production/PlanningPricingScreens.tsx](<../../../app/system/production/PlanningPricingScreens.tsx>) | 5312–5323 |
| `quotationLinesTotal` | [app/system/production/PlanningPricingScreens.tsx](<../../../app/system/production/PlanningPricingScreens.tsx>) | 5325–5325 |
| `thbRateInvalid` | [app/system/production/PlanningPricingScreens.tsx](<../../../app/system/production/PlanningPricingScreens.tsx>) | 5329–5333 |
| `thbRateOf` | [app/system/production/PlanningPricingScreens.tsx](<../../../app/system/production/PlanningPricingScreens.tsx>) | 5335–5335 |
| `catalogueKeyOf` | [app/system/production/PlanningPricingScreens.tsx](<../../../app/system/production/PlanningPricingScreens.tsx>) | 5353–5358 |
| `useCatalogueMatches` | [app/system/production/PlanningPricingScreens.tsx](<../../../app/system/production/PlanningPricingScreens.tsx>) | 5360–5398 |
| `priceChange` | [app/system/production/PlanningPricingScreens.tsx](<../../../app/system/production/PlanningPricingScreens.tsx>) | 5401–5404 |
| `CatalogueComparison` | [app/system/production/PlanningPricingScreens.tsx](<../../../app/system/production/PlanningPricingScreens.tsx>) | 5418–5523 |
| `QuotationLinesEditor` | [app/system/production/PlanningPricingScreens.tsx](<../../../app/system/production/PlanningPricingScreens.tsx>) | 5531–5682 |
| `SupplierQuotationUploadModal` | [app/system/production/PlanningPricingScreens.tsx](<../../../app/system/production/PlanningPricingScreens.tsx>) | 5684–6245 |
| `EditQuotationModal` | [app/system/production/PlanningPricingScreens.tsx](<../../../app/system/production/PlanningPricingScreens.tsx>) | 6247–6439 |
| `ReferencePriceModal` | [app/system/production/PlanningPricingScreens.tsx](<../../../app/system/production/PlanningPricingScreens.tsx>) | 6448–6593 |
| `ProductionSupplierQuotations` | [app/system/production/PlanningPricingScreens.tsx](<../../../app/system/production/PlanningPricingScreens.tsx>) | 6595–7006 |
| `ProductionWaitingSupplierPrice` | [app/system/production/PlanningPricingScreens.tsx](<../../../app/system/production/PlanningPricingScreens.tsx>) | 7008–7145 |
| `number` | [app/system/production/WorkDaysPanel.tsx](<../../../app/system/production/WorkDaysPanel.tsx>) | 34–34 |
| `dayName` | [app/system/production/WorkDaysPanel.tsx](<../../../app/system/production/WorkDaysPanel.tsx>) | 35–36 |
| `shortDate` | [app/system/production/WorkDaysPanel.tsx](<../../../app/system/production/WorkDaysPanel.tsx>) | 37–37 |
| `WorkDaysPanel` | [app/system/production/WorkDaysPanel.tsx](<../../../app/system/production/WorkDaysPanel.tsx>) | 58–221 |
| `WorkDayDialog` | [app/system/production/WorkDaysPanel.tsx](<../../../app/system/production/WorkDaysPanel.tsx>) | 223–434 |
| `number` | [app/system/production/MyWeekScreen.tsx](<../../../app/system/production/MyWeekScreen.tsx>) | 43–43 |
| `dayLabel` | [app/system/production/MyWeekScreen.tsx](<../../../app/system/production/MyWeekScreen.tsx>) | 44–44 |
| `shortDate` | [app/system/production/MyWeekScreen.tsx](<../../../app/system/production/MyWeekScreen.tsx>) | 45–45 |
| `MyWeek` | [app/system/production/MyWeekScreen.tsx](<../../../app/system/production/MyWeekScreen.tsx>) | 61–405 |
| `itemClass` | [app/system/production/MyWeekScreen.tsx](<../../../app/system/production/MyWeekScreen.tsx>) | 407–411 |
| `itemTitle` | [app/system/production/MyWeekScreen.tsx](<../../../app/system/production/MyWeekScreen.tsx>) | 413–418 |
| `itemSub` | [app/system/production/MyWeekScreen.tsx](<../../../app/system/production/MyWeekScreen.tsx>) | 420–427 |
| `BacklogRow` | [app/system/production/MyWeekScreen.tsx](<../../../app/system/production/MyWeekScreen.tsx>) | 429–458 |
| `DayFoot` | [app/system/production/MyWeekScreen.tsx](<../../../app/system/production/MyWeekScreen.tsx>) | 461–498 |
| `BlockEditor` | [app/system/production/MyWeekScreen.tsx](<../../../app/system/production/MyWeekScreen.tsx>) | 500–653 |
| `MeetingDialog` | [app/system/production/MyWeekScreen.tsx](<../../../app/system/production/MyWeekScreen.tsx>) | 655–722 |
| `TeamTaskDialog` | [app/system/production/MyWeekScreen.tsx](<../../../app/system/production/MyWeekScreen.tsx>) | 724–758 |
| `shift` | [app/system/production/VendorWork.tsx](<../../../app/system/production/VendorWork.tsx>) | 32–32 |
| `hours` | [app/system/production/VendorWork.tsx](<../../../app/system/production/VendorWork.tsx>) | 33–33 |
| `VendorWork` | [app/system/production/VendorWork.tsx](<../../../app/system/production/VendorWork.tsx>) | 35–171 |
| `initials` | [app/system/production/ResourcePlanningScreen.tsx](<../../../app/system/production/ResourcePlanningScreen.tsx>) | 75–80 |
| `fmt` | [app/system/production/ResourcePlanningScreen.tsx](<../../../app/system/production/ResourcePlanningScreen.tsx>) | 81–81 |
| `percent` | [app/system/production/ResourcePlanningScreen.tsx](<../../../app/system/production/ResourcePlanningScreen.tsx>) | 82–82 |
| `tone` | [app/system/production/ResourcePlanningScreen.tsx](<../../../app/system/production/ResourcePlanningScreen.tsx>) | 83–83 |
| `today` | [app/system/production/ResourcePlanningScreen.tsx](<../../../app/system/production/ResourcePlanningScreen.tsx>) | 84–90 |
| `errorText` | [app/system/production/ResourcePlanningScreen.tsx](<../../../app/system/production/ResourcePlanningScreen.tsx>) | 91–96 |
| `tabStorageKey` | [app/system/production/ResourcePlanningScreen.tsx](<../../../app/system/production/ResourcePlanningScreen.tsx>) | 97–97 |
| `viewStorageKey` | [app/system/production/ResourcePlanningScreen.tsx](<../../../app/system/production/ResourcePlanningScreen.tsx>) | 98–98 |
| `readStored` | [app/system/production/ResourcePlanningScreen.tsx](<../../../app/system/production/ResourcePlanningScreen.tsx>) | 100–107 |
| `store` | [app/system/production/ResourcePlanningScreen.tsx](<../../../app/system/production/ResourcePlanningScreen.tsx>) | 108–114 |
| `byDueDate` | [app/system/production/ResourcePlanningScreen.tsx](<../../../app/system/production/ResourcePlanningScreen.tsx>) | 115–115 |
| `ProductionResourcePlan` | [app/system/production/ResourcePlanningScreen.tsx](<../../../app/system/production/ResourcePlanningScreen.tsx>) | 117–650 |
| `WorkList` | [app/system/production/ResourcePlanningScreen.tsx](<../../../app/system/production/ResourcePlanningScreen.tsx>) | 653–702 |
| `AssignPlanRowModal` | [app/system/production/ResourcePlanningScreen.tsx](<../../../app/system/production/ResourcePlanningScreen.tsx>) | 709–826 |
| `CapacityModal` | [app/system/production/ResourcePlanningScreen.tsx](<../../../app/system/production/ResourcePlanningScreen.tsx>) | 828–901 |
| `teamsKey` | [app/system/production/TeamBoard.tsx](<../../../app/system/production/TeamBoard.tsx>) | 122–122 |
| `readTeams` | [app/system/production/TeamBoard.tsx](<../../../app/system/production/TeamBoard.tsx>) | 123–130 |
| `noticeKey` | [app/system/production/TeamBoard.tsx](<../../../app/system/production/TeamBoard.tsx>) | 137–137 |
| `rowTypeLabel` | [app/system/production/TeamBoard.tsx](<../../../app/system/production/TeamBoard.tsx>) | 163–163 |
| `rowTitle` | [app/system/production/TeamBoard.tsx](<../../../app/system/production/TeamBoard.tsx>) | 164–173 |
| `rowCustomer` | [app/system/production/TeamBoard.tsx](<../../../app/system/production/TeamBoard.tsx>) | 174–174 |
| `rowTime` | [app/system/production/TeamBoard.tsx](<../../../app/system/production/TeamBoard.tsx>) | 175–175 |
| `rowStatus` | [app/system/production/TeamBoard.tsx](<../../../app/system/production/TeamBoard.tsx>) | 176–177 |
| `rowTone` | [app/system/production/TeamBoard.tsx](<../../../app/system/production/TeamBoard.tsx>) | 178–179 |
| `viewKey` | [app/system/production/TeamBoard.tsx](<../../../app/system/production/TeamBoard.tsx>) | 181–181 |
| `readView` | [app/system/production/TeamBoard.tsx](<../../../app/system/production/TeamBoard.tsx>) | 182–188 |
| `categoryOf` | [app/system/production/TeamBoard.tsx](<../../../app/system/production/TeamBoard.tsx>) | 202–202 |
| `itemCategory` | [app/system/production/TeamBoard.tsx](<../../../app/system/production/TeamBoard.tsx>) | 204–204 |
| `mondayOf` | [app/system/production/TeamBoard.tsx](<../../../app/system/production/TeamBoard.tsx>) | 205–208 |
| `initials` | [app/system/production/TeamBoard.tsx](<../../../app/system/production/TeamBoard.tsx>) | 209–214 |
| `fmt` | [app/system/production/TeamBoard.tsx](<../../../app/system/production/TeamBoard.tsx>) | 215–215 |
| `pct` | [app/system/production/TeamBoard.tsx](<../../../app/system/production/TeamBoard.tsx>) | 216–216 |
| `fill` | [app/system/production/TeamBoard.tsx](<../../../app/system/production/TeamBoard.tsx>) | 217–217 |
| `errorText` | [app/system/production/TeamBoard.tsx](<../../../app/system/production/TeamBoard.tsx>) | 218–218 |
| `peopleOf` | [app/system/production/TeamBoard.tsx](<../../../app/system/production/TeamBoard.tsx>) | 221–222 |
| `draftOf` | [app/system/production/TeamBoard.tsx](<../../../app/system/production/TeamBoard.tsx>) | 251–296 |
| `inputOf` | [app/system/production/TeamBoard.tsx](<../../../app/system/production/TeamBoard.tsx>) | 299–326 |
| `weekdayName` | [app/system/production/TeamBoard.tsx](<../../../app/system/production/TeamBoard.tsx>) | 328–329 |
| `meetingText` | [app/system/production/TeamBoard.tsx](<../../../app/system/production/TeamBoard.tsx>) | 331–332 |
| `meetingUrl` | [app/system/production/TeamBoard.tsx](<../../../app/system/production/TeamBoard.tsx>) | 334–334 |
| `repeatRuleText` | [app/system/production/TeamBoard.tsx](<../../../app/system/production/TeamBoard.tsx>) | 336–337 |
| `taskWork` | [app/system/production/TeamBoard.tsx](<../../../app/system/production/TeamBoard.tsx>) | 339–359 |
| `TeamBoard` | [app/system/production/TeamBoard.tsx](<../../../app/system/production/TeamBoard.tsx>) | 361–1875 |
| `useDismiss` | [app/system/production/TeamBoard.tsx](<../../../app/system/production/TeamBoard.tsx>) | 1878–1892 |
| `TeamFilter` | [app/system/production/TeamBoard.tsx](<../../../app/system/production/TeamBoard.tsx>) | 1898–1928 |
| `KindPick` | [app/system/production/TeamBoard.tsx](<../../../app/system/production/TeamBoard.tsx>) | 1931–1961 |
| `GroupRows` | [app/system/production/TeamBoard.tsx](<../../../app/system/production/TeamBoard.tsx>) | 1967–1994 |
| `useSearchCopy` | [app/system/production/TeamBoard.tsx](<../../../app/system/production/TeamBoard.tsx>) | 1996–1999 |
| `peopleOptions` | [app/system/production/TeamBoard.tsx](<../../../app/system/production/TeamBoard.tsx>) | 2000–2001 |
| `customerOptions` | [app/system/production/TeamBoard.tsx](<../../../app/system/production/TeamBoard.tsx>) | 2002–2003 |
| `outlookTime` | [app/system/production/TeamBoard.tsx](<../../../app/system/production/TeamBoard.tsx>) | 2016–2016 |
| `useWorkOptions` | [app/system/production/TeamBoard.tsx](<../../../app/system/production/TeamBoard.tsx>) | 2023–2060 |
| `TaskFields` | [app/system/production/TeamBoard.tsx](<../../../app/system/production/TeamBoard.tsx>) | 2063–2422 |
| `RepeatFields` | [app/system/production/TeamBoard.tsx](<../../../app/system/production/TeamBoard.tsx>) | 2428–2501 |
| `draftProblem` | [app/system/production/TeamBoard.tsx](<../../../app/system/production/TeamBoard.tsx>) | 2504–2517 |
| `draftMissing` | [app/system/production/TeamBoard.tsx](<../../../app/system/production/TeamBoard.tsx>) | 2519–2525 |
| `draftReady` | [app/system/production/TeamBoard.tsx](<../../../app/system/production/TeamBoard.tsx>) | 2526–2531 |
| `MissingLine` | [app/system/production/TeamBoard.tsx](<../../../app/system/production/TeamBoard.tsx>) | 2533–2541 |
| `AddTaskModal` | [app/system/production/TeamBoard.tsx](<../../../app/system/production/TeamBoard.tsx>) | 2543–2624 |
| `TaskDrawer` | [app/system/production/TeamBoard.tsx](<../../../app/system/production/TeamBoard.tsx>) | 2626–2831 |
| `WorkList` | [app/system/production/TeamBoard.tsx](<../../../app/system/production/TeamBoard.tsx>) | 2834–3129 |
| `InlineText` | [app/system/production/TeamBoard.tsx](<../../../app/system/production/TeamBoard.tsx>) | 3132–3162 |
| `InlineNumber` | [app/system/production/TeamBoard.tsx](<../../../app/system/production/TeamBoard.tsx>) | 3164–3195 |
| `TeamBoardGantt` | [app/system/production/TeamBoardGantt.tsx](<../../../app/system/production/TeamBoardGantt.tsx>) | 34–85 |
| `today` | [app/system/production/ResourceTaskWorkspace.tsx](<../../../app/system/production/ResourceTaskWorkspace.tsx>) | 19–19 |
| `errorText` | [app/system/production/ResourceTaskWorkspace.tsx](<../../../app/system/production/ResourceTaskWorkspace.tsx>) | 20–20 |
| `number` | [app/system/production/ResourceTaskWorkspace.tsx](<../../../app/system/production/ResourceTaskWorkspace.tsx>) | 21–21 |
| `percent` | [app/system/production/ResourceTaskWorkspace.tsx](<../../../app/system/production/ResourceTaskWorkspace.tsx>) | 22–22 |
| `TaskSelect` | [app/system/production/ResourceTaskWorkspace.tsx](<../../../app/system/production/ResourceTaskWorkspace.tsx>) | 23–23 |
| `taskLabel` | [app/system/production/ResourceTaskWorkspace.tsx](<../../../app/system/production/ResourceTaskWorkspace.tsx>) | 24–24 |
| `ResourceTaskWorkspace` | [app/system/production/ResourceTaskWorkspace.tsx](<../../../app/system/production/ResourceTaskWorkspace.tsx>) | 26–95 |
| `ImpactView` | [app/system/production/ResourceTaskWorkspace.tsx](<../../../app/system/production/ResourceTaskWorkspace.tsx>) | 97–97 |
| `TaskDialog` | [app/system/production/ResourceTaskWorkspace.tsx](<../../../app/system/production/ResourceTaskWorkspace.tsx>) | 99–143 |
| `fill` | [app/system/production/IssueBatchScreen.tsx](<../../../app/system/production/IssueBatchScreen.tsx>) | 82–82 |
| `errorText` | [app/system/production/IssueBatchScreen.tsx](<../../../app/system/production/IssueBatchScreen.tsx>) | 83–83 |
| `issueToday` | [app/system/production/IssueBatchScreen.tsx](<../../../app/system/production/IssueBatchScreen.tsx>) | 84–84 |
| `addDays` | [app/system/production/IssueBatchScreen.tsx](<../../../app/system/production/IssueBatchScreen.tsx>) | 85–85 |
| `mondayOf` | [app/system/production/IssueBatchScreen.tsx](<../../../app/system/production/IssueBatchScreen.tsx>) | 86–86 |
| `isConflict` | [app/system/production/IssueBatchScreen.tsx](<../../../app/system/production/IssueBatchScreen.tsx>) | 87–87 |
| `useDates` | [app/system/production/IssueBatchScreen.tsx](<../../../app/system/production/IssueBatchScreen.tsx>) | 89–100 |
| `PgDialog` | [app/system/production/IssueBatchScreen.tsx](<../../../app/system/production/IssueBatchScreen.tsx>) | 108–173 |
| `useBubble` | [app/system/production/IssueBatchScreen.tsx](<../../../app/system/production/IssueBatchScreen.tsx>) | 176–218 |
| `IssueStateBadge` | [app/system/production/IssueBatchScreen.tsx](<../../../app/system/production/IssueBatchScreen.tsx>) | 220–223 |
| `CategoryBadge` | [app/system/production/IssueBatchScreen.tsx](<../../../app/system/production/IssueBatchScreen.tsx>) | 225–228 |
| `imageUrl` | [app/system/production/IssueBatchScreen.tsx](<../../../app/system/production/IssueBatchScreen.tsx>) | 231–240 |
| `SavedThumb` | [app/system/production/IssueBatchScreen.tsx](<../../../app/system/production/IssueBatchScreen.tsx>) | 242–275 |
| `DraftThumb` | [app/system/production/IssueBatchScreen.tsx](<../../../app/system/production/IssueBatchScreen.tsx>) | 277–291 |
| `PictureViewer` | [app/system/production/IssueBatchScreen.tsx](<../../../app/system/production/IssueBatchScreen.tsx>) | 293–318 |
| `imageFiles` | [app/system/production/IssueBatchScreen.tsx](<../../../app/system/production/IssueBatchScreen.tsx>) | 320–320 |
| `ProjectPicker` | [app/system/production/IssueBatchScreen.tsx](<../../../app/system/production/IssueBatchScreen.tsx>) | 326–406 |
| `headerOf` | [app/system/production/IssueBatchScreen.tsx](<../../../app/system/production/IssueBatchScreen.tsx>) | 409–421 |
| `headerInput` | [app/system/production/IssueBatchScreen.tsx](<../../../app/system/production/IssueBatchScreen.tsx>) | 422–429 |
| `headerError` | [app/system/production/IssueBatchScreen.tsx](<../../../app/system/production/IssueBatchScreen.tsx>) | 431–438 |
| `HeaderFields` | [app/system/production/IssueBatchScreen.tsx](<../../../app/system/production/IssueBatchScreen.tsx>) | 440–514 |
| `draftKey` | [app/system/production/IssueBatchScreen.tsx](<../../../app/system/production/IssueBatchScreen.tsx>) | 519–519 |
| `newRowKey` | [app/system/production/IssueBatchScreen.tsx](<../../../app/system/production/IssueBatchScreen.tsx>) | 521–521 |
| `freshRows` | [app/system/production/IssueBatchScreen.tsx](<../../../app/system/production/IssueBatchScreen.tsx>) | 522–522 |
| `readDraft` | [app/system/production/IssueBatchScreen.tsx](<../../../app/system/production/IssueBatchScreen.tsx>) | 524–531 |
| `weekLoads` | [app/system/production/IssueBatchScreen.tsx](<../../../app/system/production/IssueBatchScreen.tsx>) | 539–585 |
| `IssueGridDialog` | [app/system/production/IssueBatchScreen.tsx](<../../../app/system/production/IssueBatchScreen.tsx>) | 587–1002 |
| `ItemEditDialog` | [app/system/production/IssueBatchScreen.tsx](<../../../app/system/production/IssueBatchScreen.tsx>) | 1006–1160 |
| `IssueActionDialog` | [app/system/production/IssueBatchScreen.tsx](<../../../app/system/production/IssueBatchScreen.tsx>) | 1163–1256 |
| `BatchDialog` | [app/system/production/IssueBatchScreen.tsx](<../../../app/system/production/IssueBatchScreen.tsx>) | 1262–1584 |
| `ExportDialog` | [app/system/production/IssueBatchScreen.tsx](<../../../app/system/production/IssueBatchScreen.tsx>) | 1588–1691 |
| `IssueBatchScreen` | [app/system/production/IssueBatchScreen.tsx](<../../../app/system/production/IssueBatchScreen.tsx>) | 1697–1900 |
| `fill` | [app/system/production/MyIssues.tsx](<../../../app/system/production/MyIssues.tsx>) | 17–17 |
| `today` | [app/system/production/MyIssues.tsx](<../../../app/system/production/MyIssues.tsx>) | 18–18 |
| `errorText` | [app/system/production/MyIssues.tsx](<../../../app/system/production/MyIssues.tsx>) | 19–19 |
| `CloseIssue` | [app/system/production/MyIssues.tsx](<../../../app/system/production/MyIssues.tsx>) | 21–49 |
| `MyIssuesPanel` | [app/system/production/MyIssues.tsx](<../../../app/system/production/MyIssues.tsx>) | 51–91 |
| `dropIndent` | [app/system/production/GanttChart.tsx](<../../../app/system/production/GanttChart.tsx>) | 68–68 |
| `placeSegments` | [app/system/production/GanttChart.tsx](<../../../app/system/production/GanttChart.tsx>) | 74–81 |
| `scheduleTone` | [app/system/production/GanttChart.tsx](<../../../app/system/production/GanttChart.tsx>) | 88–95 |
| `GanttToolbar` | [app/system/production/GanttChart.tsx](<../../../app/system/production/GanttChart.tsx>) | 101–120 |
| `GanttLegend` | [app/system/production/GanttChart.tsx](<../../../app/system/production/GanttChart.tsx>) | 134–149 |
| `drawLinks` | [app/system/production/GanttChart.tsx](<../../../app/system/production/GanttChart.tsx>) | 152–173 |
| `sideStorageKey` | [app/system/production/GanttChart.tsx](<../../../app/system/production/GanttChart.tsx>) | 180–180 |
| `readSide` | [app/system/production/GanttChart.tsx](<../../../app/system/production/GanttChart.tsx>) | 181–186 |
| `saveSide` | [app/system/production/GanttChart.tsx](<../../../app/system/production/GanttChart.tsx>) | 187–192 |
| `GanttChart` | [app/system/production/GanttChart.tsx](<../../../app/system/production/GanttChart.tsx>) | 194–460 |
| `taskMatches` | [app/system/production/ProjectPortfolioGantt.tsx](<../../../app/system/production/ProjectPortfolioGantt.tsx>) | 25–25 |
| `ProjectPortfolioGantt` | [app/system/production/ProjectPortfolioGantt.tsx](<../../../app/system/production/ProjectPortfolioGantt.tsx>) | 27–165 |

## Domain helpers / direct dependencies

- [backend-node/src/user-roles.ts](<../../../backend-node/src/user-roles.ts>)
- [backend-node/src/project-scope.ts](<../../../backend-node/src/project-scope.ts>)
- [backend-node/src/leader-scope.ts](<../../../backend-node/src/leader-scope.ts>)
- [backend-node/src/manhour-budget.ts](<../../../backend-node/src/manhour-budget.ts>)
- [backend-node/src/schedule-calculator.ts](<../../../backend-node/src/schedule-calculator.ts>)
- [backend-node/src/plan-people.ts](<../../../backend-node/src/plan-people.ts>)
- [backend-node/src/business-date.ts](<../../../backend-node/src/business-date.ts>)
- [backend-node/src/project-health.ts](<../../../backend-node/src/project-health.ts>)
- [backend-node/src/team-week.ts](<../../../backend-node/src/team-week.ts>)
- [backend-node/src/work-days.ts](<../../../backend-node/src/work-days.ts>)
- [backend-node/src/schedule-service.ts](<../../../backend-node/src/schedule-service.ts>)
- [backend-node/src/email.ts](<../../../backend-node/src/email.ts>)
- [backend-node/src/project-notices.ts](<../../../backend-node/src/project-notices.ts>)
- [backend-node/src/project-initial-plan.ts](<../../../backend-node/src/project-initial-plan.ts>)
- [backend-node/src/resource-task-service.ts](<../../../backend-node/src/resource-task-service.ts>)
- [backend-node/src/resource-workload.ts](<../../../backend-node/src/resource-workload.ts>)
- [backend-node/src/site-visit-common.ts](<../../../backend-node/src/site-visit-common.ts>)
- [backend-node/src/team-calendar.ts](<../../../backend-node/src/team-calendar.ts>)
- [backend-node/src/outlook-calendar.ts](<../../../backend-node/src/outlook-calendar.ts>)
- [backend-node/src/team-task-series.ts](<../../../backend-node/src/team-task-series.ts>)
- [backend-node/src/resource-task-math.ts](<../../../backend-node/src/resource-task-math.ts>)
- [backend-node/src/document-storage.ts](<../../../backend-node/src/document-storage.ts>)
- [backend-node/src/issue-batches.ts](<../../../backend-node/src/issue-batches.ts>)
- [backend-node/src/outlook-write.ts](<../../../backend-node/src/outlook-write.ts>)
- [backend-node/src/work-blocks.ts](<../../../backend-node/src/work-blocks.ts>)
- [backend-node/src/routes/work-days.ts](<../../../backend-node/src/routes/work-days.ts>)
- [app/system/dialogs.ts](<../../../app/system/dialogs.ts>)
- [app/system/i18n.ts](<../../../app/system/i18n.ts>)
- [app/system/LocalizedText.tsx](<../../../app/system/LocalizedText.tsx>)
- [app/system/production/SigningScreens.tsx](<../../../app/system/production/SigningScreens.tsx>)
- [app/system/production/ResourceTaskWorkspace.tsx](<../../../app/system/production/ResourceTaskWorkspace.tsx>)
- [app/system/production/SearchMultiPicker.tsx](<../../../app/system/production/SearchMultiPicker.tsx>)
- [lib/schedule-workbook.ts](<../../../lib/schedule-workbook.ts>)
- [lib/plan-discipline.ts](<../../../lib/plan-discipline.ts>)
- [app/system/production/MyIssues.tsx](<../../../app/system/production/MyIssues.tsx>)
- [lib/erp-estimate-workbook.ts](<../../../lib/erp-estimate-workbook.ts>)
- [lib/estimate-ux.ts](<../../../lib/estimate-ux.ts>)
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
- [app/system/production/SearchSelect.tsx](<../../../app/system/production/SearchSelect.tsx>)
- [lib/plan-people.ts](<../../../lib/plan-people.ts>)
- [lib/manhour-budget.ts](<../../../lib/manhour-budget.ts>)
- [app/system/production/pegasus-skin.css](<../../../app/system/production/pegasus-skin.css>)
- [app/system/production/my-work.css](<../../../app/system/production/my-work.css>)
- [app/system/api-client.ts](<../../../app/system/api-client.ts>)
- [app/system/ui.tsx](<../../../app/system/ui.tsx>)
- [lib/cost-item-lookup.ts](<../../../lib/cost-item-lookup.ts>)
- [lib/estimate-assignment-queue.ts](<../../../lib/estimate-assignment-queue.ts>)
- [lib/my-work.ts](<../../../lib/my-work.ts>)
- [app/system/production/CrmScreens.tsx](<../../../app/system/production/CrmScreens.tsx>)
- [app/system/DateInput.tsx](<../../../app/system/DateInput.tsx>)
- [app/system/production/MyWeekScreen.tsx](<../../../app/system/production/MyWeekScreen.tsx>)
- [app/system/production/VendorWork.tsx](<../../../app/system/production/VendorWork.tsx>)
- [lib/work-days.ts](<../../../lib/work-days.ts>)
- [app/system/production/work-days.css](<../../../app/system/production/work-days.css>)
- [app/system/production/WorkDaysPanel.tsx](<../../../app/system/production/WorkDaysPanel.tsx>)
- [lib/my-week.ts](<../../../lib/my-week.ts>)
- [app/system/production/my-week.css](<../../../app/system/production/my-week.css>)
- [app/system/production/vendor-work.css](<../../../app/system/production/vendor-work.css>)
- [app/system/production/WorkQueue.tsx](<../../../app/system/production/WorkQueue.tsx>)
- [app/system/production/WorkloadGantt.tsx](<../../../app/system/production/WorkloadGantt.tsx>)
- [app/system/production/TeamBoard.tsx](<../../../app/system/production/TeamBoard.tsx>)
- [backend-node/src/project-cost-model.ts](<../../../backend-node/src/project-cost-model.ts>)
- [app/system/production/workload.css](<../../../app/system/production/workload.css>)
- [app/system/production/allocation.css](<../../../app/system/production/allocation.css>)
- [app/system/production/team-week.css](<../../../app/system/production/team-week.css>)
- [app/system/production/TeamBoardGantt.tsx](<../../../app/system/production/TeamBoardGantt.tsx>)
- [lib/capacity-plan.ts](<../../../lib/capacity-plan.ts>)
- [lib/team-week.ts](<../../../lib/team-week.ts>)
- [app/system/production/team-board.css](<../../../app/system/production/team-board.css>)
- [app/system/production/resource-tasks.css](<../../../app/system/production/resource-tasks.css>)
- [lib/issue-workbook.ts](<../../../lib/issue-workbook.ts>)
- [lib/issue-batches.ts](<../../../lib/issue-batches.ts>)
- [app/system/production/issue-batch-client.ts](<../../../app/system/production/issue-batch-client.ts>)
- [app/system/tomas-ui/IssueBatchList.tsx](<../../../app/system/tomas-ui/IssueBatchList.tsx>)
- [app/system/production/issue-batch.css](<../../../app/system/production/issue-batch.css>)
- [app/system/production/gantt.css](<../../../app/system/production/gantt.css>)
- [app/system/production/PlanningPricingScreens.tsx](<../../../app/system/production/PlanningPricingScreens.tsx>)

## Candidate regression tests

- [tests/customer-schedule-template.test.mjs](<../../../tests/customer-schedule-template.test.mjs>)
- [tests/customer-schedule-workbook.test.mjs](<../../../tests/customer-schedule-workbook.test.mjs>)
- [tests/issue-batches.test.mjs](<../../../tests/issue-batches.test.mjs>)
- [tests/my-week.test.mjs](<../../../tests/my-week.test.mjs>)
- [tests/resource-planning.test.mjs](<../../../tests/resource-planning.test.mjs>)
- [tests/schedule-workbook.test.mjs](<../../../tests/schedule-workbook.test.mjs>)
- [tests/team-week.test.mjs](<../../../tests/team-week.test.mjs>)
- [tests/work-days.test.mjs](<../../../tests/work-days.test.mjs>)
- [backend-node/tests/drawing-workflow.test.ts](<../../../backend-node/tests/drawing-workflow.test.ts>)
- [backend-node/tests/issue-batches.test.ts](<../../../backend-node/tests/issue-batches.test.ts>)
- [backend-node/tests/resource-plan-approval-guard.test.ts](<../../../backend-node/tests/resource-plan-approval-guard.test.ts>)
- [backend-node/tests/resource-planning.test.ts](<../../../backend-node/tests/resource-planning.test.ts>)
- [backend-node/tests/resource-task-math.test.ts](<../../../backend-node/tests/resource-task-math.test.ts>)
- [backend-node/tests/resource-workload.test.ts](<../../../backend-node/tests/resource-workload.test.ts>)
- [backend-node/tests/schedule-lag-work-days.test.ts](<../../../backend-node/tests/schedule-lag-work-days.test.ts>)
- [backend-node/tests/schedule-routes.test.ts](<../../../backend-node/tests/schedule-routes.test.ts>)
- [backend-node/tests/schedule-templates.test.ts](<../../../backend-node/tests/schedule-templates.test.ts>)
- [backend-node/tests/team-week.test.ts](<../../../backend-node/tests/team-week.test.ts>)
- [backend-node/tests/vendor-hours.test.ts](<../../../backend-node/tests/vendor-hours.test.ts>)
- [backend-node/tests/work-blocks.test.ts](<../../../backend-node/tests/work-blocks.test.ts>)
- [backend-node/tests/work-days.test.ts](<../../../backend-node/tests/work-days.test.ts>)

## Client contract lookup

Search the selected API path or function in [app/system/api-client.ts](<../../../app/system/api-client.ts>); follow its screen callers. Common UI/language changes require [app/system/ui.tsx](<../../../app/system/ui.tsx>) and [app/system/i18n.ts](<../../../app/system/i18n.ts>). For SQL changes use [schema map](../SCHEMA.md).
