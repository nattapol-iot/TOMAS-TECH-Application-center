SET XACT_ABORT ON;
SET ANSI_NULLS ON;
SET QUOTED_IDENTIFIER ON;
GO

IF EXISTS (SELECT 1 FROM dbo.schema_versions WHERE version = 26) RETURN;
IF NOT EXISTS (SELECT 1 FROM dbo.schema_versions WHERE version = 25)
    THROW 51290, 'Apply migration 025 first.', 1;

BEGIN TRANSACTION;

CREATE TABLE dbo.kpi_review_cycles (
    id bigint IDENTITY PRIMARY KEY,
    code nvarchar(30) NOT NULL UNIQUE,
    name nvarchar(200) NOT NULL,
    period_start date NOT NULL,
    period_end date NOT NULL,
    review_due_date date NOT NULL,
    status nvarchar(20) NOT NULL DEFAULT N'OPEN'
        CHECK (status IN (N'OPEN', N'CALIBRATION', N'CLOSED')),
    created_by bigint NULL REFERENCES dbo.users(id),
    created_at datetimeoffset(0) NOT NULL DEFAULT SYSUTCDATETIME(),
    updated_at datetimeoffset(0) NOT NULL DEFAULT SYSUTCDATETIME(),
    row_version rowversion NOT NULL,
    CONSTRAINT CK_kpi_review_cycle_dates CHECK (period_start <= period_end AND period_end <= review_due_date)
);

CREATE TABLE dbo.kpi_assessments (
    id bigint IDENTITY PRIMARY KEY,
    cycle_id bigint NOT NULL REFERENCES dbo.kpi_review_cycles(id),
    employee_id bigint NOT NULL REFERENCES dbo.employees(id),
    reviewer_id bigint NULL REFERENCES dbo.users(id),
    status nvarchar(30) NOT NULL DEFAULT N'NOT_STARTED'
        CHECK (status IN (N'NOT_STARTED', N'SELF_REVIEW', N'MANAGER_REVIEW', N'CALIBRATION', N'COMPLETED')),
    self_summary nvarchar(1000) NOT NULL DEFAULT N'',
    manager_summary nvarchar(1000) NOT NULL DEFAULT N'',
    development_goal nvarchar(1000) NOT NULL DEFAULT N'',
    self_submitted_at datetimeoffset(0) NULL,
    manager_submitted_at datetimeoffset(0) NULL,
    completed_at datetimeoffset(0) NULL,
    updated_by bigint NOT NULL REFERENCES dbo.users(id),
    created_at datetimeoffset(0) NOT NULL DEFAULT SYSUTCDATETIME(),
    updated_at datetimeoffset(0) NOT NULL DEFAULT SYSUTCDATETIME(),
    row_version rowversion NOT NULL,
    CONSTRAINT UQ_kpi_assessment_cycle_employee UNIQUE (cycle_id, employee_id),
    CONSTRAINT CK_kpi_assessment_completed CHECK (
        (status = N'COMPLETED' AND completed_at IS NOT NULL)
        OR (status <> N'COMPLETED' AND completed_at IS NULL)
    )
);

CREATE TABLE dbo.kpi_assessment_scores (
    assessment_id bigint NOT NULL REFERENCES dbo.kpi_assessments(id),
    area_code nvarchar(30) NOT NULL
        CHECK (area_code IN (N'DELIVERY', N'QUALITY', N'TECHNICAL', N'TEAMWORK')),
    self_score tinyint NULL CHECK (self_score BETWEEN 1 AND 5),
    manager_score tinyint NULL CHECK (manager_score BETWEEN 1 AND 5),
    self_evidence nvarchar(1000) NOT NULL DEFAULT N'',
    manager_evidence nvarchar(1000) NOT NULL DEFAULT N'',
    updated_at datetimeoffset(0) NOT NULL DEFAULT SYSUTCDATETIME(),
    row_version rowversion NOT NULL,
    CONSTRAINT PK_kpi_assessment_scores PRIMARY KEY (assessment_id, area_code)
);

CREATE INDEX IX_kpi_cycles_status_period ON dbo.kpi_review_cycles(status, period_end DESC);
CREATE INDEX IX_kpi_assessments_employee_cycle ON dbo.kpi_assessments(employee_id, cycle_id);
CREATE INDEX IX_kpi_assessments_status_reviewer ON dbo.kpi_assessments(status, reviewer_id);

INSERT INTO dbo.kpi_review_cycles (code, name, period_start, period_end, review_due_date, status)
VALUES (N'H2 2026', N'Second-half performance review', CONVERT(date, '20260701', 112), CONVERT(date, '20261231', 112), CONVERT(date, '20270118', 112), N'OPEN');

INSERT INTO dbo.permissions(code, description)
VALUES (N'performance.read', N'Read own KPI review and framework'),
       (N'performance.manage', N'Review team KPI assessments and calibration');

INSERT INTO dbo.role_permissions(role_id, permission_id)
SELECT role.id, permission.id
FROM dbo.roles role
CROSS JOIN dbo.permissions permission
WHERE (permission.code = N'performance.read'
       AND role.code IN (N'Engineer', N'Project Manager', N'Engineering Manager', N'Admin'))
   OR (permission.code = N'performance.manage'
       AND role.code IN (N'Project Manager', N'Engineering Manager', N'Admin'));

EXEC(N'CREATE TRIGGER dbo.tr_kpi_completed_assessment_frozen ON dbo.kpi_assessments AFTER UPDATE, DELETE AS
BEGIN
    SET NOCOUNT ON;
    IF EXISTS (
        SELECT 1
        FROM deleted old_row
        LEFT JOIN inserted new_row ON new_row.id = old_row.id
        WHERE old_row.status = N''COMPLETED'' OR new_row.id IS NULL
    )
        THROW 51291, ''Completed KPI assessments cannot be changed or deleted.'', 1;
END');

EXEC(N'CREATE TRIGGER dbo.tr_kpi_completed_scores_frozen ON dbo.kpi_assessment_scores AFTER UPDATE, DELETE AS
BEGIN
    SET NOCOUNT ON;
    IF EXISTS (
        SELECT 1
        FROM deleted old_score
        INNER JOIN dbo.kpi_assessments assessment ON assessment.id = old_score.assessment_id
        WHERE assessment.status = N''COMPLETED''
    )
        THROW 51292, ''Scores on a completed KPI assessment cannot be changed or deleted.'', 1;
END');

IF DATABASE_PRINCIPAL_ID(N'iot_team_app_role') IS NOT NULL
BEGIN
    GRANT SELECT, INSERT, UPDATE ON dbo.kpi_review_cycles TO iot_team_app_role;
    GRANT SELECT, INSERT, UPDATE ON dbo.kpi_assessments TO iot_team_app_role;
    GRANT SELECT, INSERT, UPDATE ON dbo.kpi_assessment_scores TO iot_team_app_role;
END;

INSERT INTO dbo.schema_versions(version, name)
VALUES (26, N'Durable role-scoped KPI performance reviews');

COMMIT;
GO
