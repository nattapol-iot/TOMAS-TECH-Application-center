SET XACT_ABORT ON;
SET NOCOUNT ON;
SET ANSI_NULLS ON;
SET QUOTED_IDENTIFIER ON;
SET ANSI_PADDING ON;
SET ANSI_WARNINGS ON;
SET CONCAT_NULL_YIELDS_NULL ON;
SET ARITHABORT ON;
SET NUMERIC_ROUNDABORT OFF;
GO

IF EXISTS (SELECT 1 FROM dbo.schema_versions WHERE version = 3)
    THROW 51000, 'Migration 003 has already been applied.', 1;
GO

BEGIN TRANSACTION;

CREATE TABLE dbo.holidays (
    holiday_date date NOT NULL CONSTRAINT PK_holidays PRIMARY KEY,
    name nvarchar(200) NOT NULL,
    created_by bigint NOT NULL,
    CONSTRAINT FK_holidays_created_by FOREIGN KEY (created_by) REFERENCES dbo.users(id)
);

CREATE TABLE dbo.schedule_tasks (
    id bigint IDENTITY(1,1) NOT NULL CONSTRAINT PK_schedule_tasks PRIMARY KEY,
    project_id bigint NOT NULL,
    parent_id bigint NULL,
    sort_order int NOT NULL,
    kind nvarchar(20) NOT NULL,
    name nvarchar(500) NOT NULL,
    is_milestone bit NOT NULL CONSTRAINT DF_schedule_tasks_milestone DEFAULT 0,
    origin nvarchar(20) NOT NULL,
    created_by bigint NOT NULL,
    visibility nvarchar(20) NOT NULL,
    plan_start date NULL,
    plan_days int NOT NULL CONSTRAINT DF_schedule_tasks_plan_days DEFAULT 1,
    start_mode nvarchar(20) NOT NULL CONSTRAINT DF_schedule_tasks_start_mode DEFAULT N'manual',
    predecessor_id bigint NULL,
    lag_days int NOT NULL CONSTRAINT DF_schedule_tasks_lag DEFAULT 0,
    pic_external nvarchar(300) NOT NULL CONSTRAINT DF_schedule_tasks_pic_external DEFAULT N'',
    plan_man_days decimal(9,2) NOT NULL CONSTRAINT DF_schedule_tasks_plan_md DEFAULT 0,
    baseline_start date NULL,
    baseline_end date NULL,
    baseline_days int NOT NULL CONSTRAINT DF_schedule_tasks_baseline_days DEFAULT 0,
    baseline_rev int NOT NULL CONSTRAINT DF_schedule_tasks_baseline_rev DEFAULT 0,
    actual_start date NULL,
    actual_end date NULL,
    forecast_end date NULL,
    percent_done decimal(5,2) NOT NULL CONSTRAINT DF_schedule_tasks_percent DEFAULT 0,
    status nvarchar(30) NOT NULL CONSTRAINT DF_schedule_tasks_status DEFAULT N'Not Started',
    blocked_reason nvarchar(max) NULL,
    note nvarchar(max) NULL,
    actual_man_days decimal(9,2) NOT NULL CONSTRAINT DF_schedule_tasks_actual_md DEFAULT 0,
    updated_by bigint NOT NULL,
    created_at datetimeoffset(0) NOT NULL CONSTRAINT DF_schedule_tasks_created_at DEFAULT SYSUTCDATETIME(),
    updated_at datetimeoffset(0) NOT NULL CONSTRAINT DF_schedule_tasks_updated_at DEFAULT SYSUTCDATETIME(),
    deleted_at datetimeoffset(0) NULL,
    row_version rowversion NOT NULL,
    CONSTRAINT CK_schedule_tasks_kind CHECK (kind IN (N'phase', N'task', N'detail')),
    CONSTRAINT CK_schedule_tasks_origin CHECK (origin IN (N'PM', N'Member')),
    CONSTRAINT CK_schedule_tasks_visibility CHECK (visibility IN (N'Customer', N'Internal')),
    CONSTRAINT CK_schedule_tasks_values CHECK (plan_days >= 1 AND percent_done BETWEEN 0 AND 100 AND plan_man_days >= 0 AND actual_man_days >= 0),
    CONSTRAINT CK_schedule_tasks_status CHECK (status IN (N'Not Started', N'In Progress', N'Blocked', N'Done')),
    CONSTRAINT CK_schedule_tasks_no_self_reference CHECK (
        (parent_id IS NULL OR parent_id <> id) AND
        (predecessor_id IS NULL OR predecessor_id <> id)),
    CONSTRAINT FK_schedule_tasks_project FOREIGN KEY (project_id) REFERENCES dbo.projects(id),
    CONSTRAINT FK_schedule_tasks_parent FOREIGN KEY (parent_id) REFERENCES dbo.schedule_tasks(id),
    CONSTRAINT FK_schedule_tasks_predecessor FOREIGN KEY (predecessor_id) REFERENCES dbo.schedule_tasks(id),
    CONSTRAINT FK_schedule_tasks_created_by FOREIGN KEY (created_by) REFERENCES dbo.users(id),
    CONSTRAINT FK_schedule_tasks_updated_by FOREIGN KEY (updated_by) REFERENCES dbo.users(id)
);
CREATE INDEX IX_schedule_tasks_project ON dbo.schedule_tasks(project_id, parent_id, sort_order) WHERE deleted_at IS NULL;
CREATE INDEX IX_schedule_tasks_parent ON dbo.schedule_tasks(parent_id) INCLUDE (project_id) WHERE parent_id IS NOT NULL;
CREATE INDEX IX_schedule_tasks_predecessor ON dbo.schedule_tasks(predecessor_id) INCLUDE (project_id) WHERE predecessor_id IS NOT NULL;

CREATE TABLE dbo.schedule_task_pics (
    task_id bigint NOT NULL,
    user_id bigint NOT NULL,
    CONSTRAINT PK_schedule_task_pics PRIMARY KEY (task_id, user_id),
    CONSTRAINT FK_schedule_task_pics_task FOREIGN KEY (task_id) REFERENCES dbo.schedule_tasks(id),
    CONSTRAINT FK_schedule_task_pics_user FOREIGN KEY (user_id) REFERENCES dbo.users(id)
);
CREATE INDEX IX_schedule_task_pics_user ON dbo.schedule_task_pics(user_id, task_id);

CREATE TABLE dbo.schedule_updates (
    id bigint IDENTITY(1,1) NOT NULL CONSTRAINT PK_schedule_updates PRIMARY KEY,
    project_id bigint NOT NULL,
    task_id bigint NULL,
    actor_id bigint NOT NULL,
    field nvarchar(50) NOT NULL,
    from_value nvarchar(max) NULL,
    to_value nvarchar(max) NULL,
    comment nvarchar(max) NULL,
    request_days int NOT NULL CONSTRAINT DF_schedule_updates_request_days DEFAULT 0,
    answer nvarchar(20) NULL,
    answer_by bigint NULL,
    answer_note nvarchar(max) NULL,
    answered_at datetimeoffset(0) NULL,
    occurred_at datetimeoffset(0) NOT NULL CONSTRAINT DF_schedule_updates_occurred_at DEFAULT SYSUTCDATETIME(),
    CONSTRAINT CK_schedule_updates_request_days CHECK (request_days >= 0),
    CONSTRAINT CK_schedule_updates_answer CHECK (answer IS NULL OR answer IN (N'Accepted', N'Rejected')),
    CONSTRAINT FK_schedule_updates_project FOREIGN KEY (project_id) REFERENCES dbo.projects(id),
    CONSTRAINT FK_schedule_updates_task FOREIGN KEY (task_id) REFERENCES dbo.schedule_tasks(id),
    CONSTRAINT FK_schedule_updates_actor FOREIGN KEY (actor_id) REFERENCES dbo.users(id),
    CONSTRAINT FK_schedule_updates_answer_by FOREIGN KEY (answer_by) REFERENCES dbo.users(id)
);
CREATE INDEX IX_schedule_updates_project ON dbo.schedule_updates(project_id, occurred_at DESC);
CREATE INDEX IX_schedule_updates_task ON dbo.schedule_updates(task_id, occurred_at DESC) WHERE task_id IS NOT NULL;
CREATE INDEX IX_schedule_updates_pending ON dbo.schedule_updates(project_id, occurred_at DESC)
    INCLUDE (task_id, request_days, actor_id) WHERE answer IS NULL;

CREATE TABLE dbo.schedule_baselines (
    id bigint IDENTITY(1,1) NOT NULL CONSTRAINT PK_schedule_baselines PRIMARY KEY,
    project_id bigint NOT NULL,
    revision int NOT NULL,
    label nvarchar(200) NOT NULL,
    taken_at datetimeoffset(0) NOT NULL CONSTRAINT DF_schedule_baselines_taken_at DEFAULT SYSUTCDATETIME(),
    taken_by bigint NOT NULL,
    reason nvarchar(max) NOT NULL,
    task_count int NOT NULL,
    promised_finish date NULL,
    snapshot_json nvarchar(max) NOT NULL,
    CONSTRAINT UQ_schedule_baselines UNIQUE (project_id, revision),
    CONSTRAINT CK_schedule_baselines_snapshot CHECK (ISJSON(snapshot_json) = 1),
    CONSTRAINT FK_schedule_baselines_project FOREIGN KEY (project_id) REFERENCES dbo.projects(id),
    CONSTRAINT FK_schedule_baselines_taken_by FOREIGN KEY (taken_by) REFERENCES dbo.users(id)
);
CREATE INDEX IX_schedule_baselines_project_date ON dbo.schedule_baselines(project_id, taken_at DESC);

CREATE TABLE dbo.inquiry_attachments (
    id bigint IDENTITY(1,1) NOT NULL CONSTRAINT PK_inquiry_attachments PRIMARY KEY,
    inquiry_id bigint NOT NULL,
    name nvarchar(500) NOT NULL,
    category nvarchar(100) NOT NULL,
    content_type nvarchar(200) NOT NULL,
    size_bytes bigint NOT NULL,
    storage_key nvarchar(1000) NOT NULL,
    uploaded_by bigint NOT NULL,
    uploaded_at datetimeoffset(0) NOT NULL CONSTRAINT DF_inquiry_attachments_uploaded_at DEFAULT SYSUTCDATETIME(),
    deleted_at datetimeoffset(0) NULL,
    row_version rowversion NOT NULL,
    CONSTRAINT CK_inquiry_attachments_size CHECK (size_bytes >= 0),
    CONSTRAINT FK_inquiry_attachments_inquiry FOREIGN KEY (inquiry_id) REFERENCES dbo.inquiries(id),
    CONSTRAINT FK_inquiry_attachments_user FOREIGN KEY (uploaded_by) REFERENCES dbo.users(id)
);
CREATE INDEX IX_inquiry_attachments_inquiry ON dbo.inquiry_attachments(inquiry_id, uploaded_at DESC)
    INCLUDE (name, category, size_bytes) WHERE deleted_at IS NULL;

CREATE TABLE dbo.inquiry_meetings (
    id bigint IDENTITY(1,1) NOT NULL CONSTRAINT PK_inquiry_meetings PRIMARY KEY,
    inquiry_id bigint NOT NULL,
    meeting_date date NOT NULL,
    meeting_type nvarchar(100) NOT NULL,
    participants_json nvarchar(max) NOT NULL CONSTRAINT DF_inquiry_meetings_participants DEFAULT N'[]',
    requirement nvarchar(max) NULL,
    technical nvarchar(max) NULL,
    decision nvarchar(max) NULL,
    open_point nvarchar(max) NULL,
    action_item nvarchar(max) NULL,
    owner_id bigint NULL,
    due_date date NULL,
    attachment_id bigint NULL,
    created_by bigint NOT NULL,
    created_at datetimeoffset(0) NOT NULL CONSTRAINT DF_inquiry_meetings_created_at DEFAULT SYSUTCDATETIME(),
    row_version rowversion NOT NULL,
    CONSTRAINT CK_inquiry_meetings_participants CHECK (ISJSON(participants_json) = 1),
    CONSTRAINT FK_inquiry_meetings_inquiry FOREIGN KEY (inquiry_id) REFERENCES dbo.inquiries(id),
    CONSTRAINT FK_inquiry_meetings_owner FOREIGN KEY (owner_id) REFERENCES dbo.users(id),
    CONSTRAINT FK_inquiry_meetings_attachment FOREIGN KEY (attachment_id) REFERENCES dbo.inquiry_attachments(id),
    CONSTRAINT FK_inquiry_meetings_created_by FOREIGN KEY (created_by) REFERENCES dbo.users(id)
);
CREATE INDEX IX_inquiry_meetings_inquiry ON dbo.inquiry_meetings(inquiry_id, meeting_date DESC)
    INCLUDE (owner_id, due_date, attachment_id);
CREATE INDEX IX_inquiry_meetings_attachment ON dbo.inquiry_meetings(attachment_id) WHERE attachment_id IS NOT NULL;

CREATE TABLE dbo.project_docs (
    id bigint IDENTITY(1,1) NOT NULL CONSTRAINT PK_project_docs PRIMARY KEY,
    project_id bigint NOT NULL,
    folder_code char(2) NOT NULL,
    name nvarchar(500) NOT NULL,
    document_type nvarchar(100) NOT NULL,
    content_type nvarchar(200) NOT NULL,
    size_bytes bigint NOT NULL,
    storage_key nvarchar(1000) NOT NULL,
    storage_key_hash AS (CONVERT(binary(32), HASHBYTES('SHA2_256', storage_key))) PERSISTED,
    provider_item_id nvarchar(500) NULL,
    provider_etag nvarchar(500) NULL,
    uploaded_by bigint NOT NULL,
    uploaded_at datetimeoffset(0) NOT NULL CONSTRAINT DF_project_docs_uploaded_at DEFAULT SYSUTCDATETIME(),
    remark nvarchar(max) NULL,
    deleted_at datetimeoffset(0) NULL,
    row_version rowversion NOT NULL,
    CONSTRAINT UQ_project_docs_storage_hash UNIQUE (storage_key_hash),
    CONSTRAINT FK_project_docs_project FOREIGN KEY (project_id) REFERENCES dbo.projects(id),
    CONSTRAINT FK_project_docs_folder FOREIGN KEY (project_id, folder_code) REFERENCES dbo.project_folders(project_id, folder_code),
    CONSTRAINT FK_project_docs_uploaded_by FOREIGN KEY (uploaded_by) REFERENCES dbo.users(id)
);
CREATE INDEX IX_project_docs_search ON dbo.project_docs(project_id, folder_code, name) WHERE deleted_at IS NULL;

CREATE TABLE dbo.notifications (
    id bigint IDENTITY(1,1) NOT NULL CONSTRAINT PK_notifications PRIMARY KEY,
    user_id bigint NOT NULL,
    kind nvarchar(100) NOT NULL,
    title nvarchar(300) NOT NULL,
    detail nvarchar(max) NOT NULL,
    entity_type nvarchar(50) NULL,
    entity_id bigint NULL,
    is_read bit NOT NULL CONSTRAINT DF_notifications_is_read DEFAULT 0,
    created_at datetimeoffset(0) NOT NULL CONSTRAINT DF_notifications_created_at DEFAULT SYSUTCDATETIME(),
    read_at datetimeoffset(0) NULL,
    CONSTRAINT FK_notifications_user FOREIGN KEY (user_id) REFERENCES dbo.users(id)
);
CREATE INDEX IX_notifications_user ON dbo.notifications(user_id, is_read, created_at DESC);
GO

CREATE OR ALTER TRIGGER dbo.trg_schedule_tasks_consistency
ON dbo.schedule_tasks
AFTER INSERT, UPDATE
AS
BEGIN
    SET NOCOUNT ON;

    IF EXISTS (
        SELECT 1
        FROM inserted i
        INNER JOIN dbo.schedule_tasks p ON p.id = i.parent_id
        WHERE p.project_id <> i.project_id OR p.deleted_at IS NOT NULL
    )
        THROW 51003, 'A schedule task parent must be an active task in the same project.', 1;

    IF EXISTS (
        SELECT 1
        FROM inserted i
        INNER JOIN dbo.schedule_tasks p ON p.id = i.predecessor_id
        WHERE p.project_id <> i.project_id OR p.deleted_at IS NOT NULL
    )
        THROW 51004, 'A schedule task predecessor must be an active task in the same project.', 1;

    -- Project changes must not strand existing children or dependants in another project.
    IF EXISTS (
        SELECT 1
        FROM inserted i
        INNER JOIN dbo.schedule_tasks child ON child.parent_id = i.id
        WHERE child.project_id <> i.project_id
           OR (i.deleted_at IS NOT NULL AND child.deleted_at IS NULL)
    )
        THROW 51005, 'A schedule task cannot move projects or be deleted while active children reference it.', 1;

    IF EXISTS (
        SELECT 1
        FROM inserted i
        INNER JOIN dbo.schedule_tasks dependant ON dependant.predecessor_id = i.id
        WHERE dependant.project_id <> i.project_id
           OR (i.deleted_at IS NOT NULL AND dependant.deleted_at IS NULL)
    )
        THROW 51006, 'A schedule task cannot move projects or be deleted while active dependants reference it.', 1;

    DECLARE @has_cycle bit = 0;

    ;WITH parent_chain AS (
        SELECT i.id AS root_id, i.parent_id AS next_id
        FROM inserted i
        WHERE i.parent_id IS NOT NULL

        UNION ALL

        SELECT c.root_id, t.parent_id
        FROM parent_chain c
        INNER JOIN dbo.schedule_tasks t ON t.id = c.next_id
        WHERE c.next_id <> c.root_id AND t.parent_id IS NOT NULL
    )
    SELECT TOP (1) @has_cycle = 1
    FROM parent_chain
    WHERE next_id = root_id
    OPTION (MAXRECURSION 32767);

    IF @has_cycle = 1
        THROW 51007, 'A schedule task parent relationship cannot contain a cycle.', 1;

    SET @has_cycle = 0;

    ;WITH predecessor_chain AS (
        SELECT i.id AS root_id, i.predecessor_id AS next_id
        FROM inserted i
        WHERE i.predecessor_id IS NOT NULL

        UNION ALL

        SELECT c.root_id, t.predecessor_id
        FROM predecessor_chain c
        INNER JOIN dbo.schedule_tasks t ON t.id = c.next_id
        WHERE c.next_id <> c.root_id AND t.predecessor_id IS NOT NULL
    )
    SELECT TOP (1) @has_cycle = 1
    FROM predecessor_chain
    WHERE next_id = root_id
    OPTION (MAXRECURSION 32767);

    IF @has_cycle = 1
        THROW 51008, 'A schedule task predecessor relationship cannot contain a cycle.', 1;
END;
GO

CREATE OR ALTER TRIGGER dbo.trg_schedule_updates_insert_consistency
ON dbo.schedule_updates
AFTER INSERT
AS
BEGIN
    SET NOCOUNT ON;

    IF EXISTS (
        SELECT 1
        FROM inserted i
        INNER JOIN dbo.schedule_tasks t ON t.id = i.task_id
        WHERE t.project_id <> i.project_id OR t.deleted_at IS NOT NULL
    )
        THROW 51009, 'A schedule update task must be an active task in the same project.', 1;

    IF EXISTS (
        SELECT 1
        FROM inserted
        WHERE answer IS NOT NULL OR answer_by IS NOT NULL OR answer_note IS NOT NULL OR answered_at IS NOT NULL
    )
        THROW 51010, 'A schedule update must be created unanswered.', 1;
END;
GO

CREATE OR ALTER TRIGGER dbo.trg_inquiry_meetings_attachment_consistency
ON dbo.inquiry_meetings
AFTER INSERT, UPDATE
AS
BEGIN
    SET NOCOUNT ON;

    IF EXISTS (
        SELECT 1
        FROM inserted i
        INNER JOIN dbo.inquiry_attachments a ON a.id = i.attachment_id
        WHERE a.inquiry_id <> i.inquiry_id OR a.deleted_at IS NOT NULL
    )
        THROW 51011, 'A meeting attachment must be an active attachment on the same inquiry.', 1;
END;
GO

CREATE OR ALTER TRIGGER dbo.trg_inquiry_attachments_meeting_consistency
ON dbo.inquiry_attachments
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;

    IF EXISTS (
        SELECT 1
        FROM inserted a
        INNER JOIN dbo.inquiry_meetings m ON m.attachment_id = a.id
        WHERE m.inquiry_id <> a.inquiry_id OR a.deleted_at IS NOT NULL
    )
        THROW 51016, 'An attachment referenced by a meeting cannot move inquiries or be deleted.', 1;
END;
GO

CREATE OR ALTER TRIGGER dbo.trg_schedule_updates_append_only
ON dbo.schedule_updates
INSTEAD OF UPDATE, DELETE
AS
BEGIN
    SET NOCOUNT ON;

    IF EXISTS (SELECT 1 FROM deleted) AND NOT EXISTS (SELECT 1 FROM inserted)
        THROW 51012, 'Schedule updates cannot be deleted.', 1;

    -- Every request field is immutable. The only supported update is the first answer.
    IF EXISTS (
        SELECT 1
        FROM inserted i
        INNER JOIN deleted d ON d.id = i.id
        WHERE i.project_id <> d.project_id
           OR (i.task_id <> d.task_id OR (i.task_id IS NULL AND d.task_id IS NOT NULL) OR (i.task_id IS NOT NULL AND d.task_id IS NULL))
           OR i.actor_id <> d.actor_id
           OR i.field <> d.field
           OR (i.from_value <> d.from_value OR (i.from_value IS NULL AND d.from_value IS NOT NULL) OR (i.from_value IS NOT NULL AND d.from_value IS NULL))
           OR (i.to_value <> d.to_value OR (i.to_value IS NULL AND d.to_value IS NOT NULL) OR (i.to_value IS NOT NULL AND d.to_value IS NULL))
           OR (i.comment <> d.comment OR (i.comment IS NULL AND d.comment IS NOT NULL) OR (i.comment IS NOT NULL AND d.comment IS NULL))
           OR i.request_days <> d.request_days
           OR i.occurred_at <> d.occurred_at
    )
        THROW 51013, 'Schedule update request fields are immutable.', 1;

    IF EXISTS (
        SELECT 1
        FROM inserted i
        INNER JOIN deleted d ON d.id = i.id
        WHERE d.answer IS NOT NULL
           OR d.answer_by IS NOT NULL
           OR d.answer_note IS NOT NULL
           OR d.answered_at IS NOT NULL
           OR i.answer IS NULL
           OR i.answer NOT IN (N'Accepted', N'Rejected')
           OR i.answer_by IS NULL
           OR i.answered_at IS NULL
    )
        THROW 51014, 'A schedule update may be answered exactly once as Accepted or Rejected.', 1;

    UPDATE u
       SET answer = i.answer,
           answer_by = i.answer_by,
           answer_note = i.answer_note,
           answered_at = i.answered_at
      FROM dbo.schedule_updates u
      INNER JOIN inserted i ON i.id = u.id;
END;
GO

CREATE OR ALTER TRIGGER dbo.trg_audit_log_append_only
ON dbo.audit_log
INSTEAD OF UPDATE, DELETE
AS
BEGIN
    SET NOCOUNT ON;
    THROW 51015, 'Audit records are append-only.', 1;
END;
GO

INSERT INTO dbo.schema_versions(version, name) VALUES (3, N'Project schedule, documents and notifications');
COMMIT TRANSACTION;
GO
