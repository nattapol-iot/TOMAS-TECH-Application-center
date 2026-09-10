SET XACT_ABORT ON;
SET ANSI_NULLS ON;
SET QUOTED_IDENTIFIER ON;
GO

IF EXISTS (
    SELECT 1 FROM dbo.schema_versions
    WHERE version = 37
      AND name = N'Admin-managed primary user roles with audited least-privilege writes'
)
    THROW 51411, 'Legacy role-management migration identity detected at version 037; inspect and reconcile this database before continuing.', 1;

IF EXISTS (
    SELECT 1 FROM dbo.schema_versions
    WHERE version = 41
      AND name <> N'Admin-managed primary user roles with audited least-privilege writes'
)
    THROW 51412, 'Schema version 041 is already used by another migration.', 1;

IF EXISTS (SELECT 1 FROM dbo.schema_versions WHERE version = 41)
    RETURN;

IF NOT EXISTS (
    SELECT 1 FROM dbo.schema_versions
    WHERE version = 40
      AND name = N'Immutable overhead policies and estimate revision snapshots'
)
    THROW 51413, 'Apply migration 040 before migration 041.', 1;

BEGIN TRANSACTION;

IF NOT EXISTS (SELECT 1 FROM dbo.permissions WHERE code = N'admin.manage_roles')
BEGIN
    INSERT INTO dbo.permissions(code, description)
    VALUES (N'admin.manage_roles', N'Change the primary application role of an active user account');
END;

DELETE role_permission
FROM dbo.role_permissions role_permission
INNER JOIN dbo.permissions permission ON permission.id = role_permission.permission_id
INNER JOIN dbo.roles role ON role.id = role_permission.role_id
WHERE permission.code = N'admin.manage_roles' AND role.code <> N'Admin';

INSERT INTO dbo.role_permissions(role_id, permission_id)
SELECT role.id, permission.id
FROM dbo.roles role
CROSS JOIN dbo.permissions permission
WHERE role.code = N'Admin'
  AND permission.code = N'admin.manage_roles'
  AND NOT EXISTS (
      SELECT 1 FROM dbo.role_permissions existing
      WHERE existing.role_id = role.id AND existing.permission_id = permission.id
  );

IF DATABASE_PRINCIPAL_ID(N'iot_team_app_role') IS NOT NULL
BEGIN
    GRANT UPDATE (role_id, updated_at) ON OBJECT::dbo.users TO [iot_team_app_role];
END;

INSERT INTO dbo.schema_versions(version, name)
VALUES (41, N'Admin-managed primary user roles with audited least-privilege writes');

COMMIT TRANSACTION;
GO
