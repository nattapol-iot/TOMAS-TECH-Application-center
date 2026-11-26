-- Undo of migration 139: the Access Admin role.
--
-- Run by hand, on a database at schema version 139, together with a release of the API from before migration 139.
-- Admin changes roles again, as migration 041 set it. Refuses while someone has Access Admin as their primary role:
-- change it in User Accounts & Permissions first. A role that was ever granted stays for that history, switched off
-- (a switched-off role grants nothing), as the undo of migration 135 does.

SET XACT_ABORT ON;
SET NOCOUNT ON;
SET ANSI_NULLS ON;
SET QUOTED_IDENTIFIER ON;
GO

IF EXISTS (SELECT 1 FROM dbo.schema_versions WHERE version > 139)
    THROW 51939, 'Roll back the migrations after 139 first.', 1;
IF EXISTS (SELECT 1 FROM dbo.users u INNER JOIN dbo.roles r ON r.id = u.role_id WHERE r.code = N'Access Admin')
    THROW 51940, 'Someone still has Access Admin as their primary role; change it first.', 1;
GO

BEGIN TRANSACTION;
INSERT dbo.role_permissions(role_id, permission_id)
SELECT r.id, p.id
FROM dbo.roles r
CROSS JOIN dbo.permissions p
WHERE r.code = N'Admin' AND p.code = N'admin.manage_roles'
  AND NOT EXISTS (SELECT 1 FROM dbo.role_permissions rp WHERE rp.role_id = r.id AND rp.permission_id = p.id);
DELETE rp FROM dbo.role_permissions rp INNER JOIN dbo.roles r ON r.id = rp.role_id WHERE r.code = N'Access Admin';
IF EXISTS (SELECT 1 FROM dbo.user_business_roles b INNER JOIN dbo.roles r ON r.id = b.role_id WHERE r.code = N'Access Admin')
    UPDATE dbo.roles SET is_active = 0 WHERE code = N'Access Admin';
ELSE
    DELETE FROM dbo.roles WHERE code = N'Access Admin';
DELETE FROM dbo.schema_versions WHERE version = 139;
COMMIT TRANSACTION;
GO
