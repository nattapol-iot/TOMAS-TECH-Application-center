SET XACT_ABORT ON;
SET ANSI_NULLS ON;
SET QUOTED_IDENTIFIER ON;
SET ANSI_PADDING ON;
SET ANSI_WARNINGS ON;
SET ARITHABORT ON;
SET CONCAT_NULL_YIELDS_NULL ON;
SET NUMERIC_ROUNDABORT OFF;
GO
IF EXISTS(SELECT 1 FROM dbo.schema_versions WHERE version=21) RETURN;
IF NOT EXISTS(SELECT 1 FROM dbo.schema_versions WHERE version=20) THROW 51240,'Apply migration 020 first.',1;
BEGIN TRANSACTION;
ALTER TABLE dbo.signable_documents ADD schedule_task_id bigint NULL;
ALTER TABLE dbo.signable_documents ADD CONSTRAINT FK_signable_documents_task
 FOREIGN KEY(schedule_task_id) REFERENCES dbo.schedule_tasks(id);
CREATE INDEX IX_signable_documents_task ON dbo.signable_documents(schedule_task_id);

-- New immutable template revision; the original draft and historical requests stay intact.
INSERT dbo.sign_flow_templates(doc_class,version,ordered,no_same_person,return_target,allow_manager_skip,status,created_by)
VALUES(N'DRAWING',2,1,1,N'OWNER',0,N'ACTIVE',NULL);
DECLARE @template bigint=SCOPE_IDENTITY();
INSERT dbo.sign_flow_steps(template_id,step_no,block_code,assignee_kind,required_mark,is_optional,anchor_code,due_days)
VALUES(@template,1,N'DRAWN_BY',N'OWNER',N'INITIAL',0,N'sig:DRAWN_BY',NULL),
 (@template,2,N'CHECKED_BY',N'PROJECT_MANAGER',N'SIGNATURE',0,N'sig:CHECKED_BY',2),
 (@template,3,N'APPROVED_BY',N'PROJECT_MANAGER',N'SIGNATURE',0,N'sig:APPROVED_BY',2);
-- DRAWING request creation resolves these blocks to the project's named leader/manager.
-- No stamp is invented or automatically granted. A request may select an authorized stamp.
INSERT dbo.schema_versions(version,name) VALUES(21,N'Drawing release from assigned project task');
COMMIT;
