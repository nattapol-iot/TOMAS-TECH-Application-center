# auth-tmt-id

[Module](../modules/shell.md) · [Index](../../../AGENTS.md)

Evidence: source snapshot `84fdd5bc`; generated, do not edit. [backend-node/src/routes/auth-tmt-id.ts](<../../../backend-node/src/routes/auth-tmt-id.ts>). Ranges are hints: search symbol after edits.

## API operations

| Method | Path | Source lines |
|---|---|---|
| GET | `/api/auth/login` | 45–66 |
| GET | `/api/auth/callback` | 68–125 |
| GET | `/api/auth/logout` | 127–152 |
| GET | `/api/me` | 154–170 |

## Named functions

| Symbol | Source | Lines |
|---|---|---|
| `unixSeconds` | [backend-node/src/routes/auth-tmt-id.ts](<../../../backend-node/src/routes/auth-tmt-id.ts>) | 27–31 |
| `claimText` | [backend-node/src/routes/auth-tmt-id.ts](<../../../backend-node/src/routes/auth-tmt-id.ts>) | 33–35 |
| `registerTmtIdAuthRoutes` | [backend-node/src/routes/auth-tmt-id.ts](<../../../backend-node/src/routes/auth-tmt-id.ts>) | 37–171 |

## Direct local dependencies

- [backend-node/src/errors.ts](<../../../backend-node/src/errors.ts>)
- [backend-node/src/tmt-id/callback-guard.ts](<../../../backend-node/src/tmt-id/callback-guard.ts>)
- [backend-node/src/tmt-id/constants.ts](<../../../backend-node/src/tmt-id/constants.ts>)
- [backend-node/src/tmt-id/next-path.ts](<../../../backend-node/src/tmt-id/next-path.ts>)
- [backend-node/src/tmt-id/runtime.ts](<../../../backend-node/src/tmt-id/runtime.ts>)
- [backend-node/src/tmt-id/user-provisioning.ts](<../../../backend-node/src/tmt-id/user-provisioning.ts>)
- [backend-node/src/tmt-id/types.ts](<../../../backend-node/src/tmt-id/types.ts>)

## SQL references (literal scan, not a complete schema or write-set)

No literal dbo reference in this file; follow dependencies.

## Change boundary

Read the selected handler and helpers it calls, then its caller in api-client.ts. Verify permission checks, record scope, transaction, rowVersion and audit on that path; a route name alone does not prove authorization. Dynamic routes/SQL, helper side effects and runtime config require source inspection.
