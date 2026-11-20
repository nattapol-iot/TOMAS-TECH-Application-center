-- Undo of migration 116: a request's first approver follows its discipline.
--
-- Run by hand, on a database at schema version 116, after a backup, and together with a release of
-- the API from before migration 116. New requests then go to the head of the requester's department
-- again (migration 097); requests already in approval keep their steps. The deploy workflow never runs
-- this file. Running it on a database that is not at 116 changes nothing.

SET XACT_ABORT ON;
SET NOCOUNT ON;
SET ANSI_NULLS ON;
SET QUOTED_IDENTIFIER ON;
GO

IF EXISTS (SELECT 1 FROM dbo.schema_versions WHERE version > 116)
    THROW 51916, 'Roll back the migrations after 116 first.', 1;
GO

IF EXISTS (SELECT 1 FROM dbo.schema_versions WHERE version = 116)
BEGIN
    BEGIN TRANSACTION;
    IF OBJECT_ID(N'dbo.pr_discipline_approvers', N'U') IS NOT NULL DROP TABLE dbo.pr_discipline_approvers;
    DELETE FROM dbo.schema_versions WHERE version = 116;
    COMMIT TRANSACTION;
END;
GO
