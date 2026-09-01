:on error exit
SET ANSI_NULLS ON;
SET QUOTED_IDENTIFIER ON;
SET XACT_ABORT ON;
SET NOCOUNT ON;

IF NOT EXISTS (SELECT 1 FROM dbo.schema_versions WHERE version = 16)
    THROW 51200, 'Migration 016 must be applied before migration 017.', 1;

IF EXISTS (SELECT 1 FROM dbo.schema_versions WHERE version = 17)
BEGIN
    PRINT 'Migration 017 is already applied.';
    RETURN;
END;

BEGIN TRANSACTION;

-- Notification delivery is idempotent. The API must read the unique dedupe key
-- before inserting, while still deliberately receiving no DELETE permission.
IF DATABASE_PRINCIPAL_ID(N'iot_team_app_role') IS NOT NULL
    GRANT SELECT ON OBJECT::dbo.notifications TO [iot_team_app_role];

INSERT INTO dbo.schema_versions(version, name)
VALUES (17, N'Node API application-role permission parity');

COMMIT TRANSACTION;
GO
