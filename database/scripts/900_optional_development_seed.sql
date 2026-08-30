:on error exit
-- DEVELOPMENT ONLY. The confirmation variable is intentionally not defaulted.
-- Example (from the repository root):
-- sqlcmd -S "localhost" -E -b -i database/scripts/900_optional_development_seed.sql -v DatabaseName="IoTTeamCenter" ConfirmDevelopmentSeed="YES"

USE [$(DatabaseName)];
GO

IF N'$(ConfirmDevelopmentSeed)' <> N'YES'
    THROW 51030, 'Development seed blocked. Pass ConfirmDevelopmentSeed="YES" explicitly.', 1;

IF NOT EXISTS (SELECT 1 FROM dbo.schema_versions WHERE version = 5)
    THROW 51031, 'Migration 005 must be applied before the optional development seed.', 1;
GO

SET XACT_ABORT ON;
SET NOCOUNT ON;
BEGIN TRANSACTION;

DECLARE @admin_role_id bigint = (SELECT id FROM dbo.roles WHERE code = N'Admin');
IF @admin_role_id IS NULL
    THROW 51032, 'Admin role is missing.', 1;

IF EXISTS (
    SELECT 1
    FROM dbo.users
    WHERE (entra_object_id = N'dev-user' AND email <> N'developer@tomastc.local')
       OR (email = N'developer@tomastc.local' AND entra_object_id <> N'dev-user')
)
    THROW 51033, 'The development identity conflicts with an existing user.', 1;

IF NOT EXISTS (
    SELECT 1 FROM dbo.users
    WHERE entra_object_id = N'dev-user' OR email = N'developer@tomastc.local'
)
BEGIN
    INSERT INTO dbo.users(entra_object_id, email, name, initials, role_id, department, level)
    VALUES (N'dev-user', N'developer@tomastc.local', N'Local Developer', N'DV', @admin_role_id, N'IoT', N'Administrator');
END;

DECLARE @dev_user_id bigint = (
    SELECT id FROM dbo.users WHERE entra_object_id = N'dev-user'
);

IF @dev_user_id IS NULL
    THROW 51034, 'The development identity was not created.', 1;

IF NOT EXISTS (SELECT 1 FROM dbo.customers WHERE code = N'DEMO')
BEGIN
    INSERT INTO dbo.customers(code, name, contact, email, phone, industry, site, created_by, updated_by)
    VALUES (N'DEMO', N'Development Customer', N'Development', N'dev@customer.local', N'', N'Development', N'', @dev_user_id, @dev_user_id);
END;

IF NOT EXISTS (SELECT 1 FROM dbo.suppliers WHERE code = N'DEMO-SUP')
BEGIN
    INSERT INTO dbo.suppliers(code, name, category, contact, email, phone, created_by, updated_by)
    VALUES (N'DEMO-SUP', N'Development Supplier', N'General', N'Development', N'dev@supplier.local', N'', @dev_user_id, @dev_user_id);
END;

COMMIT TRANSACTION;
GO
