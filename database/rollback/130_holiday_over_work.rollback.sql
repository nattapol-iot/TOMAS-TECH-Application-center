-- Undo of migration 130: new holidays on planned work and the decisions about them.
--
-- Run by hand, on a database at schema version 130, together with a release of the API from before migration 130.

SET XACT_ABORT ON;
SET NOCOUNT ON;
SET ANSI_NULLS ON;
SET QUOTED_IDENTIFIER ON;
GO

IF EXISTS (SELECT 1 FROM dbo.schema_versions WHERE version > 130)
    THROW 51930, 'Roll back the migrations after 130 first.', 1;
GO

IF OBJECT_ID(N'dbo.schedule_holiday_decisions', N'U') IS NOT NULL
    DROP TABLE dbo.schedule_holiday_decisions;
GO

IF EXISTS (SELECT 1 FROM sys.default_constraints WHERE name = N'DF_holidays_added_at')
    ALTER TABLE dbo.holidays DROP CONSTRAINT DF_holidays_added_at;
GO

IF COL_LENGTH(N'dbo.holidays', N'added_at') IS NOT NULL
    ALTER TABLE dbo.holidays DROP COLUMN added_at;
GO

-- FK_schedule_vendor_hours_task keeps ON DELETE CASCADE: it only lets a project with supplier hours be deleted.
DELETE FROM dbo.schema_versions WHERE version = 130;
GO
