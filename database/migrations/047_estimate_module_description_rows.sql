SET XACT_ABORT ON;
SET NOCOUNT ON;
GO
IF EXISTS (SELECT 1 FROM dbo.schema_versions WHERE version=47)
    THROW 51470, 'Migration 047 has already been applied.', 1;
IF NOT EXISTS (SELECT 1 FROM dbo.schema_versions WHERE version=46)
    THROW 51471, 'Migration 046 is required before 047.', 1;
BEGIN TRANSACTION;
ALTER TABLE dbo.estimate_module_details ADD description_rows nvarchar(max) NOT NULL
    CONSTRAINT DF_estimate_module_description_rows DEFAULT N'[]'
    CONSTRAINT CK_estimate_module_description_rows CHECK (ISJSON(description_rows)=1);
IF DATABASE_PRINCIPAL_ID(N'iot_team_app_role') IS NOT NULL
    GRANT DELETE ON OBJECT::dbo.estimate_module_details TO [iot_team_app_role];
INSERT dbo.schema_versions(version,name) VALUES(47,N'Estimate module description rows and summary notes');
COMMIT TRANSACTION;
GO
