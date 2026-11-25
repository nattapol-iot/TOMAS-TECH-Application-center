# work-blocks

[Module](../modules/planning.md) · [Index](../../../AGENTS.md)

Evidence: source snapshot `cabb1a7f`; generated, do not edit. [backend-node/src/routes/work-blocks.ts](<../../../backend-node/src/routes/work-blocks.ts>). Ranges are hints: search symbol after edits.

## API operations

| Method | Path | Source lines |
|---|---|---|
| GET | `/api/v1/me/week` | 142–153 |
| POST | `/api/v1/me/work-blocks` | 155–180 |
| PATCH | `/api/v1/me/work-blocks/:id` | 182–223 |
| DELETE | `/api/v1/me/work-blocks/:id` | 225–237 |
| PUT | `/api/v1/me/outlook-links` | 239–270 |

## Named functions

| Symbol | Source | Lines |
|---|---|---|
| `writerOf` | [backend-node/src/routes/work-blocks.ts](<../../../backend-node/src/routes/work-blocks.ts>) | 31–32 |
| `round2` | [backend-node/src/routes/work-blocks.ts](<../../../backend-node/src/routes/work-blocks.ts>) | 34–34 |
| `resolveBlockWork` | [backend-node/src/routes/work-blocks.ts](<../../../backend-node/src/routes/work-blocks.ts>) | 39–47 |
| `weekResponse` | [backend-node/src/routes/work-blocks.ts](<../../../backend-node/src/routes/work-blocks.ts>) | 50–123 |
| `dayBlocks` | [backend-node/src/routes/work-blocks.ts](<../../../backend-node/src/routes/work-blocks.ts>) | 128–130 |
| `registerWorkBlockRoutes` | [backend-node/src/routes/work-blocks.ts](<../../../backend-node/src/routes/work-blocks.ts>) | 132–271 |

## Direct local dependencies

- [backend-node/src/db.ts](<../../../backend-node/src/db.ts>)
- [backend-node/src/email.ts](<../../../backend-node/src/email.ts>)
- [backend-node/src/errors.ts](<../../../backend-node/src/errors.ts>)
- [backend-node/src/http.ts](<../../../backend-node/src/http.ts>)
- [backend-node/src/issue-batches.ts](<../../../backend-node/src/issue-batches.ts>)
- [backend-node/src/outlook-write.ts](<../../../backend-node/src/outlook-write.ts>)
- [backend-node/src/users.ts](<../../../backend-node/src/users.ts>)
- [backend-node/src/work-blocks.ts](<../../../backend-node/src/work-blocks.ts>)
- [backend-node/src/work-days.ts](<../../../backend-node/src/work-days.ts>)
- [backend-node/src/routes/work-days.ts](<../../../backend-node/src/routes/work-days.ts>)

## SQL references (literal scan, not a complete schema or write-set)

`dbo.outlook_event_links`, `dbo.outlook_events`, `dbo.work_blocks`

## Change boundary

Read the selected handler and helpers it calls, then its caller in api-client.ts. Verify permission checks, record scope, transaction, rowVersion and audit on that path; a route name alone does not prove authorization. Dynamic routes/SQL, helper side effects and runtime config require source inspection.
