-- Undo of migration 113: purchase Units.
--
-- Run by hand, on a database at schema version 113, after a backup, and together with a release of
-- the API from before migration 113. The Units and each request's link to its Unit are lost; the
-- requests and their lines stay. The deploy workflow never runs this file. Running it on a database
-- that is not at 113 changes nothing.

SET XACT_ABORT ON;
SET NOCOUNT ON;
SET ANSI_NULLS ON;
SET QUOTED_IDENTIFIER ON;
GO

IF EXISTS (SELECT 1 FROM dbo.schema_versions WHERE version > 113)
    THROW 51913, 'Roll back the migrations after 113 first.', 1;
GO

IF EXISTS (SELECT 1 FROM dbo.schema_versions WHERE version = 113)
BEGIN
    BEGIN TRANSACTION;
    IF EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_mat_prs_unit' AND object_id = OBJECT_ID(N'dbo.mat_prs')) DROP INDEX IX_mat_prs_unit ON dbo.mat_prs;
    IF OBJECT_ID(N'dbo.FK_mat_prs_unit', N'F') IS NOT NULL ALTER TABLE dbo.mat_prs DROP CONSTRAINT FK_mat_prs_unit;
    IF COL_LENGTH(N'dbo.mat_prs', N'unit_id') IS NOT NULL ALTER TABLE dbo.mat_prs DROP COLUMN unit_id;
    IF OBJECT_ID(N'dbo.project_purchase_units', N'U') IS NOT NULL DROP TABLE dbo.project_purchase_units;
    DELETE FROM dbo.schema_versions WHERE version = 113;
    COMMIT TRANSACTION;
END;
GO
