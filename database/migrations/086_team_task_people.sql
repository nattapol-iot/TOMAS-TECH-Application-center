-- Migration 086: a team task can be for several people.
--
-- The owner asked for more than one person on a task (a site visit for two engineers, say). The
-- people move to dbo.team_task_assignees, in the order they were chosen; the single assignee_id
-- column goes. Each person spends the task's man-days: the effort is per person, not shared. A day
-- away still needs someone, which the API checks now that the people live in their own table.

SET XACT_ABORT ON;
SET NOCOUNT ON;
SET ANSI_NULLS ON;
SET QUOTED_IDENTIFIER ON;
GO

IF NOT EXISTS (SELECT 1 FROM dbo.schema_versions WHERE version = 85)
    THROW 51860, 'Migration 085 must be applied before migration 086.', 1;
GO

BEGIN TRANSACTION;

IF OBJECT_ID(N'dbo.team_task_assignees', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.team_task_assignees (
        task_id bigint NOT NULL,
        user_id bigint NOT NULL,
        sort_order int NOT NULL CONSTRAINT DF_team_task_assignees_sort DEFAULT 1,
        CONSTRAINT PK_team_task_assignees PRIMARY KEY (task_id, user_id),
        CONSTRAINT FK_team_task_assignees_task FOREIGN KEY (task_id) REFERENCES dbo.team_tasks(id),
        CONSTRAINT FK_team_task_assignees_user FOREIGN KEY (user_id) REFERENCES dbo.users(id)
    );
    CREATE INDEX IX_team_task_assignees_user ON dbo.team_task_assignees(user_id) INCLUDE (task_id);
END;

-- The column is referenced only through EXEC, so a re-run after it is gone still compiles.
IF COL_LENGTH(N'dbo.team_tasks', N'assignee_id') IS NOT NULL
BEGIN
    EXEC(N'INSERT dbo.team_task_assignees(task_id, user_id, sort_order)
        SELECT t.id, t.assignee_id, 1 FROM dbo.team_tasks t
        WHERE t.assignee_id IS NOT NULL
          AND NOT EXISTS (SELECT 1 FROM dbo.team_task_assignees a WHERE a.task_id = t.id AND a.user_id = t.assignee_id);');
    IF OBJECT_ID(N'dbo.CK_team_tasks_away', N'C') IS NOT NULL ALTER TABLE dbo.team_tasks DROP CONSTRAINT CK_team_tasks_away;
    IF OBJECT_ID(N'dbo.FK_team_tasks_assignee', N'F') IS NOT NULL ALTER TABLE dbo.team_tasks DROP CONSTRAINT FK_team_tasks_assignee;
    IF EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID(N'dbo.team_tasks') AND name = N'IX_team_tasks_range')
        DROP INDEX IX_team_tasks_range ON dbo.team_tasks;
    EXEC(N'ALTER TABLE dbo.team_tasks DROP COLUMN assignee_id;');
END;

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID(N'dbo.team_tasks') AND name = N'IX_team_tasks_range')
    CREATE INDEX IX_team_tasks_range ON dbo.team_tasks(end_date, start_date) INCLUDE (kind, status) WHERE deleted_at IS NULL;

-- A day away takes no effort; who is away is now checked by the API.
IF OBJECT_ID(N'dbo.CK_team_tasks_away_effort', N'C') IS NULL
    ALTER TABLE dbo.team_tasks ADD CONSTRAINT CK_team_tasks_away_effort CHECK (kind <> N'Away' OR man_days = 0);

COMMIT TRANSACTION;
GO

-- Changing a task's people replaces its rows.
IF DATABASE_PRINCIPAL_ID(N'iot_team_app_role') IS NOT NULL
    GRANT SELECT, INSERT, DELETE ON OBJECT::dbo.team_task_assignees TO [iot_team_app_role];
GO

IF NOT EXISTS (SELECT 1 FROM dbo.schema_versions WHERE version = 86)
    INSERT dbo.schema_versions(version, name)
    VALUES (86, N'Several people on a team task');
GO
