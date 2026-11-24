-- Migration 126: a plan row may wait for more than one row.
--
-- Owner decision 2026-11-24 (plan grid, "ต่อจาก" column, e.g. "3.2, 5.2+1"): a linked row starts after the latest of
-- the rows it waits for, each with its own gap in working days. predecessor_id and lag_days keep the first one, so
-- every screen that knows one predecessor keeps working; extra_links holds the others as JSON:
--   [{"predecessorId": 12, "lagDays": 1}, ...]
-- A row named in extra_links cannot be deleted, as for predecessor_id.
--
-- To undo: database/rollback/126_plan_extra_predecessors.rollback.sql

SET XACT_ABORT ON;
SET NOCOUNT ON;
SET ANSI_NULLS ON;
SET QUOTED_IDENTIFIER ON;
GO

IF NOT EXISTS (SELECT 1 FROM dbo.schema_versions WHERE version = 125)
    THROW 51126, 'Migration 125 must be applied before migration 126.', 1;
GO

BEGIN TRANSACTION;

IF COL_LENGTH(N'dbo.schedule_tasks', N'extra_links') IS NULL
    ALTER TABLE dbo.schedule_tasks ADD extra_links nvarchar(2000) NULL;

COMMIT TRANSACTION;
GO

IF NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = N'CK_schedule_tasks_extra_links')
    ALTER TABLE dbo.schedule_tasks WITH CHECK ADD CONSTRAINT CK_schedule_tasks_extra_links
        CHECK (extra_links IS NULL OR ISJSON(extra_links) = 1);
GO

IF NOT EXISTS (SELECT 1 FROM dbo.schema_versions WHERE version = 126)
    INSERT dbo.schema_versions(version, name)
    VALUES (126, N'Plan extra predecessors');
GO
