SET XACT_ABORT ON;
SET NOCOUNT ON;
GO

IF EXISTS (SELECT 1 FROM dbo.schema_versions WHERE version = 7)
    THROW 51100, 'Migration 007 has already been applied.', 1;

IF NOT EXISTS (SELECT 1 FROM dbo.schema_versions WHERE version = 6)
    THROW 51101, 'Migration 006 must be applied before migration 007.', 1;
GO

BEGIN TRANSACTION;
GO

-- schedule_updates is append-only to the application role. This owner-executed
-- procedure is the only supported path for answering a day request: it locks
-- the request and task together, enforces optimistic concurrency, and commits
-- the answer and any accepted plan extension as one unit.
-- @answer_by is an actor resolved from the authenticated API request. It is
-- not a database-authenticated end-user identity: the shared AppLogin is part
-- of the trusted backend boundary and must never be exposed to clients.
CREATE OR ALTER PROCEDURE dbo.answer_schedule_day_request
    @request_id bigint,
    @task_id bigint,
    @project_id bigint,
    @answer_by bigint,
    @answer nvarchar(20),
    @answer_note nvarchar(max),
    @expected_row_version binary(8)
WITH EXECUTE AS OWNER
AS
BEGIN
    SET XACT_ABORT ON;
    SET NOCOUNT ON;

    IF @request_id IS NULL OR @request_id <= 0
       OR @task_id IS NULL OR @task_id <= 0
       OR @project_id IS NULL OR @project_id <= 0
       OR @answer_by IS NULL OR @answer_by <= 0
        THROW 51110, 'Request, task, project and answer actor identifiers are required.', 1;

    SET @answer = LTRIM(RTRIM(@answer));
    IF @answer IS NULL
       OR @answer COLLATE Latin1_General_100_BIN2 NOT IN (N'Accepted', N'Rejected')
        THROW 51111, 'Answer must be Accepted or Rejected.', 1;

    IF @answer_note IS NOT NULL
    BEGIN
        SET @answer_note = LTRIM(RTRIM(@answer_note));
        IF @answer_note = N''
            SET @answer_note = NULL;
    END;

    IF DATALENGTH(@answer_note) > 40000
        THROW 51112, 'Answer note cannot exceed 20000 characters.', 1;

    IF @expected_row_version IS NULL
        THROW 51113, 'Expected task row version is required.', 1;

    DECLARE @initial_trancount int = @@TRANCOUNT;
    DECLARE @started_transaction bit = 0;
    DECLARE @savepoint_created bit = 0;
    DECLARE @request_project_id bigint;
    DECLARE @request_task_id bigint;
    DECLARE @request_field nvarchar(50);
    DECLARE @request_days int;
    DECLARE @existing_answer nvarchar(20);
    DECLARE @existing_answer_by bigint;
    DECLARE @existing_answer_note nvarchar(max);
    DECLARE @existing_answered_at datetimeoffset(0);
    DECLARE @project_status nvarchar(50);
    DECLARE @project_manager_id bigint;
    DECLARE @answer_actor_role nvarchar(50);
    DECLARE @task_project_id bigint;
    DECLARE @task_kind nvarchar(20);
    DECLARE @plan_days int;
    DECLARE @current_row_version binary(8);
    DECLARE @result_row_version binary(8);

    BEGIN TRY
        IF @initial_trancount = 0
        BEGIN
            SET @started_transaction = 1;
            BEGIN TRANSACTION;
        END
        ELSE
        BEGIN
            SAVE TRANSACTION answer_day_request_savepoint;
            SET @savepoint_created = 1;
        END;

        SELECT @answer_actor_role = r.code
        FROM dbo.users u WITH (UPDLOCK, HOLDLOCK)
        INNER JOIN dbo.roles r WITH (UPDLOCK, HOLDLOCK) ON r.id = u.role_id
        WHERE u.id = @answer_by
          AND u.is_active = 1
          AND u.deleted_at IS NULL
          AND r.is_active = 1;

        IF @answer_actor_role IS NULL
            THROW 51114, 'Answer actor must be an active user.', 1;

        SELECT @task_project_id = project_id,
               @task_kind = kind,
               @plan_days = plan_days,
               @current_row_version = row_version
        FROM dbo.schedule_tasks WITH (UPDLOCK, HOLDLOCK)
        WHERE id = @task_id AND deleted_at IS NULL;

        IF @task_project_id IS NULL
            THROW 51116, 'Active schedule task not found.', 1;

        IF @task_project_id <> @project_id
            THROW 51117, 'The schedule task does not belong to the supplied project.', 1;

        SELECT @project_status = status,
               @project_manager_id = manager_id
        FROM dbo.projects WITH (UPDLOCK, HOLDLOCK)
        WHERE id = @project_id AND deleted_at IS NULL;

        IF @project_status IS NULL
            THROW 51115, 'Active project not found.', 1;

        IF @project_status = N'Closed'
            THROW 51123, 'A closed project schedule cannot be changed.', 1;

        IF @project_manager_id <> @answer_by
           AND @answer_actor_role NOT IN (N'Engineering Manager', N'Admin')
            THROW 51125, 'Only the project manager, an Engineering Manager, or an Admin can answer this request.', 1;

        IF @task_kind = N'phase'
           OR EXISTS (
               SELECT 1
               FROM dbo.schedule_tasks WITH (UPDLOCK, HOLDLOCK)
               WHERE parent_id = @task_id AND deleted_at IS NULL
           )
            THROW 51126, 'A day request can only be answered for a non-phase leaf task.', 1;

        SELECT @request_project_id = project_id,
               @request_task_id = task_id,
               @request_field = field,
               @request_days = request_days,
               @existing_answer = answer,
               @existing_answer_by = answer_by,
               @existing_answer_note = answer_note,
               @existing_answered_at = answered_at
        FROM dbo.schedule_updates WITH (UPDLOCK, HOLDLOCK)
        WHERE id = @request_id;

        IF @request_project_id IS NULL
            THROW 51118, 'Schedule day request not found.', 1;

        IF @request_project_id <> @project_id OR @request_task_id IS NULL OR @request_task_id <> @task_id
            THROW 51119, 'The schedule request does not match the supplied project and task.', 1;

        IF @request_field COLLATE Latin1_General_100_BIN2 <> N'request'
           OR @request_days IS NULL OR @request_days < 1 OR @request_days > 3650
            THROW 51120, 'The schedule update is not a valid day request.', 1;

        IF @existing_answer IS NOT NULL
           OR @existing_answer_by IS NOT NULL
           OR @existing_answer_note IS NOT NULL
           OR @existing_answered_at IS NOT NULL
            THROW 51121, 'The schedule day request has already been answered.', 1;

        IF @current_row_version <> @expected_row_version
            THROW 51122, 'The schedule task changed. Reload it and try again.', 1;

        SET @result_row_version = @current_row_version;

        IF @answer = N'Accepted'
        BEGIN
            IF @plan_days > 3650 - @request_days
                THROW 51124, 'Accepting this request would make the task longer than 3650 calendar days.', 1;

            DECLARE @updated_task TABLE (row_version binary(8) NOT NULL);

            UPDATE dbo.schedule_tasks
               SET plan_days = plan_days + @request_days,
                   updated_by = @answer_by,
                   updated_at = SYSUTCDATETIME()
            OUTPUT inserted.row_version INTO @updated_task(row_version)
             WHERE id = @task_id
               AND project_id = @project_id
               AND deleted_at IS NULL
               AND row_version = @expected_row_version;

            IF @@ROWCOUNT <> 1
                THROW 51122, 'The schedule task changed. Reload it and try again.', 1;

            SELECT @result_row_version = row_version FROM @updated_task;
        END;

        UPDATE dbo.schedule_updates
           SET answer = @answer,
               answer_by = @answer_by,
               answer_note = @answer_note,
               answered_at = SYSUTCDATETIME()
         WHERE id = @request_id
           AND project_id = @project_id
           AND task_id = @task_id
           AND field = N'request'
           AND request_days = @request_days
           AND answer IS NULL;

        IF @@ROWCOUNT <> 1
            THROW 51121, 'The schedule day request has already been answered.', 1;

        IF @started_transaction = 1
            COMMIT TRANSACTION;

        SELECT @task_id AS task_id, @result_row_version AS row_version;
    END TRY
    BEGIN CATCH
        IF @started_transaction = 1 AND XACT_STATE() <> 0
            ROLLBACK TRANSACTION;
        ELSE IF @savepoint_created = 1 AND XACT_STATE() = 1
            ROLLBACK TRANSACTION answer_day_request_savepoint;

        THROW;
    END CATCH;
END;
GO

INSERT INTO dbo.schema_versions(version, name)
VALUES (7, N'Atomic schedule day-request answers');

COMMIT TRANSACTION;
GO
