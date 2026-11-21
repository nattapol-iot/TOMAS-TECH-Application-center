-- Undo of migration 122: the master data sync account.
--
-- Run by hand, on a database at schema version 122, together with a release of the API from before
-- migration 122. The account stays: customers, suppliers and audit entries it wrote still point at it, and
-- it cannot sign in. Running it on a database that is not at 122 changes nothing.

SET XACT_ABORT ON;
SET NOCOUNT ON;
SET ANSI_NULLS ON;
SET QUOTED_IDENTIFIER ON;
GO

IF EXISTS (SELECT 1 FROM dbo.schema_versions WHERE version > 122)
    THROW 51922, 'Roll back the migrations after 122 first.', 1;
GO

DELETE FROM dbo.schema_versions WHERE version = 122;
GO
