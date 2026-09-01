:on error exit
SET XACT_ABORT ON;
SET NOCOUNT ON;
IF EXISTS (SELECT 1 FROM dbo.schema_versions WHERE version=19) RETURN;
IF NOT EXISTS (SELECT 1 FROM dbo.schema_versions WHERE version=17)
    THROW 51200, 'Migration 017 is required.', 1;
BEGIN TRANSACTION;
CREATE TABLE dbo.resource_capacity (
 user_id bigint NOT NULL PRIMARY KEY REFERENCES dbo.users(id),
 days_per_week decimal(5,2) NOT NULL CHECK(days_per_week>=0 AND days_per_week<=5),
 updated_by bigint NOT NULL REFERENCES dbo.users(id),
 updated_at datetime2 NOT NULL DEFAULT SYSUTCDATETIME(),
 row_version rowversion NOT NULL
);
-- Pre-sales effort is separate from delivery effort in estimate cost lines.
-- Never infer estimating effort from the cost of building the project.
CREATE TABLE dbo.resource_effort (
 entity_type nvarchar(20) NOT NULL CHECK(entity_type IN(N'Inquiry',N'Estimate')),
 entity_id bigint NOT NULL,
 start_date date NOT NULL,
 end_date date NOT NULL,
 man_days decimal(12,2) NOT NULL CHECK(man_days>=0 AND man_days<=100000),
 updated_by bigint NOT NULL REFERENCES dbo.users(id),
 updated_at datetime2 NOT NULL DEFAULT SYSUTCDATETIME(),
 row_version rowversion NOT NULL,
 CONSTRAINT PK_resource_effort PRIMARY KEY(entity_type,entity_id),
 CONSTRAINT CK_resource_effort_dates CHECK(end_date>=start_date AND DATEDIFF(day,start_date,end_date)<=3650)
);
IF DATABASE_PRINCIPAL_ID(N'iot_team_app_role') IS NOT NULL
BEGIN
 GRANT SELECT,INSERT,UPDATE ON dbo.resource_capacity TO iot_team_app_role;
 GRANT SELECT,INSERT,UPDATE ON dbo.resource_effort TO iot_team_app_role;
END;
INSERT dbo.schema_versions(version,name) VALUES(19,N'Resource planning capacity and pre-sales effort');
COMMIT;
