# KPI / Growth / Team Activity

[Context index](../../../AGENTS.md) · [Architecture](../ARCHITECTURE.md) · [Change guide](../WORKFLOW.md)

ประเมิน performance หลักฐาน insights และ activity

Evidence: snapshot `830d4f23`; source map, not a live availability claim. Test candidates use filename matching and are not exhaustive coverage.

## Read only the operation you change

- [performance API and function map](../api/performance.md) — registered in Node app
- [activity API and function map](../api/activity.md) — registered in Node app

## UI function locator

Shared screens contain other modules: use the symbol and line range instead of reading the whole file.

| Symbol | Source | Lines |
|---|---|---|
| `isSalesRole` | [app/system/production/PerformanceScreen.tsx](<../../../app/system/production/PerformanceScreen.tsx>) | 79–79 |
| `areasForRole` | [app/system/production/PerformanceScreen.tsx](<../../../app/system/production/PerformanceScreen.tsx>) | 80–80 |
| `statusTone` | [app/system/production/PerformanceScreen.tsx](<../../../app/system/production/PerformanceScreen.tsx>) | 84–85 |
| `initialsFor` | [app/system/production/PerformanceScreen.tsx](<../../../app/system/production/PerformanceScreen.tsx>) | 87–87 |
| `memberKey` | [app/system/production/PerformanceScreen.tsx](<../../../app/system/production/PerformanceScreen.tsx>) | 88–88 |
| `scoreAverage` | [app/system/production/PerformanceScreen.tsx](<../../../app/system/production/PerformanceScreen.tsx>) | 92–94 |
| `fromApi` | [app/system/production/PerformanceScreen.tsx](<../../../app/system/production/PerformanceScreen.tsx>) | 96–107 |
| `emptyReview` | [app/system/production/PerformanceScreen.tsx](<../../../app/system/production/PerformanceScreen.tsx>) | 109–113 |
| `Performance` | [app/system/production/PerformanceScreen.tsx](<../../../app/system/production/PerformanceScreen.tsx>) | 115–394 |
| `SummaryCard` | [app/system/production/PerformanceScreen.tsx](<../../../app/system/production/PerformanceScreen.tsx>) | 396–399 |
| `Score` | [app/system/production/PerformanceScreen.tsx](<../../../app/system/production/PerformanceScreen.tsx>) | 401–404 |
| `ratingLabel` | [app/system/production/PerformanceScreen.tsx](<../../../app/system/production/PerformanceScreen.tsx>) | 406–408 |
| `MyKpi` | [app/system/production/PerformanceScreen.tsx](<../../../app/system/production/PerformanceScreen.tsx>) | 412–453 |
| `WorkEvidencePanel` | [app/system/production/PerformanceScreen.tsx](<../../../app/system/production/PerformanceScreen.tsx>) | 455–511 |
| `Framework` | [app/system/production/PerformanceScreen.tsx](<../../../app/system/production/PerformanceScreen.tsx>) | 513–528 |
| `AssessmentModal` | [app/system/production/PerformanceScreen.tsx](<../../../app/system/production/PerformanceScreen.tsx>) | 530–572 |
| `CalibrationModal` | [app/system/production/PerformanceScreen.tsx](<../../../app/system/production/PerformanceScreen.tsx>) | 574–589 |
| `useCopy` | [app/system/production/TeamActivityScreen.tsx](<../../../app/system/production/TeamActivityScreen.tsx>) | 15–15 |
| `number` | [app/system/production/TeamActivityScreen.tsx](<../../../app/system/production/TeamActivityScreen.tsx>) | 16–16 |
| `useFormTools` | [app/system/production/TeamActivityScreen.tsx](<../../../app/system/production/TeamActivityScreen.tsx>) | 18–18 |
| `ZeroEvidenceNote` | [app/system/production/TeamActivityScreen.tsx](<../../../app/system/production/TeamActivityScreen.tsx>) | 19–19 |
| `Status` | [app/system/production/TeamActivityScreen.tsx](<../../../app/system/production/TeamActivityScreen.tsx>) | 20–20 |
| `ScoreCard` | [app/system/production/TeamActivityScreen.tsx](<../../../app/system/production/TeamActivityScreen.tsx>) | 21–21 |
| `TeamActivityScreen` | [app/system/production/TeamActivityScreen.tsx](<../../../app/system/production/TeamActivityScreen.tsx>) | 23–44 |
| `MemberDialog` | [app/system/production/TeamActivityScreen.tsx](<../../../app/system/production/TeamActivityScreen.tsx>) | 46–73 |
| `NoteForm` | [app/system/production/TeamActivityScreen.tsx](<../../../app/system/production/TeamActivityScreen.tsx>) | 75–75 |
| `RuleForm` | [app/system/production/TeamActivityScreen.tsx](<../../../app/system/production/TeamActivityScreen.tsx>) | 76–79 |
| `ReportForm` | [app/system/production/TeamActivityScreen.tsx](<../../../app/system/production/TeamActivityScreen.tsx>) | 80–80 |
| `QualityForm` | [app/system/production/TeamActivityScreen.tsx](<../../../app/system/production/TeamActivityScreen.tsx>) | 81–81 |
| `PolicyForm` | [app/system/production/TeamActivityScreen.tsx](<../../../app/system/production/TeamActivityScreen.tsx>) | 82–82 |

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
- [app/system/dialogs.ts](<../../../app/system/dialogs.ts>)
- [app/system/activity-client.ts](<../../../app/system/activity-client.ts>)
- [app/system/production/team-activity.css](<../../../app/system/production/team-activity.css>)
- [app/system/DateInput.tsx](<../../../app/system/DateInput.tsx>)

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
