SET XACT_ABORT ON;
BEGIN TRANSACTION;

IF COL_LENGTH('dbo.crm_opportunities','end_user_customer_id') IS NULL
  ALTER TABLE dbo.crm_opportunities ADD end_user_customer_id bigint NULL
    CONSTRAINT FK_crm_opportunities_end_user_customer REFERENCES dbo.customers(id);

IF NOT EXISTS(SELECT 1 FROM sys.indexes WHERE object_id=OBJECT_ID('dbo.crm_opportunities') AND name='IX_crm_opportunities_end_user')
  EXEC(N'CREATE INDEX IX_crm_opportunities_end_user ON dbo.crm_opportunities(end_user_customer_id) WHERE end_user_customer_id IS NOT NULL;');

IF NOT EXISTS(SELECT 1 FROM dbo.schema_versions WHERE version=54)
  INSERT dbo.schema_versions(version,name) VALUES(54,N'CRM opportunity end user company');

COMMIT TRANSACTION;
