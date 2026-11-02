-- Migration 095: inquiry.write for Project Manager, Engineering Manager and Leader.
--
-- Migration 094 gave Engineer inquiry.write so the team could attach files to an Inquiry; the
-- roles above Engineer still saw no Upload button. The owner asked (2026-11-02) for PM,
-- Engineering Manager and Leader to attach files too. They get the same whole permission as
-- Engineer: receive an RFQ, attach files, assign the estimate owner, record meetings and update
-- the qualification. Leader is created from Role management, not by a migration; where it does
-- not exist yet this grants nothing to it.

SET XACT_ABORT ON;
SET NOCOUNT ON;
GO

IF NOT EXISTS (SELECT 1 FROM dbo.schema_versions WHERE version = 94)
    THROW 51950, 'Migration 094 must be applied before migration 095.', 1;
GO

BEGIN TRANSACTION;

INSERT dbo.role_permissions(role_id, permission_id)
SELECT r.id, p.id
FROM dbo.roles r
CROSS JOIN dbo.permissions p
WHERE r.code IN (N'Project Manager', N'Engineering Manager', N'Leader')
  AND p.code = N'inquiry.write'
  AND NOT EXISTS (SELECT 1 FROM dbo.role_permissions rp WHERE rp.role_id = r.id AND rp.permission_id = p.id);

COMMIT TRANSACTION;
GO

IF NOT EXISTS (SELECT 1 FROM dbo.schema_versions WHERE version = 95)
    INSERT dbo.schema_versions(version, name)
    VALUES (95, N'Managers inquiry write');
GO
