-- Explicit user choice: Phatthadon is Member for the Drawing trial.
SET XACT_ABORT ON;
SET NOCOUNT ON;
IF DB_NAME()<>N'IoTTeamCenter_CodexTest_20260830_04' THROW 51266,'UAT database only.',1;
BEGIN TRANSACTION;
DECLARE @project bigint=(SELECT id FROM dbo.projects WHERE project_no=N'PJ-2608-0001' AND deleted_at IS NULL),
 @member bigint=(SELECT u.id FROM dbo.users u JOIN dbo.employees e ON e.user_id=u.id WHERE u.email=N'phatthadon.i@tomastc.com' AND u.is_active=1 AND e.is_active=1 AND u.deleted_at IS NULL),
 @manager bigint=(SELECT id FROM dbo.users WHERE email=N'nattapol.p@tomastc.com' AND is_active=1 AND deleted_at IS NULL);
IF @project IS NULL OR @member IS NULL OR @manager IS NULL THROW 51267,'Expected project or Employee Master identity missing.',1;
IF NOT EXISTS(SELECT 1 FROM dbo.projects WHERE id=@project AND manager_id=@manager AND lead_engineer_id<>@member AND manager_id<>@member) THROW 51268,'Review project approvers.',1;
IF NOT EXISTS(SELECT 1 FROM dbo.project_members WITH(UPDLOCK,HOLDLOCK) WHERE project_id=@project AND user_id=@member)
BEGIN
 INSERT dbo.project_members(project_id,user_id,role_on_project,created_by) VALUES(@project,@member,N'Member',@manager);
 DECLARE @after nvarchar(max)=(SELECT @member AS userId,N'Member' AS role,N'Explicit user choice: Phatthadon; Codex UAT Drawing preparation' AS reason FOR JSON PATH,WITHOUT_ARRAY_WRAPPER);
 INSERT dbo.audit_log(actor_id,entity_type,entity_id,entity_no,action,after_json) VALUES(@manager,N'Project',@project,N'PJ-2608-0001',N'AddDrawingMember',@after);
END;
COMMIT;
SELECT @project projectId,@member memberId;
