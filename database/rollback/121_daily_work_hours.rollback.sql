-- Undo of migration 121: the confirmed work hours.
--
-- Run by hand, on a database at schema version 121, together with a release of the API from before migration 121.
-- This DROPS every confirmed day and its hours; take a backup first if they are to be kept. Running it on a
-- database that is not at 121 changes nothing.

SET XACT_ABORT ON;
SET NOCOUNT ON;
SET ANSI_NULLS ON;
SET QUOTED_IDENTIFIER ON;
GO

IF EXISTS (SELECT 1 FROM dbo.schema_versions WHERE version > 121)
    THROW 52211, 'Roll back the migrations after 121 first.', 1;
GO

IF EXISTS (SELECT 1 FROM dbo.schema_versions WHERE version = 121)
BEGIN
    BEGIN TRANSACTION;
    IF OBJECT_ID(N'dbo.work_hours', N'U') IS NOT NULL DROP TABLE dbo.work_hours;
    IF OBJECT_ID(N'dbo.work_days', N'U') IS NOT NULL DROP TABLE dbo.work_days;
    DELETE FROM dbo.schema_versions WHERE version = 121;
    COMMIT TRANSACTION;
END;
GO
