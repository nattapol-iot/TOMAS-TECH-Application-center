# Schedule / Resource / My Work

[Context index](../../../AGENTS.md) · [Architecture](../ARCHITECTURE.md) · [Change guide](../WORKFLOW.md)

แผนงาน timeline กำลังคน lifecycle งานและคำขอปรับวัน

Evidence: snapshot `064219fd`; source map, not a live availability claim. Test candidates use filename matching and are not exhaustive coverage.

## Read only the operation you change

- [schedule API and function map](../api/schedule.md) — registered in Node app
- [resource-planning API and function map](../api/resource-planning.md) — registered in Node app
- [team-board API and function map](../api/team-board.md) — registered in Node app
- [resource-tasks API and function map](../api/resource-tasks.md) — registered in Node app
- [schedule-templates API and function map](../api/schedule-templates.md) — registered in Node app

## UI function locator

Shared screens contain other modules: use the symbol and line range instead of reading the whole file.

| Symbol | Source | Lines |
|---|---|---|
| `toError` | [app/system/production/PlanningPricingScreens.tsx](<../../../app/system/production/PlanningPricingScreens.tsx>) | 356–356 |
| `isConcurrencyConflict` | [app/system/production/PlanningPricingScreens.tsx](<../../../app/system/production/PlanningPricingScreens.tsx>) | 357–359 |
| `money` | [app/system/production/PlanningPricingScreens.tsx](<../../../app/system/production/PlanningPricingScreens.tsx>) | 360–364 |
| `number` | [app/system/production/PlanningPricingScreens.tsx](<../../../app/system/production/PlanningPricingScreens.tsx>) | 365–365 |
| `date` | [app/system/production/PlanningPricingScreens.tsx](<../../../app/system/production/PlanningPricingScreens.tsx>) | 366–368 |
| `dateTime` | [app/system/production/PlanningPricingScreens.tsx](<../../../app/system/production/PlanningPricingScreens.tsx>) | 369–372 |
| `isoToday` | [app/system/production/PlanningPricingScreens.tsx](<../../../app/system/production/PlanningPricingScreens.tsx>) | 374–374 |
| `ageInDays` | [app/system/production/PlanningPricingScreens.tsx](<../../../app/system/production/PlanningPricingScreens.tsx>) | 375–381 |
| `hostOf` | [app/system/production/PlanningPricingScreens.tsx](<../../../app/system/production/PlanningPricingScreens.tsx>) | 383–383 |
| `flattenTasks` | [app/system/production/PlanningPricingScreens.tsx](<../../../app/system/production/PlanningPricingScreens.tsx>) | 384–384 |
| `ResourcePlanLock` | [app/system/production/PlanningPricingScreens.tsx](<../../../app/system/production/PlanningPricingScreens.tsx>) | 387–389 |
| `LoadError` | [app/system/production/PlanningPricingScreens.tsx](<../../../app/system/production/PlanningPricingScreens.tsx>) | 391–397 |
| `PermissionNotice` | [app/system/production/PlanningPricingScreens.tsx](<../../../app/system/production/PlanningPricingScreens.tsx>) | 399–404 |
| `loadAllEstimates` | [app/system/production/PlanningPricingScreens.tsx](<../../../app/system/production/PlanningPricingScreens.tsx>) | 406–415 |
| `loadAllProjects` | [app/system/production/PlanningPricingScreens.tsx](<../../../app/system/production/PlanningPricingScreens.tsx>) | 417–426 |
| `loadAllSupplierPriceHistory` | [app/system/production/PlanningPricingScreens.tsx](<../../../app/system/production/PlanningPricingScreens.tsx>) | 428–437 |
| `mapSettledLimited` | [app/system/production/PlanningPricingScreens.tsx](<../../../app/system/production/PlanningPricingScreens.tsx>) | 439–455 |
| `loadPriceRecords` | [app/system/production/PlanningPricingScreens.tsx](<../../../app/system/production/PlanningPricingScreens.tsx>) | 457–562 |
| `loadSchedules` | [app/system/production/PlanningPricingScreens.tsx](<../../../app/system/production/PlanningPricingScreens.tsx>) | 564–573 |
| `usePrices` | [app/system/production/PlanningPricingScreens.tsx](<../../../app/system/production/PlanningPricingScreens.tsx>) | 575–592 |
| `progressProblem` | [app/system/production/PlanningPricingScreens.tsx](<../../../app/system/production/PlanningPricingScreens.tsx>) | 595–606 |
| `ProgressModal` | [app/system/production/PlanningPricingScreens.tsx](<../../../app/system/production/PlanningPricingScreens.tsx>) | 608–708 |
| `workEffectiveFinish` | [app/system/production/PlanningPricingScreens.tsx](<../../../app/system/production/PlanningPricingScreens.tsx>) | 711–711 |
| `workIsLate` | [app/system/production/PlanningPricingScreens.tsx](<../../../app/system/production/PlanningPricingScreens.tsx>) | 713–713 |
| `workNeedsForecast` | [app/system/production/PlanningPricingScreens.tsx](<../../../app/system/production/PlanningPricingScreens.tsx>) | 714–714 |
| `workIsStale` | [app/system/production/PlanningPricingScreens.tsx](<../../../app/system/production/PlanningPricingScreens.tsx>) | 715–715 |
| `workLastReport` | [app/system/production/PlanningPricingScreens.tsx](<../../../app/system/production/PlanningPricingScreens.tsx>) | 717–717 |
| `workNeedsUpdate` | [app/system/production/PlanningPricingScreens.tsx](<../../../app/system/production/PlanningPricingScreens.tsx>) | 718–718 |
| `workUserNote` | [app/system/production/PlanningPricingScreens.tsx](<../../../app/system/production/PlanningPricingScreens.tsx>) | 719–719 |
| `historyReason` | [app/system/production/PlanningPricingScreens.tsx](<../../../app/system/production/PlanningPricingScreens.tsx>) | 721–721 |
| `historyValue` | [app/system/production/PlanningPricingScreens.tsx](<../../../app/system/production/PlanningPricingScreens.tsx>) | 724–724 |
| `historyShown` | [app/system/production/PlanningPricingScreens.tsx](<../../../app/system/production/PlanningPricingScreens.tsx>) | 726–726 |
| `daysFromToday` | [app/system/production/PlanningPricingScreens.tsx](<../../../app/system/production/PlanningPricingScreens.tsx>) | 727–729 |
| `myWorkInitials` | [app/system/production/PlanningPricingScreens.tsx](<../../../app/system/production/PlanningPricingScreens.tsx>) | 730–730 |
| `quietDays` | [app/system/production/PlanningPricingScreens.tsx](<../../../app/system/production/PlanningPricingScreens.tsx>) | 731–734 |
| `myWorkAuditFieldLabel` | [app/system/production/PlanningPricingScreens.tsx](<../../../app/system/production/PlanningPricingScreens.tsx>) | 753–753 |
| `matchesWorkFilter` | [app/system/production/PlanningPricingScreens.tsx](<../../../app/system/production/PlanningPricingScreens.tsx>) | 824–835 |
| `groupScheduleWork` | [app/system/production/PlanningPricingScreens.tsx](<../../../app/system/production/PlanningPricingScreens.tsx>) | 837–884 |
| `groupEstimateWork` | [app/system/production/PlanningPricingScreens.tsx](<../../../app/system/production/PlanningPricingScreens.tsx>) | 886–924 |
| `estimateGroupMatchesFilter` | [app/system/production/PlanningPricingScreens.tsx](<../../../app/system/production/PlanningPricingScreens.tsx>) | 926–933 |
| `MyEstimateAssignmentsPanel` | [app/system/production/PlanningPricingScreens.tsx](<../../../app/system/production/PlanningPricingScreens.tsx>) | 946–981 |
| `EstimateWorkGroupCard` | [app/system/production/PlanningPricingScreens.tsx](<../../../app/system/production/PlanningPricingScreens.tsx>) | 983–1021 |
| `EstimateNextActionDetail` | [app/system/production/PlanningPricingScreens.tsx](<../../../app/system/production/PlanningPricingScreens.tsx>) | 1023–1030 |
| `useMyEstimateAssignments` | [app/system/production/PlanningPricingScreens.tsx](<../../../app/system/production/PlanningPricingScreens.tsx>) | 1033–1049 |
| `ProductionMyWork` | [app/system/production/PlanningPricingScreens.tsx](<../../../app/system/production/PlanningPricingScreens.tsx>) | 1051–1510 |
| `MyWorkStat` | [app/system/production/PlanningPricingScreens.tsx](<../../../app/system/production/PlanningPricingScreens.tsx>) | 1512–1516 |
| `QuickProgressControls` | [app/system/production/PlanningPricingScreens.tsx](<../../../app/system/production/PlanningPricingScreens.tsx>) | 1539–1619 |
| `workNeedsForecastFor` | [app/system/production/PlanningPricingScreens.tsx](<../../../app/system/production/PlanningPricingScreens.tsx>) | 1621–1621 |
| `myWorkProgressTarget` | [app/system/production/PlanningPricingScreens.tsx](<../../../app/system/production/PlanningPricingScreens.tsx>) | 1623–1627 |
| `ProductionWorkControls` | [app/system/production/PlanningPricingScreens.tsx](<../../../app/system/production/PlanningPricingScreens.tsx>) | 1629–1640 |
| `ProductionScheduleWorkGroup` | [app/system/production/PlanningPricingScreens.tsx](<../../../app/system/production/PlanningPricingScreens.tsx>) | 1642–1704 |
| `ProductionMyTaskRow` | [app/system/production/PlanningPricingScreens.tsx](<../../../app/system/production/PlanningPricingScreens.tsx>) | 1706–1774 |
| `ProductionRequestDaysModal` | [app/system/production/PlanningPricingScreens.tsx](<../../../app/system/production/PlanningPricingScreens.tsx>) | 1776–1802 |
| `ProductionPersonalTaskModal` | [app/system/production/PlanningPricingScreens.tsx](<../../../app/system/production/PlanningPricingScreens.tsx>) | 1804–1853 |
| `usePicOptions` | [app/system/production/PlanningPricingScreens.tsx](<../../../app/system/production/PlanningPricingScreens.tsx>) | 1856–1858 |
| `ensureScheduleMembers` | [app/system/production/PlanningPricingScreens.tsx](<../../../app/system/production/PlanningPricingScreens.tsx>) | 1859–1863 |
| `usePlanTeam` | [app/system/production/PlanningPricingScreens.tsx](<../../../app/system/production/PlanningPricingScreens.tsx>) | 1865–1876 |
| `PicPicker` | [app/system/production/PlanningPricingScreens.tsx](<../../../app/system/production/PlanningPricingScreens.tsx>) | 1877–1883 |
| `startDraftOf` | [app/system/production/PlanningPricingScreens.tsx](<../../../app/system/production/PlanningPricingScreens.tsx>) | 1887–1889 |
| `startReady` | [app/system/production/PlanningPricingScreens.tsx](<../../../app/system/production/PlanningPricingScreens.tsx>) | 1890–1890 |
| `startBody` | [app/system/production/PlanningPricingScreens.tsx](<../../../app/system/production/PlanningPricingScreens.tsx>) | 1892–1894 |
| `predecessorChoices` | [app/system/production/PlanningPricingScreens.tsx](<../../../app/system/production/PlanningPricingScreens.tsx>) | 1900–1910 |
| `PlanStartFields` | [app/system/production/PlanningPricingScreens.tsx](<../../../app/system/production/PlanningPricingScreens.tsx>) | 1913–1942 |
| `draftSpan` | [app/system/production/PlanningPricingScreens.tsx](<../../../app/system/production/PlanningPricingScreens.tsx>) | 1945–1949 |
| `PicFieldsWithLoad` | [app/system/production/PlanningPricingScreens.tsx](<../../../app/system/production/PlanningPricingScreens.tsx>) | 1952–1967 |
| `canTakeSubTasks` | [app/system/production/PlanningPricingScreens.tsx](<../../../app/system/production/PlanningPricingScreens.tsx>) | 1970–1972 |
| `customerPeriod` | [app/system/production/PlanningPricingScreens.tsx](<../../../app/system/production/PlanningPricingScreens.tsx>) | 1975–1976 |
| `periodDays` | [app/system/production/PlanningPricingScreens.tsx](<../../../app/system/production/PlanningPricingScreens.tsx>) | 1977–1977 |
| `customerPeriodReady` | [app/system/production/PlanningPricingScreens.tsx](<../../../app/system/production/PlanningPricingScreens.tsx>) | 1979–1979 |
| `CustomerPeriodFields` | [app/system/production/PlanningPricingScreens.tsx](<../../../app/system/production/PlanningPricingScreens.tsx>) | 1981–1988 |
| `draftDates` | [app/system/production/PlanningPricingScreens.tsx](<../../../app/system/production/PlanningPricingScreens.tsx>) | 1997–2000 |
| `draftLevel` | [app/system/production/PlanningPricingScreens.tsx](<../../../app/system/production/PlanningPricingScreens.tsx>) | 2006–2018 |
| `PlanRowDraftEditor` | [app/system/production/PlanningPricingScreens.tsx](<../../../app/system/production/PlanningPricingScreens.tsx>) | 2025–2065 |
| `EditScheduleTaskModal` | [app/system/production/PlanningPricingScreens.tsx](<../../../app/system/production/PlanningPricingScreens.tsx>) | 2072–2165 |
| `BaselineModal` | [app/system/production/PlanningPricingScreens.tsx](<../../../app/system/production/PlanningPricingScreens.tsx>) | 2167–2210 |
| `ScheduleDayRequestAnswerModal` | [app/system/production/PlanningPricingScreens.tsx](<../../../app/system/production/PlanningPricingScreens.tsx>) | 2212–2259 |
| `planProjectStorageKey` | [app/system/production/PlanningPricingScreens.tsx](<../../../app/system/production/PlanningPricingScreens.tsx>) | 2268–2268 |
| `planCommitments` | [app/system/production/PlanningPricingScreens.tsx](<../../../app/system/production/PlanningPricingScreens.tsx>) | 2281–2296 |
| `memberWindowOf` | [app/system/production/PlanningPricingScreens.tsx](<../../../app/system/production/PlanningPricingScreens.tsx>) | 2298–2302 |
| `byProjectNumber` | [app/system/production/PlanningPricingScreens.tsx](<../../../app/system/production/PlanningPricingScreens.tsx>) | 2304–2304 |
| `isLeafTask` | [app/system/production/PlanningPricingScreens.tsx](<../../../app/system/production/PlanningPricingScreens.tsx>) | 2305–2305 |
| `taskOrDescendantMatches` | [app/system/production/PlanningPricingScreens.tsx](<../../../app/system/production/PlanningPricingScreens.tsx>) | 2306–2307 |
| `planRows` | [app/system/production/PlanningPricingScreens.tsx](<../../../app/system/production/PlanningPricingScreens.tsx>) | 2310–2321 |
| `memberGanttRows` | [app/system/production/PlanningPricingScreens.tsx](<../../../app/system/production/PlanningPricingScreens.tsx>) | 2329–2416 |
| `ProductionProjectSchedule` | [app/system/production/PlanningPricingScreens.tsx](<../../../app/system/production/PlanningPricingScreens.tsx>) | 2423–2945 |
| `PlanTaskDrawer` | [app/system/production/PlanningPricingScreens.tsx](<../../../app/system/production/PlanningPricingScreens.tsx>) | 2948–3017 |
| `PriceAgeBadge` | [app/system/production/PlanningPricingScreens.tsx](<../../../app/system/production/PlanningPricingScreens.tsx>) | 3019–3024 |
| `PriceLoadWarning` | [app/system/production/PlanningPricingScreens.tsx](<../../../app/system/production/PlanningPricingScreens.tsx>) | 3026–3028 |
| `ProductionPriceLibrary` | [app/system/production/PlanningPricingScreens.tsx](<../../../app/system/production/PlanningPricingScreens.tsx>) | 3030–3127 |
| `supplierQuotationCurrency` | [app/system/production/PlanningPricingScreens.tsx](<../../../app/system/production/PlanningPricingScreens.tsx>) | 3129–3130 |
| `addIsoDays` | [app/system/production/PlanningPricingScreens.tsx](<../../../app/system/production/PlanningPricingScreens.tsx>) | 3132–3136 |
| `quotationFileKind` | [app/system/production/PlanningPricingScreens.tsx](<../../../app/system/production/PlanningPricingScreens.tsx>) | 3138–3144 |
| `blankQuotationLine` | [app/system/production/PlanningPricingScreens.tsx](<../../../app/system/production/PlanningPricingScreens.tsx>) | 3146–3149 |
| `quotationLinesTotal` | [app/system/production/PlanningPricingScreens.tsx](<../../../app/system/production/PlanningPricingScreens.tsx>) | 3151–3152 |
| `thbRateInvalid` | [app/system/production/PlanningPricingScreens.tsx](<../../../app/system/production/PlanningPricingScreens.tsx>) | 3156–3160 |
| `thbRateOf` | [app/system/production/PlanningPricingScreens.tsx](<../../../app/system/production/PlanningPricingScreens.tsx>) | 3162–3162 |
| `ThbRateField` | [app/system/production/PlanningPricingScreens.tsx](<../../../app/system/production/PlanningPricingScreens.tsx>) | 3164–3172 |
| `catalogueKeyOf` | [app/system/production/PlanningPricingScreens.tsx](<../../../app/system/production/PlanningPricingScreens.tsx>) | 3190–3195 |
| `useCatalogueMatches` | [app/system/production/PlanningPricingScreens.tsx](<../../../app/system/production/PlanningPricingScreens.tsx>) | 3197–3232 |
| `priceChange` | [app/system/production/PlanningPricingScreens.tsx](<../../../app/system/production/PlanningPricingScreens.tsx>) | 3235–3238 |
| `CatalogueComparison` | [app/system/production/PlanningPricingScreens.tsx](<../../../app/system/production/PlanningPricingScreens.tsx>) | 3252–3321 |
| `QuotationLinesEditor` | [app/system/production/PlanningPricingScreens.tsx](<../../../app/system/production/PlanningPricingScreens.tsx>) | 3329–3412 |
| `SupplierQuotationUploadModal` | [app/system/production/PlanningPricingScreens.tsx](<../../../app/system/production/PlanningPricingScreens.tsx>) | 3414–3828 |
| `EditQuotationModal` | [app/system/production/PlanningPricingScreens.tsx](<../../../app/system/production/PlanningPricingScreens.tsx>) | 3830–3977 |
| `ReferencePriceModal` | [app/system/production/PlanningPricingScreens.tsx](<../../../app/system/production/PlanningPricingScreens.tsx>) | 3986–4100 |
| `ProductionSupplierQuotations` | [app/system/production/PlanningPricingScreens.tsx](<../../../app/system/production/PlanningPricingScreens.tsx>) | 4102–4306 |
| `ProductionWaitingSupplierPrice` | [app/system/production/PlanningPricingScreens.tsx](<../../../app/system/production/PlanningPricingScreens.tsx>) | 4308–4330 |
| `initials` | [app/system/production/ResourcePlanningScreen.tsx](<../../../app/system/production/ResourcePlanningScreen.tsx>) | 71–76 |
| `fmt` | [app/system/production/ResourcePlanningScreen.tsx](<../../../app/system/production/ResourcePlanningScreen.tsx>) | 77–80 |
| `percent` | [app/system/production/ResourcePlanningScreen.tsx](<../../../app/system/production/ResourcePlanningScreen.tsx>) | 81–81 |
| `tone` | [app/system/production/ResourcePlanningScreen.tsx](<../../../app/system/production/ResourcePlanningScreen.tsx>) | 82–83 |
| `today` | [app/system/production/ResourcePlanningScreen.tsx](<../../../app/system/production/ResourcePlanningScreen.tsx>) | 84–90 |
| `errorText` | [app/system/production/ResourcePlanningScreen.tsx](<../../../app/system/production/ResourcePlanningScreen.tsx>) | 91–96 |
| `tabStorageKey` | [app/system/production/ResourcePlanningScreen.tsx](<../../../app/system/production/ResourcePlanningScreen.tsx>) | 97–97 |
| `viewStorageKey` | [app/system/production/ResourcePlanningScreen.tsx](<../../../app/system/production/ResourcePlanningScreen.tsx>) | 98–98 |
| `readStored` | [app/system/production/ResourcePlanningScreen.tsx](<../../../app/system/production/ResourcePlanningScreen.tsx>) | 100–107 |
| `store` | [app/system/production/ResourcePlanningScreen.tsx](<../../../app/system/production/ResourcePlanningScreen.tsx>) | 108–110 |
| `byDueDate` | [app/system/production/ResourcePlanningScreen.tsx](<../../../app/system/production/ResourcePlanningScreen.tsx>) | 111–112 |
| `ProductionResourcePlan` | [app/system/production/ResourcePlanningScreen.tsx](<../../../app/system/production/ResourcePlanningScreen.tsx>) | 114–569 |
| `WorkList` | [app/system/production/ResourcePlanningScreen.tsx](<../../../app/system/production/ResourcePlanningScreen.tsx>) | 572–619 |
| `CapacityModal` | [app/system/production/ResourcePlanningScreen.tsx](<../../../app/system/production/ResourcePlanningScreen.tsx>) | 621–705 |
| `teamsKey` | [app/system/production/TeamBoard.tsx](<../../../app/system/production/TeamBoard.tsx>) | 68–68 |
| `readTeams` | [app/system/production/TeamBoard.tsx](<../../../app/system/production/TeamBoard.tsx>) | 69–76 |
| `rowTypeLabel` | [app/system/production/TeamBoard.tsx](<../../../app/system/production/TeamBoard.tsx>) | 90–90 |
| `rowTitle` | [app/system/production/TeamBoard.tsx](<../../../app/system/production/TeamBoard.tsx>) | 91–93 |
| `rowCustomer` | [app/system/production/TeamBoard.tsx](<../../../app/system/production/TeamBoard.tsx>) | 94–94 |
| `rowTime` | [app/system/production/TeamBoard.tsx](<../../../app/system/production/TeamBoard.tsx>) | 95–95 |
| `rowStatus` | [app/system/production/TeamBoard.tsx](<../../../app/system/production/TeamBoard.tsx>) | 96–97 |
| `rowTone` | [app/system/production/TeamBoard.tsx](<../../../app/system/production/TeamBoard.tsx>) | 98–98 |
| `viewKey` | [app/system/production/TeamBoard.tsx](<../../../app/system/production/TeamBoard.tsx>) | 100–100 |
| `readView` | [app/system/production/TeamBoard.tsx](<../../../app/system/production/TeamBoard.tsx>) | 101–103 |
| `categoryOf` | [app/system/production/TeamBoard.tsx](<../../../app/system/production/TeamBoard.tsx>) | 110–111 |
| `itemCategory` | [app/system/production/TeamBoard.tsx](<../../../app/system/production/TeamBoard.tsx>) | 113–113 |
| `mondayOf` | [app/system/production/TeamBoard.tsx](<../../../app/system/production/TeamBoard.tsx>) | 114–114 |
| `initials` | [app/system/production/TeamBoard.tsx](<../../../app/system/production/TeamBoard.tsx>) | 115–115 |
| `fmt` | [app/system/production/TeamBoard.tsx](<../../../app/system/production/TeamBoard.tsx>) | 116–116 |
| `pct` | [app/system/production/TeamBoard.tsx](<../../../app/system/production/TeamBoard.tsx>) | 117–117 |
| `fill` | [app/system/production/TeamBoard.tsx](<../../../app/system/production/TeamBoard.tsx>) | 118–119 |
| `errorText` | [app/system/production/TeamBoard.tsx](<../../../app/system/production/TeamBoard.tsx>) | 120–120 |
| `peopleOf` | [app/system/production/TeamBoard.tsx](<../../../app/system/production/TeamBoard.tsx>) | 123–124 |
| `draftOf` | [app/system/production/TeamBoard.tsx](<../../../app/system/production/TeamBoard.tsx>) | 137–148 |
| `inputOf` | [app/system/production/TeamBoard.tsx](<../../../app/system/production/TeamBoard.tsx>) | 151–172 |
| `weekdayName` | [app/system/production/TeamBoard.tsx](<../../../app/system/production/TeamBoard.tsx>) | 174–175 |
| `meetingText` | [app/system/production/TeamBoard.tsx](<../../../app/system/production/TeamBoard.tsx>) | 177–178 |
| `meetingUrl` | [app/system/production/TeamBoard.tsx](<../../../app/system/production/TeamBoard.tsx>) | 180–180 |
| `repeatRuleText` | [app/system/production/TeamBoard.tsx](<../../../app/system/production/TeamBoard.tsx>) | 182–183 |
| `taskWork` | [app/system/production/TeamBoard.tsx](<../../../app/system/production/TeamBoard.tsx>) | 185–192 |
| `TeamBoard` | [app/system/production/TeamBoard.tsx](<../../../app/system/production/TeamBoard.tsx>) | 194–821 |
| `TeamFilter` | [app/system/production/TeamBoard.tsx](<../../../app/system/production/TeamBoard.tsx>) | 824–857 |
| `GroupRows` | [app/system/production/TeamBoard.tsx](<../../../app/system/production/TeamBoard.tsx>) | 859–864 |
| `useSearchCopy` | [app/system/production/TeamBoard.tsx](<../../../app/system/production/TeamBoard.tsx>) | 866–869 |
| `peopleOptions` | [app/system/production/TeamBoard.tsx](<../../../app/system/production/TeamBoard.tsx>) | 870–871 |
| `customerOptions` | [app/system/production/TeamBoard.tsx](<../../../app/system/production/TeamBoard.tsx>) | 872–873 |
| `outlookTime` | [app/system/production/TeamBoard.tsx](<../../../app/system/production/TeamBoard.tsx>) | 882–882 |
| `useWorkOptions` | [app/system/production/TeamBoard.tsx](<../../../app/system/production/TeamBoard.tsx>) | 885–900 |
| `TaskFields` | [app/system/production/TeamBoard.tsx](<../../../app/system/production/TeamBoard.tsx>) | 903–1115 |
| `RepeatFields` | [app/system/production/TeamBoard.tsx](<../../../app/system/production/TeamBoard.tsx>) | 1121–1163 |
| `draftProblem` | [app/system/production/TeamBoard.tsx](<../../../app/system/production/TeamBoard.tsx>) | 1166–1180 |
| `draftMissing` | [app/system/production/TeamBoard.tsx](<../../../app/system/production/TeamBoard.tsx>) | 1182–1185 |
| `draftReady` | [app/system/production/TeamBoard.tsx](<../../../app/system/production/TeamBoard.tsx>) | 1186–1188 |
| `MissingLine` | [app/system/production/TeamBoard.tsx](<../../../app/system/production/TeamBoard.tsx>) | 1190–1194 |
| `AddTaskModal` | [app/system/production/TeamBoard.tsx](<../../../app/system/production/TeamBoard.tsx>) | 1196–1235 |
| `TaskDrawer` | [app/system/production/TeamBoard.tsx](<../../../app/system/production/TeamBoard.tsx>) | 1237–1346 |
| `WorkList` | [app/system/production/TeamBoard.tsx](<../../../app/system/production/TeamBoard.tsx>) | 1349–1484 |
| `InlineText` | [app/system/production/TeamBoard.tsx](<../../../app/system/production/TeamBoard.tsx>) | 1487–1495 |
| `InlineNumber` | [app/system/production/TeamBoard.tsx](<../../../app/system/production/TeamBoard.tsx>) | 1497–1504 |
| `TeamBoardGantt` | [app/system/production/TeamBoardGantt.tsx](<../../../app/system/production/TeamBoardGantt.tsx>) | 34–85 |
| `today` | [app/system/production/ResourceTaskWorkspace.tsx](<../../../app/system/production/ResourceTaskWorkspace.tsx>) | 20–20 |
| `errorText` | [app/system/production/ResourceTaskWorkspace.tsx](<../../../app/system/production/ResourceTaskWorkspace.tsx>) | 21–21 |
| `number` | [app/system/production/ResourceTaskWorkspace.tsx](<../../../app/system/production/ResourceTaskWorkspace.tsx>) | 22–22 |
| `percent` | [app/system/production/ResourceTaskWorkspace.tsx](<../../../app/system/production/ResourceTaskWorkspace.tsx>) | 23–23 |
| `TaskSelect` | [app/system/production/ResourceTaskWorkspace.tsx](<../../../app/system/production/ResourceTaskWorkspace.tsx>) | 24–24 |
| `taskLabel` | [app/system/production/ResourceTaskWorkspace.tsx](<../../../app/system/production/ResourceTaskWorkspace.tsx>) | 25–25 |
| `ResourceTaskWorkspace` | [app/system/production/ResourceTaskWorkspace.tsx](<../../../app/system/production/ResourceTaskWorkspace.tsx>) | 27–98 |
| `ImpactView` | [app/system/production/ResourceTaskWorkspace.tsx](<../../../app/system/production/ResourceTaskWorkspace.tsx>) | 100–100 |
| `TaskDialog` | [app/system/production/ResourceTaskWorkspace.tsx](<../../../app/system/production/ResourceTaskWorkspace.tsx>) | 102–147 |
| `dropIndent` | [app/system/production/GanttChart.tsx](<../../../app/system/production/GanttChart.tsx>) | 65–65 |
| `placeSegments` | [app/system/production/GanttChart.tsx](<../../../app/system/production/GanttChart.tsx>) | 71–78 |
| `scheduleTone` | [app/system/production/GanttChart.tsx](<../../../app/system/production/GanttChart.tsx>) | 85–92 |
| `GanttToolbar` | [app/system/production/GanttChart.tsx](<../../../app/system/production/GanttChart.tsx>) | 98–113 |
| `GanttLegend` | [app/system/production/GanttChart.tsx](<../../../app/system/production/GanttChart.tsx>) | 115–128 |
| `drawLinks` | [app/system/production/GanttChart.tsx](<../../../app/system/production/GanttChart.tsx>) | 131–152 |
| `sideStorageKey` | [app/system/production/GanttChart.tsx](<../../../app/system/production/GanttChart.tsx>) | 159–159 |
| `readSide` | [app/system/production/GanttChart.tsx](<../../../app/system/production/GanttChart.tsx>) | 160–165 |
| `saveSide` | [app/system/production/GanttChart.tsx](<../../../app/system/production/GanttChart.tsx>) | 166–171 |
| `GanttChart` | [app/system/production/GanttChart.tsx](<../../../app/system/production/GanttChart.tsx>) | 173–428 |
| `taskMatches` | [app/system/production/ProjectPortfolioGantt.tsx](<../../../app/system/production/ProjectPortfolioGantt.tsx>) | 27–27 |
| `ProjectPortfolioGantt` | [app/system/production/ProjectPortfolioGantt.tsx](<../../../app/system/production/ProjectPortfolioGantt.tsx>) | 29–166 |

## Domain helpers / direct dependencies

- [backend-node/src/user-roles.ts](<../../../backend-node/src/user-roles.ts>)
- [backend-node/src/project-scope.ts](<../../../backend-node/src/project-scope.ts>)
- [backend-node/src/schedule-calculator.ts](<../../../backend-node/src/schedule-calculator.ts>)
- [backend-node/src/business-date.ts](<../../../backend-node/src/business-date.ts>)
- [backend-node/src/project-health.ts](<../../../backend-node/src/project-health.ts>)
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
- [app/system/dialogs.ts](<../../../app/system/dialogs.ts>)
- [app/system/i18n.ts](<../../../app/system/i18n.ts>)
- [app/system/LocalizedText.tsx](<../../../app/system/LocalizedText.tsx>)
- [app/system/production/SigningScreens.tsx](<../../../app/system/production/SigningScreens.tsx>)
- [app/system/production/ResourceTaskWorkspace.tsx](<../../../app/system/production/ResourceTaskWorkspace.tsx>)
- [app/system/production/SearchMultiPicker.tsx](<../../../app/system/production/SearchMultiPicker.tsx>)
- [lib/schedule-workbook.ts](<../../../lib/schedule-workbook.ts>)
- [lib/erp-estimate-workbook.ts](<../../../lib/erp-estimate-workbook.ts>)
- [lib/estimate-ux.ts](<../../../lib/estimate-ux.ts>)
- [app/system/use-activity-presence.ts](<../../../app/system/use-activity-presence.ts>)
- [app/system/production/LazyScreens.tsx](<../../../app/system/production/LazyScreens.tsx>)
- [app/system/project-overview-client.ts](<../../../app/system/project-overview-client.ts>)
- [lib/gantt.ts](<../../../lib/gantt.ts>)
- [app/system/production/GanttChart.tsx](<../../../app/system/production/GanttChart.tsx>)
- [app/system/resource-workload-client.ts](<../../../app/system/resource-workload-client.ts>)
- [lib/resource-planning.ts](<../../../lib/resource-planning.ts>)
- [lib/team-board.ts](<../../../lib/team-board.ts>)
- [app/system/production/PlanPicLoad.tsx](<../../../app/system/production/PlanPicLoad.tsx>)
- [app/system/screen-link.ts](<../../../app/system/screen-link.ts>)
- [app/system/production/ProjectPlanFields.tsx](<../../../app/system/production/ProjectPlanFields.tsx>)
- [app/system/production/my-work.css](<../../../app/system/production/my-work.css>)
- [app/system/api-client.ts](<../../../app/system/api-client.ts>)
- [app/system/ui.tsx](<../../../app/system/ui.tsx>)
- [lib/cost-item-lookup.ts](<../../../lib/cost-item-lookup.ts>)
- [lib/estimate-assignment-queue.ts](<../../../lib/estimate-assignment-queue.ts>)
- [lib/my-work.ts](<../../../lib/my-work.ts>)
- [app/system/production/CrmScreens.tsx](<../../../app/system/production/CrmScreens.tsx>)
- [app/system/DateInput.tsx](<../../../app/system/DateInput.tsx>)
- [app/system/production/WorkQueue.tsx](<../../../app/system/production/WorkQueue.tsx>)
- [app/system/production/WorkloadGantt.tsx](<../../../app/system/production/WorkloadGantt.tsx>)
- [app/system/production/TeamBoard.tsx](<../../../app/system/production/TeamBoard.tsx>)
- [app/system/production/workload.css](<../../../app/system/production/workload.css>)
- [app/system/production/SearchSelect.tsx](<../../../app/system/production/SearchSelect.tsx>)
- [app/system/production/TeamBoardGantt.tsx](<../../../app/system/production/TeamBoardGantt.tsx>)
- [app/system/production/team-board.css](<../../../app/system/production/team-board.css>)
- [app/system/use-fullscreen.ts](<../../../app/system/use-fullscreen.ts>)
- [app/system/production/resource-tasks.css](<../../../app/system/production/resource-tasks.css>)
- [app/system/production/gantt.css](<../../../app/system/production/gantt.css>)
- [app/system/production/PlanningPricingScreens.tsx](<../../../app/system/production/PlanningPricingScreens.tsx>)

## Candidate regression tests

- [tests/resource-planning.test.mjs](<../../../tests/resource-planning.test.mjs>)
- [tests/schedule-workbook.test.mjs](<../../../tests/schedule-workbook.test.mjs>)
- [backend-node/tests/drawing-workflow.test.ts](<../../../backend-node/tests/drawing-workflow.test.ts>)
- [backend-node/tests/resource-plan-approval-guard.test.ts](<../../../backend-node/tests/resource-plan-approval-guard.test.ts>)
- [backend-node/tests/resource-planning.test.ts](<../../../backend-node/tests/resource-planning.test.ts>)
- [backend-node/tests/resource-task-math.test.ts](<../../../backend-node/tests/resource-task-math.test.ts>)
- [backend-node/tests/resource-workload.test.ts](<../../../backend-node/tests/resource-workload.test.ts>)
- [backend-node/tests/schedule-routes.test.ts](<../../../backend-node/tests/schedule-routes.test.ts>)
- [backend-node/tests/schedule-templates.test.ts](<../../../backend-node/tests/schedule-templates.test.ts>)

## Client contract lookup

Search the selected API path or function in [app/system/api-client.ts](<../../../app/system/api-client.ts>); follow its screen callers. Common UI/language changes require [app/system/ui.tsx](<../../../app/system/ui.tsx>) and [app/system/i18n.ts](<../../../app/system/i18n.ts>). For SQL changes use [schema map](../SCHEMA.md).
