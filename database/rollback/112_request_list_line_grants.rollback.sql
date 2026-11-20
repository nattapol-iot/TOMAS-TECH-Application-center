-- Undo of migration 112: the app role's right to write a line's ERP answer.
--
-- Run by hand, on a database at schema version 112, after a backup, and together with a release of
-- the API from before migration 112. The deploy workflow never runs this file. Running it on a
-- database that is not at 112 changes nothing.

SET XACT_ABORT ON;
SET NOCOUNT ON;
SET ANSI_NULLS ON;
SET QUOTED_IDENTIFIER ON;
GO

IF EXISTS (SELECT 1 FROM dbo.schema_versions WHERE version > 112)
    THROW 51912, 'Roll back the migrations after 112 first.', 1;
GO

IF EXISTS (SELECT 1 FROM dbo.schema_versions WHERE version = 112)
BEGIN
    IF DATABASE_PRINCIPAL_ID(N'iot_team_app_role') IS NOT NULL
        REVOKE UPDATE (erp_line_ref, erp_item_id, erp_line_status, erp_line_status_label, erp_cancelled_reason, erp_line_url) ON OBJECT::dbo.mat_pr_lines FROM [iot_team_app_role];
    DELETE FROM dbo.schema_versions WHERE version = 112;
END;
GO
