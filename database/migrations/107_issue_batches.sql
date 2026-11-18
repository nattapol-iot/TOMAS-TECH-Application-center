-- Migration 107: customer issue batches (Projects > Punchlist).
--
-- The team asked (owner, 2026-11-18) for the Punchlist to work like their Issues Table: one batch per
-- customer report, many issues typed in a grid with screenshots, each issue planned in hours and closed
-- with the hours it really took and what was done. The owner's decisions:
--
--   * A Problem starts at once. A Requirement waits for a PM / Lead only when someone else (an
--     Engineer) typed it; there is no acknowledgment step.
--   * Hours are the unit; 8 hours count as one man-day wherever load is added up.
--   * Issues are kept apart from the project plan: they show on the Plan Gantt, My Work and the team's
--     load, but never move a project's progress, health or dates.
--   * A batch may come from a project that is closed or that this system never had: project_id is then
--     NULL and external_project names it.
--
-- dbo.issue_batches      one customer report: its number IS-YYYYMM-NNNN, project or outside project,
--                        the day it was reported. closed_at is set by the API when every issue in it is
--                        Done, Cancelled or Rejected, and cleared when one opens again.
-- dbo.issue_items        one issue in a batch, line_no in the batch's order.
--                        state  Approval   a Requirement waiting for a PM / Lead
--                               Open       to do (approved, or a Problem)
--                               Doing      started (started_on)
--                               Done       closed by its PIC: done_on, actual_hours, fix_note
--                               Cancelled  dropped, reason says why
--                               Rejected   a Requirement a PM / Lead turned down, reason says why
-- dbo.issue_item_images  screenshots of an issue, kept in document storage like inquiry attachments.
--
-- The old one-at-a-time issues (dbo.resource_tasks, is_issue = 1) are left as they are; the Punchlist
-- shows them in a tab of their own.

SET XACT_ABORT ON;
SET NOCOUNT ON;
SET ANSI_NULLS ON;
SET QUOTED_IDENTIFIER ON;
GO

IF NOT EXISTS (SELECT 1 FROM dbo.schema_versions WHERE version = 106)
    THROW 51107, 'Migration 106 must be applied before migration 107.', 1;
GO

BEGIN TRANSACTION;

IF OBJECT_ID(N'dbo.issue_batches', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.issue_batches (
        id bigint IDENTITY(1,1) NOT NULL CONSTRAINT PK_issue_batches PRIMARY KEY,
        batch_no nvarchar(20) NOT NULL,
        project_id bigint NULL,
        external_project nvarchar(200) NOT NULL CONSTRAINT DF_issue_batches_external_project DEFAULT N'',
        customer_name nvarchar(200) NOT NULL CONSTRAINT DF_issue_batches_customer_name DEFAULT N'',
        reported_on date NOT NULL,
        reported_by nvarchar(200) NOT NULL CONSTRAINT DF_issue_batches_reported_by DEFAULT N'',
        note nvarchar(2000) NOT NULL CONSTRAINT DF_issue_batches_note DEFAULT N'',
        created_by bigint NOT NULL,
        created_at datetimeoffset(0) NOT NULL CONSTRAINT DF_issue_batches_created_at DEFAULT SYSUTCDATETIME(),
        updated_at datetimeoffset(0) NOT NULL CONSTRAINT DF_issue_batches_updated_at DEFAULT SYSUTCDATETIME(),
        closed_at datetimeoffset(0) NULL,
        row_version rowversion NOT NULL,
        CONSTRAINT UQ_issue_batches_batch_no UNIQUE (batch_no),
        CONSTRAINT FK_issue_batches_project FOREIGN KEY (project_id) REFERENCES dbo.projects(id),
        CONSTRAINT FK_issue_batches_created_by FOREIGN KEY (created_by) REFERENCES dbo.users(id),
        CONSTRAINT CK_issue_batches_source CHECK (project_id IS NOT NULL OR LEN(external_project) > 0)
    );
    CREATE INDEX IX_issue_batches_project ON dbo.issue_batches(project_id, reported_on DESC);
END;

IF OBJECT_ID(N'dbo.issue_items', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.issue_items (
        id bigint IDENTITY(1,1) NOT NULL CONSTRAINT PK_issue_items PRIMARY KEY,
        batch_id bigint NOT NULL,
        line_no int NOT NULL,
        category nvarchar(20) NOT NULL,
        function_name nvarchar(200) NOT NULL CONSTRAINT DF_issue_items_function_name DEFAULT N'',
        description nvarchar(4000) NOT NULL,
        assignee_id bigint NULL,
        plan_start date NULL,
        plan_end date NULL,
        plan_hours decimal(7,2) NULL,
        state nvarchar(20) NOT NULL,
        started_on date NULL,
        done_on date NULL,
        actual_hours decimal(7,2) NULL,
        fix_note nvarchar(4000) NOT NULL CONSTRAINT DF_issue_items_fix_note DEFAULT N'',
        reason nvarchar(2000) NOT NULL CONSTRAINT DF_issue_items_reason DEFAULT N'',
        decided_by bigint NULL,
        decided_at datetimeoffset(0) NULL,
        created_by bigint NOT NULL,
        created_at datetimeoffset(0) NOT NULL CONSTRAINT DF_issue_items_created_at DEFAULT SYSUTCDATETIME(),
        updated_by bigint NOT NULL,
        updated_at datetimeoffset(0) NOT NULL CONSTRAINT DF_issue_items_updated_at DEFAULT SYSUTCDATETIME(),
        row_version rowversion NOT NULL,
        CONSTRAINT UQ_issue_items_line UNIQUE (batch_id, line_no),
        CONSTRAINT FK_issue_items_batch FOREIGN KEY (batch_id) REFERENCES dbo.issue_batches(id),
        CONSTRAINT FK_issue_items_assignee FOREIGN KEY (assignee_id) REFERENCES dbo.users(id),
        CONSTRAINT FK_issue_items_decided_by FOREIGN KEY (decided_by) REFERENCES dbo.users(id),
        CONSTRAINT FK_issue_items_created_by FOREIGN KEY (created_by) REFERENCES dbo.users(id),
        CONSTRAINT FK_issue_items_updated_by FOREIGN KEY (updated_by) REFERENCES dbo.users(id),
        CONSTRAINT CK_issue_items_category CHECK (category IN (N'Problem', N'Requirement')),
        CONSTRAINT CK_issue_items_state CHECK (state IN (N'Approval', N'Open', N'Doing', N'Done', N'Cancelled', N'Rejected')),
        CONSTRAINT CK_issue_items_line CHECK (line_no > 0),
        CONSTRAINT CK_issue_items_plan_dates CHECK (plan_start IS NULL OR plan_end IS NULL OR plan_end >= plan_start),
        CONSTRAINT CK_issue_items_plan_hours CHECK (plan_hours IS NULL OR plan_hours BETWEEN 0 AND 9999),
        CONSTRAINT CK_issue_items_actual_hours CHECK (actual_hours IS NULL OR actual_hours BETWEEN 0 AND 9999),
        CONSTRAINT CK_issue_items_done CHECK (state <> N'Done' OR (done_on IS NOT NULL AND actual_hours IS NOT NULL))
    );
    CREATE INDEX IX_issue_items_assignee ON dbo.issue_items(assignee_id, state)
        INCLUDE (batch_id, plan_start, plan_end, plan_hours);
END;

IF OBJECT_ID(N'dbo.issue_item_images', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.issue_item_images (
        id bigint IDENTITY(1,1) NOT NULL CONSTRAINT PK_issue_item_images PRIMARY KEY,
        item_id bigint NOT NULL,
        name nvarchar(500) NOT NULL,
        content_type nvarchar(200) NOT NULL,
        size_bytes bigint NOT NULL,
        storage_key nvarchar(1000) NOT NULL,
        sha256 char(64) NULL,
        uploaded_by bigint NOT NULL,
        uploaded_at datetimeoffset(0) NOT NULL CONSTRAINT DF_issue_item_images_uploaded_at DEFAULT SYSUTCDATETIME(),
        deleted_at datetimeoffset(0) NULL,
        row_version rowversion NOT NULL,
        CONSTRAINT FK_issue_item_images_item FOREIGN KEY (item_id) REFERENCES dbo.issue_items(id),
        CONSTRAINT FK_issue_item_images_uploaded_by FOREIGN KEY (uploaded_by) REFERENCES dbo.users(id),
        CONSTRAINT CK_issue_item_images_size CHECK (size_bytes >= 0),
        CONSTRAINT CK_issue_item_images_sha256 CHECK (sha256 IS NULL OR (LEN(sha256) = 64 AND sha256 NOT LIKE '%[^0-9A-Fa-f]%'))
    );
    CREATE INDEX IX_issue_item_images_item ON dbo.issue_item_images(item_id) WHERE deleted_at IS NULL;
END;

IF DATABASE_PRINCIPAL_ID(N'iot_team_app_role') IS NOT NULL
BEGIN
    GRANT SELECT, INSERT, UPDATE ON OBJECT::dbo.issue_batches TO [iot_team_app_role];
    GRANT SELECT, INSERT, UPDATE ON OBJECT::dbo.issue_items TO [iot_team_app_role];
    GRANT SELECT, INSERT, UPDATE ON OBJECT::dbo.issue_item_images TO [iot_team_app_role];
END;

COMMIT TRANSACTION;
GO

IF NOT EXISTS (SELECT 1 FROM dbo.schema_versions WHERE version = 107)
    INSERT dbo.schema_versions(version, name)
    VALUES (107, N'Customer issue batches');
GO
