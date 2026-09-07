-- Run only after rolling back the API, and only before any Drawing task import.
SET XACT_ABORT ON;
BEGIN TRANSACTION;
IF EXISTS(SELECT 1 FROM dbo.signable_documents WHERE schedule_task_id IS NOT NULL)
 OR EXISTS(SELECT 1 FROM dbo.sign_requests r JOIN dbo.sign_flow_templates t ON t.id=r.template_id WHERE t.doc_class=N'DRAWING' AND t.version=2)
 THROW 51241,'Drawing workflow has business history; use a forward migration instead of deleting it.',1;
DELETE s FROM dbo.sign_flow_steps s JOIN dbo.sign_flow_templates t ON t.id=s.template_id WHERE t.doc_class=N'DRAWING' AND t.version=2;
DELETE dbo.sign_flow_templates WHERE doc_class=N'DRAWING' AND version=2;
DROP INDEX IX_signable_documents_task ON dbo.signable_documents;
ALTER TABLE dbo.signable_documents DROP CONSTRAINT FK_signable_documents_task;
ALTER TABLE dbo.signable_documents DROP COLUMN schedule_task_id;
DELETE dbo.schema_versions WHERE version=21;
COMMIT;
