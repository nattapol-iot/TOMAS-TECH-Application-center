-- Undo of migration 124: My week — booked time and Outlook meetings tied to work.
--
-- Run by hand, on a database at schema version 124, together with a release of the API from before migration 124.
-- The time people booked is lost; the Outlook entries the app wrote for it stay in their calendars (remove them in
-- Outlook, category "IoT Team Center"). Hours already confirmed are kept in dbo.work_hours.

SET XACT_ABORT ON;
SET NOCOUNT ON;
SET ANSI_NULLS ON;
SET QUOTED_IDENTIFIER ON;
GO

IF EXISTS (SELECT 1 FROM dbo.schema_versions WHERE version > 124)
    THROW 51924, 'Roll back the migrations after 124 first.', 1;
GO

IF OBJECT_ID(N'dbo.outlook_event_links', N'U') IS NOT NULL
    DROP TABLE dbo.outlook_event_links;
GO

IF OBJECT_ID(N'dbo.work_blocks', N'U') IS NOT NULL
    DROP TABLE dbo.work_blocks;
GO

DELETE FROM dbo.schema_versions WHERE version = 124;
GO
