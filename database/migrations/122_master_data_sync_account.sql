-- Migration 122: the account the background customer and supplier sync records its changes under.
--
-- The API reads the customer and supplier registers from tmt-master-data on its own every hour (owner request
-- 2026-11-21), not only when someone opens those screens. Rows it creates or updates need a created_by /
-- updated_by and an audit actor, so this adds one account for it. The account can never sign in: it has no
-- TMT ID subject, its email is on the reserved .invalid domain, and it is inactive and soft-deleted, which
-- also keeps it out of every user and employee list. Audit entries still show its name.
--
-- To undo: database/rollback/122_master_data_sync_account.rollback.sql

SET XACT_ABORT ON;
SET NOCOUNT ON;
SET ANSI_NULLS ON;
SET QUOTED_IDENTIFIER ON;
GO

IF NOT EXISTS (SELECT 1 FROM dbo.schema_versions WHERE version = 121)
    THROW 51122, 'Migration 121 must be applied before migration 122.', 1;
GO

BEGIN TRANSACTION;

IF NOT EXISTS (SELECT 1 FROM dbo.users WHERE email = N'master-data-sync@system.invalid')
    INSERT dbo.users(entra_object_id, email, name, initials, role_id, is_active, deleted_at)
    SELECT NULL, N'master-data-sync@system.invalid', N'Master data sync', N'MD', id, 0, SYSUTCDATETIME()
    FROM dbo.roles WHERE code = N'Engineer';

IF NOT EXISTS (SELECT 1 FROM dbo.users WHERE email = N'master-data-sync@system.invalid')
    THROW 51123, 'The Engineer role is missing, so the master data sync account was not created.', 1;

IF NOT EXISTS (SELECT 1 FROM dbo.schema_versions WHERE version = 122)
    INSERT dbo.schema_versions(version, name)
    VALUES (122, N'Master data sync account');

COMMIT TRANSACTION;
GO
