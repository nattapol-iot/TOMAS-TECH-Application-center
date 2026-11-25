-- Undo of migration 135: the Leader role.
--
-- Run by hand, on a database at schema version 135, together with a release of the API from before migration 135.
-- Refuses while someone has Leader as their primary role: change it in User Accounts & Permissions first. A role that was
-- ever granted as an additional role stays for that history, switched off (a switched-off role grants nothing).

SET XACT_ABORT ON;
SET NOCOUNT ON;
SET ANSI_NULLS ON;
SET QUOTED_IDENTIFIER ON;
GO

IF EXISTS (SELECT 1 FROM dbo.schema_versions WHERE version > 135)
    THROW 51935, 'Roll back the migrations after 135 first.', 1;
IF EXISTS (SELECT 1 FROM dbo.users u INNER JOIN dbo.roles r ON r.id = u.role_id WHERE r.code = N'Leader')
    THROW 51936, 'Someone still has Leader as their primary role; change it first.', 1;
GO

BEGIN TRANSACTION;
DELETE rp FROM dbo.role_permissions rp INNER JOIN dbo.roles r ON r.id = rp.role_id WHERE r.code = N'Leader';
IF EXISTS (SELECT 1 FROM dbo.user_business_roles b INNER JOIN dbo.roles r ON r.id = b.role_id WHERE r.code = N'Leader')
    UPDATE dbo.roles SET is_active = 0 WHERE code = N'Leader';
ELSE
    DELETE FROM dbo.roles WHERE code = N'Leader';
DELETE FROM dbo.schema_versions WHERE version = 135;
COMMIT TRANSACTION;
GO
