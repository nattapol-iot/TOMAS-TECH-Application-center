-- Undo of migration 128: the purchase request an outsourced plan row is bought on.
--
-- Run by hand, on a database at schema version 128, together with a release of the API from before migration 128.
-- The links between outsourced rows and their purchase requests are lost; the requests stay.

SET XACT_ABORT ON;
SET NOCOUNT ON;
SET ANSI_NULLS ON;
SET QUOTED_IDENTIFIER ON;
GO

IF EXISTS (SELECT 1 FROM dbo.schema_versions WHERE version > 128)
    THROW 51928, 'Roll back the migrations after 128 first.', 1;
GO

IF EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'FK_schedule_tasks_purchase_request')
    ALTER TABLE dbo.schedule_tasks DROP CONSTRAINT FK_schedule_tasks_purchase_request;
GO

IF COL_LENGTH(N'dbo.schedule_tasks', N'purchase_request_id') IS NOT NULL
    ALTER TABLE dbo.schedule_tasks DROP COLUMN purchase_request_id;
GO

DELETE FROM dbo.schema_versions WHERE version = 128;
GO
