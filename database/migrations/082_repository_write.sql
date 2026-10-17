-- Migration 082: repository.write.
--
-- Creating a TMTHub repository and changing its files used to need project.write, which also lets a
-- person edit the project register. Engineers write the code, so they get their own permission:
-- every role that already held project.write keeps the repositories, and Engineer and Leader join.

SET XACT_ABORT ON;
SET NOCOUNT ON;
GO

IF NOT EXISTS (SELECT 1 FROM dbo.schema_versions WHERE version = 81)
    THROW 51820, 'Migration 081 must be applied before migration 082.', 1;
GO

BEGIN TRANSACTION;

INSERT dbo.permissions(code, description)
SELECT N'repository.write', N'Create project source repositories and upload, edit or delete their files'
WHERE NOT EXISTS (SELECT 1 FROM dbo.permissions WHERE code = N'repository.write');

INSERT dbo.role_permissions(role_id, permission_id)
SELECT r.id, p.id
FROM dbo.roles r
CROSS JOIN dbo.permissions p
WHERE p.code = N'repository.write'
  AND (
       r.code IN (N'Admin', N'Engineer', N'Leader')
    OR EXISTS (SELECT 1 FROM dbo.role_permissions held
               INNER JOIN dbo.permissions pw ON pw.id = held.permission_id
               WHERE held.role_id = r.id AND pw.code = N'project.write'))
  AND NOT EXISTS (SELECT 1 FROM dbo.role_permissions rp WHERE rp.role_id = r.id AND rp.permission_id = p.id);

COMMIT TRANSACTION;
GO

IF NOT EXISTS (SELECT 1 FROM dbo.schema_versions WHERE version = 82)
    INSERT dbo.schema_versions(version, name)
    VALUES (82, N'Repository write permission');
GO
