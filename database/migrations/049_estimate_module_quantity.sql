SET XACT_ABORT ON;
SET NOCOUNT ON;
GO
IF NOT EXISTS(SELECT 1 FROM dbo.schema_versions WHERE version=48) THROW 51490,'Migration 048 required.',1;
BEGIN TRANSACTION;
ALTER TABLE dbo.estimate_module_details ADD quantity decimal(19,4) NOT NULL CONSTRAINT DF_module_quantity DEFAULT 1,
 unit nvarchar(30) NOT NULL CONSTRAINT DF_module_unit DEFAULT N'Set';
EXEC sp_executesql N'ALTER TABLE dbo.estimate_module_details ADD CONSTRAINT CK_module_quantity CHECK(quantity>0);';
INSERT dbo.schema_versions(version,name) VALUES(49,N'Estimate module quantity and unit');
COMMIT;
GO
