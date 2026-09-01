:on error exit
SET XACT_ABORT ON;
BEGIN TRANSACTION;

IF EXISTS (SELECT 1 FROM dbo.schema_versions WHERE version = 9)
    THROW 51120, 'Migration 009 has already been applied.', 1;

IF NOT EXISTS (SELECT 1 FROM dbo.schema_versions WHERE version = 8)
    THROW 51121, 'Migration 008 must be applied before migration 009.', 1;

ALTER TABLE dbo.inquiry_attachments
    ADD sha256 char(64) NULL;

EXEC(N'ALTER TABLE dbo.inquiry_attachments
    ADD CONSTRAINT CK_inquiry_attachments_sha256
        CHECK (sha256 IS NULL OR (LEN(sha256) = 64 AND sha256 NOT LIKE ''%[^0-9A-Fa-f]%''));');

INSERT INTO dbo.schema_versions(version, name)
VALUES (9, N'Production inquiry workspace and attachment integrity');

COMMIT TRANSACTION;
GO
