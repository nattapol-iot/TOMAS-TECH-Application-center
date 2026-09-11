# Estimate cost improvement backlog — EC-01 … EC-07

Owner of this document: Claude (labor lane).
Branch: `claude/estimate-labor-master-20260911` · worktree `C:/Work/IoT-labor-master-20260911`.
Created 2026-09-11. Companion QA input: `docs/audits/estimate-erp-qa-20260911.md` (candidate worktree).

This backlog turns the four user requirements into bounded tasks. Only **EC-01, EC-02 and
EC-03** are implemented in this lane. EC-04 … EC-07 are recorded with acceptance criteria so
another lane can pick them up without re-deriving the analysis.

---

## What already exists (verified, not re-built)

| Concern | Existing asset | Verdict |
| --- | --- | --- |
| Internal labor rate master | `dbo.engineering_rates` (level, department, engineering/installation hourly + daily, `effective_from`/`effective_to`, `is_active`) | Extend. Do **not** create a second rate table. |
| Rate write path | `POST /api/v1/master/engineering-rates` (`master.write` + `Engineering Manager`/`Admin`) | Extend with a lifecycle action; keep the create endpoint untouched. |
| Rate read path | `GET /api/v1/admin/engineering-rates` (`master.read` + management-only roles) | Keep. It is an administration list, not an entry-time picker. |
| Rate freeze on estimate lines | `dbo.manhour_lines.daily_rate` is written by the server from the master and stored on the row | Already frozen. Nothing to change. |
| Rate integrity rule | `dbo.fn_estimate_validation` → `internal_rate_mismatch` requires an internal line's `daily_rate` to equal a **still-active** master rate covering the line's `price_date` | Must be respected — see EC-01 design note. |
| Reusable material templates | `dbo.module_templates` / `dbo.module_template_lines`, `POST /api/v1/estimates/:id/apply-template`, `POST /api/v1/module-templates/from-estimate` | The shape to mirror. It covers `cost_items` only — there is no labor equivalent. |
| ERP classification | `dbo.estimate_erp_mappings` (migration 043) + `materializeErpMappings()` at submit/approve | Extend at apply time only. Do not touch summary category visibility. |

**The gap.** Material cost has a reusable, searchable, published library. Labor cost has
neither a library nor an entry-time rate picker, and a rate master cannot be changed at all
today (see EC-01). Every man-hour activity is retyped.

---

## EC-01 — Labor rate master: searchable, versioned, supersedable — **this lane**

**Problem.** Three defects in the current rate master:

1. There is no read endpoint an estimator may call. `GET /api/v1/admin/engineering-rates`
   requires `master.read` **and** a management-level role, so an engineer entering costs
   cannot see or search the rate that will be applied to their line. The rate column in the
   man-hour quick-add row literally renders the placeholder `Rate master` / `On save`.
2. **A rate can never be changed.** The only write is an insert, `tr_engineering_rates_no_overlap`
   rejects any active row overlapping the same `(level, department)` period, and nothing can
   set `effective_to` on the incumbent row. A rate created open-ended (`effective_to = NULL`)
   is therefore permanent.
3. The master carries no code, no role/activity label and no ERP category, so nothing about it
   can be searched by the words an estimator actually uses.

**Design.**

- Migration 044 adds to `dbo.engineering_rates`, all nullable or defaulted, no rewrite of
  existing rows: `code`, `role_activity`, `default_erp_category`, `version`,
  `superseded_by_rate_id`, `superseded_at`, `notes`, `updated_by`, `updated_at`.
- `GET /api/v1/labor-rates` — entry-time picker. `estimate.read`, because choosing the rate
  the server is going to apply anyway reveals nothing the resulting line does not already
  show. Searches code, level, department and role/activity; filters by `costType`, department,
  level and an `on` date; returns hourly **and** daily for both cost types plus the ERP default
  and a `status` of `Effective` / `Future` / `Expired` / `Inactive`.
- `POST /api/v1/master/engineering-rates/:id/supersede` — the missing lifecycle action. In one
  transaction it closes the incumbent (`effective_to = newEffectiveFrom - 1 day`) and inserts
  the successor with `version = incumbent.version + 1`, linking `superseded_by_rate_id` back.
  Same authorisation as the create endpoint. Optimistic concurrency on `rowVersion`.
- `POST /api/v1/master/engineering-rates/:id/retire` — closes a rate for future use by setting
  `effective_to`, and **refuses with 409 `labor_rate_in_use`** when any live internal man-hour
  line has a `price_date` after the requested end date. Deactivation (`is_active = 0`) is
  deliberately *not* exposed.

**Why supersede, not edit.** Editing an incumbent's rate columns in place would silently
invalidate every estimate line already priced from it: the stored `daily_rate` would no longer
equal any active master value at the line's `price_date`, `fn_estimate_validation` would raise
`internal_rate_mismatch`, and `POST /api/v1/estimates/:id/submit` would start failing 422 on
estimates nobody had touched. Superseding leaves the incumbent row active and covering its own
historical window, so old lines keep validating against the rate they were actually priced at
and their amounts never move. Prices stay frozen **and** valid.

**Acceptance criteria.**
- [x] An engineer with `estimate.read` can search rates and see hourly and daily values.
- [x] Superseding produces two rows: incumbent closed the day before, successor `version + 1`.
- [x] A superseded incumbent still covers its own historical window, so existing lines keep
      their `daily_rate` and keep passing `internal_rate_mismatch`.
- [x] Retiring a rate that would orphan a live line is refused and names the estimates.
- [x] `POST /api/v1/master/engineering-rates` and `GET /api/v1/admin/engineering-rates` are
      unchanged.

## EC-02 — Reusable labor work packages — **this lane**

**Problem.** `module_templates` gives material cost a published, searchable, versioned library
and a one-transaction apply. Labor has nothing: a "Commissioning" package with its eight usual
activities is retyped on every estimate.

**Design.** Mirror the module-template shape rather than invent a second idiom.

- `dbo.labor_packages` — `code`, `name`, `cost_type`, `department`, `project_type`,
  `description`, `status` (`Draft`/`Active`/`Retired`), `revision`, audit columns, `row_version`.
  Same lifecycle rules as `module_templates`: any `estimate.write` holder may draft one,
  `master.write` is needed to publish or retire, a published package cannot be overwritten
  (copy to a new draft), only `Active` packages can be applied.
- `dbo.labor_package_lines` — `sort_order`, `activity`, `department`, `level`, `cost_type`,
  `provider` (`Internal`/`Supplier`), `rate_id` (nullable FK to `engineering_rates`, provenance
  only), `rate_basis` (`Daily`/`Hourly`), `default_engineers`, `default_man_days`,
  `default_hours`, `default_hours_per_day`, `reference_daily_rate`, `default_erp_category`,
  `remark`.
- `GET|POST /api/v1/labor-packages`, `GET|PUT /api/v1/labor-packages/:id`,
  `POST /api/v1/labor-packages/:id/retire`, `POST /api/v1/labor-packages/from-estimate`.
- `POST /api/v1/estimates/:id/apply-labor-package` — one transaction, the same estimate lock,
  the same section-06 authorisation and the same `assertEstimateTotals` guard as typing the
  lines by hand. It resolves each internal line's `daily_rate` from the live master exactly as
  `POST /api/v1/estimates/:id/manhour-lines` does; a package never writes a rate the estimator
  could not have obtained themselves.

**Provider decision.** `provider` lives on the package **line**, not on the rate master.
`engineering_rates` is internal-only by construction — `fn_estimate_validation` only consults it
for `provider = N'Internal'` lines, and `UX_engineering_rates_active` /
`tr_engineering_rates_no_overlap` are keyed on `(level, department, effective_from)` with no
provider dimension. Adding a provider column to the master would have required changing that
index and that trigger, which belong to the database lane. Supplier labor keeps its existing
shape: explicit rate plus `supplier_id` and `quotation_no`.

**Unit conversion, stated explicitly.** A man-hour line's cost is
`engineers × man_days × daily_rate`; `hours_per_day` is carried for man-hour reporting and is
not a cost factor. So an `Hourly` package line converts to the column the ledger actually uses:

```
man_days = round(default_hours / default_hours_per_day, 2)   -- floor 0.01
```

`man_days` is `decimal(9,2)`, so the rounded value is authoritative and the effective hours can
differ from the requested hours by up to half a hundredth of a man-day per line. The picker
shows the recomputed hours next to the requested hours so the estimator sees the difference
before adding. `daily_rate` is always taken from the master's `engineering_daily` /
`installation_daily` column — never derived from the hourly column — because
`internal_rate_mismatch` requires exact equality with that column.

**Acceptance criteria.**
- [x] A package can be drafted, published, applied, copied from an existing estimate, retired.
- [x] Applying copies every line in one transaction, or none.
- [x] Every package default is overrideable before the apply is submitted.
- [x] Internal line rates are resolved live from the master at apply time and frozen on the row.
- [x] An `Hourly` line's man-days conversion is explicit and shown before applying.
- [x] A package whose rate master is missing or inactive still applies — see EC-03 fallback.

## EC-03 — ERP category visible during entry (labor lines only) — **this lane**

**Problem.** `materializeErpMappings()` runs at submit/approve and defaults every
`Engineering` man-hour line to `Unmapped`, so the estimator learns the classification only
after submitting. Requirement 2 asks for it during entry.

**Design — narrow.** Both the rate master and the package line carry `default_erp_category`.
`apply-labor-package` writes the matching `estimate_erp_mappings` row inside the same
transaction, and only where no mapping for that line exists yet — a manual classification is
never overwritten. The estimate must be on its current revision and pre-approval, which the
043 trigger already enforces and the apply path already satisfies. `GET /api/v1/labor-rates`
returns the default so the picker can show it before the line exists.

Not in this lane: changing what `materializeErpMappings` defaults for hand-typed lines,
changing summary category visibility, or adding ERP fields to the cost-item path. Those are
EC-04.

**Fallback when a master is absent or inactive (backward compatibility).**
- Migration 044 is **reserved, not required** — see EC-07. The labor-package endpoints probe
  `OBJECT_ID(N'dbo.labor_packages')` and answer `503 labor_packages_unavailable` with a plain
  message on a database still at schema 43, instead of surfacing a SQL error.
- `GET /api/v1/labor-rates` reads only pre-044 columns when the 044 columns are absent, so the
  picker works on schema 43.
- A package line with no resolvable internal master rate fails that one apply with the existing
  `422 engineering_rate_missing`, naming the activity. The package is not silently priced at 0
  and no partial rows are written.
- A package line whose `rate_id` points at a rate that has since been superseded or retired
  still applies: `rate_id` is provenance, the apply always re-resolves from the live master for
  the line's date. `default_erp_category` falls back to `NULL` → the line is left for
  `materializeErpMappings` to default exactly as today.

**Acceptance criteria.**
- [x] Applying a package with an ERP default writes the mapping in the same transaction.
- [x] An existing manual mapping is never overwritten.
- [x] Rate and package endpoints degrade with a clear message on schema 43.

---

## Follow-ups recorded, not implemented

### EC-04 — ERP classification during entry for every cost line
Cost items, expense lines and other-cost lines still learn their ERP category at submit.
- Show the category that `materializeErpMappings` *would* assign, per line, in the cost tab.
- Let an estimator set it before submit without changing who may edit mappings.
- Acceptance: no change to `estimate_erp_mappings` schema or to the 043 trigger's revision and
  status rules; the submit-time materialisation result is unchanged for a line nobody touched;
  `canExport` still requires zero `Unmapped` lines.

### EC-05 — Department is metadata, not an editing restriction
Today `demandNewSection` / `demandExistingSection` gate man-hour writes on estimate **section**
assignment (section `06`), and cost lines on per-category assignment. Requirement 3 asks that
any department may prepare any discipline's costs while authentication, estimate visibility,
approval and revision control stay as they are.
- Decide whether "all departments may prepare all disciplines" means widening
  `estimate_assignments`-based gating or making assignment advisory for preparation only.
- Acceptance: `self_approval_forbidden`, `estimate_owner_required`, the `editableStatuses`
  lock, revision immutability and the approval gates are all provably unchanged; a department
  column on a line remains informational; the change is expressed once, in the shared section
  helpers, not per-endpoint.
- Explicitly out of scope for the labor lane: this is a cross-cutting permission change.

### EC-06 — Estimate cost Excel export format defects
Four defects from `docs/audits/estimate-erp-qa-20260911.md`, D1 first: `fitToWidth` is inert
without `pageSetUpPr fitToPage`, so a printed export does not fit the page.
- Acceptance: each defect has a regression assertion in `tests/erp-estimate-workbook.test.mjs`;
  the seven ERP template sections and the deliberate absence of the reference file's 30% profit
  row are preserved.

### EC-07 — Register migration 044 and align the schema contract
Migration 044 exists as a file but is **not** in `REQUIRED_MIGRATIONS`, so
`REQUIRED_SCHEMA_VERSION` stays 43 and the local launchers, readiness endpoint and their tests
are untouched by this lane.
- Add `{ version: 44, fileName: "044_estimate_labor_masters.sql", name: "Reusable labor rate masters and estimate labor packages" }`
  to `backend-node/src/migration-validation.ts`.
- Extend the launcher version pin and `backend-node/tests/migration-validation.test.ts` from 43
  to 44.
- Apply 044 to Team Test under the normal operator backup/preflight protocol.
- Acceptance: `migrationReadiness` reports ready against a schema-44 database; the labor
  endpoints stop returning `503 labor_packages_unavailable`; no other required identity moves.
- Owner: database/leader lane. This lane must not apply a migration to `202.151.188.68`.

---

## Lane progress

| Task | State | Evidence |
| --- | --- | --- |
| EC-01 | Implemented | `.omx/artifacts/estimate-labor-master/` |
| EC-02 | Implemented | same |
| EC-03 | Implemented | same |
| EC-04 | Recorded | this document |
| EC-05 | Recorded | this document |
| EC-06 | Recorded | this document |
| EC-07 | Recorded | this document |
