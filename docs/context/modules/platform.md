# Platform / Health / Storage

[Context index](../../../AGENTS.md) · [Architecture](../ARCHITECTURE.md) · [Change guide](../WORKFLOW.md)

config database migration authentication และ document storage

Evidence: snapshot `dff9a24`; source map, not a live availability claim. Test candidates use filename matching and are not exhaustive coverage.

## Read only the operation you change

- [health API and function map](../api/health.md) — registered in Node app

## UI function locator

Shared screens contain other modules: use the symbol and line range instead of reading the whole file.

| Symbol | Source | Lines |
|---|---|---|


## Domain helpers / direct dependencies

- [backend-node/src/migration-validation.ts](<../../../backend-node/src/migration-validation.ts>)

## Candidate regression tests

- [tests/network-origin.test.mjs](<../../../tests/network-origin.test.mjs>)
- [backend-node/tests/audit.test.ts](<../../../backend-node/tests/audit.test.ts>)
- [backend-node/tests/database-read-only.test.ts](<../../../backend-node/tests/database-read-only.test.ts>)
- [backend-node/tests/http.test.ts](<../../../backend-node/tests/http.test.ts>)
- [backend-node/tests/migration-validation.test.ts](<../../../backend-node/tests/migration-validation.test.ts>)
- [backend-node/tests/startup-migrations.test.ts](<../../../backend-node/tests/startup-migrations.test.ts>)

## Client contract lookup

Search the selected API path or function in [app/system/api-client.ts](<../../../app/system/api-client.ts>); follow its screen callers. Common UI/language changes require [app/system/ui.tsx](<../../../app/system/ui.tsx>) and [app/system/i18n.ts](<../../../app/system/i18n.ts>). For SQL changes use [schema map](../SCHEMA.md).
