# document-lifecycle

[Module](../modules/inquiry.md) · [Index](../../../AGENTS.md)

Evidence: source snapshot `6239366b`; generated, do not edit. [backend-node/src/routes/document-lifecycle.ts](<../../../backend-node/src/routes/document-lifecycle.ts>). Ranges are hints: search symbol after edits.

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
| `purge` | [backend-node/src/routes/document-lifecycle.ts](<../../../backend-node/src/routes/document-lifecycle.ts>) | 33–37 |
| `doc` | [backend-node/src/routes/document-lifecycle.ts](<../../../backend-node/src/routes/document-lifecycle.ts>) | 38–41 |
| `graph` | [backend-node/src/routes/document-lifecycle.ts](<../../../backend-node/src/routes/document-lifecycle.ts>) | 44–68 |
| `access` | [backend-node/src/routes/document-lifecycle.ts](<../../../backend-node/src/routes/document-lifecycle.ts>) | 70–73 |
| `facts` | [backend-node/src/routes/document-lifecycle.ts](<../../../backend-node/src/routes/document-lifecycle.ts>) | 74–80 |
| `eventById` | [backend-node/src/routes/document-lifecycle.ts](<../../../backend-node/src/routes/document-lifecycle.ts>) | 81–87 |
| `restoreBlock` | [backend-node/src/routes/document-lifecycle.ts](<../../../backend-node/src/routes/document-lifecycle.ts>) | 88–98 |
| `stamp` | [backend-node/src/routes/document-lifecycle.ts](<../../../backend-node/src/routes/document-lifecycle.ts>) | 100–104 |
| `restoreRow` | [backend-node/src/routes/document-lifecycle.ts](<../../../backend-node/src/routes/document-lifecycle.ts>) | 105–114 |
| `registerDocumentLifecycleRoutes` | [backend-node/src/routes/document-lifecycle.ts](<../../../backend-node/src/routes/document-lifecycle.ts>) | 116–226 |
| `guardDocumentLifecycle` | [backend-node/src/routes/document-lifecycle.ts](<../../../backend-node/src/routes/document-lifecycle.ts>) | 229–237 |

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

`dbo.document_lifecycle_events`, `dbo.estimate_revisions`, `dbo.estimate_submission_snapshots`, `dbo.estimates`, `dbo.inquiries`, `dbo.inquiry_meetings`, `dbo.projects`, `dbo.purge_trial_document`, `dbo.sales_intakes`, `dbo.supplier_quotations`, `dbo.unified_reports`, `dbo.user_effective_permissions`, `dbo.users`

## Change boundary

Read the selected handler and helpers it calls, then its caller in api-client.ts. Verify permission checks, record scope, transaction, rowVersion and audit on that path; a route name alone does not prove authorization. Dynamic routes/SQL, helper side effects and runtime config require source inspection.
