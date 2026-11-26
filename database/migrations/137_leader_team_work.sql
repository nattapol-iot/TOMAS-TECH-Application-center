-- Migration 137: a Leader leads the work of their team (owner 2026-11-26).
--
-- The owner widened the Leader role (migration 135): a Leader plans projects, assesses the KPI of their team members
-- and reviews reports. This grants the permissions that need:
--   schedule.plan       plan, answer day requests and set baselines - the API allows it on the projects of the team the
--                       Leader leads (leader-scope.ts), as a Project Manager's on their own projects
--   performance.manage  assess the KPI of the team's Engineers (performance-framework.ts)
--   report.review       review reports; the API lets a Leader review those of the team's projects
-- and rewrites the role's description, which the User Accounts & Permissions screen shows when a role is picked.
--
-- To undo: database/rollback/137_leader_team_work.rollback.sql

SET XACT_ABORT ON;
SET NOCOUNT ON;
SET ANSI_NULLS ON;
SET QUOTED_IDENTIFIER ON;
GO

IF EXISTS (SELECT 1 FROM dbo.schema_versions WHERE version = 137 AND name <> N'Leader team work')
    THROW 51371, 'Schema version 137 is already used by another migration.', 1;
IF NOT EXISTS (SELECT 1 FROM dbo.schema_versions WHERE version = 136)
    THROW 51372, 'Migration 136 must be applied before migration 137.', 1;
GO

BEGIN TRANSACTION;

INSERT dbo.role_permissions(role_id, permission_id)
SELECT r.id, p.id
FROM dbo.roles r
CROSS JOIN dbo.permissions p
WHERE r.code = N'Leader'
  AND p.code IN (N'schedule.plan', N'performance.manage', N'report.review')
  AND NOT EXISTS (SELECT 1 FROM dbo.role_permissions rp WHERE rp.role_id = r.id AND rp.permission_id = p.id);

UPDATE dbo.roles
SET description = N'Leads a team''s work: plans the team''s projects, assesses the KPI of its Engineers and reviews reports, on top of an Engineer''s permissions, team CRM and Site Monitor'
WHERE code = N'Leader';

IF NOT EXISTS (SELECT 1 FROM dbo.schema_versions WHERE version = 137)
    INSERT dbo.schema_versions(version, name)
    VALUES (137, N'Leader team work');

COMMIT TRANSACTION;
GO
