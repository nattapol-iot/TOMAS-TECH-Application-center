# Main-based Release Candidate — 2026-09-10

Status: Local integration complete; production release blocked by the gates below. Not deployed.
Owner: Codex Integration Lead. User approved combining main with the feature worktree.

## Frozen inputs

| Input | Identity |
| --- | --- |
| Remote main | `IoT-Team-Center/main`, `d43eb346d3706e78e65a92031427b4b1e1e4954f`; checked against `git ls-remote` before integration |
| Feature HEAD | `aef445fd40910b49e4d2387323aed2b67ac0ef7f` |
| Preserved local source snapshot | `672f1d0b457173f9b7afdcc18884164262d3dfcf`, branch `codex/integration-source-20260910` |
| Candidate branch | `codex/production-candidate-20260910` |
| Candidate checkout | `C:/Work/IoT-release-candidate-20260910` |

The snapshot used a temporary Git index. It preserved the selected app, backend source/tests, database, lib, tests, scripts, docs, README/DESIGN/COORDINATION and package changes without staging or resetting the original worktree. Untracked operational scratch files, credentials and nested release checkouts were not added. The snapshot is a recovery reference, not a deployable version.

## Required feature union

| Source | Features to preserve | Verification anchors |
| --- | --- | --- |
| main | TMT ID/session/auth-origin behavior | tmt-id client/API and auth restoration tests |
| main | NAS settings and storage, Mac deployment files | NAS config/admin/storage source; actual connectivity remains unverified |
| main | Quotation PDF parsing + line items/Price Library | parser sources, quotation API, migration038 |
| main | Inspection/report PDF/PPTX and report export archives | inspection/report exporters, migration037 exports |
| source REC-01 | Project document handover with overhead | project-handover and carryover tests; SQL acceptance pending |
| source REC-02 | Admin primary role management | role modal/API + new forward role migration; old duplicate037 must not enter candidate |
| source REC-03 | Inquiry queue and Estimate guidance | queue/UX tests and existing nine-tab workflow |
| source REC-04 | Excel originals, published templates, overhead | server workbook validation, templates, overhead snapshots and migration040 |
| source REC-05 | Engineering-rate access and session restore | rate policy and contact/auth regression tests |
| source REC-06 | Workspace-local build guard | guard test; builds occur in this isolated checkout |
| source | Performance Pulse and KPI insight evidence | frontend Pulse + backend insights tests |

The union retains all existing F01–F22 flows. Source presence and unit checks are not substitutes for role-based browser/SQL acceptance of those flows.

## Migration boundary

Keep main's 037 report exports, 038 quotation lines and 039 NAS settings, and local 040 overhead. Role management must be an idempotent forward migration with a unique new version. Refuse a database whose version037 already means legacy role management; do not silently relabel its applied history or delete it. Production target history has not been inspected, so this candidate's schema repair is not permission to migrate a live database.

## Verification and release boundary

Resolve semantic merge conflicts, then run frontend lint/type/unit and both backend type/unit/build checks. Build only in this isolated checkout with synthetic public configuration, never with copied production secrets. Record exact outcomes and candidate SHA after review.

No push to main, deployment, service restart, company database write, real signing or customer-data test is part of this local integration. The production rollout still requires target schema reconciliation, non-skipped SQL/browser UAT, recovery evidence and the release decision in PRODUCTION_BACKLOG.md.

## Node SQL acceptance

`backend-node/package.json` now exposes `test:sql-integration` for original XLSX, overhead and document handover. `.github/workflows/integration.yml` gives these tests their own disposable SQL Server service and requires all three scripts to finish without skipping. The legacy .NET material job remains separate.

The Node harness requires explicit `IOT_RUN_SQL_INTEGRATION=1`, `IOT_SQL_TEST_SERVER`, `IOT_SQL_TEST_USER` and `IOT_SQL_TEST_PASSWORD`; it rejects non-loopback targets and uses generated, validated test database names. SQL passwords are passed to sqlcmd through its environment, not process arguments. The API uses SQL authentication, matching main's cross-platform driver. Missing configuration fails before connection/DDL.

This job has been authored locally, not run on GitHub or against SQL Server in this session. Docker is unavailable on this workstation. Its first successful non-skipped CI run remains a release gate; static configuration/unit checks cannot certify the SQL statements.

## Review and remaining release blockers

Independent code review covered 81 candidate files and a final 10-file remediation delta. Final verdict: APPROVE local candidate integration; REQUEST CHANGES for Production. The architecture review covered 44 files and returned WATCH: the integrated structure is usable, but deployment topology, target schema and runtime acceptance still need evidence. These verdicts apply to the reviewed local changes, not to the running service.

- **COST-01, open:** migration040 can overflow `decimal(19,4)` when accepted `internal_direct_hours * hourly_rate` or final totals exceed the supported range. Per-policy rate validation is now bounded, but it does not bound aggregate cost. Add a forward migration and coordinated validation for every mutation/approval/import/template path, with boundary tests. Do not rewrite an already-applied040 or hide overflow with a zero/NULL total.
- **CI-02 / DB-01, open:** run the newly authored Node SQL job without skips, including fresh/upgrade and restricted-role acceptance. The three current cases use an isolated SQL administrator for fixture/API setup; their success alone will not prove application least-privilege grants. Inspect the actual target's migration identities/checksums separately before any upgrade.
- **UX-01 / QA-01–22, open:** exercise role-based browser flows and persisted results on isolated staging. Main's TMT ID, NAS and report/quotation features and the recovered Estimate/Pulse features remain in source, but this session has not certified live end-to-end behavior.
- **REL-02 / REL-04 / OPS-02, open:** verify the intended production runtime and configuration, artifact promotion, recovery and rollback. The inherited Mac deployment still uses development compose behavior; this candidate does not make that topology production-ready.

Review fixes included mandatory original XLSX upload with server parsing/preview reconciliation, standard document upload/download limits, unique forward role migration041, migration identity/readiness checks, and a loopback-only SQL-auth test harness. No real database or runtime was changed.

## Local verification evidence

| Check | Result and scope |
| --- | --- |
| Backend typecheck, unit tests, build | PASS; 129 tests, 0 failures, 0 skips |
| Frontend lint, typecheck, unit tests | PASS; full `npm test` completed with 223 passing tests, 0 failures and 1 explicitly skipped SQL integration (`IOT_SKIP_SQL_INTEGRATION=1`) |
| Frontend production build | PASS with synthetic `candidate.test` TMT ID public settings; generated output is verification-only and must not be deployed |
| Workflow YAML | Both modified workflow files parsed successfully; GitHub jobs were not executed |
| Markdown navigation | 112 Markdown files inspected, 259 local links checked, 0 missing targets |
| Merge / whitespace | No unresolved merge index entries; staged and unstaged diff checks pass |

Local logs are stored in the workstation temporary directory as `iot-candidate-final-root.log`, `iot-candidate-final-backend.log` and `iot-candidate-build.log`. They are local diagnostics, not durable CI artifacts. The commit containing this record on `codex/production-candidate-20260910` freezes the candidate; retrieve its exact identity with `git log -1 --format=%H -- docs/planning/CANDIDATE_INTEGRATION.md`.

## Next execution order

1. Fix COST-01 aggregate limits with forward SQL changes and boundary coverage.
2. Run Node SQL CI and extend restricted-role/upgrade acceptance; reconcile the staging target's schema history.
3. Use this one candidate branch for role-based UAT, production configuration and recovery rehearsal; record each result in [PRODUCTION_BACKLOG.md](PRODUCTION_BACKLOG.md).
4. Make the release decision only after the P0 gates are closed. Keep development work on short-lived branches from this integrated baseline so older worktrees do not overwrite recovered features.
