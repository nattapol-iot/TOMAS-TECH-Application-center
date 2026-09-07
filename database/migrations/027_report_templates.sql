SET XACT_ABORT ON;
SET ANSI_NULLS ON;
SET QUOTED_IDENTIFIER ON;
GO
IF EXISTS(SELECT 1 FROM dbo.schema_versions WHERE version=27) RETURN;
IF NOT EXISTS(SELECT 1 FROM dbo.schema_versions WHERE version=25) THROW 51290,'Apply migration 025 first.',1;
-- 026 belongs to independent KPI work; this migration has no dependency on it.
BEGIN TRANSACTION;
CREATE TABLE dbo.report_templates (
 id bigint IDENTITY PRIMARY KEY,
 name nvarchar(200) NOT NULL,
 description nvarchar(2000) NOT NULL DEFAULT N'',
 report_type nvarchar(20) NOT NULL CHECK(report_type IN(N'INSTALLATION',N'UAT',N'SERVICE',N'INSPECTION',N'POC')),
 locale nvarchar(5) NOT NULL CHECK(locale IN(N'en',N'th',N'ja')),
 body_json nvarchar(max) NOT NULL CHECK(ISJSON(body_json)=1),
 version int NOT NULL DEFAULT 1 CHECK(version>=1),
 is_active bit NOT NULL DEFAULT 1,
 created_by bigint NOT NULL REFERENCES dbo.users(id),
 updated_by bigint NOT NULL REFERENCES dbo.users(id),
 created_at datetimeoffset(0) NOT NULL DEFAULT SYSUTCDATETIME(),
 updated_at datetimeoffset(0) NOT NULL DEFAULT SYSUTCDATETIME(),
 row_version rowversion NOT NULL
);
CREATE INDEX IX_report_templates_library ON dbo.report_templates(is_active,report_type,name);
ALTER TABLE dbo.unified_reports ADD template_id bigint NULL REFERENCES dbo.report_templates(id),template_version int NULL,template_name nvarchar(200) NULL;
EXEC(N'ALTER TABLE dbo.unified_reports ADD CONSTRAINT CK_report_template_provenance CHECK(
 (template_id IS NULL AND template_version IS NULL AND template_name IS NULL)
 OR (template_id IS NOT NULL AND template_version IS NOT NULL AND template_version>=1 AND template_name IS NOT NULL));');
EXEC(N'CREATE TRIGGER dbo.tr_report_template_no_delete ON dbo.report_templates INSTEAD OF DELETE AS
BEGIN THROW 51291,''Archive report templates; deletion is forbidden.'',1; END');
EXEC(N'CREATE TRIGGER dbo.tr_report_template_version ON dbo.report_templates AFTER UPDATE AS
BEGIN
 IF EXISTS(SELECT 1 FROM inserted i JOIN deleted d ON i.id=d.id WHERE i.version<>d.version+1 OR i.report_type<>d.report_type OR i.created_by<>d.created_by)
 THROW 51292,''Template edits must advance the version and retain type/creator.'',1;
END');
EXEC(N'CREATE TRIGGER dbo.tr_report_template_provenance_fixed ON dbo.unified_reports AFTER UPDATE AS
BEGIN
 IF EXISTS(SELECT 1 FROM inserted i JOIN deleted d ON i.id=d.id WHERE ISNULL(i.template_id,0)<>ISNULL(d.template_id,0) OR ISNULL(i.template_version,0)<>ISNULL(d.template_version,0) OR ISNULL(i.template_name,N'''')<>ISNULL(d.template_name,N''''))
 THROW 51293,''The template provenance used to create a report is immutable.'',1;
END');
IF DATABASE_PRINCIPAL_ID(N'iot_team_app_role') IS NOT NULL
 GRANT SELECT,INSERT,UPDATE ON dbo.report_templates TO iot_team_app_role;
INSERT dbo.schema_versions(version,name) VALUES(27,N'Reusable sanitized report templates and frozen provenance');
COMMIT;
