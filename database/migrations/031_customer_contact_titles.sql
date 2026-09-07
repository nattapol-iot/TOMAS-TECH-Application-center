SET XACT_ABORT ON;
SET NOCOUNT ON;
IF EXISTS (SELECT 1 FROM dbo.schema_versions WHERE version=31) RETURN;
IF NOT EXISTS (SELECT 1 FROM dbo.schema_versions WHERE version=30)
  THROW 51340, 'Customer multilingual names migration 030 is required.', 1;
BEGIN TRANSACTION;
ALTER TABLE dbo.customer_site_contacts ADD
  title_th nvarchar(50) NOT NULL CONSTRAINT DF_customer_site_contacts_title_th DEFAULT N'' WITH VALUES,
  title_en nvarchar(50) NOT NULL CONSTRAINT DF_customer_site_contacts_title_en DEFAULT N'' WITH VALUES,
  title_ja nvarchar(50) NOT NULL CONSTRAINT DF_customer_site_contacts_title_ja DEFAULT N'' WITH VALUES;
INSERT INTO dbo.schema_versions(version,name) VALUES (31,N'Customer contact titles in Thai, English and Japanese');
COMMIT TRANSACTION;
