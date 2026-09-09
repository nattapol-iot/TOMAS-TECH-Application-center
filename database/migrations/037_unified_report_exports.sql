SET XACT_ABORT ON;
SET ANSI_NULLS ON;
SET QUOTED_IDENTIFIER ON;
GO
IF EXISTS(SELECT 1 FROM dbo.schema_versions WHERE version=37) RETURN;
IF NOT EXISTS(SELECT 1 FROM dbo.schema_versions WHERE version=36) THROW 51370,'Apply migration 036 first.',1;
BEGIN TRANSACTION;
CREATE TABLE dbo.unified_report_exports (
 id bigint IDENTITY PRIMARY KEY,
 report_id bigint NOT NULL REFERENCES dbo.unified_reports(id),
 revision int NOT NULL CHECK(revision>=0),
 format nvarchar(10) NOT NULL CHECK(format IN(N'pdf',N'pptx')),
 generated_by bigint NOT NULL REFERENCES dbo.users(id),
 file_name nvarchar(500) NOT NULL,
 content_type nvarchar(150) NOT NULL,
 storage_key nvarchar(1000) NOT NULL UNIQUE,
 size_bytes bigint NOT NULL CHECK(size_bytes>0 AND size_bytes<=524288000),
 sha256 char(64) NOT NULL,
 created_at datetimeoffset(0) NOT NULL DEFAULT SYSUTCDATETIME()
);
CREATE INDEX IX_unified_report_exports_report ON dbo.unified_report_exports(report_id,id);
-- Exported document archives are append-only: every generated PDF/PPTX is kept as a
-- permanent NAS-backed record, never overwritten or deleted.
EXEC(N'CREATE TRIGGER dbo.tr_unified_report_exports_immutable ON dbo.unified_report_exports INSTEAD OF UPDATE,DELETE AS BEGIN THROW 51371,''Report export archives are immutable.'',1; END');
IF DATABASE_PRINCIPAL_ID(N'iot_team_app_role') IS NOT NULL BEGIN
 GRANT SELECT,INSERT ON dbo.unified_report_exports TO iot_team_app_role;
END;
INSERT dbo.schema_versions(version,name) VALUES(37,N'Archive generated report PDF/PPTX exports on NAS storage');
COMMIT;
GO
