-- Migration 121: the hours people really worked, confirmed day by day.
--
-- The CEO asked to see man-hours used per project and what each engineer does each day (2026-11-10); the only
-- figure the app did not have was the actual hours. Engineers should not get a new data-entry load, so the app
-- drafts each day from the work already planned for them (plan rows they are PIC of, team tasks, customer issues,
-- Outlook meetings) and the engineer confirms it, changing only the days that went differently
-- (backend-node/src/work-days.ts).
--
-- dbo.work_days: one row per person and confirmed day. A day with no work_hours rows is a confirmed day without
-- work (leave, for instance). Confirming again replaces the day's rows; times_confirmed counts the confirmations.
--
-- dbo.work_hours: what the day was spent on. work_key names the work the way the team board does
-- (Project-<schedule task id>, TeamTask-<id>, Issue-<id>, InquiryTask-<id>, Estimate-<id>, EstimateSection-<id>,
-- Inquiry-<id>, Outlook-<outlook event id>); it is NULL for work typed by hand, whose title is the person's note.
-- project_id is what the hours count towards; it is cleared, not deleted, when a project is deleted, so the
-- person's day keeps its total. title is a copy taken at confirmation, so a renamed or deleted row still reads.
-- planned_hours is what the draft offered for that work on that day (NULL for work the person added).

SET XACT_ABORT ON;
SET NOCOUNT ON;
SET ANSI_NULLS ON;
SET QUOTED_IDENTIFIER ON;
GO

IF NOT EXISTS (SELECT 1 FROM dbo.schema_versions WHERE version = 120)
    THROW 52210, 'Migration 120 must be applied before migration 121.', 1;
GO

BEGIN TRANSACTION;

IF OBJECT_ID(N'dbo.work_days', N'U') IS NULL
    CREATE TABLE dbo.work_days (
        user_id            bigint            NOT NULL CONSTRAINT FK_work_days_user REFERENCES dbo.users(id),
        work_date          date              NOT NULL,
        first_confirmed_at datetimeoffset(0) NOT NULL CONSTRAINT DF_work_days_first_confirmed DEFAULT SYSUTCDATETIME(),
        confirmed_at       datetimeoffset(0) NOT NULL CONSTRAINT DF_work_days_confirmed DEFAULT SYSUTCDATETIME(),
        times_confirmed    int               NOT NULL CONSTRAINT DF_work_days_times DEFAULT 1,
        CONSTRAINT PK_work_days PRIMARY KEY (user_id, work_date),
        CONSTRAINT CK_work_days_times CHECK (times_confirmed >= 1)
    );

IF OBJECT_ID(N'dbo.work_hours', N'U') IS NULL
    CREATE TABLE dbo.work_hours (
        id            bigint        IDENTITY(1,1) NOT NULL CONSTRAINT PK_work_hours PRIMARY KEY,
        user_id       bigint        NOT NULL,
        work_date     date          NOT NULL,
        work_key      nvarchar(40)  NULL,
        project_id    bigint        NULL,
        title         nvarchar(300) NOT NULL,
        hours         decimal(5,2)  NOT NULL,
        planned_hours decimal(5,2)  NULL,
        CONSTRAINT FK_work_hours_day FOREIGN KEY (user_id, work_date) REFERENCES dbo.work_days(user_id, work_date) ON DELETE CASCADE,
        CONSTRAINT FK_work_hours_project FOREIGN KEY (project_id) REFERENCES dbo.projects(id) ON DELETE SET NULL,
        CONSTRAINT CK_work_hours_hours CHECK (hours > 0 AND hours <= 24 AND (planned_hours IS NULL OR (planned_hours >= 0 AND planned_hours <= 24))),
        CONSTRAINT CK_work_hours_key CHECK (work_key IS NULL OR work_key LIKE N'[A-Z]%-[1-9]%'),
        CONSTRAINT CK_work_hours_title CHECK (LEN(title) > 0)
    );

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID(N'dbo.work_hours') AND name = N'IX_work_hours_day')
    CREATE INDEX IX_work_hours_day ON dbo.work_hours(user_id, work_date);

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID(N'dbo.work_hours') AND name = N'IX_work_hours_project')
    CREATE INDEX IX_work_hours_project ON dbo.work_hours(project_id, work_date) INCLUDE (hours, user_id) WHERE project_id IS NOT NULL;

-- A piece of work is listed once on a day.
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID(N'dbo.work_hours') AND name = N'UX_work_hours_key')
    CREATE UNIQUE INDEX UX_work_hours_key ON dbo.work_hours(user_id, work_date, work_key) WHERE work_key IS NOT NULL;

COMMIT TRANSACTION;
GO

IF DATABASE_PRINCIPAL_ID(N'iot_team_app_role') IS NOT NULL
BEGIN
    GRANT SELECT, INSERT, UPDATE ON dbo.work_days TO [iot_team_app_role];
    GRANT SELECT, INSERT, DELETE ON dbo.work_hours TO [iot_team_app_role];
END;
GO

IF NOT EXISTS (SELECT 1 FROM dbo.schema_versions WHERE version = 121)
    INSERT dbo.schema_versions(version, name)
    VALUES (121, N'Daily work hours');
GO
