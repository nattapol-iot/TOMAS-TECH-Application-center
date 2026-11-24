-- Migration 127: people and hours an outside supplier put on a plan row, day by day.
--
-- Task doc 3.6 (owner 2026-11-23): a plan row can be done by an outside supplier (labor_source = Outsourced). The
-- supplier does not use the app, so the member who looks after the row, or the project manager, records how many of
-- the supplier's people worked on it each day under My Work > Outsourced work. hours defaults to people x 8. A lump-sum
-- job may be followed by % only and have no rows here. Our own supervision hours go on an internal sub task.
--
-- To undo: database/rollback/127_vendor_hours.rollback.sql

SET XACT_ABORT ON;
SET NOCOUNT ON;
SET ANSI_NULLS ON;
SET QUOTED_IDENTIFIER ON;
GO

IF NOT EXISTS (SELECT 1 FROM dbo.schema_versions WHERE version = 126)
    THROW 51127, 'Migration 126 must be applied before migration 127.', 1;
GO

BEGIN TRANSACTION;

IF OBJECT_ID(N'dbo.schedule_vendor_hours', N'U') IS NULL
    CREATE TABLE dbo.schedule_vendor_hours (
        task_id     bigint            NOT NULL CONSTRAINT FK_schedule_vendor_hours_task REFERENCES dbo.schedule_tasks(id),
        work_date   date              NOT NULL,
        people      decimal(5,1)      NOT NULL,
        hours       decimal(7,2)      NOT NULL,
        note        nvarchar(300)     NULL,
        entered_by  bigint            NOT NULL CONSTRAINT FK_schedule_vendor_hours_user REFERENCES dbo.users(id),
        entered_at  datetimeoffset(0) NOT NULL CONSTRAINT DF_schedule_vendor_hours_at DEFAULT SYSUTCDATETIME(),
        CONSTRAINT PK_schedule_vendor_hours PRIMARY KEY (task_id, work_date),
        CONSTRAINT CK_schedule_vendor_hours_people CHECK (people > 0 AND people <= 200),
        CONSTRAINT CK_schedule_vendor_hours_hours CHECK (hours > 0 AND hours <= 4800)
    );

COMMIT TRANSACTION;
GO

IF DATABASE_PRINCIPAL_ID(N'iot_team_app_role') IS NOT NULL
    GRANT SELECT, INSERT, UPDATE, DELETE ON dbo.schedule_vendor_hours TO [iot_team_app_role];
GO

IF NOT EXISTS (SELECT 1 FROM dbo.schema_versions WHERE version = 127)
    INSERT dbo.schema_versions(version, name)
    VALUES (127, N'Vendor hours');
GO
