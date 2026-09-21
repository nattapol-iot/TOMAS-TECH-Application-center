SET XACT_ABORT ON;
BEGIN TRANSACTION;
-- Retain document identities and all ledgers. Archive does not break project references.
IF COL_LENGTH(N'dbo.inquiries',N'archived_at') IS NULL
  ALTER TABLE dbo.inquiries ADD archived_at datetimeoffset(0) NULL;
IF COL_LENGTH(N'dbo.estimates',N'archived_at') IS NULL
  ALTER TABLE dbo.estimates ADD archived_at datetimeoffset(0) NULL;
IF OBJECT_ID(N'dbo.CK_estimates_status',N'C') IS NOT NULL
  ALTER TABLE dbo.estimates DROP CONSTRAINT CK_estimates_status;
ALTER TABLE dbo.estimates ADD CONSTRAINT CK_estimates_status CHECK (status IN
 (N'Draft',N'Engineering Input',N'Waiting Supplier Price',N'Estimate Completed',
  N'Engineering Review',N'Revision Required',N'Approved',N'Locked',N'Cancelled'));

IF OBJECT_ID(N'dbo.document_lifecycle_events',N'U') IS NULL
BEGIN
CREATE TABLE dbo.document_lifecycle_events (
 id bigint IDENTITY PRIMARY KEY,
 entity_type nvarchar(20) NOT NULL CHECK(entity_type IN(N'Inquiry',N'Estimate')),
 entity_id bigint NOT NULL,
 entity_no nvarchar(50) NOT NULL,
 action nvarchar(30) NOT NULL,
 reason nvarchar(1000) NOT NULL,
 before_json nvarchar(max) NOT NULL CHECK(ISJSON(before_json)=1),
 after_json nvarchar(max) NOT NULL CHECK(ISJSON(after_json)=1),
 actor_id bigint NOT NULL REFERENCES dbo.users(id),
 occurred_at datetimeoffset(0) NOT NULL DEFAULT SYSUTCDATETIME(),
 restored_at datetimeoffset(0) NULL,
 restored_by bigint NULL REFERENCES dbo.users(id),
 row_version rowversion NOT NULL
);
CREATE INDEX IX_document_lifecycle_entity ON dbo.document_lifecycle_events(entity_type,entity_id,id DESC);
END;
IF DATABASE_PRINCIPAL_ID(N'iot_team_app_role') IS NOT NULL
  GRANT SELECT,INSERT,UPDATE ON OBJECT::dbo.document_lifecycle_events TO [iot_team_app_role];
IF NOT EXISTS(SELECT 1 FROM dbo.schema_versions WHERE version=57)
  INSERT dbo.schema_versions(version,name) VALUES(57,N'Inquiry and estimate document lifecycle');
COMMIT TRANSACTION;
