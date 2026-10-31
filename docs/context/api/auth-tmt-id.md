# auth-tmt-id

[Module](../modules/shell.md) · [Index](../../../AGENTS.md)

Evidence: source snapshot `4a0666d4`; generated, do not edit. [backend-node/src/routes/auth-tmt-id.ts](<../../../backend-node/src/routes/auth-tmt-id.ts>). Ranges are hints: search symbol after edits.

## API operations

| Method | Path | Source lines |
|---|---|---|
| GET | `/api/auth/login` | 49–70 |
| GET | `/api/auth/callback` | 72–143 |
| GET | `/api/auth/logout` | 145–171 |
| GET | `/api/me` | 173–191 |

## Named functions

| Symbol | Source | Lines |
|---|---|---|
| `unixSeconds` | [backend-node/src/routes/auth-tmt-id.ts](<../../../backend-node/src/routes/auth-tmt-id.ts>) | 29–33 |
| `claimText` | [backend-node/src/routes/auth-tmt-id.ts](<../../../backend-node/src/routes/auth-tmt-id.ts>) | 35–37 |
| `registerTmtIdAuthRoutes` | [backend-node/src/routes/auth-tmt-id.ts](<../../../backend-node/src/routes/auth-tmt-id.ts>) | 39–192 |

## Direct local dependencies

- [backend-node/src/errors.ts](<../../../backend-node/src/errors.ts>)
- [backend-node/src/tmt-id/callback-guard.ts](<../../../backend-node/src/tmt-id/callback-guard.ts>)
- [backend-node/src/tmt-id/constants.ts](<../../../backend-node/src/tmt-id/constants.ts>)
- [backend-node/src/tmt-id/next-path.ts](<../../../backend-node/src/tmt-id/next-path.ts>)
- [backend-node/src/tmt-id/runtime.ts](<../../../backend-node/src/tmt-id/runtime.ts>)
- [backend-node/src/tmt-id/user-provisioning.ts](<../../../backend-node/src/tmt-id/user-provisioning.ts>)
- [backend-node/src/tmt-id/types.ts](<../../../backend-node/src/tmt-id/types.ts>)
- [backend-node/src/tmt-id/token-vault.ts](<../../../backend-node/src/tmt-id/token-vault.ts>)
- [backend-node/src/erp-purchasing.ts](<../../../backend-node/src/erp-purchasing.ts>)

## SQL references (literal scan, not a complete schema or write-set)

No literal dbo reference in this file; follow dependencies.

## Change boundary

Read the selected handler and helpers it calls, then its caller in api-client.ts. Verify permission checks, record scope, transaction, rowVersion and audit on that path; a route name alone does not prove authorization. Dynamic routes/SQL, helper side effects and runtime config require source inspection.
