-- Migration 105: a man-hour budget for a project that has no estimated labor.
--
-- Projects > Plan compares the man-days planned on the schedule with the man-days that were
-- estimated (owner request 2026-11-16). The estimated figure is read from the linked Estimate
-- cost: its internal labor lines, current revision. A project created without an Estimate, or
-- whose Estimate carries no internal labor, has nothing to compare against, so an Admin, an
-- Engineering Manager or a Project Manager types a budget for it. That figure is kept here, in
-- man-days; NULL means no budget was set. It is never used while the Estimate has labor of its own.

SET XACT_ABORT ON;
SET NOCOUNT ON;
SET ANSI_NULLS ON;
SET QUOTED_IDENTIFIER ON;
GO

IF NOT EXISTS (SELECT 1 FROM dbo.schema_versions WHERE version = 104)
    THROW 51105, 'Migration 104 must be applied before migration 105.', 1;
GO

BEGIN TRANSACTION;

IF COL_LENGTH(N'dbo.projects', N'manhour_budget_days') IS NULL
    ALTER TABLE dbo.projects ADD manhour_budget_days decimal(9,2) NULL;

IF OBJECT_ID(N'dbo.CK_projects_manhour_budget_days', N'C') IS NULL
    EXEC sys.sp_executesql N'ALTER TABLE dbo.projects WITH CHECK ADD CONSTRAINT CK_projects_manhour_budget_days
        CHECK (manhour_budget_days IS NULL OR (manhour_budget_days > 0 AND manhour_budget_days <= 100000));';

COMMIT TRANSACTION;
GO

-- The column exists only after the batch above, so its grant is a batch of its own.
IF DATABASE_PRINCIPAL_ID(N'iot_team_app_role') IS NOT NULL
    GRANT UPDATE (manhour_budget_days) ON OBJECT::dbo.projects TO [iot_team_app_role];
GO

IF NOT EXISTS (SELECT 1 FROM dbo.schema_versions WHERE version = 105)
    INSERT dbo.schema_versions(version, name)
    VALUES (105, N'Project man-hour budget');
GO
