:on error exit
SET ANSI_NULLS ON;
SET QUOTED_IDENTIFIER ON;
SET XACT_ABORT ON;
SET NOCOUNT ON;

IF NOT EXISTS (SELECT 1 FROM dbo.schema_versions WHERE version = 14)
    THROW 51195, 'Migration 014 must be applied before migration 015.', 1;

IF EXISTS (SELECT 1 FROM dbo.schema_versions WHERE version = 15)
BEGIN
    PRINT 'Migration 015 is already applied.';
    RETURN;
END;

BEGIN TRANSACTION;

-- Approved and published payloads are immutable. Workflow-owned fields may
-- still advance in these legitimate cases: Approved -> Published,
-- Published -> Superseded, and audited Archive/Restore status changes.
EXEC(N'
ALTER TRIGGER dbo.trg_knowledge_document_versions_immutable
ON dbo.knowledge_document_versions
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    IF EXISTS (
        SELECT 1
        FROM deleted d
        INNER JOIN inserted i ON i.id = d.id
        WHERE d.status IN (N''Approved'', N''Published'')
          AND (
               d.revision <> i.revision
            OR d.version_number <> i.version_number
            OR d.change_type <> i.change_type
            OR d.change_summary <> i.change_summary
            OR d.document_id <> i.document_id
            OR d.created_by <> i.created_by
            OR d.created_at <> i.created_at
            OR (d.file_id IS NULL AND i.file_id IS NOT NULL)
            OR (d.file_id IS NOT NULL AND i.file_id IS NULL)
            OR (d.file_id IS NOT NULL AND i.file_id IS NOT NULL AND d.file_id <> i.file_id)
            OR (d.extracted_text IS NULL AND i.extracted_text IS NOT NULL)
            OR (d.extracted_text IS NOT NULL AND i.extracted_text IS NULL)
            OR (d.extracted_text IS NOT NULL AND i.extracted_text IS NOT NULL AND d.extracted_text <> i.extracted_text)
            OR (
                NOT (d.status = N''Approved'' AND i.status = N''Published'')
                AND (
                       (d.effective_date IS NULL AND i.effective_date IS NOT NULL)
                    OR (d.effective_date IS NOT NULL AND i.effective_date IS NULL)
                    OR (d.effective_date IS NOT NULL AND i.effective_date IS NOT NULL AND d.effective_date <> i.effective_date)
                    OR (d.expiry_date IS NULL AND i.expiry_date IS NOT NULL)
                    OR (d.expiry_date IS NOT NULL AND i.expiry_date IS NULL)
                    OR (d.expiry_date IS NOT NULL AND i.expiry_date IS NOT NULL AND d.expiry_date <> i.expiry_date)
                )
            )
          ))
        THROW 51174, ''Approved and published revisions are immutable. Create a new revision instead.'', 1;
END;');

-- Resubmission replaces only pending routing rows. Every transition remains
-- recorded in the append-only knowledge audit ledger.
IF DATABASE_PRINCIPAL_ID(N'iot_team_app_role') IS NOT NULL
    GRANT DELETE ON OBJECT::dbo.knowledge_document_approvals TO [iot_team_app_role];

INSERT INTO dbo.schema_versions(version, name)
VALUES (15, N'Knowledge Hub workflow hardening: publish transition and approval resubmission');

COMMIT TRANSACTION;
GO
