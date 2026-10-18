# CRM / Sales

[Context index](../../../AGENTS.md) · [Architecture](../ARCHITECTURE.md) · [Change guide](../WORKFLOW.md)

ลูกค้า Contact Opportunity กิจกรรมและการติดตาม เชื่อม Inquiry และ My Work

Evidence: snapshot `b182d496`; source map, not a live availability claim. Test candidates use filename matching and are not exhaustive coverage.

## Read only the operation you change

- [crm API and function map](../api/crm.md) — registered in Node app
- [crm-customers API and function map](../api/crm-customers.md) — registered in Node app
- [crm-documents API and function map](../api/crm-documents.md) — registered in Node app

## UI function locator

Shared screens contain other modules: use the symbol and line range instead of reading the whole file.

| Symbol | Source | Lines |
|---|---|---|
| `text` | [app/system/production/CrmScreens.tsx](<../../../app/system/production/CrmScreens.tsx>) | 23–23 |
| `date` | [app/system/production/CrmScreens.tsx](<../../../app/system/production/CrmScreens.tsx>) | 24–24 |
| `futureDate` | [app/system/production/CrmScreens.tsx](<../../../app/system/production/CrmScreens.tsx>) | 25–25 |
| `money` | [app/system/production/CrmScreens.tsx](<../../../app/system/production/CrmScreens.tsx>) | 26–26 |
| `toneFor` | [app/system/production/CrmScreens.tsx](<../../../app/system/production/CrmScreens.tsx>) | 37–37 |
| `crmRequest` | [app/system/production/CrmScreens.tsx](<../../../app/system/production/CrmScreens.tsx>) | 40–40 |
| `useCrmData` | [app/system/production/CrmScreens.tsx](<../../../app/system/production/CrmScreens.tsx>) | 42–47 |
| `Notice` | [app/system/production/CrmScreens.tsx](<../../../app/system/production/CrmScreens.tsx>) | 48–48 |
| `SearchableSelect` | [app/system/production/CrmScreens.tsx](<../../../app/system/production/CrmScreens.tsx>) | 55–59 |
| `FilterSelect` | [app/system/production/CrmScreens.tsx](<../../../app/system/production/CrmScreens.tsx>) | 60–63 |
| `Fields` | [app/system/production/CrmScreens.tsx](<../../../app/system/production/CrmScreens.tsx>) | 64–66 |
| `Editor` | [app/system/production/CrmScreens.tsx](<../../../app/system/production/CrmScreens.tsx>) | 67–70 |
| `RemoveConfirmation` | [app/system/production/CrmScreens.tsx](<../../../app/system/production/CrmScreens.tsx>) | 71–83 |
| `PageBar` | [app/system/production/CrmScreens.tsx](<../../../app/system/production/CrmScreens.tsx>) | 84–87 |
| `Records` | [app/system/production/CrmScreens.tsx](<../../../app/system/production/CrmScreens.tsx>) | 91–93 |
| `LocalRecords` | [app/system/production/CrmScreens.tsx](<../../../app/system/production/CrmScreens.tsx>) | 94–94 |
| `PipelineBar` | [app/system/production/CrmScreens.tsx](<../../../app/system/production/CrmScreens.tsx>) | 107–113 |
| `AttentionChips` | [app/system/production/CrmScreens.tsx](<../../../app/system/production/CrmScreens.tsx>) | 117–119 |
| `ConversionFunnel` | [app/system/production/CrmScreens.tsx](<../../../app/system/production/CrmScreens.tsx>) | 123–126 |
| `MetricStrip` | [app/system/production/CrmScreens.tsx](<../../../app/system/production/CrmScreens.tsx>) | 128–128 |
| `FactStrip` | [app/system/production/CrmScreens.tsx](<../../../app/system/production/CrmScreens.tsx>) | 131–131 |
| `useOptions` | [app/system/production/CrmScreens.tsx](<../../../app/system/production/CrmScreens.tsx>) | 132–134 |
| `teamOptions` | [app/system/production/CrmScreens.tsx](<../../../app/system/production/CrmScreens.tsx>) | 135–135 |
| `CrmScreen` | [app/system/production/CrmScreens.tsx](<../../../app/system/production/CrmScreens.tsx>) | 137–152 |
| `OpportunityList` | [app/system/production/CrmScreens.tsx](<../../../app/system/production/CrmScreens.tsx>) | 154–204 |
| `OpportunityEditor` | [app/system/production/CrmScreens.tsx](<../../../app/system/production/CrmScreens.tsx>) | 206–210 |
| `ContactQuickAdd` | [app/system/production/CrmScreens.tsx](<../../../app/system/production/CrmScreens.tsx>) | 212–249 |
| `SalesEvidenceFields` | [app/system/production/CrmScreens.tsx](<../../../app/system/production/CrmScreens.tsx>) | 250–256 |
| `OpportunityFields` | [app/system/production/CrmScreens.tsx](<../../../app/system/production/CrmScreens.tsx>) | 258–270 |
| `OpportunityWorkspace` | [app/system/production/CrmScreens.tsx](<../../../app/system/production/CrmScreens.tsx>) | 272–300 |
| `Timeline` | [app/system/production/CrmScreens.tsx](<../../../app/system/production/CrmScreens.tsx>) | 302–302 |
| `ActivityEditor` | [app/system/production/CrmScreens.tsx](<../../../app/system/production/CrmScreens.tsx>) | 303–305 |
| `ActivityReferences` | [app/system/production/CrmScreens.tsx](<../../../app/system/production/CrmScreens.tsx>) | 306–316 |
| `ActivityList` | [app/system/production/CrmScreens.tsx](<../../../app/system/production/CrmScreens.tsx>) | 317–321 |
| `CustomerList` | [app/system/production/CrmScreens.tsx](<../../../app/system/production/CrmScreens.tsx>) | 323–327 |
| `CustomerWorkspace` | [app/system/production/CrmScreens.tsx](<../../../app/system/production/CrmScreens.tsx>) | 328–345 |
| `ContactList` | [app/system/production/CrmScreens.tsx](<../../../app/system/production/CrmScreens.tsx>) | 347–354 |
| `ContactSite` | [app/system/production/CrmScreens.tsx](<../../../app/system/production/CrmScreens.tsx>) | 355–355 |
| `CrmDocuments` | [app/system/production/CrmScreens.tsx](<../../../app/system/production/CrmScreens.tsx>) | 357–361 |
| `Configuration` | [app/system/production/CrmScreens.tsx](<../../../app/system/production/CrmScreens.tsx>) | 362–364 |
| `CrmMyWork` | [app/system/production/CrmScreens.tsx](<../../../app/system/production/CrmScreens.tsx>) | 366–369 |

## Domain helpers / direct dependencies

- [backend-node/src/crm-sales-evidence.ts](<../../../backend-node/src/crm-sales-evidence.ts>)
- [backend-node/src/project-scope.ts](<../../../backend-node/src/project-scope.ts>)
- [backend-node/src/crm.ts](<../../../backend-node/src/crm.ts>)
- [backend-node/src/unified-report-service.ts](<../../../backend-node/src/unified-report-service.ts>)
- [backend-node/src/routes/sales-customers.ts](<../../../backend-node/src/routes/sales-customers.ts>)
- [backend-node/src/document-storage.ts](<../../../backend-node/src/document-storage.ts>)
- [app/system/api-client.ts](<../../../app/system/api-client.ts>)
- [app/system/i18n.ts](<../../../app/system/i18n.ts>)
- [app/system/ui.tsx](<../../../app/system/ui.tsx>)
- [app/system/production/AdminAnalyticsScreens.tsx](<../../../app/system/production/AdminAnalyticsScreens.tsx>)
- [lib/estimate-ux.ts](<../../../lib/estimate-ux.ts>)
- [app/system/segment-filters.css](<../../../app/system/segment-filters.css>)
- [app/system/production/crm.css](<../../../app/system/production/crm.css>)
- [app/system/production/ProjectHandover.tsx](<../../../app/system/production/ProjectHandover.tsx>)
- [app/system/production/crm-copy.ts](<../../../app/system/production/crm-copy.ts>)

## Candidate regression tests

- [tests/crm-contact-field.test.mjs](<../../../tests/crm-contact-field.test.mjs>)
- [tests/crm-i18n.test.mjs](<../../../tests/crm-i18n.test.mjs>)
- [backend-node/tests/crm-removal.test.ts](<../../../backend-node/tests/crm-removal.test.ts>)
- [backend-node/tests/crm-sales-evidence.test.ts](<../../../backend-node/tests/crm-sales-evidence.test.ts>)
- [backend-node/tests/crm.test.ts](<../../../backend-node/tests/crm.test.ts>)

## Client contract lookup

Search the selected API path or function in [app/system/api-client.ts](<../../../app/system/api-client.ts>); follow its screen callers. Common UI/language changes require [app/system/ui.tsx](<../../../app/system/ui.tsx>) and [app/system/i18n.ts](<../../../app/system/i18n.ts>). For SQL changes use [schema map](../SCHEMA.md).
