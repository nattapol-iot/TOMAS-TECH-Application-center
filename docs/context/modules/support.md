# Support / Employee Manual

[Context index](../../../AGENTS.md) · [Architecture](../ARCHITECTURE.md) · [Change guide](../WORKFLOW.md)

แจ้งปัญหา ticket การตอบรับ และคู่มือ

Evidence: snapshot `84fdd5bc`; source map, not a live availability claim. Test candidates use filename matching and are not exhaustive coverage.

## Read only the operation you change

- [support API and function map](../api/support.md) — registered in Node app

## UI function locator

Shared screens contain other modules: use the symbol and line range instead of reading the whole file.

| Symbol | Source | Lines |
|---|---|---|
| `useCopy` | [app/system/production/SupportScreens.tsx](<../../../app/system/production/SupportScreens.tsx>) | 13–13 |
| `SelectField` | [app/system/production/SupportScreens.tsx](<../../../app/system/production/SupportScreens.tsx>) | 14–14 |
| `PageButtons` | [app/system/production/SupportScreens.tsx](<../../../app/system/production/SupportScreens.tsx>) | 15–15 |
| `SupportDialog` | [app/system/production/SupportScreens.tsx](<../../../app/system/production/SupportScreens.tsx>) | 16–20 |
| `SupportCreateDialog` | [app/system/production/SupportScreens.tsx](<../../../app/system/production/SupportScreens.tsx>) | 22–47 |
| `SupportCenter` | [app/system/production/SupportScreens.tsx](<../../../app/system/production/SupportScreens.tsx>) | 49–68 |
| `SupportTicketView` | [app/system/production/SupportScreens.tsx](<../../../app/system/production/SupportScreens.tsx>) | 70–98 |
| `SupportActionForm` | [app/system/production/SupportScreens.tsx](<../../../app/system/production/SupportScreens.tsx>) | 101–108 |
| `SupportMembers` | [app/system/production/SupportScreens.tsx](<../../../app/system/production/SupportScreens.tsx>) | 110–113 |
| `employeeManualLabel` | [app/system/production/EmployeeManualScreen.tsx](<../../../app/system/production/EmployeeManualScreen.tsx>) | 55–55 |
| `EmployeeManualScreen` | [app/system/production/EmployeeManualScreen.tsx](<../../../app/system/production/EmployeeManualScreen.tsx>) | 57–101 |

## Domain helpers / direct dependencies

- [backend-node/src/document-storage.ts](<../../../backend-node/src/document-storage.ts>)
- [backend-node/src/support-rules.ts](<../../../backend-node/src/support-rules.ts>)
- [backend-node/src/support-service.ts](<../../../backend-node/src/support-service.ts>)
- [app/system/api-client.ts](<../../../app/system/api-client.ts>)
- [app/system/i18n.ts](<../../../app/system/i18n.ts>)
- [app/system/ui.tsx](<../../../app/system/ui.tsx>)
- [app/system/support-copy.ts](<../../../app/system/support-copy.ts>)
- [app/system/support-client.ts](<../../../app/system/support-client.ts>)
- [app/system/production/support-center.css](<../../../app/system/production/support-center.css>)
- [app/system/production/employee-manual.css](<../../../app/system/production/employee-manual.css>)

## Candidate regression tests

- [tests/employee-manual.test.mjs](<../../../tests/employee-manual.test.mjs>)
- [backend-node/tests/support-rules.test.ts](<../../../backend-node/tests/support-rules.test.ts>)

## Client contract lookup

Search the selected API path or function in [app/system/api-client.ts](<../../../app/system/api-client.ts>); follow its screen callers. Common UI/language changes require [app/system/ui.tsx](<../../../app/system/ui.tsx>) and [app/system/i18n.ts](<../../../app/system/i18n.ts>). For SQL changes use [schema map](../SCHEMA.md).
