SET XACT_ABORT ON;
SET NOCOUNT ON;
BEGIN TRANSACTION;
IF EXISTS(SELECT 1 FROM dbo.schema_versions WHERE version=33)
BEGIN COMMIT; RETURN; END;
CREATE TABLE dbo.historical_pr_imports (
 id bigint IDENTITY PRIMARY KEY,
 project_id bigint NULL REFERENCES dbo.projects(id),
 source_project_number nvarchar(100) NOT NULL,
 document_reference nvarchar(200) NOT NULL,
 revision int NOT NULL,
 is_current bit NOT NULL CONSTRAINT DF_historical_pr_current DEFAULT 1,
 source_name nvarchar(500) NOT NULL,
 source_hash char(64) NOT NULL,
 source_bytes varbinary(max) NOT NULL,
 payload nvarchar(max) NOT NULL CHECK(ISJSON(payload)=1),
 links nvarchar(max) NOT NULL CONSTRAINT DF_historical_pr_links DEFAULT N'{}' CHECK(ISJSON(links)=1),
 created_by bigint NOT NULL REFERENCES dbo.users(id),
 created_at datetimeoffset NOT NULL DEFAULT SYSUTCDATETIME(),
 updated_by bigint NOT NULL REFERENCES dbo.users(id),
 updated_at datetimeoffset NOT NULL DEFAULT SYSUTCDATETIME(),
 row_version rowversion NOT NULL,
 CONSTRAINT UQ_historical_pr_file UNIQUE(source_project_number,source_hash),
 CONSTRAINT UQ_historical_pr_revision UNIQUE(source_project_number,document_reference,revision)
);
CREATE UNIQUE INDEX UX_historical_pr_current ON dbo.historical_pr_imports(source_project_number,document_reference) WHERE is_current=1;
IF DATABASE_PRINCIPAL_ID(N'iot_team_app_role') IS NOT NULL
BEGIN
 GRANT SELECT,INSERT ON dbo.historical_pr_imports TO iot_team_app_role;
 GRANT UPDATE(project_id,is_current,links,updated_by,updated_at) ON dbo.historical_pr_imports TO iot_team_app_role;
END;
INSERT dbo.schema_versions(version,name) VALUES(33,N'Historical PR workbook imports with source versions and reconciliation links');
COMMIT;
