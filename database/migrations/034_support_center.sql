SET XACT_ABORT ON;
SET ANSI_NULLS ON;
SET QUOTED_IDENTIFIER ON;
GO
IF EXISTS(SELECT 1 FROM dbo.schema_versions WHERE version=34) RETURN;
IF NOT EXISTS(SELECT 1 FROM dbo.schema_versions WHERE version=33) THROW 51340,'Apply migration 033 first.',1;
BEGIN TRANSACTION;
CREATE TABLE dbo.support_categories (
 code nvarchar(30) NOT NULL PRIMARY KEY,
 sort_order int NOT NULL
);
INSERT dbo.support_categories VALUES(N'Application',1),(N'Equipment',2),(N'Documents',3),(N'Coordination',4),(N'Other',5);
CREATE TABLE dbo.support_members (
 category_code nvarchar(30) NOT NULL REFERENCES dbo.support_categories(code),
 user_id bigint NOT NULL REFERENCES dbo.users(id),
 can_award bit NOT NULL DEFAULT 0,
 updated_by bigint NOT NULL REFERENCES dbo.users(id),
 updated_at datetimeoffset(0) NOT NULL DEFAULT SYSUTCDATETIME(),
 PRIMARY KEY(category_code,user_id)
);
CREATE TABLE dbo.support_tickets (
 id bigint IDENTITY PRIMARY KEY,
 ticket_no nvarchar(50) NULL UNIQUE,
 reporter_id bigint NOT NULL REFERENCES dbo.users(id),
 category_code nvarchar(30) NOT NULL REFERENCES dbo.support_categories(code),
 assignee_id bigint NULL REFERENCES dbo.users(id),
 subject nvarchar(160) NOT NULL,
 description nvarchar(max) NOT NULL CHECK(LEN(description) BETWEEN 10 AND 5000),
 impact nvarchar(20) NOT NULL CHECK(impact IN(N'CanWork',N'PartlyBlocked',N'Blocked')),
 priority nvarchar(20) NOT NULL DEFAULT N'Normal' CHECK(priority IN(N'Low',N'Normal',N'High',N'Urgent')),
 status nvarchar(30) NOT NULL DEFAULT N'New' CHECK(status IN(N'New',N'Acknowledged',N'InProgress',N'WaitingForReporter',N'Resolved',N'Closed',N'Cancelled')),
 context_json nvarchar(2000) NOT NULL DEFAULT N'{}' CHECK(ISJSON(context_json)=1),
 duplicate_of bigint NULL REFERENCES dbo.support_tickets(id),
 request_key uniqueidentifier NOT NULL,
 request_hash char(64) NOT NULL,
 created_at datetimeoffset(0) NOT NULL DEFAULT SYSUTCDATETIME(),
 updated_at datetimeoffset(0) NOT NULL DEFAULT SYSUTCDATETIME(),
 resolved_at datetimeoffset(0) NULL,
 closed_at datetimeoffset(0) NULL,
 row_version rowversion NOT NULL,
 UNIQUE(reporter_id,request_key),
 CHECK(duplicate_of IS NULL OR duplicate_of<>id)
);
CREATE INDEX IX_support_mine ON dbo.support_tickets(reporter_id,updated_at DESC,id DESC);
CREATE INDEX IX_support_queue ON dbo.support_tickets(category_code,status,updated_at DESC,id DESC);
CREATE TABLE dbo.support_events (
 id bigint IDENTITY PRIMARY KEY,
 ticket_id bigint NOT NULL REFERENCES dbo.support_tickets(id),
 actor_id bigint NOT NULL REFERENCES dbo.users(id),
 kind nvarchar(40) NOT NULL,
 body nvarchar(max) NOT NULL DEFAULT N'' CHECK(LEN(body)<=5000),
 is_internal bit NOT NULL DEFAULT 0,
 details_json nvarchar(max) NOT NULL DEFAULT N'{}' CHECK(ISJSON(details_json)=1),
 request_key uniqueidentifier NOT NULL,
 request_hash char(64) NOT NULL,
 created_at datetimeoffset(0) NOT NULL DEFAULT SYSUTCDATETIME(),
 UNIQUE(ticket_id,actor_id,request_key)
);
CREATE INDEX IX_support_events ON dbo.support_events(ticket_id,id);
CREATE TABLE dbo.support_attachments (
 id bigint IDENTITY PRIMARY KEY,
 ticket_id bigint NOT NULL REFERENCES dbo.support_tickets(id),
 uploaded_by bigint NOT NULL REFERENCES dbo.users(id),
 name nvarchar(500) NOT NULL,
 content_type nvarchar(100) NOT NULL,
 storage_key nvarchar(1000) NOT NULL,
 size_bytes bigint NOT NULL CHECK(size_bytes>0 AND size_bytes<=10485760),
 sha256 char(64) NOT NULL,
 is_internal bit NOT NULL DEFAULT 0,
 validation_state nvarchar(30) NOT NULL DEFAULT N'TypeValidated' CHECK(validation_state=N'TypeValidated'),
 request_key uniqueidentifier NOT NULL,
 created_at datetimeoffset(0) NOT NULL DEFAULT SYSUTCDATETIME(),
 UNIQUE(ticket_id,uploaded_by,request_key)
);
CREATE TABLE dbo.support_recognition (
 ticket_id bigint NOT NULL PRIMARY KEY REFERENCES dbo.support_tickets(id),
 evaluator_id bigint NOT NULL REFERENCES dbo.users(id),
 policy_version int NOT NULL DEFAULT 1 CHECK(policy_version=1),
 useful bit NOT NULL,
 detailed bit NOT NULL,
 actionable bit NOT NULL,
 points int NOT NULL,
 message nvarchar(1000) NOT NULL,
 created_at datetimeoffset(0) NOT NULL DEFAULT SYSUTCDATETIME(),
 updated_at datetimeoffset(0) NOT NULL DEFAULT SYSUTCDATETIME(),
 row_version rowversion NOT NULL,
 CHECK((useful=0 AND detailed=0 AND actionable=0 AND points=0) OR (useful=1 AND points=5+3*CONVERT(int,detailed)+2*CONVERT(int,actionable)))
);
EXEC(N'CREATE TRIGGER dbo.tr_support_events_immutable ON dbo.support_events INSTEAD OF UPDATE,DELETE AS BEGIN THROW 51341,''Support history is append-only.'',1; END');
INSERT dbo.permissions(code,description) VALUES
 (N'support.create',N'Report application and other problems'),
 (N'support.read.own',N'Read own support tickets and contribution points'),
 (N'support.manage',N'Manage Support Center and category membership'),
 (N'support.recognition.adjust',N'Adjust support contribution points with an audited reason');
INSERT dbo.role_permissions(role_id,permission_id)
 SELECT r.id,p.id FROM dbo.roles r CROSS JOIN dbo.permissions p
 WHERE p.code IN(N'support.create',N'support.read.own') OR (r.code=N'Admin' AND p.code IN(N'support.manage',N'support.recognition.adjust'));
IF DATABASE_PRINCIPAL_ID(N'iot_team_app_role') IS NOT NULL BEGIN
 GRANT SELECT ON dbo.support_categories TO iot_team_app_role;
 GRANT SELECT,INSERT,UPDATE,DELETE ON dbo.support_members TO iot_team_app_role;
 GRANT SELECT,INSERT,UPDATE ON dbo.support_tickets TO iot_team_app_role;
 GRANT SELECT,INSERT ON dbo.support_events TO iot_team_app_role;
 GRANT SELECT,INSERT ON dbo.support_attachments TO iot_team_app_role;
 GRANT SELECT,INSERT,UPDATE ON dbo.support_recognition TO iot_team_app_role;
END;
INSERT dbo.schema_versions(version,name) VALUES(34,N'Support Center and reporter contribution points');
COMMIT;
