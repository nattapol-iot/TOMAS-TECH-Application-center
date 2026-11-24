-- Migration 125: a linked plan row's gap after the row it follows counts working days.
--
-- Owner decision 2026-11-24 (plan grid, "ต่อจาก" column): "+N" means N working days after the earlier row ends,
-- skipping Saturdays, Sundays and company holidays. Until now lag_days counted calendar days. Rows already saved keep
-- their meaning: lag_work_days = 0 marks a calendar gap, which the API reads back as the working days it spans and
-- stores as working days the next time the row is saved. New rows and every save from now on are working days.
--
-- To undo: database/rollback/125_plan_lag_work_days.rollback.sql

SET XACT_ABORT ON;
SET NOCOUNT ON;
SET ANSI_NULLS ON;
SET QUOTED_IDENTIFIER ON;
GO

IF NOT EXISTS (SELECT 1 FROM dbo.schema_versions WHERE version = 124)
    THROW 51125, 'Migration 124 must be applied before migration 125.', 1;
GO

BEGIN TRANSACTION;

IF COL_LENGTH(N'dbo.schedule_tasks', N'lag_work_days') IS NULL
BEGIN
    ALTER TABLE dbo.schedule_tasks ADD lag_work_days bit NOT NULL
        CONSTRAINT DF_schedule_tasks_lag_work_days DEFAULT (1)
        WITH VALUES;
    -- A gap already saved was counted in calendar days.
    EXEC (N'UPDATE dbo.schedule_tasks SET lag_work_days = 0 WHERE lag_days <> 0;');
END;

COMMIT TRANSACTION;
GO

IF NOT EXISTS (SELECT 1 FROM dbo.schema_versions WHERE version = 125)
    INSERT dbo.schema_versions(version, name)
    VALUES (125, N'Plan lag in working days');
GO
