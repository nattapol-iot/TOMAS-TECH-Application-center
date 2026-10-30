# Schedule / Resource / My Work

[Context index](../../../AGENTS.md) · [Architecture](../ARCHITECTURE.md) · [Change guide](../WORKFLOW.md)

แผนงาน timeline กำลังคน lifecycle งานและคำขอปรับวัน

Evidence: snapshot `df41e727`; source map, not a live availability claim. Test candidates use filename matching and are not exhaustive coverage.

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
| `initials` | [app/system/production/ResourcePlanningScreen.tsx](<../../../app/system/production/ResourcePlanningScreen.tsx>) | 65–70 |
| `fmt` | [app/system/production/ResourcePlanningScreen.tsx](<../../../app/system/production/ResourcePlanningScreen.tsx>) | 71–74 |
| `percent` | [app/system/production/ResourcePlanningScreen.tsx](<../../../app/system/production/ResourcePlanningScreen.tsx>) | 75–75 |
| `tone` | [app/system/production/ResourcePlanningScreen.tsx](<../../../app/system/production/ResourcePlanningScreen.tsx>) | 76–77 |
| `today` | [app/system/production/ResourcePlanningScreen.tsx](<../../../app/system/production/ResourcePlanningScreen.tsx>) | 78–84 |
| `errorText` | [app/system/production/ResourcePlanningScreen.tsx](<../../../app/system/production/ResourcePlanningScreen.tsx>) | 85–90 |
| `tabStorageKey` | [app/system/production/ResourcePlanningScreen.tsx](<../../../app/system/production/ResourcePlanningScreen.tsx>) | 91–91 |
| `viewStorageKey` | [app/system/production/ResourcePlanningScreen.tsx](<../../../app/system/production/ResourcePlanningScreen.tsx>) | 92–92 |
| `readStored` | [app/system/production/ResourcePlanningScreen.tsx](<../../../app/system/production/ResourcePlanningScreen.tsx>) | 94–101 |
| `store` | [app/system/production/ResourcePlanningScreen.tsx](<../../../app/system/production/ResourcePlanningScreen.tsx>) | 102–104 |
| `byDueDate` | [app/system/production/ResourcePlanningScreen.tsx](<../../../app/system/production/ResourcePlanningScreen.tsx>) | 105–106 |
| `ProductionResourcePlan` | [app/system/production/ResourcePlanningScreen.tsx](<../../../app/system/production/ResourcePlanningScreen.tsx>) | 108–559 |
| `WorkList` | [app/system/production/ResourcePlanningScreen.tsx](<../../../app/system/production/ResourcePlanningScreen.tsx>) | 562–609 |
| `CapacityModal` | [app/system/production/ResourcePlanningScreen.tsx](<../../../app/system/production/ResourcePlanningScreen.tsx>) | 611–695 |
| `teamsKey` | [app/system/production/TeamBoard.tsx](<../../../app/system/production/TeamBoard.tsx>) | 52–52 |
| `readTeams` | [app/system/production/TeamBoard.tsx](<../../../app/system/production/TeamBoard.tsx>) | 53–60 |
| `rowTypeLabel` | [app/system/production/TeamBoard.tsx](<../../../app/system/production/TeamBoard.tsx>) | 71–71 |
| `rowTitle` | [app/system/production/TeamBoard.tsx](<../../../app/system/production/TeamBoard.tsx>) | 72–74 |
| `rowCustomer` | [app/system/production/TeamBoard.tsx](<../../../app/system/production/TeamBoard.tsx>) | 75–75 |
| `rowTime` | [app/system/production/TeamBoard.tsx](<../../../app/system/production/TeamBoard.tsx>) | 76–76 |
| `rowStatus` | [app/system/production/TeamBoard.tsx](<../../../app/system/production/TeamBoard.tsx>) | 77–78 |
| `rowTone` | [app/system/production/TeamBoard.tsx](<../../../app/system/production/TeamBoard.tsx>) | 79–79 |
| `viewKey` | [app/system/production/TeamBoard.tsx](<../../../app/system/production/TeamBoard.tsx>) | 81–81 |
| `readView` | [app/system/production/TeamBoard.tsx](<../../../app/system/production/TeamBoard.tsx>) | 82–84 |
| `categoryOf` | [app/system/production/TeamBoard.tsx](<../../../app/system/production/TeamBoard.tsx>) | 89–90 |
| `itemCategory` | [app/system/production/TeamBoard.tsx](<../../../app/system/production/TeamBoard.tsx>) | 92–92 |
| `mondayOf` | [app/system/production/TeamBoard.tsx](<../../../app/system/production/TeamBoard.tsx>) | 93–93 |
| `initials` | [app/system/production/TeamBoard.tsx](<../../../app/system/production/TeamBoard.tsx>) | 94–94 |
| `fmt` | [app/system/production/TeamBoard.tsx](<../../../app/system/production/TeamBoard.tsx>) | 95–95 |
| `pct` | [app/system/production/TeamBoard.tsx](<../../../app/system/production/TeamBoard.tsx>) | 96–96 |
| `fill` | [app/system/production/TeamBoard.tsx](<../../../app/system/production/TeamBoard.tsx>) | 97–98 |
| `errorText` | [app/system/production/TeamBoard.tsx](<../../../app/system/production/TeamBoard.tsx>) | 99–99 |
| `peopleOf` | [app/system/production/TeamBoard.tsx](<../../../app/system/production/TeamBoard.tsx>) | 102–103 |
| `draftOf` | [app/system/production/TeamBoard.tsx](<../../../app/system/production/TeamBoard.tsx>) | 112–120 |
| `inputOf` | [app/system/production/TeamBoard.tsx](<../../../app/system/production/TeamBoard.tsx>) | 121–133 |
| `taskWork` | [app/system/production/TeamBoard.tsx](<../../../app/system/production/TeamBoard.tsx>) | 135–140 |
| `TeamBoard` | [app/system/production/TeamBoard.tsx](<../../../app/system/production/TeamBoard.tsx>) | 142–646 |
| `TeamFilter` | [app/system/production/TeamBoard.tsx](<../../../app/system/production/TeamBoard.tsx>) | 649–682 |
| `GroupRows` | [app/system/production/TeamBoard.tsx](<../../../app/system/production/TeamBoard.tsx>) | 684–689 |
| `useSearchCopy` | [app/system/production/TeamBoard.tsx](<../../../app/system/production/TeamBoard.tsx>) | 691–694 |
| `peopleOptions` | [app/system/production/TeamBoard.tsx](<../../../app/system/production/TeamBoard.tsx>) | 695–696 |
| `customerOptions` | [app/system/production/TeamBoard.tsx](<../../../app/system/production/TeamBoard.tsx>) | 697–698 |
| `outlookTime` | [app/system/production/TeamBoard.tsx](<../../../app/system/production/TeamBoard.tsx>) | 707–707 |
| `useWorkOptions` | [app/system/production/TeamBoard.tsx](<../../../app/system/production/TeamBoard.tsx>) | 710–725 |
| `TaskFields` | [app/system/production/TeamBoard.tsx](<../../../app/system/production/TeamBoard.tsx>) | 728–910 |
| `draftProblem` | [app/system/production/TeamBoard.tsx](<../../../app/system/production/TeamBoard.tsx>) | 912–919 |
| `draftMissing` | [app/system/production/TeamBoard.tsx](<../../../app/system/production/TeamBoard.tsx>) | 921–924 |
| `draftReady` | [app/system/production/TeamBoard.tsx](<../../../app/system/production/TeamBoard.tsx>) | 925–925 |
| `MissingLine` | [app/system/production/TeamBoard.tsx](<../../../app/system/production/TeamBoard.tsx>) | 927–931 |
| `AddTaskModal` | [app/system/production/TeamBoard.tsx](<../../../app/system/production/TeamBoard.tsx>) | 933–971 |
| `TaskDrawer` | [app/system/production/TeamBoard.tsx](<../../../app/system/production/TeamBoard.tsx>) | 973–1056 |
| `WorkList` | [app/system/production/TeamBoard.tsx](<../../../app/system/production/TeamBoard.tsx>) | 1059–1191 |
| `InlineText` | [app/system/production/TeamBoard.tsx](<../../../app/system/production/TeamBoard.tsx>) | 1194–1202 |
| `InlineNumber` | [app/system/production/TeamBoard.tsx](<../../../app/system/production/TeamBoard.tsx>) | 1204–1211 |
| `TeamBoardGantt` | [app/system/production/TeamBoardGantt.tsx](<../../../app/system/production/TeamBoardGantt.tsx>) | 34–84 |
| `today` | [app/system/production/ResourceTaskWorkspace.tsx](<../../../app/system/production/ResourceTaskWorkspace.tsx>) | 16–16 |
| `errorText` | [app/system/production/ResourceTaskWorkspace.tsx](<../../../app/system/production/ResourceTaskWorkspace.tsx>) | 17–17 |
| `number` | [app/system/production/ResourceTaskWorkspace.tsx](<../../../app/system/production/ResourceTaskWorkspace.tsx>) | 18–18 |
| `percent` | [app/system/production/ResourceTaskWorkspace.tsx](<../../../app/system/production/ResourceTaskWorkspace.tsx>) | 19–19 |
| `TaskSelect` | [app/system/production/ResourceTaskWorkspace.tsx](<../../../app/system/production/ResourceTaskWorkspace.tsx>) | 20–20 |
| `taskLabel` | [app/system/production/ResourceTaskWorkspace.tsx](<../../../app/system/production/ResourceTaskWorkspace.tsx>) | 21–21 |
| `ResourceTaskWorkspace` | [app/system/production/ResourceTaskWorkspace.tsx](<../../../app/system/production/ResourceTaskWorkspace.tsx>) | 23–89 |
| `ImpactView` | [app/system/production/ResourceTaskWorkspace.tsx](<../../../app/system/production/ResourceTaskWorkspace.tsx>) | 91–91 |
| `TaskDialog` | [app/system/production/ResourceTaskWorkspace.tsx](<../../../app/system/production/ResourceTaskWorkspace.tsx>) | 93–138 |
| `placeSegments` | [app/system/production/GanttChart.tsx](<../../../app/system/production/GanttChart.tsx>) | 53–60 |
| `scheduleTone` | [app/system/production/GanttChart.tsx](<../../../app/system/production/GanttChart.tsx>) | 67–74 |
| `GanttToolbar` | [app/system/production/GanttChart.tsx](<../../../app/system/production/GanttChart.tsx>) | 80–95 |
| `GanttLegend` | [app/system/production/GanttChart.tsx](<../../../app/system/production/GanttChart.tsx>) | 97–110 |
| `drawLinks` | [app/system/production/GanttChart.tsx](<../../../app/system/production/GanttChart.tsx>) | 113–134 |
| `sideStorageKey` | [app/system/production/GanttChart.tsx](<../../../app/system/production/GanttChart.tsx>) | 141–141 |
| `readSide` | [app/system/production/GanttChart.tsx](<../../../app/system/production/GanttChart.tsx>) | 142–147 |
| `saveSide` | [app/system/production/GanttChart.tsx](<../../../app/system/production/GanttChart.tsx>) | 148–153 |
| `GanttChart` | [app/system/production/GanttChart.tsx](<../../../app/system/production/GanttChart.tsx>) | 155–329 |
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
- [backend-node/src/resource-task-service.ts](<../../../backend-node/src/resource-task-service.ts>)
- [backend-node/src/resource-workload.ts](<../../../backend-node/src/resource-workload.ts>)
- [backend-node/src/site-visit-common.ts](<../../../backend-node/src/site-visit-common.ts>)
- [backend-node/src/team-calendar.ts](<../../../backend-node/src/team-calendar.ts>)
- [backend-node/src/outlook-calendar.ts](<../../../backend-node/src/outlook-calendar.ts>)
- [backend-node/src/resource-task-math.ts](<../../../backend-node/src/resource-task-math.ts>)
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
- [app/system/production/PlanPicLoad.tsx](<../../../app/system/production/PlanPicLoad.tsx>)
- [app/system/production/ProjectPlanFields.tsx](<../../../app/system/production/ProjectPlanFields.tsx>)
- [app/system/production/my-work.css](<../../../app/system/production/my-work.css>)
- [app/system/api-client.ts](<../../../app/system/api-client.ts>)
- [app/system/ui.tsx](<../../../app/system/ui.tsx>)
- [lib/cost-item-lookup.ts](<../../../lib/cost-item-lookup.ts>)
- [lib/estimate-assignment-queue.ts](<../../../lib/estimate-assignment-queue.ts>)
- [lib/my-work.ts](<../../../lib/my-work.ts>)
- [app/system/production/CrmScreens.tsx](<../../../app/system/production/CrmScreens.tsx>)
- [app/system/production/WorkQueue.tsx](<../../../app/system/production/WorkQueue.tsx>)
- [app/system/production/WorkloadGantt.tsx](<../../../app/system/production/WorkloadGantt.tsx>)
- [app/system/production/TeamBoard.tsx](<../../../app/system/production/TeamBoard.tsx>)
- [app/system/resource-workload-client.ts](<../../../app/system/resource-workload-client.ts>)
- [lib/resource-planning.ts](<../../../lib/resource-planning.ts>)
- [app/system/production/workload.css](<../../../app/system/production/workload.css>)
- [app/system/production/SearchSelect.tsx](<../../../app/system/production/SearchSelect.tsx>)
- [app/system/production/TeamBoardGantt.tsx](<../../../app/system/production/TeamBoardGantt.tsx>)
- [lib/team-board.ts](<../../../lib/team-board.ts>)
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
