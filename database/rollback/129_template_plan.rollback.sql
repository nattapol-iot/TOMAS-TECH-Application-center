-- Undo of migration 129: a master schedule's whole plan.
--
-- Run by hand, on a database at schema version 129, together with a release of the API from before migration 129.
-- Templates keep their main headings (dbo.schedule_template_rows); the rows under them are lost.

SET XACT_ABORT ON;
SET NOCOUNT ON;
SET ANSI_NULLS ON;
SET QUOTED_IDENTIFIER ON;
GO

IF EXISTS (SELECT 1 FROM dbo.schema_versions WHERE version > 129)
    THROW 51929, 'Roll back the migrations after 129 first.', 1;
GO

IF EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = N'CK_schedule_templates_plan_json')
    ALTER TABLE dbo.schedule_templates DROP CONSTRAINT CK_schedule_templates_plan_json;
GO

IF COL_LENGTH(N'dbo.schedule_templates', N'plan_json') IS NOT NULL
    ALTER TABLE dbo.schedule_templates DROP COLUMN plan_json;
GO

DELETE FROM dbo.schema_versions WHERE version = 129;
GO
