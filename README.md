# IoT Team Center

Internal engineering operations application for TOMAS TECH. Structured business data lives in SQL Server; the browser uses the authenticated API. Internal cost is distinct from selling price and profit margin.

## Current status - 2026-09-10

**Production readiness is not yet approved.** This is the isolated main-based integration candidate. Local implementation, historical Team Test releases and live Production are different evidence states. See the candidate record below for current validation; earlier audit results describe the source worktree before integration.

Start with the [documentation hub](docs/README.md), [current audit](docs/audits/production-readiness-2026-09-10.md), [production backlog](docs/planning/PRODUCTION_BACKLOG.md), and [feature register](docs/planning/FEATURE_REGISTER.md).

## Architecture evidenced in this checkout

React 19 + TypeScript + vinext/Vite frontend -> Node.js/TypeScript Fastify API in backend-node -> SQL Server. Document bytes use the configured API storage; deployment must verify the actual local/NAS destination and service identity.

- [ProductionApp](app/system/ProductionApp.tsx) composes the permission-filtered application screens.
- [Node API](backend-node/README.md) is the current native API implementation; [app registration](backend-node/src/app.ts) shows the active route modules.
- [Database migrations](database/migrations) and [fresh runner](database/scripts/020_deploy_fresh_database.sql) define repository schema requirements: main's 037 report exports, 038 quotation lines and 039 NAS settings; 040 overhead; 041 role management. Startup/readiness checks exact required identities. A legacy database that recorded role management as 037 is blocked pending target-specific reconciliation.
- backend/ contains the earlier ASP.NET Core API. backend-php/ and worker/ are retained paths, not evidence that they are active production dependencies. CI now checks the Node API typecheck/unit/build and Node Docker image; the legacy .NET material-flow SQL wrapper remains explicitly labeled and does not replace Node SQL acceptance.
- Existing .openai, Vercel and local Team Test configuration does not establish which environment is the production target.

## Working safely

Read [documentation governance](docs/README.md), [DESIGN](DESIGN.md), and [COORDINATION](COORDINATION.md) before changing shared files. Historical IPs/PIDs/branch claims in coordination must be revalidated. FEATURES.md is the legacy/full-target domain specification, not a release checklist.

Use an isolated checkout for builds and release validation. Do not build into a dist directory used by a running frontend. Keep feature changes together with their tests, migrations and documentation; preserve unrelated dirty work.

## Local verification

Node >=22.13.0 is required by package manifests. Use npm.cmd instead of npm on Windows when PowerShell blocks npm.ps1.

~~~powershell
# Frontend static checks
npm.cmd run lint
npm.cmd run typecheck
# Explicitly skip SQL integration for a source-only review:
$env:IOT_SKIP_SQL_INTEGRATION = '1'
node --test --test-isolation=none tests/*.test.mjs
# Node API (run within backend-node)
npm.cmd run typecheck
npm.cmd test
~~~

Root checks exclude temporary/generated/nested checkout paths in this candidate. Passing unit tests alone does not prove SQL, browser UAT or Production readiness. Required Node SQL integration must run without skipping on an isolated release candidate.

## Deployment and history

Follow the [release control gate](docs/operations/RELEASE_CONTROL.md). The [older production guide](docs/PRODUCTION_DEPLOYMENT.md) still contains .NET/IIS procedures and must not be used as a verified Node deployment guide. Entra/HTTPS, database grants, schema compatibility, storage, monitoring and restore/rollback evidence remain release requirements.

The [previous README](docs/archive/README-before-2026-09-10.md) is preserved for history. [Document relocation manifest](docs/archive/document-map-2026-09-10.md) maps previous document paths to canonical files.

## Main-based integration candidate

This isolated checkout combines main d43eb346 with the preserved source snapshot672f1d0. Main features include TMT ID login, NAS settings, quotation PDF parsing and report exports. The integration must retain Performance Pulse, user-role management and local Estimate enhancements. No deployment has been performed. See [candidate integration record](docs/planning/CANDIDATE_INTEGRATION.md) and [Mac host handoff](docs/MACMINI_HANDOFF.md).
