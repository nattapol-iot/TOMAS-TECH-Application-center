:on error exit
SET ANSI_NULLS ON;
SET QUOTED_IDENTIFIER ON;
SET ANSI_PADDING ON;
SET ANSI_WARNINGS ON;
SET ARITHABORT ON;
SET CONCAT_NULL_YIELDS_NULL ON;
SET NUMERIC_ROUNDABORT OFF;
SET XACT_ABORT ON;
BEGIN TRANSACTION;

IF EXISTS (SELECT 1 FROM dbo.schema_versions WHERE version = 11)
    THROW 51140, 'Migration 011 has already been applied.', 1;

IF NOT EXISTS (SELECT 1 FROM dbo.schema_versions WHERE version = 10)
    THROW 51141, 'Migration 010 must be applied before migration 011.', 1;

CREATE TABLE dbo.employees (
    id bigint IDENTITY(1,1) NOT NULL CONSTRAINT PK_employees PRIMARY KEY,
    employee_no int NOT NULL CONSTRAINT UQ_employees_employee_no UNIQUE,
    name_en nvarchar(200) NOT NULL,
    name_th nvarchar(200) NOT NULL CONSTRAINT DF_employees_name_th DEFAULT N'',
    department nvarchar(100) NOT NULL,
    job_title nvarchar(500) NOT NULL,
    mobile nvarchar(50) NOT NULL CONSTRAINT DF_employees_mobile DEFAULT N'',
    email nvarchar(256) NOT NULL CONSTRAINT UQ_employees_email UNIQUE,
    nickname nvarchar(100) NOT NULL CONSTRAINT DF_employees_nickname DEFAULT N'',
    birth_date date NULL,
    uniform_size nvarchar(50) NOT NULL CONSTRAINT DF_employees_uniform_size DEFAULT N'',
    shoe_size nvarchar(50) NOT NULL CONSTRAINT DF_employees_shoe_size DEFAULT N'',
    start_work_date date NOT NULL,
    end_work_date date NULL,
    position nvarchar(100) NOT NULL,
    user_id bigint NULL,
    is_active bit NOT NULL CONSTRAINT DF_employees_is_active DEFAULT 1,
    created_by bigint NOT NULL,
    updated_by bigint NOT NULL,
    created_at datetimeoffset(0) NOT NULL CONSTRAINT DF_employees_created_at DEFAULT SYSUTCDATETIME(),
    updated_at datetimeoffset(0) NOT NULL CONSTRAINT DF_employees_updated_at DEFAULT SYSUTCDATETIME(),
    deleted_at datetimeoffset(0) NULL,
    row_version rowversion NOT NULL,
    CONSTRAINT CK_employees_employee_no CHECK (employee_no > 0),
    CONSTRAINT CK_employees_work_dates CHECK (end_work_date IS NULL OR end_work_date >= start_work_date),
    CONSTRAINT CK_employees_birth_before_work CHECK (birth_date IS NULL OR birth_date < start_work_date),
    CONSTRAINT FK_employees_user FOREIGN KEY (user_id) REFERENCES dbo.users(id),
    CONSTRAINT FK_employees_created_by FOREIGN KEY (created_by) REFERENCES dbo.users(id),
    CONSTRAINT FK_employees_updated_by FOREIGN KEY (updated_by) REFERENCES dbo.users(id)
);

CREATE UNIQUE INDEX UX_employees_user
    ON dbo.employees(user_id)
    WHERE user_id IS NOT NULL AND deleted_at IS NULL;

CREATE INDEX IX_employees_active_department
    ON dbo.employees(is_active, department, position, name_en)
    INCLUDE (employee_no, email, start_work_date, end_work_date)
    WHERE deleted_at IS NULL;

IF DATABASE_PRINCIPAL_ID(N'iot_team_app_role') IS NOT NULL
BEGIN
    GRANT SELECT, INSERT, UPDATE ON OBJECT::dbo.employees TO [iot_team_app_role];
END;

INSERT INTO dbo.schema_versions(version, name)
VALUES (11, N'Employee master records separated from application identities');

COMMIT TRANSACTION;
GO
