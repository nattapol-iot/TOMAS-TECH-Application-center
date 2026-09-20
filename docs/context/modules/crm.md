# CRM / Sales

[Context index](../../../AGENTS.md) · [Architecture](../ARCHITECTURE.md) · [Change guide](../WORKFLOW.md)

ลูกค้า Contact Opportunity กิจกรรมและการติดตาม เชื่อม Inquiry และ My Work

Evidence: snapshot `c4a8bb9b`; source map, not a live availability claim. Test candidates use filename matching and are not exhaustive coverage.

## Read only the operation you change

- [crm API and function map](../api/crm.md) — registered in Node app
- [crm-customers API and function map](../api/crm-customers.md) — registered in Node app
- [crm-documents API and function map](../api/crm-documents.md) — registered in Node app

## UI function locator

Shared screens contain other modules: use the symbol and line range instead of reading the whole file.

| Symbol | Source | Lines |
|---|---|---|
| `text` | [app/system/production/CrmScreens.tsx](<../../../app/system/production/CrmScreens.tsx>) | 20–20 |
| `date` | [app/system/production/CrmScreens.tsx](<../../../app/system/production/CrmScreens.tsx>) | 21–21 |
| `futureDate` | [app/system/production/CrmScreens.tsx](<../../../app/system/production/CrmScreens.tsx>) | 22–22 |
| `money` | [app/system/production/CrmScreens.tsx](<../../../app/system/production/CrmScreens.tsx>) | 23–23 |
| `toneFor` | [app/system/production/CrmScreens.tsx](<../../../app/system/production/CrmScreens.tsx>) | 34–34 |
| `crmRequest` | [app/system/production/CrmScreens.tsx](<../../../app/system/production/CrmScreens.tsx>) | 37–37 |
| `useCrmData` | [app/system/production/CrmScreens.tsx](<../../../app/system/production/CrmScreens.tsx>) | 39–44 |
| `Notice` | [app/system/production/CrmScreens.tsx](<../../../app/system/production/CrmScreens.tsx>) | 45–45 |
| `SearchableSelect` | [app/system/production/CrmScreens.tsx](<../../../app/system/production/CrmScreens.tsx>) | 48–52 |
| `FilterSelect` | [app/system/production/CrmScreens.tsx](<../../../app/system/production/CrmScreens.tsx>) | 53–56 |
| `Fields` | [app/system/production/CrmScreens.tsx](<../../../app/system/production/CrmScreens.tsx>) | 57–59 |
| `Editor` | [app/system/production/CrmScreens.tsx](<../../../app/system/production/CrmScreens.tsx>) | 60–63 |
| `PageBar` | [app/system/production/CrmScreens.tsx](<../../../app/system/production/CrmScreens.tsx>) | 64–67 |
| `Records` | [app/system/production/CrmScreens.tsx](<../../../app/system/production/CrmScreens.tsx>) | 71–73 |
| `LocalRecords` | [app/system/production/CrmScreens.tsx](<../../../app/system/production/CrmScreens.tsx>) | 74–74 |
| `PipelineBar` | [app/system/production/CrmScreens.tsx](<../../../app/system/production/CrmScreens.tsx>) | 84–91 |
| `AttentionChips` | [app/system/production/CrmScreens.tsx](<../../../app/system/production/CrmScreens.tsx>) | 95–98 |
| `ConversionFunnel` | [app/system/production/CrmScreens.tsx](<../../../app/system/production/CrmScreens.tsx>) | 102–105 |
| `MetricStrip` | [app/system/production/CrmScreens.tsx](<../../../app/system/production/CrmScreens.tsx>) | 107–107 |
| `FactStrip` | [app/system/production/CrmScreens.tsx](<../../../app/system/production/CrmScreens.tsx>) | 110–110 |
| `useOptions` | [app/system/production/CrmScreens.tsx](<../../../app/system/production/CrmScreens.tsx>) | 111–113 |
| `teamOptions` | [app/system/production/CrmScreens.tsx](<../../../app/system/production/CrmScreens.tsx>) | 114–114 |
| `CrmScreen` | [app/system/production/CrmScreens.tsx](<../../../app/system/production/CrmScreens.tsx>) | 116–131 |
| `OpportunityList` | [app/system/production/CrmScreens.tsx](<../../../app/system/production/CrmScreens.tsx>) | 133–181 |
| `OpportunityEditor` | [app/system/production/CrmScreens.tsx](<../../../app/system/production/CrmScreens.tsx>) | 183–187 |
| `OpportunityFields` | [app/system/production/CrmScreens.tsx](<../../../app/system/production/CrmScreens.tsx>) | 188–194 |
| `OpportunityWorkspace` | [app/system/production/CrmScreens.tsx](<../../../app/system/production/CrmScreens.tsx>) | 196–217 |
| `Timeline` | [app/system/production/CrmScreens.tsx](<../../../app/system/production/CrmScreens.tsx>) | 219–219 |
| `ActivityEditor` | [app/system/production/CrmScreens.tsx](<../../../app/system/production/CrmScreens.tsx>) | 220–222 |
| `ActivityReferences` | [app/system/production/CrmScreens.tsx](<../../../app/system/production/CrmScreens.tsx>) | 223–233 |
| `ActivityList` | [app/system/production/CrmScreens.tsx](<../../../app/system/production/CrmScreens.tsx>) | 234–238 |
| `CustomerList` | [app/system/production/CrmScreens.tsx](<../../../app/system/production/CrmScreens.tsx>) | 240–244 |
| `CustomerWorkspace` | [app/system/production/CrmScreens.tsx](<../../../app/system/production/CrmScreens.tsx>) | 245–262 |
| `ContactList` | [app/system/production/CrmScreens.tsx](<../../../app/system/production/CrmScreens.tsx>) | 264–271 |
| `ContactSite` | [app/system/production/CrmScreens.tsx](<../../../app/system/production/CrmScreens.tsx>) | 272–272 |
| `CrmDocuments` | [app/system/production/CrmScreens.tsx](<../../../app/system/production/CrmScreens.tsx>) | 274–278 |
| `Configuration` | [app/system/production/CrmScreens.tsx](<../../../app/system/production/CrmScreens.tsx>) | 279–281 |
| `CrmMyWork` | [app/system/production/CrmScreens.tsx](<../../../app/system/production/CrmScreens.tsx>) | 283–286 |
| `CrmInquirySource` | [app/system/production/CrmScreens.tsx](<../../../app/system/production/CrmScreens.tsx>) | 288–291 |

## Domain helpers / direct dependencies

- [backend-node/src/project-scope.ts](<../../../backend-node/src/project-scope.ts>)
- [backend-node/src/crm.ts](<../../../backend-node/src/crm.ts>)
- [backend-node/src/unified-report-service.ts](<../../../backend-node/src/unified-report-service.ts>)
- [backend-node/src/routes/sales-customers.ts](<../../../backend-node/src/routes/sales-customers.ts>)
- [backend-node/src/document-storage.ts](<../../../backend-node/src/document-storage.ts>)
- [app/system/api-client.ts](<../../../app/system/api-client.ts>)
- [app/system/i18n.ts](<../../../app/system/i18n.ts>)
- [app/system/ui.tsx](<../../../app/system/ui.tsx>)
- [app/system/production/AdminAnalyticsScreens.tsx](<../../../app/system/production/AdminAnalyticsScreens.tsx>)
- [app/system/production/crm.css](<../../../app/system/production/crm.css>)
- [app/system/production/crm-copy.ts](<../../../app/system/production/crm-copy.ts>)

## Candidate regression tests

- [tests/crm-i18n.test.mjs](<../../../tests/crm-i18n.test.mjs>)
- [backend-node/tests/crm.test.ts](<../../../backend-node/tests/crm.test.ts>)

## Client contract lookup

Search the selected API path or function in [app/system/api-client.ts](<../../../app/system/api-client.ts>); follow its screen callers. Common UI/language changes require [app/system/ui.tsx](<../../../app/system/ui.tsx>) and [app/system/i18n.ts](<../../../app/system/i18n.ts>). For SQL changes use [schema map](../SCHEMA.md).
