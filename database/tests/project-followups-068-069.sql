/*
  Behaviour fixture for migrations 068 and 069. DISPOSABLE DATABASES ONLY: it relaxes the foreign keys
  on dbo.projects so a project can exist without an inquiry and an estimate, and leaves rows behind.

    sqlcmd -S "(localdb)\<own instance>" -E -b -C -d <database> -i database/tests/project-followups-068-069.sql

  068: dbo.answer_schedule_day_request accepts an Engineering Manager or Admin granted as an additional
       role, and still refuses a Project Manager who does not manage the project.
  069: dbo.withdraw_project_document needs a caller transaction, the current row version, and the
       uploader, the project manager or an effective EM/Admin; it refuses a document signing uses, and it
       only sets deleted_at.
*/
SET NOCOUNT ON;
SET XACT_ABORT OFF;
SET ANSI_NULLS ON;
SET QUOTED_IDENTIFIER ON;
SET ANSI_PADDING ON;
SET ANSI_WARNINGS ON;
SET ARITHABORT ON;
SET CONCAT_NULL_YIELDS_NULL ON;
SET NUMERIC_ROUNDABORT OFF;

ALTER TABLE dbo.projects NOCHECK CONSTRAINT ALL;

DECLARE @engineer bigint = (SELECT id FROM dbo.roles WHERE code = N'Engineer');
DECLARE @pm_role bigint = (SELECT id FROM dbo.roles WHERE code = N'Project Manager');
DECLARE @em_role bigint = (SELECT id FROM dbo.roles WHERE code = N'Engineering Manager');
IF @engineer IS NULL OR @pm_role IS NULL OR @em_role IS NULL THROW 59000, 'Seeded roles are missing.', 1;

INSERT dbo.users(email, name, role_id) VALUES (N'pm@fixture.test', N'Project PM', @pm_role);
DECLARE @pm bigint = SCOPE_IDENTITY();
INSERT dbo.users(email, name, role_id) VALUES (N'other-pm@fixture.test', N'Other PM', @pm_role);
DECLARE @other_pm bigint = SCOPE_IDENTITY();
INSERT dbo.users(email, name, role_id) VALUES (N'extra-em@fixture.test', N'Engineer with EM role', @engineer);
DECLARE @extra_em bigint = SCOPE_IDENTITY();
INSERT dbo.users(email, name, role_id) VALUES (N'engineer@fixture.test', N'Engineer', @engineer);
DECLARE @eng bigint = SCOPE_IDENTITY();
INSERT dbo.user_business_roles(user_id, role_id, granted_by, reason) VALUES (@extra_em, @em_role, @pm, N'Fixture: additional EM role');

INSERT dbo.customers(code, name, created_by, updated_by) VALUES (N'FIX-068', N'Fixture customer', @pm, @pm);
DECLARE @customer bigint = SCOPE_IDENTITY();
INSERT dbo.projects(project_no, name, customer_id, project_type, status, manager_id, lead_engineer_id, inquiry_id, estimate_id,
  po_no, po_date, start_date, target_delivery, folder_path, created_by, updated_by)
VALUES (N'P-FIX-068', N'Fixture project', @customer, N'IoT', N'Installation', @pm, @eng, 0, 0,
  N'PO-FIX', '2026-10-01', '2026-10-01', '2026-12-31', N'fixture', @pm, @pm);
DECLARE @project bigint = SCOPE_IDENTITY();

INSERT dbo.schedule_tasks(project_id, parent_id, sort_order, kind, name, is_milestone, origin, created_by, visibility,
  plan_start, plan_days, start_mode, lag_days, pic_external, plan_man_days, updated_by)
VALUES (@project, NULL, 1, N'task', N'Wire panel A', 0, N'PM', @pm, N'Internal', '2026-10-05', 5, N'manual', 0, N'', 5, @pm);
DECLARE @task bigint = SCOPE_IDENTITY();

INSERT INTO dbo.schedule_updates(project_id, task_id, actor_id, field, from_value, to_value, comment, request_days)
VALUES (@project, @task, @eng, N'request', N'5', N'7', N'Parts late', 2);
DECLARE @request bigint = SCOPE_IDENTITY();

DECLARE @version binary(8), @error int;

-- 068: a Project Manager who does not manage this project is refused.
SELECT @version = row_version FROM dbo.schedule_tasks WHERE id = @task;
SET @error = 0;
BEGIN TRY
  EXEC dbo.answer_schedule_day_request @request_id = @request, @task_id = @task, @project_id = @project,
    @answer_by = @other_pm, @answer = N'Accepted', @answer_note = N'', @expected_row_version = @version;
END TRY BEGIN CATCH SET @error = ERROR_NUMBER(); IF XACT_STATE() <> 0 ROLLBACK; END CATCH;
IF @error <> 51125 THROW 59001, 'A non-managing Project Manager must be refused with 51125.', 1;
PRINT 'PASS 068 refuses a Project Manager who does not manage the project';

-- 068: an Engineering Manager granted as an additional role may answer.
SELECT @version = row_version FROM dbo.schedule_tasks WHERE id = @task;
EXEC dbo.answer_schedule_day_request @request_id = @request, @task_id = @task, @project_id = @project,
  @answer_by = @extra_em, @answer = N'Accepted', @answer_note = N'Fine', @expected_row_version = @version;
IF NOT EXISTS (SELECT 1 FROM dbo.schedule_updates WHERE id = @request AND answer = N'Accepted' AND answer_by = @extra_em)
  THROW 59002, 'The additional-role EM answer was not recorded.', 1;
IF (SELECT plan_days FROM dbo.schedule_tasks WHERE id = @task) <> 7
  THROW 59003, 'Accepting the request did not extend the task.', 1;
PRINT 'PASS 068 accepts an Engineering Manager held as an additional role and extends the task';

-- 069 fixtures: one free document and one that signing uses.
IF NOT EXISTS (SELECT 1 FROM dbo.project_folders WHERE project_id = @project AND folder_code = '02')
  INSERT dbo.project_folders(project_id, folder_code, name, created_by) VALUES (@project, '02', N'Drawing', @pm);
INSERT dbo.project_docs(project_id, folder_code, name, document_type, content_type, size_bytes, storage_key, uploaded_by)
VALUES (@project, '02', N'wrong.pdf', N'Drawing', N'application/pdf', 10, N'fixture/wrong.pdf', @eng);
DECLARE @doc bigint = SCOPE_IDENTITY();
INSERT dbo.project_docs(project_id, folder_code, name, document_type, content_type, size_bytes, storage_key, uploaded_by)
VALUES (@project, '02', N'signed-scan.pdf', N'Drawing', N'application/pdf', 10, N'fixture/signed-scan.pdf', @eng);
DECLARE @used_doc bigint = SCOPE_IDENTITY();

-- 069: no caller transaction.
SELECT @version = row_version FROM dbo.project_docs WHERE id = @doc;
SET @error = 0;
BEGIN TRY EXEC dbo.withdraw_project_document @document_id = @doc, @project_id = @project, @actor = @eng, @expected_row_version = @version;
END TRY BEGIN CATCH SET @error = ERROR_NUMBER(); END CATCH;
IF @error <> 51690 THROW 59010, 'A withdrawal without a caller transaction must be refused with 51690.', 1;
PRINT 'PASS 069 needs a caller transaction';

-- 069: a NULL actor would skip every <> comparison, so it is refused outright.
SET @error = 0;
BEGIN TRY BEGIN TRANSACTION;
  EXEC dbo.withdraw_project_document @document_id = @doc, @project_id = @project, @actor = NULL, @expected_row_version = @version;
  COMMIT;
END TRY BEGIN CATCH SET @error = ERROR_NUMBER(); IF XACT_STATE() <> 0 ROLLBACK; END CATCH;
IF @error <> 51696 THROW 59018, 'A NULL actor must be refused with 51696.', 1;
PRINT 'PASS 069 refuses a NULL actor';

IF INDEXPROPERTY(OBJECT_ID(N'dbo.document_files'), N'IX_document_files_project_doc', N'IndexID') IS NULL
   OR INDEXPROPERTY(OBJECT_ID(N'dbo.signature_marks'), N'IX_signature_marks_scan_doc', N'IndexID') IS NULL
  THROW 59019, 'The signing lookup indexes are missing.', 1;
PRINT 'PASS 069 indexes both signing references';

-- 069: someone who is not the uploader, the manager or an EM/Admin.
SET @error = 0;
BEGIN TRY BEGIN TRANSACTION;
  EXEC dbo.withdraw_project_document @document_id = @doc, @project_id = @project, @actor = @other_pm, @expected_row_version = @version;
  COMMIT;
END TRY BEGIN CATCH SET @error = ERROR_NUMBER(); IF XACT_STATE() <> 0 ROLLBACK; END CATCH;
IF @error <> 51693 THROW 59011, 'An unrelated Project Manager must be refused with 51693.', 1;
PRINT 'PASS 069 refuses an unrelated Project Manager';

-- 069: a stale row version.
SET @error = 0;
BEGIN TRY BEGIN TRANSACTION;
  EXEC dbo.withdraw_project_document @document_id = @doc, @project_id = @project, @actor = @eng, @expected_row_version = 0x0000000000000001;
  COMMIT;
END TRY BEGIN CATCH SET @error = ERROR_NUMBER(); IF XACT_STATE() <> 0 ROLLBACK; END CATCH;
IF @error <> 51692 THROW 59012, 'A stale row version must be refused with 51692.', 1;
PRINT 'PASS 069 refuses a stale row version';

-- 069: a document that a signed scan points at.
IF COL_LENGTH(N'dbo.signature_marks', N'scan_project_doc_id') IS NULL THROW 59013, 'signature_marks.scan_project_doc_id is missing.', 1;
DECLARE @used_version binary(8) = (SELECT row_version FROM dbo.project_docs WHERE id = @used_doc);
ALTER TABLE dbo.signature_marks NOCHECK CONSTRAINT ALL;
DECLARE @mark_sql nvarchar(max) = N'INSERT dbo.signature_marks(' + (
  SELECT STRING_AGG(QUOTENAME(c.name), N',') FROM sys.columns c
  WHERE c.object_id = OBJECT_ID(N'dbo.signature_marks') AND c.is_nullable = 0 AND c.default_object_id = 0 AND c.is_identity = 0 AND c.is_computed = 0
    AND TYPE_NAME(c.user_type_id) <> N'timestamp' AND c.name <> N'scan_project_doc_id')
  + N',scan_project_doc_id) SELECT ' + (
  SELECT STRING_AGG(CASE WHEN TYPE_NAME(c.user_type_id) IN (N'bigint', N'int', N'smallint', N'tinyint', N'bit', N'decimal', N'numeric') THEN N'1'
    WHEN TYPE_NAME(c.user_type_id) LIKE N'%date%' THEN N'SYSUTCDATETIME()'
    WHEN TYPE_NAME(c.user_type_id) IN (N'varbinary', N'binary') THEN N'0x00'
    WHEN TYPE_NAME(c.user_type_id) = N'uniqueidentifier' THEN N'NEWID()' ELSE N'N''x''' END, N',') FROM sys.columns c
  WHERE c.object_id = OBJECT_ID(N'dbo.signature_marks') AND c.is_nullable = 0 AND c.default_object_id = 0 AND c.is_identity = 0 AND c.is_computed = 0
    AND TYPE_NAME(c.user_type_id) <> N'timestamp' AND c.name <> N'scan_project_doc_id')
  + N',@doc;';
EXEC sys.sp_executesql @mark_sql, N'@doc bigint', @doc = @used_doc;
SET @error = 0;
BEGIN TRY BEGIN TRANSACTION;
  EXEC dbo.withdraw_project_document @document_id = @used_doc, @project_id = @project, @actor = @eng, @expected_row_version = @used_version;
  COMMIT;
END TRY BEGIN CATCH SET @error = ERROR_NUMBER(); IF XACT_STATE() <> 0 ROLLBACK; END CATCH;
IF @error <> 51694 THROW 59014, 'A document a signed scan uses must be refused with 51694.', 1;
PRINT 'PASS 069 refuses a document that signing uses';

-- 069: an Engineering Manager held as an additional role withdraws it; only deleted_at changes.
DECLARE @before nvarchar(max) = (SELECT name, storage_key, size_bytes, uploaded_by FROM dbo.project_docs WHERE id = @doc FOR JSON PATH);
BEGIN TRANSACTION;
  EXEC dbo.withdraw_project_document @document_id = @doc, @project_id = @project, @actor = @extra_em, @expected_row_version = @version;
COMMIT;
IF (SELECT deleted_at FROM dbo.project_docs WHERE id = @doc) IS NULL THROW 59015, 'The withdrawal did not set deleted_at.', 1;
IF @before <> (SELECT name, storage_key, size_bytes, uploaded_by FROM dbo.project_docs WHERE id = @doc FOR JSON PATH)
  THROW 59016, 'The withdrawal changed more than deleted_at.', 1;
PRINT 'PASS 069 lets an additional-role Engineering Manager withdraw, setting deleted_at only';

-- 069: withdrawing it again finds nothing.
SET @error = 0;
SELECT @version = row_version FROM dbo.project_docs WHERE id = @doc;
BEGIN TRY BEGIN TRANSACTION;
  EXEC dbo.withdraw_project_document @document_id = @doc, @project_id = @project, @actor = @eng, @expected_row_version = @version;
  COMMIT;
END TRY BEGIN CATCH SET @error = ERROR_NUMBER(); IF XACT_STATE() <> 0 ROLLBACK; END CATCH;
IF @error <> 51691 THROW 59017, 'A withdrawn document must be refused with 51691.', 1;
PRINT 'PASS 069 refuses a document that is already withdrawn';

PRINT 'ALL PASS project-followups-068-069';
