-- Migration 135: the Leader role (owner 2026-11-25).
--
-- Migrations 053, 072, 075, 076, 077, 082, 095 and 133 grant permissions to a role N'Leader', and the project cost overview
-- and the Punchlist requirement approvers count a Leader, but no migration ever created the role, so those grants matched
-- nothing and nobody could be made a Leader. This creates it.
--
-- A Leader is an engineer who leads a team's work. The role holds every permission the Engineer role holds today, plus
-- what those migrations meant for a Leader:
--   team CRM (053)        crm.read, crm.write, crm.activity.write, crm.contact.write, crm.read.team, crm.convert
--   Site Monitor (072, 076, 133)  monitor.read, monitor.control, monitor.manage, monitor.deploy, monitor.approve, monitor.script
--   installed base (075)  asset.read, asset.manage
--   site credentials (077) credential.read, credential.reveal, credential.manage
--   repositories (082)    repository.write
--   inquiries (095)       inquiry.write
-- In the app a Leader also sees the project cost overview and approves Punchlist requirements, as a manager does, and
-- counts as an engineer wherever one is chosen (estimate owner, lead engineer, site visit engineer, KPI).
--
-- An Admin makes someone a Leader in User Accounts & Permissions, as the primary role or as an additional one.
-- A later migration that grants the Engineer role a permission names N'Leader' too.
--
-- To undo: database/rollback/135_leader_role.rollback.sql

SET XACT_ABORT ON;
SET NOCOUNT ON;
SET ANSI_NULLS ON;
SET QUOTED_IDENTIFIER ON;
GO

IF EXISTS (SELECT 1 FROM dbo.schema_versions WHERE version = 135 AND name <> N'Leader role')
    THROW 51351, 'Schema version 135 is already used by another migration.', 1;
IF NOT EXISTS (SELECT 1 FROM dbo.schema_versions WHERE version = 134)
    THROW 51352, 'Migration 134 must be applied before migration 135.', 1;
GO

BEGIN TRANSACTION;

IF NOT EXISTS (SELECT 1 FROM dbo.roles WHERE code = N'Leader')
    INSERT dbo.roles(code, name, description)
    VALUES (N'Leader', N'Leader', N'Leads a team''s engineering work: an Engineer''s permissions plus team CRM, Site Monitor, installed base and site credentials');

INSERT dbo.role_permissions(role_id, permission_id)
SELECT leader.id, p.id
FROM dbo.roles leader
CROSS JOIN dbo.permissions p
WHERE leader.code = N'Leader'
  AND (
       EXISTS (SELECT 1 FROM dbo.role_permissions held
               INNER JOIN dbo.roles engineer ON engineer.id = held.role_id
               WHERE engineer.code = N'Engineer' AND held.permission_id = p.id)
    OR p.code IN (
         N'crm.read', N'crm.write', N'crm.activity.write', N'crm.contact.write', N'crm.read.team', N'crm.convert',
         N'monitor.read', N'monitor.control', N'monitor.manage', N'monitor.deploy', N'monitor.approve', N'monitor.script',
         N'asset.read', N'asset.manage',
         N'credential.read', N'credential.reveal', N'credential.manage',
         N'repository.write',
         N'inquiry.write'))
  AND NOT EXISTS (SELECT 1 FROM dbo.role_permissions rp WHERE rp.role_id = leader.id AND rp.permission_id = p.id);

IF NOT EXISTS (SELECT 1 FROM dbo.schema_versions WHERE version = 135)
    INSERT dbo.schema_versions(version, name)
    VALUES (135, N'Leader role');

COMMIT TRANSACTION;
GO
