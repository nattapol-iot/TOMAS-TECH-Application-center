-- Undo of migration 111: the ERP Request List columns and the orders table.
--
-- Run by hand, on a database at schema version 111, after a backup, and together with a release of
-- the API from before migration 111. What the ERP said about each line (status, orders) is lost; the
-- requests and their lines stay. The deploy workflow never runs this file. Running it on a database
-- that is not at 111 changes nothing.

SET XACT_ABORT ON;
SET NOCOUNT ON;
SET ANSI_NULLS ON;
SET QUOTED_IDENTIFIER ON;
GO

IF EXISTS (SELECT 1 FROM dbo.schema_versions WHERE version > 111)
    THROW 51911, 'Roll back the migrations after 111 first.', 1;
GO

IF EXISTS (SELECT 1 FROM dbo.schema_versions WHERE version = 111)
BEGIN
    BEGIN TRANSACTION;
    IF OBJECT_ID(N'dbo.mat_pr_line_erp_orders', N'U') IS NOT NULL DROP TABLE dbo.mat_pr_line_erp_orders;
    IF EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'UX_mat_pr_lines_erp_line_ref' AND object_id = OBJECT_ID(N'dbo.mat_pr_lines')) DROP INDEX UX_mat_pr_lines_erp_line_ref ON dbo.mat_pr_lines;
    IF OBJECT_ID(N'dbo.CK_mat_pr_lines_erp_line_status', N'C') IS NOT NULL ALTER TABLE dbo.mat_pr_lines DROP CONSTRAINT CK_mat_pr_lines_erp_line_status;
    IF OBJECT_ID(N'dbo.CK_mat_prs_erp_target', N'C') IS NOT NULL ALTER TABLE dbo.mat_prs DROP CONSTRAINT CK_mat_prs_erp_target;
    IF OBJECT_ID(N'dbo.DF_mat_prs_erp_cancel_pending', N'D') IS NOT NULL ALTER TABLE dbo.mat_prs DROP CONSTRAINT DF_mat_prs_erp_cancel_pending;
    IF COL_LENGTH(N'dbo.mat_pr_lines', N'erp_line_url') IS NOT NULL ALTER TABLE dbo.mat_pr_lines DROP COLUMN erp_line_ref, erp_item_id, erp_line_status, erp_line_status_label, erp_cancelled_reason, erp_line_url;
    IF COL_LENGTH(N'dbo.mat_prs', N'erp_target') IS NOT NULL ALTER TABLE dbo.mat_prs DROP COLUMN erp_target, erp_cancel_pending;
    DELETE FROM dbo.schema_versions WHERE version = 111;
    COMMIT TRANSACTION;
END;
GO
