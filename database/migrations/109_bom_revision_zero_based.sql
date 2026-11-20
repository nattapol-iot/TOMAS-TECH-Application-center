-- Migration 109: BOM revisions count from zero, like estimate revisions.
--
-- An estimate's first revision is 0 and shows as "R0". The API gave a BOM's first revision the
-- number 1 and the screen showed it as "Rev. 1", so one project read "BOM Rev. 1 from estimate R0".
-- The owner asked for one convention (2026-11-20): both count from 0 and show as R<n>.
--
-- From this release the API creates a BOM at revision 0. This migration moves the BOMs that exist:
-- every revision of a BOM number goes down by one, unless that number already has a revision 0.
-- Nothing else reads the number; lines, PRs and reservations hold the BOM's id. Running this again
-- changes nothing, because every number then has a revision 0.
--
-- To undo: database/rollback/109_bom_revision_zero_based.rollback.sql

SET XACT_ABORT ON;
SET NOCOUNT ON;
SET ANSI_NULLS ON;
SET QUOTED_IDENTIFIER ON;
GO

IF NOT EXISTS (SELECT 1 FROM dbo.schema_versions WHERE version = 108)
    THROW 51109, 'Migration 108 must be applied before migration 109.', 1;
GO

BEGIN TRANSACTION;

UPDATE b
SET b.revision = b.revision - 1
FROM dbo.boms b
WHERE NOT EXISTS (SELECT 1 FROM dbo.boms z WHERE z.bom_no = b.bom_no AND z.revision = 0);

COMMIT TRANSACTION;
GO

IF NOT EXISTS (SELECT 1 FROM dbo.schema_versions WHERE version = 109)
    INSERT dbo.schema_versions(version, name)
    VALUES (109, N'BOM revisions count from zero');
GO
