-- Migration 078: a project without an estimate.
--
-- Until now every project came from an approved estimate, so dbo.projects required both the source
-- inquiry and the estimate. The Application team runs projects without an Estimate Cost: their
-- projects name the customer, project name and type directly. inquiry_id and estimate_id become
-- optional. An estimate still creates at most one project, now through a filtered unique index,
-- because a UNIQUE constraint on a nullable column would allow only one project without an estimate.

SET XACT_ABORT ON;
SET NOCOUNT ON;
SET ANSI_NULLS ON;
SET QUOTED_IDENTIFIER ON;
GO

IF EXISTS (SELECT 1 FROM dbo.schema_versions WHERE version = 78 AND name <> N'Project without estimate')
    THROW 51780, 'Schema version 078 is already used by another migration.', 1;
IF NOT EXISTS (SELECT 1 FROM dbo.schema_versions WHERE version = 77)
    THROW 51781, 'Migration 077 must be applied before migration 078.', 1;
GO

BEGIN TRANSACTION;

-- The foreign keys and the unique constraint are dropped around the column change and put back
-- unchanged, so the change does not depend on how SQL Server treats a referenced column.
IF OBJECT_ID(N'dbo.FK_projects_inquiry', N'F') IS NOT NULL
    ALTER TABLE dbo.projects DROP CONSTRAINT FK_projects_inquiry;
IF OBJECT_ID(N'dbo.FK_projects_estimate', N'F') IS NOT NULL
    ALTER TABLE dbo.projects DROP CONSTRAINT FK_projects_estimate;
IF OBJECT_ID(N'dbo.UQ_projects_estimate', N'UQ') IS NOT NULL
    ALTER TABLE dbo.projects DROP CONSTRAINT UQ_projects_estimate;

IF COLUMNPROPERTY(OBJECT_ID(N'dbo.projects'), N'inquiry_id', 'AllowsNull') = 0
    ALTER TABLE dbo.projects ALTER COLUMN inquiry_id bigint NULL;
IF COLUMNPROPERTY(OBJECT_ID(N'dbo.projects'), N'estimate_id', 'AllowsNull') = 0
    ALTER TABLE dbo.projects ALTER COLUMN estimate_id bigint NULL;

IF OBJECT_ID(N'dbo.FK_projects_inquiry', N'F') IS NULL
    ALTER TABLE dbo.projects WITH CHECK ADD CONSTRAINT FK_projects_inquiry FOREIGN KEY (inquiry_id) REFERENCES dbo.inquiries(id);
IF OBJECT_ID(N'dbo.FK_projects_estimate', N'F') IS NULL
    ALTER TABLE dbo.projects WITH CHECK ADD CONSTRAINT FK_projects_estimate FOREIGN KEY (estimate_id) REFERENCES dbo.estimates(id);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID(N'dbo.projects') AND name = N'UX_projects_estimate')
    CREATE UNIQUE INDEX UX_projects_estimate ON dbo.projects(estimate_id) WHERE estimate_id IS NOT NULL;

-- Record the version last.
IF NOT EXISTS (SELECT 1 FROM dbo.schema_versions WHERE version = 78)
    INSERT dbo.schema_versions(version, name)
    VALUES (78, N'Project without estimate');

COMMIT TRANSACTION;
GO
