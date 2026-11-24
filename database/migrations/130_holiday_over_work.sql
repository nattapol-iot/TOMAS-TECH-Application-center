-- Migration 130: a new company holiday on planned work, and what the project manager decided about it.
--
-- Task doc 4.4-4.5 (owner 2026-11-23): when the company calendar gains a holiday that falls on planned work, the project
-- manager is told (bell, and the plan's follow-up list) and presses to move the row's end out a working day or to keep it;
-- nothing moves on its own. dbo.holidays.added_at says when the app first saw a holiday (NULL for those it had before
-- this migration); dbo.schedule_holiday_decisions keeps each row's decision, so the warning is not shown again.
--
-- It also lets the management project delete (migration 102, one DELETE of the whole task tree) remove a project with an
-- outside supplier's hours: FK_schedule_vendor_hours_task (migration 127) is re-made ON DELETE CASCADE.
--
-- To undo: database/rollback/130_holiday_over_work.rollback.sql

SET XACT_ABORT ON;
SET NOCOUNT ON;
SET ANSI_NULLS ON;
SET QUOTED_IDENTIFIER ON;
GO

IF NOT EXISTS (SELECT 1 FROM dbo.schema_versions WHERE version = 129)
    THROW 51130, 'Migration 129 must be applied before migration 130.', 1;
GO

BEGIN TRANSACTION;

IF COL_LENGTH(N'dbo.holidays', N'added_at') IS NULL
    ALTER TABLE dbo.holidays ADD added_at datetimeoffset(0) NULL
        CONSTRAINT DF_holidays_added_at DEFAULT SYSUTCDATETIME();

IF OBJECT_ID(N'dbo.schedule_holiday_decisions', N'U') IS NULL
    CREATE TABLE dbo.schedule_holiday_decisions (
        task_id      bigint            NOT NULL CONSTRAINT FK_schedule_holiday_decisions_task REFERENCES dbo.schedule_tasks(id) ON DELETE CASCADE,
        holiday_date date              NOT NULL,
        decision     nvarchar(10)      NOT NULL,
        decided_by   bigint            NOT NULL CONSTRAINT FK_schedule_holiday_decisions_user REFERENCES dbo.users(id),
        decided_at   datetimeoffset(0) NOT NULL CONSTRAINT DF_schedule_holiday_decisions_at DEFAULT SYSUTCDATETIME(),
        CONSTRAINT PK_schedule_holiday_decisions PRIMARY KEY (task_id, holiday_date),
        CONSTRAINT CK_schedule_holiday_decisions_decision CHECK (decision IN (N'Shifted', N'Kept'))
    );

IF EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'FK_schedule_vendor_hours_task' AND delete_referential_action = 0)
BEGIN
    ALTER TABLE dbo.schedule_vendor_hours DROP CONSTRAINT FK_schedule_vendor_hours_task;
    ALTER TABLE dbo.schedule_vendor_hours ADD CONSTRAINT FK_schedule_vendor_hours_task FOREIGN KEY (task_id) REFERENCES dbo.schedule_tasks(id) ON DELETE CASCADE;
END;

COMMIT TRANSACTION;
GO

IF DATABASE_PRINCIPAL_ID(N'iot_team_app_role') IS NOT NULL
    GRANT SELECT, INSERT, UPDATE, DELETE ON dbo.schedule_holiday_decisions TO [iot_team_app_role];
GO

IF NOT EXISTS (SELECT 1 FROM dbo.schema_versions WHERE version = 130)
    INSERT dbo.schema_versions(version, name)
    VALUES (130, N'Holiday over work');
GO
