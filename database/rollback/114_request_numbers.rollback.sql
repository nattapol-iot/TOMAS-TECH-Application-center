-- Undo of migration 114: request numbers and the over-budget reason.
--
-- Run by hand, on a database at schema version 114, after a backup, and together with a release of
-- the API from before migration 114. The reasons requesters gave are lost. pr_no goes back to 30
-- characters only if no number is longer than that; otherwise it stays at 50, which the older API
-- reads without trouble. The deploy workflow never runs this file. Running it on a database that is
-- not at 114 changes nothing.

SET XACT_ABORT ON;
SET NOCOUNT ON;
SET ANSI_NULLS ON;
SET QUOTED_IDENTIFIER ON;
GO

IF EXISTS (SELECT 1 FROM dbo.schema_versions WHERE version > 114)
    THROW 51914, 'Roll back the migrations after 114 first.', 1;
GO

IF EXISTS (SELECT 1 FROM dbo.schema_versions WHERE version = 114)
BEGIN
    BEGIN TRANSACTION;
    IF COL_LENGTH(N'dbo.mat_prs', N'over_budget_reason') IS NOT NULL ALTER TABLE dbo.mat_prs DROP COLUMN over_budget_reason;
    IF NOT EXISTS (SELECT 1 FROM dbo.mat_prs WHERE LEN(pr_no) > 30)
    BEGIN
        -- Shortening is not allowed while the column is indexed, so its constraint and indexes are taken off and put back.
        IF EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_mat_prs_project_status' AND object_id = OBJECT_ID(N'dbo.mat_prs')) DROP INDEX IX_mat_prs_project_status ON dbo.mat_prs;
        IF EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_mat_prs_bom_status' AND object_id = OBJECT_ID(N'dbo.mat_prs')) DROP INDEX IX_mat_prs_bom_status ON dbo.mat_prs;
        IF OBJECT_ID(N'dbo.UQ_mat_prs_no', N'UQ') IS NOT NULL ALTER TABLE dbo.mat_prs DROP CONSTRAINT UQ_mat_prs_no;
        ALTER TABLE dbo.mat_prs ALTER COLUMN pr_no nvarchar(30) NOT NULL;
        ALTER TABLE dbo.mat_prs ADD CONSTRAINT UQ_mat_prs_no UNIQUE (pr_no);
        EXEC sys.sp_executesql N'CREATE INDEX IX_mat_prs_project_status ON dbo.mat_prs(project_id, status, required_date) INCLUDE (pr_no, requested_by) WHERE deleted_at IS NULL;';
        EXEC sys.sp_executesql N'CREATE INDEX IX_mat_prs_bom_status ON dbo.mat_prs(bom_id, status) INCLUDE (project_id, pr_no) WHERE deleted_at IS NULL;';
    END;
    DELETE FROM dbo.schema_versions WHERE version = 114;
    COMMIT TRANSACTION;
END;
GO
