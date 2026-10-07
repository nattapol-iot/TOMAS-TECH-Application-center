# CRM / Sales

[Context index](../../../AGENTS.md) · [Architecture](../ARCHITECTURE.md) · [Change guide](../WORKFLOW.md)

ลูกค้า Contact Opportunity กิจกรรมและการติดตาม เชื่อม Inquiry และ My Work

Evidence: snapshot `c580425a`; source map, not a live availability claim. Test candidates use filename matching and are not exhaustive coverage.

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
| `SearchableSelect` | [app/system/production/CrmScreens.tsx](<../../../app/system/production/CrmScreens.tsx>) | 51–55 |
| `FilterSelect` | [app/system/production/CrmScreens.tsx](<../../../app/system/production/CrmScreens.tsx>) | 56–59 |
| `Fields` | [app/system/production/CrmScreens.tsx](<../../../app/system/production/CrmScreens.tsx>) | 60–62 |
| `Editor` | [app/system/production/CrmScreens.tsx](<../../../app/system/production/CrmScreens.tsx>) | 63–66 |
| `RemoveConfirmation` | [app/system/production/CrmScreens.tsx](<../../../app/system/production/CrmScreens.tsx>) | 67–79 |
| `PageBar` | [app/system/production/CrmScreens.tsx](<../../../app/system/production/CrmScreens.tsx>) | 80–83 |
| `Records` | [app/system/production/CrmScreens.tsx](<../../../app/system/production/CrmScreens.tsx>) | 87–89 |
| `LocalRecords` | [app/system/production/CrmScreens.tsx](<../../../app/system/production/CrmScreens.tsx>) | 90–90 |
| `PipelineBar` | [app/system/production/CrmScreens.tsx](<../../../app/system/production/CrmScreens.tsx>) | 103–109 |
| `AttentionChips` | [app/system/production/CrmScreens.tsx](<../../../app/system/production/CrmScreens.tsx>) | 113–115 |
| `ConversionFunnel` | [app/system/production/CrmScreens.tsx](<../../../app/system/production/CrmScreens.tsx>) | 119–122 |
| `MetricStrip` | [app/system/production/CrmScreens.tsx](<../../../app/system/production/CrmScreens.tsx>) | 124–124 |
| `FactStrip` | [app/system/production/CrmScreens.tsx](<../../../app/system/production/CrmScreens.tsx>) | 127–127 |
| `useOptions` | [app/system/production/CrmScreens.tsx](<../../../app/system/production/CrmScreens.tsx>) | 128–130 |
| `teamOptions` | [app/system/production/CrmScreens.tsx](<../../../app/system/production/CrmScreens.tsx>) | 131–131 |
| `CrmScreen` | [app/system/production/CrmScreens.tsx](<../../../app/system/production/CrmScreens.tsx>) | 133–148 |
| `OpportunityList` | [app/system/production/CrmScreens.tsx](<../../../app/system/production/CrmScreens.tsx>) | 150–200 |
| `OpportunityEditor` | [app/system/production/CrmScreens.tsx](<../../../app/system/production/CrmScreens.tsx>) | 202–206 |
| `SalesEvidenceFields` | [app/system/production/CrmScreens.tsx](<../../../app/system/production/CrmScreens.tsx>) | 207–213 |
| `OpportunityFields` | [app/system/production/CrmScreens.tsx](<../../../app/system/production/CrmScreens.tsx>) | 215–221 |
| `OpportunityWorkspace` | [app/system/production/CrmScreens.tsx](<../../../app/system/production/CrmScreens.tsx>) | 223–251 |
| `Timeline` | [app/system/production/CrmScreens.tsx](<../../../app/system/production/CrmScreens.tsx>) | 253–253 |
| `ActivityEditor` | [app/system/production/CrmScreens.tsx](<../../../app/system/production/CrmScreens.tsx>) | 254–256 |
| `ActivityReferences` | [app/system/production/CrmScreens.tsx](<../../../app/system/production/CrmScreens.tsx>) | 257–267 |
| `ActivityList` | [app/system/production/CrmScreens.tsx](<../../../app/system/production/CrmScreens.tsx>) | 268–272 |
| `CustomerList` | [app/system/production/CrmScreens.tsx](<../../../app/system/production/CrmScreens.tsx>) | 274–278 |
| `CustomerWorkspace` | [app/system/production/CrmScreens.tsx](<../../../app/system/production/CrmScreens.tsx>) | 279–296 |
| `ContactList` | [app/system/production/CrmScreens.tsx](<../../../app/system/production/CrmScreens.tsx>) | 298–305 |
| `ContactSite` | [app/system/production/CrmScreens.tsx](<../../../app/system/production/CrmScreens.tsx>) | 306–306 |
| `CrmDocuments` | [app/system/production/CrmScreens.tsx](<../../../app/system/production/CrmScreens.tsx>) | 308–312 |
| `Configuration` | [app/system/production/CrmScreens.tsx](<../../../app/system/production/CrmScreens.tsx>) | 313–315 |
| `CrmMyWork` | [app/system/production/CrmScreens.tsx](<../../../app/system/production/CrmScreens.tsx>) | 317–320 |

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

- [tests/crm-i18n.test.mjs](<../../../tests/crm-i18n.test.mjs>)
- [backend-node/tests/crm-removal.test.ts](<../../../backend-node/tests/crm-removal.test.ts>)
- [backend-node/tests/crm-sales-evidence.test.ts](<../../../backend-node/tests/crm-sales-evidence.test.ts>)
- [backend-node/tests/crm.test.ts](<../../../backend-node/tests/crm.test.ts>)

## Client contract lookup

Search the selected API path or function in [app/system/api-client.ts](<../../../app/system/api-client.ts>); follow its screen callers. Common UI/language changes require [app/system/ui.tsx](<../../../app/system/ui.tsx>) and [app/system/i18n.ts](<../../../app/system/i18n.ts>). For SQL changes use [schema map](../SCHEMA.md).
