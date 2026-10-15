-- Migration 079: people who signed in with TMT ID but are not registered yet.
--
-- Since 2026-10-05 only people registered in Employee Master may sign in: a TMT ID sign-in is
-- linked to the account dbo.sync_employee_directory_user made for that email, and nothing else is
-- created. Someone not registered met "not registered" and an administrator had no way to know who
-- had tried, or with which email. Each such sign-in now leaves one row per TMT ID subject, with the
-- email the sign-in was matched on, so Employee Master can list them and add them in one step. A
-- sign-in that later links to an account clears its row; an administrator can also dismiss one.

-- ── Batch 1: table and grant ────────────────────────────────────────────────
SET XACT_ABORT ON;
SET NOCOUNT ON;
SET ANSI_NULLS ON;
SET QUOTED_IDENTIFIER ON;
IF EXISTS (SELECT 1 FROM dbo.schema_versions WHERE version=79 AND name<>N'Sign-in requests from unregistered people')
    THROW 51791, 'Schema version 079 is already used by another migration.', 1;
IF NOT EXISTS (SELECT 1 FROM dbo.schema_versions WHERE version=78)
    THROW 51792, 'Apply migration 078 before migration 079.', 1;

BEGIN TRANSACTION;

IF OBJECT_ID(N'dbo.sign_in_requests', N'U') IS NULL
    CREATE TABLE dbo.sign_in_requests (
        subject          nvarchar(64)      NOT NULL CONSTRAINT PK_sign_in_requests PRIMARY KEY,
        email            nvarchar(256)     NOT NULL,
        name             nvarchar(200)     NOT NULL,
        username         nvarchar(200)     NOT NULL,
        attempts         int               NOT NULL CONSTRAINT DF_sign_in_requests_attempts DEFAULT 1,
        first_attempt_at datetimeoffset(0) NOT NULL CONSTRAINT DF_sign_in_requests_first DEFAULT SYSUTCDATETIME(),
        last_attempt_at  datetimeoffset(0) NOT NULL CONSTRAINT DF_sign_in_requests_last DEFAULT SYSUTCDATETIME(),
        CONSTRAINT CK_sign_in_requests_attempts CHECK (attempts >= 1),
        CONSTRAINT CK_sign_in_requests_email CHECK (LEN(email) > 0)
    );

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_sign_in_requests_email' AND object_id = OBJECT_ID(N'dbo.sign_in_requests'))
    CREATE INDEX IX_sign_in_requests_email ON dbo.sign_in_requests(email);

IF DATABASE_PRINCIPAL_ID(N'iot_team_app_role') IS NOT NULL
    GRANT SELECT, INSERT, UPDATE, DELETE ON OBJECT::dbo.sign_in_requests TO [iot_team_app_role];

COMMIT TRANSACTION;
GO

-- ── Batch 2: record the version last ────────────────────────────────────────
IF NOT EXISTS (SELECT 1 FROM dbo.schema_versions WHERE version=79)
    INSERT dbo.schema_versions(version,name)
    VALUES (79,N'Sign-in requests from unregistered people');
