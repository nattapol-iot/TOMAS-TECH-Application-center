-- Migration 103: a team task can repeat, and a meeting says where it is held.
--
-- The owner could not add work that repeats, such as a meeting every day to update the team, held
-- online or in the office (owner request 2026-11-09). A repeat is every working day or chosen weekdays
-- until a date, at most a year. Each day it falls on is an ordinary team task (it counts, shows and is
-- changed like any other), tied to its series by series_id and occurrence_date, the day the rule put
-- it on. dbo.team_task_series keeps the rule and what the days were made from (template_json), which
-- the single Outlook entry for the whole series is built from. A meeting is online (meeting_place is
-- its link) or offline (meeting_place is the room or site).

SET XACT_ABORT ON;
SET NOCOUNT ON;
SET ANSI_NULLS ON;
SET QUOTED_IDENTIFIER ON;
GO

IF NOT EXISTS (SELECT 1 FROM dbo.schema_versions WHERE version = 102)
    THROW 51103, 'Migration 102 must be applied before migration 103.', 1;
GO

BEGIN TRANSACTION;

IF OBJECT_ID(N'dbo.team_task_series', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.team_task_series (
        id bigint IDENTITY(1,1) NOT NULL CONSTRAINT PK_team_task_series PRIMARY KEY,
        -- Weekdays: Monday to Friday. Weekly: the days in weekdays.
        repeat_rule nvarchar(10) NOT NULL,
        -- Monday 1, Tuesday 2, Wednesday 4 ... Sunday 64.
        weekdays tinyint NOT NULL,
        -- The first day the rule falls on (a company holiday included): where the Outlook series starts.
        first_date date NOT NULL,
        until_date date NOT NULL,
        template_json nvarchar(max) NOT NULL,
        created_by bigint NOT NULL,
        created_at datetimeoffset(0) NOT NULL CONSTRAINT DF_team_task_series_created_at DEFAULT SYSUTCDATETIME(),
        updated_by bigint NULL,
        updated_at datetimeoffset(0) NULL,
        CONSTRAINT CK_team_task_series_rule CHECK (repeat_rule IN (N'Weekdays', N'Weekly')),
        CONSTRAINT CK_team_task_series_weekdays CHECK (weekdays BETWEEN 1 AND 127),
        CONSTRAINT CK_team_task_series_range CHECK (until_date >= first_date AND DATEDIFF(day, first_date, until_date) <= 366),
        CONSTRAINT CK_team_task_series_template CHECK (ISJSON(template_json) = 1),
        CONSTRAINT FK_team_task_series_created_by FOREIGN KEY (created_by) REFERENCES dbo.users(id),
        CONSTRAINT FK_team_task_series_updated_by FOREIGN KEY (updated_by) REFERENCES dbo.users(id)
    );
END;

IF COL_LENGTH(N'dbo.team_tasks', N'series_id') IS NULL
    ALTER TABLE dbo.team_tasks ADD series_id bigint NULL, occurrence_date date NULL;

IF COL_LENGTH(N'dbo.team_tasks', N'meeting_mode') IS NULL
    ALTER TABLE dbo.team_tasks ADD meeting_mode nvarchar(10) NULL,
        meeting_place nvarchar(500) NOT NULL CONSTRAINT DF_team_tasks_meeting_place DEFAULT N'';

-- The new columns are referenced only through EXEC, so this batch compiles before they exist.
IF OBJECT_ID(N'dbo.FK_team_tasks_series', N'F') IS NULL
    EXEC(N'ALTER TABLE dbo.team_tasks ADD CONSTRAINT FK_team_tasks_series FOREIGN KEY (series_id) REFERENCES dbo.team_task_series(id);');

IF OBJECT_ID(N'dbo.CK_team_tasks_series', N'C') IS NULL
    EXEC(N'ALTER TABLE dbo.team_tasks ADD CONSTRAINT CK_team_tasks_series CHECK ((series_id IS NULL AND occurrence_date IS NULL) OR (series_id IS NOT NULL AND occurrence_date IS NOT NULL));');

IF OBJECT_ID(N'dbo.CK_team_tasks_meeting_mode', N'C') IS NULL
    EXEC(N'ALTER TABLE dbo.team_tasks ADD CONSTRAINT CK_team_tasks_meeting_mode CHECK (meeting_mode IS NULL OR meeting_mode IN (N''Online'', N''Offline''));');

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID(N'dbo.team_tasks') AND name = N'IX_team_tasks_series')
    EXEC(N'CREATE INDEX IX_team_tasks_series ON dbo.team_tasks(series_id, occurrence_date);');

IF DATABASE_PRINCIPAL_ID(N'iot_team_app_role') IS NOT NULL
    GRANT SELECT, INSERT, UPDATE ON OBJECT::dbo.team_task_series TO [iot_team_app_role];

COMMIT TRANSACTION;
GO

IF NOT EXISTS (SELECT 1 FROM dbo.schema_versions WHERE version = 103)
    INSERT dbo.schema_versions(version, name)
    VALUES (103, N'Repeating team tasks and meeting place');
GO
