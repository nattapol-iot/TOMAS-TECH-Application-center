-- Undo of migration 110: the BOM review threshold setting.
--
-- Run by hand, on a database at schema version 110, after a backup, and together with a release of
-- the API from before migration 110 (the newer API reads this table). The deploy workflow never runs
-- this file. Running it on a database that is not at 110 changes nothing.

SET XACT_ABORT ON;
SET NOCOUNT ON;
SET ANSI_NULLS ON;
SET QUOTED_IDENTIFIER ON;
GO

IF EXISTS (SELECT 1 FROM dbo.schema_versions WHERE version > 110)
    THROW 51910, 'Roll back the migrations after 110 first.', 1;
GO

BEGIN TRANSACTION;

IF EXISTS (SELECT 1 FROM dbo.schema_versions WHERE version = 110)
BEGIN
    IF OBJECT_ID(N'dbo.procurement_settings', N'U') IS NOT NULL DROP TABLE dbo.procurement_settings;
    DELETE FROM dbo.schema_versions WHERE version = 110;
END;

COMMIT TRANSACTION;
GO
