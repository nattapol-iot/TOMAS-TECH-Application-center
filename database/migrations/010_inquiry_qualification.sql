:on error exit
SET ANSI_NULLS ON;
SET QUOTED_IDENTIFIER ON;
SET ANSI_PADDING ON;
SET ANSI_WARNINGS ON;
SET ARITHABORT ON;
SET CONCAT_NULL_YIELDS_NULL ON;
SET NUMERIC_ROUNDABORT OFF;
SET XACT_ABORT ON;
BEGIN TRANSACTION;

IF EXISTS (SELECT 1 FROM dbo.schema_versions WHERE version = 10)
    THROW 51130, 'Migration 010 has already been applied.', 1;

IF NOT EXISTS (SELECT 1 FROM dbo.schema_versions WHERE version = 9)
    THROW 51131, 'Migration 009 must be applied before migration 010.', 1;

ALTER TABLE dbo.inquiries
    ADD project_probability tinyint NOT NULL
        CONSTRAINT DF_inquiries_project_probability DEFAULT 25 WITH VALUES;

ALTER TABLE dbo.inquiries
    ADD customer_interest_grade char(1) NOT NULL
        CONSTRAINT DF_inquiries_customer_interest_grade DEFAULT 'C' WITH VALUES;

ALTER TABLE dbo.inquiries
    ADD qualification_note nvarchar(2000) NULL;

EXEC(N'ALTER TABLE dbo.inquiries
    ADD CONSTRAINT CK_inquiries_project_probability
        CHECK (project_probability BETWEEN 0 AND 100);');

EXEC(N'ALTER TABLE dbo.inquiries
    ADD CONSTRAINT CK_inquiries_customer_interest_grade
        CHECK (customer_interest_grade IN (''A'', ''B'', ''C'', ''D''));');

EXEC(N'CREATE INDEX IX_inquiries_qualification
    ON dbo.inquiries(customer_interest_grade, project_probability, updated_at DESC)
    INCLUDE (customer_id, estimate_owner_id, status)
    WHERE deleted_at IS NULL;');

INSERT INTO dbo.schema_versions(version, name)
VALUES (10, N'Inquiry project probability and customer interest qualification');

COMMIT TRANSACTION;
GO
