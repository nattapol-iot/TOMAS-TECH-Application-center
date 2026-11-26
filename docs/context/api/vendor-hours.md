# vendor-hours

[Module](../modules/planning.md) · [Index](../../../AGENTS.md)

Evidence: source snapshot `1b09d40e`; generated, do not edit. [backend-node/src/routes/vendor-hours.ts](<../../../backend-node/src/routes/vendor-hours.ts>). Ranges are hints: search symbol after edits.

## API operations

| Method | Path | Source lines |
|---|---|---|
| GET | `/api/v1/me/vendor-work` | 65–112 |
| PUT | `/api/v1/me/vendor-work/:taskId/:date` | 114–144 |

## Named functions

| Symbol | Source | Lines |
|---|---|---|
| `shift` | [backend-node/src/routes/vendor-hours.ts](<../../../backend-node/src/routes/vendor-hours.ts>) | 20–20 |
| `mondayOf` | [backend-node/src/routes/vendor-hours.ts](<../../../backend-node/src/routes/vendor-hours.ts>) | 22–22 |
| `vendorEntry` | [backend-node/src/routes/vendor-hours.ts](<../../../backend-node/src/routes/vendor-hours.ts>) | 52–62 |
| `registerVendorHourRoutes` | [backend-node/src/routes/vendor-hours.ts](<../../../backend-node/src/routes/vendor-hours.ts>) | 64–145 |

## Direct local dependencies

- [backend-node/src/db.ts](<../../../backend-node/src/db.ts>)
- [backend-node/src/errors.ts](<../../../backend-node/src/errors.ts>)
- [backend-node/src/http.ts](<../../../backend-node/src/http.ts>)
- [backend-node/src/issue-batches.ts](<../../../backend-node/src/issue-batches.ts>)
- [backend-node/src/users.ts](<../../../backend-node/src/users.ts>)

## SQL references (literal scan, not a complete schema or write-set)

`dbo.projects`, `dbo.schedule_task_pics`, `dbo.schedule_tasks`, `dbo.schedule_vendor_hours`

## Change boundary

Read the selected handler and helpers it calls, then its caller in api-client.ts. Verify permission checks, record scope, transaction, rowVersion and audit on that path; a route name alone does not prove authorization. Dynamic routes/SQL, helper side effects and runtime config require source inspection.
