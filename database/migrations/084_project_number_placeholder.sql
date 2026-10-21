-- Migration 084: a placeholder project number may repeat.
--
-- The team registers projects before the ERP issues their number, using an all-zero placeholder
-- such as PJ000000, so several customers' projects carry the same one. A real ERP number stays
-- unique, as before: the unique key is the number itself, except that an all-zero number (at
-- least one 0 and no other digit) is keyed by the project's own id instead.

SET XACT_ABORT ON;
SET NOCOUNT ON;
SET ANSI_NULLS ON;
SET QUOTED_IDENTIFIER ON;
GO

IF NOT EXISTS (SELECT 1 FROM dbo.schema_versions WHERE version = 83)
    THROW 51840, 'Migration 083 must be applied before migration 084.', 1;
GO

BEGIN TRANSACTION;

IF COL_LENGTH(N'dbo.projects', N'project_no_key') IS NULL
    -- Project numbers never contain '#', so a placeholder key cannot collide with a real number.
    ALTER TABLE dbo.projects ADD project_no_key AS CONVERT(nvarchar(40),
        CASE WHEN project_no LIKE N'%0%' AND project_no NOT LIKE N'%[1-9]%'
             THEN CONCAT(N'#', CONVERT(nvarchar(20), id)) ELSE project_no END) PERSISTED;

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID(N'dbo.projects') AND name = N'UX_projects_no_key')
    EXEC(N'CREATE UNIQUE INDEX UX_projects_no_key ON dbo.projects(project_no_key);');

-- Lookups by number (Historical PR import, search) keep an index of their own.
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID(N'dbo.projects') AND name = N'IX_projects_no')
    CREATE INDEX IX_projects_no ON dbo.projects(project_no);

IF EXISTS (SELECT 1 FROM sys.key_constraints WHERE parent_object_id = OBJECT_ID(N'dbo.projects') AND name = N'UQ_projects_no')
    ALTER TABLE dbo.projects DROP CONSTRAINT UQ_projects_no;

COMMIT TRANSACTION;
GO

IF NOT EXISTS (SELECT 1 FROM dbo.schema_versions WHERE version = 84)
    INSERT dbo.schema_versions(version, name)
    VALUES (84, N'Placeholder project number may repeat');
GO
