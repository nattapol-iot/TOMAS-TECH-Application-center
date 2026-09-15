SET XACT_ABORT ON;
SET NOCOUNT ON;
GO
IF EXISTS(SELECT 1 FROM dbo.schema_versions WHERE version=51) RETURN;
IF NOT EXISTS(SELECT 1 FROM dbo.schema_versions WHERE version=50) THROW 51510,'Migration 050 required.',1;
BEGIN TRANSACTION;

-- Phase 1 decision: an additional role now carries its role's full permission set,
-- Admin included. Migration 023 created dbo.user_business_roles for signing only and
-- said so in a comment; that restriction is lifted here deliberately, not by accident.
-- The two views below are the single place the application resolves "who am I" from:
-- one primary role on dbo.users plus every additional role that has not been revoked.

EXEC(N'CREATE OR ALTER VIEW dbo.user_effective_roles AS
 SELECT u.id user_id, r.id role_id, r.code
 FROM dbo.users u
 JOIN dbo.roles r ON r.id=u.role_id AND r.is_active=1
 WHERE u.is_active=1 AND u.deleted_at IS NULL
 UNION
 SELECT u.id, r.id, r.code
 FROM dbo.users u
 JOIN dbo.user_business_roles b ON b.user_id=u.id AND b.revoked_at IS NULL
 JOIN dbo.roles r ON r.id=b.role_id AND r.is_active=1
 WHERE u.is_active=1 AND u.deleted_at IS NULL;');

EXEC(N'CREATE OR ALTER VIEW dbo.user_effective_permissions AS
 SELECT DISTINCT er.user_id, p.code
 FROM dbo.user_effective_roles er
 JOIN dbo.role_permissions rp ON rp.role_id=er.role_id
 JOIN dbo.permissions p ON p.id=rp.permission_id;');

IF DATABASE_PRINCIPAL_ID(N'iot_team_app_role') IS NOT NULL
BEGIN
 GRANT SELECT ON dbo.user_effective_roles TO iot_team_app_role;
 GRANT SELECT ON dbo.user_effective_permissions TO iot_team_app_role;
 -- Granting an additional role inserts a row; revoking stamps revoked_at and
 -- re-granting a revoked role clears it again. Nothing here may delete history.
 GRANT INSERT ON OBJECT::dbo.user_business_roles TO iot_team_app_role;
 GRANT UPDATE (granted_by, granted_at, reason, revoked_at) ON OBJECT::dbo.user_business_roles TO iot_team_app_role;
END;

INSERT dbo.schema_versions(version,name) VALUES(51,N'Additional application roles carry their full permission set');
COMMIT;
GO
