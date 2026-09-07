SET XACT_ABORT ON;
SET NOCOUNT ON;

IF EXISTS (SELECT 1 FROM dbo.schema_versions WHERE version = 30)
BEGIN
    SELECT N'Migration 030 is already installed.' AS status;
    RETURN;
END;

IF NOT EXISTS (SELECT 1 FROM dbo.schema_versions WHERE version = 28)
    THROW 51330, 'Migration 028 is required before customer multilingual names.', 1;

BEGIN TRANSACTION;

ALTER TABLE dbo.customers ADD
    name_th nvarchar(300) NOT NULL CONSTRAINT DF_customers_name_th DEFAULT N'' WITH VALUES,
    name_en nvarchar(300) NOT NULL CONSTRAINT DF_customers_name_en DEFAULT N'' WITH VALUES,
    name_ja nvarchar(300) NOT NULL CONSTRAINT DF_customers_name_ja DEFAULT N'' WITH VALUES;

ALTER TABLE dbo.customer_site_contacts ADD
    name_th nvarchar(200) NOT NULL CONSTRAINT DF_customer_site_contacts_name_th DEFAULT N'' WITH VALUES,
    name_en nvarchar(200) NOT NULL CONSTRAINT DF_customer_site_contacts_name_en DEFAULT N'' WITH VALUES,
    name_ja nvarchar(200) NOT NULL CONSTRAINT DF_customer_site_contacts_name_ja DEFAULT N'' WITH VALUES;

INSERT dbo.schema_versions(version, name)
VALUES (30, N'Customer and contact names in Thai, English and Japanese');

COMMIT TRANSACTION;
