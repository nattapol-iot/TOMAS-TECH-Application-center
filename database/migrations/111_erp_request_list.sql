-- Migration 111: where an approved request went in the ERP, and what the ERP did with each line.
--
-- Purchasing asked (2026-11-04) that an approved request no longer becomes one ERP PR: its lines go
-- into the project's Request List, and Purchasing raises ERP PRs per supplier from there. The ERP
-- then answers per line (WAITING, IN_PR, ORDERED, CANCELLED), and one line can be split over several
-- PRs, POs and suppliers. See docs/PEGASUS_ERP_REQUEST_LIST_TH.md.
--
-- This migration only adds the places to keep that. Nothing is sent differently until the server
-- is told to (PEGASUS_REQUEST_LIST); requests already sent as ERP PRs are marked PR and stay on
-- purchase_request_get.
--
--   mat_prs.erp_target            PR | REQUEST_LIST (NULL: not sent yet)
--   mat_prs.erp_cancel_pending    the requester asked to cancel after sending; Purchasing cancels in the ERP
--   mat_pr_lines.erp_line_*       the line's key in the ERP (<external_ref>-<n>), its item, status, reason and link
--   mat_pr_line_erp_orders        the ERP PRs / POs a line was ordered on (one line, many orders)
--
-- Running this again changes nothing.
--
-- To undo: database/rollback/111_erp_request_list.rollback.sql

SET XACT_ABORT ON;
SET NOCOUNT ON;
SET ANSI_NULLS ON;
SET QUOTED_IDENTIFIER ON;
GO

IF NOT EXISTS (SELECT 1 FROM dbo.schema_versions WHERE version = 110)
    THROW 51111, 'Migration 110 must be applied before migration 111.', 1;
GO

BEGIN TRANSACTION;

IF COL_LENGTH(N'dbo.mat_prs', N'erp_target') IS NULL ALTER TABLE dbo.mat_prs ADD erp_target nvarchar(20) NULL;
IF COL_LENGTH(N'dbo.mat_prs', N'erp_cancel_pending') IS NULL
    ALTER TABLE dbo.mat_prs ADD erp_cancel_pending bit NOT NULL CONSTRAINT DF_mat_prs_erp_cancel_pending DEFAULT 0;

IF COL_LENGTH(N'dbo.mat_pr_lines', N'erp_line_ref') IS NULL ALTER TABLE dbo.mat_pr_lines ADD erp_line_ref nvarchar(120) NULL;
IF COL_LENGTH(N'dbo.mat_pr_lines', N'erp_item_id') IS NULL ALTER TABLE dbo.mat_pr_lines ADD erp_item_id bigint NULL;
IF COL_LENGTH(N'dbo.mat_pr_lines', N'erp_line_status') IS NULL ALTER TABLE dbo.mat_pr_lines ADD erp_line_status nvarchar(20) NULL;
IF COL_LENGTH(N'dbo.mat_pr_lines', N'erp_line_status_label') IS NULL ALTER TABLE dbo.mat_pr_lines ADD erp_line_status_label nvarchar(100) NULL;
IF COL_LENGTH(N'dbo.mat_pr_lines', N'erp_cancelled_reason') IS NULL ALTER TABLE dbo.mat_pr_lines ADD erp_cancelled_reason nvarchar(1000) NULL;
IF COL_LENGTH(N'dbo.mat_pr_lines', N'erp_line_url') IS NULL ALTER TABLE dbo.mat_pr_lines ADD erp_line_url nvarchar(500) NULL;

COMMIT TRANSACTION;
GO

BEGIN TRANSACTION;

IF OBJECT_ID(N'dbo.CK_mat_prs_erp_target', N'C') IS NULL
    EXEC sys.sp_executesql N'ALTER TABLE dbo.mat_prs WITH CHECK ADD CONSTRAINT CK_mat_prs_erp_target CHECK (erp_target IS NULL OR erp_target IN (N''PR'', N''REQUEST_LIST''));';

IF OBJECT_ID(N'dbo.CK_mat_pr_lines_erp_line_status', N'C') IS NULL
    EXEC sys.sp_executesql N'ALTER TABLE dbo.mat_pr_lines WITH CHECK ADD CONSTRAINT CK_mat_pr_lines_erp_line_status CHECK (erp_line_status IS NULL OR erp_line_status IN (N''WAITING'', N''IN_PR'', N''ORDERED'', N''CANCELLED''));';

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'UX_mat_pr_lines_erp_line_ref' AND object_id = OBJECT_ID(N'dbo.mat_pr_lines'))
    EXEC sys.sp_executesql N'CREATE UNIQUE INDEX UX_mat_pr_lines_erp_line_ref ON dbo.mat_pr_lines(erp_line_ref) WHERE erp_line_ref IS NOT NULL;';

-- Requests the ERP already holds as one PR keep that path.
EXEC sys.sp_executesql N'UPDATE dbo.mat_prs SET erp_target = N''PR'' WHERE erp_target IS NULL AND erp_pr_no IS NOT NULL;';

IF OBJECT_ID(N'dbo.mat_pr_line_erp_orders', N'U') IS NULL
    CREATE TABLE dbo.mat_pr_line_erp_orders (
        id            bigint IDENTITY(1,1) NOT NULL CONSTRAINT PK_mat_pr_line_erp_orders PRIMARY KEY,
        pr_line_id    bigint            NOT NULL CONSTRAINT FK_mat_pr_line_erp_orders_line FOREIGN KEY REFERENCES dbo.mat_pr_lines(id) ON DELETE CASCADE,
        pr_no         nvarchar(50)      NULL,
        po_no         nvarchar(50)      NULL,
        quantity      decimal(19,4)     NULL,
        supplier_name nvarchar(300)     NULL,
        url           nvarchar(500)     NULL,
        synced_at     datetimeoffset(0) NOT NULL CONSTRAINT DF_mat_pr_line_erp_orders_synced_at DEFAULT SYSUTCDATETIME(),
        CONSTRAINT CK_mat_pr_line_erp_orders_quantity CHECK (quantity IS NULL OR quantity >= 0)
    );

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_mat_pr_line_erp_orders_line' AND object_id = OBJECT_ID(N'dbo.mat_pr_line_erp_orders'))
    CREATE INDEX IX_mat_pr_line_erp_orders_line ON dbo.mat_pr_line_erp_orders(pr_line_id);

IF DATABASE_PRINCIPAL_ID(N'iot_team_app_role') IS NOT NULL
    GRANT SELECT, INSERT, DELETE ON OBJECT::dbo.mat_pr_line_erp_orders TO [iot_team_app_role];

COMMIT TRANSACTION;
GO

IF NOT EXISTS (SELECT 1 FROM dbo.schema_versions WHERE version = 111)
    INSERT dbo.schema_versions(version, name)
    VALUES (111, N'ERP request list line status');
GO
