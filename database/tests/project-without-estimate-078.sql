-- Migration 078 checks: a project's inquiry and estimate are optional, an estimate still makes at
-- most one project, the foreign keys are back and trusted, and two projects without an estimate
-- can exist side by side. The inserted rows are rolled back.
SET XACT_ABORT ON;
SET NOCOUNT ON;
SET ANSI_NULLS ON;
SET QUOTED_IDENTIFIER ON;

IF COLUMNPROPERTY(OBJECT_ID(N'dbo.projects'), N'inquiry_id', 'AllowsNull') <> 1
   OR COLUMNPROPERTY(OBJECT_ID(N'dbo.projects'), N'estimate_id', 'AllowsNull') <> 1
    THROW 51990, 'projects.inquiry_id and projects.estimate_id must allow NULL.', 1;
IF OBJECT_ID(N'dbo.UQ_projects_estimate', N'UQ') IS NOT NULL
    THROW 51991, 'The UNIQUE constraint on projects.estimate_id is still there.', 1;
IF NOT EXISTS (
    SELECT 1 FROM sys.indexes i
    JOIN sys.index_columns ic ON ic.object_id = i.object_id AND ic.index_id = i.index_id
    JOIN sys.columns c ON c.object_id = ic.object_id AND c.column_id = ic.column_id
    WHERE i.object_id = OBJECT_ID(N'dbo.projects') AND i.name = N'UX_projects_estimate'
      AND i.is_unique = 1 AND i.has_filter = 1 AND i.filter_definition = N'([estimate_id] IS NOT NULL)' AND c.name = N'estimate_id')
    THROW 51992, 'UX_projects_estimate must be a unique index on estimate_id filtered to non-null values.', 1;
IF (SELECT COUNT(*) FROM sys.foreign_keys
    WHERE parent_object_id = OBJECT_ID(N'dbo.projects') AND name IN (N'FK_projects_inquiry', N'FK_projects_estimate')
      AND is_not_trusted = 0 AND is_disabled = 0) <> 2
    THROW 51993, 'FK_projects_inquiry and FK_projects_estimate must be back and trusted.', 1;
IF NOT EXISTS (SELECT 1 FROM dbo.schema_versions WHERE version = 78 AND name = N'Project without estimate')
    THROW 51994, 'Schema version 78 is not recorded.', 1;

BEGIN TRANSACTION;
DECLARE @role bigint = (SELECT TOP (1) id FROM dbo.roles ORDER BY id);
INSERT dbo.users(entra_object_id, email, name, role_id) VALUES (N'ci-078-user', N'ci-078@example.com', N'CI 078', @role);
DECLARE @user bigint = SCOPE_IDENTITY();
INSERT dbo.customers(code, name, created_by, updated_by) VALUES (N'CI078', N'CI 078 customer', @user, @user);
DECLARE @customer bigint = SCOPE_IDENTITY();
DECLARE @today date = CAST(SYSUTCDATETIME() AS date);
INSERT dbo.projects(project_no, name, customer_id, project_type, status, manager_id, lead_engineer_id, inquiry_id, estimate_id,
    po_no, po_date, start_date, target_delivery, folder_path, created_by, updated_by)
VALUES (N'CI078-1', N'App one', @customer, N'Software', N'Planning', @user, @user, NULL, NULL, N'PO-1', @today, @today, DATEADD(day, 30, @today), N'ci/1', @user, @user),
       (N'CI078-2', N'App two', @customer, N'Software', N'Planning', @user, @user, NULL, NULL, N'PO-2', @today, @today, DATEADD(day, 30, @today), N'ci/2', @user, @user);
IF (SELECT COUNT(*) FROM dbo.projects WHERE project_no LIKE N'CI078-%' AND inquiry_id IS NULL AND estimate_id IS NULL) <> 2
    THROW 51995, 'Two projects without an estimate could not be stored.', 1;
ROLLBACK TRANSACTION;

PRINT 'PASS: migration 078 checks.';
