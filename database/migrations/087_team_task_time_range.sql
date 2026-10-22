-- Migration 087: a team task can take a time range.
--
-- The owner asked to set a time on a task, from and until (09:00–11:30, say). A fourth time slot,
-- Time, carries start_time and the new end_time; the whole day, the morning and the afternoon keep
-- their fixed hours and no times of their own. A task saved before with a start time and a morning
-- or afternoon becomes a Time task ending where that half day ended (an hour later when it started
-- after that).

SET XACT_ABORT ON;
SET NOCOUNT ON;
SET ANSI_NULLS ON;
SET QUOTED_IDENTIFIER ON;
GO

IF NOT EXISTS (SELECT 1 FROM dbo.schema_versions WHERE version = 86)
    THROW 51870, 'Migration 086 must be applied before migration 087.', 1;
GO

BEGIN TRANSACTION;

IF COL_LENGTH(N'dbo.team_tasks', N'end_time') IS NULL
    ALTER TABLE dbo.team_tasks ADD end_time time(0) NULL;

IF OBJECT_ID(N'dbo.CK_team_tasks_time_slot', N'C') IS NOT NULL
    ALTER TABLE dbo.team_tasks DROP CONSTRAINT CK_team_tasks_time_slot;

-- The new column is referenced only through EXEC, so this batch compiles before it exists.
EXEC(N'UPDATE dbo.team_tasks
    SET time_slot = N''Time'',
        end_time = CASE
            WHEN time_slot = N''AM'' AND start_time < ''12:00'' THEN CONVERT(time(0), ''12:00'')
            WHEN time_slot <> N''AM'' AND start_time < ''17:30'' THEN CONVERT(time(0), ''17:30'')
            WHEN start_time >= ''23:00'' THEN CONVERT(time(0), ''23:59'')
            ELSE DATEADD(hour, 1, start_time) END
    WHERE start_time IS NOT NULL AND time_slot <> N''Time'';');

IF OBJECT_ID(N'dbo.CK_team_tasks_time_slot', N'C') IS NULL
    ALTER TABLE dbo.team_tasks ADD CONSTRAINT CK_team_tasks_time_slot CHECK (time_slot IN (N'Day', N'AM', N'PM', N'Time'));

-- A Time task has both times, ending after it starts on a one-day task; the other slots have none.
IF OBJECT_ID(N'dbo.CK_team_tasks_time_range', N'C') IS NULL
    EXEC(N'ALTER TABLE dbo.team_tasks ADD CONSTRAINT CK_team_tasks_time_range CHECK (
        (time_slot = N''Time'' AND start_time IS NOT NULL AND end_time IS NOT NULL AND (end_date > start_date OR end_time > start_time))
        OR (time_slot <> N''Time'' AND start_time IS NULL AND end_time IS NULL));');

COMMIT TRANSACTION;
GO

IF NOT EXISTS (SELECT 1 FROM dbo.schema_versions WHERE version = 87)
    INSERT dbo.schema_versions(version, name)
    VALUES (87, N'Time range on a team task');
GO
