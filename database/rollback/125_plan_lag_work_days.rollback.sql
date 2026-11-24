-- Undo of migration 125: a linked plan row's gap in working days.
--
-- Run by hand, on a database at schema version 125, together with a release of the API from before migration 125.
-- Gaps saved as working days are read as calendar days again, so a row saved with "+N" after migration 125 may start
-- a day or two earlier; check linked rows with lag_days <> 0 after the undo.

SET XACT_ABORT ON;
SET NOCOUNT ON;
SET ANSI_NULLS ON;
SET QUOTED_IDENTIFIER ON;
GO

IF EXISTS (SELECT 1 FROM dbo.schema_versions WHERE version > 125)
    THROW 51925, 'Roll back the migrations after 125 first.', 1;
GO

IF EXISTS (SELECT 1 FROM sys.default_constraints WHERE name = N'DF_schedule_tasks_lag_work_days')
    ALTER TABLE dbo.schedule_tasks DROP CONSTRAINT DF_schedule_tasks_lag_work_days;
GO

IF COL_LENGTH(N'dbo.schedule_tasks', N'lag_work_days') IS NOT NULL
    ALTER TABLE dbo.schedule_tasks DROP COLUMN lag_work_days;
GO

DELETE FROM dbo.schema_versions WHERE version = 125;
GO
