SET XACT_ABORT ON;
SET ANSI_NULLS ON;
SET QUOTED_IDENTIFIER ON;
GO
IF EXISTS(SELECT 1 FROM dbo.schema_versions WHERE version=23) RETURN;
IF NOT EXISTS(SELECT 1 FROM dbo.schema_versions WHERE version=22) THROW 51260,'Apply migration 022 first.',1;
BEGIN TRANSACTION;
CREATE TABLE dbo.user_business_roles (
 user_id bigint NOT NULL REFERENCES dbo.users(id),
 role_id bigint NOT NULL REFERENCES dbo.roles(id),
 granted_by bigint NOT NULL REFERENCES dbo.users(id),
 granted_at datetimeoffset(0) NOT NULL DEFAULT SYSUTCDATETIME(),
 reason nvarchar(1000) NOT NULL,
 revoked_at datetimeoffset(0) NULL,
 CONSTRAINT PK_user_business_roles PRIMARY KEY(user_id,role_id)
);
-- Additional business roles contribute signing capabilities only. Never confer
-- system administration, broad project access or stamp authority through this table.
INSERT dbo.role_permissions(role_id,permission_id)
SELECT r.id,p.id FROM dbo.roles r CROSS JOIN dbo.permissions p
WHERE r.code=N'Management' AND p.code IN(N'signing.read',N'signing.sign')
AND NOT EXISTS(SELECT 1 FROM dbo.role_permissions existing WHERE existing.role_id=r.id AND existing.permission_id=p.id);
EXEC(N'CREATE VIEW dbo.user_signing_permissions AS
 SELECT u.id user_id,p.code FROM dbo.users u JOIN dbo.roles r ON r.id=u.role_id AND r.is_active=1
 JOIN dbo.role_permissions rp ON rp.role_id=r.id JOIN dbo.permissions p ON p.id=rp.permission_id
 WHERE u.is_active=1 AND u.deleted_at IS NULL AND p.code LIKE N''signing.%''
 UNION
 SELECT u.id,p.code FROM dbo.users u JOIN dbo.user_business_roles b ON b.user_id=u.id AND b.revoked_at IS NULL
 JOIN dbo.roles r ON r.id=b.role_id AND r.is_active=1
 JOIN dbo.role_permissions rp ON rp.role_id=r.id JOIN dbo.permissions p ON p.id=rp.permission_id
 WHERE u.is_active=1 AND u.deleted_at IS NULL AND p.code IN(N''signing.read'',N''signing.sign'');');
IF DATABASE_PRINCIPAL_ID(N'iot_team_app_role') IS NOT NULL
BEGIN
 GRANT SELECT ON dbo.user_business_roles TO iot_team_app_role;
 GRANT SELECT ON dbo.user_signing_permissions TO iot_team_app_role;
END;
INSERT dbo.schema_versions(version,name) VALUES(23,N'Explicit additional Management role for named signing');
COMMIT;
