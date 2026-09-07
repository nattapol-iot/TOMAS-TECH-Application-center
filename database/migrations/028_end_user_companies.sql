SET XACT_ABORT ON;
SET ANSI_NULLS ON;
SET QUOTED_IDENTIFIER ON;
GO
IF EXISTS (SELECT 1 FROM dbo.schema_versions WHERE version=28) RETURN;
IF NOT EXISTS (SELECT 1 FROM dbo.schema_versions WHERE version=27)
    THROW 51300, 'Apply migration 027 before End user companies.', 1;
BEGIN TRANSACTION;
-- The contracting customer remains authoritative for commercial transactions.
-- NULL means not recorded; historical end users cannot be inferred reliably.
ALTER TABLE dbo.inquiries ADD end_user_customer_id bigint NULL
    CONSTRAINT FK_inquiries_end_user_customer REFERENCES dbo.customers(id);
ALTER TABLE dbo.projects ADD end_user_customer_id bigint NULL
    CONSTRAINT FK_projects_end_user_customer REFERENCES dbo.customers(id);
EXEC(N'CREATE INDEX IX_inquiries_end_user_customer ON dbo.inquiries(end_user_customer_id) WHERE end_user_customer_id IS NOT NULL;');
EXEC(N'CREATE INDEX IX_projects_end_user_customer ON dbo.projects(end_user_customer_id) WHERE end_user_customer_id IS NOT NULL;');
IF DATABASE_PRINCIPAL_ID(N'iot_team_app_role') IS NOT NULL
    EXEC(N'GRANT UPDATE (end_user_customer_id,updated_by,updated_at) ON OBJECT::dbo.projects TO [iot_team_app_role];');
INSERT dbo.schema_versions(version,name) VALUES(28,N'Optional end user companies for inquiries and projects');
COMMIT TRANSACTION;
GO
