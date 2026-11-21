-- Migration 117: the company calendar comes from tmt-master-data.
--
-- dbo.holidays has had no screen; rows were added by hand. The API now copies master's calendar into it
-- (backend-node/src/master-data/holiday-sync.ts): each year master lists is replaced whole, so the
-- application role may insert, rename and delete holidays. No table or data changes here.
--
-- To undo: database/rollback/117_holiday_sync_grants.rollback.sql

SET XACT_ABORT ON;
SET NOCOUNT ON;
SET ANSI_NULLS ON;
SET QUOTED_IDENTIFIER ON;
GO

IF NOT EXISTS (SELECT 1 FROM dbo.schema_versions WHERE version = 116)
    THROW 51117, 'Migration 116 must be applied before migration 117.', 1;
GO

BEGIN TRANSACTION;

IF DATABASE_PRINCIPAL_ID(N'iot_team_app_role') IS NOT NULL
BEGIN
    GRANT INSERT, DELETE ON OBJECT::dbo.holidays TO [iot_team_app_role];
    GRANT UPDATE (name) ON OBJECT::dbo.holidays TO [iot_team_app_role];
END;

COMMIT TRANSACTION;
GO

IF NOT EXISTS (SELECT 1 FROM dbo.schema_versions WHERE version = 117)
    INSERT dbo.schema_versions(version, name)
    VALUES (117, N'Holiday sync grants');
GO
