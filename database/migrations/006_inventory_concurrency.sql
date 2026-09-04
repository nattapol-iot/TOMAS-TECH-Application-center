SET XACT_ABORT ON;
SET NOCOUNT ON;
GO

IF EXISTS (SELECT 1 FROM dbo.schema_versions WHERE version = 6)
    THROW 51037, 'Migration 006 has already been applied.', 1;

IF NOT EXISTS (SELECT 1 FROM dbo.schema_versions WHERE version = 5)
    THROW 51038, 'Migration 005 must be applied before migration 006.', 1;
GO

BEGIN TRANSACTION;
GO

-- The API has always required an explicit acknowledgement and reason for an
-- over-receipt. Persist that acknowledgement so confirmation can safely
-- revalidate a draft after another GRN has consumed the remaining PO quantity.
ALTER TABLE dbo.grn_lines
ADD allow_over_receipt bit NOT NULL
    CONSTRAINT DF_grn_lines_allow_over_receipt DEFAULT (0) WITH VALUES;
GO

INSERT INTO dbo.schema_versions(version, name)
VALUES (6, N'Persist GRN over-receipt authorization for concurrency-safe confirmation');

COMMIT TRANSACTION;
GO
