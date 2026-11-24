-- Undo of migration 126: a plan row waiting for more than one row.
--
-- Run by hand, on a database at schema version 126, together with a release of the API from before migration 126.
-- Rows keep their first predecessor; the others are lost, so those rows may start earlier.

SET XACT_ABORT ON;
SET NOCOUNT ON;
SET ANSI_NULLS ON;
SET QUOTED_IDENTIFIER ON;
GO

IF EXISTS (SELECT 1 FROM dbo.schema_versions WHERE version > 126)
    THROW 51926, 'Roll back the migrations after 126 first.', 1;
GO

IF EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = N'CK_schedule_tasks_extra_links')
    ALTER TABLE dbo.schedule_tasks DROP CONSTRAINT CK_schedule_tasks_extra_links;
GO

IF COL_LENGTH(N'dbo.schedule_tasks', N'extra_links') IS NOT NULL
    ALTER TABLE dbo.schedule_tasks DROP COLUMN extra_links;
GO

DELETE FROM dbo.schema_versions WHERE version = 126;
GO
