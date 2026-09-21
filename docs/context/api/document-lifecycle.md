# document-lifecycle

[Module](../modules/inquiry.md) · [Index](../../../AGENTS.md)

Evidence: source snapshot `0cd46f67`; generated, do not edit. [backend-node/src/routes/document-lifecycle.ts](<../../../backend-node/src/routes/document-lifecycle.ts>). Ranges are hints: search symbol after edits.

## API operations

| Method | Path | Source lines |
|---|---|---|


## Named functions

| Symbol | Source | Lines |
|---|---|---|
| `table` | [backend-node/src/routes/document-lifecycle.ts](<../../../backend-node/src/routes/document-lifecycle.ts>) | 26–26 |
| `permission` | [backend-node/src/routes/document-lifecycle.ts](<../../../backend-node/src/routes/document-lifecycle.ts>) | 27–27 |
| `saveRow` | [backend-node/src/routes/document-lifecycle.ts](<../../../backend-node/src/routes/document-lifecycle.ts>) | 28–28 |
| `save` | [backend-node/src/routes/document-lifecycle.ts](<../../../backend-node/src/routes/document-lifecycle.ts>) | 29–29 |
| `root` | [backend-node/src/routes/document-lifecycle.ts](<../../../backend-node/src/routes/document-lifecycle.ts>) | 30–30 |
| `token` | [backend-node/src/routes/document-lifecycle.ts](<../../../backend-node/src/routes/document-lifecycle.ts>) | 31–31 |
| `manager` | [backend-node/src/routes/document-lifecycle.ts](<../../../backend-node/src/routes/document-lifecycle.ts>) | 32–32 |
| `doc` | [backend-node/src/routes/document-lifecycle.ts](<../../../backend-node/src/routes/document-lifecycle.ts>) | 33–36 |
| `graph` | [backend-node/src/routes/document-lifecycle.ts](<../../../backend-node/src/routes/document-lifecycle.ts>) | 39–63 |
| `access` | [backend-node/src/routes/document-lifecycle.ts](<../../../backend-node/src/routes/document-lifecycle.ts>) | 65–68 |
| `facts` | [backend-node/src/routes/document-lifecycle.ts](<../../../backend-node/src/routes/document-lifecycle.ts>) | 69–75 |
| `eventById` | [backend-node/src/routes/document-lifecycle.ts](<../../../backend-node/src/routes/document-lifecycle.ts>) | 76–82 |
| `restoreBlock` | [backend-node/src/routes/document-lifecycle.ts](<../../../backend-node/src/routes/document-lifecycle.ts>) | 83–93 |
| `stamp` | [backend-node/src/routes/document-lifecycle.ts](<../../../backend-node/src/routes/document-lifecycle.ts>) | 95–99 |
| `restoreRow` | [backend-node/src/routes/document-lifecycle.ts](<../../../backend-node/src/routes/document-lifecycle.ts>) | 100–109 |
| `registerDocumentLifecycleRoutes` | [backend-node/src/routes/document-lifecycle.ts](<../../../backend-node/src/routes/document-lifecycle.ts>) | 111–207 |
| `guardDocumentLifecycle` | [backend-node/src/routes/document-lifecycle.ts](<../../../backend-node/src/routes/document-lifecycle.ts>) | 210–218 |

## Direct local dependencies

- [backend-node/src/audit.ts](<../../../backend-node/src/audit.ts>)
- [backend-node/src/db.ts](<../../../backend-node/src/db.ts>)
- [backend-node/src/config.ts](<../../../backend-node/src/config.ts>)
- [backend-node/src/document-lifecycle-policy.ts](<../../../backend-node/src/document-lifecycle-policy.ts>)
- [backend-node/src/errors.ts](<../../../backend-node/src/errors.ts>)
- [backend-node/src/http.ts](<../../../backend-node/src/http.ts>)
- [backend-node/src/types.ts](<../../../backend-node/src/types.ts>)
- [backend-node/src/user-roles.ts](<../../../backend-node/src/user-roles.ts>)
- [backend-node/src/users.ts](<../../../backend-node/src/users.ts>)
- [backend-node/src/routes/estimates.ts](<../../../backend-node/src/routes/estimates.ts>)

## SQL references (literal scan, not a complete schema or write-set)

`dbo.document_lifecycle_events`, `dbo.estimate_revisions`, `dbo.estimate_submission_snapshots`, `dbo.estimates`, `dbo.inquiries`, `dbo.inquiry_meetings`, `dbo.projects`, `dbo.sales_intakes`, `dbo.supplier_quotations`, `dbo.unified_reports`, `dbo.user_effective_permissions`, `dbo.users`

## Change boundary

Read the selected handler and helpers it calls, then its caller in api-client.ts. Verify permission checks, record scope, transaction, rowVersion and audit on that path; a route name alone does not prove authorization. Dynamic routes/SQL, helper side effects and runtime config require source inspection.
