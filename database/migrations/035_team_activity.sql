SET XACT_ABORT ON;
SET ANSI_NULLS ON;
SET QUOTED_IDENTIFIER ON;
GO
IF EXISTS(SELECT 1 FROM dbo.schema_versions WHERE version=35) RETURN;
IF NOT EXISTS(SELECT 1 FROM dbo.schema_versions WHERE version=34) THROW 51350,'Apply migration 034 first.',1;
BEGIN TRANSACTION;
CREATE TABLE dbo.activity_settings(id int PRIMARY KEY CHECK(id=1),started_at datetimeoffset(0) NOT NULL DEFAULT SYSUTCDATETIME());
INSERT dbo.activity_settings(id) VALUES(1);
CREATE TABLE dbo.activity_sessions(
 id bigint IDENTITY PRIMARY KEY,user_id bigint NOT NULL REFERENCES dbo.users(id),
 started_at datetimeoffset(0) NOT NULL DEFAULT SYSUTCDATETIME(),last_at datetimeoffset(0) NOT NULL DEFAULT SYSUTCDATETIME(),
 module nvarchar(60) NOT NULL);
CREATE INDEX IX_activity_sessions_user ON dbo.activity_sessions(user_id,last_at DESC);
-- A commitment is an effective-dated reporting schedule. History is never rewritten.
CREATE TABLE dbo.activity_rules(
 id bigint IDENTITY PRIMARY KEY,user_id bigint NOT NULL REFERENCES dbo.users(id),project_id bigint NULL REFERENCES dbo.projects(id),
 source_type nvarchar(30) NOT NULL CHECK(source_type IN(N'Schedule Task',N'Resource Task',N'Inquiry')),
 source_id bigint NOT NULL,title nvarchar(500) NOT NULL,
 starts_on date NOT NULL,ends_on date NOT NULL,stopped_on date NULL,
 weekday_mask int NOT NULL CHECK(weekday_mask BETWEEN 1 AND 127),cutoff_minute int NOT NULL CHECK(cutoff_minute BETWEEN 0 AND 1439),
 created_by bigint NOT NULL REFERENCES dbo.users(id),created_at datetimeoffset(0) NOT NULL DEFAULT SYSUTCDATETIME(),row_version rowversion,
 CHECK(starts_on<=ends_on),CHECK(stopped_on IS NULL OR stopped_on>=starts_on));
CREATE INDEX IX_activity_rules_owner ON dbo.activity_rules(user_id,starts_on,ends_on);
CREATE TABLE dbo.activity_events(
 id bigint IDENTITY PRIMARY KEY,actor_id bigint NOT NULL REFERENCES dbo.users(id),project_id bigint NULL REFERENCES dbo.projects(id),
 rule_id bigint NULL REFERENCES dbo.activity_rules(id),session_id bigint NULL REFERENCES dbo.activity_sessions(id),kind nvarchar(30) NOT NULL,module nvarchar(60) NOT NULL,
 source_type nvarchar(30) NULL,source_id bigint NULL,summary nvarchar(2000) NOT NULL,
 details_json nvarchar(max) NULL CHECK(details_json IS NULL OR ISJSON(details_json)=1),
 request_key uniqueidentifier NULL,occurred_at datetimeoffset(0) NOT NULL DEFAULT SYSUTCDATETIME());
CREATE INDEX IX_activity_events_actor ON dbo.activity_events(actor_id,occurred_at DESC);
CREATE UNIQUE INDEX UX_activity_event_request ON dbo.activity_events(actor_id,request_key) WHERE request_key IS NOT NULL;
CREATE TABLE dbo.activity_exceptions(
 id bigint IDENTITY PRIMARY KEY,user_id bigint NOT NULL REFERENCES dbo.users(id),day date NOT NULL,
 reason nvarchar(1000) NOT NULL,approved_by bigint NOT NULL REFERENCES dbo.users(id),created_at datetimeoffset(0) NOT NULL DEFAULT SYSUTCDATETIME(),
 UNIQUE(user_id,day));
CREATE TABLE dbo.activity_cycle_policies(
 cycle_id bigint PRIMARY KEY REFERENCES dbo.kpi_review_cycles(id),mode nvarchar(10) NOT NULL CHECK(mode IN(N'TRIAL',N'ACTIVE')),
 weight int NOT NULL DEFAULT 10 CHECK(weight=10),min_days int NOT NULL DEFAULT 10 CHECK(min_days=10),
 formula_version int NOT NULL DEFAULT 1 CHECK(formula_version=1),created_by bigint NOT NULL REFERENCES dbo.users(id),created_at datetimeoffset(0) NOT NULL DEFAULT SYSUTCDATETIME());
CREATE TABLE dbo.activity_quality(
 cycle_id bigint NOT NULL REFERENCES dbo.kpi_review_cycles(id),user_id bigint NOT NULL REFERENCES dbo.users(id),
 clarity int NOT NULL CHECK(clarity BETWEEN 0 AND 5),next_step int NOT NULL CHECK(next_step BETWEEN 0 AND 5),evidence int NOT NULL CHECK(evidence BETWEEN 0 AND 5),
 note nvarchar(2000) NOT NULL,evidence_ids nvarchar(2000) NOT NULL CHECK(ISJSON(evidence_ids)=1),
 reviewer_id bigint NOT NULL REFERENCES dbo.users(id),updated_at datetimeoffset(0) NOT NULL DEFAULT SYSUTCDATETIME(),row_version rowversion,
 PRIMARY KEY(cycle_id,user_id),CHECK(reviewer_id<>user_id));
CREATE TABLE dbo.activity_snapshots(
 cycle_id bigint NOT NULL REFERENCES dbo.kpi_review_cycles(id),user_id bigint NOT NULL REFERENCES dbo.users(id),
 snapshot_json nvarchar(max) NOT NULL CHECK(ISJSON(snapshot_json)=1),created_at datetimeoffset(0) NOT NULL DEFAULT SYSUTCDATETIME(),
 PRIMARY KEY(cycle_id,user_id));
CREATE TABLE dbo.activity_clarifications(
 id bigint IDENTITY PRIMARY KEY,cycle_id bigint NOT NULL REFERENCES dbo.kpi_review_cycles(id),user_id bigint NOT NULL REFERENCES dbo.users(id),
 note nvarchar(2000) NOT NULL,created_at datetimeoffset(0) NOT NULL DEFAULT SYSUTCDATETIME());
EXEC(N'CREATE TRIGGER dbo.tr_activity_events_frozen ON dbo.activity_events AFTER UPDATE,DELETE AS BEGIN THROW 51351,''Activity evidence is append-only.'',1; END');
EXEC(N'CREATE TRIGGER dbo.tr_activity_snapshots_frozen ON dbo.activity_snapshots AFTER UPDATE,DELETE AS BEGIN THROW 51351,''Activity snapshots are immutable.'',1; END');
EXEC(N'CREATE TRIGGER dbo.tr_activity_exceptions_frozen ON dbo.activity_exceptions AFTER UPDATE,DELETE AS BEGIN THROW 51351,''Activity exceptions are append-only.'',1; END');
EXEC(N'CREATE TRIGGER dbo.tr_activity_policies_frozen ON dbo.activity_cycle_policies AFTER UPDATE,DELETE AS BEGIN THROW 51351,''Cycle policies are immutable.'',1; END');
EXEC(N'CREATE TRIGGER dbo.tr_activity_rules_history ON dbo.activity_rules AFTER UPDATE,DELETE AS BEGIN
 IF EXISTS(SELECT 1 FROM deleted d LEFT JOIN inserted i ON i.id=d.id WHERE i.id IS NULL OR d.stopped_on IS NOT NULL OR
 i.user_id<>d.user_id OR ISNULL(i.project_id,0)<>ISNULL(d.project_id,0) OR i.source_type<>d.source_type OR i.source_id<>d.source_id OR i.title<>d.title OR
 i.starts_on<>d.starts_on OR i.ends_on<>d.ends_on OR i.weekday_mask<>d.weekday_mask OR i.cutoff_minute<>d.cutoff_minute OR
 i.stopped_on IS NULL OR i.stopped_on<=CONVERT(date,SWITCHOFFSET(SYSDATETIMEOFFSET(),''+07:00'')))
 THROW 51351,''Reporting history cannot be rewritten; stop from a future date.'',1; END');
EXEC(N'CREATE TRIGGER dbo.tr_activity_quality_frozen ON dbo.activity_quality AFTER INSERT,UPDATE,DELETE AS BEGIN
 IF EXISTS(SELECT 1 FROM (SELECT cycle_id,user_id FROM inserted UNION SELECT cycle_id,user_id FROM deleted) q JOIN dbo.activity_snapshots s ON s.cycle_id=q.cycle_id AND s.user_id=q.user_id)
 THROW 51351,''Final activity quality is frozen.'',1; END');
INSERT dbo.permissions(code,description) VALUES(N'activity.read',N'Read own activity and scoped team reporting'),(N'activity.manage',N'Manage scoped reporting commitments');
INSERT dbo.role_permissions(role_id,permission_id)
 SELECT r.id,p.id FROM dbo.roles r CROSS JOIN dbo.permissions p WHERE p.code=N'activity.read'
 OR (p.code=N'activity.manage' AND r.code IN(N'Admin',N'Engineering Manager',N'Project Manager',N'Sales Manager',N'Management'));
IF DATABASE_PRINCIPAL_ID(N'iot_team_app_role') IS NOT NULL BEGIN
 GRANT SELECT ON dbo.activity_settings TO iot_team_app_role;
 GRANT SELECT,INSERT,UPDATE ON dbo.activity_sessions TO iot_team_app_role;
 GRANT SELECT,INSERT,UPDATE ON dbo.activity_rules TO iot_team_app_role;
 GRANT SELECT,INSERT ON dbo.activity_events TO iot_team_app_role;
 GRANT SELECT,INSERT ON dbo.activity_exceptions TO iot_team_app_role;
 GRANT SELECT,INSERT ON dbo.activity_cycle_policies TO iot_team_app_role;
 GRANT SELECT,INSERT,UPDATE ON dbo.activity_quality TO iot_team_app_role;
 GRANT SELECT,INSERT ON dbo.activity_snapshots TO iot_team_app_role;
 GRANT SELECT,INSERT ON dbo.activity_clarifications TO iot_team_app_role;
END;
INSERT dbo.schema_versions(version,name) VALUES(35,N'Team activity, reporting discipline and versioned KPI contribution');
COMMIT;
GO
