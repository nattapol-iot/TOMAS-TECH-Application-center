-- Migration 123: the discipline a plan row needs, so a project manager can ask for people without naming them.
--
-- Owner decision 2026-11-22: one head assigns people to every project. The project manager adds the row to the
-- plan with its discipline (Electrical, Mechanical, Software or Installation) and its man-days, and leaves the PIC
-- empty; the row then waits in the head's queue on Team overview > Allocation until the head picks the person.
-- A row with a PIC may keep its discipline; Projects > Cost splits a row's people by it when it is set.
--
-- To undo: database/rollback/123_plan_row_discipline.rollback.sql

SET XACT_ABORT ON;
SET NOCOUNT ON;
SET ANSI_NULLS ON;
SET QUOTED_IDENTIFIER ON;
GO

IF NOT EXISTS (SELECT 1 FROM dbo.schema_versions WHERE version = 122)
    THROW 51124, 'Migration 122 must be applied before migration 123.', 1;
GO

BEGIN TRANSACTION;

IF COL_LENGTH(N'dbo.schedule_tasks', N'discipline') IS NULL
    ALTER TABLE dbo.schedule_tasks ADD discipline nvarchar(20) NULL;

COMMIT TRANSACTION;
GO

IF NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = N'CK_schedule_tasks_discipline')
    ALTER TABLE dbo.schedule_tasks WITH CHECK ADD CONSTRAINT CK_schedule_tasks_discipline
        CHECK (discipline IS NULL OR discipline IN (N'Electrical', N'Mechanical', N'Software', N'Installation'));
GO

IF NOT EXISTS (SELECT 1 FROM dbo.schema_versions WHERE version = 123)
    INSERT dbo.schema_versions(version, name)
    VALUES (123, N'Plan row discipline');
GO
