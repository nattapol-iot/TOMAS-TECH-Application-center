-- Migration 090: purchase requisitions go to the Pegasus ERP.
--
-- The ERP takes a PR through its MCP endpoint only with the TMT ID access token of the person asking for it, and it names that
-- person the requester. So a requisition approved here is sent on its requester's behalf, which needs their refresh token kept
-- between sign-in and approval:
--   * dbo.user_oidc_tokens holds one refresh token per TMT ID subject, sealed with the credentials vault key ring
--     (AES-256-GCM, bound to the subject). It is deleted at sign-out and when the provider refuses it.
--   * mat_prs carries the ERP side: the external_ref sent (kept before the first call, so a retry never makes a second ERP PR),
--     the ERP department, the ERP PR id / number / status / link / revision / rejection reason, when it was last read, and
--     the last sending error. The ERP PO number goes in the existing erp_po_ref.

SET XACT_ABORT ON;
SET NOCOUNT ON;
SET ANSI_NULLS ON;
SET QUOTED_IDENTIFIER ON;
IF EXISTS (SELECT 1 FROM dbo.schema_versions WHERE version=90 AND name<>N'Pegasus ERP purchase requests')
    THROW 51901, 'Schema version 090 is already used by another migration.', 1;
IF NOT EXISTS (SELECT 1 FROM dbo.schema_versions WHERE version=89)
    THROW 51902, 'Apply migration 089 before migration 090.', 1;

BEGIN TRY
BEGIN TRANSACTION;
IF OBJECT_ID(N'dbo.user_oidc_tokens', N'U') IS NULL
    CREATE TABLE dbo.user_oidc_tokens (
        subject nvarchar(100) NOT NULL CONSTRAINT PK_user_oidc_tokens PRIMARY KEY,
        refresh_cipher varbinary(max) NOT NULL,
        refresh_iv binary(12) NOT NULL,
        refresh_tag binary(16) NOT NULL,
        key_id tinyint NOT NULL,
        refresh_expires_at datetimeoffset(0) NULL,
        updated_at datetimeoffset(0) NOT NULL CONSTRAINT DF_user_oidc_tokens_updated_at DEFAULT SYSUTCDATETIME(),
        CONSTRAINT CK_user_oidc_tokens_subject CHECK (LEN(LTRIM(RTRIM(subject)))>0)
    );

IF COL_LENGTH(N'dbo.mat_prs', N'erp_ref') IS NULL ALTER TABLE dbo.mat_prs ADD erp_ref nvarchar(100) NULL;
IF COL_LENGTH(N'dbo.mat_prs', N'erp_department') IS NULL ALTER TABLE dbo.mat_prs ADD erp_department nvarchar(50) NULL;
IF COL_LENGTH(N'dbo.mat_prs', N'erp_pr_id') IS NULL ALTER TABLE dbo.mat_prs ADD erp_pr_id bigint NULL;
IF COL_LENGTH(N'dbo.mat_prs', N'erp_pr_no') IS NULL ALTER TABLE dbo.mat_prs ADD erp_pr_no nvarchar(50) NULL;
IF COL_LENGTH(N'dbo.mat_prs', N'erp_status') IS NULL ALTER TABLE dbo.mat_prs ADD erp_status nvarchar(30) NULL;
IF COL_LENGTH(N'dbo.mat_prs', N'erp_status_label') IS NULL ALTER TABLE dbo.mat_prs ADD erp_status_label nvarchar(50) NULL;
IF COL_LENGTH(N'dbo.mat_prs', N'erp_url') IS NULL ALTER TABLE dbo.mat_prs ADD erp_url nvarchar(500) NULL;
IF COL_LENGTH(N'dbo.mat_prs', N'erp_revision_no') IS NULL ALTER TABLE dbo.mat_prs ADD erp_revision_no int NULL;
IF COL_LENGTH(N'dbo.mat_prs', N'erp_rejection_reason') IS NULL ALTER TABLE dbo.mat_prs ADD erp_rejection_reason nvarchar(max) NULL;
IF COL_LENGTH(N'dbo.mat_prs', N'erp_synced_at') IS NULL ALTER TABLE dbo.mat_prs ADD erp_synced_at datetimeoffset(0) NULL;
IF COL_LENGTH(N'dbo.mat_prs', N'erp_error') IS NULL ALTER TABLE dbo.mat_prs ADD erp_error nvarchar(500) NULL;

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id=OBJECT_ID(N'dbo.mat_prs') AND name=N'UX_mat_prs_erp_ref')
    EXEC sys.sp_executesql N'CREATE UNIQUE INDEX UX_mat_prs_erp_ref ON dbo.mat_prs(erp_ref) WHERE erp_ref IS NOT NULL;';
IF OBJECT_ID(N'dbo.CK_mat_prs_erp_status', N'C') IS NULL
    EXEC sys.sp_executesql N'ALTER TABLE dbo.mat_prs WITH CHECK ADD CONSTRAINT CK_mat_prs_erp_status CHECK (erp_status IS NULL
        OR erp_status IN (N''QUOTES_PENDING'', N''PENDING_MANAGER'', N''APPROVED'', N''CONVERTED'', N''REJECTED'', N''CANCELLED''));';

-- The API reads, saves and deletes a refresh token; it never lists them for anyone.
IF DATABASE_PRINCIPAL_ID(N'iot_team_app_role') IS NOT NULL
    GRANT SELECT, INSERT, UPDATE, DELETE ON OBJECT::dbo.user_oidc_tokens TO [iot_team_app_role];

IF NOT EXISTS (SELECT 1 FROM dbo.schema_versions WHERE version=90)
    INSERT INTO dbo.schema_versions(version,name)
    VALUES(90,N'Pegasus ERP purchase requests');

COMMIT TRANSACTION;
END TRY
BEGIN CATCH
    IF @@TRANCOUNT>0 ROLLBACK TRANSACTION;
    THROW;
END CATCH;
GO
