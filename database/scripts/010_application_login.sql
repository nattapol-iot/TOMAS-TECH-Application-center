:on error exit

USE [$(DatabaseName)];
GO

IF NOT EXISTS (SELECT 1 FROM sys.database_principals WHERE name = N'iot_team_app_role')
    CREATE ROLE [iot_team_app_role];
GO

DECLARE @app_authentication_type nvarchar(60) = (
    SELECT authentication_type_desc
    FROM sys.database_principals
    WHERE name = N'$(AppLogin)'
);
DECLARE @app_principal_type nvarchar(60) = (
    SELECT type_desc
    FROM sys.database_principals
    WHERE name = N'$(AppLogin)'
);

IF @app_principal_type IS NULL AND SUSER_SID(N'$(AppLogin)') IS NULL
    THROW 51040, 'The application principal does not exist. Create a server login, contained database user, or application role first.', 1;

IF @app_authentication_type = N'INSTANCE' AND EXISTS (
    SELECT 1 FROM sys.database_principals
    WHERE name = N'$(AppLogin)' AND sid <> SUSER_SID(N'$(AppLogin)')
)
    THROW 51041, 'The existing database user is mapped to a different login SID.', 1;

IF @app_principal_type <> N'APPLICATION_ROLE'
   AND @app_authentication_type IS NOT NULL
   AND @app_authentication_type NOT IN (N'INSTANCE', N'DATABASE')
    THROW 51042, 'The application principal must use an instance login, contained database authentication, or an application role.', 1;

IF @app_authentication_type IS NULL
BEGIN
    DECLARE @create_user nvarchar(max) = N'CREATE USER ' + QUOTENAME(N'$(AppLogin)') + N' FOR LOGIN ' + QUOTENAME(N'$(AppLogin)') + N';';
    EXEC sys.sp_executesql @create_user;
END;
GO

IF NOT EXISTS (
    SELECT 1
    FROM sys.database_role_members drm
    INNER JOIN sys.database_principals role_principal ON role_principal.principal_id = drm.role_principal_id
    INNER JOIN sys.database_principals member_principal ON member_principal.principal_id = drm.member_principal_id
    WHERE role_principal.name = N'iot_team_app_role' AND member_principal.name = N'$(AppLogin)'
)
    ALTER ROLE [iot_team_app_role] ADD MEMBER [$(AppLogin)];
GO

REVOKE SELECT ON SCHEMA::dbo FROM [iot_team_app_role];
REVOKE EXECUTE ON SCHEMA::dbo FROM [iot_team_app_role];
GRANT EXECUTE ON OBJECT::dbo.issue_document_number TO [iot_team_app_role];

-- Reads are limited to objects used by the currently mapped production API.
GRANT SELECT ON OBJECT::dbo.schema_versions TO [iot_team_app_role];
GRANT SELECT ON OBJECT::dbo.users TO [iot_team_app_role];
GRANT SELECT ON OBJECT::dbo.roles TO [iot_team_app_role];
GRANT SELECT ON OBJECT::dbo.role_permissions TO [iot_team_app_role];
GRANT SELECT ON OBJECT::dbo.permissions TO [iot_team_app_role];
GRANT SELECT ON OBJECT::dbo.customers TO [iot_team_app_role];
GRANT SELECT ON OBJECT::dbo.suppliers TO [iot_team_app_role];
GRANT SELECT ON OBJECT::dbo.engineering_rates TO [iot_team_app_role];
GRANT SELECT ON OBJECT::dbo.inquiries TO [iot_team_app_role];
GRANT SELECT ON OBJECT::dbo.estimates TO [iot_team_app_role];
GRANT SELECT ON OBJECT::dbo.estimate_assignments TO [iot_team_app_role];
GRANT SELECT ON OBJECT::dbo.cost_items TO [iot_team_app_role];
GRANT SELECT ON OBJECT::dbo.manhour_lines TO [iot_team_app_role];
GRANT SELECT ON OBJECT::dbo.expense_lines TO [iot_team_app_role];
GRANT SELECT ON OBJECT::dbo.other_cost_lines TO [iot_team_app_role];
GRANT SELECT ON OBJECT::dbo.projects TO [iot_team_app_role];
GRANT SELECT ON OBJECT::dbo.project_members TO [iot_team_app_role];
GRANT SELECT ON OBJECT::dbo.project_folders TO [iot_team_app_role];
GRANT SELECT ON OBJECT::dbo.project_docs TO [iot_team_app_role];
GRANT SELECT ON OBJECT::dbo.mat_items TO [iot_team_app_role];
GRANT SELECT ON OBJECT::dbo.boms TO [iot_team_app_role];
GRANT SELECT ON OBJECT::dbo.bom_lines TO [iot_team_app_role];
GRANT SELECT ON OBJECT::dbo.reservations TO [iot_team_app_role];
GRANT SELECT ON OBJECT::dbo.mat_prs TO [iot_team_app_role];
GRANT SELECT ON OBJECT::dbo.mat_pr_lines TO [iot_team_app_role];
GRANT SELECT ON OBJECT::dbo.mat_pr_approval_steps TO [iot_team_app_role];
GRANT SELECT ON OBJECT::dbo.mat_pos TO [iot_team_app_role];
GRANT SELECT ON OBJECT::dbo.mat_po_lines TO [iot_team_app_role];
GRANT SELECT ON OBJECT::dbo.grns TO [iot_team_app_role];
GRANT SELECT ON OBJECT::dbo.grn_lines TO [iot_team_app_role];
GRANT SELECT ON OBJECT::dbo.mirs TO [iot_team_app_role];
GRANT SELECT ON OBJECT::dbo.mir_lines TO [iot_team_app_role];
GRANT SELECT ON OBJECT::dbo.stock_adjustments TO [iot_team_app_role];
GRANT SELECT ON OBJECT::dbo.stock_txns TO [iot_team_app_role];
GRANT SELECT ON OBJECT::dbo.v_estimate_totals TO [iot_team_app_role];
GRANT SELECT ON OBJECT::dbo.v_item_balances TO [iot_team_app_role];
GRANT SELECT ON OBJECT::dbo.fn_estimate_validation TO [iot_team_app_role];

-- Normalize prior runs before applying the minimal write set below.
REVOKE INSERT, UPDATE, DELETE ON OBJECT::dbo.customers FROM [iot_team_app_role];
REVOKE INSERT, UPDATE, DELETE ON OBJECT::dbo.suppliers FROM [iot_team_app_role];
REVOKE INSERT, UPDATE, DELETE ON OBJECT::dbo.engineering_rates FROM [iot_team_app_role];
REVOKE INSERT, UPDATE, DELETE ON OBJECT::dbo.inquiries FROM [iot_team_app_role];
REVOKE INSERT, UPDATE, DELETE ON OBJECT::dbo.estimates FROM [iot_team_app_role];
REVOKE INSERT, UPDATE, DELETE ON OBJECT::dbo.estimate_revisions FROM [iot_team_app_role];
REVOKE INSERT, UPDATE, DELETE ON OBJECT::dbo.estimate_assignments FROM [iot_team_app_role];
REVOKE INSERT, UPDATE, DELETE ON OBJECT::dbo.cost_items FROM [iot_team_app_role];
REVOKE INSERT, UPDATE, DELETE ON OBJECT::dbo.manhour_lines FROM [iot_team_app_role];
REVOKE INSERT, UPDATE, DELETE ON OBJECT::dbo.expense_lines FROM [iot_team_app_role];
REVOKE INSERT, UPDATE, DELETE ON OBJECT::dbo.other_cost_lines FROM [iot_team_app_role];
REVOKE INSERT, UPDATE, DELETE ON OBJECT::dbo.projects FROM [iot_team_app_role];
REVOKE INSERT, UPDATE, DELETE ON OBJECT::dbo.project_members FROM [iot_team_app_role];
REVOKE INSERT, UPDATE, DELETE ON OBJECT::dbo.project_folders FROM [iot_team_app_role];
REVOKE INSERT, UPDATE, DELETE ON OBJECT::dbo.mat_items FROM [iot_team_app_role];
REVOKE UPDATE, DELETE ON OBJECT::dbo.project_docs FROM [iot_team_app_role];
REVOKE UPDATE, DELETE ON OBJECT::dbo.audit_log FROM [iot_team_app_role];
REVOKE DELETE ON SCHEMA::dbo FROM [iot_team_app_role];

REVOKE INSERT, UPDATE, DELETE ON OBJECT::dbo.boms FROM [iot_team_app_role];
REVOKE INSERT, UPDATE, DELETE ON OBJECT::dbo.bom_lines FROM [iot_team_app_role];
REVOKE INSERT, UPDATE, DELETE ON OBJECT::dbo.reservations FROM [iot_team_app_role];
REVOKE INSERT, UPDATE, DELETE ON OBJECT::dbo.mat_prs FROM [iot_team_app_role];
REVOKE INSERT, UPDATE, DELETE ON OBJECT::dbo.mat_pr_lines FROM [iot_team_app_role];
REVOKE INSERT, UPDATE, DELETE ON OBJECT::dbo.mat_pr_approval_steps FROM [iot_team_app_role];
REVOKE INSERT, UPDATE, DELETE ON OBJECT::dbo.mat_pos FROM [iot_team_app_role];
REVOKE INSERT, UPDATE, DELETE ON OBJECT::dbo.mat_po_lines FROM [iot_team_app_role];
REVOKE INSERT, UPDATE, DELETE ON OBJECT::dbo.grns FROM [iot_team_app_role];
REVOKE INSERT, UPDATE, DELETE ON OBJECT::dbo.grn_lines FROM [iot_team_app_role];
REVOKE INSERT, UPDATE, DELETE ON OBJECT::dbo.mirs FROM [iot_team_app_role];
REVOKE INSERT, UPDATE, DELETE ON OBJECT::dbo.mir_lines FROM [iot_team_app_role];
REVOKE INSERT, UPDATE, DELETE ON OBJECT::dbo.stock_adjustments FROM [iot_team_app_role];
REVOKE INSERT, UPDATE, DELETE ON OBJECT::dbo.stock_txns FROM [iot_team_app_role];
REVOKE INSERT, UPDATE, DELETE ON OBJECT::dbo.mat_audit FROM [iot_team_app_role];

-- Business writes are explicit so a compromised application credential cannot
-- modify RBAC, user identity, document numbering, migration metadata, or features
-- that do not yet have a reviewed production API.
GRANT INSERT ON OBJECT::dbo.customers TO [iot_team_app_role];
GRANT INSERT ON OBJECT::dbo.suppliers TO [iot_team_app_role];
GRANT INSERT ON OBJECT::dbo.engineering_rates TO [iot_team_app_role];
GRANT INSERT, UPDATE ON OBJECT::dbo.inquiries TO [iot_team_app_role];
GRANT INSERT, UPDATE ON OBJECT::dbo.estimates TO [iot_team_app_role];
GRANT INSERT ON OBJECT::dbo.estimate_revisions TO [iot_team_app_role];
GRANT INSERT, UPDATE ON OBJECT::dbo.estimate_assignments TO [iot_team_app_role];
GRANT INSERT, UPDATE ON OBJECT::dbo.cost_items TO [iot_team_app_role];
GRANT INSERT ON OBJECT::dbo.manhour_lines TO [iot_team_app_role];
GRANT INSERT ON OBJECT::dbo.expense_lines TO [iot_team_app_role];
GRANT INSERT ON OBJECT::dbo.other_cost_lines TO [iot_team_app_role];
GRANT INSERT ON OBJECT::dbo.projects TO [iot_team_app_role];
GRANT INSERT ON OBJECT::dbo.project_members TO [iot_team_app_role];
GRANT INSERT ON OBJECT::dbo.project_folders TO [iot_team_app_role];
GRANT INSERT ON OBJECT::dbo.project_docs TO [iot_team_app_role];
GRANT INSERT ON OBJECT::dbo.audit_log TO [iot_team_app_role];
GRANT INSERT ON OBJECT::dbo.mat_items TO [iot_team_app_role];

-- Material workflows use an explicit, object-level write matrix. Stock and
-- material audit ledgers stay append-only; migration 002 also enforces this
-- invariant with INSTEAD OF UPDATE/DELETE triggers.
GRANT INSERT, UPDATE ON OBJECT::dbo.boms TO [iot_team_app_role];
GRANT INSERT ON OBJECT::dbo.bom_lines TO [iot_team_app_role];
GRANT INSERT, UPDATE ON OBJECT::dbo.reservations TO [iot_team_app_role];
GRANT INSERT, UPDATE ON OBJECT::dbo.mat_prs TO [iot_team_app_role];
GRANT INSERT ON OBJECT::dbo.mat_pr_lines TO [iot_team_app_role];
GRANT INSERT, UPDATE, DELETE ON OBJECT::dbo.mat_pr_approval_steps TO [iot_team_app_role];
GRANT INSERT, UPDATE ON OBJECT::dbo.mat_pos TO [iot_team_app_role];
GRANT INSERT ON OBJECT::dbo.mat_po_lines TO [iot_team_app_role];
GRANT INSERT, UPDATE ON OBJECT::dbo.grns TO [iot_team_app_role];
GRANT INSERT ON OBJECT::dbo.grn_lines TO [iot_team_app_role];
GRANT INSERT, UPDATE ON OBJECT::dbo.mirs TO [iot_team_app_role];
GRANT INSERT, UPDATE ON OBJECT::dbo.mir_lines TO [iot_team_app_role];
GRANT INSERT, UPDATE ON OBJECT::dbo.stock_adjustments TO [iot_team_app_role];
GRANT INSERT ON OBJECT::dbo.stock_txns TO [iot_team_app_role];
GRANT INSERT ON OBJECT::dbo.mat_audit TO [iot_team_app_role];

-- Remove legacy grants for modules that are intentionally outside this release.
REVOKE INSERT, UPDATE, DELETE ON OBJECT::dbo.holidays FROM [iot_team_app_role];
REVOKE INSERT, UPDATE, DELETE ON OBJECT::dbo.schedule_tasks FROM [iot_team_app_role];
REVOKE INSERT, UPDATE, DELETE ON OBJECT::dbo.schedule_task_pics FROM [iot_team_app_role];
REVOKE INSERT, UPDATE, DELETE ON OBJECT::dbo.schedule_updates FROM [iot_team_app_role];
REVOKE INSERT, UPDATE, DELETE ON OBJECT::dbo.schedule_baselines FROM [iot_team_app_role];
REVOKE INSERT, UPDATE, DELETE ON OBJECT::dbo.inquiry_attachments FROM [iot_team_app_role];
REVOKE INSERT, UPDATE, DELETE ON OBJECT::dbo.inquiry_meetings FROM [iot_team_app_role];
REVOKE INSERT, UPDATE, DELETE ON OBJECT::dbo.notifications FROM [iot_team_app_role];

DENY ALTER, TAKE OWNERSHIP ON SCHEMA::dbo TO [iot_team_app_role];
GO
