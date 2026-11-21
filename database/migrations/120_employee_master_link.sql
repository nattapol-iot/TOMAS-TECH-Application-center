-- Migration 120: employees linked to tmt-master-data.
--
-- The API copies names and nicknames from master's employee directory onto dbo.employees and marks an
-- employee inactive once master no longer lists them (owner decision 2026-11-21). Department, position,
-- sizes and rates stay with this app. A row is matched by email once, then by the LINE WORKS user id kept
-- here, so only a person master once listed can be marked inactive: an email that never matched leaves its
-- row untouched.
--
--   master_lineworks_id  master's lineworks_user_id for this employee; null until the first match
--   master_synced_at     when the sync last matched this row
--
-- To undo: database/rollback/120_employee_master_link.rollback.sql

SET XACT_ABORT ON;
SET NOCOUNT ON;
SET ANSI_NULLS ON;
SET QUOTED_IDENTIFIER ON;
GO

IF NOT EXISTS (SELECT 1 FROM dbo.schema_versions WHERE version = 119)
    THROW 51120, 'Migration 119 must be applied before migration 120.', 1;
GO

BEGIN TRANSACTION;

IF COL_LENGTH(N'dbo.employees', N'master_lineworks_id') IS NULL
    ALTER TABLE dbo.employees ADD master_lineworks_id nvarchar(100) NULL;
IF COL_LENGTH(N'dbo.employees', N'master_synced_at') IS NULL
    ALTER TABLE dbo.employees ADD master_synced_at datetimeoffset(0) NULL;

COMMIT TRANSACTION;
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID(N'dbo.employees') AND name = N'UX_employees_master_lineworks_id')
    CREATE UNIQUE INDEX UX_employees_master_lineworks_id ON dbo.employees(master_lineworks_id) WHERE master_lineworks_id IS NOT NULL;
GO

IF NOT EXISTS (SELECT 1 FROM dbo.schema_versions WHERE version = 120)
    INSERT dbo.schema_versions(version, name)
    VALUES (120, N'Employees linked to master data');
GO
