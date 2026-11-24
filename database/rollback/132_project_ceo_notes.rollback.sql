-- Undo of migration 132: the project manager's notes on the CEO cost summary.
--
-- Run by hand, on a database at schema version 132, together with a release of the API from before migration 132.

SET XACT_ABORT ON;
SET NOCOUNT ON;
SET ANSI_NULLS ON;
SET QUOTED_IDENTIFIER ON;
GO

IF EXISTS (SELECT 1 FROM dbo.schema_versions WHERE version > 132)
    THROW 51932, 'Roll back the migrations after 132 first.', 1;
GO

IF OBJECT_ID(N'dbo.project_ceo_notes', N'U') IS NOT NULL
    DROP TABLE dbo.project_ceo_notes;
GO

DELETE FROM dbo.schema_versions WHERE version = 132;
GO
