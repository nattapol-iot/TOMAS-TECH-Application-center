-- Undo of migration 118: holidays copied from tmt-master-data have no app author.
--
-- Run by hand, on a database at schema version 118, together with a release of the API from before
-- migration 118. created_by cannot be required again while master-supplied rows hold null, so this
-- deletes those rows first; the next sync of an older release does not restore them. Running it on a
-- database that is not at 118 changes nothing.

SET XACT_ABORT ON;
SET NOCOUNT ON;
SET ANSI_NULLS ON;
SET QUOTED_IDENTIFIER ON;
GO

IF EXISTS (SELECT 1 FROM dbo.schema_versions WHERE version > 118)
    THROW 51918, 'Roll back the migrations after 118 first.', 1;
GO

IF EXISTS (SELECT 1 FROM dbo.schema_versions WHERE version = 118)
BEGIN
    BEGIN TRANSACTION;
    DELETE FROM dbo.holidays WHERE created_by IS NULL;
    IF OBJECT_ID(N'dbo.FK_holidays_created_by', N'F') IS NOT NULL
        ALTER TABLE dbo.holidays DROP CONSTRAINT FK_holidays_created_by;
    ALTER TABLE dbo.holidays ALTER COLUMN created_by bigint NOT NULL;
    ALTER TABLE dbo.holidays WITH CHECK ADD CONSTRAINT FK_holidays_created_by FOREIGN KEY (created_by) REFERENCES dbo.users(id);
    DELETE FROM dbo.schema_versions WHERE version = 118;
    COMMIT TRANSACTION;
END;
GO
