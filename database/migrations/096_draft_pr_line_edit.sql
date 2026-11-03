-- Migration 096: a draft purchase requisition's lines can be rewritten.
--
-- An approved PR that the Pegasus ERP refused, or deleted, could be neither edited nor cancelled, and kept holding its BOM
-- lines. The owner chose (2026-11-02) to let its requester take it back to Draft, correct the lines and submit it again.
-- Editing a draft replaces its lines, so the application role may now delete PR lines, and only while their PR is a draft:
-- the lines of a PR in approval, approved or ordered stay as they were approved.

SET XACT_ABORT ON;
SET NOCOUNT ON;
GO

IF NOT EXISTS (SELECT 1 FROM dbo.schema_versions WHERE version = 95)
    THROW 51960, 'Migration 095 must be applied before migration 096.', 1;
GO

EXEC sys.sp_executesql N'
CREATE OR ALTER TRIGGER dbo.trg_mat_pr_lines_draft_delete
ON dbo.mat_pr_lines
AFTER DELETE
AS
BEGIN
    SET NOCOUNT ON;
    IF EXISTS (
        SELECT 1
        FROM deleted d
        INNER JOIN dbo.mat_prs pr ON pr.id = d.pr_id
        WHERE pr.status <> N''Draft''
    )
        THROW 51009, ''Only the lines of a draft purchase requisition can be removed.'', 1;
END;';
GO

IF DATABASE_PRINCIPAL_ID(N'iot_team_app_role') IS NOT NULL
    GRANT DELETE ON OBJECT::dbo.mat_pr_lines TO [iot_team_app_role];
GO

IF NOT EXISTS (SELECT 1 FROM dbo.schema_versions WHERE version = 96)
    INSERT dbo.schema_versions(version, name)
    VALUES (96, N'Draft PR line edit');
GO
