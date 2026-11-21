-- Undo of migration 120: employees linked to tmt-master-data.
--
-- Run by hand, on a database at schema version 120, together with a release of the API from before
-- migration 120. Names already copied from master and employees already marked inactive stay as they are.
-- Running it on a database that is not at 120 changes nothing.

SET XACT_ABORT ON;
SET NOCOUNT ON;
SET ANSI_NULLS ON;
SET QUOTED_IDENTIFIER ON;
GO

IF EXISTS (SELECT 1 FROM dbo.schema_versions WHERE version > 120)
    THROW 51920, 'Roll back the migrations after 120 first.', 1;
GO

IF EXISTS (SELECT 1 FROM dbo.schema_versions WHERE version = 120)
BEGIN
    BEGIN TRANSACTION;
    IF EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID(N'dbo.employees') AND name = N'UX_employees_master_lineworks_id')
        DROP INDEX UX_employees_master_lineworks_id ON dbo.employees;
    IF COL_LENGTH(N'dbo.employees', N'master_synced_at') IS NOT NULL
        ALTER TABLE dbo.employees DROP COLUMN master_synced_at;
    IF COL_LENGTH(N'dbo.employees', N'master_lineworks_id') IS NOT NULL
        ALTER TABLE dbo.employees DROP COLUMN master_lineworks_id;
    DELETE FROM dbo.schema_versions WHERE version = 120;
    COMMIT TRANSACTION;
END;
GO
