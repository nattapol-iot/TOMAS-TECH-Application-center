-- Migration 113: purchase Units under an estimate Module.
--
-- The Excel PR-Form is one file per Unit: a drawing number and a unit name (MZ08-U001 MASTER VALVE
-- UNIT), with its own budget, plus one file for general items. With thirteen files for one project,
-- nobody saw the Mechanical total against its budget. The owner chose (2026-11-20): a Unit sits
-- under a Module of the estimate. The Module's budget stays the limit it already is; its Units split
-- that budget, and a request is raised for a Unit.
--
--   project_purchase_units   a project's Units: module, discipline (ME, EE, SW, IN), drawing number,
--                            name, budget. One "general" Unit per module and discipline holds what
--                            belongs to no drawing.
--   mat_prs.unit_id          the Unit a request is for (NULL: the requests there were before Units)
--
-- Nothing existing changes. Running this again changes nothing.
--
-- To undo: database/rollback/113_purchase_units.rollback.sql

SET XACT_ABORT ON;
SET NOCOUNT ON;
SET ANSI_NULLS ON;
SET QUOTED_IDENTIFIER ON;
GO

IF NOT EXISTS (SELECT 1 FROM dbo.schema_versions WHERE version = 112)
    THROW 51113, 'Migration 112 must be applied before migration 113.', 1;
GO

BEGIN TRANSACTION;

IF OBJECT_ID(N'dbo.project_purchase_units', N'U') IS NULL
    CREATE TABLE dbo.project_purchase_units (
        id          bigint IDENTITY(1,1) NOT NULL CONSTRAINT PK_project_purchase_units PRIMARY KEY,
        project_id  bigint            NOT NULL CONSTRAINT FK_project_purchase_units_project FOREIGN KEY REFERENCES dbo.projects(id),
        module      nvarchar(200)     NOT NULL,
        discipline  nvarchar(10)      NOT NULL,
        drawing_no  nvarchar(100)     NOT NULL CONSTRAINT DF_project_purchase_units_drawing DEFAULT N'',
        unit_name   nvarchar(200)     NOT NULL,
        is_general  bit               NOT NULL CONSTRAINT DF_project_purchase_units_general DEFAULT 0,
        budget      decimal(19,4)     NOT NULL CONSTRAINT DF_project_purchase_units_budget DEFAULT 0,
        created_by  bigint            NOT NULL CONSTRAINT FK_project_purchase_units_created_by FOREIGN KEY REFERENCES dbo.users(id),
        updated_by  bigint            NOT NULL CONSTRAINT FK_project_purchase_units_updated_by FOREIGN KEY REFERENCES dbo.users(id),
        created_at  datetimeoffset(0) NOT NULL CONSTRAINT DF_project_purchase_units_created_at DEFAULT SYSUTCDATETIME(),
        updated_at  datetimeoffset(0) NOT NULL CONSTRAINT DF_project_purchase_units_updated_at DEFAULT SYSUTCDATETIME(),
        deleted_at  datetimeoffset(0) NULL,
        row_version rowversion        NOT NULL,
        CONSTRAINT CK_project_purchase_units_discipline CHECK (discipline IN (N'ME', N'EE', N'SW', N'IN')),
        CONSTRAINT CK_project_purchase_units_budget CHECK (budget >= 0),
        CONSTRAINT CK_project_purchase_units_name CHECK (LEN(LTRIM(RTRIM(unit_name))) > 0 AND LEN(LTRIM(RTRIM(module))) > 0),
        CONSTRAINT CK_project_purchase_units_drawing CHECK ((is_general = 1 AND drawing_no = N'') OR (is_general = 0 AND LEN(LTRIM(RTRIM(drawing_no))) > 0))
    );

IF COL_LENGTH(N'dbo.mat_prs', N'unit_id') IS NULL
    ALTER TABLE dbo.mat_prs ADD unit_id bigint NULL CONSTRAINT FK_mat_prs_unit FOREIGN KEY REFERENCES dbo.project_purchase_units(id);

COMMIT TRANSACTION;
GO

BEGIN TRANSACTION;

-- A drawing number names one Unit of a discipline in a project; a module has one general Unit per discipline.
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'UX_project_purchase_units_drawing' AND object_id = OBJECT_ID(N'dbo.project_purchase_units'))
    EXEC sys.sp_executesql N'CREATE UNIQUE INDEX UX_project_purchase_units_drawing ON dbo.project_purchase_units(project_id, discipline, drawing_no) WHERE deleted_at IS NULL AND is_general = 0;';
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'UX_project_purchase_units_general' AND object_id = OBJECT_ID(N'dbo.project_purchase_units'))
    EXEC sys.sp_executesql N'CREATE UNIQUE INDEX UX_project_purchase_units_general ON dbo.project_purchase_units(project_id, discipline, module) WHERE deleted_at IS NULL AND is_general = 1;';
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_mat_prs_unit' AND object_id = OBJECT_ID(N'dbo.mat_prs'))
    EXEC sys.sp_executesql N'CREATE INDEX IX_mat_prs_unit ON dbo.mat_prs(unit_id) WHERE unit_id IS NOT NULL;';

IF DATABASE_PRINCIPAL_ID(N'iot_team_app_role') IS NOT NULL
    GRANT SELECT, INSERT, UPDATE ON OBJECT::dbo.project_purchase_units TO [iot_team_app_role];

COMMIT TRANSACTION;
GO

IF NOT EXISTS (SELECT 1 FROM dbo.schema_versions WHERE version = 113)
    INSERT dbo.schema_versions(version, name)
    VALUES (113, N'Purchase units under a module');
GO
