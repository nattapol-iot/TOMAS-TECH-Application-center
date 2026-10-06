# BOM / PR / PO / Approvals

[Context index](../../../AGENTS.md) · [Architecture](../ARCHITECTURE.md) · [Change guide](../WORKFLOW.md)

จัดซื้อ อนุมัติ และประวัติ PR

Evidence: snapshot `6d2356d2`; source map, not a live availability claim. Test candidates use filename matching and are not exhaustive coverage.

## Read only the operation you change

- [boms API and function map](../api/boms.md) — registered in Node app
- [purchase-requisitions API and function map](../api/purchase-requisitions.md) — registered in Node app
- [historical-pr API and function map](../api/historical-pr.md) — registered in Node app

## UI function locator

Shared screens contain other modules: use the symbol and line range instead of reading the whole file.

| Symbol | Source | Lines |
|---|---|---|
| `toError` | [app/system/production/MaterialScreens.tsx](<../../../app/system/production/MaterialScreens.tsx>) | 429–429 |
| `body` | [app/system/production/MaterialScreens.tsx](<../../../app/system/production/MaterialScreens.tsx>) | 430–430 |
| `money` | [app/system/production/MaterialScreens.tsx](<../../../app/system/production/MaterialScreens.tsx>) | 431–431 |
| `quantity` | [app/system/production/MaterialScreens.tsx](<../../../app/system/production/MaterialScreens.tsx>) | 432–432 |
| `date` | [app/system/production/MaterialScreens.tsx](<../../../app/system/production/MaterialScreens.tsx>) | 433–433 |
| `dateTime` | [app/system/production/MaterialScreens.tsx](<../../../app/system/production/MaterialScreens.tsx>) | 434–434 |
| `isoDate` | [app/system/production/MaterialScreens.tsx](<../../../app/system/production/MaterialScreens.tsx>) | 436–436 |
| `contains` | [app/system/production/MaterialScreens.tsx](<../../../app/system/production/MaterialScreens.tsx>) | 437–437 |
| `hasPermission` | [app/system/production/MaterialScreens.tsx](<../../../app/system/production/MaterialScreens.tsx>) | 438–438 |
| `isOpenPurchaseOrder` | [app/system/production/MaterialScreens.tsx](<../../../app/system/production/MaterialScreens.tsx>) | 439–441 |
| `useEndpoint` | [app/system/production/MaterialScreens.tsx](<../../../app/system/production/MaterialScreens.tsx>) | 443–486 |
| `LoadError` | [app/system/production/MaterialScreens.tsx](<../../../app/system/production/MaterialScreens.tsx>) | 488–496 |
| `ActionError` | [app/system/production/MaterialScreens.tsx](<../../../app/system/production/MaterialScreens.tsx>) | 498–500 |
| `Loading` | [app/system/production/MaterialScreens.tsx](<../../../app/system/production/MaterialScreens.tsx>) | 502–504 |
| `RefreshButton` | [app/system/production/MaterialScreens.tsx](<../../../app/system/production/MaterialScreens.tsx>) | 506–508 |
| `CommentPrompt` | [app/system/production/MaterialScreens.tsx](<../../../app/system/production/MaterialScreens.tsx>) | 510–536 |
| `ProductionProcurementDashboard` | [app/system/production/MaterialScreens.tsx](<../../../app/system/production/MaterialScreens.tsx>) | 538–581 |
| `ProductionBoms` | [app/system/production/MaterialScreens.tsx](<../../../app/system/production/MaterialScreens.tsx>) | 583–624 |
| `BomDetailModal` | [app/system/production/MaterialScreens.tsx](<../../../app/system/production/MaterialScreens.tsx>) | 626–637 |
| `ReserveStockModal` | [app/system/production/MaterialScreens.tsx](<../../../app/system/production/MaterialScreens.tsx>) | 639–656 |
| `GenerateBomModal` | [app/system/production/MaterialScreens.tsx](<../../../app/system/production/MaterialScreens.tsx>) | 658–682 |
| `ProductionPurchaseRequisitions` | [app/system/production/MaterialScreens.tsx](<../../../app/system/production/MaterialScreens.tsx>) | 686–747 |
| `PrDetailModal` | [app/system/production/MaterialScreens.tsx](<../../../app/system/production/MaterialScreens.tsx>) | 749–764 |
| `buildPrPlanningGroups` | [app/system/production/MaterialScreens.tsx](<../../../app/system/production/MaterialScreens.tsx>) | 793–826 |
| `CreatePrModal` | [app/system/production/MaterialScreens.tsx](<../../../app/system/production/MaterialScreens.tsx>) | 828–903 |
| `ConvertPrModal` | [app/system/production/MaterialScreens.tsx](<../../../app/system/production/MaterialScreens.tsx>) | 905–918 |
| `ProductionPurchaseOrders` | [app/system/production/MaterialScreens.tsx](<../../../app/system/production/MaterialScreens.tsx>) | 920–948 |
| `PoDetailModal` | [app/system/production/MaterialScreens.tsx](<../../../app/system/production/MaterialScreens.tsx>) | 950–959 |
| `CreateGrnModal` | [app/system/production/MaterialScreens.tsx](<../../../app/system/production/MaterialScreens.tsx>) | 975–1040 |
| `ProductionGoodsReceiving` | [app/system/production/MaterialScreens.tsx](<../../../app/system/production/MaterialScreens.tsx>) | 1042–1077 |
| `GrnDetailModal` | [app/system/production/MaterialScreens.tsx](<../../../app/system/production/MaterialScreens.tsx>) | 1079–1088 |
| `ProductionMaterialIssues` | [app/system/production/MaterialScreens.tsx](<../../../app/system/production/MaterialScreens.tsx>) | 1092–1138 |
| `CreateMirModal` | [app/system/production/MaterialScreens.tsx](<../../../app/system/production/MaterialScreens.tsx>) | 1142–1182 |
| `MirDetailModal` | [app/system/production/MaterialScreens.tsx](<../../../app/system/production/MaterialScreens.tsx>) | 1184–1197 |
| `ReturnMaterialModal` | [app/system/production/MaterialScreens.tsx](<../../../app/system/production/MaterialScreens.tsx>) | 1199–1215 |
| `ProductionApprovals` | [app/system/production/MaterialScreens.tsx](<../../../app/system/production/MaterialScreens.tsx>) | 1224–1267 |
| `ProductionInventoryOperations` | [app/system/production/MaterialScreens.tsx](<../../../app/system/production/MaterialScreens.tsx>) | 1269–1302 |
| `CreateAdjustmentModal` | [app/system/production/MaterialScreens.tsx](<../../../app/system/production/MaterialScreens.tsx>) | 1304–1327 |
| `ReleaseQuarantineModal` | [app/system/production/MaterialScreens.tsx](<../../../app/system/production/MaterialScreens.tsx>) | 1329–1350 |

## Domain helpers / direct dependencies

- [backend-node/src/document-number.ts](<../../../backend-node/src/document-number.ts>)
- [backend-node/src/material-audit.ts](<../../../backend-node/src/material-audit.ts>)
- [backend-node/src/project-scope.ts](<../../../backend-node/src/project-scope.ts>)
- [backend-node/src/user-roles.ts](<../../../backend-node/src/user-roles.ts>)
- [backend-node/src/procurement-rules.ts](<../../../backend-node/src/procurement-rules.ts>)
- [backend-node/src/historical-pr.ts](<../../../backend-node/src/historical-pr.ts>)
- [app/system/i18n.ts](<../../../app/system/i18n.ts>)
- [app/system/LocalizedText.tsx](<../../../app/system/LocalizedText.tsx>)
- [app/system/production/HistoricalPrPanel.tsx](<../../../app/system/production/HistoricalPrPanel.tsx>)
- [app/system/project-overview-client.ts](<../../../app/system/project-overview-client.ts>)
- [lib/estimate-ux.ts](<../../../lib/estimate-ux.ts>)
- [app/system/api-client.ts](<../../../app/system/api-client.ts>)
- [app/system/ui.tsx](<../../../app/system/ui.tsx>)

## Candidate regression tests

- [tests/historical-pr-reconciliation.test.mjs](<../../../tests/historical-pr-reconciliation.test.mjs>)
- [backend-node/tests/historical-pr.test.ts](<../../../backend-node/tests/historical-pr.test.ts>)
- [backend-node/tests/knowledge-sales-materials.test.ts](<../../../backend-node/tests/knowledge-sales-materials.test.ts>)

## Client contract lookup

Search the selected API path or function in [app/system/api-client.ts](<../../../app/system/api-client.ts>); follow its screen callers. Common UI/language changes require [app/system/ui.tsx](<../../../app/system/ui.tsx>) and [app/system/i18n.ts](<../../../app/system/i18n.ts>). For SQL changes use [schema map](../SCHEMA.md).
