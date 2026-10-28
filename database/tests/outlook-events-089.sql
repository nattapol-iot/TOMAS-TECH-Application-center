-- Migration 089 checks: the Outlook event copy and the per-person sync record exist with their keys, an event for a
-- person can be stored and found by its window, and the same event twice is refused. The rows are rolled back.
SET XACT_ABORT ON;
SET NOCOUNT ON;
SET ANSI_NULLS ON;
SET QUOTED_IDENTIFIER ON;

IF OBJECT_ID(N'dbo.outlook_events', N'U') IS NULL OR OBJECT_ID(N'dbo.outlook_sync', N'U') IS NULL
    THROW 51990, 'dbo.outlook_events and dbo.outlook_sync must exist.', 1;
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID(N'dbo.outlook_events') AND name = N'UX_outlook_events_user_event' AND is_unique = 1)
    THROW 51991, 'UX_outlook_events_user_event must be unique.', 1;
IF NOT EXISTS (SELECT 1 FROM dbo.schema_versions WHERE version = 89 AND name = N'Outlook calendar events on the team board')
    THROW 51992, 'Schema version 89 is not recorded.', 1;

BEGIN TRANSACTION;
DECLARE @role bigint = (SELECT TOP (1) id FROM dbo.roles ORDER BY id);
INSERT dbo.users(entra_object_id, email, name, role_id) VALUES (N'ci-089-user', N'ci-089@example.com', N'CI 089', @role);
DECLARE @user bigint = SCOPE_IDENTITY();
INSERT dbo.outlook_events(user_id, event_id, subject, location, is_private, is_all_day, show_as, start_at, end_at)
VALUES (@user, N'AAMk-1', N'Customer meeting', N'ACME', 0, 0, N'busy', '2026-10-28T09:00:00', '2026-10-28T10:30:00'),
       (@user, N'AAMk-2', NULL, NULL, 1, 1, N'oof', '2026-10-29T00:00:00', '2026-10-30T00:00:00');
INSERT dbo.outlook_sync(user_id, synced_at, error) VALUES (@user, SYSUTCDATETIME(), NULL);
IF (SELECT COUNT(*) FROM dbo.outlook_events WHERE user_id = @user
    AND start_at < DATEADD(day, 1, CONVERT(datetime2(0), '2026-10-29')) AND end_at > CONVERT(datetime2(0), '2026-10-28')) <> 2
    THROW 51993, 'The board window does not find the stored events.', 1;
BEGIN TRY
    INSERT dbo.outlook_events(user_id, event_id, show_as, start_at, end_at) VALUES (@user, N'AAMk-1', N'busy', '2026-10-28T09:00:00', '2026-10-28T10:00:00');
    THROW 51994, 'The same event was stored twice for one person.', 1;
END TRY
BEGIN CATCH
    IF ERROR_NUMBER() = 51994 THROW;
END CATCH;
IF XACT_STATE() <> 0 ROLLBACK TRANSACTION;

PRINT 'PASS: migration 089 checks.';
