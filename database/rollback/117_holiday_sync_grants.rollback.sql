-- Undo of migration 117: the company calendar comes from tmt-master-data.
--
-- Run by hand, on a database at schema version 117, together with a release of the API from before
-- migration 117. The holidays already copied from master stay. Running it on a database that is not at
-- 117 changes nothing.

SET XACT_ABORT ON;
SET NOCOUNT ON;
SET ANSI_NULLS ON;
SET QUOTED_IDENTIFIER ON;
GO

IF EXISTS (SELECT 1 FROM dbo.schema_versions WHERE version > 117)
    THROW 51917, 'Roll back the migrations after 117 first.', 1;
GO

IF EXISTS (SELECT 1 FROM dbo.schema_versions WHERE version = 117)
BEGIN
    BEGIN TRANSACTION;
    IF DATABASE_PRINCIPAL_ID(N'iot_team_app_role') IS NOT NULL
    BEGIN
        REVOKE UPDATE (name) ON OBJECT::dbo.holidays FROM [iot_team_app_role];
        REVOKE INSERT, DELETE ON OBJECT::dbo.holidays FROM [iot_team_app_role];
    END;
    DELETE FROM dbo.schema_versions WHERE version = 117;
    COMMIT TRANSACTION;
END;
GO
