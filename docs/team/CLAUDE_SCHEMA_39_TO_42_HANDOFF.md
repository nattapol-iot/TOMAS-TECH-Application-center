# Claude handoff — Team Test schema 39 to 42

Work from `C:\Work\IoT-release-candidate-20260910` on branch `local/app-development-20260910`.

The detailed execution plan and ready-to-paste prompt are in `.omx/plans/schema-39-to-42-claude-handoff.md` on this workstation.

## Claude ownership

Claude may create only:

- `scripts/Invoke-TeamTestSchemaPreflight.ps1`
- `scripts/Test-TeamTestUpgrade39To43LocalDb.ps1` (extended after handoff to cover the ERP schema 43 migration)
- `scripts/Invoke-TeamTestSchemaUpgrade.ps1`
- `database/tests/schema-39-to-42-upgrade.sql`
- `database/tests/schema-39-to-42-preflight-blockers.sql`
- `tests/schema-upgrade-guardrails.test.mjs`
- `docs/planning/TEAMTEST_UPGRADE_39_TO_42.md`

Claude must not edit existing migrations, backend runtime, local launchers, `COORDINATION.md` or `dist/**`.

## Tasks

1. Build a SELECT-only, DPAPI-aware remote preflight tool pinned to the exact Team Test database.
2. Rehearse schema 39→40→41→42 and negative blockers on a disposable private LocalDB instance.
3. Build a backup-first upgrade script with secure DBA credentials, exact-database confirmation and inert `-WhatIf` mode.
4. Add source guardrails and an operator runbook.
5. Run all verification listed in the detailed plan, commit locally without pushing and hand the evidence to Codex.

## Remote boundary

Claude must not connect to, back up, migrate, grant permissions on, restart services for, or mutate `202.151.188.68`. Claude runs the upgrade script with `-WhatIf` only. Codex/operator owns the real preflight, backup, migration, restart and post-upgrade validation.
