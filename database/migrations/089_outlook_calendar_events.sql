-- Migration 089: Outlook calendar events on the team board.
--
-- People book meetings and site trips in Outlook that the team board never saw (owner request 2026-10-28). The API
-- reads each person's calendar through Microsoft Graph (application permission Calendars.Read) and keeps a copy of
-- the events in a window around today, so the board can show them and count their hours in the day's load.
-- Invitations the board itself sends (UID team-task-<id>@iot-team-center) are not stored again.

SET XACT_ABORT ON;
SET NOCOUNT ON;
SET ANSI_NULLS ON;
SET QUOTED_IDENTIFIER ON;
GO

IF EXISTS (SELECT 1 FROM dbo.schema_versions WHERE version = 89 AND name <> N'Outlook calendar events on the team board')
    THROW 51890, 'Schema version 089 is already used by another migration.', 1;
IF NOT EXISTS (SELECT 1 FROM dbo.schema_versions WHERE version = 88)
    THROW 51891, 'Migration 088 must be applied before migration 089.', 1;
GO

BEGIN TRANSACTION;

IF OBJECT_ID(N'dbo.outlook_events', N'U') IS NULL
    CREATE TABLE dbo.outlook_events (
        id          bigint IDENTITY(1,1) NOT NULL CONSTRAINT PK_outlook_events PRIMARY KEY,
        user_id     bigint            NOT NULL CONSTRAINT FK_outlook_events_user REFERENCES dbo.users(id),
        -- Graph's event id; one row per event per person.
        event_id    nvarchar(400)     NOT NULL,
        -- Null for an event marked private or confidential: the board shows only that the person is busy.
        subject     nvarchar(300)     NULL,
        location    nvarchar(300)     NULL,
        is_private  bit               NOT NULL CONSTRAINT DF_outlook_events_private DEFAULT 0,
        is_all_day  bit               NOT NULL CONSTRAINT DF_outlook_events_all_day DEFAULT 0,
        show_as     nvarchar(30)      NOT NULL,
        -- Bangkok local time, as Graph returns it with the Prefer: outlook.timezone header. An all-day event ends at
        -- midnight after its last day.
        start_at    datetime2(0)      NOT NULL,
        end_at      datetime2(0)      NOT NULL,
        synced_at   datetimeoffset(0) NOT NULL CONSTRAINT DF_outlook_events_synced_at DEFAULT SYSUTCDATETIME(),
        CONSTRAINT CK_outlook_events_range CHECK (end_at >= start_at)
    );

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID(N'dbo.outlook_events') AND name = N'UX_outlook_events_user_event')
    CREATE UNIQUE INDEX UX_outlook_events_user_event ON dbo.outlook_events(user_id, event_id);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID(N'dbo.outlook_events') AND name = N'IX_outlook_events_window')
    CREATE INDEX IX_outlook_events_window ON dbo.outlook_events(start_at, end_at) INCLUDE (user_id);

-- When each person's calendar was last read, and why it could not be (no mailbox, no permission).
IF OBJECT_ID(N'dbo.outlook_sync', N'U') IS NULL
    CREATE TABLE dbo.outlook_sync (
        user_id    bigint            NOT NULL CONSTRAINT PK_outlook_sync PRIMARY KEY CONSTRAINT FK_outlook_sync_user REFERENCES dbo.users(id),
        synced_at  datetimeoffset(0) NOT NULL,
        error      nvarchar(500)     NULL
    );

IF DATABASE_PRINCIPAL_ID(N'iot_team_app_role') IS NOT NULL
BEGIN
    GRANT SELECT, INSERT, UPDATE, DELETE ON OBJECT::dbo.outlook_events TO [iot_team_app_role];
    GRANT SELECT, INSERT, UPDATE ON OBJECT::dbo.outlook_sync TO [iot_team_app_role];
END;

COMMIT TRANSACTION;
GO

-- Record the version last.
IF NOT EXISTS (SELECT 1 FROM dbo.schema_versions WHERE version = 89)
    INSERT dbo.schema_versions(version, name)
    VALUES (89, N'Outlook calendar events on the team board');
GO
