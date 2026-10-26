# Schedule / Resource / My Work

[Context index](../../../AGENTS.md) · [Architecture](../ARCHITECTURE.md) · [Change guide](../WORKFLOW.md)

แผนงาน timeline กำลังคน lifecycle งานและคำขอปรับวัน

Evidence: snapshot `156ad7f5`; source map, not a live availability claim. Test candidates use filename matching and are not exhaustive coverage.

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
| `toError` | [app/system/production/PlanningPricingScreens.tsx](<../../../app/system/production/PlanningPricingScreens.tsx>) | 341–341 |
| `isConcurrencyConflict` | [app/system/production/PlanningPricingScreens.tsx](<../../../app/system/production/PlanningPricingScreens.tsx>) | 342–344 |
| `money` | [app/system/production/PlanningPricingScreens.tsx](<../../../app/system/production/PlanningPricingScreens.tsx>) | 345–349 |
| `number` | [app/system/production/PlanningPricingScreens.tsx](<../../../app/system/production/PlanningPricingScreens.tsx>) | 350–350 |
| `date` | [app/system/production/PlanningPricingScreens.tsx](<../../../app/system/production/PlanningPricingScreens.tsx>) | 351–353 |
| `dateTime` | [app/system/production/PlanningPricingScreens.tsx](<../../../app/system/production/PlanningPricingScreens.tsx>) | 354–357 |
| `isoToday` | [app/system/production/PlanningPricingScreens.tsx](<../../../app/system/production/PlanningPricingScreens.tsx>) | 359–359 |
| `ageInDays` | [app/system/production/PlanningPricingScreens.tsx](<../../../app/system/production/PlanningPricingScreens.tsx>) | 360–366 |
| `hostOf` | [app/system/production/PlanningPricingScreens.tsx](<../../../app/system/production/PlanningPricingScreens.tsx>) | 368–368 |
| `flattenTasks` | [app/system/production/PlanningPricingScreens.tsx](<../../../app/system/production/PlanningPricingScreens.tsx>) | 369–369 |
| `ResourcePlanLock` | [app/system/production/PlanningPricingScreens.tsx](<../../../app/system/production/PlanningPricingScreens.tsx>) | 372–374 |
| `LoadError` | [app/system/production/PlanningPricingScreens.tsx](<../../../app/system/production/PlanningPricingScreens.tsx>) | 376–382 |
| `PermissionNotice` | [app/system/production/PlanningPricingScreens.tsx](<../../../app/system/production/PlanningPricingScreens.tsx>) | 384–389 |
| `loadAllEstimates` | [app/system/production/PlanningPricingScreens.tsx](<../../../app/system/production/PlanningPricingScreens.tsx>) | 391–400 |
| `loadAllProjects` | [app/system/production/PlanningPricingScreens.tsx](<../../../app/system/production/PlanningPricingScreens.tsx>) | 402–411 |
| `loadAllSupplierPriceHistory` | [app/system/production/PlanningPricingScreens.tsx](<../../../app/system/production/PlanningPricingScreens.tsx>) | 413–422 |
| `mapSettledLimited` | [app/system/production/PlanningPricingScreens.tsx](<../../../app/system/production/PlanningPricingScreens.tsx>) | 424–440 |
| `loadPriceRecords` | [app/system/production/PlanningPricingScreens.tsx](<../../../app/system/production/PlanningPricingScreens.tsx>) | 442–547 |
| `loadSchedules` | [app/system/production/PlanningPricingScreens.tsx](<../../../app/system/production/PlanningPricingScreens.tsx>) | 549–558 |
| `usePrices` | [app/system/production/PlanningPricingScreens.tsx](<../../../app/system/production/PlanningPricingScreens.tsx>) | 560–577 |
| `progressProblem` | [app/system/production/PlanningPricingScreens.tsx](<../../../app/system/production/PlanningPricingScreens.tsx>) | 580–591 |
| `ProgressModal` | [app/system/production/PlanningPricingScreens.tsx](<../../../app/system/production/PlanningPricingScreens.tsx>) | 593–693 |
| `workEffectiveFinish` | [app/system/production/PlanningPricingScreens.tsx](<../../../app/system/production/PlanningPricingScreens.tsx>) | 696–696 |
| `workIsLate` | [app/system/production/PlanningPricingScreens.tsx](<../../../app/system/production/PlanningPricingScreens.tsx>) | 698–698 |
| `workNeedsForecast` | [app/system/production/PlanningPricingScreens.tsx](<../../../app/system/production/PlanningPricingScreens.tsx>) | 699–699 |
| `workIsStale` | [app/system/production/PlanningPricingScreens.tsx](<../../../app/system/production/PlanningPricingScreens.tsx>) | 700–700 |
| `workLastReport` | [app/system/production/PlanningPricingScreens.tsx](<../../../app/system/production/PlanningPricingScreens.tsx>) | 702–702 |
| `workNeedsUpdate` | [app/system/production/PlanningPricingScreens.tsx](<../../../app/system/production/PlanningPricingScreens.tsx>) | 703–703 |
| `workUserNote` | [app/system/production/PlanningPricingScreens.tsx](<../../../app/system/production/PlanningPricingScreens.tsx>) | 704–704 |
| `historyReason` | [app/system/production/PlanningPricingScreens.tsx](<../../../app/system/production/PlanningPricingScreens.tsx>) | 706–706 |
| `historyValue` | [app/system/production/PlanningPricingScreens.tsx](<../../../app/system/production/PlanningPricingScreens.tsx>) | 709–709 |
| `historyShown` | [app/system/production/PlanningPricingScreens.tsx](<../../../app/system/production/PlanningPricingScreens.tsx>) | 711–711 |
| `daysFromToday` | [app/system/production/PlanningPricingScreens.tsx](<../../../app/system/production/PlanningPricingScreens.tsx>) | 712–714 |
| `myWorkInitials` | [app/system/production/PlanningPricingScreens.tsx](<../../../app/system/production/PlanningPricingScreens.tsx>) | 715–715 |
| `quietDays` | [app/system/production/PlanningPricingScreens.tsx](<../../../app/system/production/PlanningPricingScreens.tsx>) | 716–719 |
| `myWorkAuditFieldLabel` | [app/system/production/PlanningPricingScreens.tsx](<../../../app/system/production/PlanningPricingScreens.tsx>) | 738–738 |
| `matchesWorkFilter` | [app/system/production/PlanningPricingScreens.tsx](<../../../app/system/production/PlanningPricingScreens.tsx>) | 809–820 |
| `groupScheduleWork` | [app/system/production/PlanningPricingScreens.tsx](<../../../app/system/production/PlanningPricingScreens.tsx>) | 822–869 |
| `groupEstimateWork` | [app/system/production/PlanningPricingScreens.tsx](<../../../app/system/production/PlanningPricingScreens.tsx>) | 871–909 |
| `estimateGroupMatchesFilter` | [app/system/production/PlanningPricingScreens.tsx](<../../../app/system/production/PlanningPricingScreens.tsx>) | 911–918 |
| `MyEstimateAssignmentsPanel` | [app/system/production/PlanningPricingScreens.tsx](<../../../app/system/production/PlanningPricingScreens.tsx>) | 931–966 |
| `EstimateWorkGroupCard` | [app/system/production/PlanningPricingScreens.tsx](<../../../app/system/production/PlanningPricingScreens.tsx>) | 968–1006 |
| `EstimateNextActionDetail` | [app/system/production/PlanningPricingScreens.tsx](<../../../app/system/production/PlanningPricingScreens.tsx>) | 1008–1015 |
| `useMyEstimateAssignments` | [app/system/production/PlanningPricingScreens.tsx](<../../../app/system/production/PlanningPricingScreens.tsx>) | 1018–1034 |
| `ProductionMyWork` | [app/system/production/PlanningPricingScreens.tsx](<../../../app/system/production/PlanningPricingScreens.tsx>) | 1036–1495 |
| `MyWorkStat` | [app/system/production/PlanningPricingScreens.tsx](<../../../app/system/production/PlanningPricingScreens.tsx>) | 1497–1501 |
| `QuickProgressControls` | [app/system/production/PlanningPricingScreens.tsx](<../../../app/system/production/PlanningPricingScreens.tsx>) | 1524–1606 |
| `workNeedsForecastFor` | [app/system/production/PlanningPricingScreens.tsx](<../../../app/system/production/PlanningPricingScreens.tsx>) | 1608–1608 |
| `myWorkProgressTarget` | [app/system/production/PlanningPricingScreens.tsx](<../../../app/system/production/PlanningPricingScreens.tsx>) | 1610–1614 |
| `ProductionWorkControls` | [app/system/production/PlanningPricingScreens.tsx](<../../../app/system/production/PlanningPricingScreens.tsx>) | 1616–1627 |
| `ProductionScheduleWorkGroup` | [app/system/production/PlanningPricingScreens.tsx](<../../../app/system/production/PlanningPricingScreens.tsx>) | 1629–1691 |
| `ProductionMyTaskRow` | [app/system/production/PlanningPricingScreens.tsx](<../../../app/system/production/PlanningPricingScreens.tsx>) | 1693–1761 |
| `ProductionRequestDaysModal` | [app/system/production/PlanningPricingScreens.tsx](<../../../app/system/production/PlanningPricingScreens.tsx>) | 1763–1789 |
| `ProductionPersonalTaskModal` | [app/system/production/PlanningPricingScreens.tsx](<../../../app/system/production/PlanningPricingScreens.tsx>) | 1791–1840 |
| `usePicOptions` | [app/system/production/PlanningPricingScreens.tsx](<../../../app/system/production/PlanningPricingScreens.tsx>) | 1843–1845 |
| `ensureScheduleMembers` | [app/system/production/PlanningPricingScreens.tsx](<../../../app/system/production/PlanningPricingScreens.tsx>) | 1846–1850 |
| `PicPicker` | [app/system/production/PlanningPricingScreens.tsx](<../../../app/system/production/PlanningPricingScreens.tsx>) | 1851–1857 |
| `CreateScheduleTaskModal` | [app/system/production/PlanningPricingScreens.tsx](<../../../app/system/production/PlanningPricingScreens.tsx>) | 1859–1960 |
| `EditScheduleTaskModal` | [app/system/production/PlanningPricingScreens.tsx](<../../../app/system/production/PlanningPricingScreens.tsx>) | 1967–2033 |
| `BaselineModal` | [app/system/production/PlanningPricingScreens.tsx](<../../../app/system/production/PlanningPricingScreens.tsx>) | 2035–2078 |
| `ScheduleDayRequestAnswerModal` | [app/system/production/PlanningPricingScreens.tsx](<../../../app/system/production/PlanningPricingScreens.tsx>) | 2080–2127 |
| `planProjectStorageKey` | [app/system/production/PlanningPricingScreens.tsx](<../../../app/system/production/PlanningPricingScreens.tsx>) | 2136–2136 |
| `byProjectNumber` | [app/system/production/PlanningPricingScreens.tsx](<../../../app/system/production/PlanningPricingScreens.tsx>) | 2138–2138 |
| `isLeafTask` | [app/system/production/PlanningPricingScreens.tsx](<../../../app/system/production/PlanningPricingScreens.tsx>) | 2139–2139 |
| `taskOrDescendantMatches` | [app/system/production/PlanningPricingScreens.tsx](<../../../app/system/production/PlanningPricingScreens.tsx>) | 2140–2141 |
| `planRows` | [app/system/production/PlanningPricingScreens.tsx](<../../../app/system/production/PlanningPricingScreens.tsx>) | 2144–2155 |
| `ProductionProjectSchedule` | [app/system/production/PlanningPricingScreens.tsx](<../../../app/system/production/PlanningPricingScreens.tsx>) | 2162–2410 |
| `PlanTaskDrawer` | [app/system/production/PlanningPricingScreens.tsx](<../../../app/system/production/PlanningPricingScreens.tsx>) | 2413–2479 |
| `PriceAgeBadge` | [app/system/production/PlanningPricingScreens.tsx](<../../../app/system/production/PlanningPricingScreens.tsx>) | 2481–2486 |
| `PriceLoadWarning` | [app/system/production/PlanningPricingScreens.tsx](<../../../app/system/production/PlanningPricingScreens.tsx>) | 2488–2490 |
| `ProductionPriceLibrary` | [app/system/production/PlanningPricingScreens.tsx](<../../../app/system/production/PlanningPricingScreens.tsx>) | 2492–2589 |
| `supplierQuotationCurrency` | [app/system/production/PlanningPricingScreens.tsx](<../../../app/system/production/PlanningPricingScreens.tsx>) | 2591–2592 |
| `addIsoDays` | [app/system/production/PlanningPricingScreens.tsx](<../../../app/system/production/PlanningPricingScreens.tsx>) | 2594–2598 |
| `quotationFileKind` | [app/system/production/PlanningPricingScreens.tsx](<../../../app/system/production/PlanningPricingScreens.tsx>) | 2600–2606 |
| `blankQuotationLine` | [app/system/production/PlanningPricingScreens.tsx](<../../../app/system/production/PlanningPricingScreens.tsx>) | 2608–2611 |
| `quotationLinesTotal` | [app/system/production/PlanningPricingScreens.tsx](<../../../app/system/production/PlanningPricingScreens.tsx>) | 2613–2614 |
| `catalogueKeyOf` | [app/system/production/PlanningPricingScreens.tsx](<../../../app/system/production/PlanningPricingScreens.tsx>) | 2630–2635 |
| `useCatalogueMatches` | [app/system/production/PlanningPricingScreens.tsx](<../../../app/system/production/PlanningPricingScreens.tsx>) | 2637–2672 |
| `priceChange` | [app/system/production/PlanningPricingScreens.tsx](<../../../app/system/production/PlanningPricingScreens.tsx>) | 2675–2678 |
| `CatalogueComparison` | [app/system/production/PlanningPricingScreens.tsx](<../../../app/system/production/PlanningPricingScreens.tsx>) | 2692–2761 |
| `QuotationLinesEditor` | [app/system/production/PlanningPricingScreens.tsx](<../../../app/system/production/PlanningPricingScreens.tsx>) | 2769–2852 |
| `SupplierQuotationUploadModal` | [app/system/production/PlanningPricingScreens.tsx](<../../../app/system/production/PlanningPricingScreens.tsx>) | 2854–3263 |
| `EditQuotationModal` | [app/system/production/PlanningPricingScreens.tsx](<../../../app/system/production/PlanningPricingScreens.tsx>) | 3265–3409 |
| `ReferencePriceModal` | [app/system/production/PlanningPricingScreens.tsx](<../../../app/system/production/PlanningPricingScreens.tsx>) | 3418–3530 |
| `ProductionSupplierQuotations` | [app/system/production/PlanningPricingScreens.tsx](<../../../app/system/production/PlanningPricingScreens.tsx>) | 3532–3733 |
| `ProductionWaitingSupplierPrice` | [app/system/production/PlanningPricingScreens.tsx](<../../../app/system/production/PlanningPricingScreens.tsx>) | 3735–3757 |
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
| `teamsKey` | [app/system/production/TeamBoard.tsx](<../../../app/system/production/TeamBoard.tsx>) | 49–49 |
| `readTeams` | [app/system/production/TeamBoard.tsx](<../../../app/system/production/TeamBoard.tsx>) | 50–57 |
| `rowTypeLabel` | [app/system/production/TeamBoard.tsx](<../../../app/system/production/TeamBoard.tsx>) | 68–68 |
| `rowTitle` | [app/system/production/TeamBoard.tsx](<../../../app/system/production/TeamBoard.tsx>) | 69–71 |
| `rowCustomer` | [app/system/production/TeamBoard.tsx](<../../../app/system/production/TeamBoard.tsx>) | 72–72 |
| `rowTime` | [app/system/production/TeamBoard.tsx](<../../../app/system/production/TeamBoard.tsx>) | 73–73 |
| `rowStatus` | [app/system/production/TeamBoard.tsx](<../../../app/system/production/TeamBoard.tsx>) | 74–75 |
| `rowTone` | [app/system/production/TeamBoard.tsx](<../../../app/system/production/TeamBoard.tsx>) | 76–76 |
| `viewKey` | [app/system/production/TeamBoard.tsx](<../../../app/system/production/TeamBoard.tsx>) | 78–78 |
| `readView` | [app/system/production/TeamBoard.tsx](<../../../app/system/production/TeamBoard.tsx>) | 79–81 |
| `categoryOf` | [app/system/production/TeamBoard.tsx](<../../../app/system/production/TeamBoard.tsx>) | 86–87 |
| `itemCategory` | [app/system/production/TeamBoard.tsx](<../../../app/system/production/TeamBoard.tsx>) | 89–89 |
| `mondayOf` | [app/system/production/TeamBoard.tsx](<../../../app/system/production/TeamBoard.tsx>) | 90–90 |
| `initials` | [app/system/production/TeamBoard.tsx](<../../../app/system/production/TeamBoard.tsx>) | 91–91 |
| `fmt` | [app/system/production/TeamBoard.tsx](<../../../app/system/production/TeamBoard.tsx>) | 92–92 |
| `pct` | [app/system/production/TeamBoard.tsx](<../../../app/system/production/TeamBoard.tsx>) | 93–93 |
| `fill` | [app/system/production/TeamBoard.tsx](<../../../app/system/production/TeamBoard.tsx>) | 94–95 |
| `errorText` | [app/system/production/TeamBoard.tsx](<../../../app/system/production/TeamBoard.tsx>) | 96–96 |
| `peopleOf` | [app/system/production/TeamBoard.tsx](<../../../app/system/production/TeamBoard.tsx>) | 99–100 |
| `draftOf` | [app/system/production/TeamBoard.tsx](<../../../app/system/production/TeamBoard.tsx>) | 107–114 |
| `inputOf` | [app/system/production/TeamBoard.tsx](<../../../app/system/production/TeamBoard.tsx>) | 115–124 |
| `taskWork` | [app/system/production/TeamBoard.tsx](<../../../app/system/production/TeamBoard.tsx>) | 126–131 |
| `TeamBoard` | [app/system/production/TeamBoard.tsx](<../../../app/system/production/TeamBoard.tsx>) | 133–597 |
| `TeamFilter` | [app/system/production/TeamBoard.tsx](<../../../app/system/production/TeamBoard.tsx>) | 600–633 |
| `GroupRows` | [app/system/production/TeamBoard.tsx](<../../../app/system/production/TeamBoard.tsx>) | 635–640 |
| `useSearchCopy` | [app/system/production/TeamBoard.tsx](<../../../app/system/production/TeamBoard.tsx>) | 642–645 |
| `peopleOptions` | [app/system/production/TeamBoard.tsx](<../../../app/system/production/TeamBoard.tsx>) | 646–647 |
| `customerOptions` | [app/system/production/TeamBoard.tsx](<../../../app/system/production/TeamBoard.tsx>) | 648–649 |
| `TaskFields` | [app/system/production/TeamBoard.tsx](<../../../app/system/production/TeamBoard.tsx>) | 657–807 |
| `draftProblem` | [app/system/production/TeamBoard.tsx](<../../../app/system/production/TeamBoard.tsx>) | 809–816 |
| `draftReady` | [app/system/production/TeamBoard.tsx](<../../../app/system/production/TeamBoard.tsx>) | 817–817 |
| `AddTaskModal` | [app/system/production/TeamBoard.tsx](<../../../app/system/production/TeamBoard.tsx>) | 819–847 |
| `TaskDrawer` | [app/system/production/TeamBoard.tsx](<../../../app/system/production/TeamBoard.tsx>) | 849–967 |
| `WorkList` | [app/system/production/TeamBoard.tsx](<../../../app/system/production/TeamBoard.tsx>) | 970–1097 |
| `InlineText` | [app/system/production/TeamBoard.tsx](<../../../app/system/production/TeamBoard.tsx>) | 1100–1108 |
| `InlineNumber` | [app/system/production/TeamBoard.tsx](<../../../app/system/production/TeamBoard.tsx>) | 1110–1117 |
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
| `placeSegments` | [app/system/production/GanttChart.tsx](<../../../app/system/production/GanttChart.tsx>) | 47–54 |
| `scheduleTone` | [app/system/production/GanttChart.tsx](<../../../app/system/production/GanttChart.tsx>) | 61–68 |
| `GanttToolbar` | [app/system/production/GanttChart.tsx](<../../../app/system/production/GanttChart.tsx>) | 74–89 |
| `GanttLegend` | [app/system/production/GanttChart.tsx](<../../../app/system/production/GanttChart.tsx>) | 91–102 |
| `sideStorageKey` | [app/system/production/GanttChart.tsx](<../../../app/system/production/GanttChart.tsx>) | 109–109 |
| `readSide` | [app/system/production/GanttChart.tsx](<../../../app/system/production/GanttChart.tsx>) | 110–115 |
| `saveSide` | [app/system/production/GanttChart.tsx](<../../../app/system/production/GanttChart.tsx>) | 116–121 |
| `GanttChart` | [app/system/production/GanttChart.tsx](<../../../app/system/production/GanttChart.tsx>) | 123–233 |
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
