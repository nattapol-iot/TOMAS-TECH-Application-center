-- Migration 106: people per day and the labor source of a plan row.
--
-- Projects > Plan gets a People table (owner request 2026-11-18): the plan owner types how many
-- people work on a row each day, the way the team's manpower spreadsheet does, and marks the row
-- as our own staff or outsourced manpower with the supplier's name.
--
--   labor_source    Own | Outsourced
--   labor_supplier  the manpower company of an outsourced row; empty otherwise
--   people_by_day   JSON array of whole numbers, one per day counted from the row's plan start
--                   (0 = nobody set that day); NULL = no people typed, the row keeps the plan
--                   man-days typed on it. The Node API validates the value (plan-people.ts).
--
-- The figures are offsets from the row's start, so they move with the row when its dates move.

SET XACT_ABORT ON;
SET NOCOUNT ON;
SET ANSI_NULLS ON;
SET QUOTED_IDENTIFIER ON;
GO

IF NOT EXISTS (SELECT 1 FROM dbo.schema_versions WHERE version = 105)
    THROW 51106, 'Migration 105 must be applied before migration 106.', 1;
GO

BEGIN TRANSACTION;

IF COL_LENGTH(N'dbo.schedule_tasks', N'labor_source') IS NULL
    ALTER TABLE dbo.schedule_tasks ADD labor_source nvarchar(20) NOT NULL
        CONSTRAINT DF_schedule_tasks_labor_source DEFAULT N'Own';

IF COL_LENGTH(N'dbo.schedule_tasks', N'labor_supplier') IS NULL
    ALTER TABLE dbo.schedule_tasks ADD labor_supplier nvarchar(200) NOT NULL
        CONSTRAINT DF_schedule_tasks_labor_supplier DEFAULT N'';

IF COL_LENGTH(N'dbo.schedule_tasks', N'people_by_day') IS NULL
    ALTER TABLE dbo.schedule_tasks ADD people_by_day nvarchar(max) NULL;

IF OBJECT_ID(N'dbo.CK_schedule_tasks_labor_source', N'C') IS NULL
    EXEC sys.sp_executesql N'ALTER TABLE dbo.schedule_tasks WITH CHECK ADD CONSTRAINT CK_schedule_tasks_labor_source
        CHECK (labor_source IN (N''Own'', N''Outsourced''));';

COMMIT TRANSACTION;
GO

IF NOT EXISTS (SELECT 1 FROM dbo.schema_versions WHERE version = 106)
    INSERT dbo.schema_versions(version, name)
    VALUES (106, N'Plan people per day');
GO
