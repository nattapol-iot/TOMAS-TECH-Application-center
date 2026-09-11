# Labor lane — EC-01/02/03 evidence summary

Worktree `C:\Work\IoT-labor-master-20260911` · branch `claude/estimate-labor-master-20260911`
Base `1b6de4be` on `local/app-development-20260910`. 2026-09-11.

Design and backlog: `docs/planning/ESTIMATE_COST_IMPROVEMENT_TASKS.md`.
Raw output: `validation.txt` (typecheck / lint / tests / builds) and
`localdb-044-acceptance.txt` (the SQL acceptance run).

## What was built

| Task | Delivered |
| --- | --- |
| EC-01 | `GET /api/v1/labor-rates` entry-time rate search; `POST /api/v1/master/engineering-rates/:id/supersede`; `POST /api/v1/master/engineering-rates/:id/retire`. Migration 044 adds code, role/activity, ERP default, version and supersede chain to `dbo.engineering_rates`. |
| EC-02 | `dbo.labor_packages` + `dbo.labor_package_lines`; full CRUD, publish/retire, `from-estimate` capture, and `POST /api/v1/estimates/:id/apply-labor-package`. |
| EC-03 | Rate masters and package lines carry `default_erp_category`; applying a package seeds `dbo.estimate_erp_mappings` in the same transaction, never overwriting an existing mapping. |

## The claim that mattered, proved against a real SQL Server

Deployed `001`→`043` fresh, applied `044`, then ran
`database/tests/estimate-labor-master-044.sql` on a disposable LocalDB instance
(`LaborMaster0911`, deleted afterwards; `MSSQLLocalDB` and the Codex `IoTCostCI_*` /
`IoTUpg3942CI_*` instances untouched; `202.151.188.68` never contacted).

```
PASS - 14 rejection checks plus the rate-freeze, validity, resolution,
       ERP-seeding and package-storage assertions.
  saved line daily_rate before/after supersede : 5000.0000 / 5000.0000
  saved line cost before/after supersede       : 12500.0000 / 12500.0000
  estimate engineering total before/after      : 12500.0000 / 12500.0000
  rate resolved on 2026-02-10 / 2026-03-15     : 5000.0000 / 5600.0000
Rollback verified: the fixture left no rows behind.
```

What that run establishes:

- Superseding a rate master leaves an already-saved man-hour line's `daily_rate`,
  its `line_cost` and the estimate's `engineering_total` bit-for-bit unchanged.
- The saved line **still passes** `dbo.fn_estimate_validation`. This is the failure
  mode an in-place rate edit would cause: `internal_rate_mismatch` would start
  failing `POST /api/v1/estimates/:id/submit` with 422 on estimates nobody had
  touched. Closing the incumbent the day before the successor starts avoids it.
- A date inside the old window still resolves the old rate; a date after the change
  resolves the new one. Old and new lines validate side by side.
- Deactivating a rate **does** raise `internal_rate_mismatch` — which is why the API
  exposes supersede and retire but never `is_active = 0`. The fixture asserts the
  failure so the refusal has evidence behind it, not just prose.
- 14 deliberate bad writes are all rejected by the database: hourly line without
  hours, daily line carrying hours, supplier line without a reference rate, zero
  effort, >24h day, unknown ERP category, `Unmapped` as a default, unknown cost
  type/status, retired package without a stamp, duplicate code, half-linked
  supersede chain, and an overlapping active rate period (trigger 51020).

Migration safety, same run:

- Re-running `044` on an already-stamped database is refused with `51441`.
- After deleting only the `schema_versions` row, the whole file re-applies cleanly
  (exit 0) and re-stamps 44 — the guarded DDL survives an interrupted attempt.

## Automated validation

| Check | Result | Baseline on the candidate worktree |
| --- | --- | --- |
| `backend-node` typecheck | pass | pass |
| `backend-node` build (`tsc -p`) | pass | pass |
| `backend-node` tests | 184 pass / 0 fail / 0 skip | 145 pass / 0 fail / 0 skip |
| new backend suites alone | 39 pass / 0 fail | — |
| frontend lint | pass | pass |
| frontend typecheck | pass | pass |
| root suite (`npm test`) | 251 pass / 0 fail / 0 skip | 237 pass / 0 fail / 0 skip |
| new frontend suite alone | 14 pass / 0 fail | — |
| frontend production build (`vinext build`) | pass | — |

Net: +39 backend tests, +14 root tests, no pre-existing test changed.

One pre-existing guardrail caught this work and was obeyed rather than adjusted:
`tests/estimate-total-guardrails.test.mjs` requires every source that writes a
totals-feeding table to call `assertEstimateTotals` itself. `apply-labor-package`
now calls it explicitly instead of relying on `touchEstimate` to do it.

## Isolation

- Implemented in a new worktree, its own branch, its own `node_modules` (`npm ci`)
  and its own `dist/`. The candidate's `dist/` is unchanged (last written
  2026-09-11 00:02; the isolated build ran at 15:36).
- The user's runtime stayed up throughout: `http://127.0.0.1:3010/` answered 200
  after the isolated build; the API on `127.0.0.1:5116` answered (401 without a
  credential, i.e. alive). No service was restarted.
- No migration applied to `202.151.188.68`, no remote data read or written, no
  push, no merge, no branch moved.
- `044` is reserved, **not** registered in `REQUIRED_MIGRATIONS`, so
  `REQUIRED_SCHEMA_VERSION` stays 43 and the local launchers and readiness endpoint
  are untouched. Registering it is EC-07, owned by the database/leader lane.

## Known gaps

1. No authenticated end-to-end run. No Team Test credential was supplied, so the
   new endpoints were exercised through route-level tests against a captured SQL
   layer, plus the SQL acceptance fixture — not through a signed-in browser session.
2. Until EC-07 registers `044`, the labor-package endpoints answer
   `503 labor_packages_unavailable` against a schema-43 database. `GET /api/v1/labor-rates`
   works either way and reports `masterFieldsAvailable: false`.
3. `dbo.manhour_lines` has no reference column, so a package apply records its
   provenance in `audit_log` (package code, revision, and the resolved rate per
   line) rather than on the line. The line itself carries the frozen `daily_rate`
   and `price_date`. Adding a column would also have needed the revision-clone
   column list in `routes/estimates.ts`, which belongs to another lane.
4. The labor package library is reachable from the Estimate man-hour tab only;
   there is no separate navigation screen, to avoid editing `ProductionApp.tsx`.
5. No i18n dictionary entries were added. The new UI renders English through
   `LocalizedText` fallback. TH/JA copy is a follow-up.
