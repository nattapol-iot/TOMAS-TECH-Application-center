-- Undo of migration 123: the discipline a plan row needs.
--
-- Run by hand, on a database at schema version 123, together with a release of the API from before migration 123.
-- The disciplines typed on plan rows are lost; rows waiting for a person keep their empty PIC.

SET XACT_ABORT ON;
SET NOCOUNT ON;
SET ANSI_NULLS ON;
SET QUOTED_IDENTIFIER ON;
GO

IF EXISTS (SELECT 1 FROM dbo.schema_versions WHERE version > 123)
    THROW 51923, 'Roll back the migrations after 123 first.', 1;
GO

IF EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = N'CK_schedule_tasks_discipline')
    ALTER TABLE dbo.schedule_tasks DROP CONSTRAINT CK_schedule_tasks_discipline;
GO

IF COL_LENGTH(N'dbo.schedule_tasks', N'discipline') IS NOT NULL
    ALTER TABLE dbo.schedule_tasks DROP COLUMN discipline;
GO

DELETE FROM dbo.schema_versions WHERE version = 123;
GO
