-- Undo of migration 136: the Sales Manager's CRM permissions.
--
-- Run by hand, on a database at schema version 136, together with a release of the API from before migration 136.
-- The deals, activities and contacts a Sales Manager recorded stay; the role only stops reaching the CRM.

SET XACT_ABORT ON;
SET NOCOUNT ON;
SET ANSI_NULLS ON;
SET QUOTED_IDENTIFIER ON;
GO

IF EXISTS (SELECT 1 FROM dbo.schema_versions WHERE version > 136)
    THROW 51936, 'Roll back the migrations after 136 first.', 1;
GO

BEGIN TRANSACTION;
DELETE rp
FROM dbo.role_permissions rp
INNER JOIN dbo.roles r ON r.id = rp.role_id
INNER JOIN dbo.permissions p ON p.id = rp.permission_id
WHERE r.code = N'Sales Manager'
  AND p.code IN (N'crm.read', N'crm.write', N'crm.activity.write', N'crm.contact.write', N'crm.commercial.read', N'crm.convert', N'crm.read.team');
DELETE FROM dbo.schema_versions WHERE version = 136;
COMMIT TRANSACTION;
GO
