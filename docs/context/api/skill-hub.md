# skill-hub

[Module](../modules/downloads.md) · [Index](../../../AGENTS.md)

Evidence: source snapshot `45d4c155`; generated, do not edit. [backend-node/src/routes/skill-hub.ts](<../../../backend-node/src/routes/skill-hub.ts>). Ranges are hints: search symbol after edits.

## API operations

| Method | Path | Source lines |
|---|---|---|
| GET | `/api/v1/skill-hub` | 100–103 |
| GET | `/api/v1/skill-hub/:slug` | 104–108 |
| GET | `/api/v1/skill-hub/:slug/install` | 109–120 |

## Named functions

| Symbol | Source | Lines |
|---|---|---|
| `isTarget` | [backend-node/src/routes/skill-hub.ts](<../../../backend-node/src/routes/skill-hub.ts>) | 12–12 |
| `safePath` | [backend-node/src/routes/skill-hub.ts](<../../../backend-node/src/routes/skill-hub.ts>) | 13–18 |
| `readSkillCatalog` | [backend-node/src/routes/skill-hub.ts](<../../../backend-node/src/routes/skill-hub.ts>) | 21–68 |
| `buildInstallerScript` | [backend-node/src/routes/skill-hub.ts](<../../../backend-node/src/routes/skill-hub.ts>) | 70–91 |
| `registerSkillHubRoutes` | [backend-node/src/routes/skill-hub.ts](<../../../backend-node/src/routes/skill-hub.ts>) | 93–121 |

## Direct local dependencies

- [backend-node/src/errors.ts](<../../../backend-node/src/errors.ts>)
- [backend-node/src/users.ts](<../../../backend-node/src/users.ts>)

## SQL references (literal scan, not a complete schema or write-set)

No literal dbo reference in this file; follow dependencies.

## Change boundary

Read the selected handler and helpers it calls, then its caller in api-client.ts. Verify permission checks, record scope, transaction, rowVersion and audit on that path; a route name alone does not prove authorization. Dynamic routes/SQL, helper side effects and runtime config require source inspection.
