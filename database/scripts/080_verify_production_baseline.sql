:on error exit
-- Read-only production baseline verification.
-- Required SQLCMD variables: DatabaseName, AppLogin

USE [$(DatabaseName)];
GO

SET NOCOUNT ON;
SET XACT_ABORT ON;

IF COALESCE(HAS_PERMS_BY_NAME(NULL, NULL, N'VIEW ANY DEFINITION'), 0) <> 1
    THROW 51092, 'Run the baseline verifier with an approved audit/DBA identity that can view all server principal metadata.', 1;

IF NOT EXISTS (SELECT 1 FROM dbo.schema_versions WHERE version = 9)
    THROW 51070, 'Required schema version 9 is not installed.', 1;

IF OBJECT_ID(N'dbo.issue_document_number', N'P') IS NULL
   OR OBJECT_ID(N'dbo.answer_schedule_day_request', N'P') IS NULL
   OR NOT EXISTS (
       SELECT 1
       FROM sys.sql_modules
       WHERE object_id = OBJECT_ID(N'dbo.answer_schedule_day_request')
         AND execute_as_principal_id = -2)
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
   OR COL_LENGTH(N'dbo.grn_lines', N'allow_over_receipt') IS NULL
    THROW 51071, 'A required production procedure, function, or view is missing.', 1;

IF EXISTS (
    SELECT 1
    FROM (VALUES
        (N'dbo.trg_cost_items_current_revision_only'),
        (N'dbo.trg_manhour_lines_current_revision_only'),
        (N'dbo.trg_expense_lines_current_revision_only'),
        (N'dbo.trg_other_cost_lines_current_revision_only')
    ) required_trigger(name)
    LEFT JOIN sys.sql_modules module
      ON module.object_id = OBJECT_ID(required_trigger.name, N'TR')
    WHERE module.object_id IS NULL
       OR module.definition NOT LIKE N'%AFTER INSERT, UPDATE, DELETE%'
       OR module.definition NOT LIKE N'%inserted%revision <> e.revision%'
       OR module.definition NOT LIKE N'%deleted%revision <> e.revision%'
)
    THROW 51116, 'Estimate line triggers do not enforce current-revision inserts, updates, and deletes.', 1;

DECLARE @estimate_validation_definition nvarchar(max) = OBJECT_DEFINITION(OBJECT_ID(N'dbo.fn_estimate_validation'));
IF @estimate_validation_definition IS NULL
   OR @estimate_validation_definition NOT LIKE N'%engineering_manhour_required%'
   OR @estimate_validation_definition NOT LIKE N'%internal_rate_mismatch%'
   OR @estimate_validation_definition NOT LIKE N'%supplier_quote_required%'
   OR @estimate_validation_definition NOT LIKE N'%duplicate_cost_item%'
   OR @estimate_validation_definition NOT LIKE N'%invalid_cost_category%'
    THROW 51117, 'Estimate validation is missing a required production rule.', 1;

IF NOT EXISTS (SELECT 1 FROM sys.database_principals WHERE name = N'iot_team_app_role' AND type = 'R')
    THROW 51072, 'The least-privileged application role is missing.', 1;

DECLARE @app_role_id int = DATABASE_PRINCIPAL_ID(N'iot_team_app_role');
DECLARE @public_role_id int = DATABASE_PRINCIPAL_ID(N'public');
DECLARE @app_user_id int = DATABASE_PRINCIPAL_ID(N'$(AppLogin)');
DECLARE @app_user_type char(1) = (
    SELECT type FROM sys.database_principals WHERE principal_id = @app_user_id);
DECLARE @app_authentication_type nvarchar(60) = (
    SELECT authentication_type_desc
    FROM sys.database_principals
    WHERE principal_id = @app_user_id);
-- A contained user may share a name with an unrelated instance login. Only
-- resolve and audit the server principal when this database user is actually
-- authenticated by that instance login.
DECLARE @app_login_id int = CASE WHEN @app_authentication_type = N'INSTANCE'
    THEN SUSER_ID(N'$(AppLogin)') ELSE NULL END;

IF @app_user_id IS NULL OR @app_user_type NOT IN ('A', 'S', 'U', 'G') OR NOT EXISTS (
    SELECT 1 FROM sys.database_role_members
    WHERE role_principal_id = @app_role_id AND member_principal_id = @app_user_id)
    THROW 51073, 'The expected application user is not a member of iot_team_app_role.', 1;

IF @app_user_type <> 'A'
   AND (@app_authentication_type IS NULL OR @app_authentication_type NOT IN (N'INSTANCE', N'DATABASE'))
    THROW 51073, 'The expected application database user uses an unsupported authentication type.', 1;

IF @app_authentication_type = N'INSTANCE' AND @app_login_id IS NULL
    THROW 51073, 'The expected application database user is not mapped to a server login.', 1;

IF @app_login_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM sys.server_role_members
    WHERE member_principal_id = @app_login_id)
    THROW 51074, 'The application login must not belong to a fixed or custom server role.', 1;

IF @app_login_id IS NOT NULL AND EXISTS (
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
      AND permission_name <> N'CONNECT')
    THROW 51089, 'The application user has an unexpected direct database permission.', 1;

DECLARE @app_user_sid varbinary(85) = (
    SELECT sid FROM sys.database_principals WHERE principal_id = @app_user_id);
DECLARE @app_role_sid varbinary(85) = (
    SELECT sid FROM sys.database_principals WHERE principal_id = @app_role_id);
DECLARE @public_role_sid varbinary(85) = (
    SELECT sid FROM sys.database_principals WHERE principal_id = @public_role_id);

IF EXISTS (
       SELECT 1 FROM sys.databases
       WHERE database_id = DB_ID()
         AND owner_sid IN (@app_user_sid, @app_role_sid, @public_role_sid))
   OR EXISTS (
       SELECT 1 FROM sys.schemas
       WHERE principal_id IN (@app_user_id, @app_role_id, @public_role_id))
   OR EXISTS (
       SELECT 1 FROM sys.objects
       WHERE principal_id IN (@app_user_id, @app_role_id, @public_role_id))
    THROW 51090, 'The application user, application role, and public role must not own the database, a schema, or an object.', 1;

-- The application principal inherits permissions only from its single role and
-- public. No database/schema grant is valid for the application role. Public
-- is limited to SQL Server's safe database-connection/key-metadata defaults.
DECLARE @allowed_public_database_permissions TABLE (
    permission_name nvarchar(60) NOT NULL PRIMARY KEY
);
INSERT INTO @allowed_public_database_permissions(permission_name)
VALUES
    (N'CONNECT'),
    (N'VIEW ANY COLUMN ENCRYPTION KEY DEFINITION'),
    (N'VIEW ANY COLUMN MASTER KEY DEFINITION');

IF EXISTS (
    SELECT 1
    FROM sys.database_permissions permission
    WHERE permission.grantee_principal_id IN (@app_role_id, @public_role_id)
      AND permission.state IN ('G', 'W')
      AND (
           (permission.class = 0
            AND (permission.grantee_principal_id = @app_role_id
                 OR NOT EXISTS (
                     SELECT 1
                     FROM @allowed_public_database_permissions allowed
                     WHERE allowed.permission_name COLLATE DATABASE_DEFAULT
                           = permission.permission_name COLLATE DATABASE_DEFAULT)))
        OR permission.class = 3
      ))
    THROW 51097, 'The application/public role has an unexpected database- or schema-wide grant.', 1;

DECLARE @required_material_permissions TABLE (
    object_name sysname NOT NULL,
    permission_name nvarchar(60) NOT NULL,
    is_effective bit NULL,
    PRIMARY KEY (object_name, permission_name)
);

INSERT INTO @required_material_permissions (object_name, permission_name)
VALUES
    (N'estimates', N'SELECT'), (N'estimates', N'INSERT'), (N'estimates', N'UPDATE'),
    (N'estimate_revisions', N'SELECT'), (N'estimate_revisions', N'INSERT'),
    (N'estimate_assignments', N'SELECT'), (N'estimate_assignments', N'INSERT'), (N'estimate_assignments', N'UPDATE'),
    (N'cost_items', N'SELECT'), (N'cost_items', N'INSERT'), (N'cost_items', N'UPDATE'),
    (N'manhour_lines', N'SELECT'), (N'manhour_lines', N'INSERT'), (N'manhour_lines', N'UPDATE'),
    (N'expense_lines', N'SELECT'), (N'expense_lines', N'INSERT'), (N'expense_lines', N'UPDATE'),
    (N'other_cost_lines', N'SELECT'), (N'other_cost_lines', N'INSERT'), (N'other_cost_lines', N'UPDATE'),
    (N'v_estimate_totals', N'SELECT'), (N'fn_estimate_validation', N'SELECT'),
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
    (N'audit_log', N'SELECT'),
    (N'mat_audit', N'SELECT'), (N'mat_audit', N'INSERT'),
    (N'holidays', N'SELECT'),
    (N'schedule_tasks', N'SELECT'), (N'schedule_tasks', N'INSERT'), (N'schedule_tasks', N'UPDATE'),
    (N'schedule_task_pics', N'SELECT'), (N'schedule_task_pics', N'INSERT'), (N'schedule_task_pics', N'DELETE'),
    (N'schedule_updates', N'SELECT'), (N'schedule_updates', N'INSERT'),
    (N'schedule_baselines', N'SELECT'), (N'schedule_baselines', N'INSERT');

DECLARE @has_forbidden_effective_permission bit;
IF @app_user_type = 'A'
BEGIN
    -- SQL Server application-role principals cannot be impersonated with
    -- EXECUTE AS USER. They are required to have no direct permissions and to
    -- inherit exactly one database role above, so metadata inspection of that
    -- role is equivalent to the runtime effective-permission check.
    SELECT @has_forbidden_effective_permission = CASE WHEN EXISTS (
        SELECT 1
        FROM sys.database_permissions permission
        LEFT JOIN sys.objects object_item
          ON permission.class = 1 AND object_item.object_id = permission.major_id
        WHERE permission.grantee_principal_id IN (@app_role_id, @public_role_id)
          AND permission.state IN ('G', 'W')
          AND (
               (permission.class = 0 AND permission.permission_name = N'CONTROL')
            OR (permission.class = 3 AND permission.major_id = SCHEMA_ID(N'dbo')
                AND permission.permission_name IN (N'ALTER', N'DELETE'))
            OR (permission.class = 1 AND (
                   (object_item.name IN (N'project_docs', N'estimate_revisions', N'audit_log', N'stock_txns', N'mat_audit')
                    AND permission.permission_name IN (N'UPDATE', N'DELETE'))
                OR (object_item.name = N'holidays' AND permission.permission_name IN (N'INSERT', N'UPDATE', N'DELETE'))
                OR (object_item.name = N'schedule_tasks' AND permission.permission_name = N'DELETE')
                OR (object_item.name = N'schedule_updates' AND permission.permission_name IN (N'UPDATE', N'DELETE'))
                OR (object_item.name = N'schedule_baselines' AND permission.permission_name IN (N'UPDATE', N'DELETE'))
                OR (object_item.name IN (N'estimates', N'estimate_assignments', N'cost_items', N'manhour_lines', N'expense_lines', N'other_cost_lines')
                    AND permission.permission_name = N'DELETE')
                OR (object_item.name = N'users' AND permission.permission_name IN (N'INSERT', N'UPDATE', N'DELETE'))
            ))
          )
    ) THEN 1 ELSE 0 END;

    UPDATE required
    SET is_effective = CONVERT(bit, CASE WHEN EXISTS (
        SELECT 1
        FROM sys.database_permissions permission
        WHERE permission.grantee_principal_id = @app_role_id
          AND permission.class = 1
          AND permission.major_id = OBJECT_ID(N'dbo.' + required.object_name)
          AND permission.permission_name COLLATE DATABASE_DEFAULT = required.permission_name
          AND permission.state IN ('G', 'W')) THEN 1 ELSE 0 END)
    FROM @required_material_permissions required;
END
ELSE
BEGIN
    EXECUTE AS USER = N'$(AppLogin)';
    SELECT @has_forbidden_effective_permission = CASE WHEN
           COALESCE(HAS_PERMS_BY_NAME(DB_NAME(), N'DATABASE', N'CONTROL'), 0) = 1
        OR COALESCE(HAS_PERMS_BY_NAME(DB_NAME(), N'DATABASE', N'ALTER'), 0) = 1
        OR COALESCE(HAS_PERMS_BY_NAME(DB_NAME(), N'DATABASE', N'TAKE OWNERSHIP'), 0) = 1
        OR COALESCE(HAS_PERMS_BY_NAME(DB_NAME(), N'DATABASE', N'SELECT'), 0) = 1
        OR COALESCE(HAS_PERMS_BY_NAME(DB_NAME(), N'DATABASE', N'EXECUTE'), 0) = 1
        OR COALESCE(HAS_PERMS_BY_NAME(DB_NAME(), N'DATABASE', N'INSERT'), 0) = 1
        OR COALESCE(HAS_PERMS_BY_NAME(DB_NAME(), N'DATABASE', N'UPDATE'), 0) = 1
        OR COALESCE(HAS_PERMS_BY_NAME(DB_NAME(), N'DATABASE', N'DELETE'), 0) = 1
        OR COALESCE(HAS_PERMS_BY_NAME(DB_NAME(), N'DATABASE', N'IMPERSONATE ANY USER'), 0) = 1
        OR COALESCE(HAS_PERMS_BY_NAME(N'dbo', N'SCHEMA', N'CONTROL'), 0) = 1
        OR COALESCE(HAS_PERMS_BY_NAME(N'dbo', N'SCHEMA', N'ALTER'), 0) = 1
        OR COALESCE(HAS_PERMS_BY_NAME(N'dbo', N'SCHEMA', N'TAKE OWNERSHIP'), 0) = 1
        OR COALESCE(HAS_PERMS_BY_NAME(N'dbo', N'SCHEMA', N'SELECT'), 0) = 1
        OR COALESCE(HAS_PERMS_BY_NAME(N'dbo', N'SCHEMA', N'EXECUTE'), 0) = 1
        OR COALESCE(HAS_PERMS_BY_NAME(N'dbo', N'SCHEMA', N'INSERT'), 0) = 1
        OR COALESCE(HAS_PERMS_BY_NAME(N'dbo', N'SCHEMA', N'UPDATE'), 0) = 1
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
        OR COALESCE(HAS_PERMS_BY_NAME(N'dbo.estimates', N'OBJECT', N'DELETE'), 0) = 1
        OR COALESCE(HAS_PERMS_BY_NAME(N'dbo.estimate_assignments', N'OBJECT', N'DELETE'), 0) = 1
        OR COALESCE(HAS_PERMS_BY_NAME(N'dbo.cost_items', N'OBJECT', N'DELETE'), 0) = 1
        OR COALESCE(HAS_PERMS_BY_NAME(N'dbo.manhour_lines', N'OBJECT', N'DELETE'), 0) = 1
        OR COALESCE(HAS_PERMS_BY_NAME(N'dbo.expense_lines', N'OBJECT', N'DELETE'), 0) = 1
        OR COALESCE(HAS_PERMS_BY_NAME(N'dbo.other_cost_lines', N'OBJECT', N'DELETE'), 0) = 1
        OR COALESCE(HAS_PERMS_BY_NAME(N'dbo.users', N'OBJECT', N'INSERT'), 0) = 1
        OR COALESCE(HAS_PERMS_BY_NAME(N'dbo.users', N'OBJECT', N'UPDATE'), 0) = 1
        OR COALESCE(HAS_PERMS_BY_NAME(N'dbo.users', N'OBJECT', N'DELETE'), 0) = 1
        THEN 1 ELSE 0 END;
    UPDATE required
    SET is_effective = CONVERT(bit, COALESCE(HAS_PERMS_BY_NAME(N'dbo.' + object_name, N'OBJECT', permission_name), 0))
    FROM @required_material_permissions required;
    REVERT;
END;

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
      AND class = 1 AND major_id = OBJECT_ID(N'dbo.answer_schedule_day_request')
      AND permission_name = N'EXECUTE' AND state IN ('G', 'W'))
    THROW 51096, 'The schedule day-request answer procedure EXECUTE grant is missing.', 1;

IF EXISTS (
    SELECT 1
    FROM sys.database_permissions
    WHERE class = 1
      AND major_id IN (
          OBJECT_ID(N'dbo.issue_document_number'),
          OBJECT_ID(N'dbo.answer_schedule_day_request'))
      AND permission_name = N'EXECUTE'
      AND state IN ('G', 'W')
      AND grantee_principal_id <> @app_role_id)
    THROW 51098, 'An owner-executed application procedure is granted to an unexpected database principal.', 1;

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
          N'estimates', N'estimate_revisions', N'estimate_assignments', N'cost_items',
          N'manhour_lines', N'expense_lines', N'other_cost_lines',
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
