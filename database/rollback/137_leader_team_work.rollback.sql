-- Undo of migration 137: a Leader's planning, KPI and report-review permissions.
--
-- Run by hand, on a database at schema version 137, together with a release of the API from before migration 137.
-- Plans, assessments and reviews a Leader recorded stay; the role only stops reaching that work.

SET XACT_ABORT ON;
SET NOCOUNT ON;
SET ANSI_NULLS ON;
SET QUOTED_IDENTIFIER ON;
GO

IF EXISTS (SELECT 1 FROM dbo.schema_versions WHERE version > 137)
    THROW 51937, 'Roll back the migrations after 137 first.', 1;
GO

BEGIN TRANSACTION;
DELETE rp
FROM dbo.role_permissions rp
INNER JOIN dbo.roles r ON r.id = rp.role_id
INNER JOIN dbo.permissions p ON p.id = rp.permission_id
WHERE r.code = N'Leader' AND p.code IN (N'schedule.plan', N'performance.manage', N'report.review');
UPDATE dbo.roles
SET description = N'Leads a team''s engineering work: an Engineer''s permissions plus team CRM, Site Monitor, installed base and site credentials'
WHERE code = N'Leader';
DELETE FROM dbo.schema_versions WHERE version = 137;
COMMIT TRANSACTION;
GO
