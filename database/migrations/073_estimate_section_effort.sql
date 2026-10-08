-- Migration 073: planned effort for one estimate section.
--
-- Estimate work is handed out by section (dbo.estimate_assignments: a responsible engineer, an optional
-- support engineer and a due date), but effort could only be planned for a whole inquiry or a whole
-- estimate, so the Workload screen could not show what each section takes. A section's effort is a
-- dbo.resource_effort row with entity_type EstimateSection and entity_id the assignment id; it is
-- shared between the section's responsible and support engineer. Nothing else changes.

-- ── Batch 1: widen the entity check ─────────────────────────────────────────
SET XACT_ABORT ON;
SET NOCOUNT ON;
SET ANSI_NULLS ON;
SET QUOTED_IDENTIFIER ON;
IF EXISTS (SELECT 1 FROM dbo.schema_versions WHERE version=73 AND name<>N'Estimate section effort')
    THROW 51735, 'Schema version 073 is already used by another migration.', 1;
IF NOT EXISTS (SELECT 1 FROM dbo.schema_versions WHERE version=72)
    THROW 51736, 'Apply migration 072 before migration 073.', 1;

BEGIN TRANSACTION;

-- Migration 019 declared the entity check inline, so SQL Server named it; find it by its column.
DECLARE @unnamed sysname = (
    SELECT TOP (1) cc.name
    FROM sys.check_constraints cc
    INNER JOIN sys.columns col ON col.object_id=cc.parent_object_id AND col.column_id=cc.parent_column_id
    WHERE cc.parent_object_id=OBJECT_ID(N'dbo.resource_effort') AND col.name=N'entity_type'
      AND cc.name<>N'CK_resource_effort_entity_type');
IF @unnamed IS NOT NULL
BEGIN
    DECLARE @drop nvarchar(400) = N'ALTER TABLE dbo.resource_effort DROP CONSTRAINT ' + QUOTENAME(@unnamed) + N';';
    EXEC sys.sp_executesql @drop;
END;

IF OBJECT_ID(N'dbo.CK_resource_effort_entity_type', N'C') IS NULL
    ALTER TABLE dbo.resource_effort WITH CHECK ADD CONSTRAINT CK_resource_effort_entity_type
        CHECK (entity_type IN (N'Inquiry', N'Estimate', N'EstimateSection'));

COMMIT TRANSACTION;
GO

-- ── Batch 2: record the version last ────────────────────────────────────────
IF NOT EXISTS (SELECT 1 FROM dbo.schema_versions WHERE version=73)
    INSERT dbo.schema_versions(version,name)
    VALUES (73,N'Estimate section effort');
