:on error exit
-- Read-only production baseline verification.
-- Required SQLCMD variables: DatabaseName, AppLogin

USE [$(DatabaseName)];
GO

SET NOCOUNT ON;
SET XACT_ABORT ON;

IF COALESCE(HAS_PERMS_BY_NAME(NULL, NULL, N'VIEW ANY DEFINITION'), 0) <> 1
    THROW 51092, 'Run the baseline verifier with an approved audit/DBA identity that can view all server principal metadata.', 1;

IF NOT EXISTS (SELECT 1 FROM dbo.schema_versions WHERE version = 5)
    THROW 51070, 'Required schema version 5 is not installed.', 1;

IF OBJECT_ID(N'dbo.issue_document_number', N'P') IS NULL
   OR OBJECT_ID(N'dbo.fn_estimate_validation', N'IF') IS NULL
   OR OBJECT_ID(N'dbo.v_estimate_totals', N'V') IS NULL
   OR OBJECT_ID(N'dbo.v_item_balances', N'V') IS NULL
   OR OBJECT_ID(N'dbo.trg_estimate_revisions_append_only', N'TR') IS NULL
   OR OBJECT_ID(N'dbo.trg_cost_items_current_revision_only', N'TR') IS NULL
   OR OBJECT_ID(N'dbo.trg_manhour_lines_current_revision_only', N'TR') IS NULL
   OR OBJECT_ID(N'dbo.trg_expense_lines_current_revision_only', N'TR') IS NULL
   OR OBJECT_ID(N'dbo.trg_other_cost_lines_current_revision_only', N'TR') IS NULL
   OR OBJECT_ID(N'dbo.trg_stock_txns_append_only', N'TR') IS NULL
   OR OBJECT_ID(N'dbo.trg_mat_audit_append_only', N'TR') IS NULL
    THROW 51071, 'A required production procedure, function, or view is missing.', 1;

IF NOT EXISTS (SELECT 1 FROM sys.database_principals WHERE name = N'iot_team_app_role' AND type = 'R')
    THROW 51072, 'The least-privileged application role is missing.', 1;

DECLARE @app_role_id int = DATABASE_PRINCIPAL_ID(N'iot_team_app_role');
DECLARE @app_user_id int = DATABASE_PRINCIPAL_ID(N'$(AppLogin)');
DECLARE @app_login_id int = SUSER_ID(N'$(AppLogin)');

IF @app_login_id IS NULL OR @app_user_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM sys.database_role_members
    WHERE role_principal_id = @app_role_id AND member_principal_id = @app_user_id)
    THROW 51073, 'The expected application user is not a member of iot_team_app_role.', 1;

IF EXISTS (
    SELECT 1 FROM sys.server_role_members
    WHERE member_principal_id = @app_login_id)
    THROW 51074, 'The application login must not belong to a fixed or custom server role.', 1;

IF EXISTS (
    SELECT 1 FROM sys.server_permissions
    WHERE grantee_principal_id = @app_login_id
      AND state IN ('G', 'W')
      AND permission_name <> N'CONNECT SQL')
    THROW 51087, 'The application login has an unexpected direct server permission.', 1;

IF EXISTS (
    SELECT 1 FROM sys.database_role_members
    WHERE (member_principal_id = @app_user_id AND role_principal_id <> @app_role_id)
       OR member_principal_id = @app_role_id)
    THROW 51088, 'The application user must belong only to iot_team_app_role, and that role must not be nested in another role.', 1;

IF EXISTS (
    SELECT 1 FROM sys.database_permissions
    WHERE grantee_principal_id = @app_user_id
      AND state IN ('G', 'W')
      AND permission_name <> N'CONNECT')
    THROW 51089, 'The application user has an unexpected direct database permission.', 1;

IF EXISTS (SELECT 1 FROM sys.databases WHERE database_id = DB_ID() AND owner_sid = SUSER_SID(N'$(AppLogin)'))
   OR EXISTS (SELECT 1 FROM sys.schemas WHERE principal_id = @app_user_id)
   OR EXISTS (SELECT 1 FROM sys.objects WHERE principal_id = @app_user_id)
    THROW 51090, 'The application login/user must not own the database, a schema, or an object.', 1;

DECLARE @required_material_permissions TABLE (
    object_name sysname NOT NULL,
    permission_name nvarchar(60) NOT NULL,
    is_effective bit NULL,
    PRIMARY KEY (object_name, permission_name)
);

INSERT INTO @required_material_permissions (object_name, permission_name)
VALUES
    (N'mat_items', N'SELECT'),
    (N'boms', N'SELECT'), (N'boms', N'INSERT'), (N'boms', N'UPDATE'),
    (N'bom_lines', N'SELECT'), (N'bom_lines', N'INSERT'),
    (N'reservations', N'SELECT'), (N'reservations', N'INSERT'), (N'reservations', N'UPDATE'),
    (N'mat_prs', N'SELECT'), (N'mat_prs', N'INSERT'), (N'mat_prs', N'UPDATE'),
    (N'mat_pr_lines', N'SELECT'), (N'mat_pr_lines', N'INSERT'),
    (N'mat_pr_approval_steps', N'SELECT'), (N'mat_pr_approval_steps', N'INSERT'),
    (N'mat_pr_approval_steps', N'UPDATE'), (N'mat_pr_approval_steps', N'DELETE'),
    (N'mat_pos', N'SELECT'), (N'mat_pos', N'INSERT'), (N'mat_pos', N'UPDATE'),
    (N'mat_po_lines', N'SELECT'), (N'mat_po_lines', N'INSERT'),
    (N'grns', N'SELECT'), (N'grns', N'INSERT'), (N'grns', N'UPDATE'),
    (N'grn_lines', N'SELECT'), (N'grn_lines', N'INSERT'),
    (N'mirs', N'SELECT'), (N'mirs', N'INSERT'), (N'mirs', N'UPDATE'),
    (N'mir_lines', N'SELECT'), (N'mir_lines', N'INSERT'), (N'mir_lines', N'UPDATE'),
    (N'stock_adjustments', N'SELECT'), (N'stock_adjustments', N'INSERT'), (N'stock_adjustments', N'UPDATE'),
    (N'stock_txns', N'SELECT'), (N'stock_txns', N'INSERT'),
    (N'mat_audit', N'INSERT'),
    (N'holidays', N'SELECT'),
    (N'schedule_tasks', N'SELECT'), (N'schedule_tasks', N'INSERT'), (N'schedule_tasks', N'UPDATE'),
    (N'schedule_task_pics', N'SELECT'), (N'schedule_task_pics', N'INSERT'), (N'schedule_task_pics', N'DELETE'),
    (N'schedule_updates', N'SELECT'), (N'schedule_updates', N'INSERT'),
    (N'schedule_baselines', N'SELECT'), (N'schedule_baselines', N'INSERT');

DECLARE @has_forbidden_effective_permission bit;
EXECUTE AS USER = N'$(AppLogin)';
SELECT @has_forbidden_effective_permission = CASE WHEN
       COALESCE(HAS_PERMS_BY_NAME(DB_NAME(), N'DATABASE', N'CONTROL'), 0) = 1
    OR COALESCE(HAS_PERMS_BY_NAME(N'dbo', N'SCHEMA', N'ALTER'), 0) = 1
    OR COALESCE(HAS_PERMS_BY_NAME(N'dbo', N'SCHEMA', N'DELETE'), 0) = 1
    OR COALESCE(HAS_PERMS_BY_NAME(N'dbo.project_docs', N'OBJECT', N'UPDATE'), 0) = 1
    OR COALESCE(HAS_PERMS_BY_NAME(N'dbo.project_docs', N'OBJECT', N'DELETE'), 0) = 1
    OR COALESCE(HAS_PERMS_BY_NAME(N'dbo.estimate_revisions', N'OBJECT', N'UPDATE'), 0) = 1
    OR COALESCE(HAS_PERMS_BY_NAME(N'dbo.estimate_revisions', N'OBJECT', N'DELETE'), 0) = 1
    OR COALESCE(HAS_PERMS_BY_NAME(N'dbo.audit_log', N'OBJECT', N'UPDATE'), 0) = 1
    OR COALESCE(HAS_PERMS_BY_NAME(N'dbo.audit_log', N'OBJECT', N'DELETE'), 0) = 1
    OR COALESCE(HAS_PERMS_BY_NAME(N'dbo.stock_txns', N'OBJECT', N'UPDATE'), 0) = 1
    OR COALESCE(HAS_PERMS_BY_NAME(N'dbo.stock_txns', N'OBJECT', N'DELETE'), 0) = 1
    OR COALESCE(HAS_PERMS_BY_NAME(N'dbo.mat_audit', N'OBJECT', N'UPDATE'), 0) = 1
    OR COALESCE(HAS_PERMS_BY_NAME(N'dbo.mat_audit', N'OBJECT', N'DELETE'), 0) = 1
    OR COALESCE(HAS_PERMS_BY_NAME(N'dbo.holidays', N'OBJECT', N'INSERT'), 0) = 1
    OR COALESCE(HAS_PERMS_BY_NAME(N'dbo.holidays', N'OBJECT', N'UPDATE'), 0) = 1
    OR COALESCE(HAS_PERMS_BY_NAME(N'dbo.holidays', N'OBJECT', N'DELETE'), 0) = 1
    OR COALESCE(HAS_PERMS_BY_NAME(N'dbo.schedule_tasks', N'OBJECT', N'DELETE'), 0) = 1
    OR COALESCE(HAS_PERMS_BY_NAME(N'dbo.schedule_updates', N'OBJECT', N'UPDATE'), 0) = 1
    OR COALESCE(HAS_PERMS_BY_NAME(N'dbo.schedule_updates', N'OBJECT', N'DELETE'), 0) = 1
    OR COALESCE(HAS_PERMS_BY_NAME(N'dbo.schedule_baselines', N'OBJECT', N'UPDATE'), 0) = 1
    OR COALESCE(HAS_PERMS_BY_NAME(N'dbo.schedule_baselines', N'OBJECT', N'DELETE'), 0) = 1
    OR COALESCE(HAS_PERMS_BY_NAME(N'dbo.users', N'OBJECT', N'INSERT'), 0) = 1
    OR COALESCE(HAS_PERMS_BY_NAME(N'dbo.users', N'OBJECT', N'UPDATE'), 0) = 1
    OR COALESCE(HAS_PERMS_BY_NAME(N'dbo.users', N'OBJECT', N'DELETE'), 0) = 1
    THEN 1 ELSE 0 END;
UPDATE required
SET is_effective = CONVERT(bit, COALESCE(HAS_PERMS_BY_NAME(N'dbo.' + object_name, N'OBJECT', permission_name), 0))
FROM @required_material_permissions required;
REVERT;

IF @has_forbidden_effective_permission = 1
    THROW 51091, 'The application principal has an effective permission that bypasses the least-privilege baseline.', 1;

IF EXISTS (SELECT 1 FROM @required_material_permissions WHERE is_effective <> 1 OR is_effective IS NULL)
    THROW 51093, 'The application principal is missing an effective material-workflow permission.', 1;

IF EXISTS (
    SELECT 1 FROM sys.database_permissions
    WHERE grantee_principal_id = @app_role_id
      AND class = 3 AND major_id = SCHEMA_ID(N'dbo')
      AND permission_name = N'EXECUTE' AND state IN ('G', 'W'))
    THROW 51075, 'Schema-wide EXECUTE is forbidden for the application role.', 1;

IF EXISTS (
    SELECT 1 FROM sys.database_permissions
    WHERE grantee_principal_id = @app_role_id
      AND class = 3 AND major_id = SCHEMA_ID(N'dbo')
      AND permission_name = N'SELECT' AND state IN ('G', 'W'))
    THROW 51079, 'Schema-wide SELECT is forbidden for the application role.', 1;

IF NOT EXISTS (
    SELECT 1 FROM sys.database_permissions
    WHERE grantee_principal_id = @app_role_id
      AND class = 1 AND major_id = OBJECT_ID(N'dbo.issue_document_number')
      AND permission_name = N'EXECUTE' AND state IN ('G', 'W'))
    THROW 51076, 'The document-number procedure EXECUTE grant is missing.', 1;

IF NOT EXISTS (
    SELECT 1 FROM sys.database_permissions
    WHERE grantee_principal_id = @app_role_id
      AND class = 1 AND major_id = OBJECT_ID(N'dbo.users')
      AND permission_name = N'SELECT' AND state IN ('G', 'W'))
    THROW 51080, 'The required object-level SELECT grants are missing.', 1;

IF NOT EXISTS (
    SELECT 1 FROM sys.database_permissions
    WHERE grantee_principal_id = @app_role_id
      AND class = 1 AND major_id = OBJECT_ID(N'dbo.estimate_revisions')
      AND permission_name = N'INSERT' AND state IN ('G', 'W'))
    THROW 51081, 'The append-only estimate revision INSERT grant is missing.', 1;

IF EXISTS (
    SELECT 1 FROM sys.database_permissions
    WHERE grantee_principal_id = @app_role_id
      AND class = 1 AND major_id = OBJECT_ID(N'dbo.estimate_revisions')
      AND permission_name IN (N'UPDATE', N'DELETE') AND state IN ('G', 'W'))
    THROW 51082, 'Estimate revision snapshots must not be updateable or deletable by the application role.', 1;

IF NOT EXISTS (
    SELECT 1 FROM sys.database_permissions
    WHERE grantee_principal_id = @app_role_id
      AND class = 1 AND major_id = OBJECT_ID(N'dbo.project_docs')
      AND permission_name = N'INSERT' AND state IN ('G', 'W'))
    THROW 51084, 'The append-only project document INSERT grant is missing.', 1;

IF NOT EXISTS (
    SELECT 1 FROM sys.database_permissions
    WHERE grantee_principal_id = @app_role_id
      AND class = 1 AND major_id = OBJECT_ID(N'dbo.project_docs')
      AND permission_name = N'SELECT' AND state IN ('G', 'W'))
    THROW 51086, 'The project document SELECT grant is missing.', 1;

IF EXISTS (
    SELECT 1 FROM sys.database_permissions
    WHERE grantee_principal_id = @app_role_id
      AND class = 1 AND major_id = OBJECT_ID(N'dbo.project_docs')
      AND permission_name IN (N'UPDATE', N'DELETE') AND state IN ('G', 'W'))
    THROW 51085, 'Project document metadata must not be updateable or deletable by the application role.', 1;

IF EXISTS (
    SELECT 1
    FROM @required_material_permissions required
    WHERE NOT EXISTS (
        SELECT 1
        FROM sys.database_permissions permission
        WHERE permission.grantee_principal_id = @app_role_id
          AND permission.class = 1
          AND permission.major_id = OBJECT_ID(N'dbo.' + required.object_name)
          AND permission.permission_name COLLATE DATABASE_DEFAULT = required.permission_name
          AND permission.state IN ('G', 'W')))
    THROW 51094, 'A required object-level material-workflow grant is missing.', 1;

IF EXISTS (
    SELECT 1
    FROM sys.database_permissions permission
    INNER JOIN sys.objects object_item ON object_item.object_id = permission.major_id
    WHERE permission.grantee_principal_id = @app_role_id
      AND permission.class = 1
      AND permission.permission_name IN (N'INSERT', N'UPDATE', N'DELETE')
      AND permission.state IN ('G', 'W')
      AND object_item.name COLLATE DATABASE_DEFAULT IN (
          N'boms', N'bom_lines', N'reservations', N'mat_prs', N'mat_pr_lines',
          N'mat_pr_approval_steps', N'mat_pos', N'mat_po_lines', N'grns', N'grn_lines',
          N'mirs', N'mir_lines', N'stock_adjustments', N'stock_txns', N'mat_audit',
          N'schedule_tasks', N'schedule_task_pics', N'schedule_updates', N'schedule_baselines')
      AND NOT EXISTS (
          SELECT 1
          FROM @required_material_permissions required
          WHERE required.object_name = object_item.name COLLATE DATABASE_DEFAULT
            AND required.permission_name = permission.permission_name COLLATE DATABASE_DEFAULT))
    THROW 51095, 'The application role has an unexpected material-workflow write grant.', 1;

IF EXISTS (
    SELECT 1
    FROM sys.database_permissions permission
    INNER JOIN sys.objects object_item ON object_item.object_id = permission.major_id
    WHERE permission.grantee_principal_id = @app_role_id
      AND permission.class = 1
      AND permission.permission_name IN (N'INSERT', N'UPDATE', N'DELETE')
      AND permission.state IN ('G', 'W')
      AND object_item.name COLLATE DATABASE_DEFAULT IN (
          N'holidays', N'inquiry_attachments', N'inquiry_meetings', N'notifications'))
    THROW 51083, 'The application role has write access to a module outside this release.', 1;

IF EXISTS (
    SELECT 1
    FROM dbo.users
    WHERE is_active = 1 AND deleted_at IS NULL
      AND (TRY_CONVERT(uniqueidentifier, entra_object_id) IS NULL
           OR TRY_CONVERT(uniqueidentifier, entra_object_id) = '00000000-0000-0000-0000-000000000000'
           OR email LIKE N'%@%.local' OR email LIKE N'%@example.%'))
    THROW 51077, 'An active user has a development/placeholder identity.', 1;

IF NOT EXISTS (
    SELECT 1
    FROM dbo.users u
    INNER JOIN dbo.roles r ON r.id = u.role_id
    WHERE u.is_active = 1 AND u.deleted_at IS NULL AND r.code = N'Admin')
    THROW 51078, 'At least one active production administrator is required.', 1;

SELECT
    DB_NAME() AS database_name,
    (SELECT MAX(version) FROM dbo.schema_versions) AS schema_version,
    (SELECT COUNT_BIG(*) FROM dbo.users WHERE is_active = 1 AND deleted_at IS NULL) AS active_users,
    (SELECT COUNT_BIG(*) FROM dbo.users u INNER JOIN dbo.roles r ON r.id = u.role_id
      WHERE u.is_active = 1 AND u.deleted_at IS NULL AND r.code = N'Admin') AS active_admins,
    (SELECT COUNT_BIG(*) FROM dbo.customers WHERE is_active = 1 AND deleted_at IS NULL) AS active_customers,
    N'PASS' AS baseline_verification;
GO
