-- Migration 071: each person's own order of work.
--
-- A person, or a manager for them, ranks the open work on their plate: plan tasks, inquiries,
-- estimates and Resource Plan tasks, named by their Workload key (Project-<task id>,
-- Estimate-<id>, Inquiry-<id>, InquiryTask-<id>). The Workload screen and My Work use the order to
-- project when each item would finish if it is worked in that order. Plan dates are never changed
-- here: a projected slip is raised through the existing day request, which the PM still answers.
-- A row whose work has finished or gone simply stops matching anything and is ignored.

-- ── Batch 1: table and grant ────────────────────────────────────────────────
SET XACT_ABORT ON;
SET NOCOUNT ON;
SET ANSI_NULLS ON;
SET QUOTED_IDENTIFIER ON;
IF EXISTS (SELECT 1 FROM dbo.schema_versions WHERE version=71 AND name<>N'Personal work order')
    THROW 51711, 'Schema version 071 is already used by another migration.', 1;
IF NOT EXISTS (SELECT 1 FROM dbo.schema_versions WHERE version=70)
    THROW 51712, 'Apply migration 070 before migration 071.', 1;

BEGIN TRANSACTION;

IF OBJECT_ID(N'dbo.work_priorities', N'U') IS NULL
    CREATE TABLE dbo.work_priorities (
        user_id    bigint            NOT NULL CONSTRAINT FK_work_priorities_user REFERENCES dbo.users(id),
        work_key   nvarchar(40)      NOT NULL,
        sort_order int               NOT NULL,
        updated_by bigint            NOT NULL CONSTRAINT FK_work_priorities_updated_by REFERENCES dbo.users(id),
        updated_at datetimeoffset(0) NOT NULL CONSTRAINT DF_work_priorities_updated_at DEFAULT SYSUTCDATETIME(),
        CONSTRAINT PK_work_priorities PRIMARY KEY (user_id, work_key),
        CONSTRAINT CK_work_priorities_key CHECK (LEN(work_key) BETWEEN 3 AND 40),
        CONSTRAINT CK_work_priorities_order CHECK (sort_order BETWEEN 1 AND 500)
    );

IF DATABASE_PRINCIPAL_ID(N'iot_team_app_role') IS NOT NULL
    GRANT SELECT, INSERT, DELETE ON OBJECT::dbo.work_priorities TO [iot_team_app_role];

COMMIT TRANSACTION;
GO

-- ── Batch 2: record the version last ────────────────────────────────────────
IF NOT EXISTS (SELECT 1 FROM dbo.schema_versions WHERE version=71)
    INSERT dbo.schema_versions(version,name)
    VALUES (71,N'Personal work order');
