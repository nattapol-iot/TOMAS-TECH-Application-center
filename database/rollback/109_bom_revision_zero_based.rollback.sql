-- Undo of migration 109: BOM revisions count from one again.
--
-- Run by hand, on a database at schema version 109, after a backup, and together with a release
-- of the API from before migration 109 (the newer API creates BOMs at revision 0). The deploy
-- workflow never runs this file. Running it on a database that is not at 109 changes nothing.

SET XACT_ABORT ON;
SET NOCOUNT ON;
SET ANSI_NULLS ON;
SET QUOTED_IDENTIFIER ON;
GO

IF EXISTS (SELECT 1 FROM dbo.schema_versions WHERE version > 109)
    THROW 51909, 'Roll back the migrations after 109 first.', 1;
GO

BEGIN TRANSACTION;

IF EXISTS (SELECT 1 FROM dbo.schema_versions WHERE version = 109)
BEGIN
    UPDATE dbo.boms SET revision = revision + 1;
    DELETE FROM dbo.schema_versions WHERE version = 109;
END;

COMMIT TRANSACTION;
GO
