-- Undo of migration 127: an outside supplier's people and hours per day.
--
-- Run by hand, on a database at schema version 127, together with a release of the API from before migration 127.
-- The people and hours recorded for suppliers are lost.

SET XACT_ABORT ON;
SET NOCOUNT ON;
SET ANSI_NULLS ON;
SET QUOTED_IDENTIFIER ON;
GO

IF EXISTS (SELECT 1 FROM dbo.schema_versions WHERE version > 127)
    THROW 51927, 'Roll back the migrations after 127 first.', 1;
GO

IF OBJECT_ID(N'dbo.schedule_vendor_hours', N'U') IS NOT NULL
    DROP TABLE dbo.schedule_vendor_hours;
GO

DELETE FROM dbo.schema_versions WHERE version = 127;
GO
