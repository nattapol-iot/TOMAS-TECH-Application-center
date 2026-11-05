# CRM / Sales

[Context index](../../../AGENTS.md) · [Architecture](../ARCHITECTURE.md) · [Change guide](../WORKFLOW.md)

ลูกค้า Contact Opportunity กิจกรรมและการติดตาม เชื่อม Inquiry และ My Work

Evidence: snapshot `52ffa4f1`; source map, not a live availability claim. Test candidates use filename matching and are not exhaustive coverage.

## Read only the operation you change

- [crm API and function map](../api/crm.md) — registered in Node app
- [crm-customers API and function map](../api/crm-customers.md) — registered in Node app
- [crm-documents API and function map](../api/crm-documents.md) — registered in Node app

## UI function locator

Shared screens contain other modules: use the symbol and line range instead of reading the whole file.

| Symbol | Source | Lines |
|---|---|---|
| `text` | [app/system/production/CrmScreens.tsx](<../../../app/system/production/CrmScreens.tsx>) | 26–26 |
| `date` | [app/system/production/CrmScreens.tsx](<../../../app/system/production/CrmScreens.tsx>) | 27–27 |
| `futureDate` | [app/system/production/CrmScreens.tsx](<../../../app/system/production/CrmScreens.tsx>) | 28–28 |
| `money` | [app/system/production/CrmScreens.tsx](<../../../app/system/production/CrmScreens.tsx>) | 29–29 |
| `toneFor` | [app/system/production/CrmScreens.tsx](<../../../app/system/production/CrmScreens.tsx>) | 40–40 |
| `crmRequest` | [app/system/production/CrmScreens.tsx](<../../../app/system/production/CrmScreens.tsx>) | 43–43 |
| `useDebounced` | [app/system/production/CrmScreens.tsx](<../../../app/system/production/CrmScreens.tsx>) | 46–46 |
| `useCrmData` | [app/system/production/CrmScreens.tsx](<../../../app/system/production/CrmScreens.tsx>) | 47–52 |
| `Notice` | [app/system/production/CrmScreens.tsx](<../../../app/system/production/CrmScreens.tsx>) | 53–53 |
| `FilterSelect` | [app/system/production/CrmScreens.tsx](<../../../app/system/production/CrmScreens.tsx>) | 64–67 |
| `Fields` | [app/system/production/CrmScreens.tsx](<../../../app/system/production/CrmScreens.tsx>) | 68–70 |
| `Editor` | [app/system/production/CrmScreens.tsx](<../../../app/system/production/CrmScreens.tsx>) | 71–74 |
| `customerFields` | [app/system/production/CrmScreens.tsx](<../../../app/system/production/CrmScreens.tsx>) | 76–76 |
| `ErpLockedNote` | [app/system/production/CrmScreens.tsx](<../../../app/system/production/CrmScreens.tsx>) | 77–77 |
| `RemoveConfirmation` | [app/system/production/CrmScreens.tsx](<../../../app/system/production/CrmScreens.tsx>) | 78–90 |
| `PageBar` | [app/system/production/CrmScreens.tsx](<../../../app/system/production/CrmScreens.tsx>) | 91–94 |
| `Records` | [app/system/production/CrmScreens.tsx](<../../../app/system/production/CrmScreens.tsx>) | 98–100 |
| `DealTable` | [app/system/production/CrmScreens.tsx](<../../../app/system/production/CrmScreens.tsx>) | 103–120 |
| `LocalRecords` | [app/system/production/CrmScreens.tsx](<../../../app/system/production/CrmScreens.tsx>) | 121–121 |
| `PipelineBar` | [app/system/production/CrmScreens.tsx](<../../../app/system/production/CrmScreens.tsx>) | 134–140 |
| `AttentionChips` | [app/system/production/CrmScreens.tsx](<../../../app/system/production/CrmScreens.tsx>) | 144–146 |
| `ConversionFunnel` | [app/system/production/CrmScreens.tsx](<../../../app/system/production/CrmScreens.tsx>) | 150–153 |
| `MetricStrip` | [app/system/production/CrmScreens.tsx](<../../../app/system/production/CrmScreens.tsx>) | 155–155 |
| `FactStrip` | [app/system/production/CrmScreens.tsx](<../../../app/system/production/CrmScreens.tsx>) | 158–158 |
| `useOptions` | [app/system/production/CrmScreens.tsx](<../../../app/system/production/CrmScreens.tsx>) | 159–161 |
| `teamOptions` | [app/system/production/CrmScreens.tsx](<../../../app/system/production/CrmScreens.tsx>) | 163–163 |
| `customerOptions` | [app/system/production/CrmScreens.tsx](<../../../app/system/production/CrmScreens.tsx>) | 164–164 |
| `CrmScreen` | [app/system/production/CrmScreens.tsx](<../../../app/system/production/CrmScreens.tsx>) | 166–184 |
| `OpportunityList` | [app/system/production/CrmScreens.tsx](<../../../app/system/production/CrmScreens.tsx>) | 186–236 |
| `OpportunityEditor` | [app/system/production/CrmScreens.tsx](<../../../app/system/production/CrmScreens.tsx>) | 238–253 |
| `ContactQuickAdd` | [app/system/production/CrmScreens.tsx](<../../../app/system/production/CrmScreens.tsx>) | 255–294 |
| `SalesEvidenceFields` | [app/system/production/CrmScreens.tsx](<../../../app/system/production/CrmScreens.tsx>) | 295–301 |
| `OpportunityFields` | [app/system/production/CrmScreens.tsx](<../../../app/system/production/CrmScreens.tsx>) | 303–346 |
| `OpportunityWorkspace` | [app/system/production/CrmScreens.tsx](<../../../app/system/production/CrmScreens.tsx>) | 348–376 |
| `Timeline` | [app/system/production/CrmScreens.tsx](<../../../app/system/production/CrmScreens.tsx>) | 378–378 |
| `ActivityEditor` | [app/system/production/CrmScreens.tsx](<../../../app/system/production/CrmScreens.tsx>) | 379–381 |
| `ActivityReferences` | [app/system/production/CrmScreens.tsx](<../../../app/system/production/CrmScreens.tsx>) | 382–392 |
| `ActivityList` | [app/system/production/CrmScreens.tsx](<../../../app/system/production/CrmScreens.tsx>) | 393–397 |
| `CustomerList` | [app/system/production/CrmScreens.tsx](<../../../app/system/production/CrmScreens.tsx>) | 399–403 |
| `CustomerWorkspace` | [app/system/production/CrmScreens.tsx](<../../../app/system/production/CrmScreens.tsx>) | 404–421 |
| `ContactList` | [app/system/production/CrmScreens.tsx](<../../../app/system/production/CrmScreens.tsx>) | 423–430 |
| `ContactSite` | [app/system/production/CrmScreens.tsx](<../../../app/system/production/CrmScreens.tsx>) | 431–431 |
| `CrmDocuments` | [app/system/production/CrmScreens.tsx](<../../../app/system/production/CrmScreens.tsx>) | 433–437 |
| `Configuration` | [app/system/production/CrmScreens.tsx](<../../../app/system/production/CrmScreens.tsx>) | 438–440 |
| `CrmMyWork` | [app/system/production/CrmScreens.tsx](<../../../app/system/production/CrmScreens.tsx>) | 442–445 |

## Domain helpers / direct dependencies

- [backend-node/src/crm-sales-evidence.ts](<../../../backend-node/src/crm-sales-evidence.ts>)
- [backend-node/src/project-scope.ts](<../../../backend-node/src/project-scope.ts>)
- [backend-node/src/crm.ts](<../../../backend-node/src/crm.ts>)
- [backend-node/src/unified-report-service.ts](<../../../backend-node/src/unified-report-service.ts>)
- [backend-node/src/routes/sales-customers.ts](<../../../backend-node/src/routes/sales-customers.ts>)
- [backend-node/src/document-storage.ts](<../../../backend-node/src/document-storage.ts>)
- [app/system/screen-link.ts](<../../../app/system/screen-link.ts>)
- [app/system/api-client.ts](<../../../app/system/api-client.ts>)
- [app/system/i18n.ts](<../../../app/system/i18n.ts>)
- [app/system/ui.tsx](<../../../app/system/ui.tsx>)
- [app/system/production/AdminAnalyticsScreens.tsx](<../../../app/system/production/AdminAnalyticsScreens.tsx>)
- [app/system/production/ErpMasterPanel.tsx](<../../../app/system/production/ErpMasterPanel.tsx>)
- [lib/estimate-ux.ts](<../../../lib/estimate-ux.ts>)
- [app/system/segment-filters.css](<../../../app/system/segment-filters.css>)
- [app/system/production/crm.css](<../../../app/system/production/crm.css>)
- [app/system/production/ProjectHandover.tsx](<../../../app/system/production/ProjectHandover.tsx>)
- [app/system/production/SearchSelect.tsx](<../../../app/system/production/SearchSelect.tsx>)
- [app/system/production/crm-copy.ts](<../../../app/system/production/crm-copy.ts>)

## Candidate regression tests

- [tests/crm-contact-field.test.mjs](<../../../tests/crm-contact-field.test.mjs>)
- [tests/crm-i18n.test.mjs](<../../../tests/crm-i18n.test.mjs>)
- [backend-node/tests/crm-removal.test.ts](<../../../backend-node/tests/crm-removal.test.ts>)
- [backend-node/tests/crm-sales-evidence.test.ts](<../../../backend-node/tests/crm-sales-evidence.test.ts>)
- [backend-node/tests/crm.test.ts](<../../../backend-node/tests/crm.test.ts>)

## Client contract lookup

Search the selected API path or function in [app/system/api-client.ts](<../../../app/system/api-client.ts>); follow its screen callers. Common UI/language changes require [app/system/ui.tsx](<../../../app/system/ui.tsx>) and [app/system/i18n.ts](<../../../app/system/i18n.ts>). For SQL changes use [schema map](../SCHEMA.md).
