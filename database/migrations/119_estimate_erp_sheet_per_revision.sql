-- Migration 119: every approved estimate revision is its own Cost Sheet in the Pegasus ERP.
--
-- Migration 093 kept one external_ref per estimate, so the ERP wrote each new revision over the Cost Sheet of the one before
-- (the ERP keeps one revision per sheet). The owner wants the earlier sheets kept (2026-11-21): each approved revision now
-- gets its own external_ref, and the ERP opens a new Cost Sheet for it.
--
-- dbo.estimate_erp_links becomes one row per estimate and revision. An existing row takes the revision it last sent, read
-- from the newest "Sent to ERP" audit entry, because erp_revision held whatever number the ERP answered and is not always
-- the app's revision. An accepted row's erp_revision is set to that revision, the number the strip shows from now on.

SET XACT_ABORT ON;
SET NOCOUNT ON;
SET ANSI_NULLS ON;
SET QUOTED_IDENTIFIER ON;
GO

IF NOT EXISTS (SELECT 1 FROM dbo.schema_versions WHERE version = 118)
    THROW 52190, 'Migration 118 must be applied before migration 119.', 1;
GO

IF COL_LENGTH(N'dbo.estimate_erp_links', N'revision') IS NULL
    ALTER TABLE dbo.estimate_erp_links ADD revision int NULL;
GO

BEGIN TRANSACTION;

-- The revision each row's sheet carries: the last one sent, else the one the ERP reported, else the estimate's own.
UPDATE link SET revision = COALESCE(sent.revision, link.erp_revision, e.revision)
FROM dbo.estimate_erp_links link
INNER JOIN dbo.estimates e ON e.id = link.estimate_id
OUTER APPLY (
    SELECT TOP (1) TRY_CONVERT(int, JSON_VALUE(a.after_json, N'$.revision')) revision
    FROM dbo.audit_log a
    WHERE a.entity_type = N'Estimate' AND a.entity_id = link.estimate_id AND a.action = N'Sent to ERP'
      AND TRY_CONVERT(int, JSON_VALUE(a.after_json, N'$.revision')) IS NOT NULL
    ORDER BY a.id DESC
) sent
WHERE link.revision IS NULL;

-- A sheet the ERP accepted shows the app's revision number.
UPDATE dbo.estimate_erp_links SET erp_revision = revision
WHERE (cost_sheet_no IS NOT NULL OR sent_at IS NOT NULL) AND (erp_revision IS NULL OR erp_revision <> revision);

COMMIT TRANSACTION;
GO

IF EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID(N'dbo.estimate_erp_links') AND name = N'revision' AND is_nullable = 1)
    ALTER TABLE dbo.estimate_erp_links ALTER COLUMN revision int NOT NULL;
GO

-- One row per estimate and revision.
IF NOT EXISTS (SELECT 1 FROM sys.index_columns ic INNER JOIN sys.columns c ON c.object_id = ic.object_id AND c.column_id = ic.column_id
               INNER JOIN sys.key_constraints k ON k.parent_object_id = ic.object_id AND k.unique_index_id = ic.index_id
               WHERE k.name = N'PK_estimate_erp_links' AND c.name = N'revision')
BEGIN
    ALTER TABLE dbo.estimate_erp_links DROP CONSTRAINT PK_estimate_erp_links;
    ALTER TABLE dbo.estimate_erp_links ADD CONSTRAINT PK_estimate_erp_links PRIMARY KEY (estimate_id, revision);
END;
GO

IF NOT EXISTS (SELECT 1 FROM dbo.schema_versions WHERE version = 119)
    INSERT dbo.schema_versions(version, name)
    VALUES (119, N'Estimate Cost Sheet per revision');
GO
