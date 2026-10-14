# Installed Base

[Context index](../../../AGENTS.md) · [Architecture](../ARCHITECTURE.md) · [Change guide](../WORKFLOW.md)

ทะเบียนอุปกรณ์และซอฟต์แวร์ที่ติดตั้งให้ลูกค้า ผูกกับลูกค้า site โครงการ Site Monitor และ TMTHub พร้อมประวัติและประกัน

Evidence: snapshot `3dd32917`; source map, not a live availability claim. Test candidates use filename matching and are not exhaustive coverage.

## Read only the operation you change

- [installed-assets API and function map](../api/installed-assets.md) — registered in Node app
- [site-credentials API and function map](../api/site-credentials.md) — registered in Node app

## UI function locator

Shared screens contain other modules: use the symbol and line range instead of reading the whole file.

| Symbol | Source | Lines |
|---|---|---|
| `errorText` | [app/system/production/InstalledBaseScreen.tsx](<../../../app/system/production/InstalledBaseScreen.tsx>) | 31–33 |
| `categoryKey` | [app/system/production/InstalledBaseScreen.tsx](<../../../app/system/production/InstalledBaseScreen.tsx>) | 35–35 |
| `statusKey` | [app/system/production/InstalledBaseScreen.tsx](<../../../app/system/production/InstalledBaseScreen.tsx>) | 36–36 |
| `eventKey` | [app/system/production/InstalledBaseScreen.tsx](<../../../app/system/production/InstalledBaseScreen.tsx>) | 37–37 |
| `InstalledBaseScreen` | [app/system/production/InstalledBaseScreen.tsx](<../../../app/system/production/InstalledBaseScreen.tsx>) | 40–201 |
| `AssetDrawer` | [app/system/production/InstalledBaseScreen.tsx](<../../../app/system/production/InstalledBaseScreen.tsx>) | 203–325 |
| `emptyInput` | [app/system/production/InstalledBaseScreen.tsx](<../../../app/system/production/InstalledBaseScreen.tsx>) | 327–333 |
| `inputOf` | [app/system/production/InstalledBaseScreen.tsx](<../../../app/system/production/InstalledBaseScreen.tsx>) | 335–343 |
| `AssetEditor` | [app/system/production/InstalledBaseScreen.tsx](<../../../app/system/production/InstalledBaseScreen.tsx>) | 345–477 |
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
- [app/system/api-client.ts](<../../../app/system/api-client.ts>)
- [app/system/i18n.ts](<../../../app/system/i18n.ts>)
- [app/system/production/SiteCredentials.tsx](<../../../app/system/production/SiteCredentials.tsx>)
- [app/system/LocalizedText.tsx](<../../../app/system/LocalizedText.tsx>)
- [app/system/ui.tsx](<../../../app/system/ui.tsx>)

## Candidate regression tests

- [backend-node/tests/installed-base.test.ts](<../../../backend-node/tests/installed-base.test.ts>)

## Client contract lookup

Search the selected API path or function in [app/system/api-client.ts](<../../../app/system/api-client.ts>); follow its screen callers. Common UI/language changes require [app/system/ui.tsx](<../../../app/system/ui.tsx>) and [app/system/i18n.ts](<../../../app/system/i18n.ts>). For SQL changes use [schema map](../SCHEMA.md).
