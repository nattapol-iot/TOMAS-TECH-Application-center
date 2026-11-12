# Installed Base

[Context index](../../../AGENTS.md) · [Architecture](../ARCHITECTURE.md) · [Change guide](../WORKFLOW.md)

ทะเบียนอุปกรณ์และซอฟต์แวร์ที่ติดตั้งให้ลูกค้า ผูกกับลูกค้า site โครงการ Site Monitor และ TMTHub พร้อมประวัติและประกัน

Evidence: snapshot `781d8326`; source map, not a live availability claim. Test candidates use filename matching and are not exhaustive coverage.

## Read only the operation you change

- [installed-assets API and function map](../api/installed-assets.md) — registered in Node app
- [site-credentials API and function map](../api/site-credentials.md) — registered in Node app

## UI function locator

Shared screens contain other modules: use the symbol and line range instead of reading the whole file.

| Symbol | Source | Lines |
|---|---|---|
| `errorText` | [app/system/production/InstalledBaseScreen.tsx](<../../../app/system/production/InstalledBaseScreen.tsx>) | 37–39 |
| `categoryKey` | [app/system/production/InstalledBaseScreen.tsx](<../../../app/system/production/InstalledBaseScreen.tsx>) | 41–41 |
| `statusKey` | [app/system/production/InstalledBaseScreen.tsx](<../../../app/system/production/InstalledBaseScreen.tsx>) | 42–42 |
| `eventKey` | [app/system/production/InstalledBaseScreen.tsx](<../../../app/system/production/InstalledBaseScreen.tsx>) | 43–43 |
| `readLayout` | [app/system/production/InstalledBaseScreen.tsx](<../../../app/system/production/InstalledBaseScreen.tsx>) | 52–54 |
| `writeLayout` | [app/system/production/InstalledBaseScreen.tsx](<../../../app/system/production/InstalledBaseScreen.tsx>) | 55–57 |
| `groupAssets` | [app/system/production/InstalledBaseScreen.tsx](<../../../app/system/production/InstalledBaseScreen.tsx>) | 66–98 |
| `InstalledBaseScreen` | [app/system/production/InstalledBaseScreen.tsx](<../../../app/system/production/InstalledBaseScreen.tsx>) | 101–275 |
| `CabinetSection` | [app/system/production/InstalledBaseScreen.tsx](<../../../app/system/production/InstalledBaseScreen.tsx>) | 278–315 |
| `AssetTable` | [app/system/production/InstalledBaseScreen.tsx](<../../../app/system/production/InstalledBaseScreen.tsx>) | 317–383 |
| `CabinetEditor` | [app/system/production/InstalledBaseScreen.tsx](<../../../app/system/production/InstalledBaseScreen.tsx>) | 385–450 |
| `AssetDrawer` | [app/system/production/InstalledBaseScreen.tsx](<../../../app/system/production/InstalledBaseScreen.tsx>) | 452–575 |
| `emptyInput` | [app/system/production/InstalledBaseScreen.tsx](<../../../app/system/production/InstalledBaseScreen.tsx>) | 577–584 |
| `inputOf` | [app/system/production/InstalledBaseScreen.tsx](<../../../app/system/production/InstalledBaseScreen.tsx>) | 586–595 |
| `AssetEditor` | [app/system/production/InstalledBaseScreen.tsx](<../../../app/system/production/InstalledBaseScreen.tsx>) | 597–747 |
| `errorText` | [app/system/production/SiteCredentials.tsx](<../../../app/system/production/SiteCredentials.tsx>) | 19–21 |
| `AssetCredentials` | [app/system/production/SiteCredentials.tsx](<../../../app/system/production/SiteCredentials.tsx>) | 27–154 |
| `CredentialEditor` | [app/system/production/SiteCredentials.tsx](<../../../app/system/production/SiteCredentials.tsx>) | 156–233 |
| `AccessLogModal` | [app/system/production/SiteCredentials.tsx](<../../../app/system/production/SiteCredentials.tsx>) | 235–266 |

## Domain helpers / direct dependencies

- [backend-node/src/business-date.ts](<../../../backend-node/src/business-date.ts>)
- [backend-node/src/installed-base.ts](<../../../backend-node/src/installed-base.ts>)
- [backend-node/src/credential-vault.ts](<../../../backend-node/src/credential-vault.ts>)
- [backend-node/src/project-scope.ts](<../../../backend-node/src/project-scope.ts>)
- [backend-node/src/schedule-service.ts](<../../../backend-node/src/schedule-service.ts>)
- [app/system/dialogs.ts](<../../../app/system/dialogs.ts>)
- [app/system/screen-link.ts](<../../../app/system/screen-link.ts>)
- [app/system/api-client.ts](<../../../app/system/api-client.ts>)
- [app/system/i18n.ts](<../../../app/system/i18n.ts>)
- [app/system/production/SiteCredentials.tsx](<../../../app/system/production/SiteCredentials.tsx>)
- [app/system/LocalizedText.tsx](<../../../app/system/LocalizedText.tsx>)
- [app/system/ui.tsx](<../../../app/system/ui.tsx>)
- [app/system/DateInput.tsx](<../../../app/system/DateInput.tsx>)

## Candidate regression tests

- [backend-node/tests/installed-base.test.ts](<../../../backend-node/tests/installed-base.test.ts>)

## Client contract lookup

Search the selected API path or function in [app/system/api-client.ts](<../../../app/system/api-client.ts>); follow its screen callers. Common UI/language changes require [app/system/ui.tsx](<../../../app/system/ui.tsx>) and [app/system/i18n.ts](<../../../app/system/i18n.ts>). For SQL changes use [schema map](../SCHEMA.md).
