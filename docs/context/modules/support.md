# Support / Employee Manual / Guides

[Context index](../../../AGENTS.md) · [Architecture](../ARCHITECTURE.md) · [Change guide](../WORKFLOW.md)

แจ้งปัญหา ticket การตอบรับ คู่มือ และบทสอนแบบคลิกตามบนหน้าจอจริงพร้อมความคืบหน้าของทีม

Evidence: snapshot `65a519ae`; source map, not a live availability claim. Test candidates use filename matching and are not exhaustive coverage.

## Read only the operation you change

- [support API and function map](../api/support.md) — registered in Node app
- [user-guides API and function map](../api/user-guides.md) — registered in Node app

## UI function locator

Shared screens contain other modules: use the symbol and line range instead of reading the whole file.

| Symbol | Source | Lines |
|---|---|---|
| `storedRows` | [app/system/production/SupportScreens.tsx](<../../../app/system/production/SupportScreens.tsx>) | 22–24 |
| `useCopy` | [app/system/production/SupportScreens.tsx](<../../../app/system/production/SupportScreens.tsx>) | 39–42 |
| `kilobytes` | [app/system/production/SupportScreens.tsx](<../../../app/system/production/SupportScreens.tsx>) | 43–43 |
| `StatusBadge` | [app/system/production/SupportScreens.tsx](<../../../app/system/production/SupportScreens.tsx>) | 45–48 |
| `SelectField` | [app/system/production/SupportScreens.tsx](<../../../app/system/production/SupportScreens.tsx>) | 50–55 |
| `SupportDialog` | [app/system/production/SupportScreens.tsx](<../../../app/system/production/SupportScreens.tsx>) | 58–76 |
| `Pager` | [app/system/production/SupportScreens.tsx](<../../../app/system/production/SupportScreens.tsx>) | 79–84 |
| `ErrorNote` | [app/system/production/SupportScreens.tsx](<../../../app/system/production/SupportScreens.tsx>) | 86–88 |
| `SupportCreateDialog` | [app/system/production/SupportScreens.tsx](<../../../app/system/production/SupportScreens.tsx>) | 90–161 |
| `SupportCenter` | [app/system/production/SupportScreens.tsx](<../../../app/system/production/SupportScreens.tsx>) | 163–256 |
| `isImage` | [app/system/production/SupportScreens.tsx](<../../../app/system/production/SupportScreens.tsx>) | 259–259 |
| `SupportImage` | [app/system/production/SupportScreens.tsx](<../../../app/system/production/SupportScreens.tsx>) | 260–275 |
| `MoreActions` | [app/system/production/SupportScreens.tsx](<../../../app/system/production/SupportScreens.tsx>) | 280–300 |
| `SupportTicketView` | [app/system/production/SupportScreens.tsx](<../../../app/system/production/SupportScreens.tsx>) | 302–445 |
| `SupportActionForm` | [app/system/production/SupportScreens.tsx](<../../../app/system/production/SupportScreens.tsx>) | 448–486 |
| `SupportMembers` | [app/system/production/SupportScreens.tsx](<../../../app/system/production/SupportScreens.tsx>) | 488–518 |
| `employeeManualLabel` | [app/system/production/EmployeeManualScreen.tsx](<../../../app/system/production/EmployeeManualScreen.tsx>) | 55–55 |
| `EmployeeManualScreen` | [app/system/production/EmployeeManualScreen.tsx](<../../../app/system/production/EmployeeManualScreen.tsx>) | 57–101 |
| `RUN_KEY` | [app/system/production/GuideLayer.tsx](<../../../app/system/production/GuideLayer.tsx>) | 92–92 |
| `ANSWERED_KEY` | [app/system/production/GuideLayer.tsx](<../../../app/system/production/GuideLayer.tsx>) | 93–93 |
| `readSession` | [app/system/production/GuideLayer.tsx](<../../../app/system/production/GuideLayer.tsx>) | 95–97 |
| `writeSession` | [app/system/production/GuideLayer.tsx](<../../../app/system/production/GuideLayer.tsx>) | 98–100 |
| `readRun` | [app/system/production/GuideLayer.tsx](<../../../app/system/production/GuideLayer.tsx>) | 101–107 |
| `shortDate` | [app/system/production/GuideLayer.tsx](<../../../app/system/production/GuideLayer.tsx>) | 109–109 |
| `findVisible` | [app/system/production/GuideLayer.tsx](<../../../app/system/production/GuideLayer.tsx>) | 112–121 |
| `place` | [app/system/production/GuideLayer.tsx](<../../../app/system/production/GuideLayer.tsx>) | 124–138 |
| `GuideLayer` | [app/system/production/GuideLayer.tsx](<../../../app/system/production/GuideLayer.tsx>) | 140–253 |
| `GuideStatus` | [app/system/production/GuideLayer.tsx](<../../../app/system/production/GuideLayer.tsx>) | 255–259 |
| `GuidePanel` | [app/system/production/GuideLayer.tsx](<../../../app/system/production/GuideLayer.tsx>) | 261–293 |
| `GuideTeamModal` | [app/system/production/GuideLayer.tsx](<../../../app/system/production/GuideLayer.tsx>) | 295–342 |
| `GuideRunner` | [app/system/production/GuideLayer.tsx](<../../../app/system/production/GuideLayer.tsx>) | 344–434 |

## Domain helpers / direct dependencies

- [backend-node/src/document-storage.ts](<../../../backend-node/src/document-storage.ts>)
- [backend-node/src/email.ts](<../../../backend-node/src/email.ts>)
- [backend-node/src/support-rules.ts](<../../../backend-node/src/support-rules.ts>)
- [backend-node/src/support-service.ts](<../../../backend-node/src/support-service.ts>)
- [backend-node/src/activity-service.ts](<../../../backend-node/src/activity-service.ts>)
- [app/system/dialogs.ts](<../../../app/system/dialogs.ts>)
- [app/system/api-client.ts](<../../../app/system/api-client.ts>)
- [app/system/i18n.ts](<../../../app/system/i18n.ts>)
- [app/system/ui.tsx](<../../../app/system/ui.tsx>)
- [app/system/support-copy.ts](<../../../app/system/support-copy.ts>)
- [app/system/support-client.ts](<../../../app/system/support-client.ts>)
- [app/system/production/support-center.css](<../../../app/system/production/support-center.css>)
- [app/system/production/employee-manual.css](<../../../app/system/production/employee-manual.css>)
- [app/system/production/guide-catalog.ts](<../../../app/system/production/guide-catalog.ts>)
- [app/system/production/guide-geometry.ts](<../../../app/system/production/guide-geometry.ts>)
- [app/system/production/guide.css](<../../../app/system/production/guide.css>)

## Candidate regression tests

- [tests/employee-manual.test.mjs](<../../../tests/employee-manual.test.mjs>)
- [tests/guides.test.mjs](<../../../tests/guides.test.mjs>)
- [tests/support-pegasus.test.mjs](<../../../tests/support-pegasus.test.mjs>)
- [backend-node/tests/support-rules.test.ts](<../../../backend-node/tests/support-rules.test.ts>)
- [backend-node/tests/user-guides.test.ts](<../../../backend-node/tests/user-guides.test.ts>)

## Client contract lookup

Search the selected API path or function in [app/system/api-client.ts](<../../../app/system/api-client.ts>); follow its screen callers. Common UI/language changes require [app/system/ui.tsx](<../../../app/system/ui.tsx>) and [app/system/i18n.ts](<../../../app/system/i18n.ts>). For SQL changes use [schema map](../SCHEMA.md).
