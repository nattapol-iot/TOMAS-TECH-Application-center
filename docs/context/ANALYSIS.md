# Context analysis

[Context index](../../AGENTS.md)

## Question

How can an AI discover the app's features, architecture and relevant functions without loading the entire repository documentation?

## Ranked synthesis

| Rank | Finding | Confidence | Basis |
|---|---|---|---|
| 1 | Route registration and ProductionApp imports are the most useful entry maps | High | backend-node/src/app.ts and app/system/ProductionApp.tsx |
| 2 | A module card needs function-level locators because several domains share screen files | High | CoreScreens, PlanningPricingScreens, MaterialScreens, AdminAnalyticsScreens |
| 3 | Historical planning/release text should be loaded on demand | High | README and docs/README retain candidate/local-only status from September 10 while later deployment evidence exists |
| 4 | Three-level context should reduce irrelevant reading | Medium | Design inference; no measured token benchmark |

## Evidence

- [ProductionApp](../../app/system/ProductionApp.tsx): real screen composition and NAV permissions.
- [Fastify app](../../backend-node/src/app.ts): route registration, request middleware and database read-only gate.
- [Copy handler](../../backend-node/src/routes/estimate-copy.ts): transaction, source and assignment preservation and live internal rate resolution.
- [Package scripts](../../package.json): authoritative verification commands.
- [Compose](../../docker-compose.dev.yml): Node API, document volume and frontend development-server command.
- [Deploy](../../.github/workflows/deploy.yml): main push trigger. [CI](../../.github/workflows/ci.yml) has separate filters.

## Inference

Use root index → module → function/API card. Keep route/function inventory generated and architecture/workflow guidance curated. This reduces duplicated summaries while providing exact source entry points.

## Unknowns / limits

This documentation audit does not certify every feature, deployment configuration or business role requirement. No token savings percentage is claimed. Generated endpoint and SQL scans have documented limitations. Earlier test/deployment results are historical evidence; no new application tests or deployment are implied by generating these files.

## Maintenance decision

Keep old specs, release notes and audits intact for provenance. Add links to the context entry point instead of moving files blindly. Future changes should update the relevant context and tests in the same reviewable change.
