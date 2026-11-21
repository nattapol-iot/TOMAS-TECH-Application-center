# Labor Package / Rate Master

[Context index](../../../AGENTS.md) · [Architecture](../ARCHITECTURE.md) · [Change guide](../WORKFLOW.md)

เซฟและใช้ชุดค่าแรง version rate และนำกลับมาใช้

Evidence: snapshot `878a3653`; source map, not a live availability claim. Test candidates use filename matching and are not exhaustive coverage.

## Read only the operation you change

- [labor-packages API and function map](../api/labor-packages.md) — registered in Node app
- [labor-rates API and function map](../api/labor-rates.md) — registered in Node app

## UI function locator

Shared screens contain other modules: use the symbol and line range instead of reading the whole file.

| Symbol | Source | Lines |
|---|---|---|
| `messageOf` | [app/system/production/LaborPackageMaster.tsx](<../../../app/system/production/LaborPackageMaster.tsx>) | 18–18 |
| `unavailableMessage` | [app/system/production/LaborPackageMaster.tsx](<../../../app/system/production/LaborPackageMaster.tsx>) | 19–19 |
| `statusTone` | [app/system/production/LaborPackageMaster.tsx](<../../../app/system/production/LaborPackageMaster.tsx>) | 20–20 |
| `LaborPackageMaster` | [app/system/production/LaborPackageMaster.tsx](<../../../app/system/production/LaborPackageMaster.tsx>) | 22–263 |
| `money` | [app/system/production/LaborPackagePicker.tsx](<../../../app/system/production/LaborPackagePicker.tsx>) | 42–42 |
| `number` | [app/system/production/LaborPackagePicker.tsx](<../../../app/system/production/LaborPackagePicker.tsx>) | 43–43 |
| `errorText` | [app/system/production/LaborPackagePicker.tsx](<../../../app/system/production/LaborPackagePicker.tsx>) | 44–44 |
| `unavailableReason` | [app/system/production/LaborPackagePicker.tsx](<../../../app/system/production/LaborPackagePicker.tsx>) | 50–51 |
| `linePreviewShape` | [app/system/production/LaborPackagePicker.tsx](<../../../app/system/production/LaborPackagePicker.tsx>) | 55–63 |
| `ApplyLaborPackageModal` | [app/system/production/LaborPackagePicker.tsx](<../../../app/system/production/LaborPackagePicker.tsx>) | 74–374 |
| `SaveLaborPackageModal` | [app/system/production/LaborPackagePicker.tsx](<../../../app/system/production/LaborPackagePicker.tsx>) | 382–459 |
| `EMPTY_PAGE` | [app/system/production/AdminAnalyticsScreens.tsx](<../../../app/system/production/AdminAnalyticsScreens.tsx>) | 188–188 |
| `toError` | [app/system/production/AdminAnalyticsScreens.tsx](<../../../app/system/production/AdminAnalyticsScreens.tsx>) | 189–189 |
| `formatMoney` | [app/system/production/AdminAnalyticsScreens.tsx](<../../../app/system/production/AdminAnalyticsScreens.tsx>) | 190–190 |
| `formatNumber` | [app/system/production/AdminAnalyticsScreens.tsx](<../../../app/system/production/AdminAnalyticsScreens.tsx>) | 191–191 |
| `formatPercent` | [app/system/production/AdminAnalyticsScreens.tsx](<../../../app/system/production/AdminAnalyticsScreens.tsx>) | 192–192 |
| `formatDate` | [app/system/production/AdminAnalyticsScreens.tsx](<../../../app/system/production/AdminAnalyticsScreens.tsx>) | 193–195 |
| `formatDateTime` | [app/system/production/AdminAnalyticsScreens.tsx](<../../../app/system/production/AdminAnalyticsScreens.tsx>) | 196–198 |
| `businessDate` | [app/system/production/AdminAnalyticsScreens.tsx](<../../../app/system/production/AdminAnalyticsScreens.tsx>) | 199–203 |
| `today` | [app/system/production/AdminAnalyticsScreens.tsx](<../../../app/system/production/AdminAnalyticsScreens.tsx>) | 204–204 |
| `yearAgo` | [app/system/production/AdminAnalyticsScreens.tsx](<../../../app/system/production/AdminAnalyticsScreens.tsx>) | 205–205 |
| `query` | [app/system/production/AdminAnalyticsScreens.tsx](<../../../app/system/production/AdminAnalyticsScreens.tsx>) | 206–213 |
| `LoadError` | [app/system/production/AdminAnalyticsScreens.tsx](<../../../app/system/production/AdminAnalyticsScreens.tsx>) | 215–223 |
| `PermissionNotice` | [app/system/production/AdminAnalyticsScreens.tsx](<../../../app/system/production/AdminAnalyticsScreens.tsx>) | 225–231 |
| `ProductionCustomers` | [app/system/production/AdminAnalyticsScreens.tsx](<../../../app/system/production/AdminAnalyticsScreens.tsx>) | 233–308 |
| `CustomerContactsModal` | [app/system/production/AdminAnalyticsScreens.tsx](<../../../app/system/production/AdminAnalyticsScreens.tsx>) | 324–488 |
| `LocalizedNameStack` | [app/system/production/AdminAnalyticsScreens.tsx](<../../../app/system/production/AdminAnalyticsScreens.tsx>) | 489–493 |
| `CustomerModal` | [app/system/production/AdminAnalyticsScreens.tsx](<../../../app/system/production/AdminAnalyticsScreens.tsx>) | 495–612 |
| `ProductionReports` | [app/system/production/AdminAnalyticsScreens.tsx](<../../../app/system/production/AdminAnalyticsScreens.tsx>) | 616–713 |
| `InventoryReportView` | [app/system/production/AdminAnalyticsScreens.tsx](<../../../app/system/production/AdminAnalyticsScreens.tsx>) | 715–730 |
| `SupplierReportView` | [app/system/production/AdminAnalyticsScreens.tsx](<../../../app/system/production/AdminAnalyticsScreens.tsx>) | 732–739 |
| `PrCycleReportView` | [app/system/production/AdminAnalyticsScreens.tsx](<../../../app/system/production/AdminAnalyticsScreens.tsx>) | 741–755 |
| `ProjectCostReportView` | [app/system/production/AdminAnalyticsScreens.tsx](<../../../app/system/production/AdminAnalyticsScreens.tsx>) | 768–794 |
| `ProductionEngineeringRates` | [app/system/production/AdminAnalyticsScreens.tsx](<../../../app/system/production/AdminAnalyticsScreens.tsx>) | 796–833 |
| `CreateRateModal` | [app/system/production/AdminAnalyticsScreens.tsx](<../../../app/system/production/AdminAnalyticsScreens.tsx>) | 835–872 |
| `ProductionAuditLog` | [app/system/production/AdminAnalyticsScreens.tsx](<../../../app/system/production/AdminAnalyticsScreens.tsx>) | 874–909 |
| `StorageCheckPanel` | [app/system/production/AdminAnalyticsScreens.tsx](<../../../app/system/production/AdminAnalyticsScreens.tsx>) | 913–997 |
| `ProductionSettings` | [app/system/production/AdminAnalyticsScreens.tsx](<../../../app/system/production/AdminAnalyticsScreens.tsx>) | 999–1024 |

## Domain helpers / direct dependencies

- [backend-node/src/estimate-disciplines.ts](<../../../backend-node/src/estimate-disciplines.ts>)
- [backend-node/src/estimate-total-guard.ts](<../../../backend-node/src/estimate-total-guard.ts>)
- [backend-node/src/labor-master.ts](<../../../backend-node/src/labor-master.ts>)
- [backend-node/src/standard-labor-cost-masters.ts](<../../../backend-node/src/standard-labor-cost-masters.ts>)
- [backend-node/src/routes/estimate-workspace-write.ts](<../../../backend-node/src/routes/estimate-workspace-write.ts>)
- [backend-node/src/engineering-rate-access.ts](<../../../backend-node/src/engineering-rate-access.ts>)
- [backend-node/src/user-roles.ts](<../../../backend-node/src/user-roles.ts>)
- [app/system/dialogs.ts](<../../../app/system/dialogs.ts>)
- [app/system/api-client.ts](<../../../app/system/api-client.ts>)
- [app/system/ui.tsx](<../../../app/system/ui.tsx>)
- [lib/labor-package-master.ts](<../../../lib/labor-package-master.ts>)
- [app/system/i18n.ts](<../../../app/system/i18n.ts>)
- [app/system/production/labor-package-copy.ts](<../../../app/system/production/labor-package-copy.ts>)
- [app/system/production/labor-package-master.css](<../../../app/system/production/labor-package-master.css>)
- [app/system/LocalizedText.tsx](<../../../app/system/LocalizedText.tsx>)
- [lib/estimate-ux.ts](<../../../lib/estimate-ux.ts>)
- [lib/estimate-disciplines.ts](<../../../lib/estimate-disciplines.ts>)
- [lib/labor-master.ts](<../../../lib/labor-master.ts>)
- [lib/business-card.ts](<../../../lib/business-card.ts>)
- [app/system/production/BusinessCardScanner.tsx](<../../../app/system/production/BusinessCardScanner.tsx>)
- [app/system/production/ErpMasterPanel.tsx](<../../../app/system/production/ErpMasterPanel.tsx>)
- [app/system/project-overview-client.ts](<../../../app/system/project-overview-client.ts>)
- [app/system/production/customer-localized-names.ts](<../../../app/system/production/customer-localized-names.ts>)
- [app/system/DateInput.tsx](<../../../app/system/DateInput.tsx>)
- [app/system/production/PegasusScreen.tsx](<../../../app/system/production/PegasusScreen.tsx>)
- [app/system/tmt-id.constants.ts](<../../../app/system/tmt-id.constants.ts>)

## Candidate regression tests

- [tests/engineering-rate-create.test.mjs](<../../../tests/engineering-rate-create.test.mjs>)
- [tests/engineering-rate-visibility.test.mjs](<../../../tests/engineering-rate-visibility.test.mjs>)
- [tests/estimate-labor-category.test.mjs](<../../../tests/estimate-labor-category.test.mjs>)
- [tests/estimate-labor-discipline.test.mjs](<../../../tests/estimate-labor-discipline.test.mjs>)
- [tests/labor-master-ui.test.mjs](<../../../tests/labor-master-ui.test.mjs>)
- [tests/labor-package-master-ui.test.mjs](<../../../tests/labor-package-master-ui.test.mjs>)
- [tests/labor-package-master.test.mjs](<../../../tests/labor-package-master.test.mjs>)
- [backend-node/tests/engineering-rate-access.test.ts](<../../../backend-node/tests/engineering-rate-access.test.ts>)
- [backend-node/tests/labor-master-routes.test.ts](<../../../backend-node/tests/labor-master-routes.test.ts>)
- [backend-node/tests/labor-master.test.ts](<../../../backend-node/tests/labor-master.test.ts>)
- [backend-node/tests/standard-labor-cost-masters.test.ts](<../../../backend-node/tests/standard-labor-cost-masters.test.ts>)

## Client contract lookup

Search the selected API path or function in [app/system/api-client.ts](<../../../app/system/api-client.ts>); follow its screen callers. Common UI/language changes require [app/system/ui.tsx](<../../../app/system/ui.tsx>) and [app/system/i18n.ts](<../../../app/system/i18n.ts>). For SQL changes use [schema map](../SCHEMA.md).
