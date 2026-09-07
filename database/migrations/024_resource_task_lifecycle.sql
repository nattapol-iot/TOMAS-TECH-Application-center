SET XACT_ABORT ON;
SET ANSI_NULLS ON;
SET QUOTED_IDENTIFIER ON;
GO
IF EXISTS(SELECT 1 FROM dbo.schema_versions WHERE version=24) RETURN;
IF NOT EXISTS(SELECT 1 FROM dbo.schema_versions WHERE version=23) THROW 51270,'Apply migration 023 first.',1;
BEGIN TRANSACTION;
-- Project approved plans remain in schedule_tasks. This row is the request,
-- acknowledgment and customer-issue lifecycle, not a second project schedule.
CREATE TABLE dbo.resource_tasks (
 id bigint IDENTITY PRIMARY KEY,
 inquiry_id bigint NULL REFERENCES dbo.inquiries(id),
 project_id bigint NULL REFERENCES dbo.projects(id),
 schedule_task_id bigint NULL REFERENCES dbo.schedule_tasks(id),
 title nvarchar(500) NOT NULL,
 description nvarchar(4000) NOT NULL DEFAULT N'',
 is_issue bit NOT NULL DEFAULT 0,
 reporter nvarchar(200) NOT NULL DEFAULT N'',
 priority nvarchar(20) NOT NULL DEFAULT N'Normal',
 state nvarchar(30) NOT NULL DEFAULT N'PendingApproval',
 assignee_id bigint NOT NULL REFERENCES dbo.users(id),
 plan_start date NULL, plan_end date NULL, man_days decimal(12,2) NULL,
 pending_plan nvarchar(max) NULL,
 proposed_by bigint NOT NULL REFERENCES dbo.users(id),
 approved_by bigint NULL REFERENCES dbo.users(id),
 approved_at datetimeoffset(0) NULL,
 acknowledged_at datetimeoffset(0) NULL,
 decision_note nvarchar(2000) NOT NULL DEFAULT N'',
 percent_done decimal(5,2) NOT NULL DEFAULT 0,
 execution_status nvarchar(30) NOT NULL DEFAULT N'Not Started',
 actual_start date NULL, actual_end date NULL,
 created_by bigint NOT NULL REFERENCES dbo.users(id),
 created_at datetimeoffset(0) NOT NULL DEFAULT SYSUTCDATETIME(),
 updated_at datetimeoffset(0) NOT NULL DEFAULT SYSUTCDATETIME(),
 row_version rowversion NOT NULL,
 CONSTRAINT CK_resource_task_source CHECK ((inquiry_id IS NOT NULL AND project_id IS NULL AND schedule_task_id IS NULL AND is_issue=0) OR (inquiry_id IS NULL AND project_id IS NOT NULL)),
 CONSTRAINT CK_resource_task_state CHECK (state IN(N'PendingApproval',N'Approved',N'Rejected',N'Closed')),
 CONSTRAINT CK_resource_task_priority CHECK (priority IN(N'Low',N'Normal',N'High',N'Urgent')),
 CONSTRAINT CK_resource_task_json CHECK (pending_plan IS NULL OR ISJSON(pending_plan)=1),
 CONSTRAINT CK_resource_task_progress CHECK (percent_done BETWEEN 0 AND 100),
 CONSTRAINT CK_resource_task_dates CHECK (plan_end>=plan_start AND man_days>=0)
);
CREATE UNIQUE INDEX UX_resource_task_schedule ON dbo.resource_tasks(schedule_task_id) WHERE schedule_task_id IS NOT NULL;
CREATE INDEX IX_resource_task_inquiry ON dbo.resource_tasks(inquiry_id,state);
CREATE INDEX IX_resource_task_assignee ON dbo.resource_tasks(assignee_id,state);
-- Explicit switch, retaining the old aggregate value for history. Task mode is
-- activated only when the planner approves the first detailed inquiry task.
CREATE TABLE dbo.resource_task_sources (
 inquiry_id bigint PRIMARY KEY REFERENCES dbo.inquiries(id),
 activated_by bigint NOT NULL REFERENCES dbo.users(id),
 activated_at datetimeoffset(0) NOT NULL DEFAULT SYSUTCDATETIME()
);
IF DATABASE_PRINCIPAL_ID(N'iot_team_app_role') IS NOT NULL
BEGIN
 GRANT SELECT,INSERT,UPDATE ON dbo.resource_tasks TO iot_team_app_role;
 GRANT SELECT,INSERT ON dbo.resource_task_sources TO iot_team_app_role;
END;
INSERT dbo.schema_versions(version,name) VALUES(24,N'Resource task approval, member acknowledgment and project punchlist');
COMMIT;
