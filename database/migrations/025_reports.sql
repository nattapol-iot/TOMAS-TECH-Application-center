SET XACT_ABORT ON;
SET ANSI_NULLS ON;
SET QUOTED_IDENTIFIER ON;
GO
IF EXISTS(SELECT 1 FROM dbo.schema_versions WHERE version=25) RETURN;
IF NOT EXISTS(SELECT 1 FROM dbo.schema_versions WHERE version=24) THROW 51280,'Apply migration 024 first.',1;
BEGIN TRANSACTION;
CREATE TABLE dbo.unified_reports (
 id bigint IDENTITY PRIMARY KEY,
 report_no nvarchar(40) NOT NULL UNIQUE,
 report_type nvarchar(20) NOT NULL CHECK(report_type IN(N'INSTALLATION',N'UAT',N'SERVICE',N'INSPECTION',N'POC')),
 inquiry_id bigint NULL REFERENCES dbo.inquiries(id),
 project_id bigint NULL REFERENCES dbo.projects(id),
 schedule_task_id bigint NULL REFERENCES dbo.schedule_tasks(id),
 current_revision int NOT NULL DEFAULT 0 CHECK(current_revision>=0),
 created_by bigint NOT NULL REFERENCES dbo.users(id),
 created_at datetimeoffset(0) NOT NULL DEFAULT SYSUTCDATETIME(),
 updated_at datetimeoffset(0) NOT NULL DEFAULT SYSUTCDATETIME(),
 row_version rowversion NOT NULL,
 CONSTRAINT CK_unified_report_source CHECK((inquiry_id IS NULL AND project_id IS NOT NULL) OR (inquiry_id IS NOT NULL AND project_id IS NULL))
);
CREATE TABLE dbo.unified_report_revisions (
 id bigint IDENTITY PRIMARY KEY,
 report_id bigint NOT NULL REFERENCES dbo.unified_reports(id),
 revision int NOT NULL CHECK(revision>=0),
 title nvarchar(500) NOT NULL,
 report_date date NOT NULL,
 locale nvarchar(5) NOT NULL CHECK(locale IN(N'en',N'th',N'ja')),
 body_json nvarchar(max) NOT NULL CHECK(ISJSON(body_json)=1),
 state nvarchar(30) NOT NULL DEFAULT N'DRAFT' CHECK(state IN(N'DRAFT',N'SUBMITTED',N'REVIEWED',N'APPROVED',N'AWAITING_CUSTOMER',N'COMPLETED',N'CHANGES_REQUESTED',N'VOID')),
 prepared_by bigint NOT NULL REFERENCES dbo.users(id),
 reviewer_id bigint NULL REFERENCES dbo.users(id),
 approver_id bigint NOT NULL REFERENCES dbo.users(id),
 submitted_at datetimeoffset(0) NULL,
 reviewed_at datetimeoffset(0) NULL,
 approved_at datetimeoffset(0) NULL,
 completed_at datetimeoffset(0) NULL,
 snapshot_json nvarchar(max) NULL,
 snapshot_sha256 char(64) NULL,
 decision_note nvarchar(2000) NOT NULL DEFAULT N'',
 created_at datetimeoffset(0) NOT NULL DEFAULT SYSUTCDATETIME(),
 updated_at datetimeoffset(0) NOT NULL DEFAULT SYSUTCDATETIME(),
 row_version rowversion NOT NULL,
 CONSTRAINT UQ_unified_report_revision UNIQUE(report_id,revision),
 CONSTRAINT CK_unified_report_reviewers CHECK(prepared_by<>approver_id AND (reviewer_id IS NULL OR (prepared_by<>reviewer_id AND reviewer_id<>approver_id))),
 CONSTRAINT CK_unified_report_snapshot CHECK((state NOT IN(N'APPROVED',N'AWAITING_CUSTOMER',N'COMPLETED')) OR (snapshot_json IS NOT NULL AND snapshot_sha256 IS NOT NULL AND approved_at IS NOT NULL)),
 CONSTRAINT CK_unified_report_snapshot_json CHECK(snapshot_json IS NULL OR ISJSON(snapshot_json)=1)
);
CREATE TABLE dbo.unified_report_customer_links (
 id bigint IDENTITY PRIMARY KEY,
 revision_id bigint NOT NULL REFERENCES dbo.unified_report_revisions(id),
 token_hash char(64) NOT NULL UNIQUE,
 expires_at datetimeoffset(0) NOT NULL,
 created_by bigint NOT NULL REFERENCES dbo.users(id),
 created_at datetimeoffset(0) NOT NULL DEFAULT SYSUTCDATETIME(),
 consumed_at datetimeoffset(0) NULL,
 revoked_at datetimeoffset(0) NULL
);
CREATE TABLE dbo.unified_report_acknowledgments (
 id bigint IDENTITY PRIMARY KEY,
 revision_id bigint NOT NULL UNIQUE REFERENCES dbo.unified_report_revisions(id),
 link_id bigint NOT NULL UNIQUE REFERENCES dbo.unified_report_customer_links(id),
 signer_name nvarchar(200) NOT NULL,
 signer_title nvarchar(200) NOT NULL,
 signer_company nvarchar(300) NOT NULL,
 stated_date date NOT NULL,
 consent_text nvarchar(1000) NOT NULL,
 mode nvarchar(30) NOT NULL CHECK(mode IN(N'ACKNOWLEDGMENT',N'DRAWN_SIGNATURE')),
 signature_png varbinary(max) NULL,
 signature_sha256 char(64) NULL,
 snapshot_sha256 char(64) NOT NULL,
 evidence_json nvarchar(max) NOT NULL CHECK(ISJSON(evidence_json)=1),
 evidence_sha256 char(64) NOT NULL,
 occurred_at datetimeoffset(0) NOT NULL DEFAULT SYSUTCDATETIME(),
 CONSTRAINT CK_report_ack_mark CHECK((mode=N'ACKNOWLEDGMENT' AND signature_png IS NULL AND signature_sha256 IS NULL) OR (mode=N'DRAWN_SIGNATURE' AND signature_png IS NOT NULL AND signature_sha256 IS NOT NULL))
);
CREATE INDEX IX_unified_report_source ON dbo.unified_reports(project_id,inquiry_id);
CREATE TABLE dbo.unified_report_signatures (
 id bigint IDENTITY PRIMARY KEY,
 revision_id bigint NOT NULL REFERENCES dbo.unified_report_revisions(id),
 actor_id bigint NOT NULL REFERENCES dbo.users(id),
 stage nvarchar(20) NOT NULL CHECK(stage IN(N'PREPARE',N'REVIEW',N'APPROVE')),
 specimen_id bigint NOT NULL REFERENCES dbo.signature_specimens(id),
 snapshot_json nvarchar(max) NOT NULL CHECK(ISJSON(snapshot_json)=1),
 snapshot_sha256 char(64) NOT NULL,
 evidence_json nvarchar(max) NOT NULL CHECK(ISJSON(evidence_json)=1),
 evidence_sha256 char(64) NOT NULL,
 occurred_at datetimeoffset(0) NOT NULL DEFAULT SYSUTCDATETIME(),
 CONSTRAINT UQ_unified_report_signature UNIQUE(revision_id,stage)
);
CREATE INDEX IX_unified_report_queue ON dbo.unified_report_revisions(state,reviewer_id,approver_id);
INSERT dbo.permissions(code,description) VALUES(N'report.write',N'Prepare revisioned reports'),(N'report.review',N'Review assigned reports'),(N'report.approve',N'Approve assigned reports');
INSERT dbo.role_permissions(role_id,permission_id)
 SELECT r.id,p.id FROM dbo.roles r CROSS JOIN dbo.permissions p
 WHERE (p.code=N'report.write' AND r.code IN(N'Engineer',N'Project Manager',N'Engineering Manager',N'Admin'))
 OR (p.code=N'report.review' AND r.code IN(N'Project Manager',N'Engineering Manager',N'Admin'))
 OR (p.code=N'report.approve' AND r.code IN(N'Engineering Manager',N'Admin'));
-- Same immutable-revision principle as site visits and signing, separate from
-- employee signature specimens: an external link proves possession, not Entra identity.
EXEC(N'CREATE TRIGGER dbo.tr_unified_report_revision_frozen ON dbo.unified_report_revisions AFTER UPDATE,DELETE AS
BEGIN
 SET NOCOUNT ON;
 IF EXISTS(SELECT 1 FROM deleted d LEFT JOIN inserted i ON i.id=d.id WHERE d.state=N''COMPLETED'' OR i.id IS NULL)
  THROW 51281,''Completed report revisions cannot be changed or deleted.'',1;
 IF EXISTS(SELECT 1 FROM deleted d JOIN inserted i ON i.id=d.id WHERE EXISTS(SELECT 1 FROM dbo.unified_report_signatures s WHERE s.revision_id=d.id) AND
 (i.title<>d.title OR i.body_json<>d.body_json OR i.report_date<>d.report_date OR i.locale<>d.locale OR i.prepared_by<>d.prepared_by OR ISNULL(i.reviewer_id,0)<>ISNULL(d.reviewer_id,0) OR i.approver_id<>d.approver_id OR i.report_id<>d.report_id OR i.revision<>d.revision))
  THROW 51285,''Signed report content requires a new revision.'',1;
 IF EXISTS(SELECT 1 FROM deleted d JOIN inserted i ON i.id=d.id WHERE d.state IN(N''APPROVED'',N''AWAITING_CUSTOMER'') AND
 (i.state NOT IN(N''APPROVED'',N''AWAITING_CUSTOMER'',N''COMPLETED'',N''VOID'') OR i.report_id<>d.report_id OR i.revision<>d.revision OR i.title<>d.title OR i.body_json<>d.body_json OR i.report_date<>d.report_date OR i.locale<>d.locale
 OR i.prepared_by<>d.prepared_by OR ISNULL(i.reviewer_id,0)<>ISNULL(d.reviewer_id,0) OR i.approver_id<>d.approver_id
 OR ISNULL(i.snapshot_json,N'''')<>ISNULL(d.snapshot_json,N'''') OR ISNULL(i.snapshot_sha256,'''')<>ISNULL(d.snapshot_sha256,'''')
 OR i.approved_at<>d.approved_at OR i.reviewed_at<>d.reviewed_at OR i.submitted_at<>d.submitted_at))
  THROW 51282,''Approved report content and internal approvals are frozen.'',1;
END');
EXEC(N'CREATE TRIGGER dbo.tr_unified_report_signature_immutable ON dbo.unified_report_signatures INSTEAD OF UPDATE,DELETE AS
BEGIN THROW 51284,''Internal report signature evidence is immutable.'',1; END');
EXEC(N'CREATE TRIGGER dbo.tr_unified_report_source_fixed ON dbo.unified_reports AFTER UPDATE,DELETE AS
BEGIN
 IF EXISTS(SELECT 1 FROM deleted d LEFT JOIN inserted i ON i.id=d.id WHERE i.id IS NULL OR i.report_no<>d.report_no OR i.report_type<>d.report_type OR ISNULL(i.inquiry_id,0)<>ISNULL(d.inquiry_id,0) OR ISNULL(i.project_id,0)<>ISNULL(d.project_id,0) OR ISNULL(i.schedule_task_id,0)<>ISNULL(d.schedule_task_id,0) OR i.created_by<>d.created_by)
 THROW 51286,''Report identity and source cannot change.'',1;
END');
EXEC(N'CREATE TRIGGER dbo.tr_unified_report_ack_immutable ON dbo.unified_report_acknowledgments INSTEAD OF UPDATE,DELETE AS
BEGIN THROW 51283,''Customer acknowledgment evidence is immutable.'',1; END');
IF DATABASE_PRINCIPAL_ID(N'iot_team_app_role') IS NOT NULL
BEGIN
 GRANT SELECT,INSERT,UPDATE ON dbo.unified_reports TO iot_team_app_role;
 GRANT SELECT,INSERT,UPDATE ON dbo.unified_report_revisions TO iot_team_app_role;
 GRANT SELECT,INSERT,UPDATE ON dbo.unified_report_customer_links TO iot_team_app_role;
 GRANT SELECT,INSERT ON dbo.unified_report_acknowledgments TO iot_team_app_role;
 GRANT SELECT,INSERT ON dbo.unified_report_signatures TO iot_team_app_role;
END;
INSERT dbo.schema_versions(version,name) VALUES(25,N'Unified revisioned reports and customer acknowledgment');
COMMIT;
