-- User-authorized UAT setup only: preserve Admin, grant explicit Management,
-- and assign PJ-2608-0001. Does not sign, upload specimens or grant stamp use.
SET XACT_ABORT ON;
SET NOCOUNT ON;
SET ANSI_NULLS ON;
SET QUOTED_IDENTIFIER ON;
IF DB_NAME() <> N'IoTTeamCenter_CodexTest_20260830_04'
 THROW 51261,'This setup is restricted to the explicitly approved Team Test database.',1;
IF NOT EXISTS(SELECT 1 FROM dbo.schema_versions WHERE version=23)
 THROW 51262,'Apply migration 023 before provisioning.',1;
BEGIN TRANSACTION;
DECLARE @manager bigint, @leader bigint, @project bigint, @role bigint, @before nvarchar(max);
SELECT @manager=u.id FROM dbo.users u JOIN dbo.roles r ON r.id=u.role_id
JOIN dbo.employees e ON e.user_id=u.id
WHERE u.email=N'nattapol.p@tomastc.com' AND r.code=N'Admin'
 AND u.is_active=1 AND u.deleted_at IS NULL AND e.is_active=1;
SELECT @leader=u.id FROM dbo.users u JOIN dbo.employees e ON e.user_id=u.id
WHERE u.email=N'taweesak.s@tomastc.com' AND u.is_active=1 AND u.deleted_at IS NULL AND e.is_active=1;
SELECT @role=id FROM dbo.roles WHERE code=N'Management' AND is_active=1;
SELECT @project=id FROM dbo.projects WITH(UPDLOCK,HOLDLOCK)
WHERE project_no=N'PJ-2608-0001' AND deleted_at IS NULL AND status<>N'Closed';
IF @manager IS NULL OR @leader IS NULL OR @role IS NULL OR @project IS NULL OR @manager=@leader
 THROW 51263,'Expected active Employee Master identities and project were not found.',1;
IF NOT EXISTS(SELECT 1 FROM dbo.user_signing_permissions WHERE user_id=@leader AND code=N'signing.sign')
 THROW 51264,'Selected Leader lacks signing permission.',1;
IF EXISTS(SELECT 1 FROM dbo.signable_documents WHERE project_id=@project)
 THROW 51265,'Project already has signing documents; review assignment impact before changing.',1;
IF NOT EXISTS(SELECT 1 FROM dbo.user_business_roles WHERE user_id=@manager AND role_id=@role AND revoked_at IS NULL)
BEGIN
 SET @before=(SELECT r.code AS primaryRole,b.revoked_at AS managementRevokedAt
  FROM dbo.users u JOIN dbo.roles r ON r.id=u.role_id LEFT JOIN dbo.user_business_roles b ON b.user_id=u.id AND b.role_id=@role
  WHERE u.id=@manager FOR JSON PATH,WITHOUT_ARRAY_WRAPPER);
 IF EXISTS(SELECT 1 FROM dbo.user_business_roles WHERE user_id=@manager AND role_id=@role)
  UPDATE dbo.user_business_roles SET revoked_at=NULL,granted_by=@manager,granted_at=SYSUTCDATETIME(),
   reason=N'Explicit user authorization in Codex: retain Admin and add Management for named Drawing approval.' WHERE user_id=@manager AND role_id=@role;
 ELSE
  INSERT dbo.user_business_roles(user_id,role_id,granted_by,reason)
  VALUES(@manager,@role,@manager,N'Explicit user authorization in Codex: retain Admin and add Management for named Drawing approval.');
 INSERT dbo.audit_log(actor_id,entity_type,entity_id,entity_no,action,before_json,after_json)
 VALUES(@manager,N'User',@manager,N'nattapol.p',N'GrantBusinessRole',@before,
  N'{"primaryRole":"Admin","additionalRole":"Management","performedBy":"Codex UAT provisioning on explicit user request","stampAuthorityGranted":false}');
END;
IF EXISTS(SELECT 1 FROM dbo.projects WHERE id=@project AND (manager_id<>@manager OR lead_engineer_id<>@leader OR manager_id IS NULL OR lead_engineer_id IS NULL))
BEGIN
 SET @before=(SELECT manager_id AS managerId,lead_engineer_id AS leaderId FROM dbo.projects WHERE id=@project FOR JSON PATH,WITHOUT_ARRAY_WRAPPER);
 UPDATE dbo.projects SET manager_id=@manager,lead_engineer_id=@leader,updated_by=@manager,updated_at=SYSUTCDATETIME() WHERE id=@project;
 DECLARE @after nvarchar(max)=(SELECT @manager AS managerId,@leader AS leaderId,N'Codex UAT provisioning: Nattapol selected Manager, Taweesak selected Leader by user' AS reason FOR JSON PATH,WITHOUT_ARRAY_WRAPPER);
 INSERT dbo.audit_log(actor_id,entity_type,entity_id,entity_no,action,before_json,after_json)
 VALUES(@manager,N'Project',@project,N'PJ-2608-0001',N'AssignDrawingApprovers',@before,@after);
END;
COMMIT;
SELECT u.email,r.code primary_role,N'Management' additional_role FROM dbo.users u JOIN dbo.roles r ON r.id=u.role_id WHERE u.id=@manager;
SELECT project_no,manager_id,lead_engineer_id FROM dbo.projects WHERE id=@project;
