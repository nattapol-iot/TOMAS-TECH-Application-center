-- Migration 091: click-through guides and who has finished them.
--
-- The owner asked for an in-app guide that teaches a task by having the person click through it on the real screen
-- (owner request 2026-10-30), and for the progress to be kept in the system so that a head can see who on the team
-- has finished which guide. The guides themselves are written in the frontend; this table only remembers, per person
-- and guide, how far they got, when they finished, and whether they have answered the invitation a screen shows the
-- first time it is opened.

SET XACT_ABORT ON;
SET NOCOUNT ON;
SET ANSI_NULLS ON;
SET QUOTED_IDENTIFIER ON;
GO

IF EXISTS (SELECT 1 FROM dbo.schema_versions WHERE version = 91 AND name <> N'Click-through guide progress')
    THROW 51910, 'Schema version 091 is already used by another migration.', 1;
IF NOT EXISTS (SELECT 1 FROM dbo.schema_versions WHERE version = 90)
    THROW 51911, 'Migration 090 must be applied before migration 091.', 1;
GO

BEGIN TRANSACTION;

IF OBJECT_ID(N'dbo.user_guide_progress', N'U') IS NULL
    CREATE TABLE dbo.user_guide_progress (
        user_id          bigint            NOT NULL CONSTRAINT FK_user_guide_progress_user REFERENCES dbo.users(id),
        -- The guide's id in the frontend catalog, such as inquiry-create.
        guide_id         nvarchar(60)      NOT NULL,
        -- The furthest step reached in the latest run, out of the guide's step count at the time.
        step_reached     int               NOT NULL CONSTRAINT DF_user_guide_progress_step_reached DEFAULT 0,
        step_count       int               NOT NULL CONSTRAINT DF_user_guide_progress_step_count DEFAULT 0,
        started_at       datetimeoffset(0) NULL,
        -- The first time the person reached the end. A later run does not clear it.
        completed_at     datetimeoffset(0) NULL,
        -- The person answered the invitation (started the guide or said not now), so it is not shown again.
        invite_closed_at datetimeoffset(0) NULL,
        updated_at       datetimeoffset(0) NOT NULL CONSTRAINT DF_user_guide_progress_updated_at DEFAULT SYSUTCDATETIME(),
        CONSTRAINT PK_user_guide_progress PRIMARY KEY (user_id, guide_id),
        CONSTRAINT CK_user_guide_progress_guide CHECK (LEN(guide_id) > 0 AND guide_id NOT LIKE N'%[^a-z0-9-]%'),
        CONSTRAINT CK_user_guide_progress_steps CHECK (step_count BETWEEN 0 AND 100 AND step_reached BETWEEN 0 AND step_count)
    );

IF DATABASE_PRINCIPAL_ID(N'iot_team_app_role') IS NOT NULL
    GRANT SELECT, INSERT, UPDATE ON OBJECT::dbo.user_guide_progress TO [iot_team_app_role];

COMMIT TRANSACTION;
GO

-- Record the version last.
IF NOT EXISTS (SELECT 1 FROM dbo.schema_versions WHERE version = 91)
    INSERT dbo.schema_versions(version, name)
    VALUES (91, N'Click-through guide progress');
GO
