:on error exit
-- Post-upgrade verification for the Team Test schema 39 -> 42 rehearsal.
-- Runs only against the disposable LocalDB database created by
-- scripts/Test-TeamTestUpgrade39To42LocalDb.ps1. It reads and asserts; the only
-- objects it creates are a loginless test user inside a rolled-back transaction.
SET NOCOUNT ON;
SET XACT_ABORT ON;
SET ANSI_NULLS ON;
SET QUOTED_IDENTIFIER ON;

DECLARE @fixture_database sysname = DB_NAME();
IF LEFT(@fixture_database, LEN(N'IoTTeamCenter_Upgrade3942CI_')) <> N'IoTTeamCenter_Upgrade3942CI_'
   OR LEN(@fixture_database) <> LEN(N'IoTTeamCenter_Upgrade3942CI_') + 32
   OR RIGHT(@fixture_database, 32) COLLATE Latin1_General_100_BIN2 LIKE N'%[^0-9a-f]%'
    THROW 51940, 'Schema 39-42 upgrade fixture refuses to run outside its exact synthetic CI database name.', 1;
GO

-- ---------------------------------------------------------------------------
-- 1. Exact migration identities and a contiguous 1-42 history.
-- ---------------------------------------------------------------------------
IF EXISTS (
    SELECT expected.version
    FROM (VALUES
        (40, N'Immutable overhead policies and estimate revision snapshots'),
        (41, N'Admin-managed primary user roles with audited least-privilege writes'),
        (42, N'Guard estimate aggregates within supported decimal precision')
    ) expected(version, name)
    LEFT JOIN dbo.schema_versions installed
      ON installed.version = expected.version AND installed.name = expected.name
    WHERE installed.version IS NULL
)
    THROW 51941, 'Migrations 040-042 did not record their exact schema identities.', 1;

IF (SELECT MAX(version) FROM dbo.schema_versions) <> 42
   OR (SELECT COUNT(*) FROM dbo.schema_versions) <> 42
   OR EXISTS (
        SELECT number FROM (SELECT TOP (42) ROW_NUMBER() OVER (ORDER BY (SELECT NULL)) AS number
                            FROM sys.all_objects) sequence
        WHERE NOT EXISTS (SELECT 1 FROM dbo.schema_versions WHERE version = sequence.number)
   )
    THROW 51942, 'Schema history is not a contiguous 1-42 after the upgrade.', 1;

IF EXISTS (SELECT 1 FROM dbo.schema_versions WHERE version = 37 AND name = N'Admin-managed primary user roles with audited least-privilege writes')
    THROW 51943, 'The legacy role-management identity survived at version 37.', 1;
GO

-- ---------------------------------------------------------------------------
-- 2. Objects created by migration 040.
-- ---------------------------------------------------------------------------
IF OBJECT_ID(N'dbo.overhead_policies', N'U') IS NULL
   OR OBJECT_ID(N'dbo.estimate_overhead_snapshots', N'U') IS NULL
   OR OBJECT_ID(N'dbo.estimate_submission_snapshots', N'U') IS NULL
    THROW 51944, 'Migration 040 did not create every expected table.', 1;

IF OBJECT_ID(N'dbo.v_estimate_totals', N'V') IS NULL
    THROW 51945, 'dbo.v_estimate_totals is missing after the upgrade.', 1;

IF EXISTS (
    SELECT expected.column_name
    FROM (VALUES (N'base_total'), (N'overhead_state'), (N'overhead_total'),
                 (N'overhead_policy_id'), (N'overhead_hourly_rate'),
                 (N'internal_direct_hours'), (N'contingency_total'), (N'total')
    ) expected(column_name)
    WHERE NOT EXISTS (
        SELECT 1 FROM sys.columns
        WHERE object_id = OBJECT_ID(N'dbo.v_estimate_totals') AND name = expected.column_name
    )
)
    THROW 51946, 'dbo.v_estimate_totals is missing an expected overhead or total column.', 1;

IF NOT EXISTS (
    SELECT 1 FROM sys.triggers
    WHERE name = N'trg_estimate_overhead_snapshots_immutable'
      AND parent_id = OBJECT_ID(N'dbo.estimate_overhead_snapshots') AND is_disabled = 0
)
    THROW 51947, 'The overhead snapshot immutability trigger is missing or disabled.', 1;

IF NOT EXISTS (
    SELECT 1 FROM sys.triggers
    WHERE name = N'trg_estimate_submission_snapshots_immutable'
      AND parent_id = OBJECT_ID(N'dbo.estimate_submission_snapshots') AND is_disabled = 0
)
    THROW 51948, 'The submission snapshot immutability trigger is missing or disabled.', 1;
GO

-- ---------------------------------------------------------------------------
-- 3. Permission surface created by migrations 040 and 041.
-- ---------------------------------------------------------------------------
IF DATABASE_PRINCIPAL_ID(N'iot_team_app_role') IS NULL
    THROW 51949, 'The rehearsal must create iot_team_app_role before 040 so the conditional grants are exercised.', 1;

DECLARE @app_role int = DATABASE_PRINCIPAL_ID(N'iot_team_app_role');

IF EXISTS (
    SELECT expected.object_name, expected.permission_name
    FROM (VALUES
        (N'dbo.overhead_policies', N'SELECT', N'G'),
        (N'dbo.overhead_policies', N'INSERT', N'G'),
        (N'dbo.overhead_policies', N'UPDATE', N'D'),
        (N'dbo.overhead_policies', N'DELETE', N'D'),
        (N'dbo.estimate_overhead_snapshots', N'SELECT', N'G'),
        (N'dbo.estimate_overhead_snapshots', N'INSERT', N'G'),
        (N'dbo.estimate_overhead_snapshots', N'UPDATE', N'D'),
        (N'dbo.estimate_overhead_snapshots', N'DELETE', N'D'),
        (N'dbo.estimate_submission_snapshots', N'SELECT', N'G'),
        (N'dbo.estimate_submission_snapshots', N'INSERT', N'G'),
        (N'dbo.estimate_submission_snapshots', N'UPDATE', N'D'),
        (N'dbo.estimate_submission_snapshots', N'DELETE', N'D'),
        (N'dbo.assert_estimate_totals', N'EXECUTE', N'G')
    ) expected(object_name, permission_name, state)
    WHERE NOT EXISTS (
        SELECT 1 FROM sys.database_permissions
        WHERE grantee_principal_id = @app_role
          AND major_id = OBJECT_ID(expected.object_name)
          AND minor_id = 0
          AND permission_name = expected.permission_name
          AND state = expected.state
    )
)
    THROW 51950, 'Migrations 040/042 did not leave the expected least-privilege grants on iot_team_app_role.', 1;

-- Migration 041 grants UPDATE on exactly two columns of dbo.users, not the table.
IF EXISTS (
    SELECT expected.column_name
    FROM (VALUES (N'role_id'), (N'updated_at')) expected(column_name)
    WHERE NOT EXISTS (
        SELECT 1 FROM sys.database_permissions permission
        INNER JOIN sys.columns target
            ON target.object_id = permission.major_id AND target.column_id = permission.minor_id
        WHERE permission.grantee_principal_id = @app_role
          AND permission.major_id = OBJECT_ID(N'dbo.users')
          AND permission.permission_name = N'UPDATE'
          AND permission.state = N'G'
          AND target.name = expected.column_name
    )
)
    THROW 51951, 'Migration 041 did not grant column-scoped UPDATE on dbo.users(role_id, updated_at).', 1;

IF EXISTS (
    SELECT 1 FROM sys.database_permissions
    WHERE grantee_principal_id = @app_role
      AND major_id = OBJECT_ID(N'dbo.users')
      AND minor_id = 0
      AND permission_name = N'UPDATE'
      AND state = N'G'
)
    THROW 51952, 'Migration 041 granted table-wide UPDATE on dbo.users; the grant must stay column-scoped.', 1;

IF EXISTS (
    SELECT 1 FROM sys.database_permissions
    WHERE grantee_principal_id = DATABASE_PRINCIPAL_ID(N'public')
      AND major_id = OBJECT_ID(N'dbo.assert_estimate_totals')
      AND permission_name = N'EXECUTE'
      AND state IN (N'G', N'W')
)
    THROW 51953, 'EXECUTE on dbo.assert_estimate_totals is still granted to public.', 1;

IF NOT EXISTS (SELECT 1 FROM dbo.permissions WHERE code = N'admin.manage_roles')
    THROW 51954, 'Migration 041 did not seed the admin.manage_roles permission.', 1;

IF EXISTS (
    SELECT 1
    FROM dbo.role_permissions role_permission
    INNER JOIN dbo.permissions permission ON permission.id = role_permission.permission_id
    INNER JOIN dbo.roles role ON role.id = role_permission.role_id
    WHERE permission.code = N'admin.manage_roles' AND role.code <> N'Admin'
)
    THROW 51955, 'admin.manage_roles is mapped to a role other than Admin.', 1;

IF NOT EXISTS (
    SELECT 1
    FROM dbo.role_permissions role_permission
    INNER JOIN dbo.permissions permission ON permission.id = role_permission.permission_id
    INNER JOIN dbo.roles role ON role.id = role_permission.role_id
    WHERE permission.code = N'admin.manage_roles' AND role.code = N'Admin'
)
    THROW 51956, 'admin.manage_roles is not mapped to the Admin role.', 1;
GO

-- ---------------------------------------------------------------------------
-- 4. dbo.assert_estimate_totals is present, owner-executing and callable by the
--    restricted application role.
-- ---------------------------------------------------------------------------
IF OBJECT_ID(N'dbo.assert_estimate_totals', N'P') IS NULL
    THROW 51957, 'Migration 042 did not create dbo.assert_estimate_totals.', 1;

-- execute_as_principal_id = -2 is EXECUTE AS OWNER.
IF NOT EXISTS (
    SELECT 1 FROM sys.sql_modules
    WHERE object_id = OBJECT_ID(N'dbo.assert_estimate_totals') AND execute_as_principal_id = -2
)
    THROW 51958, 'dbo.assert_estimate_totals is not declared WITH EXECUTE AS OWNER.', 1;

BEGIN TRANSACTION;

CREATE USER [schema_3942_upgrade_test] WITHOUT LOGIN;
ALTER ROLE [iot_team_app_role] ADD MEMBER [schema_3942_upgrade_test];
EXECUTE AS USER = N'schema_3942_upgrade_test';
IF COALESCE(HAS_PERMS_BY_NAME(N'dbo.assert_estimate_totals', N'OBJECT', N'EXECUTE'), 0) <> 1
BEGIN
    REVERT;
    THROW 51959, 'The restricted application role cannot execute the aggregate guard after the upgrade.', 1;
END;
-- No estimate with this identity exists, so the guard validates an empty set and
-- proves only that an application-role member can call it.
EXEC dbo.assert_estimate_totals @estimate_id = -1;
REVERT;

ROLLBACK TRANSACTION;
GO

PRINT N'Schema 39-42 upgrade verification fixture passed.';
