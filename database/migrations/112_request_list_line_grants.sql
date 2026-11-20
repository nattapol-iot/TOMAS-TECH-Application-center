-- Migration 112: the API may write what the ERP says about a request's lines.
--
-- The API runs as iot_team_app_role, which may update only named columns of dbo.mat_pr_lines.
-- Migration 111 added the columns that keep a line's key and answer in the ERP's Request List; this
-- grants the role those columns. Without it, taking an approved request back to Draft (which clears
-- the line keys) would be refused.
--
-- Running this again changes nothing.
--
-- To undo: database/rollback/112_request_list_line_grants.rollback.sql

SET XACT_ABORT ON;
SET NOCOUNT ON;
SET ANSI_NULLS ON;
SET QUOTED_IDENTIFIER ON;
GO

IF NOT EXISTS (SELECT 1 FROM dbo.schema_versions WHERE version = 111)
    THROW 51112, 'Migration 111 must be applied before migration 112.', 1;
GO

IF DATABASE_PRINCIPAL_ID(N'iot_team_app_role') IS NOT NULL
    GRANT UPDATE (erp_line_ref, erp_item_id, erp_line_status, erp_line_status_label, erp_cancelled_reason, erp_line_url) ON OBJECT::dbo.mat_pr_lines TO [iot_team_app_role];
GO

IF NOT EXISTS (SELECT 1 FROM dbo.schema_versions WHERE version = 112)
    INSERT dbo.schema_versions(version, name)
    VALUES (112, N'Request list line grants');
GO
