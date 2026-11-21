-- Migration 118: holidays copied from tmt-master-data have no app author.
--
-- The API syncs master's company calendar into dbo.holidays on its own (at start, then hourly), with no
-- signed-in person behind it, so created_by becomes optional: null marks a row master supplied. Rows
-- added by hand before keep their author. Running this again changes nothing.
--
-- To undo: database/rollback/118_holidays_from_master.rollback.sql

SET XACT_ABORT ON;
SET NOCOUNT ON;
SET ANSI_NULLS ON;
SET QUOTED_IDENTIFIER ON;
GO

IF NOT EXISTS (SELECT 1 FROM dbo.schema_versions WHERE version = 117)
    THROW 51118, 'Migration 117 must be applied before migration 118.', 1;
GO

BEGIN TRANSACTION;

-- SQL Server refuses ALTER COLUMN on a column a foreign key uses, so the key is dropped and put back around it.
IF EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID(N'dbo.holidays') AND name = N'created_by' AND is_nullable = 0)
BEGIN
    IF OBJECT_ID(N'dbo.FK_holidays_created_by', N'F') IS NOT NULL
        ALTER TABLE dbo.holidays DROP CONSTRAINT FK_holidays_created_by;
    ALTER TABLE dbo.holidays ALTER COLUMN created_by bigint NULL;
    ALTER TABLE dbo.holidays WITH CHECK ADD CONSTRAINT FK_holidays_created_by FOREIGN KEY (created_by) REFERENCES dbo.users(id);
END;

COMMIT TRANSACTION;
GO

IF NOT EXISTS (SELECT 1 FROM dbo.schema_versions WHERE version = 118)
    INSERT dbo.schema_versions(version, name)
    VALUES (118, N'Holidays from master data');
GO
