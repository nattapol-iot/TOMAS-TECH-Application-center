-- Migration 085: the team board and the work people add to it.
--
-- The owner asked for one page that shows everyone's work, so that a customer who calls to book
-- can be given a day at once. Work that the system already knows (inquiries, estimates, project
-- plans) is read from where it lives. Anything else (an appointment, a task, a day away) is added
-- here with as little as a subject and a date, and adjusted later.
--
-- team.board lets a person open the board, see everyone's load and add work for anyone. Every
-- role receives it (owner decision 2026-10-21); the details of work outside a person's own access
-- stay hidden on the board.

SET XACT_ABORT ON;
SET NOCOUNT ON;
SET ANSI_NULLS ON;
SET QUOTED_IDENTIFIER ON;
GO

IF NOT EXISTS (SELECT 1 FROM dbo.schema_versions WHERE version = 84)
    THROW 51850, 'Migration 084 must be applied before migration 085.', 1;
GO

BEGIN TRANSACTION;

IF OBJECT_ID(N'dbo.team_tasks', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.team_tasks (
        id bigint IDENTITY(1,1) NOT NULL CONSTRAINT PK_team_tasks PRIMARY KEY,
        -- Appointment and Task take the assignee's time; Away only marks the days.
        kind nvarchar(20) NOT NULL,
        title nvarchar(300) NOT NULL,
        customer_id bigint NULL,
        -- Nobody yet: the task waits on the board's unassigned row.
        assignee_id bigint NULL,
        start_date date NOT NULL,
        end_date date NOT NULL,
        -- The whole day, the morning or the afternoon, and an optional time for an appointment.
        time_slot nvarchar(10) NOT NULL CONSTRAINT DF_team_tasks_time_slot DEFAULT N'Day',
        start_time time(0) NULL,
        man_days decimal(6,2) NOT NULL CONSTRAINT DF_team_tasks_man_days DEFAULT 0,
        status nvarchar(20) NOT NULL CONSTRAINT DF_team_tasks_status DEFAULT N'Planned',
        inquiry_id bigint NULL,
        project_id bigint NULL,
        note nvarchar(2000) NOT NULL CONSTRAINT DF_team_tasks_note DEFAULT N'',
        created_by bigint NOT NULL,
        created_at datetimeoffset(0) NOT NULL CONSTRAINT DF_team_tasks_created_at DEFAULT SYSUTCDATETIME(),
        updated_by bigint NULL,
        updated_at datetimeoffset(0) NULL,
        deleted_at datetimeoffset(0) NULL,
        row_version rowversion NOT NULL,
        CONSTRAINT CK_team_tasks_kind CHECK (kind IN (N'Appointment', N'Task', N'Away')),
        CONSTRAINT CK_team_tasks_title CHECK (LEN(LTRIM(RTRIM(title))) > 0),
        CONSTRAINT CK_team_tasks_time_slot CHECK (time_slot IN (N'Day', N'AM', N'PM')),
        CONSTRAINT CK_team_tasks_status CHECK (status IN (N'Planned', N'Done', N'Cancelled')),
        CONSTRAINT CK_team_tasks_range CHECK (end_date >= start_date AND DATEDIFF(day, start_date, end_date) <= 366),
        CONSTRAINT CK_team_tasks_man_days CHECK (man_days >= 0 AND man_days <= 999),
        -- Days away belong to someone and take no effort.
        CONSTRAINT CK_team_tasks_away CHECK (kind <> N'Away' OR (assignee_id IS NOT NULL AND man_days = 0)),
        CONSTRAINT FK_team_tasks_customer FOREIGN KEY (customer_id) REFERENCES dbo.customers(id),
        CONSTRAINT FK_team_tasks_assignee FOREIGN KEY (assignee_id) REFERENCES dbo.users(id),
        CONSTRAINT FK_team_tasks_inquiry FOREIGN KEY (inquiry_id) REFERENCES dbo.inquiries(id),
        CONSTRAINT FK_team_tasks_project FOREIGN KEY (project_id) REFERENCES dbo.projects(id),
        CONSTRAINT FK_team_tasks_created_by FOREIGN KEY (created_by) REFERENCES dbo.users(id),
        CONSTRAINT FK_team_tasks_updated_by FOREIGN KEY (updated_by) REFERENCES dbo.users(id)
    );
    CREATE INDEX IX_team_tasks_range ON dbo.team_tasks(end_date, start_date) INCLUDE (assignee_id, kind, status) WHERE deleted_at IS NULL;
END;

INSERT dbo.permissions(code, description)
SELECT N'team.board', N'Open the team board, see everyone''s load and add work for anyone'
WHERE NOT EXISTS (SELECT 1 FROM dbo.permissions WHERE code = N'team.board');

INSERT dbo.role_permissions(role_id, permission_id)
SELECT r.id, p.id
FROM dbo.roles r
CROSS JOIN dbo.permissions p
WHERE p.code = N'team.board'
  AND NOT EXISTS (SELECT 1 FROM dbo.role_permissions rp WHERE rp.role_id = r.id AND rp.permission_id = p.id);

COMMIT TRANSACTION;
GO

-- Removing a team task marks it deleted (deleted_at); rows are never deleted.
IF DATABASE_PRINCIPAL_ID(N'iot_team_app_role') IS NOT NULL
    GRANT SELECT, INSERT, UPDATE ON OBJECT::dbo.team_tasks TO [iot_team_app_role];
GO

IF NOT EXISTS (SELECT 1 FROM dbo.schema_versions WHERE version = 85)
    INSERT dbo.schema_versions(version, name)
    VALUES (85, N'Team board and team tasks');
GO
