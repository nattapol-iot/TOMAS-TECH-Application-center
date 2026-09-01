SET XACT_ABORT ON;
SET ANSI_NULLS ON;
SET QUOTED_IDENTIFIER ON;
GO

IF EXISTS (SELECT 1 FROM dbo.schema_versions WHERE version = 29) RETURN;
IF NOT EXISTS (SELECT 1 FROM dbo.schema_versions WHERE version = 26)
    THROW 51320, 'KPI migration 026 is required.', 1;
IF NOT EXISTS (SELECT 1 FROM dbo.schema_versions WHERE version = 28)
    THROW 51321, 'Apply migration 028 first.', 1;

BEGIN TRANSACTION;

DECLARE @area_constraint sysname;
SELECT @area_constraint=constraint_object.name
FROM sys.check_constraints constraint_object
INNER JOIN sys.columns column_object
  ON column_object.object_id=constraint_object.parent_object_id
 AND column_object.column_id=constraint_object.parent_column_id
WHERE constraint_object.parent_object_id=OBJECT_ID(N'dbo.kpi_assessment_scores')
  AND column_object.name=N'area_code';

IF @area_constraint IS NULL
    THROW 51322, 'The KPI area-code constraint was not found.', 1;

DECLARE @drop_area_constraint nvarchar(max)=N'ALTER TABLE dbo.kpi_assessment_scores DROP CONSTRAINT '+QUOTENAME(@area_constraint)+N';';
EXEC sys.sp_executesql @drop_area_constraint;
ALTER TABLE dbo.kpi_assessment_scores WITH CHECK
  ADD CONSTRAINT CK_kpi_assessment_scores_area_code CHECK (area_code IN (
    N'DELIVERY',N'QUALITY',N'TECHNICAL',N'TEAMWORK',
    N'PIPELINE',N'CUSTOMER',N'FORECAST',N'COMMERCIAL',N'HANDOVER'
  ));
ALTER TABLE dbo.kpi_assessment_scores CHECK CONSTRAINT CK_kpi_assessment_scores_area_code;

INSERT dbo.role_permissions(role_id,permission_id)
SELECT role.id,permission.id
FROM dbo.roles role
CROSS JOIN dbo.permissions permission
WHERE (role.code=N'Sales Engineer' AND permission.code=N'performance.read')
   OR (role.code=N'Sales Manager' AND permission.code IN(N'performance.read',N'performance.manage'))
EXCEPT
SELECT role_id,permission_id FROM dbo.role_permissions;

INSERT dbo.schema_versions(version,name)
VALUES(29,N'Role-specific Sales KPI performance reviews');

COMMIT;
GO
