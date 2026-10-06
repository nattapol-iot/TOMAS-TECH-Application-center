# CRM / Sales

[Context index](../../../AGENTS.md) · [Architecture](../ARCHITECTURE.md) · [Change guide](../WORKFLOW.md)

ลูกค้า Contact Opportunity กิจกรรมและการติดตาม เชื่อม Inquiry และ My Work

Evidence: snapshot `d3966892`; source map, not a live availability claim. Test candidates use filename matching and are not exhaustive coverage.

## Read only the operation you change

- [crm API and function map](../api/crm.md) — registered in Node app
- [crm-customers API and function map](../api/crm-customers.md) — registered in Node app
- [crm-documents API and function map](../api/crm-documents.md) — registered in Node app

## UI function locator

Shared screens contain other modules: use the symbol and line range instead of reading the whole file.

| Symbol | Source | Lines |
|---|---|---|
| `text` | [app/system/production/CrmScreens.tsx](<../../../app/system/production/CrmScreens.tsx>) | 22–22 |
| `date` | [app/system/production/CrmScreens.tsx](<../../../app/system/production/CrmScreens.tsx>) | 23–23 |
| `futureDate` | [app/system/production/CrmScreens.tsx](<../../../app/system/production/CrmScreens.tsx>) | 24–24 |
| `money` | [app/system/production/CrmScreens.tsx](<../../../app/system/production/CrmScreens.tsx>) | 25–25 |
| `toneFor` | [app/system/production/CrmScreens.tsx](<../../../app/system/production/CrmScreens.tsx>) | 36–36 |
| `crmRequest` | [app/system/production/CrmScreens.tsx](<../../../app/system/production/CrmScreens.tsx>) | 39–39 |
| `useCrmData` | [app/system/production/CrmScreens.tsx](<../../../app/system/production/CrmScreens.tsx>) | 41–46 |
| `Notice` | [app/system/production/CrmScreens.tsx](<../../../app/system/production/CrmScreens.tsx>) | 47–47 |
| `SearchableSelect` | [app/system/production/CrmScreens.tsx](<../../../app/system/production/CrmScreens.tsx>) | 50–54 |
| `FilterSelect` | [app/system/production/CrmScreens.tsx](<../../../app/system/production/CrmScreens.tsx>) | 55–58 |
| `Fields` | [app/system/production/CrmScreens.tsx](<../../../app/system/production/CrmScreens.tsx>) | 59–61 |
| `Editor` | [app/system/production/CrmScreens.tsx](<../../../app/system/production/CrmScreens.tsx>) | 62–65 |
| `RemoveConfirmation` | [app/system/production/CrmScreens.tsx](<../../../app/system/production/CrmScreens.tsx>) | 66–78 |
| `PageBar` | [app/system/production/CrmScreens.tsx](<../../../app/system/production/CrmScreens.tsx>) | 79–82 |
| `Records` | [app/system/production/CrmScreens.tsx](<../../../app/system/production/CrmScreens.tsx>) | 86–88 |
| `LocalRecords` | [app/system/production/CrmScreens.tsx](<../../../app/system/production/CrmScreens.tsx>) | 89–89 |
| `PipelineBar` | [app/system/production/CrmScreens.tsx](<../../../app/system/production/CrmScreens.tsx>) | 99–106 |
| `AttentionChips` | [app/system/production/CrmScreens.tsx](<../../../app/system/production/CrmScreens.tsx>) | 110–113 |
| `ConversionFunnel` | [app/system/production/CrmScreens.tsx](<../../../app/system/production/CrmScreens.tsx>) | 117–120 |
| `MetricStrip` | [app/system/production/CrmScreens.tsx](<../../../app/system/production/CrmScreens.tsx>) | 122–122 |
| `FactStrip` | [app/system/production/CrmScreens.tsx](<../../../app/system/production/CrmScreens.tsx>) | 125–125 |
| `useOptions` | [app/system/production/CrmScreens.tsx](<../../../app/system/production/CrmScreens.tsx>) | 126–128 |
| `teamOptions` | [app/system/production/CrmScreens.tsx](<../../../app/system/production/CrmScreens.tsx>) | 129–129 |
| `CrmScreen` | [app/system/production/CrmScreens.tsx](<../../../app/system/production/CrmScreens.tsx>) | 131–146 |
| `OpportunityList` | [app/system/production/CrmScreens.tsx](<../../../app/system/production/CrmScreens.tsx>) | 148–198 |
| `OpportunityEditor` | [app/system/production/CrmScreens.tsx](<../../../app/system/production/CrmScreens.tsx>) | 200–204 |
| `SalesEvidenceFields` | [app/system/production/CrmScreens.tsx](<../../../app/system/production/CrmScreens.tsx>) | 205–211 |
| `OpportunityFields` | [app/system/production/CrmScreens.tsx](<../../../app/system/production/CrmScreens.tsx>) | 213–219 |
| `OpportunityWorkspace` | [app/system/production/CrmScreens.tsx](<../../../app/system/production/CrmScreens.tsx>) | 221–249 |
| `Timeline` | [app/system/production/CrmScreens.tsx](<../../../app/system/production/CrmScreens.tsx>) | 251–251 |
| `ActivityEditor` | [app/system/production/CrmScreens.tsx](<../../../app/system/production/CrmScreens.tsx>) | 252–254 |
| `ActivityReferences` | [app/system/production/CrmScreens.tsx](<../../../app/system/production/CrmScreens.tsx>) | 255–265 |
| `ActivityList` | [app/system/production/CrmScreens.tsx](<../../../app/system/production/CrmScreens.tsx>) | 266–270 |
| `CustomerList` | [app/system/production/CrmScreens.tsx](<../../../app/system/production/CrmScreens.tsx>) | 272–276 |
| `CustomerWorkspace` | [app/system/production/CrmScreens.tsx](<../../../app/system/production/CrmScreens.tsx>) | 277–294 |
| `ContactList` | [app/system/production/CrmScreens.tsx](<../../../app/system/production/CrmScreens.tsx>) | 296–303 |
| `ContactSite` | [app/system/production/CrmScreens.tsx](<../../../app/system/production/CrmScreens.tsx>) | 304–304 |
| `CrmDocuments` | [app/system/production/CrmScreens.tsx](<../../../app/system/production/CrmScreens.tsx>) | 306–310 |
| `Configuration` | [app/system/production/CrmScreens.tsx](<../../../app/system/production/CrmScreens.tsx>) | 311–313 |
| `CrmMyWork` | [app/system/production/CrmScreens.tsx](<../../../app/system/production/CrmScreens.tsx>) | 315–318 |

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
- [app/system/production/crm.css](<../../../app/system/production/crm.css>)
- [app/system/production/ProjectHandover.tsx](<../../../app/system/production/ProjectHandover.tsx>)
- [app/system/production/crm-copy.ts](<../../../app/system/production/crm-copy.ts>)

## Candidate regression tests

- [tests/crm-i18n.test.mjs](<../../../tests/crm-i18n.test.mjs>)
- [backend-node/tests/crm-removal.test.ts](<../../../backend-node/tests/crm-removal.test.ts>)
- [backend-node/tests/crm-sales-evidence.test.ts](<../../../backend-node/tests/crm-sales-evidence.test.ts>)
- [backend-node/tests/crm.test.ts](<../../../backend-node/tests/crm.test.ts>)

## Client contract lookup

Search the selected API path or function in [app/system/api-client.ts](<../../../app/system/api-client.ts>); follow its screen callers. Common UI/language changes require [app/system/ui.tsx](<../../../app/system/ui.tsx>) and [app/system/i18n.ts](<../../../app/system/i18n.ts>). For SQL changes use [schema map](../SCHEMA.md).
