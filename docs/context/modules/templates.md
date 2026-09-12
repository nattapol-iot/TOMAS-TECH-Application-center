# Module Templates

[Context index](../../../AGENTS.md) · [Architecture](../ARCHITECTURE.md) · [Change guide](../WORKFLOW.md)

สร้าง template โมดูลและนำเข้า estimate

Evidence: snapshot `e867e48e`; source map, not a live availability claim. Test candidates use filename matching and are not exhaustive coverage.

## Read only the operation you change

- [module-templates API and function map](../api/module-templates.md) — registered in Node app

## UI function locator

Shared screens contain other modules: use the symbol and line range instead of reading the whole file.

| Symbol | Source | Lines |
|---|---|---|
| `priceAgeInDays` | [app/system/production/ModuleTemplateScreens.tsx](<../../../app/system/production/ModuleTemplateScreens.tsx>) | 40–40 |
| `formatMoney` | [app/system/production/ModuleTemplateScreens.tsx](<../../../app/system/production/ModuleTemplateScreens.tsx>) | 41–41 |
| `formatDate` | [app/system/production/ModuleTemplateScreens.tsx](<../../../app/system/production/ModuleTemplateScreens.tsx>) | 42–42 |
| `formatUpdated` | [app/system/production/ModuleTemplateScreens.tsx](<../../../app/system/production/ModuleTemplateScreens.tsx>) | 43–43 |
| `toError` | [app/system/production/ModuleTemplateScreens.tsx](<../../../app/system/production/ModuleTemplateScreens.tsx>) | 44–44 |
| `ProductionModuleTemplates` | [app/system/production/ModuleTemplateScreens.tsx](<../../../app/system/production/ModuleTemplateScreens.tsx>) | 46–253 |
| `money` | [app/system/production/ModuleTemplateEditor.tsx](<../../../app/system/production/ModuleTemplateEditor.tsx>) | 14–14 |
| `newLine` | [app/system/production/ModuleTemplateEditor.tsx](<../../../app/system/production/ModuleTemplateEditor.tsx>) | 15–15 |
| `ModuleTemplateEditor` | [app/system/production/ModuleTemplateEditor.tsx](<../../../app/system/production/ModuleTemplateEditor.tsx>) | 17–110 |

## Domain helpers / direct dependencies

- [app/system/i18n.ts](<../../../app/system/i18n.ts>)
- [app/system/LocalizedText.tsx](<../../../app/system/LocalizedText.tsx>)
- [app/system/production/module-templates.css](<../../../app/system/production/module-templates.css>)
- [app/system/production/ModuleTemplateEditor.tsx](<../../../app/system/production/ModuleTemplateEditor.tsx>)
- [app/system/api-client.ts](<../../../app/system/api-client.ts>)
- [app/system/ui.tsx](<../../../app/system/ui.tsx>)
- [lib/cost-item-validation.ts](<../../../lib/cost-item-validation.ts>)
- [app/system/production/CostItemFields.tsx](<../../../app/system/production/CostItemFields.tsx>)

## Candidate regression tests

- [tests/estimate-template-selection.test.mjs](<../../../tests/estimate-template-selection.test.mjs>)
- [backend-node/tests/module-template-contract.test.ts](<../../../backend-node/tests/module-template-contract.test.ts>)

## Client contract lookup

Search the selected API path or function in [app/system/api-client.ts](<../../../app/system/api-client.ts>); follow its screen callers. Common UI/language changes require [app/system/ui.tsx](<../../../app/system/ui.tsx>) and [app/system/i18n.ts](<../../../app/system/i18n.ts>). For SQL changes use [schema map](../SCHEMA.md).
