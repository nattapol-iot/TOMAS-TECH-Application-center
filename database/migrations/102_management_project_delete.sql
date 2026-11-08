-- Migration 102: Management deletes projects.
--
-- Management (and Admin) may delete any project. One without recorded work is removed as before by
-- dbo.delete_unstarted_project; one with work is hidden by dbo.soft_delete_project (deleted_at only), so its
-- rows stay in the database and can be restored. Owner decision 2026-11-09.
SET XACT_ABORT ON;
SET NOCOUNT ON;
BEGIN TRANSACTION;

EXEC(N'CREATE OR ALTER PROCEDURE dbo.delete_unstarted_project
 @id bigint, @actor bigint, @execute bit = 0
WITH EXECUTE AS OWNER
AS
BEGIN
 SET NOCOUNT ON;
 SET XACT_ABORT ON;
 IF @@TRANCOUNT=0 THROW 51640,''Project deletion requires a caller transaction.'',1;
 DECLARE @manager bigint;
 SELECT @manager=manager_id FROM dbo.projects WITH(UPDLOCK,HOLDLOCK) WHERE id=@id;
 IF @manager IS NULL THROW 51641,''Project not found.'',1;
 IF @manager<>@actor AND NOT EXISTS(SELECT 1 FROM dbo.user_effective_roles WHERE user_id=@actor AND code IN(N''Engineering Manager'',N''Management'',N''Admin''))
  THROW 51642,''Only this project''''s manager, an Engineering Manager, Management or an Admin can delete it.'',1;

 -- Work that makes a project real. Each is reported by name so the caller can say why.
 DECLARE @blockers TABLE(source nvarchar(60) NOT NULL PRIMARY KEY, row_count int NOT NULL);
 INSERT @blockers(source,row_count)
 SELECT source,row_count FROM (VALUES
  (N''BOM'',(SELECT COUNT(*) FROM dbo.boms WITH(UPDLOCK,HOLDLOCK) WHERE project_id=@id)),
  (N''Purchase requisition'',(SELECT COUNT(*) FROM dbo.mat_prs WITH(UPDLOCK,HOLDLOCK) WHERE project_id=@id)),
  (N''Purchase order'',(SELECT COUNT(*) FROM dbo.mat_pos WITH(UPDLOCK,HOLDLOCK) WHERE project_id=@id)),
  (N''Goods receipt'',(SELECT COUNT(*) FROM dbo.grn_lines WITH(UPDLOCK,HOLDLOCK) WHERE project_allocation_id=@id)),
  (N''Material issue'',(SELECT COUNT(*) FROM dbo.mirs WITH(UPDLOCK,HOLDLOCK) WHERE project_id=@id)),
  (N''Stock reservation'',(SELECT COUNT(*) FROM dbo.reservations WITH(UPDLOCK,HOLDLOCK) WHERE project_id=@id)),
  (N''Stock movement'',(SELECT COUNT(*) FROM dbo.stock_txns WITH(UPDLOCK,HOLDLOCK) WHERE project_id=@id)),
  (N''Material audit'',(SELECT COUNT(*) FROM dbo.mat_audit WHERE project_id=@id)),
  (N''Report'',(SELECT COUNT(*) FROM dbo.unified_reports WITH(UPDLOCK,HOLDLOCK) WHERE project_id=@id)),
  (N''Signing document'',(SELECT COUNT(*) FROM dbo.signable_documents WITH(UPDLOCK,HOLDLOCK) WHERE project_id=@id)),
  (N''Resource task'',(SELECT COUNT(*) FROM dbo.resource_tasks WITH(UPDLOCK,HOLDLOCK) WHERE project_id=@id)),
  (N''Historical PR import'',(SELECT COUNT(*) FROM dbo.historical_pr_imports WITH(UPDLOCK,HOLDLOCK) WHERE project_id=@id)),
  (N''Knowledge sharing'',(SELECT COUNT(*) FROM dbo.knowledge_document_permissions WITH(UPDLOCK,HOLDLOCK) WHERE subject_project_id=@id)),
  (N''Team activity'',(SELECT COUNT(*) FROM dbo.activity_events WHERE project_id=@id)
     +(SELECT COUNT(*) FROM dbo.activity_rules WITH(UPDLOCK,HOLDLOCK) WHERE project_id=@id)),
  -- Files copied in when the project was created say so in their remark; anything else was uploaded to it.
  (N''Uploaded document'',(SELECT COUNT(*) FROM dbo.project_docs WITH(UPDLOCK,HOLDLOCK) WHERE project_id=@id
     AND (remark IS NULL OR remark NOT LIKE N''%when project was created.''))),
  (N''Schedule progress'',(SELECT COUNT(*) FROM dbo.schedule_tasks WITH(UPDLOCK,HOLDLOCK) WHERE project_id=@id AND deleted_at IS NULL
     AND (status<>N''Not Started'' OR percent_done>0 OR actual_start IS NOT NULL OR actual_end IS NOT NULL OR actual_man_days>0))
     +(SELECT COUNT(*) FROM dbo.schedule_updates WITH(UPDLOCK,HOLDLOCK) WHERE project_id=@id AND field NOT IN(N''created'',N''plan'',N''deleted'')))
 ) v(source,row_count) WHERE row_count>0;
 SELECT source,row_count FROM @blockers ORDER BY source;
 -- A preview (@execute=0) and a refused deletion both stop here, having changed nothing.
 IF @execute=0 OR EXISTS(SELECT 1 FROM @blockers) RETURN;

 -- The caller removes these stored files once the deletion has committed.
 SELECT storage_key FROM dbo.project_docs WHERE project_id=@id ORDER BY id;

 -- schedule_updates is append-only; its trigger admits deletes only for rows listed here.
 CREATE TABLE #trial_delete_scope(object_id int NOT NULL,key_hash varbinary(32) NOT NULL,row_version varbinary(8) NULL,PRIMARY KEY(object_id,key_hash));
 INSERT #trial_delete_scope(object_id,key_hash)
 SELECT OBJECT_ID(N''dbo.schedule_updates''),HASHBYTES(''SHA2_256'',(SELECT x.id AS id FOR JSON PATH,INCLUDE_NULL_VALUES,WITHOUT_ARRAY_WRAPPER))
 FROM dbo.schedule_updates x WHERE x.project_id=@id;

 -- Upstream records that only point at the project keep their history and lose the link.
 UPDATE dbo.crm_activities SET project_id=NULL WHERE project_id=@id;
 UPDATE dbo.sales_intakes SET related_project_id=NULL WHERE related_project_id=@id;
 DELETE FROM dbo.site_visit_links WHERE target_type=N''Project'' AND target_id=@id;
 DELETE FROM dbo.notifications WHERE entity_type=N''Project'' AND entity_id=@id;

 DELETE FROM dbo.schedule_updates WHERE project_id=@id;
 DELETE pic FROM dbo.schedule_task_pics pic JOIN dbo.schedule_tasks t ON t.id=pic.task_id WHERE t.project_id=@id;
 DELETE FROM dbo.schedule_baselines WHERE project_id=@id;
 -- One statement removes the whole parent/predecessor tree at once.
 DELETE FROM dbo.schedule_tasks WHERE project_id=@id;
 DELETE FROM dbo.project_docs WHERE project_id=@id;
 DELETE FROM dbo.project_folders WHERE project_id=@id;
 DELETE FROM dbo.project_members WHERE project_id=@id;
 DELETE FROM dbo.projects WHERE id=@id;
END;');

IF DATABASE_PRINCIPAL_ID(N'iot_team_app_role') IS NOT NULL
    GRANT EXECUTE ON OBJECT::dbo.delete_unstarted_project TO [iot_team_app_role];


-- The application role has column-level UPDATE grants, excluding deleted_at.
EXEC(N'CREATE OR ALTER PROCEDURE dbo.soft_delete_project
 @id bigint, @actor bigint
WITH EXECUTE AS OWNER
AS
BEGIN
 SET NOCOUNT ON;
 SET XACT_ABORT ON;
 IF @@TRANCOUNT=0 THROW 51640,''Project deletion requires a caller transaction.'',1;
 IF NOT EXISTS(SELECT 1 FROM dbo.user_effective_roles WHERE user_id=@actor AND code IN(N''Management'',N''Admin''))
  THROW 51642,''Only Management or Admin can hide a project with recorded work.'',1;
 UPDATE dbo.projects SET deleted_at=SYSUTCDATETIME(),updated_by=@actor,updated_at=SYSUTCDATETIME()
 WHERE id=@id AND deleted_at IS NULL;
 IF @@ROWCOUNT=0 THROW 51641,''Project not found.'',1;
END;');

IF DATABASE_PRINCIPAL_ID(N'iot_team_app_role') IS NOT NULL
    GRANT EXECUTE ON OBJECT::dbo.soft_delete_project TO [iot_team_app_role];

COMMIT TRANSACTION;
GO

IF NOT EXISTS (SELECT 1 FROM dbo.schema_versions WHERE version = 102)
    INSERT dbo.schema_versions(version, name)
    VALUES (102, N'Management project deletion with recoverable recorded work');
GO
