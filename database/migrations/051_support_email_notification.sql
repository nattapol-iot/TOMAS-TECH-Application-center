SET XACT_ABORT ON;
SET NOCOUNT ON;
GO
IF NOT EXISTS(SELECT 1 FROM dbo.schema_versions WHERE version=50) THROW 51510,'Migration 050 required.',1;
BEGIN TRANSACTION;
ALTER TABLE dbo.support_members ADD notify_email bit NOT NULL CONSTRAINT DF_support_members_notify_email DEFAULT 1;
INSERT dbo.schema_versions(version,name) VALUES(51,N'Support member email notification preference');
COMMIT;
GO
