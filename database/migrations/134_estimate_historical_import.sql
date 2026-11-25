-- Migration 134: an estimate imported afterwards from an old Excel Estimate Cost (owner request 2026-11-25).
--
-- Jobs costed in Excel before the app existed run as projects without an estimate. Importing their workbook creates an
-- estimate for that project: it opens as a Draft that can still be changed, its date is the workbook's date, and
-- historical_source keeps the workbook's file name so the estimate list can show and filter the imported ones.
-- The import links the new estimate (and its inquiry) to the project, so the API may now set those two project columns.
--
-- Version 133 is taken by the Fleet / Command Center change; this migration needs only 132, so either may be applied first.
--
-- To undo: database/rollback/134_estimate_historical_import.rollback.sql

SET XACT_ABORT ON;
SET NOCOUNT ON;
SET ANSI_NULLS ON;
SET QUOTED_IDENTIFIER ON;
GO

IF EXISTS (SELECT 1 FROM dbo.schema_versions WHERE version = 134 AND name <> N'Estimate historical import')
    THROW 51341, 'Schema version 134 is already used by another migration.', 1;
IF NOT EXISTS (SELECT 1 FROM dbo.schema_versions WHERE version = 132)
    THROW 51342, 'Migration 132 must be applied before migration 134.', 1;
GO

IF COL_LENGTH(N'dbo.estimates', N'historical_source') IS NULL
    ALTER TABLE dbo.estimates ADD historical_source nvarchar(500) NULL;
GO

IF DATABASE_PRINCIPAL_ID(N'iot_team_app_role') IS NOT NULL
    GRANT UPDATE (estimate_id, inquiry_id) ON OBJECT::dbo.projects TO [iot_team_app_role];
GO

IF NOT EXISTS (SELECT 1 FROM dbo.schema_versions WHERE version = 134)
    INSERT dbo.schema_versions(version, name)
    VALUES (134, N'Estimate historical import');
GO
