# Local verification evidence - 2026-09-10

Scope: working tree at HEAD aef445fd40910b49e4d2387323aed2b67ac0ef7f; pre-existing dirty/untracked application work is included. No production readiness certification.

## Commands and results

- Node backend: npm.cmd run typecheck passed; npm.cmd test: 110 passed, 0 failed, 0 skipped.
- Root npm.cmd test did not finish: lint traversed generated bundles in nested .codex-tmp worktrees. The specifically identified audit lint process was stopped. This is NOT a lint pass; the test script never reached typecheck/unit execution.
- Separate root typecheck: node node_modules/typescript/bin/tsc --noEmit --incremental false failed with 29 diagnostics, including outputs/company-cutover dependencies/types. This is not proof that active application source has all of these defects.
- Separate root tests: IOT_SKIP_SQL_INTEGRATION=1; node --test --test-isolation=none tests/*.test.mjs. 222 total; 211 passed; 10 failed; 1 SQL integration explicitly skipped. No SQL integration or production build was performed.
- PowerShell blocks npm.ps1 on this machine; npm.cmd was used without changing execution policy.

## Test output summary

~~~text
✖ master create fills role data without replacing typed department and requires the person's name (53.6488ms)
✖ master editing restores saved roles and explicitly clears removed values (43.0237ms)
✖ neither customer form sends role data without a named contact (81.4829ms)
✖ Master editing restores titles and clears each title while preserving row version and legacy contact (50.8303ms)
✖ title alone requires a contact name on both customer forms (69.3234ms)
✖ production workspace exposes API-backed menus with Inquiry as the intake entry (2.1076ms)
✖ estimate revisions remain immutable and writes are record-scoped (3.9836ms)
✖ Knowledge Hub is permission-filtered, revision-safe, and included in production deployment (2.3183ms)
✖ the site visit module is part of deployment and of the production baseline (1.9266ms)
✖ role management migration grants Admin permission and only column-scoped user updates (1.5841ms)
ℹ tests 222
ℹ suites 0
ℹ pass 211
ℹ fail 10
ℹ cancelled 0
ℹ skipped 1
ℹ todo 0
ℹ duration_ms 4240.208
✖ failing tests:
✖ master create fills role data without replacing typed department and requires the person's name (53.6488ms)
✖ master editing restores saved roles and explicitly clears removed values (43.0237ms)
✖ neither customer form sends role data without a named contact (81.4829ms)
✖ Master editing restores titles and clears each title while preserving row version and legacy contact (50.8303ms)
✖ title alone requires a contact name on both customer forms (69.3234ms)
✖ production workspace exposes API-backed menus with Inquiry as the intake entry (2.1076ms)
✖ estimate revisions remain immutable and writes are record-scoped (3.9836ms)
✖ Knowledge Hub is permission-filtered, revision-safe, and included in production deployment (2.3183ms)
✖ the site visit module is part of deployment and of the production baseline (1.9266ms)
✖ role management migration grants Admin permission and only column-scoped user updates (1.5841ms)
~~~

## Typecheck sample

~~~text
outputs/company-cutover/backend-node/src/app.ts(1,20): error TS2307: Cannot find module '@fastify/cookie' or its corresponding type declarations.
outputs/company-cutover/backend-node/src/app.ts(2,18): error TS2307: Cannot find module '@fastify/cors' or its corresponding type declarations.
outputs/company-cutover/backend-node/src/app.ts(13,23): error TS2307: Cannot find module '@fastify/multipart' or its corresponding type declarations.
outputs/company-cutover/backend-node/src/app.ts(14,23): error TS2307: Cannot find module '@fastify/rate-limit' or its corresponding type declarations.
outputs/company-cutover/backend-node/src/app.ts(91,14): error TS7006: Parameter 'origin' implicitly has an 'any' type.
outputs/company-cutover/backend-node/src/app.ts(91,22): error TS7006: Parameter 'callback' implicitly has an 'any' type.
outputs/company-cutover/backend-node/src/app.ts(112,20): error TS7006: Parameter 'request' implicitly has an 'any' type.
outputs/company-cutover/backend-node/src/auth.ts(2,47): error TS2307: Cannot find module 'jose' or its corresponding type declarations.
outputs/company-cutover/backend-node/src/auth.ts(74,7): error TS2322: Type 'import("C:/Work/002. Project/99999. TOMAS TECH/02. IoT Team application/.claude/worktrees/estimate-cost-management-ui-632fcb/outputs/company-cutover/backend-node/src/types").Identity' is not assignable to type 'import("C:/Work/002. Project/99999. TOMAS TECH/02. IoT Team application/.claude/worktrees/estimate-cost-management-ui-632fcb/backend-node/dist/src/types").Identity'.
outputs/company-cutover/backend-node/src/auth.ts(78,7): error TS2322: Type 'import("C:/Work/002. Project/99999. TOMAS TECH/02. IoT Team application/.claude/worktrees/estimate-cost-management-ui-632fcb/outputs/company-cutover/backend-node/src/types").Identity' is not assignable to type 'import("C:/Work/002. Project/99999. TOMAS TECH/02. IoT Team application/.claude/worktrees/estimate-cost-management-ui-632fcb/backend-node/dist/src/types").Identity'.
~~~

## Git scope snapshot

After documentation relocation/status changes, the root suite was repeated with the same SQL skip flag: 222 total, 211 pass, 10 fail, 1 skip, process exit 1. The final log is `iot-doc-audit-final-unit-20260910.log` in the same OS temporary directory. No additional root-test failures were introduced by the documentation edits.

## Documentation verification

An inline Node filesystem check compared the 38 relocated documents with the pre-edit snapshot, normalizing only Markdown link targets. All 38 preserved their original text; all old paths retained forwarding documents. Original SHA-256 values are recorded in the relocation manifest.

The final scan covered 103 first-party Markdown files and resolved 240 local Markdown file links: 0 missing targets. It checked file existence, not external URLs or heading-anchor semantics. All 14 required DESIGN sections remained present. The feature register contains F01–F22, and the backlog contains 39 unique task IDs. Vendor Markdown, nested worktrees and generated outputs are outside the canonical documentation set.

`git diff --check -- README.md DESIGN.md COORDINATION.md docs` passed. The planner artifact is `.omx/plans/production-recovery-2026-09-10.md`. Existing application changes were left in place; no code or schema fixes are claimed by this documentation audit.

~~~text
aef445fd docs: record verified project handover deployment
f9821c96 feat: allow admins to manage user roles
35318d56 feat: hand over inquiry documents into project folders
4b4c16ed docs: document application architecture and workspace design
50d63077 fix: bind LAN firewall rules to the active API runtime
8b11c3ff feat: add employee performance pulse insights
~~~

Local remote-tracking ref IoT-Team-Center/main: d43eb346d3706e78e65a92031427b4b1e1e4954f. This is a locally available Git ref, not proof of latest remote or running deployment.

Raw logs were captured under the local OS temporary directory (iot-doc-audit-frontend-20260910.log, iot-doc-audit-backend-20260910.log, iot-doc-audit-unit-20260910.log, iot-doc-audit-typecheck-20260910.log). This document preserves the useful result summary; raw logs contain large assertion source dumps and are not included in canonical documentation.
