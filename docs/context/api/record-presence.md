# record-presence

[Module](../modules/platform.md) · [Index](../../../AGENTS.md)

Evidence: source snapshot `3d891f13`; generated, do not edit. [backend-node/src/routes/record-presence.ts](<../../../backend-node/src/routes/record-presence.ts>). Ranges are hints: search symbol after edits.

## API operations

| Method | Path | Source lines |
|---|---|---|
| POST | `/api/v1/estimates/:id/sync` | 154–181 |
| POST | `/api/v1/inquiries/:id/presence` | 183–195 |

## Named functions

| Symbol | Source | Lines |
|---|---|---|
| `parseCursor` | [backend-node/src/routes/record-presence.ts](<../../../backend-node/src/routes/record-presence.ts>) | 37–43 |
| `parseEditingKey` | [backend-node/src/routes/record-presence.ts](<../../../backend-node/src/routes/record-presence.ts>) | 45–51 |
| `beat` | [backend-node/src/routes/record-presence.ts](<../../../backend-node/src/routes/record-presence.ts>) | 77–85 |
| `leave` | [backend-node/src/routes/record-presence.ts](<../../../backend-node/src/routes/record-presence.ts>) | 87–93 |
| `viewerDto` | [backend-node/src/routes/record-presence.ts](<../../../backend-node/src/routes/record-presence.ts>) | 148–151 |
| `registerRecordPresenceRoutes` | [backend-node/src/routes/record-presence.ts](<../../../backend-node/src/routes/record-presence.ts>) | 153–211 |

## Direct local dependencies

- [backend-node/src/db.ts](<../../../backend-node/src/db.ts>)
- [backend-node/src/errors.ts](<../../../backend-node/src/errors.ts>)
- [backend-node/src/http.ts](<../../../backend-node/src/http.ts>)
- [backend-node/src/users.ts](<../../../backend-node/src/users.ts>)

## SQL references (literal scan, not a complete schema or write-set)

`dbo.cost_items`, `dbo.estimate_assignments`, `dbo.estimates`, `dbo.expense_lines`, `dbo.inquiries`, `dbo.manhour_lines`, `dbo.other_cost_lines`, `dbo.record_presence`, `dbo.users`

## Change boundary

Read the selected handler and helpers it calls, then its caller in api-client.ts. Verify permission checks, record scope, transaction, rowVersion and audit on that path; a route name alone does not prove authorization. Dynamic routes/SQL, helper side effects and runtime config require source inspection.
