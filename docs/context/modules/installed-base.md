# Installed Base

[Context index](../../../AGENTS.md) · [Architecture](../ARCHITECTURE.md) · [Change guide](../WORKFLOW.md)

ทะเบียนอุปกรณ์และซอฟต์แวร์ที่ติดตั้งให้ลูกค้า ผูกกับลูกค้า site โครงการ Site Monitor และ TMTHub พร้อมประวัติและประกัน

Evidence: snapshot `cbe55e4b`; source map, not a live availability claim. Test candidates use filename matching and are not exhaustive coverage.

## Read only the operation you change

- [installed-assets API and function map](../api/installed-assets.md) — registered in Node app
- [site-credentials API and function map](../api/site-credentials.md) — registered in Node app

## UI function locator

Shared screens contain other modules: use the symbol and line range instead of reading the whole file.

| Symbol | Source | Lines |
|---|---|---|
| `errorText` | [app/system/production/InstalledBaseScreen.tsx](<../../../app/system/production/InstalledBaseScreen.tsx>) | 35–37 |
| `categoryKey` | [app/system/production/InstalledBaseScreen.tsx](<../../../app/system/production/InstalledBaseScreen.tsx>) | 39–39 |
| `statusKey` | [app/system/production/InstalledBaseScreen.tsx](<../../../app/system/production/InstalledBaseScreen.tsx>) | 40–40 |
| `eventKey` | [app/system/production/InstalledBaseScreen.tsx](<../../../app/system/production/InstalledBaseScreen.tsx>) | 41–41 |
| `readLayout` | [app/system/production/InstalledBaseScreen.tsx](<../../../app/system/production/InstalledBaseScreen.tsx>) | 50–52 |
| `writeLayout` | [app/system/production/InstalledBaseScreen.tsx](<../../../app/system/production/InstalledBaseScreen.tsx>) | 53–55 |
| `groupAssets` | [app/system/production/InstalledBaseScreen.tsx](<../../../app/system/production/InstalledBaseScreen.tsx>) | 64–96 |
| `InstalledBaseScreen` | [app/system/production/InstalledBaseScreen.tsx](<../../../app/system/production/InstalledBaseScreen.tsx>) | 99–273 |
| `CabinetSection` | [app/system/production/InstalledBaseScreen.tsx](<../../../app/system/production/InstalledBaseScreen.tsx>) | 276–313 |
| `AssetTable` | [app/system/production/InstalledBaseScreen.tsx](<../../../app/system/production/InstalledBaseScreen.tsx>) | 315–381 |
| `CabinetEditor` | [app/system/production/InstalledBaseScreen.tsx](<../../../app/system/production/InstalledBaseScreen.tsx>) | 383–448 |
| `AssetDrawer` | [app/system/production/InstalledBaseScreen.tsx](<../../../app/system/production/InstalledBaseScreen.tsx>) | 450–573 |
| `emptyInput` | [app/system/production/InstalledBaseScreen.tsx](<../../../app/system/production/InstalledBaseScreen.tsx>) | 575–582 |
| `inputOf` | [app/system/production/InstalledBaseScreen.tsx](<../../../app/system/production/InstalledBaseScreen.tsx>) | 584–593 |
| `AssetEditor` | [app/system/production/InstalledBaseScreen.tsx](<../../../app/system/production/InstalledBaseScreen.tsx>) | 595–745 |
| `errorText` | [app/system/production/SiteCredentials.tsx](<../../../app/system/production/SiteCredentials.tsx>) | 18–20 |
| `AssetCredentials` | [app/system/production/SiteCredentials.tsx](<../../../app/system/production/SiteCredentials.tsx>) | 26–153 |
| `CredentialEditor` | [app/system/production/SiteCredentials.tsx](<../../../app/system/production/SiteCredentials.tsx>) | 155–232 |
| `AccessLogModal` | [app/system/production/SiteCredentials.tsx](<../../../app/system/production/SiteCredentials.tsx>) | 234–265 |

## Domain helpers / direct dependencies

- [backend-node/src/business-date.ts](<../../../backend-node/src/business-date.ts>)
- [backend-node/src/installed-base.ts](<../../../backend-node/src/installed-base.ts>)
- [backend-node/src/credential-vault.ts](<../../../backend-node/src/credential-vault.ts>)
- [backend-node/src/project-scope.ts](<../../../backend-node/src/project-scope.ts>)
- [backend-node/src/schedule-service.ts](<../../../backend-node/src/schedule-service.ts>)
- [app/system/screen-link.ts](<../../../app/system/screen-link.ts>)
- [app/system/api-client.ts](<../../../app/system/api-client.ts>)
- [app/system/i18n.ts](<../../../app/system/i18n.ts>)
- [app/system/production/SiteCredentials.tsx](<../../../app/system/production/SiteCredentials.tsx>)
- [app/system/LocalizedText.tsx](<../../../app/system/LocalizedText.tsx>)
- [app/system/ui.tsx](<../../../app/system/ui.tsx>)

## Candidate regression tests

- [backend-node/tests/installed-base.test.ts](<../../../backend-node/tests/installed-base.test.ts>)

## Client contract lookup

Search the selected API path or function in [app/system/api-client.ts](<../../../app/system/api-client.ts>); follow its screen callers. Common UI/language changes require [app/system/ui.tsx](<../../../app/system/ui.tsx>) and [app/system/i18n.ts](<../../../app/system/i18n.ts>). For SQL changes use [schema map](../SCHEMA.md).
