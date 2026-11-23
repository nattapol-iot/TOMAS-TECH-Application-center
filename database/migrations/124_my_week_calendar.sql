-- Migration 124: My week — the time people book on their own calendar in the app, and Outlook meetings tied to work.
--
-- Owner decision 2026-11-22/23: people plan their week in the app instead of typing it into Outlook. They book time
-- for a piece of their work on the calendar under My Work > My week, the app writes that time into their Outlook
-- calendar (Microsoft Graph, application permission Calendars.ReadWrite), and the day's hours are drafted from what
-- they booked, so confirming the day stays one press. Meetings other people send them still arrive in Outlook; the
-- app reads them as before (migration 089) and the person may tie one to a piece of work so its hours count there.
--
-- dbo.work_blocks: one row per booked block of time. work_key names the work the way dbo.work_hours does
-- (Project-<schedule task id>, Estimate-<id>, …); it is NULL for other work, whose title is the person's note and
-- project_id the project it counts towards, if any. title is the work's name when it was booked, so the block and its
-- Outlook entry still read when the work is renamed or gone. Times are minutes after midnight, Bangkok time.
-- outlook_event_id / outlook_ical_uid are the Outlook entry the app wrote; outlook_state says whether it is there
-- (Synced), still to write (Pending), failed (Failed), refused for want of permission (Denied) or not written
-- because Microsoft Graph is off (Off). A removed block keeps its row (deleted_at) until its Outlook entry is gone.
-- revision grows with every change, so a write to Outlook that finishes after a newer change does not mark it done.
--
-- dbo.outlook_event_links: an Outlook meeting (by its Graph event id) the person tied to a piece of their work.
--
-- To undo: database/rollback/124_my_week_calendar.rollback.sql

SET XACT_ABORT ON;
SET NOCOUNT ON;
SET ANSI_NULLS ON;
SET QUOTED_IDENTIFIER ON;
GO

IF NOT EXISTS (SELECT 1 FROM dbo.schema_versions WHERE version = 123)
    THROW 51126, 'Migration 123 must be applied before migration 124.', 1;
GO

BEGIN TRANSACTION;

IF OBJECT_ID(N'dbo.work_blocks', N'U') IS NULL
    CREATE TABLE dbo.work_blocks (
        id               bigint            IDENTITY(1,1) NOT NULL CONSTRAINT PK_work_blocks PRIMARY KEY,
        user_id          bigint            NOT NULL CONSTRAINT FK_work_blocks_user REFERENCES dbo.users(id),
        work_date        date              NOT NULL,
        start_minute     smallint          NOT NULL,
        end_minute       smallint          NOT NULL,
        work_key         nvarchar(40)      NULL,
        project_id       bigint            NULL CONSTRAINT FK_work_blocks_project REFERENCES dbo.projects(id) ON DELETE SET NULL,
        title            nvarchar(300)     NOT NULL,
        outlook_event_id nvarchar(400)     NULL,
        outlook_ical_uid nvarchar(400)     NULL,
        outlook_state    nvarchar(20)      NOT NULL CONSTRAINT DF_work_blocks_outlook_state DEFAULT N'Pending',
        outlook_error    nvarchar(300)     NULL,
        revision         int               NOT NULL CONSTRAINT DF_work_blocks_revision DEFAULT 1,
        created_at      datetimeoffset(0) NOT NULL CONSTRAINT DF_work_blocks_created DEFAULT SYSUTCDATETIME(),
        updated_at       datetimeoffset(0) NOT NULL CONSTRAINT DF_work_blocks_updated DEFAULT SYSUTCDATETIME(),
        deleted_at       datetimeoffset(0) NULL,
        CONSTRAINT CK_work_blocks_time CHECK (start_minute >= 0 AND end_minute <= 1440 AND end_minute > start_minute AND end_minute - start_minute <= 720),
        CONSTRAINT CK_work_blocks_key CHECK (work_key IS NULL OR work_key LIKE N'[A-Z]%-[1-9]%'),
        CONSTRAINT CK_work_blocks_title CHECK (LEN(title) > 0),
        CONSTRAINT CK_work_blocks_outlook_state CHECK (outlook_state IN (N'Pending', N'Synced', N'Failed', N'Denied', N'Off'))
    );

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID(N'dbo.work_blocks') AND name = N'IX_work_blocks_day')
    CREATE INDEX IX_work_blocks_day ON dbo.work_blocks(user_id, work_date) INCLUDE (start_minute, end_minute) WHERE deleted_at IS NULL;

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID(N'dbo.work_blocks') AND name = N'IX_work_blocks_outlook')
    CREATE INDEX IX_work_blocks_outlook ON dbo.work_blocks(user_id, outlook_event_id) WHERE outlook_event_id IS NOT NULL;

IF OBJECT_ID(N'dbo.outlook_event_links', N'U') IS NULL
    CREATE TABLE dbo.outlook_event_links (
        user_id   bigint            NOT NULL CONSTRAINT FK_outlook_event_links_user REFERENCES dbo.users(id),
        event_id  nvarchar(400)     NOT NULL,
        work_key  nvarchar(40)      NOT NULL,
        linked_at datetimeoffset(0) NOT NULL CONSTRAINT DF_outlook_event_links_at DEFAULT SYSUTCDATETIME(),
        CONSTRAINT PK_outlook_event_links PRIMARY KEY (user_id, event_id),
        CONSTRAINT CK_outlook_event_links_key CHECK (work_key LIKE N'[A-Z]%-[1-9]%')
    );

COMMIT TRANSACTION;
GO

IF DATABASE_PRINCIPAL_ID(N'iot_team_app_role') IS NOT NULL
BEGIN
    GRANT SELECT, INSERT, UPDATE, DELETE ON dbo.work_blocks TO [iot_team_app_role];
    GRANT SELECT, INSERT, UPDATE, DELETE ON dbo.outlook_event_links TO [iot_team_app_role];
END;
GO

IF NOT EXISTS (SELECT 1 FROM dbo.schema_versions WHERE version = 124)
    INSERT dbo.schema_versions(version, name)
    VALUES (124, N'My week calendar');
GO
