# Inquiry / Estimate document lifecycle

The document detail toolbar exposes **Manage document**. Both list headers expose **Trash / Archive**. These actions retain document numbers, cost ledgers, attachments and audit history; Admin additionally has a permanent-delete action for trial data. There is no bulk action.

| Action | Eligibility and effect |
| --- | --- |
| Delete inquiry draft | New inquiry with no estimate (including deleted estimates), project, site intake, report, supplier quotation or meeting. Soft-deletes only the inquiry. |
| Delete estimate draft | Current revision has never been submitted and is Draft, Engineering Input or Revision Required; no project reference. R00 moves to trash and clears the inquiry's active pointer. Later revisions return to the most recent approved/locked snapshot; its costs and original approver remain intact. |
| Cancel | Owner or Engineering Manager/Admin with write permission; approved estimates additionally require approval permission and a management role. Project references block cancellation. Review must be withdrawn first. |
| Cancel inquiry and estimate | Both documents must be manageable by the actor, and the estimate must be an unsubmitted draft. Both changes and their audits commit together. |
| Withdraw review | Owner or management with estimate write permission. Preserves the immutable submitted revision and creates a new working revision, so later resubmission gets its own snapshot. |
| Archive | Approved, Locked or Cancelled documents. Hides the document from active lists and assignments without deleting data used by project references. Archived detail remains readable. |
| Restore | Restores the same identity. A deleted draft can be restored only if its inquiry and estimate have not changed since removal and no project now references it. Archive restore changes visibility only. |

An inquiry with a cancelled estimate is not automatically cancelled: the user can review the inquiry and cancel it separately. Related projects, site work and CRM opportunities are never silently cancelled. The confirmation shows related documents and the fallback revision. Every action requires a reason.

An estimate hidden in the trash reserves its inquiry and document number. Restore it instead of creating a replacement estimate. Discarded revision numbers remain reserved even when the current header has returned to an older approval.

## API and consistency

For each of `inquiries` and `estimates`:

- `GET /api/v1/{kind}/lifecycle-records?search=...&page=...`: paged active trash/archive entries.
- `GET /api/v1/{kind}/:id/lifecycle?eventId=...`: permitted actions, blockers, linked documents and a concurrency token. `eventId` selects a restoration preview.
- `POST /api/v1/{kind}/:id/lifecycle`: `action`, `reason`, `token`; restoration also requires `eventId`.

Preview and execution share the policy in `backend-node/src/document-lifecycle-policy.ts`. Execution locks the inquiry, estimate and relevant references in a serializable transaction and re-evaluates permissions, dependencies and the token. A failed audit rolls back the business mutation. Existing editors also reject deleted, archived and cancelled documents.

Migration **057** adds `archived_at`, the estimate `Cancelled` status and `document_lifecycle_events`. Soft deletion uses existing `deleted_at`; archival is deliberately separate so project totals and references continue to work. `audit_log` remains the append-only audit ledger; lifecycle events additionally track restoration.

## Verification

Unit/API contract tests: `backend-node/tests/document-lifecycle.test.ts`.

SQL integration uses a disposable database and login on a **local, mixed-authentication SQL Server**. The wrapper verifies the actual server machine, applies all migrations, reapplies 057 and 058, runs twelve integration scenarios and removes only the random database/login it created:

```powershell
pwsh -NoProfile -File backend-node/scripts/Test-DocumentLifecycleLocal.ps1 -Server 'tcp:127.0.0.1,<local-port>'
```

The wrapper never targets an existing application database. No shared-database changes, push or deployment are part of the local implementation checks.

## Admin permanent deletion

Migration 058 adds `purge_trial_document`. Only an active effective Admin role (primary or additional), with document write permission, can execute `permanent-delete`. The lifecycle preview exposes `permanentDelete` only to Admin. The request must include the exact document number in `confirmNumber`, a reason and a fresh preview token.

The action is available from Manage document and from a trash/archive entry. It removes the selected Inquiry, or the entire Estimate including every revision, cost ledger, assignment, ERP mapping/group and immutable submission/overhead snapshot. The linked inquiry remains and its estimate pointer is cleared. Existing cancelled/archived inquiries remain closed. Delete the estimate first before deleting its inquiry. Numbers are not rewound.

External foreign-key references block deletion, including CRM opportunities, projects, BOMs, signing documents, inquiry attachments, site work, reports and meetings. The preview lists the blocking categories; the transaction rechecks them under locks. No related business document or physical attachment is cascaded. Audit and lifecycle history remain as evidence, but the removed document no longer appears in trash and cannot be restored.

The SQL procedure runs as owner to respect the app role's normal delete denials. Eight estimate triggers retain their original behavior except for deletion of the one estimate identified by a scoped session context while executing as dbo. Inserts/updates remain protected. The context is cleared on success/error; deletion and the API audit commit together, and audit failure rolls everything back. No existing business document is deleted by the migration.

Migration 058 keeps BEGIN/COMMIT in one Node SQL request and creates triggers/procedure in nested dynamic batches. The local harness applies 058 using the production Node migration runner, then reapplies it through the same driver before integration checks.
