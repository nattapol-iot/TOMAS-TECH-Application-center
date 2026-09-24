-- Evidence is nullable for historical records; never infer a sent quotation from cost approval.
SET XACT_ABORT ON;
BEGIN TRANSACTION;
IF COL_LENGTH(N'dbo.crm_opportunities', N'proposal_sent_on') IS NULL
    ALTER TABLE dbo.crm_opportunities ADD proposal_sent_on date NULL;
IF COL_LENGTH(N'dbo.crm_opportunities', N'proposal_reference') IS NULL
    ALTER TABLE dbo.crm_opportunities ADD proposal_reference nvarchar(1000) NULL;
IF COL_LENGTH(N'dbo.crm_opportunities', N'won_on') IS NULL
    ALTER TABLE dbo.crm_opportunities ADD won_on date NULL;
IF COL_LENGTH(N'dbo.crm_opportunities', N'won_reference') IS NULL
    ALTER TABLE dbo.crm_opportunities ADD won_reference nvarchar(1000) NULL;
COMMIT TRANSACTION;
GO
IF NOT EXISTS (SELECT 1 FROM dbo.schema_versions WHERE version=63)
    INSERT INTO dbo.schema_versions(version,name)
    VALUES(63,N'CRM quotation dispatch and order confirmation evidence');
GO
