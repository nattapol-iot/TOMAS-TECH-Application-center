-- Undo of migration 131: the dates the app first saw a request or a line ordered.
--
-- Run by hand, on a database at schema version 131, together with a release of the API from before migration 131.

SET XACT_ABORT ON;
SET NOCOUNT ON;
SET ANSI_NULLS ON;
SET QUOTED_IDENTIFIER ON;
GO

IF EXISTS (SELECT 1 FROM dbo.schema_versions WHERE version > 131)
    THROW 51931, 'Roll back the migrations after 131 first.', 1;
GO

IF COL_LENGTH(N'dbo.mat_pr_lines', N'erp_ordered_at') IS NOT NULL
    ALTER TABLE dbo.mat_pr_lines DROP COLUMN erp_ordered_at;
GO

IF COL_LENGTH(N'dbo.mat_prs', N'erp_po_seen_at') IS NOT NULL
    ALTER TABLE dbo.mat_prs DROP COLUMN erp_po_seen_at;
GO

DELETE FROM dbo.schema_versions WHERE version = 131;
GO
