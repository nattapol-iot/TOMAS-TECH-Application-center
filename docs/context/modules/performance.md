# KPI / Growth / Team Activity

[Context index](../../../AGENTS.md) · [Architecture](../ARCHITECTURE.md) · [Change guide](../WORKFLOW.md)

ประเมิน performance หลักฐาน insights และ activity

Evidence: snapshot `fd82cb38`; source map, not a live availability claim. Test candidates use filename matching and are not exhaustive coverage.

## Read only the operation you change

- [performance API and function map](../api/performance.md) — registered in Node app
- [activity API and function map](../api/activity.md) — registered in Node app

## UI function locator

Shared screens contain other modules: use the symbol and line range instead of reading the whole file.

| Symbol | Source | Lines |
|---|---|---|
| `isSalesRole` | [app/system/production/PerformanceScreen.tsx](<../../../app/system/production/PerformanceScreen.tsx>) | 164–164 |
| `areasForRole` | [app/system/production/PerformanceScreen.tsx](<../../../app/system/production/PerformanceScreen.tsx>) | 165–165 |
| `statusTone` | [app/system/production/PerformanceScreen.tsx](<../../../app/system/production/PerformanceScreen.tsx>) | 169–170 |
| `initialsFor` | [app/system/production/PerformanceScreen.tsx](<../../../app/system/production/PerformanceScreen.tsx>) | 172–178 |
| `memberKey` | [app/system/production/PerformanceScreen.tsx](<../../../app/system/production/PerformanceScreen.tsx>) | 179–179 |
| `scoreAverage` | [app/system/production/PerformanceScreen.tsx](<../../../app/system/production/PerformanceScreen.tsx>) | 187–192 |
| `fromApi` | [app/system/production/PerformanceScreen.tsx](<../../../app/system/production/PerformanceScreen.tsx>) | 194–217 |
| `emptyReview` | [app/system/production/PerformanceScreen.tsx](<../../../app/system/production/PerformanceScreen.tsx>) | 219–239 |
| `Performance` | [app/system/production/PerformanceScreen.tsx](<../../../app/system/production/PerformanceScreen.tsx>) | 241–723 |
| `SummaryCard` | [app/system/production/PerformanceScreen.tsx](<../../../app/system/production/PerformanceScreen.tsx>) | 725–739 |
| `Score` | [app/system/production/PerformanceScreen.tsx](<../../../app/system/production/PerformanceScreen.tsx>) | 741–749 |
| `ratingLabel` | [app/system/production/PerformanceScreen.tsx](<../../../app/system/production/PerformanceScreen.tsx>) | 751–753 |
| `MyKpi` | [app/system/production/PerformanceScreen.tsx](<../../../app/system/production/PerformanceScreen.tsx>) | 755–873 |
| `WorkEvidencePanel` | [app/system/production/PerformanceScreen.tsx](<../../../app/system/production/PerformanceScreen.tsx>) | 875–1069 |
| `Framework` | [app/system/production/PerformanceScreen.tsx](<../../../app/system/production/PerformanceScreen.tsx>) | 1071–1156 |
| `AssessmentModal` | [app/system/production/PerformanceScreen.tsx](<../../../app/system/production/PerformanceScreen.tsx>) | 1158–1356 |
| `CalibrationModal` | [app/system/production/PerformanceScreen.tsx](<../../../app/system/production/PerformanceScreen.tsx>) | 1358–1429 |
| `useCopy` | [app/system/production/TeamActivityScreen.tsx](<../../../app/system/production/TeamActivityScreen.tsx>) | 27–33 |
| `number` | [app/system/production/TeamActivityScreen.tsx](<../../../app/system/production/TeamActivityScreen.tsx>) | 34–34 |
| `useFormTools` | [app/system/production/TeamActivityScreen.tsx](<../../../app/system/production/TeamActivityScreen.tsx>) | 36–44 |
| `ZeroEvidenceNote` | [app/system/production/TeamActivityScreen.tsx](<../../../app/system/production/TeamActivityScreen.tsx>) | 45–56 |
| `Status` | [app/system/production/TeamActivityScreen.tsx](<../../../app/system/production/TeamActivityScreen.tsx>) | 57–69 |
| `ScoreCard` | [app/system/production/TeamActivityScreen.tsx](<../../../app/system/production/TeamActivityScreen.tsx>) | 70–123 |
| `TeamActivityScreen` | [app/system/production/TeamActivityScreen.tsx](<../../../app/system/production/TeamActivityScreen.tsx>) | 125–378 |
| `MemberDialog` | [app/system/production/TeamActivityScreen.tsx](<../../../app/system/production/TeamActivityScreen.tsx>) | 380–776 |
| `NoteForm` | [app/system/production/TeamActivityScreen.tsx](<../../../app/system/production/TeamActivityScreen.tsx>) | 778–810 |
| `RuleForm` | [app/system/production/TeamActivityScreen.tsx](<../../../app/system/production/TeamActivityScreen.tsx>) | 811–882 |
| `ReportForm` | [app/system/production/TeamActivityScreen.tsx](<../../../app/system/production/TeamActivityScreen.tsx>) | 883–944 |
| `QualityForm` | [app/system/production/TeamActivityScreen.tsx](<../../../app/system/production/TeamActivityScreen.tsx>) | 945–1037 |
| `PolicyForm` | [app/system/production/TeamActivityScreen.tsx](<../../../app/system/production/TeamActivityScreen.tsx>) | 1038–1126 |

## Domain helpers / direct dependencies

- [backend-node/src/activity-service.ts](<../../../backend-node/src/activity-service.ts>)
- [backend-node/src/activity-rules.ts](<../../../backend-node/src/activity-rules.ts>)
- [backend-node/src/user-roles.ts](<../../../backend-node/src/user-roles.ts>)
- [backend-node/src/performance-evidence.ts](<../../../backend-node/src/performance-evidence.ts>)
- [backend-node/src/performance-framework.ts](<../../../backend-node/src/performance-framework.ts>)
- [backend-node/src/team-scope.ts](<../../../backend-node/src/team-scope.ts>)
- [app/system/LocalizedText.tsx](<../../../app/system/LocalizedText.tsx>)
- [app/system/i18n.ts](<../../../app/system/i18n.ts>)
- [app/system/production/ActivityKpiSummary.tsx](<../../../app/system/production/ActivityKpiSummary.tsx>)
- [app/system/production/PerformancePulse.tsx](<../../../app/system/production/PerformancePulse.tsx>)
- [app/system/production/performance-evidence-copy.ts](<../../../app/system/production/performance-evidence-copy.ts>)
- [app/system/production/performance-presentation.ts](<../../../app/system/production/performance-presentation.ts>)
- [app/system/ui.tsx](<../../../app/system/ui.tsx>)
- [app/system/api-client.ts](<../../../app/system/api-client.ts>)
- [app/system/production/pegasus-skin.css](<../../../app/system/production/pegasus-skin.css>)
- [app/system/production/pegasus-screens.css](<../../../app/system/production/pegasus-screens.css>)
- [app/system/production/form-bubbles.ts](<../../../app/system/production/form-bubbles.ts>)
- [app/system/production/form-draft.ts](<../../../app/system/production/form-draft.ts>)
- [app/system/activity-client.ts](<../../../app/system/activity-client.ts>)
- [app/system/production/team-activity.css](<../../../app/system/production/team-activity.css>)
- [app/system/DateInput.tsx](<../../../app/system/DateInput.tsx>)
- [app/system/production/PegasusSelect.tsx](<../../../app/system/production/PegasusSelect.tsx>)

## Candidate regression tests

- [tests/activity-presence-modules.test.mjs](<../../../tests/activity-presence-modules.test.mjs>)
- [tests/performance-guardrails.test.mjs](<../../../tests/performance-guardrails.test.mjs>)
- [tests/performance-presentation.test.mjs](<../../../tests/performance-presentation.test.mjs>)
- [tests/performance-pulse.test.mjs](<../../../tests/performance-pulse.test.mjs>)
- [tests/team-activity-ui.test.mjs](<../../../tests/team-activity-ui.test.mjs>)
- [backend-node/tests/activity-presence-route.test.ts](<../../../backend-node/tests/activity-presence-route.test.ts>)
- [backend-node/tests/activity-rules.test.ts](<../../../backend-node/tests/activity-rules.test.ts>)
- [backend-node/tests/performance-evidence.test.ts](<../../../backend-node/tests/performance-evidence.test.ts>)
- [backend-node/tests/performance-insights.test.ts](<../../../backend-node/tests/performance-insights.test.ts>)

## Client contract lookup

Search the selected API path or function in [app/system/api-client.ts](<../../../app/system/api-client.ts>); follow its screen callers. Common UI/language changes require [app/system/ui.tsx](<../../../app/system/ui.tsx>) and [app/system/i18n.ts](<../../../app/system/i18n.ts>). For SQL changes use [schema map](../SCHEMA.md).
