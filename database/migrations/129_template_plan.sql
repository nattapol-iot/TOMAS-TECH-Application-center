-- Migration 129: a master schedule keeps a whole plan, not only its main headings.
--
-- Task doc 4.1 (owner 2026-11-23/24): a template holds the rows at every level with the party the customer sees, the
-- discipline, the working day it starts on (1 = the plan's first working day), how many working days it takes and its
-- starting hours. Hours are fixed starting values, not split from the Estimate. Anyone may change a template; the last
-- one to change it is kept (updated_by). plan_json holds the rows:
--   [{"level":1,"name":"Design","party":"","discipline":null,"startWorkDay":1,"workDays":10,"planHours":0}, ...]
-- The flat rows of dbo.schedule_template_rows stay for the screens that know only main headings.
--
-- To undo: database/rollback/129_template_plan.rollback.sql

SET XACT_ABORT ON;
SET NOCOUNT ON;
SET ANSI_NULLS ON;
SET QUOTED_IDENTIFIER ON;
GO

IF NOT EXISTS (SELECT 1 FROM dbo.schema_versions WHERE version = 128)
    THROW 51129, 'Migration 128 must be applied before migration 129.', 1;
GO

BEGIN TRANSACTION;

IF COL_LENGTH(N'dbo.schedule_templates', N'plan_json') IS NULL
    ALTER TABLE dbo.schedule_templates ADD plan_json nvarchar(max) NULL;

COMMIT TRANSACTION;
GO

IF NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = N'CK_schedule_templates_plan_json')
    ALTER TABLE dbo.schedule_templates WITH CHECK ADD CONSTRAINT CK_schedule_templates_plan_json
        CHECK (plan_json IS NULL OR ISJSON(plan_json) = 1);
GO

IF NOT EXISTS (SELECT 1 FROM dbo.schema_versions WHERE version = 129)
    INSERT dbo.schema_versions(version, name)
    VALUES (129, N'Template plan');
GO
