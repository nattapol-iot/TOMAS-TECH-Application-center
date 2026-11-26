-- Migration 138: a Leader has a Project Manager's rights too (owner 2026-11-26).
--
-- The Leader role takes every permission the Project Manager role holds. On a fresh database those it lacked were
-- activity.manage, knowledge.review, knowledge.approve, procurement.approve and project.write. The API gives a Leader a
-- Project Manager's standing as well (project-scope.ts): a Leader sees every project, moves any project's stage, sets
-- man-hour budgets, may be a project's manager and opens the management dashboard. A Leader still reveals site
-- credentials (a Project Manager cannot) only on the projects they work on.
-- A later migration that grants Project Manager a permission grants Leader too (tests/role-audit-2026-11-25.test.mjs).
-- The role's description, which the User Accounts & Permissions screen shows when a role is picked, says so.
--
-- To undo: database/rollback/138_leader_project_manager.rollback.sql

SET XACT_ABORT ON;
SET NOCOUNT ON;
SET ANSI_NULLS ON;
SET QUOTED_IDENTIFIER ON;
GO

IF EXISTS (SELECT 1 FROM dbo.schema_versions WHERE version = 138 AND name <> N'Leader as Project Manager')
    THROW 51381, 'Schema version 138 is already used by another migration.', 1;
IF NOT EXISTS (SELECT 1 FROM dbo.schema_versions WHERE version = 137)
    THROW 51382, 'Migration 137 must be applied before migration 138.', 1;
GO

BEGIN TRANSACTION;

INSERT dbo.role_permissions(role_id, permission_id)
SELECT leader.id, held.permission_id
FROM dbo.roles leader
CROSS JOIN dbo.role_permissions held
INNER JOIN dbo.roles pm ON pm.id = held.role_id
WHERE leader.code = N'Leader'
  AND pm.code = N'Project Manager'
  AND NOT EXISTS (SELECT 1 FROM dbo.role_permissions rp WHERE rp.role_id = leader.id AND rp.permission_id = held.permission_id);

UPDATE dbo.roles
SET description = N'Leads a team''s work with a Project Manager''s rights: sees and runs every project as a Project Manager does, plans the team''s projects, assesses the KPI of its Engineers and reviews reports, on top of an Engineer''s permissions, team CRM and Site Monitor'
WHERE code = N'Leader';

IF NOT EXISTS (SELECT 1 FROM dbo.schema_versions WHERE version = 138)
    INSERT dbo.schema_versions(version, name)
    VALUES (138, N'Leader as Project Manager');

COMMIT TRANSACTION;
GO
