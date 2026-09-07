SET XACT_ABORT ON;
SET ANSI_NULLS ON;
SET QUOTED_IDENTIFIER ON;
GO
IF EXISTS(SELECT 1 FROM dbo.schema_versions WHERE version=36) RETURN;
IF NOT EXISTS(SELECT 1 FROM dbo.schema_versions WHERE version=35) THROW 51360,'Apply migration 035 first.',1;
BEGIN TRANSACTION;
CREATE TABLE dbo.unified_report_evidence_files (
 id bigint IDENTITY PRIMARY KEY,
 report_id bigint NOT NULL REFERENCES dbo.unified_reports(id),
 uploaded_by bigint NOT NULL REFERENCES dbo.users(id),
 file_name nvarchar(500) NOT NULL,
 content_type nvarchar(100) NOT NULL CHECK(content_type IN(N'image/jpeg',N'image/png')),
 storage_key nvarchar(1000) NOT NULL UNIQUE,
 size_bytes bigint NOT NULL CHECK(size_bytes>0 AND size_bytes<=8388608),
 sha256 char(64) NOT NULL,
 created_at datetimeoffset(0) NOT NULL DEFAULT SYSUTCDATETIME()
);
CREATE INDEX IX_unified_report_evidence_report ON dbo.unified_report_evidence_files(report_id,id);
-- Evidence files are append-only. A signed snapshot records the attachment id and
-- SHA-256; replacement therefore creates a new file and a new report revision.
EXEC(N'CREATE TRIGGER dbo.tr_unified_report_evidence_immutable ON dbo.unified_report_evidence_files INSTEAD OF UPDATE,DELETE AS BEGIN THROW 51361,''Report evidence files are immutable.'',1; END');
IF DATABASE_PRINCIPAL_ID(N'iot_team_app_role') IS NOT NULL BEGIN
 GRANT SELECT,INSERT ON dbo.unified_report_evidence_files TO iot_team_app_role;
END;
INSERT dbo.schema_versions(version,name) VALUES(36,N'Report evidence images with immutable file hashes');
COMMIT;
GO
