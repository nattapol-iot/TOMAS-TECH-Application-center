# KPI / Growth / Team Activity

[Context index](../../../AGENTS.md) · [Architecture](../ARCHITECTURE.md) · [Change guide](../WORKFLOW.md)

ประเมิน performance หลักฐาน insights และ activity

Evidence: snapshot `c580425a`; source map, not a live availability claim. Test candidates use filename matching and are not exhaustive coverage.

## Read only the operation you change

- [performance API and function map](../api/performance.md) — registered in Node app
- [activity API and function map](../api/activity.md) — registered in Node app

## UI function locator

Shared screens contain other modules: use the symbol and line range instead of reading the whole file.

| Symbol | Source | Lines |
|---|---|---|
| `isSalesRole` | [app/system/production/PerformanceScreen.tsx](<../../../app/system/production/PerformanceScreen.tsx>) | 75–75 |
| `areasForRole` | [app/system/production/PerformanceScreen.tsx](<../../../app/system/production/PerformanceScreen.tsx>) | 76–76 |
| `statusTone` | [app/system/production/PerformanceScreen.tsx](<../../../app/system/production/PerformanceScreen.tsx>) | 80–81 |
| `initialsFor` | [app/system/production/PerformanceScreen.tsx](<../../../app/system/production/PerformanceScreen.tsx>) | 83–83 |
| `memberKey` | [app/system/production/PerformanceScreen.tsx](<../../../app/system/production/PerformanceScreen.tsx>) | 84–84 |
| `scoreAverage` | [app/system/production/PerformanceScreen.tsx](<../../../app/system/production/PerformanceScreen.tsx>) | 88–90 |
| `fromApi` | [app/system/production/PerformanceScreen.tsx](<../../../app/system/production/PerformanceScreen.tsx>) | 92–103 |
| `emptyReview` | [app/system/production/PerformanceScreen.tsx](<../../../app/system/production/PerformanceScreen.tsx>) | 105–109 |
| `Performance` | [app/system/production/PerformanceScreen.tsx](<../../../app/system/production/PerformanceScreen.tsx>) | 111–390 |
| `SummaryCard` | [app/system/production/PerformanceScreen.tsx](<../../../app/system/production/PerformanceScreen.tsx>) | 392–395 |
| `Score` | [app/system/production/PerformanceScreen.tsx](<../../../app/system/production/PerformanceScreen.tsx>) | 397–400 |
| `ratingLabel` | [app/system/production/PerformanceScreen.tsx](<../../../app/system/production/PerformanceScreen.tsx>) | 402–404 |
| `MyKpi` | [app/system/production/PerformanceScreen.tsx](<../../../app/system/production/PerformanceScreen.tsx>) | 408–449 |
| `WorkEvidencePanel` | [app/system/production/PerformanceScreen.tsx](<../../../app/system/production/PerformanceScreen.tsx>) | 451–507 |
| `Framework` | [app/system/production/PerformanceScreen.tsx](<../../../app/system/production/PerformanceScreen.tsx>) | 509–524 |
| `AssessmentModal` | [app/system/production/PerformanceScreen.tsx](<../../../app/system/production/PerformanceScreen.tsx>) | 526–564 |
| `CalibrationModal` | [app/system/production/PerformanceScreen.tsx](<../../../app/system/production/PerformanceScreen.tsx>) | 566–582 |
| `useCopy` | [app/system/production/TeamActivityScreen.tsx](<../../../app/system/production/TeamActivityScreen.tsx>) | 9–9 |
| `number` | [app/system/production/TeamActivityScreen.tsx](<../../../app/system/production/TeamActivityScreen.tsx>) | 10–10 |
| `ZeroEvidenceNote` | [app/system/production/TeamActivityScreen.tsx](<../../../app/system/production/TeamActivityScreen.tsx>) | 11–11 |
| `Status` | [app/system/production/TeamActivityScreen.tsx](<../../../app/system/production/TeamActivityScreen.tsx>) | 12–12 |
| `ScoreCard` | [app/system/production/TeamActivityScreen.tsx](<../../../app/system/production/TeamActivityScreen.tsx>) | 13–13 |
| `TeamActivityScreen` | [app/system/production/TeamActivityScreen.tsx](<../../../app/system/production/TeamActivityScreen.tsx>) | 15–36 |
| `MemberDialog` | [app/system/production/TeamActivityScreen.tsx](<../../../app/system/production/TeamActivityScreen.tsx>) | 38–65 |
| `NoteForm` | [app/system/production/TeamActivityScreen.tsx](<../../../app/system/production/TeamActivityScreen.tsx>) | 67–67 |
| `RuleForm` | [app/system/production/TeamActivityScreen.tsx](<../../../app/system/production/TeamActivityScreen.tsx>) | 68–71 |
| `ReportForm` | [app/system/production/TeamActivityScreen.tsx](<../../../app/system/production/TeamActivityScreen.tsx>) | 72–72 |
| `QualityForm` | [app/system/production/TeamActivityScreen.tsx](<../../../app/system/production/TeamActivityScreen.tsx>) | 73–73 |
| `PolicyForm` | [app/system/production/TeamActivityScreen.tsx](<../../../app/system/production/TeamActivityScreen.tsx>) | 74–74 |

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
- [app/system/activity-client.ts](<../../../app/system/activity-client.ts>)
- [app/system/production/team-activity.css](<../../../app/system/production/team-activity.css>)

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
