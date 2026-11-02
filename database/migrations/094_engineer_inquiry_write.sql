-- Migration 094: inquiry.write for the Engineer role.
--
-- Attaching a file to an Inquiry needs inquiry.write, which Engineer never held, so most of the
-- team saw no Upload button and the API answered 403. The owner chose (2026-11-02) to give
-- Engineer the whole permission: receive an RFQ, attach files, assign the estimate owner,
-- record meetings and update the qualification.

SET XACT_ABORT ON;
SET NOCOUNT ON;
GO

IF NOT EXISTS (SELECT 1 FROM dbo.schema_versions WHERE version = 93)
    THROW 51940, 'Migration 093 must be applied before migration 094.', 1;
GO

BEGIN TRANSACTION;

INSERT dbo.role_permissions(role_id, permission_id)
SELECT r.id, p.id
FROM dbo.roles r
CROSS JOIN dbo.permissions p
WHERE r.code = N'Engineer'
  AND p.code = N'inquiry.write'
  AND NOT EXISTS (SELECT 1 FROM dbo.role_permissions rp WHERE rp.role_id = r.id AND rp.permission_id = p.id);

COMMIT TRANSACTION;
GO

IF NOT EXISTS (SELECT 1 FROM dbo.schema_versions WHERE version = 94)
    INSERT dbo.schema_versions(version, name)
    VALUES (94, N'Engineer inquiry write');
GO
