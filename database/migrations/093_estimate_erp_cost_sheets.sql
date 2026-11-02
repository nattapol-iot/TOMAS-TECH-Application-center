-- Migration 093: an approved estimate is sent to the Pegasus ERP as a Cost Sheet.
--
-- The ERP team shipped cost_estimate_submit and cost_estimate_get (answer to
-- docs/PEGASUS_ERP_ESTIMATE_COST_TH.md). One external_ref per estimate is kept for every
-- revision and every retry; the ERP keeps only the latest revision on one Cost Sheet.
-- The link lives in its own table so sending or re-reading it never changes the estimate's
-- row version, which the screens use to detect a concurrent edit.

SET XACT_ABORT ON;
SET NOCOUNT ON;
SET ANSI_NULLS ON;
SET QUOTED_IDENTIFIER ON;
GO

IF NOT EXISTS (SELECT 1 FROM dbo.schema_versions WHERE version = 92)
    THROW 51930, 'Migration 092 must be applied before migration 093.', 1;
GO

BEGIN TRANSACTION;

IF OBJECT_ID(N'dbo.estimate_erp_links', N'U') IS NULL
    CREATE TABLE dbo.estimate_erp_links (
        estimate_id bigint NOT NULL CONSTRAINT PK_estimate_erp_links PRIMARY KEY,
        external_ref nvarchar(100) NOT NULL CONSTRAINT UQ_estimate_erp_links_ref UNIQUE,
        cost_sheet_no nvarchar(50) NULL,
        erp_status nvarchar(30) NULL,
        -- The latest revision the ERP accepted; an approved later revision is still to be sent.
        erp_revision int NULL,
        erp_total decimal(19,4) NULL,
        erp_url nvarchar(500) NULL,
        sent_at datetimeoffset(0) NULL,
        sent_by bigint NULL,
        synced_at datetimeoffset(0) NULL,
        -- Why the last send failed, for the person who presses "send" next; cleared on success.
        error nvarchar(500) NULL,
        created_at datetimeoffset(0) NOT NULL CONSTRAINT DF_estimate_erp_links_created_at DEFAULT SYSUTCDATETIME(),
        updated_at datetimeoffset(0) NOT NULL CONSTRAINT DF_estimate_erp_links_updated_at DEFAULT SYSUTCDATETIME(),
        CONSTRAINT FK_estimate_erp_links_estimate FOREIGN KEY (estimate_id) REFERENCES dbo.estimates(id),
        CONSTRAINT FK_estimate_erp_links_sent_by FOREIGN KEY (sent_by) REFERENCES dbo.users(id),
        CONSTRAINT CK_estimate_erp_links_ref CHECK (external_ref LIKE N'ENGAPP-EST-%')
    );

COMMIT TRANSACTION;
GO

IF DATABASE_PRINCIPAL_ID(N'iot_team_app_role') IS NOT NULL
    GRANT SELECT, INSERT, UPDATE ON OBJECT::dbo.estimate_erp_links TO [iot_team_app_role];
GO

IF NOT EXISTS (SELECT 1 FROM dbo.schema_versions WHERE version = 93)
    INSERT dbo.schema_versions(version, name)
    VALUES (93, N'Estimate Cost Sheets in the Pegasus ERP');
GO
