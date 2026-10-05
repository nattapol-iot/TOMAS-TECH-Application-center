-- Migration 067: which team each department belongs to.
--
-- A team is what a manager oversees: an Engineering Manager or Project Manager reviews and
-- approves the people of their own team. Most departments are a team of their own, so only a
-- department that belongs to another department's team needs a row here; a department with no
-- row is its own team. Department names are compared as the employee directory spells them.
--
-- From the July 2026 organisation chart: the Electrical Engineer Dept. has no manager of its
-- own and is overseen by the IoT Engineer Dept. managers.

-- ── Batch 1: table, seed and grant ──────────────────────────────────────────
SET XACT_ABORT ON;
SET NOCOUNT ON;
BEGIN TRANSACTION;

IF OBJECT_ID(N'dbo.department_teams', N'U') IS NULL
    CREATE TABLE dbo.department_teams (
        department nvarchar(100)     NOT NULL CONSTRAINT PK_department_teams PRIMARY KEY,
        team       nvarchar(100)     NOT NULL,
        updated_at datetimeoffset(0) NOT NULL CONSTRAINT DF_department_teams_updated_at DEFAULT SYSUTCDATETIME(),
        CONSTRAINT CK_department_teams_names CHECK (LEN(department) > 0 AND LEN(team) > 0 AND department <> team)
    );

IF NOT EXISTS (SELECT 1 FROM dbo.department_teams WHERE department = N'Electrical Engineer Dept.')
    INSERT dbo.department_teams(department, team) VALUES (N'Electrical Engineer Dept.', N'IoT Engineer Dept.');

IF DATABASE_PRINCIPAL_ID(N'iot_team_app_role') IS NOT NULL
    GRANT SELECT ON OBJECT::dbo.department_teams TO [iot_team_app_role];

COMMIT TRANSACTION;
GO

-- ── Batch 2: record the version last ────────────────────────────────────────
IF NOT EXISTS (SELECT 1 FROM dbo.schema_versions WHERE version = 67)
    INSERT dbo.schema_versions(version, name)
    VALUES (67, N'Department teams for manager scope');
