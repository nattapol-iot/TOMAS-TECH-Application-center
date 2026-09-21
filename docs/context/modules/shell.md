# Application shell / Login / Profile

[Context index](../../../AGENTS.md) · [Architecture](../ARCHITECTURE.md) · [Change guide](../WORKFLOW.md)

เมนู ภาษา session bootstrap และโปรไฟล์

Evidence: snapshot `80a5348e`; source map, not a live availability claim. Test candidates use filename matching and are not exhaustive coverage.

## Read only the operation you change

- [auth-tmt-id API and function map](../api/auth-tmt-id.md) — registered in Node app
- [bootstrap API and function map](../api/bootstrap.md) — registered in Node app

## UI function locator

Shared screens contain other modules: use the symbol and line range instead of reading the whole file.

| Symbol | Source | Lines |
|---|---|---|
| `ProductionApp` | [app/system/ProductionApp.tsx](<../../../app/system/ProductionApp.tsx>) | 190–751 |
| `ProductionLogin` | [app/system/ProductionApp.tsx](<../../../app/system/ProductionApp.tsx>) | 753–800 |
| `initials` | [app/system/ProductionApp.tsx](<../../../app/system/ProductionApp.tsx>) | 802–804 |
| `myWorkNeedsAttention` | [app/system/ProductionApp.tsx](<../../../app/system/ProductionApp.tsx>) | 806–817 |
| `badgeFor` | [app/system/ProductionApp.tsx](<../../../app/system/ProductionApp.tsx>) | 819–826 |
| `initials` | [app/system/production/ProfileScreen.tsx](<../../../app/system/production/ProfileScreen.tsx>) | 25–27 |
| `permissionVerb` | [app/system/production/ProfileScreen.tsx](<../../../app/system/production/ProfileScreen.tsx>) | 29–32 |
| `ProductionProfile` | [app/system/production/ProfileScreen.tsx](<../../../app/system/production/ProfileScreen.tsx>) | 34–133 |

## Domain helpers / direct dependencies

- [backend-node/src/tmt-id/callback-guard.ts](<../../../backend-node/src/tmt-id/callback-guard.ts>)
- [backend-node/src/tmt-id/constants.ts](<../../../backend-node/src/tmt-id/constants.ts>)
- [backend-node/src/tmt-id/next-path.ts](<../../../backend-node/src/tmt-id/next-path.ts>)
- [backend-node/src/tmt-id/runtime.ts](<../../../backend-node/src/tmt-id/runtime.ts>)
- [backend-node/src/tmt-id/user-provisioning.ts](<../../../backend-node/src/tmt-id/user-provisioning.ts>)
- [backend-node/src/tmt-id/types.ts](<../../../backend-node/src/tmt-id/types.ts>)
- [backend-node/src/routes/sales-customers.ts](<../../../backend-node/src/routes/sales-customers.ts>)
- [app/system/production/TeamActivityScreen.tsx](<../../../app/system/production/TeamActivityScreen.tsx>)
- [app/system/production/ExecutiveDashboard.tsx](<../../../app/system/production/ExecutiveDashboard.tsx>)
- [backend-node/src/executive-dashboard-model.ts](<../../../backend-node/src/executive-dashboard-model.ts>)
- [backend-node/src/engineering-rate-access.ts](<../../../backend-node/src/engineering-rate-access.ts>)
- [app/system/use-activity-presence.ts](<../../../app/system/use-activity-presence.ts>)
- [lib/remembered-view.ts](<../../../lib/remembered-view.ts>)
- [app/system/Brand.tsx](<../../../app/system/Brand.tsx>)
- [app/system/auth-client.ts](<../../../app/system/auth-client.ts>)
- [app/system/api-client.ts](<../../../app/system/api-client.ts>)
- [app/system/team-test-client.ts](<../../../app/system/team-test-client.ts>)
- [app/system/tmt-id.constants.ts](<../../../app/system/tmt-id.constants.ts>)
- [app/system/tmt-id-client.ts](<../../../app/system/tmt-id-client.ts>)
- [app/system/sign-in-mode.constants.ts](<../../../app/system/sign-in-mode.constants.ts>)
- [app/system/production/production-login-copy.ts](<../../../app/system/production/production-login-copy.ts>)
- [app/system/production/ProductionLogin.types.ts](<../../../app/system/production/ProductionLogin.types.ts>)
- [app/system/product.ts](<../../../app/system/product.ts>)
- [app/system/ui.tsx](<../../../app/system/ui.tsx>)
- [app/system/i18n.ts](<../../../app/system/i18n.ts>)
- [app/system/production/CoreScreens.tsx](<../../../app/system/production/CoreScreens.tsx>)
- [app/system/production/InquiryScreens.tsx](<../../../app/system/production/InquiryScreens.tsx>)
- [app/system/production/ResourcePlanningScreen.tsx](<../../../app/system/production/ResourcePlanningScreen.tsx>)
- [app/system/production/ProjectTimelineScreen.tsx](<../../../app/system/production/ProjectTimelineScreen.tsx>)
- [app/system/production/ResourceTaskWorkspace.tsx](<../../../app/system/production/ResourceTaskWorkspace.tsx>)
- [app/system/production/ReportScreens.tsx](<../../../app/system/production/ReportScreens.tsx>)
- [app/system/production/EstimateScreens.tsx](<../../../app/system/production/EstimateScreens.tsx>)
- [app/system/production/MaterialScreens.tsx](<../../../app/system/production/MaterialScreens.tsx>)
- [app/system/production/PlanningPricingScreens.tsx](<../../../app/system/production/PlanningPricingScreens.tsx>)
- [app/system/production/SigningScreens.tsx](<../../../app/system/production/SigningScreens.tsx>)
- [app/system/production/AdminAnalyticsScreens.tsx](<../../../app/system/production/AdminAnalyticsScreens.tsx>)
- [app/system/production/KnowledgeScreens.tsx](<../../../app/system/production/KnowledgeScreens.tsx>)
- [app/system/production/ModuleTemplateScreens.tsx](<../../../app/system/production/ModuleTemplateScreens.tsx>)
- [app/system/production/LaborPackageMaster.tsx](<../../../app/system/production/LaborPackageMaster.tsx>)
- [app/system/production/ProfileScreen.tsx](<../../../app/system/production/ProfileScreen.tsx>)
- [app/system/production/SupportScreens.tsx](<../../../app/system/production/SupportScreens.tsx>)
- [app/system/production/EmployeeManualScreen.tsx](<../../../app/system/production/EmployeeManualScreen.tsx>)
- [app/system/support-copy.ts](<../../../app/system/support-copy.ts>)
- [app/system/production/PerformanceScreen.tsx](<../../../app/system/production/PerformanceScreen.tsx>)
- [app/system/production/SiteVisitScreens.tsx](<../../../app/system/production/SiteVisitScreens.tsx>)
- [app/system/production/CrmScreens.tsx](<../../../app/system/production/CrmScreens.tsx>)
- [app/system/LocalizedText.tsx](<../../../app/system/LocalizedText.tsx>)

## Candidate regression tests

- [tests/auth-restoration.test.mjs](<../../../tests/auth-restoration.test.mjs>)
- [tests/remembered-view.test.mjs](<../../../tests/remembered-view.test.mjs>)
- [backend-node/tests/auth.test.ts](<../../../backend-node/tests/auth.test.ts>)
- [backend-node/tests/routing.test.ts](<../../../backend-node/tests/routing.test.ts>)
- [backend-node/tests/tmt-id.test.ts](<../../../backend-node/tests/tmt-id.test.ts>)

## Client contract lookup

Search the selected API path or function in [app/system/api-client.ts](<../../../app/system/api-client.ts>); follow its screen callers. Common UI/language changes require [app/system/ui.tsx](<../../../app/system/ui.tsx>) and [app/system/i18n.ts](<../../../app/system/i18n.ts>). For SQL changes use [schema map](../SCHEMA.md).
