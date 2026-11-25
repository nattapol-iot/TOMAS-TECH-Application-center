-- Undo of migration 134: estimates imported afterwards from an old Excel Estimate Cost.
--
-- Run by hand, on a database at schema version 134, together with a release of the API from before migration 134.
-- The imported estimates stay; they only stop being marked as imported. Their project links stay as well.

SET XACT_ABORT ON;
SET NOCOUNT ON;
SET ANSI_NULLS ON;
SET QUOTED_IDENTIFIER ON;
GO

IF EXISTS (SELECT 1 FROM dbo.schema_versions WHERE version > 134)
    THROW 51934, 'Roll back the migrations after 134 first.', 1;
GO

IF DATABASE_PRINCIPAL_ID(N'iot_team_app_role') IS NOT NULL
    REVOKE UPDATE (estimate_id, inquiry_id) ON OBJECT::dbo.projects FROM [iot_team_app_role];
GO

IF COL_LENGTH(N'dbo.estimates', N'historical_source') IS NOT NULL
    ALTER TABLE dbo.estimates DROP COLUMN historical_source;
GO

DELETE FROM dbo.schema_versions WHERE version = 134;
GO
