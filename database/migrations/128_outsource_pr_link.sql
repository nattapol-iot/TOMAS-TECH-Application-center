-- Migration 128: the purchase request an outsourced plan row is bought on.
--
-- Task doc 3.7 (owner 2026-11-23): an outsourced row (labor_source = Outsourced) shows the number and status of the
-- purchase request its supplier is bought on, so the project manager sees which outsourced work still has no request.
-- The project manager links it from the plan Sheet; the request must belong to the same project.
--
-- To undo: database/rollback/128_outsource_pr_link.rollback.sql

SET XACT_ABORT ON;
SET NOCOUNT ON;
SET ANSI_NULLS ON;
SET QUOTED_IDENTIFIER ON;
GO

IF NOT EXISTS (SELECT 1 FROM dbo.schema_versions WHERE version = 127)
    THROW 51128, 'Migration 127 must be applied before migration 128.', 1;
GO

BEGIN TRANSACTION;

IF COL_LENGTH(N'dbo.schedule_tasks', N'purchase_request_id') IS NULL
    ALTER TABLE dbo.schedule_tasks ADD purchase_request_id bigint NULL
        CONSTRAINT FK_schedule_tasks_purchase_request REFERENCES dbo.mat_prs(id);

COMMIT TRANSACTION;
GO

IF NOT EXISTS (SELECT 1 FROM dbo.schema_versions WHERE version = 128)
    INSERT dbo.schema_versions(version, name)
    VALUES (128, N'Outsource PR link');
GO
