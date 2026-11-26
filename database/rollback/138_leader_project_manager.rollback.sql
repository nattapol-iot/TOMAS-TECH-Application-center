-- Undo of migration 138: a Leader's Project Manager permissions.
--
-- Run by hand, on a database at schema version 138, together with a release of the API from before migration 138.
-- Returns the Leader role to what migration 137 left: it drops the Leader grants that came from the Project Manager role,
-- that is the Project Manager's permissions that are neither an Engineer's nor named by migration 135 or 137.
-- Projects a Leader created or managed stay as they are.

SET XACT_ABORT ON;
SET NOCOUNT ON;
SET ANSI_NULLS ON;
SET QUOTED_IDENTIFIER ON;
GO

IF EXISTS (SELECT 1 FROM dbo.schema_versions WHERE version > 138)
    THROW 51938, 'Roll back the migrations after 138 first.', 1;
GO

BEGIN TRANSACTION;
DELETE rp
FROM dbo.role_permissions rp
INNER JOIN dbo.roles leader ON leader.id = rp.role_id
INNER JOIN dbo.permissions p ON p.id = rp.permission_id
WHERE leader.code = N'Leader'
  AND EXISTS (SELECT 1 FROM dbo.role_permissions held INNER JOIN dbo.roles pm ON pm.id = held.role_id
              WHERE pm.code = N'Project Manager' AND held.permission_id = rp.permission_id)
  AND NOT EXISTS (SELECT 1 FROM dbo.role_permissions held INNER JOIN dbo.roles engineer ON engineer.id = held.role_id
                  WHERE engineer.code = N'Engineer' AND held.permission_id = rp.permission_id)
  AND p.code NOT IN (
       -- migration 135
       N'crm.read', N'crm.write', N'crm.activity.write', N'crm.contact.write', N'crm.read.team', N'crm.convert',
       N'monitor.read', N'monitor.control', N'monitor.manage', N'monitor.deploy', N'monitor.approve', N'monitor.script',
       N'asset.read', N'asset.manage',
       N'credential.read', N'credential.reveal', N'credential.manage',
       N'repository.write',
       N'inquiry.write',
       -- migration 137
       N'schedule.plan', N'performance.manage', N'report.review');
UPDATE dbo.roles
SET description = N'Leads a team''s work: plans the team''s projects, assesses the KPI of its Engineers and reviews reports, on top of an Engineer''s permissions, team CRM and Site Monitor'
WHERE code = N'Leader';
DELETE FROM dbo.schema_versions WHERE version = 138;
COMMIT TRANSACTION;
GO
