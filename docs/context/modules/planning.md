# Schedule / Resource / My Work

[Context index](../../../AGENTS.md) · [Architecture](../ARCHITECTURE.md) · [Change guide](../WORKFLOW.md)

แผนงาน timeline กำลังคน lifecycle งานและคำขอปรับวัน

Evidence: snapshot `fe216837`; source map, not a live availability claim. Test candidates use filename matching and are not exhaustive coverage.

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
| `toError` | [app/system/production/PlanningPricingScreens.tsx](<../../../app/system/production/PlanningPricingScreens.tsx>) | 402–402 |
| `isConcurrencyConflict` | [app/system/production/PlanningPricingScreens.tsx](<../../../app/system/production/PlanningPricingScreens.tsx>) | 403–403 |
| `money` | [app/system/production/PlanningPricingScreens.tsx](<../../../app/system/production/PlanningPricingScreens.tsx>) | 404–409 |
| `number` | [app/system/production/PlanningPricingScreens.tsx](<../../../app/system/production/PlanningPricingScreens.tsx>) | 410–410 |
| `date` | [app/system/production/PlanningPricingScreens.tsx](<../../../app/system/production/PlanningPricingScreens.tsx>) | 411–411 |
| `dateTime` | [app/system/production/PlanningPricingScreens.tsx](<../../../app/system/production/PlanningPricingScreens.tsx>) | 412–416 |
| `isoToday` | [app/system/production/PlanningPricingScreens.tsx](<../../../app/system/production/PlanningPricingScreens.tsx>) | 418–418 |
| `ageInDays` | [app/system/production/PlanningPricingScreens.tsx](<../../../app/system/production/PlanningPricingScreens.tsx>) | 419–425 |
| `hostOf` | [app/system/production/PlanningPricingScreens.tsx](<../../../app/system/production/PlanningPricingScreens.tsx>) | 427–433 |
| `flattenTasks` | [app/system/production/PlanningPricingScreens.tsx](<../../../app/system/production/PlanningPricingScreens.tsx>) | 434–434 |
| `ResourcePlanLock` | [app/system/production/PlanningPricingScreens.tsx](<../../../app/system/production/PlanningPricingScreens.tsx>) | 437–444 |
| `LoadError` | [app/system/production/PlanningPricingScreens.tsx](<../../../app/system/production/PlanningPricingScreens.tsx>) | 446–462 |
| `PermissionNotice` | [app/system/production/PlanningPricingScreens.tsx](<../../../app/system/production/PlanningPricingScreens.tsx>) | 464–471 |
| `loadAllEstimates` | [app/system/production/PlanningPricingScreens.tsx](<../../../app/system/production/PlanningPricingScreens.tsx>) | 473–482 |
| `loadAllProjects` | [app/system/production/PlanningPricingScreens.tsx](<../../../app/system/production/PlanningPricingScreens.tsx>) | 484–493 |
| `loadAllSupplierPriceHistory` | [app/system/production/PlanningPricingScreens.tsx](<../../../app/system/production/PlanningPricingScreens.tsx>) | 495–504 |
| `mapSettledLimited` | [app/system/production/PlanningPricingScreens.tsx](<../../../app/system/production/PlanningPricingScreens.tsx>) | 506–522 |
| `loadPriceRecords` | [app/system/production/PlanningPricingScreens.tsx](<../../../app/system/production/PlanningPricingScreens.tsx>) | 524–636 |
| `loadSchedules` | [app/system/production/PlanningPricingScreens.tsx](<../../../app/system/production/PlanningPricingScreens.tsx>) | 638–646 |
| `usePrices` | [app/system/production/PlanningPricingScreens.tsx](<../../../app/system/production/PlanningPricingScreens.tsx>) | 648–671 |
| `progressProblem` | [app/system/production/PlanningPricingScreens.tsx](<../../../app/system/production/PlanningPricingScreens.tsx>) | 674–685 |
| `ProgressModal` | [app/system/production/PlanningPricingScreens.tsx](<../../../app/system/production/PlanningPricingScreens.tsx>) | 687–890 |
| `workEffectiveFinish` | [app/system/production/PlanningPricingScreens.tsx](<../../../app/system/production/PlanningPricingScreens.tsx>) | 893–893 |
| `workIsLate` | [app/system/production/PlanningPricingScreens.tsx](<../../../app/system/production/PlanningPricingScreens.tsx>) | 895–895 |
| `workNeedsForecast` | [app/system/production/PlanningPricingScreens.tsx](<../../../app/system/production/PlanningPricingScreens.tsx>) | 896–896 |
| `workIsStale` | [app/system/production/PlanningPricingScreens.tsx](<../../../app/system/production/PlanningPricingScreens.tsx>) | 897–897 |
| `workLastReport` | [app/system/production/PlanningPricingScreens.tsx](<../../../app/system/production/PlanningPricingScreens.tsx>) | 899–899 |
| `workNeedsUpdate` | [app/system/production/PlanningPricingScreens.tsx](<../../../app/system/production/PlanningPricingScreens.tsx>) | 900–900 |
| `workUserNote` | [app/system/production/PlanningPricingScreens.tsx](<../../../app/system/production/PlanningPricingScreens.tsx>) | 901–901 |
| `historyReason` | [app/system/production/PlanningPricingScreens.tsx](<../../../app/system/production/PlanningPricingScreens.tsx>) | 903–903 |
| `historyValue` | [app/system/production/PlanningPricingScreens.tsx](<../../../app/system/production/PlanningPricingScreens.tsx>) | 906–906 |
| `historyShown` | [app/system/production/PlanningPricingScreens.tsx](<../../../app/system/production/PlanningPricingScreens.tsx>) | 908–909 |
| `daysFromToday` | [app/system/production/PlanningPricingScreens.tsx](<../../../app/system/production/PlanningPricingScreens.tsx>) | 910–910 |
| `myWorkInitials` | [app/system/production/PlanningPricingScreens.tsx](<../../../app/system/production/PlanningPricingScreens.tsx>) | 911–917 |
| `quietDays` | [app/system/production/PlanningPricingScreens.tsx](<../../../app/system/production/PlanningPricingScreens.tsx>) | 918–921 |
| `useChangeWords` | [app/system/production/PlanningPricingScreens.tsx](<../../../app/system/production/PlanningPricingScreens.tsx>) | 924–938 |
| `matchesWorkFilter` | [app/system/production/PlanningPricingScreens.tsx](<../../../app/system/production/PlanningPricingScreens.tsx>) | 1014–1025 |
| `groupScheduleWork` | [app/system/production/PlanningPricingScreens.tsx](<../../../app/system/production/PlanningPricingScreens.tsx>) | 1027–1078 |
| `groupEstimateWork` | [app/system/production/PlanningPricingScreens.tsx](<../../../app/system/production/PlanningPricingScreens.tsx>) | 1080–1123 |
| `estimateGroupMatchesFilter` | [app/system/production/PlanningPricingScreens.tsx](<../../../app/system/production/PlanningPricingScreens.tsx>) | 1125–1132 |
| `MyEstimateAssignmentsPanel` | [app/system/production/PlanningPricingScreens.tsx](<../../../app/system/production/PlanningPricingScreens.tsx>) | 1145–1225 |
| `WorkGroupMeta` | [app/system/production/PlanningPricingScreens.tsx](<../../../app/system/production/PlanningPricingScreens.tsx>) | 1228–1292 |
| `EstimateWorkGroupCard` | [app/system/production/PlanningPricingScreens.tsx](<../../../app/system/production/PlanningPricingScreens.tsx>) | 1294–1380 |
| `EstimateNextActionDetail` | [app/system/production/PlanningPricingScreens.tsx](<../../../app/system/production/PlanningPricingScreens.tsx>) | 1382–1420 |
| `useMyEstimateAssignments` | [app/system/production/PlanningPricingScreens.tsx](<../../../app/system/production/PlanningPricingScreens.tsx>) | 1423–1453 |
| `ProductionMyWork` | [app/system/production/PlanningPricingScreens.tsx](<../../../app/system/production/PlanningPricingScreens.tsx>) | 1455–2247 |
| `QuickProgressControls` | [app/system/production/PlanningPricingScreens.tsx](<../../../app/system/production/PlanningPricingScreens.tsx>) | 2270–2421 |
| `workNeedsForecastFor` | [app/system/production/PlanningPricingScreens.tsx](<../../../app/system/production/PlanningPricingScreens.tsx>) | 2423–2423 |
| `myWorkProgressTarget` | [app/system/production/PlanningPricingScreens.tsx](<../../../app/system/production/PlanningPricingScreens.tsx>) | 2425–2436 |
| `ProductionWorkControls` | [app/system/production/PlanningPricingScreens.tsx](<../../../app/system/production/PlanningPricingScreens.tsx>) | 2438–2475 |
| `ProductionScheduleWorkGroup` | [app/system/production/PlanningPricingScreens.tsx](<../../../app/system/production/PlanningPricingScreens.tsx>) | 2477–2582 |
| `ProductionMyTaskRow` | [app/system/production/PlanningPricingScreens.tsx](<../../../app/system/production/PlanningPricingScreens.tsx>) | 2584–2778 |
| `ProductionRequestDaysModal` | [app/system/production/PlanningPricingScreens.tsx](<../../../app/system/production/PlanningPricingScreens.tsx>) | 2780–2844 |
| `ProductionPersonalTaskModal` | [app/system/production/PlanningPricingScreens.tsx](<../../../app/system/production/PlanningPricingScreens.tsx>) | 2846–2949 |
| `usePicOptions` | [app/system/production/PlanningPricingScreens.tsx](<../../../app/system/production/PlanningPricingScreens.tsx>) | 2952–2954 |
| `ensureScheduleMembers` | [app/system/production/PlanningPricingScreens.tsx](<../../../app/system/production/PlanningPricingScreens.tsx>) | 2955–2959 |
| `usePlanTeam` | [app/system/production/PlanningPricingScreens.tsx](<../../../app/system/production/PlanningPricingScreens.tsx>) | 2961–2981 |
| `PicPicker` | [app/system/production/PlanningPricingScreens.tsx](<../../../app/system/production/PlanningPricingScreens.tsx>) | 2982–3000 |
| `startDraftOf` | [app/system/production/PlanningPricingScreens.tsx](<../../../app/system/production/PlanningPricingScreens.tsx>) | 3004–3012 |
| `startReady` | [app/system/production/PlanningPricingScreens.tsx](<../../../app/system/production/PlanningPricingScreens.tsx>) | 3013–3013 |
| `startBody` | [app/system/production/PlanningPricingScreens.tsx](<../../../app/system/production/PlanningPricingScreens.tsx>) | 3015–3018 |
| `predecessorChoices` | [app/system/production/PlanningPricingScreens.tsx](<../../../app/system/production/PlanningPricingScreens.tsx>) | 3024–3044 |
| `PlanStartFields` | [app/system/production/PlanningPricingScreens.tsx](<../../../app/system/production/PlanningPricingScreens.tsx>) | 3047–3109 |
| `draftSpan` | [app/system/production/PlanningPricingScreens.tsx](<../../../app/system/production/PlanningPricingScreens.tsx>) | 3117–3121 |
| `PicFieldsWithLoad` | [app/system/production/PlanningPricingScreens.tsx](<../../../app/system/production/PlanningPricingScreens.tsx>) | 3124–3155 |
| `canTakeSubTasks` | [app/system/production/PlanningPricingScreens.tsx](<../../../app/system/production/PlanningPricingScreens.tsx>) | 3158–3162 |
| `customerPeriod` | [app/system/production/PlanningPricingScreens.tsx](<../../../app/system/production/PlanningPricingScreens.tsx>) | 3165–3166 |
| `periodDays` | [app/system/production/PlanningPricingScreens.tsx](<../../../app/system/production/PlanningPricingScreens.tsx>) | 3167–3167 |
| `customerPeriodReady` | [app/system/production/PlanningPricingScreens.tsx](<../../../app/system/production/PlanningPricingScreens.tsx>) | 3169–3169 |
| `CustomerPeriodFields` | [app/system/production/PlanningPricingScreens.tsx](<../../../app/system/production/PlanningPricingScreens.tsx>) | 3171–3189 |
| `EditScheduleTaskModal` | [app/system/production/PlanningPricingScreens.tsx](<../../../app/system/production/PlanningPricingScreens.tsx>) | 3196–3495 |
| `BaselineModal` | [app/system/production/PlanningPricingScreens.tsx](<../../../app/system/production/PlanningPricingScreens.tsx>) | 3497–3575 |
| `ScheduleDayRequestAnswerModal` | [app/system/production/PlanningPricingScreens.tsx](<../../../app/system/production/PlanningPricingScreens.tsx>) | 3577–3677 |
| `planProjectStorageKey` | [app/system/production/PlanningPricingScreens.tsx](<../../../app/system/production/PlanningPricingScreens.tsx>) | 3679–3679 |
| `readLegendOpen` | [app/system/production/PlanningPricingScreens.tsx](<../../../app/system/production/PlanningPricingScreens.tsx>) | 3683–3689 |
| `saveLegendOpen` | [app/system/production/PlanningPricingScreens.tsx](<../../../app/system/production/PlanningPricingScreens.tsx>) | 3690–3696 |
| `planCommitments` | [app/system/production/PlanningPricingScreens.tsx](<../../../app/system/production/PlanningPricingScreens.tsx>) | 3709–3744 |
| `memberWindowOf` | [app/system/production/PlanningPricingScreens.tsx](<../../../app/system/production/PlanningPricingScreens.tsx>) | 3746–3751 |
| `byProjectNumber` | [app/system/production/PlanningPricingScreens.tsx](<../../../app/system/production/PlanningPricingScreens.tsx>) | 3753–3753 |
| `isLeafTask` | [app/system/production/PlanningPricingScreens.tsx](<../../../app/system/production/PlanningPricingScreens.tsx>) | 3754–3754 |
| `memberGanttRows` | [app/system/production/PlanningPricingScreens.tsx](<../../../app/system/production/PlanningPricingScreens.tsx>) | 3762–3956 |
| `ProductionProjectSchedule` | [app/system/production/PlanningPricingScreens.tsx](<../../../app/system/production/PlanningPricingScreens.tsx>) | 3963–4757 |
| `PlanTaskDrawer` | [app/system/production/PlanningPricingScreens.tsx](<../../../app/system/production/PlanningPricingScreens.tsx>) | 4760–4961 |
| `PriceAgeBadge` | [app/system/production/PlanningPricingScreens.tsx](<../../../app/system/production/PlanningPricingScreens.tsx>) | 4963–4987 |
| `PriceLoadWarning` | [app/system/production/PlanningPricingScreens.tsx](<../../../app/system/production/PlanningPricingScreens.tsx>) | 4989–5004 |
| `ProductionPriceLibrary` | [app/system/production/PlanningPricingScreens.tsx](<../../../app/system/production/PlanningPricingScreens.tsx>) | 5006–5291 |
| `supplierQuotationCurrency` | [app/system/production/PlanningPricingScreens.tsx](<../../../app/system/production/PlanningPricingScreens.tsx>) | 5293–5294 |
| `addIsoDays` | [app/system/production/PlanningPricingScreens.tsx](<../../../app/system/production/PlanningPricingScreens.tsx>) | 5296–5300 |
| `quotationFileKind` | [app/system/production/PlanningPricingScreens.tsx](<../../../app/system/production/PlanningPricingScreens.tsx>) | 5302–5308 |
| `blankQuotationLine` | [app/system/production/PlanningPricingScreens.tsx](<../../../app/system/production/PlanningPricingScreens.tsx>) | 5310–5321 |
| `quotationLinesTotal` | [app/system/production/PlanningPricingScreens.tsx](<../../../app/system/production/PlanningPricingScreens.tsx>) | 5323–5323 |
| `thbRateInvalid` | [app/system/production/PlanningPricingScreens.tsx](<../../../app/system/production/PlanningPricingScreens.tsx>) | 5327–5331 |
| `thbRateOf` | [app/system/production/PlanningPricingScreens.tsx](<../../../app/system/production/PlanningPricingScreens.tsx>) | 5333–5333 |
| `catalogueKeyOf` | [app/system/production/PlanningPricingScreens.tsx](<../../../app/system/production/PlanningPricingScreens.tsx>) | 5351–5356 |
| `useCatalogueMatches` | [app/system/production/PlanningPricingScreens.tsx](<../../../app/system/production/PlanningPricingScreens.tsx>) | 5358–5396 |
| `priceChange` | [app/system/production/PlanningPricingScreens.tsx](<../../../app/system/production/PlanningPricingScreens.tsx>) | 5399–5402 |
| `CatalogueComparison` | [app/system/production/PlanningPricingScreens.tsx](<../../../app/system/production/PlanningPricingScreens.tsx>) | 5416–5521 |
| `QuotationLinesEditor` | [app/system/production/PlanningPricingScreens.tsx](<../../../app/system/production/PlanningPricingScreens.tsx>) | 5529–5680 |
| `SupplierQuotationUploadModal` | [app/system/production/PlanningPricingScreens.tsx](<../../../app/system/production/PlanningPricingScreens.tsx>) | 5682–6243 |
| `EditQuotationModal` | [app/system/production/PlanningPricingScreens.tsx](<../../../app/system/production/PlanningPricingScreens.tsx>) | 6245–6437 |
| `ReferencePriceModal` | [app/system/production/PlanningPricingScreens.tsx](<../../../app/system/production/PlanningPricingScreens.tsx>) | 6446–6591 |
| `ProductionSupplierQuotations` | [app/system/production/PlanningPricingScreens.tsx](<../../../app/system/production/PlanningPricingScreens.tsx>) | 6593–7004 |
| `ProductionWaitingSupplierPrice` | [app/system/production/PlanningPricingScreens.tsx](<../../../app/system/production/PlanningPricingScreens.tsx>) | 7006–7143 |
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
| `initials` | [app/system/production/ResourcePlanningScreen.tsx](<../../../app/system/production/ResourcePlanningScreen.tsx>) | 77–82 |
| `fmt` | [app/system/production/ResourcePlanningScreen.tsx](<../../../app/system/production/ResourcePlanningScreen.tsx>) | 83–83 |
| `percent` | [app/system/production/ResourcePlanningScreen.tsx](<../../../app/system/production/ResourcePlanningScreen.tsx>) | 84–84 |
| `tone` | [app/system/production/ResourcePlanningScreen.tsx](<../../../app/system/production/ResourcePlanningScreen.tsx>) | 85–85 |
| `today` | [app/system/production/ResourcePlanningScreen.tsx](<../../../app/system/production/ResourcePlanningScreen.tsx>) | 86–92 |
| `errorText` | [app/system/production/ResourcePlanningScreen.tsx](<../../../app/system/production/ResourcePlanningScreen.tsx>) | 93–98 |
| `tabStorageKey` | [app/system/production/ResourcePlanningScreen.tsx](<../../../app/system/production/ResourcePlanningScreen.tsx>) | 99–99 |
| `viewStorageKey` | [app/system/production/ResourcePlanningScreen.tsx](<../../../app/system/production/ResourcePlanningScreen.tsx>) | 100–100 |
| `readStored` | [app/system/production/ResourcePlanningScreen.tsx](<../../../app/system/production/ResourcePlanningScreen.tsx>) | 102–109 |
| `store` | [app/system/production/ResourcePlanningScreen.tsx](<../../../app/system/production/ResourcePlanningScreen.tsx>) | 110–116 |
| `byDueDate` | [app/system/production/ResourcePlanningScreen.tsx](<../../../app/system/production/ResourcePlanningScreen.tsx>) | 117–117 |
| `ProductionResourcePlan` | [app/system/production/ResourcePlanningScreen.tsx](<../../../app/system/production/ResourcePlanningScreen.tsx>) | 119–675 |
| `WorkList` | [app/system/production/ResourcePlanningScreen.tsx](<../../../app/system/production/ResourcePlanningScreen.tsx>) | 678–727 |
| `AssignPlanRowModal` | [app/system/production/ResourcePlanningScreen.tsx](<../../../app/system/production/ResourcePlanningScreen.tsx>) | 734–851 |
| `CapacityModal` | [app/system/production/ResourcePlanningScreen.tsx](<../../../app/system/production/ResourcePlanningScreen.tsx>) | 853–926 |
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
| `draftMissing` | [app/system/production/TeamBoard.tsx](<../../../app/system/production/TeamBoard.tsx>) | 2519–2527 |
| `draftReady` | [app/system/production/TeamBoard.tsx](<../../../app/system/production/TeamBoard.tsx>) | 2528–2533 |
| `MissingLine` | [app/system/production/TeamBoard.tsx](<../../../app/system/production/TeamBoard.tsx>) | 2535–2543 |
| `AddTaskModal` | [app/system/production/TeamBoard.tsx](<../../../app/system/production/TeamBoard.tsx>) | 2545–2626 |
| `TaskDrawer` | [app/system/production/TeamBoard.tsx](<../../../app/system/production/TeamBoard.tsx>) | 2628–2833 |
| `WorkList` | [app/system/production/TeamBoard.tsx](<../../../app/system/production/TeamBoard.tsx>) | 2836–3131 |
| `InlineText` | [app/system/production/TeamBoard.tsx](<../../../app/system/production/TeamBoard.tsx>) | 3134–3164 |
| `InlineNumber` | [app/system/production/TeamBoard.tsx](<../../../app/system/production/TeamBoard.tsx>) | 3166–3197 |
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
| `dropIndent` | [app/system/production/GanttChart.tsx](<../../../app/system/production/GanttChart.tsx>) | 90–90 |
| `placeSegments` | [app/system/production/GanttChart.tsx](<../../../app/system/production/GanttChart.tsx>) | 97–105 |
| `scheduleTone` | [app/system/production/GanttChart.tsx](<../../../app/system/production/GanttChart.tsx>) | 112–119 |
| `GanttToolbar` | [app/system/production/GanttChart.tsx](<../../../app/system/production/GanttChart.tsx>) | 125–179 |
| `GanttLegend` | [app/system/production/GanttChart.tsx](<../../../app/system/production/GanttChart.tsx>) | 193–247 |
| `drawLinks` | [app/system/production/GanttChart.tsx](<../../../app/system/production/GanttChart.tsx>) | 250–274 |
| `sideStorageKey` | [app/system/production/GanttChart.tsx](<../../../app/system/production/GanttChart.tsx>) | 281–281 |
| `readSide` | [app/system/production/GanttChart.tsx](<../../../app/system/production/GanttChart.tsx>) | 282–289 |
| `saveSide` | [app/system/production/GanttChart.tsx](<../../../app/system/production/GanttChart.tsx>) | 290–297 |
| `GanttChart` | [app/system/production/GanttChart.tsx](<../../../app/system/production/GanttChart.tsx>) | 299–763 |
| `taskMatches` | [app/system/production/ProjectPortfolioGantt.tsx](<../../../app/system/production/ProjectPortfolioGantt.tsx>) | 27–27 |
| `ProjectPortfolioGantt` | [app/system/production/ProjectPortfolioGantt.tsx](<../../../app/system/production/ProjectPortfolioGantt.tsx>) | 29–322 |

## Domain helpers / direct dependencies

- [backend-node/src/user-roles.ts](<../../../backend-node/src/user-roles.ts>)
- [backend-node/src/project-scope.ts](<../../../backend-node/src/project-scope.ts>)
- [backend-node/src/leader-scope.ts](<../../../backend-node/src/leader-scope.ts>)
- [backend-node/src/manhour-budget.ts](<../../../backend-node/src/manhour-budget.ts>)
- [backend-node/src/project-cost-model.ts](<../../../backend-node/src/project-cost-model.ts>)
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
- [app/system/production/schedule-change-text.ts](<../../../app/system/production/schedule-change-text.ts>)
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
- [lib/gantt-phase-colors.ts](<../../../lib/gantt-phase-colors.ts>)
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
