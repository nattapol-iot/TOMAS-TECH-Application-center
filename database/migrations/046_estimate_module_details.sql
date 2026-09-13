SET XACT_ABORT ON;
SET NOCOUNT ON;
GO
IF EXISTS (SELECT 1 FROM dbo.schema_versions WHERE version=46)
    THROW 51460, 'Migration 046 has already been applied.', 1;
IF NOT EXISTS (SELECT 1 FROM dbo.schema_versions WHERE version=45)
    THROW 51461, 'Migration 045 is required before 046.', 1;
BEGIN TRANSACTION;
CREATE TABLE dbo.estimate_module_details (
    estimate_id bigint NOT NULL REFERENCES dbo.estimates(id),
    revision int NOT NULL,
    module_key nvarchar(250) COLLATE Latin1_General_100_BIN2 NOT NULL,
    title nvarchar(200) NOT NULL,
    remark nvarchar(2000) NULL,
    updated_by bigint NOT NULL REFERENCES dbo.users(id),
    updated_at datetime2 NOT NULL CONSTRAINT DF_estimate_module_details_updated DEFAULT SYSUTCDATETIME(),
    CONSTRAINT PK_estimate_module_details PRIMARY KEY(estimate_id,revision,module_key)
);
IF DATABASE_PRINCIPAL_ID(N'iot_team_app_role') IS NOT NULL
    GRANT SELECT, INSERT, UPDATE ON OBJECT::dbo.estimate_module_details TO [iot_team_app_role];
INSERT dbo.schema_versions(version,name) VALUES(46,N'Revision-scoped estimate module names and remarks');
COMMIT TRANSACTION;
GO
