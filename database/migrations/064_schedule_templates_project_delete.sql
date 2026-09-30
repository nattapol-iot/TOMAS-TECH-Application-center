-- Migration 064: reusable master schedules, and deleting a project created by mistake
--
-- 1. dbo.schedule_templates holds named Master Plans anyone can keep and reuse when a
--    project is created. A row may carry a start offset and a duration (days counted
--    from the project start); a row without them copies only its name.
--
-- 2. dbo.delete_unstarted_project removes a project that has not started: nothing has
--    been bought, received, issued, reported, signed, shared or worked against it. It
--    exists so a wrong or trial project can be created again from the same estimate
--    and with the same ERP number. Any recorded work refuses the deletion and the caller
--    is told which work it was. The application role cannot delete these tables
--    directly; the procedure runs as owner, checks the caller itself, and deletes only
--    the rows of the one project it was given.
--
-- 3. The application role gets the grants 062 left out for dbo.record_presence.
--
-- Batches are GO-separated and each transaction opens and closes within one batch; the
-- version is recorded last so a partial failure is retried.

-- ── Batch 1: master schedules and missing grants ────────────────────────────
SET XACT_ABORT ON;
SET NOCOUNT ON;
BEGIN TRANSACTION;

IF OBJECT_ID(N'dbo.schedule_templates', N'U') IS NULL
    CREATE TABLE dbo.schedule_templates (
        id          bigint IDENTITY(1,1) NOT NULL CONSTRAINT PK_schedule_templates PRIMARY KEY,
        name        nvarchar(200)     NOT NULL,
        -- NULL only for the template this migration seeds.
        created_by  bigint            NULL CONSTRAINT FK_schedule_templates_created_by REFERENCES dbo.users(id),
        updated_by  bigint            NULL CONSTRAINT FK_schedule_templates_updated_by REFERENCES dbo.users(id),
        created_at  datetimeoffset(0) NOT NULL CONSTRAINT DF_schedule_templates_created_at DEFAULT SYSUTCDATETIME(),
        updated_at  datetimeoffset(0) NOT NULL CONSTRAINT DF_schedule_templates_updated_at DEFAULT SYSUTCDATETIME(),
        row_version rowversion        NOT NULL,
        CONSTRAINT UQ_schedule_templates_name UNIQUE (name)
    );

IF OBJECT_ID(N'dbo.schedule_template_rows', N'U') IS NULL
    CREATE TABLE dbo.schedule_template_rows (
        template_id       bigint        NOT NULL,
        sort_order        int           NOT NULL,
        name              nvarchar(500) NOT NULL,
        start_offset_days int           NULL,
        duration_days     int           NULL,
        CONSTRAINT PK_schedule_template_rows PRIMARY KEY (template_id, sort_order),
        CONSTRAINT FK_schedule_template_rows_template FOREIGN KEY (template_id)
            REFERENCES dbo.schedule_templates(id) ON DELETE CASCADE,
        CONSTRAINT CK_schedule_template_rows_sort CHECK (sort_order BETWEEN 1 AND 50),
        CONSTRAINT CK_schedule_template_rows_period CHECK (
            (start_offset_days IS NULL AND duration_days IS NULL)
            OR (start_offset_days BETWEEN 0 AND 3650 AND duration_days BETWEEN 1 AND 3650))
    );

IF NOT EXISTS (SELECT 1 FROM dbo.schedule_templates)
BEGIN
    INSERT dbo.schedule_templates(name) VALUES (N'Standard project');
    DECLARE @standard bigint = SCOPE_IDENTITY();
    INSERT dbo.schedule_template_rows(template_id, sort_order, name)
    VALUES (@standard, 1, N'Kick-off meeting'), (@standard, 2, N'Get Requirement & Confirm'),
           (@standard, 3, N'Development'), (@standard, 4, N'Internal Final Test'),
           (@standard, 5, N'Installation'), (@standard, 6, N'Teaching for UT'),
           (@standard, 7, N'User Testing & Trial'), (@standard, 8, N'Go Live');
END;

IF DATABASE_PRINCIPAL_ID(N'iot_team_app_role') IS NOT NULL
BEGIN
    GRANT SELECT, INSERT, UPDATE, DELETE ON OBJECT::dbo.schedule_templates TO [iot_team_app_role];
    GRANT SELECT, INSERT, UPDATE, DELETE ON OBJECT::dbo.schedule_template_rows TO [iot_team_app_role];
    GRANT SELECT, INSERT, UPDATE, DELETE ON OBJECT::dbo.record_presence TO [iot_team_app_role];
END;

COMMIT TRANSACTION;
GO

-- ── Batch 2: delete a project that has not started ──────────────────────────
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
 IF @manager<>@actor AND NOT EXISTS(SELECT 1 FROM dbo.user_effective_roles WHERE user_id=@actor AND code IN(N''Engineering Manager'',N''Admin''))
  THROW 51642,''Only this project''''s manager, an Engineering Manager or an Admin can delete it.'',1;

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

COMMIT TRANSACTION;
GO

-- ── Batch 3: record the version last ────────────────────────────────────────
IF NOT EXISTS (SELECT 1 FROM dbo.schema_versions WHERE version = 64)
    INSERT dbo.schema_versions(version, name)
    VALUES (64, N'Reusable master schedules and deleting a project that has not started');
