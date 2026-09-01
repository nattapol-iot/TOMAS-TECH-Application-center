# Sales Intake & Engineer Site Visit

## What it does

Turns a phone call from a customer into a scheduled engineer visit, a written
report, and an inquiry or estimate — without anybody retyping the customer's
words at any point along the way.

```text
Sales Intake → Technical Review → Site Visit Request → Assign Engineer
  → Engineer / Customer Confirmation → Site Visit → Site Visit Report
  → Inquiry → Estimate → Project
```

## The three problems it exists to solve

**1 · The engineer arrives without the information.** Sales fill in one form,
and a *readiness score* measures what is still missing before the intake may be
submitted. Five checks are blockers — customer and site, a reachable contact,
the current problem, the expected result, the visit purpose — and the API
recomputes the score from the database on every write, so an intake cannot be
submitted on the strength of a number the client made up.

**2 · Nobody knows who is free or qualified.** Assignment shows every engineer's
skill match against the required skills, their open workload, their booked hours
in the surrounding month, and any schedule conflict — with travel time counted
at both ends. A conflict refuses the assignment unless an Engineering Manager
overrides it, and an override is a recorded reason on the assignment row, never
a way of skipping the check.

**3 · What happened on site goes missing.** Checklist answers, measurements,
findings, risks and photographs are recorded against the visit as they happen,
autosaving as the engineer types. At check-out the report is created for them,
pre-filled from the intake and their own findings; approving it is what lets an
inquiry be raised, and the inquiry carries the requirement, scope, assumptions,
exclusions and risks across by itself.

## Architecture

Migration **016** adds 27 tables, one stored procedure, five triggers and
11 permissions. The API is three endpoint files plus a shared core; the UI is
one production module plus a demo screen. `lib/site-visit-rules.ts` holds the
status machine, the readiness rules and the conflict detector as pure functions
so the screens and the tests can use exactly what the API enforces.

| Path | Purpose |
| --- | --- |
| `database/migrations/016_sales_intake_site_visit.sql` | Schema, triggers, `dbo.assert_engineer_available`, roles and permissions |
| `database/scripts/920_site_visit_master_seed.sql` | 14 visit purposes, 9 skills, 3 SLA policies, 7 checklist templates, 50 items |
| `backend/.../Endpoints/SiteVisitCore.cs` | Status machine, readiness, audit, status history, notifications, upload validation |
| `backend/.../Endpoints/SalesIntakeEndpoints.cs` | Intake CRUD, status changes, technical review, attachments, sales dashboard |
| `backend/.../Endpoints/SiteVisitEndpoints.cs` | Scheduling, assignment, confirmation, execution, report, links, calendar, dashboards |
| `backend/.../Endpoints/SiteVisitMasterEndpoints.cs` | Visit types, skills, checklists, SLA, engineer profiles, availability, notification feed |
| `app/system/production/SiteVisitScreens.tsx` | The four production workspaces |
| `app/system/screens/SiteVisit.tsx` | The `/demo` prototype on in-file sample data |
| `lib/site-visit-rules.ts` | Shared rules, imported by the screens and unit-tested directly |

## The invariants, and where they live

Business rules live in the database wherever a database can hold them, because
an application rule is only as good as the last developer who remembered it.

| Rule | Enforced by |
| --- | --- |
| Intake and visit numbers never duplicate | `dbo.issue_document_number` + `UNIQUE` |
| Status history and reschedule history cannot be edited | `INSTEAD OF UPDATE, DELETE` triggers (51192, 51193) |
| An approved report revision is frozen | `trg_site_visit_report_revisions_immutable` (51194) |
| One approved revision per report | `UX_site_visit_report_revisions_one_approved` |
| One live assignment per engineer, one live lead | `UX_site_visit_assignments_active`, `..._lead` |
| A conflict override names a manager and a reason ≥ 10 characters | `CK_site_visit_assignments_override` |
| An engineer cannot be double-booked | `dbo.assert_engineer_available` under `UPDLOCK, HOLDLOCK` |
| A completed visit was checked out of | `CK_site_visits_completed_requires_checkout` |
| Location is stored only with consent | `CK_site_visits_geo` |
| The same person is not notified twice about the same event | `UX_notifications_dedupe` |
| Executed work is archived, never deleted | `trg_site_visits_no_hard_delete`, `trg_sales_intakes_no_hard_delete` |
| Concurrent edits cannot silently overwrite | `rowversion` on every transactional table |

Rules that need more than one row, and therefore live in the API:

* Mandatory information must be complete before submitting for review.
* Only an engineer who *accepted this visit* may check in, answer the checklist
  or record findings — holding `visit.execute` is necessary, not sufficient.
* A report author cannot approve their own report.
* Closing without an approved report needs a written explanation.
* An approved estimate is never edited: the endpoint links the existing one and
  says so, and a revision goes through the Estimate module's own workflow.

## Roles and permissions

Eleven permissions: `intake.read`, `intake.write`, `intake.review`,
`visit.read`, `visit.schedule`, `visit.override`, `visit.execute`,
`visit.report`, `visit.report_approve`, `visit.link`, `visit.admin`.

Three roles were added — **Sales Manager**, **Engineering Coordinator**,
**Management** — because the process needs them and the system had no
equivalent. The other roles in the requirement map onto roles that already
exist: Sales → `Sales Engineer`, Estimator → `Engineer` / `Project Manager`.

The rule the requirement is most explicit about — *sales may not finally assign
an engineer* — is expressed as a grant: the sales roles hold `intake.write` and
never `visit.schedule`. `tests/site-visit-rules.test.mjs` asserts that a holder
of the sales permission set has no available transition out of `Tentative`.

## Separation of sources

Three tables hold three different people's words, and nothing merges them:

* `dbo.sales_intakes` — what the customer said, written by sales.
* `dbo.sales_intake_reviews` — what engineering concluded. Insert-only; a review
  is a record of a decision, not a document.
* `dbo.site_visit_findings` — what was actually observed on site.

`SiteVisitEndpoints.cs` has no code path that writes the sales requirement
columns, and a guardrail test asserts it stays that way. Skill requirements
carry a `source` of `Sales` or `Coordinator`, so a coordinator correcting the
skills never erases what sales originally asked for; both are shown.

## Verified

* Migration 016 applied to `IoTTeamCenter_CodexTest_20260830_04`; schema 16.
* **21 negative checks** run against the live database, each in its own
  transaction and rolled back, leaving zero rows: append-only history, one live
  lead, unexplained override refused, double-booking refused, override reports
  the conflict, travel time creates a conflict, a free slot is free, leave
  blocks a booking, completed requires check-out, approved revision immutable,
  supersede still permitted, one approved revision, submitted intake not
  deletable, duplicate notification refused, same key for another recipient
  allowed, location needs consent, duplicate link refused, unknown status
  refused, number shape.
* `npm test` — 68/68 (39 existing + 29 rule tests + 10 guardrails, minus the
  count already there).
* `npx eslint` clean; `npx tsc --noEmit` clean for the application.
* `dotnet build -c Release` — 0 warnings, 0 errors.
* `npx vinext build` — both `/` and `/demo` build.

**Not verified:** no HTTP round-trip against the new routes. The API on `:5105`
is a published release in Codex's build-and-release lane, and republishing it
during their Node cutover would have disrupted the LAN test the team is using.
Registration is proven by compilation and by the guardrails; the workflow rules
are proven against the real database.

## Configuration

The module reuses existing settings — `ConnectionStrings__IoTTeamCenter`,
`DocumentStorage__*`, the authentication and CORS settings. It adds none.
Attachments use the existing `ProjectDocumentStorage` adapter under
`sales-intakes/…` and `site-visits/…` keys, and the same disabled malware
scanner records `Skipped` rather than claiming a file is clean.

## Deliberately not built

* **External calendar sync.** Google and Outlook need credentials that do not
  exist yet. The schema carries `time_zone_id` and the visit exposes a clean
  start/end/attendee shape, so an adapter has something to synchronise; no stub
  service was added, because a stub that silently does nothing is worse than an
  absent one.
* **Offline mobile.** The execution screen autosaves continuously over the
  network. Genuine offline needs a local store and a merge strategy, which is a
  design decision rather than an implementation detail.
* **Digital customer signature.** The report records who acknowledged it and
  when; `customer_signature_storage_key` is in the schema for when a signature
  capture surface exists.
* **Route and travel-time calculation.** Travel time is a number a coordinator
  sets, defaulting from the customer site. No mapping provider is called.

## Known limitations

* The engineer's phone screen requires a connection; a lost signal loses only
  the last unsaved keystrokes, but it does lose them.
* Report export to PDF is the browser's print view, styled for it. The project
  has no PDF service.
* `Accepted` translates as *รับเข้า* in Thai, inherited from the goods-receipt
  screen, because the dictionary is keyed by the English phrase. On an
  assignment badge it reads oddly; see COORDINATION.md.
* Notifications are in-app only. `SiteVisitCore.NotifyAsync` is the single
  delivery point, so an email or LINE transport is one implementation away.
* The Management dashboard's lead-time figure counts intake creation to customer
  confirmation. Visits never confirmed are excluded rather than counted as
  infinite.
