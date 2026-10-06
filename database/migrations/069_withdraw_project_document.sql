-- Migration 069: withdrawing a project document that was uploaded by mistake.
--
-- dbo.project_docs stays append-only to the application role (no UPDATE or DELETE; checked by
-- database/scripts/080_verify_production_baseline.sql). A mistaken upload is withdrawn through this
-- owner-executed procedure instead, the same pattern as dbo.answer_schedule_day_request and
-- dbo.delete_unstarted_project: it sets deleted_at only, so the row, its hash and the stored file stay
-- as evidence, and the API records who withdrew it and why in the audit log.
--
-- Only the uploader, the project manager, or an Engineering Manager / Admin (any role held) may
-- withdraw, and never a document that signing uses (a signable document file or a signature scan).

SET XACT_ABORT ON;
SET NOCOUNT ON;
GO

IF NOT EXISTS (SELECT 1 FROM dbo.schema_versions WHERE version = 68)
    THROW 51695, 'Migration 068 must be applied before migration 069.', 1;
GO

-- The procedure looks a document up in both signing tables under a range lock; without these the lookups
-- scan, and a withdrawal would hold every signing insert until it commits. The document list reads them too.
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID(N'dbo.document_files') AND name = N'IX_document_files_project_doc')
    CREATE INDEX IX_document_files_project_doc ON dbo.document_files(project_doc_id);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID(N'dbo.signature_marks') AND name = N'IX_signature_marks_scan_doc')
    CREATE INDEX IX_signature_marks_scan_doc ON dbo.signature_marks(scan_project_doc_id);
GO

CREATE OR ALTER PROCEDURE dbo.withdraw_project_document
    @document_id bigint,
    @project_id bigint,
    @actor bigint,
    @expected_row_version binary(8)
WITH EXECUTE AS OWNER
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    IF @@TRANCOUNT = 0
        THROW 51690, 'Withdrawing a project document requires a caller transaction.', 1;

    -- A NULL actor would make every <> below UNKNOWN and skip the permission check.
    IF @document_id IS NULL OR @project_id IS NULL OR @actor IS NULL OR @expected_row_version IS NULL
        THROW 51696, 'Document, project, actor and row version are required.', 1;

    DECLARE @uploaded_by bigint, @manager_id bigint, @row_version binary(8), @deleted_at datetimeoffset(0);

    SELECT @uploaded_by = d.uploaded_by,
           @row_version = d.row_version,
           @deleted_at = d.deleted_at,
           @manager_id = p.manager_id
    FROM dbo.project_docs d WITH (UPDLOCK, HOLDLOCK)
    INNER JOIN dbo.projects p WITH (UPDLOCK, HOLDLOCK) ON p.id = d.project_id AND p.deleted_at IS NULL
    WHERE d.id = @document_id AND d.project_id = @project_id;

    IF @row_version IS NULL OR @deleted_at IS NOT NULL
        THROW 51691, 'Project document not found.', 1;

    IF @row_version <> @expected_row_version
        THROW 51692, 'The project document changed. Reload it and try again.', 1;

    IF @actor <> @uploaded_by
       AND @actor <> @manager_id
       AND NOT EXISTS (
           SELECT 1
           FROM dbo.user_effective_roles
           WHERE user_id = @actor AND code IN (N'Engineering Manager', N'Admin'))
        THROW 51693, 'Only the uploader, the project manager, an Engineering Manager or an Admin can withdraw this document.', 1;

    IF EXISTS (SELECT 1 FROM dbo.document_files WITH (UPDLOCK, HOLDLOCK) WHERE project_doc_id = @document_id)
       OR EXISTS (SELECT 1 FROM dbo.signature_marks WITH (UPDLOCK, HOLDLOCK) WHERE scan_project_doc_id = @document_id)
        THROW 51694, 'A document that signing uses cannot be withdrawn.', 1;

    UPDATE dbo.project_docs
    SET deleted_at = SYSUTCDATETIME()
    WHERE id = @document_id AND deleted_at IS NULL AND row_version = @expected_row_version;

    IF @@ROWCOUNT <> 1
        THROW 51692, 'The project document changed. Reload it and try again.', 1;
END;
GO

IF DATABASE_PRINCIPAL_ID(N'iot_team_app_role') IS NOT NULL
    GRANT EXECUTE ON OBJECT::dbo.withdraw_project_document TO [iot_team_app_role];
GO

-- Record the version last.
IF NOT EXISTS (SELECT 1 FROM dbo.schema_versions WHERE version = 69)
    INSERT dbo.schema_versions(version, name)
    VALUES (69, N'Withdraw a mistaken project document upload');
GO
