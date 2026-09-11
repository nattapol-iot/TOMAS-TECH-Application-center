# Estimate copy and assignment discovery — EC-08, EC-09, EC-10

Lane owner: Claude · 2026-09-11
Worktree: `C:\Work\IoT-estimate-copy-20260911`
Branch: `claude/estimate-copy-assignment-20260911`, branched from `1b6de4be`

This document is the design and evidence report for three defects: copying an
Estimate Cost for reuse (EC-08), finding assigned estimate work before it is
started (EC-09), and knowing what to do with a new assignment (EC-10).

No migration is added. Schema 043 remains current and **044 stays reserved for
the labor-master lane**. No labor-master table or API changed; `dbo.engineering_rates`
is only read, through the rate rule the man-hour write route already applies.

---

## EC-08 — "User cannot copy Estimate Cost for reuse"

### What the copy flow actually was

The action exists: **Cost Items → Copy Previous Estimate**
(`app/system/production/EstimateScreens.tsx`). Choosing a source estimate and a
set of cost categories called `onBulkAddCost`, which looped over the selected
lines and issued one `POST /api/v1/estimates/:id/cost-items` per line, chaining
the estimate row version between calls.

### Root causes

**R1 — the copy was not one operation.** Each line was its own HTTP request and
its own SQL transaction. A failure at line *k* left lines 1…*k*−1 committed. The
UI said so out loud: `notify(\`${saved} line(s) saved before the operation stopped\`)`.
A half-copied estimate then blocks the retry, because the lines that did land now
collide with themselves (R2). This is the behaviour a user experiences as
"I cannot copy an estimate".

**R2 — no item-code allocation.** `UX_cost_items_code` is unique on
`(estimate_id, revision, item_code)` for live rows (`database/migrations/001_core.sql:296`).
The copy wrote every source `item_code` verbatim. Any code already present in the
target revision — copying the same source twice, or two sources that share
standard part numbers — raised a unique-index violation, surfaced as a generic
`duplicate` 409 from the shared error handler. The `apply-template` route already
solved exactly this with a suffix-allocation loop; the copy path never got it.

**R3 — a "copy" only copied cost items.** Man-hour lines, expense lines,
other-cost lines and ERP classifications were left behind, so the result was not
a reusable estimate. `cloneRevisionLines` in `backend-node/src/routes/estimates.ts`
already copies all five for a new revision, which is the shape a copy should have.

**R4 — the copy silently reassigned other engineers' sections.** Because the copy
ran as the estimate owner with `ownerId = workspace.header.ownerId`, every
`POST /cost-items` took the elevated branch and called `upsertCategoryAssignment`,
which **overwrites** the section's `owner_id`, zeroes `progress` and forces
`status = N'In Progress'` (`estimate-cost-write.ts:110-119`). Copying into an
estimate whose sections were already assigned moved that work onto the estimate
owner without telling anyone — precisely the "assignments to unsuspecting users"
the task forbids.

**R5 — a free-standing duplicate estimate is not possible in this schema.**
`dbo.estimates.inquiry_id` is `NOT NULL` with `CONSTRAINT UQ_estimates_inquiry UNIQUE`,
and `POST /api/v1/estimates` only accepts an inquiry in status `New` with no
estimate yet. One estimate per inquiry is a hard constraint. A duplicate with no
inquiry of its own would need a migration, which this lane must not take.

### The fix

One new transactional endpoint behind the **same existing Copy Previous Estimate
button** — no second copy mechanism, no new entry point:

`POST /api/v1/estimates/:id/copy-from` — `backend-node/src/routes/estimate-copy.ts`

```
{ estimateRowVersion, sourceEstimateId, ownerId,
  sections?: ["01".."10"],
  includeCostItems?, includeManhour?, includeExpenses?, includeOtherCosts?, includeErpCategories? }
```

It reuses the cost-write route's own helpers (`lockEditableEstimate`,
`categoryAssignment`, `validateReferences`, `touchEstimate`, `elevated`,
`assigned`), now exported rather than duplicated, so a copy can never write a
line the engineer could not have typed by hand.

| Concern | Behaviour |
| --- | --- |
| Atomicity (R1) | One `database.transaction`. Target locked once by `lockEditableEstimate`; `assertEstimateTotals` runs before commit. Any failure rolls the whole copy back. |
| Item codes (R2) | `allocateItemCode` mirrors the `apply-template` suffix rule and reports every rename in `renamedItemCodes`. |
| Completeness (R3) | Cost items, man-hour, expenses, other-cost lines and their ERP classifications, filtered by the selected sections. |
| Assignments (R4) | `ensureSectionAssignment` is `IF NOT EXISTS … INSERT` only. An existing assignment keeps its owner, support, due date, status and progress. A new one starts `Not Started`, progress 0 — copying content is not starting work. |
| New Draft (R5) | Unchanged: the Draft comes from the existing create-from-inquiry action, which issues a unique `EST` number via `issueDocumentNumber` and takes the owner chosen at creation. The copy then fills that Draft. Documented as a constraint, not worked around. |
| Line ownership | A section already assigned to an engineer keeps producing lines owned by that engineer (`copiedLineOwnerId`); only an unassigned section falls back to the requested owner. |
| Source | Read-only, under the copy's transaction with `HOLDLOCK`. No write statement binds `@source_id`. |

### Price provenance, rates and overhead

- **Cost, expense and other-cost lines copy verbatim**, including `price_source`,
  `reference_no`, `reference_project` and `price_date`. The old UI-side copy
  overwrote these with `"Previous Estimate"` plus the source estimate number,
  destroying the real provenance (a supplier quotation reference, for example).
  `cloneRevisionLines` copies them verbatim for revisions; the copy now matches.
  Where the copy came from is recorded in the audit log (`Copied from estimate`)
  rather than inside the price fields.
- **Internal man-hour is re-rated.** `resolveRate` in the man-hour write route
  never trusts a client-supplied rate; it resolves `dbo.engineering_rates` as of
  today. The copy applies the same rule: internal lines take today's effective
  rate and today's price date. Importing a historical `daily_rate` would have
  been a silent change to labour pricing. If no active rate matches the level,
  department and cost type, the copy fails with `engineering_rate_missing` and
  rolls back rather than guessing.
- **Supplier man-hour keeps its quoted rate**, quotation number and price date —
  that is the line's real provenance.
- **Overhead is not copied.** The target keeps the overhead policy snapshot taken
  at its own creation (`snapshotOverheadPolicy`). `v_estimate_totals` recomputes
  overhead from the copied internal direct hours under the **target's** policy.
  No historical overhead figure crosses over and no historical pricing changes.
- **Contingency is not copied.** It belongs to the target's own header.

### Explicitly not copied

Approval state, approval history, `estimate_revisions` snapshots, submission
snapshots, ERP export events, overhead snapshots, and any existing assignment's
owner/support/status/progress. ERP mappings are inserted with
`copied_from_mapping_id`/`copied_from_revision` left null, because
`CK_estimate_erp_mappings_copy_provenance` requires `copied_from_revision < revision`
— it describes a later revision of the *same* estimate, which a cross-estimate
copy is not. `Unmapped` categories are not carried; the ERP screen fills them in.

### Inactive suppliers

A supplier deactivated since the source was written cannot be written again.
Rather than making the copy impossible, an **optional** supplier reference (cost
and expense lines) is cleared and reported in `droppedSuppliers`; the line's other
provenance is untouched. A **supplier man-hour** line cannot lose its supplier —
`CK_manhour_lines_supplier` requires supplier and quotation number together — so
that one is refused by name with `supplier_inactive`, and the transaction rolls
back.

---

## EC-09 — "An assigned user cannot find the work in My Task until manually setting In-Progress"

### Root cause

Nothing in the system could answer "which estimate sections am I assigned?".

- `GET /api/v1/estimates` filters on `e.owner_id` — the **estimate owner**. A
  section assignee is `estimate_assignments.owner_id` / `support_id`, a different
  person. The Estimates screen defaults its owner filter to the signed-in user
  (`EstimateScreens.tsx`: `useState(() => canOwnEstimate(role) ? String(user.id) : "All owners")`),
  so an assignee who is not the estimate owner opens Estimates and sees nothing.
- My Work is fed entirely by `GET /api/v1/me/work`, which walks
  `dbo.schedule_tasks` / `schedule_task_pics`. The "Task inbox" tab reads
  `dbo.resource_tasks`. Neither touches `dbo.estimate_assignments`. The dashboard
  panel "งานของฉัน" uses the same `/me/work` rows.
- So the assignment record itself carried no visibility. A section became
  findable only as a side effect of work starting on it: the first cost line
  written by an elevated user runs `upsertCategoryAssignment`, flipping the
  section to `In Progress`, and `touchEstimate` lifts the estimate's progress —
  which is the "set it to In-Progress and then it shows up" behaviour reported.

### The fix

New read: `GET /api/v1/me/estimate-assignments`
— `backend-node/src/routes/estimate-assignments-read.ts`

- Authorisation **is** the `WHERE` clause: `WHERE (a.owner_id=@actor OR a.support_id=@actor)`.
  No other identity column widens it, so the endpoint cannot return another
  engineer's queue. Requires `estimate.read`.
- Not-started assignments are returned. Nothing filters on status to hide them,
  and the endpoint contains no `INSERT`/`UPDATE`/`DELETE` — it cannot move work
  along to make it visible.
- Finished and archived work is excluded by default: assignment status
  `Completed`/`Reviewed`, estimate status `Approved`/`Locked`, plus deleted
  estimates and inquiries. `?includeClosed=true` returns them without changing
  who may see them.
- The section's cost-line count is joined on the estimate's **current** revision
  (`line.revision=e.revision`).

Ordering, urgency and the summary counts live in `lib/estimate-assignment-queue.ts`
as pure functions, so they are unit-tested without a database.

---

## EC-10 — Next-action guidance for a new assignment

`MyEstimateAssignmentsPanel` in `app/system/production/PlanningPricingScreens.tsx`,
rendered inside the existing **My Work** screen — the existing `Panel`, `Badge`,
`ProgressCell` and `EmptyState` components, no dashboard redesign, no change to
email delivery.

Each row shows the Estimate (number, revision, project, customer), the section
and its discipline name, the engineer's role (Responsible or Support), the
assignment status alongside the estimate status, the due date toned by urgency,
progress, and a **next step** sentence. The action button opens the estimate
through `ProductionApp`'s existing `openEstimate` navigation:

| Situation | Next step |
| --- | --- |
| Not started, no cost line | "…has no cost line yet. Add the first line in the Cost Items tab." → **Open Estimate · Cost Items** |
| Lines exist, in progress | "…has N cost line(s) at X%. Continue and update the section status." |
| Waiting Supplier | "…is waiting for a supplier price. Chase the quotation, then update the section." |
| Waiting Information | "…is waiting for information from *estimate owner*." |
| Completed / Reviewed | "…is *status*. Nothing is waiting for you." |
| Estimate Approved / Locked | "…is *status* — section is read-only." |

The panel loads on its own `estimate.read` permission and its own request, and is
rendered in **both** branches of My Work — including the one shown when the
account lacks `schedule.read`/`schedule.progress` — so an engineer who only works
on estimates still finds their sections. No permission model was changed; the
cross-department permission rewrite remains out of this lane and in the backlog.

---

## Verification

All commands run in `C:\Work\IoT-estimate-copy-20260911`. No remote SQL, no
service restart, no deployment, no push.

| Check | Result |
| --- | --- |
| `npm test` (root: lint + typecheck + unit) | **254 pass, 0 fail, 0 skipped** |
| `npm run build:local` (frontend) | **PASS** — built in a separate checkout, as `scripts/guard-running-frontend-build.mjs` requires; the user's running candidate was not touched |
| `backend-node`: `npm run typecheck` | **PASS** |
| `backend-node`: `npm test` | **170 pass, 0 fail, 0 skipped** |
| `backend-node`: `npm run build` | **PASS** |

### Targeted regression tests added

`backend-node/tests/estimate-copy-route.test.ts` — 13 route tests against the real
route with a mocked SQL layer:

- every ledger copied in **one** transaction; every insert lands on the target's
  current revision; **no write statement binds the source estimate id**
- a duplicate item code is renumbered (`PLC-01` → `PLC-01-2`), not fatal
- assignment writes are `IF NOT EXISTS … INSERT` with `N'Not Started'`; there is
  no `UPDATE dbo.estimate_assignments`; a section owned by user 9 keeps producing
  lines owned by user 9
- internal man-hour re-rates to the master rate (4500), supplier man-hour keeps
  its quoted 8000, quotation number and price date
- price provenance survives; an inactive optional supplier is cleared and reported
- ERP classifications follow their line, on the target revision, without
  `copied_from_*`; `Unmapped` is not carried
- **rollback**: a failure at the aggregate guard rolls the whole transaction back
- **authorization isolation**: an engineer without the section gets 403
  `estimate_section_forbidden`; an assigned engineer cannot park a line on
  somebody outside their section (403 `cost_owner_forbidden`)
- a supplier man-hour line with a deactivated supplier is refused by name (422)
  and rolls back
- copying onto itself, or with an empty section selection, is rejected before any
  write; a section selection restricts both the read and the writes; a locked
  target is refused (409 `estimate_locked`)

`backend-node/tests/estimate-copy-plan.test.ts` — 7 tests for the pure rules
(code allocation incl. the nvarchar(100) ceiling, section mapping, supplier
resolution, line ownership, section normalisation incl. rejecting non-whitelisted
section text).

`backend-node/tests/estimate-assignments-read.test.ts` — 5 tests: the query is
scoped to the caller and to no other identity column; not-started work is
returned; `Completed`/`Reviewed` and `Approved`/`Locked` are filtered by default;
deleted rows hidden; count follows the current revision; the read performs no
mutation; `includeClosed=true` does not widen who may see what.

`tests/estimate-assignment-queue.test.mjs` — 8 tests: assigned-but-not-started is
actionable; finished and read-only work drops out; urgency and fallback due date;
next-action text per state; stable ordering; summary counts.

`tests/estimate-copy-assignment-contract.test.mjs` — 9 tests wiring the UI to the
contract: the copy tool is the pre-existing one and no longer loops
`createCostItem`; the modal offers every ledger and only writable sections; the
route is one transaction that never writes to the source; approval/submission/
export/overhead tables are absent from the copy; internal labour uses the same
rate query as the man-hour write route; My Work renders the panel in both
permission branches and can open the estimate; the read is caller-scoped; neither
new file contains DDL.

### Not verified

**No live authenticated UI coverage.** Exercising the copy or the assignment
queue against the running candidate would need a Team Test credential minted from
the DPAPI-protected signing key, which this lane must not read, and would write
to the shared Team Test database. Everything above is source-level, unit and
route-level with a mocked SQL layer. The endpoints have **not** been executed
against SQL Server; a live check on a disposable database is the remaining gap
before release (see *Remaining work*).

---

## Overlap and integration notes for the leader

Files shared with the labor-master lane and the candidate integration:

| File | Change | Risk |
| --- | --- | --- |
| `backend-node/src/routes/estimate-cost-write.ts` | Added `export` to 8 existing declarations. No logic touched. | Low. Purely additive; textual conflict only if the labor lane edits the same signature lines. |
| `backend-node/src/app.ts` | 2 imports + 2 registration lines, appended after the existing estimate registrations. | Low. |
| `app/system/api-client.ts` | 2 functions + 4 types, inserted before `updateEstimateContingency`. | Low. |
| `app/system/production/EstimateScreens.tsx` | Copy modal rewritten, `onCopyFrom` prop on `EstimateCostItemsTab`, `copyResultMessage` helper, 3 imports. Nothing else in the estimate route changed. | **Medium** — this is the file the labor lane most likely also edits. The changes are confined to the copy tool. |
| `app/system/production/PlanningPricingScreens.tsx` | New panel + hook + one optional prop; `ProductionMyWork` renders the panel in both branches. | Low. |
| `app/system/ProductionApp.tsx` | One line: `openEstimate` added to `moduleProps`. | Low. |
| `COORDINATION.md` | Appended claim only. | None. |

Deliberately **not** touched: `estimates.ts`, `estimate-workspace-write.ts`,
`estimate-workspace-read.ts`, `estimate-erp.ts`, any migration, any launcher, any
labor-master file, `dist/`.

The labor lane owns `dbo.engineering_rates`. The copy route reads it with the
same query text the man-hour write route uses. If that lane changes the rate
resolution rule, `resolveInternalRate` in `estimate-copy.ts` must follow it —
`tests/estimate-copy-assignment-contract.test.mjs` asserts the two queries match,
so a divergence fails the suite rather than passing silently.

## Remaining work / blockers

1. **Live execution against SQL Server is not done.** Run the copy and the
   assignment read on a disposable database (or an authorised Team Test QA
   account) before release: a copy with colliding item codes, a copy into an
   estimate whose sections belong to another engineer, a forced rollback, and an
   assignee with a not-started section.
2. **Reaching My Work still needs `schedule.read`+`schedule.progress`** for the
   nav entry itself (`ProductionApp.tsx` nav permissions). The panel renders for
   an account that reaches the screen without them, but adding a nav route for
   estimate-only engineers is a permission change and belongs to the backlogged
   cross-department permission work, not this lane.
3. **A copy still needs a target inquiry.** `UQ_estimates_inquiry` means "copy
   this estimate" is always "create the Draft from inquiry B, then copy A into
   it". If the business wants a standalone duplicate, that is a schema decision
   (drop or rework `UQ_estimates_inquiry`) for the leader, not a lane fix.
