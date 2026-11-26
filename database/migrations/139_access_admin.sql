-- Migration 139: User Accounts & Permissions is the owner's alone (owner 2026-11-26).
--
-- The menu opened for everyone who reads master data, and every Admin could change roles. Accounts that signed in
-- before 2026-10-05 were made Admin, so many people hold Admin. The owner asked that only they see that screen.
-- Changing roles (admin.manage_roles) moves to a new role, Access Admin, which the owner holds as an additional role;
-- the menu needs admin.manage_roles (ProductionApp.tsx). The owner is found by the email migrations 097 and 101 use.
-- Without that account, as on a fresh database, nothing moves: Admin keeps admin.manage_roles, so roles can still be
-- managed. The owner may give Access Admin to someone else on the same screen.
--
-- To undo: database/rollback/139_access_admin.rollback.sql

SET XACT_ABORT ON;
SET NOCOUNT ON;
SET ANSI_NULLS ON;
SET QUOTED_IDENTIFIER ON;
GO

IF EXISTS (SELECT 1 FROM dbo.schema_versions WHERE version = 139 AND name <> N'Access admin')
    THROW 51391, 'Schema version 139 is already used by another migration.', 1;
IF NOT EXISTS (SELECT 1 FROM dbo.schema_versions WHERE version = 138)
    THROW 51392, 'Migration 138 must be applied before migration 139.', 1;
GO

BEGIN TRANSACTION;

IF NOT EXISTS (SELECT 1 FROM dbo.roles WHERE code = N'Access Admin')
    INSERT dbo.roles(code, name, description)
    VALUES (N'Access Admin', N'Access Admin', N'Manages user accounts and roles: opens User Accounts & Permissions and changes who holds which role. The owner holds it (2026-11-26)');
UPDATE dbo.roles SET is_active = 1 WHERE code = N'Access Admin' AND is_active = 0;

INSERT dbo.role_permissions(role_id, permission_id)
SELECT r.id, p.id
FROM dbo.roles r
CROSS JOIN dbo.permissions p
WHERE r.code = N'Access Admin' AND p.code = N'admin.manage_roles'
  AND NOT EXISTS (SELECT 1 FROM dbo.role_permissions rp WHERE rp.role_id = r.id AND rp.permission_id = p.id);

DECLARE @owner bigint = (SELECT id FROM dbo.users WHERE email = N'nattapol.p@tomastc.com' AND is_active = 1 AND deleted_at IS NULL);
DECLARE @access_admin bigint = (SELECT id FROM dbo.roles WHERE code = N'Access Admin');

IF @owner IS NOT NULL
BEGIN
    IF EXISTS (SELECT 1 FROM dbo.user_business_roles WHERE user_id = @owner AND role_id = @access_admin)
        UPDATE dbo.user_business_roles SET revoked_at = NULL WHERE user_id = @owner AND role_id = @access_admin AND revoked_at IS NOT NULL;
    ELSE
        INSERT dbo.user_business_roles(user_id, role_id, granted_by, reason)
        VALUES (@owner, @access_admin, @owner, N'Owner 2026-11-26: only the owner manages user accounts and roles (migration 139)');

    DELETE rp
    FROM dbo.role_permissions rp
    INNER JOIN dbo.permissions p ON p.id = rp.permission_id
    INNER JOIN dbo.roles r ON r.id = rp.role_id
    WHERE p.code = N'admin.manage_roles' AND r.code <> N'Access Admin';
END
ELSE
    PRINT 'Migration 139: the owner''s account was not found, so Admin keeps admin.manage_roles.';

IF NOT EXISTS (SELECT 1 FROM dbo.schema_versions WHERE version = 139)
    INSERT dbo.schema_versions(version, name)
    VALUES (139, N'Access admin');

COMMIT TRANSACTION;
GO
