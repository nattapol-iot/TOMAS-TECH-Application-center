-- Migration 132: the project manager's note on the CEO cost summary (task doc 6.3, owner decision 4 of 2026-11-24).
--
-- The CEO summary writes its own "things to know" from the figures; beside them the project manager may leave a short note
-- in their own words. One note per project, kept until it is changed or cleared; deleting a project takes its note along.
--
-- To undo: database/rollback/132_project_ceo_notes.rollback.sql

SET XACT_ABORT ON;
SET NOCOUNT ON;
SET ANSI_NULLS ON;
SET QUOTED_IDENTIFIER ON;
GO

IF NOT EXISTS (SELECT 1 FROM dbo.schema_versions WHERE version = 131)
    THROW 51132, 'Migration 131 must be applied before migration 132.', 1;
GO

IF OBJECT_ID(N'dbo.project_ceo_notes', N'U') IS NULL
    CREATE TABLE dbo.project_ceo_notes (
        project_id bigint            NOT NULL CONSTRAINT PK_project_ceo_notes PRIMARY KEY
                                     CONSTRAINT FK_project_ceo_notes_project REFERENCES dbo.projects(id) ON DELETE CASCADE,
        note       nvarchar(2000)    NOT NULL,
        updated_by bigint            NOT NULL CONSTRAINT FK_project_ceo_notes_user REFERENCES dbo.users(id),
        updated_at datetimeoffset(0) NOT NULL CONSTRAINT DF_project_ceo_notes_at DEFAULT SYSUTCDATETIME()
    );
GO

IF DATABASE_PRINCIPAL_ID(N'iot_team_app_role') IS NOT NULL
    GRANT SELECT, INSERT, UPDATE, DELETE ON dbo.project_ceo_notes TO [iot_team_app_role];
GO

IF NOT EXISTS (SELECT 1 FROM dbo.schema_versions WHERE version = 132)
    INSERT dbo.schema_versions(version, name)
    VALUES (132, N'Project CEO notes');
GO
