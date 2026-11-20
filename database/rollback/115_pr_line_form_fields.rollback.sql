-- Undo of migration 115: the PR-Form's line fields and part lines.
--
-- Run by hand, on a database at schema version 115, after a backup, and together with a release of
-- the API from before migration 115. What the lines say about material, treatment, detail, quantity
-- per set, need-by date and link is lost, and every part line becomes a line of its own. The deploy
-- workflow never runs this file. Running it on a database that is not at 115 changes nothing.

SET XACT_ABORT ON;
SET NOCOUNT ON;
SET ANSI_NULLS ON;
SET QUOTED_IDENTIFIER ON;
GO

IF EXISTS (SELECT 1 FROM dbo.schema_versions WHERE version > 115)
    THROW 51915, 'Roll back the migrations after 115 first.', 1;
GO

IF EXISTS (SELECT 1 FROM dbo.schema_versions WHERE version = 115)
BEGIN
    BEGIN TRANSACTION;
    IF DATABASE_PRINCIPAL_ID(N'iot_team_app_role') IS NOT NULL AND COL_LENGTH(N'dbo.mat_pr_lines', N'parent_line_id') IS NOT NULL
        REVOKE UPDATE (parent_line_id) ON OBJECT::dbo.mat_pr_lines FROM [iot_team_app_role];
    IF OBJECT_ID(N'dbo.FK_mat_pr_lines_parent', N'F') IS NOT NULL ALTER TABLE dbo.mat_pr_lines DROP CONSTRAINT FK_mat_pr_lines_parent;
    IF OBJECT_ID(N'dbo.CK_mat_pr_lines_form_fields', N'C') IS NOT NULL ALTER TABLE dbo.mat_pr_lines DROP CONSTRAINT CK_mat_pr_lines_form_fields;
    IF EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_mat_pr_lines_parent' AND object_id = OBJECT_ID(N'dbo.mat_pr_lines')) DROP INDEX IX_mat_pr_lines_parent ON dbo.mat_pr_lines;
    IF EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'UX_mat_pr_lines_id_pr' AND object_id = OBJECT_ID(N'dbo.mat_pr_lines')) DROP INDEX UX_mat_pr_lines_id_pr ON dbo.mat_pr_lines;
    IF COL_LENGTH(N'dbo.mat_pr_lines', N'parent_line_id') IS NOT NULL ALTER TABLE dbo.mat_pr_lines DROP COLUMN parent_line_id;
    IF COL_LENGTH(N'dbo.mat_pr_lines', N'attachment_url') IS NOT NULL ALTER TABLE dbo.mat_pr_lines DROP COLUMN attachment_url;
    IF COL_LENGTH(N'dbo.mat_pr_lines', N'need_by') IS NOT NULL ALTER TABLE dbo.mat_pr_lines DROP COLUMN need_by;
    IF COL_LENGTH(N'dbo.mat_pr_lines', N'qty_per_set') IS NOT NULL ALTER TABLE dbo.mat_pr_lines DROP COLUMN qty_per_set;
    IF COL_LENGTH(N'dbo.mat_pr_lines', N'detail') IS NOT NULL ALTER TABLE dbo.mat_pr_lines DROP COLUMN detail;
    IF COL_LENGTH(N'dbo.mat_pr_lines', N'treatment') IS NOT NULL ALTER TABLE dbo.mat_pr_lines DROP COLUMN treatment;
    IF COL_LENGTH(N'dbo.mat_pr_lines', N'material') IS NOT NULL ALTER TABLE dbo.mat_pr_lines DROP COLUMN material;
    DELETE FROM dbo.schema_versions WHERE version = 115;
    COMMIT TRANSACTION;
END;
GO
