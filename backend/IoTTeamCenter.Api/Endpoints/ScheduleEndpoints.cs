using System.Data;
using System.Globalization;
using System.Text.Json;
using IoTTeamCenter.Api.Infrastructure;
using IoTTeamCenter.Api.Models;
using Microsoft.Data.SqlClient;

namespace IoTTeamCenter.Api.Endpoints;

public static class ScheduleEndpoints
{
    public static void MapScheduleEndpoints(this IEndpointRouteBuilder app)
    {
        var projects = app.MapGroup("/api/v1/projects").RequireAuthorization();
        projects.MapGet("/{projectId:long}/schedule", GetProjectScheduleAsync);
        projects.MapPost("/{projectId:long}/schedule/tasks", CreateTaskAsync);
        projects.MapPost("/{projectId:long}/schedule/baseline", CreateBaselineAsync);

        var schedule = app.MapGroup("/api/v1/schedule").RequireAuthorization();
        schedule.MapPut("/tasks/{id:long}", UpdatePlanAsync);
        schedule.MapPost("/tasks/{id:long}/updates", UpdateProgressAsync);
        schedule.MapPost("/tasks/{id:long}/day-requests", RequestMoreDaysAsync);
        schedule.MapPost("/day-requests/{id:long}/answer", AnswerDayRequestAsync);
        schedule.MapPost("/tasks/{id:long}/details", CreateMemberDetailAsync);
        schedule.MapDelete("/tasks/{id:long}/details", DeleteMemberDetailAsync);

        app.MapGet("/api/v1/me/work", GetMyWorkAsync).RequireAuthorization();
        app.MapGet("/api/v1/me/work/updates", GetMyWorkUpdatesAsync).RequireAuthorization();
    }

    private static async Task<IResult> GetProjectScheduleAsync(
        long projectId,
        SqlConnectionFactory connections,
        CurrentUserService users,
        CancellationToken cancellationToken)
    {
        await users.DemandPermissionAsync("schedule.read", cancellationToken);
        var actor = await users.GetRequiredAsync(cancellationToken);
        await using var connection = await connections.OpenAsync(cancellationToken);
        await ProjectScope.DemandAsync(connection, null, projectId, actor, cancellationToken);

        var project = await ReadProjectAsync(connection, null, projectId, false, cancellationToken);
        var tasks = await ReadTasksAsync(connection, null, projectId, cancellationToken);
        var holidays = await ReadHolidaysAsync(connection, null, cancellationToken);
        var pics = await ReadPicsAsync(connection, null, projectId, cancellationToken);
        var calculation = Resolve(tasks, holidays);
        var hasPlanPermission = await HasPermissionAsync(connection, actor.Role, "schedule.plan", cancellationToken);
        var hasProgressPermission = await HasPermissionAsync(connection, actor.Role, "schedule.progress", cancellationToken);
        var canPlan = hasPlanPermission
            && project.Status != "Closed"
            && (project.ManagerId == actor.Id || actor.Role is "Engineering Manager" or "Admin");
        var canProgress = hasProgressPermission && project.Status != "Closed";

        var roots = calculation.Roots.Select(item => ToResponse(item, tasks, pics)).ToArray();
        var leaves = calculation.ById.Values.Where(item => item.Children.Count == 0).ToArray();
        var totalWeight = leaves.Sum(item => item.Weight);
        var progress = totalWeight == 0
            ? 0
            : decimal.Round(leaves.Sum(item => item.PercentComplete * item.Weight) / totalWeight, 2, MidpointRounding.AwayFromZero);

        var baselines = await ReadBaselinesAsync(connection, projectId, cancellationToken);
        var updates = await ReadUpdatesAsync(connection, projectId, cancellationToken);
        var scheduleVersion = await GetScheduleVersionAsync(connection, null, projectId, false, cancellationToken);
        return Results.Ok(new
        {
            projectId,
            projectNo = project.Number,
            projectName = project.Name,
            managerId = project.ManagerId,
            projectStatus = project.Status,
            scheduleVersion = Encode(scheduleVersion),
            canPlan,
            canUpdateProgress = canProgress,
            summary = new
            {
                planStart = Minimum(calculation.Roots.Select(item => item.PlanStart)),
                planFinish = Maximum(calculation.Roots.Select(item => item.PlanFinish)),
                workDays = ScheduleCalculator.NetworkDays(
                    Minimum(calculation.Roots.Select(item => item.PlanStart)),
                    Maximum(calculation.Roots.Select(item => item.PlanFinish)),
                    holidays),
                percentComplete = progress,
                taskCount = leaves.Length,
                doneCount = leaves.Count(item => item.Status == "Done"),
                blockedCount = leaves.Count(item => item.Status == "Blocked")
            },
            latestBaseline = baselines.FirstOrDefault(),
            baselines,
            recentUpdates = updates,
            tasks = roots
        });
    }

    private static async Task<IResult> CreateTaskAsync(
        long projectId,
        CreateScheduleTaskRequest request,
        SqlConnectionFactory connections,
        CurrentUserService users,
        CancellationToken cancellationToken)
    {
        await users.DemandPermissionAsync("schedule.plan", cancellationToken);
        ValidatePlan(request.ParentId, request.Name, request.Kind, request.Visibility, request.PlanStart, request.PlanDays,
            request.StartMode, request.PredecessorId, request.LagDays, request.PicExternal, request.PlanManDays,
            request.PicUserIds, request.IsMilestone, enforcePhaseValues: true);
        var actor = await users.GetRequiredAsync(cancellationToken);

        await using var connection = await connections.OpenAsync(cancellationToken);
        await using var transaction = (SqlTransaction)await connection.BeginTransactionAsync(IsolationLevel.Serializable, cancellationToken);
        try
        {
            var project = await DemandPlanOwnerAsync(connection, transaction, projectId, actor, cancellationToken);
            await ValidateScheduleVersionAsync(connection, transaction, projectId, request.ScheduleVersion, cancellationToken);
            await ValidateTaskReferencesAsync(connection, transaction, projectId, null, request.ParentId, request.PredecessorId, cancellationToken);
            await ValidateTaskGraphAsync(connection, transaction, projectId, null, request.ParentId, request.PredecessorId, cancellationToken);
            await ValidateTaskHierarchyAsync(connection, transaction, projectId, null, request.ParentId, request.Kind.Trim(), cancellationToken);
            if (request.ParentId is long parentId
                && await HasPendingDayRequestAsync(connection, transaction, parentId, cancellationToken))
            {
                throw PendingDayRequestBlocksStructure();
            }
            var picIds = NormalizePicIds(request.PicUserIds);
            await ValidatePicsAsync(connection, transaction, project, picIds, cancellationToken);

            long id;
            byte[] rowVersion;
            await using (var insert = new SqlCommand("""
                DECLARE @created TABLE (id bigint NOT NULL, row_version binary(8) NOT NULL);

                INSERT INTO dbo.schedule_tasks (
                    project_id, parent_id, sort_order, kind, name, is_milestone, origin,
                    created_by, visibility, plan_start, plan_days, start_mode, predecessor_id,
                    lag_days, pic_external, plan_man_days, updated_by)
                OUTPUT inserted.id, inserted.row_version INTO @created(id, row_version)
                VALUES (
                    @project_id, @parent_id, @sort_order, @kind, @name, @is_milestone, N'PM',
                    @actor, @visibility, @plan_start, @plan_days, @start_mode, @predecessor_id,
                    @lag_days, @pic_external, @plan_man_days, @actor);

                SELECT id, row_version FROM @created;
                """, connection, transaction))
            {
                AddPlanParameters(insert, projectId, request.ParentId, request.SortOrder, request.Kind, request.Name,
                    request.IsMilestone, request.Visibility, request.PlanStart, request.PlanDays, request.StartMode,
                    request.PredecessorId, request.LagDays, request.PicExternal, request.PlanManDays, actor.Id);
                await using var reader = await insert.ExecuteReaderAsync(CommandBehavior.SingleRow, cancellationToken);
                await reader.ReadAsync(cancellationToken);
                id = reader.GetInt64(0);
                rowVersion = (byte[])reader.GetValue(1);
            }

            await ReplacePicsAsync(connection, transaction, id, picIds, cancellationToken);
            await AppendUpdateAsync(connection, transaction, projectId, id, actor.Id, "created", null,
                request.Name.Trim(), "Schedule task created", cancellationToken);
            await InquiryEndpoints.InsertAuditAsync(
                connection, transaction, actor.Id, "Schedule Task", id,
                FormattableString.Invariant($"T-{id}"), "Created", null, request, cancellationToken);
            await transaction.CommitAsync(cancellationToken);
            return Results.Created($"/api/v1/schedule/tasks/{id}", new
            {
                id,
                rowVersion = Encode(rowVersion),
                scheduleVersion = Encode(rowVersion)
            });
        }
        catch
        {
            await transaction.RollbackAsync(cancellationToken);
            throw;
        }
    }

    private static async Task<IResult> UpdatePlanAsync(
        long id,
        UpdateSchedulePlanRequest request,
        SqlConnectionFactory connections,
        CurrentUserService users,
        CancellationToken cancellationToken)
    {
        await users.DemandPermissionAsync("schedule.plan", cancellationToken);
        ValidatePlan(request.ParentId, request.Name, request.Kind, request.Visibility, request.PlanStart, request.PlanDays,
            request.StartMode, request.PredecessorId, request.LagDays, request.PicExternal, request.PlanManDays,
            request.PicUserIds, request.IsMilestone, enforcePhaseValues: false);
        var expectedRowVersion = SqlExtensions.ParseRowVersion(request.RowVersion);
        var actor = await users.GetRequiredAsync(cancellationToken);

        await using var connection = await connections.OpenAsync(cancellationToken);
        await using var transaction = (SqlTransaction)await connection.BeginTransactionAsync(IsolationLevel.Serializable, cancellationToken);
        try
        {
            var existing = await ReadTaskAsync(connection, transaction, id, true, cancellationToken);
            var project = await DemandPlanOwnerAsync(connection, transaction, existing.ProjectId, actor, cancellationToken);
            await ValidateScheduleVersionAsync(connection, transaction, existing.ProjectId, request.ScheduleVersion, cancellationToken);
            if (!existing.RowVersion.AsSpan().SequenceEqual(expectedRowVersion))
                throw Concurrency();

            var picIds = NormalizePicIds(request.PicUserIds);
            var existingPics = (await ReadPicsAsync(connection, transaction, existing.ProjectId, cancellationToken))
                .GetValueOrDefault(id, [])
                .Select(pic => pic.Id)
                .ToArray();
            if (PendingRequestSensitivePlanFieldsChanged(existing, request, existingPics, picIds)
                && await HasPendingDayRequestAsync(connection, transaction, id, cancellationToken))
            {
                throw PendingDayRequestBlocksPlanChange();
            }

            await ValidateTaskReferencesAsync(connection, transaction, existing.ProjectId, id, request.ParentId, request.PredecessorId, cancellationToken);
            await ValidateTaskGraphAsync(connection, transaction, existing.ProjectId, id, request.ParentId, request.PredecessorId, cancellationToken);
            await ValidateTaskHierarchyAsync(connection, transaction, existing.ProjectId, id, request.ParentId, request.Kind.Trim(), cancellationToken);
            if (request.ParentId is long parentId
                && request.ParentId != existing.ParentId
                && await HasPendingDayRequestAsync(connection, transaction, parentId, cancellationToken))
            {
                throw PendingDayRequestBlocksStructure();
            }
            await ValidatePicsAsync(connection, transaction, project, picIds, cancellationToken);

            var hasChildren = await HasActiveChildrenAsync(connection, transaction, id, cancellationToken);
            if (hasChildren && PlanFieldsChanged(existing, request))
                throw new ApiException(StatusCodes.Status400BadRequest, "schedule_rollup_plan_derived", "A roll-up row's dates and dependency are calculated from its children and cannot be changed directly.");
            if (request.Kind.Trim() == "phase")
                ValidatePhaseValues(request.ParentId, request.PlanStart, request.PlanDays, request.StartMode,
                    request.PredecessorId, request.LagDays, picIds, request.PicExternal, request.PlanManDays,
                    request.IsMilestone);

            byte[] rowVersion;
            await using (var update = new SqlCommand("""
                DECLARE @changed TABLE (row_version binary(8) NOT NULL);

                UPDATE dbo.schedule_tasks
                SET parent_id = @parent_id, sort_order = @sort_order, kind = @kind, name = @name,
                    is_milestone = @is_milestone, visibility = @visibility, plan_start = @plan_start,
                    plan_days = @plan_days, start_mode = @start_mode, predecessor_id = @predecessor_id,
                    lag_days = @lag_days, pic_external = @pic_external, plan_man_days = @plan_man_days,
                    updated_by = @actor, updated_at = SYSUTCDATETIME()
                OUTPUT inserted.row_version INTO @changed(row_version)
                WHERE id = @id AND project_id = @project_id AND deleted_at IS NULL AND row_version = @row_version;

                SELECT row_version FROM @changed;
                """, connection, transaction))
            {
                AddPlanParameters(update, existing.ProjectId, request.ParentId, request.SortOrder, request.Kind, request.Name,
                    request.IsMilestone, request.Visibility, request.PlanStart, request.PlanDays, request.StartMode,
                    request.PredecessorId, request.LagDays, request.PicExternal, request.PlanManDays, actor.Id);
                update.Parameters.AddParameter("@id", SqlDbType.BigInt, id);
                update.Parameters.AddParameter("@row_version", SqlDbType.Timestamp, expectedRowVersion);
                rowVersion = await update.ExecuteScalarAsync(cancellationToken) as byte[] ?? throw Concurrency();
            }

            await ReplacePicsAsync(connection, transaction, id, picIds, cancellationToken);
            var before = PlanAudit(existing, existingPics);
            var after = new
            {
                request.ParentId,
                request.SortOrder,
                request.Kind,
                name = request.Name.Trim(),
                request.IsMilestone,
                request.Visibility,
                request.PlanStart,
                request.PlanDays,
                request.StartMode,
                request.PredecessorId,
                request.LagDays,
                picUserIds = picIds,
                picExternal = request.PicExternal?.Trim() ?? string.Empty,
                request.PlanManDays
            };
            await AppendUpdateAsync(connection, transaction, existing.ProjectId, id, actor.Id, "plan",
                JsonSerializer.Serialize(before), JsonSerializer.Serialize(after), null, cancellationToken);
            await InquiryEndpoints.InsertAuditAsync(
                connection, transaction, actor.Id, "Schedule Task", id,
                FormattableString.Invariant($"T-{id}"), "Updated plan", before, after, cancellationToken);
            var scheduleVersion = await GetScheduleVersionAsync(connection, transaction, existing.ProjectId, false, cancellationToken);
            await transaction.CommitAsync(cancellationToken);
            return Results.Ok(new
            {
                id,
                rowVersion = Encode(rowVersion),
                scheduleVersion = Encode(scheduleVersion)
            });
        }
        catch
        {
            await transaction.RollbackAsync(cancellationToken);
            throw;
        }
    }

    private static async Task<IResult> UpdateProgressAsync(
        long id,
        UpdateScheduleProgressRequest request,
        SqlConnectionFactory connections,
        CurrentUserService users,
        CancellationToken cancellationToken)
    {
        await users.DemandPermissionAsync("schedule.progress", cancellationToken);
        ValidateProgress(request);
        var expectedRowVersion = SqlExtensions.ParseRowVersion(request.RowVersion);
        var actor = await users.GetRequiredAsync(cancellationToken);

        await using var connection = await connections.OpenAsync(cancellationToken);
        await using var transaction = (SqlTransaction)await connection.BeginTransactionAsync(IsolationLevel.Serializable, cancellationToken);
        try
        {
            var existing = await ReadTaskAsync(connection, transaction, id, true, cancellationToken);
            await ProjectScope.DemandMyWorkAsync(connection, transaction, existing.ProjectId, actor, cancellationToken);
            var project = await ReadProjectAsync(connection, transaction, existing.ProjectId, true, cancellationToken);
            if (project.Status == "Closed")
                throw new ApiException(StatusCodes.Status409Conflict, "project_closed", "A closed project's schedule cannot be changed.");
            await ValidateScheduleVersionAsync(connection, transaction, existing.ProjectId, request.ScheduleVersion, cancellationToken);
            if (!existing.RowVersion.AsSpan().SequenceEqual(expectedRowVersion)) throw Concurrency();

            await using (var ownership = new SqlCommand("""
                SELECT CASE WHEN EXISTS (
                    SELECT 1 FROM dbo.schedule_task_pics WHERE task_id = @task_id AND user_id = @actor
                ) AND NOT EXISTS (
                    SELECT 1 FROM dbo.schedule_tasks WHERE parent_id = @task_id AND deleted_at IS NULL
                ) AND EXISTS (
                    SELECT 1 FROM dbo.schedule_tasks WHERE id = @task_id AND kind <> N'phase' AND deleted_at IS NULL
                ) THEN CAST(1 AS bit) ELSE CAST(0 AS bit) END;
                """, connection, transaction))
            {
                ownership.Parameters.AddParameter("@task_id", SqlDbType.BigInt, id);
                ownership.Parameters.AddParameter("@actor", SqlDbType.BigInt, actor.Id);
                if (!(bool)(await ownership.ExecuteScalarAsync(cancellationToken) ?? false))
                    throw new ApiException(StatusCodes.Status403Forbidden, "schedule_pic_required", "Only an assigned PIC can update a leaf task's progress.");
            }

            var changes = ProgressChanges(existing, request).ToArray();
            if (changes.Length == 0)
                throw new ApiException(StatusCodes.Status409Conflict, "no_schedule_change", "The progress update does not change the task.");

            byte[] rowVersion;
            await using (var update = new SqlCommand("""
                DECLARE @changed TABLE (row_version binary(8) NOT NULL);

                UPDATE dbo.schedule_tasks
                SET percent_done = @percent, actual_start = @actual_start, actual_end = @actual_finish,
                    forecast_end = @forecast_finish, status = @status,
                    blocked_reason = @blocked_reason, note = @remark,
                    updated_by = @actor, updated_at = SYSUTCDATETIME()
                OUTPUT inserted.row_version INTO @changed(row_version)
                WHERE id = @id AND deleted_at IS NULL AND row_version = @row_version;

                SELECT row_version FROM @changed;
                """, connection, transaction))
            {
                update.Parameters.AddParameter("@percent", SqlDbType.Decimal, request.PercentComplete, precision: 5, scale: 2);
                update.Parameters.AddParameter("@actual_start", SqlDbType.Date, request.ActualStart);
                update.Parameters.AddParameter("@actual_finish", SqlDbType.Date, request.ActualFinish);
                update.Parameters.AddParameter("@forecast_finish", SqlDbType.Date, request.ForecastFinish);
                update.Parameters.AddParameter("@status", SqlDbType.NVarChar, request.Status.Trim(), 30);
                update.Parameters.AddParameter("@blocked_reason", SqlDbType.NVarChar,
                    request.Status.Trim() == "Blocked" ? request.Remark?.Trim() : null, -1);
                update.Parameters.AddParameter("@remark", SqlDbType.NVarChar, request.Remark?.Trim(), -1);
                update.Parameters.AddParameter("@actor", SqlDbType.BigInt, actor.Id);
                update.Parameters.AddParameter("@id", SqlDbType.BigInt, id);
                update.Parameters.AddParameter("@row_version", SqlDbType.Timestamp, expectedRowVersion);
                rowVersion = await update.ExecuteScalarAsync(cancellationToken) as byte[] ?? throw Concurrency();
            }

            foreach (var change in changes)
                await AppendUpdateAsync(connection, transaction, existing.ProjectId, id, actor.Id, change.Field,
                    change.Before, change.After, request.Remark?.Trim(), cancellationToken);

            var before = new
            {
                percentComplete = existing.PercentComplete,
                existing.ActualStart,
                actualFinish = existing.ActualEnd,
                forecastFinish = existing.ForecastEnd,
                existing.Status,
                blockedReason = existing.BlockedReason,
                remark = existing.Note
            };
            var after = new
            {
                request.PercentComplete,
                request.ActualStart,
                request.ActualFinish,
                request.ForecastFinish,
                status = request.Status.Trim(),
                blockedReason = request.Status.Trim() == "Blocked" ? request.Remark?.Trim() : null,
                remark = request.Remark?.Trim()
            };
            await InquiryEndpoints.InsertAuditAsync(
                connection, transaction, actor.Id, "Schedule Task", id,
                FormattableString.Invariant($"T-{id}"), "Updated progress", before, after, cancellationToken);
            var scheduleVersion = await GetScheduleVersionAsync(connection, transaction, existing.ProjectId, false, cancellationToken);
            await transaction.CommitAsync(cancellationToken);
            return Results.Ok(new
            {
                id,
                rowVersion = Encode(rowVersion),
                scheduleVersion = Encode(scheduleVersion)
            });
        }
        catch
        {
            await transaction.RollbackAsync(cancellationToken);
            throw;
        }
    }

    private static async Task<IResult> RequestMoreDaysAsync(
        long id,
        RequestScheduleDaysRequest request,
        SqlConnectionFactory connections,
        CurrentUserService users,
        CancellationToken cancellationToken)
    {
        await users.DemandPermissionAsync("schedule.read", cancellationToken);
        await users.DemandPermissionAsync("schedule.progress", cancellationToken);
        if (request.RequestDays is < 1 or > 3650)
            throw Invalid("Requested days must be between 1 and 3650.");
        InputValidation.RequiredText(request.Comment, 20_000, "Request comment");
        var actor = await users.GetRequiredAsync(cancellationToken);

        await using var connection = await connections.OpenAsync(cancellationToken);
        await using var transaction = (SqlTransaction)await connection.BeginTransactionAsync(IsolationLevel.Serializable, cancellationToken);
        try
        {
            var task = await ReadTaskAsync(connection, transaction, id, true, cancellationToken);
            await ProjectScope.DemandMyWorkAsync(connection, transaction, task.ProjectId, actor, cancellationToken);
            var project = await ReadProjectAsync(connection, transaction, task.ProjectId, true, cancellationToken);
            if (project.Status == "Closed")
                throw new ApiException(StatusCodes.Status409Conflict, "project_closed", "A closed project's schedule cannot be changed.");
            await DemandAssignedLeafAsync(connection, transaction, task, actor.Id, cancellationToken);

            if (await HasPendingDayRequestAsync(connection, transaction, id, cancellationToken))
                throw new ApiException(StatusCodes.Status409Conflict, "schedule_day_request_pending", "This task already has a pending request for more days.");

            long requestId;
            DateTimeOffset occurredAt;
            await using (var insert = new SqlCommand("""
                DECLARE @created TABLE (id bigint NOT NULL, occurred_at datetimeoffset(0) NOT NULL);

                INSERT INTO dbo.schedule_updates (
                    project_id, task_id, actor_id, field, from_value, to_value, comment, request_days)
                OUTPUT inserted.id, inserted.occurred_at INTO @created(id, occurred_at)
                VALUES (@project_id, @task_id, @actor, N'request', @from_value, @to_value, @comment, @request_days);

                SELECT id, occurred_at FROM @created;
                """, connection, transaction))
            {
                insert.Parameters.AddParameter("@project_id", SqlDbType.BigInt, task.ProjectId);
                insert.Parameters.AddParameter("@task_id", SqlDbType.BigInt, id);
                insert.Parameters.AddParameter("@actor", SqlDbType.BigInt, actor.Id);
                insert.Parameters.AddParameter("@from_value", SqlDbType.NVarChar, Invariant(task.ForecastEnd), -1);
                insert.Parameters.AddParameter("@to_value", SqlDbType.NVarChar,
                    FormattableString.Invariant($"+{request.RequestDays} days"), -1);
                insert.Parameters.AddParameter("@comment", SqlDbType.NVarChar, request.Comment.Trim(), -1);
                insert.Parameters.AddParameter("@request_days", SqlDbType.Int, request.RequestDays);
                await using var reader = await insert.ExecuteReaderAsync(CommandBehavior.SingleRow, cancellationToken);
                await reader.ReadAsync(cancellationToken);
                requestId = reader.GetInt64(0);
                occurredAt = reader.GetFieldValue<DateTimeOffset>(1);
            }

            var after = new { taskId = id, request.RequestDays, comment = request.Comment.Trim() };
            await InquiryEndpoints.InsertAuditAsync(
                connection, transaction, actor.Id, "Schedule Day Request", requestId,
                FormattableString.Invariant($"T-{id}/R-{requestId}"), "Requested more days", null, after, cancellationToken);
            await transaction.CommitAsync(cancellationToken);
            return Results.Created($"/api/v1/me/work/updates/{requestId}", new
            {
                id = requestId,
                taskId = id,
                requestDays = request.RequestDays,
                comment = request.Comment.Trim(),
                occurredAt
            });
        }
        catch
        {
            await transaction.RollbackAsync(cancellationToken);
            throw;
        }
    }

    private static async Task<IResult> AnswerDayRequestAsync(
        long id,
        AnswerScheduleDaysRequest request,
        SqlConnectionFactory connections,
        CurrentUserService users,
        CancellationToken cancellationToken)
    {
        await users.DemandPermissionAsync("schedule.plan", cancellationToken);
        InputValidation.OneOf(request.Answer, "Day request answer", "Accepted", "Rejected");
        InputValidation.OptionalText(request.Note, 20_000, "Answer note");
        var expectedRowVersion = SqlExtensions.ParseRowVersion(request.RowVersion);
        var actor = await users.GetRequiredAsync(cancellationToken);

        await using var connection = await connections.OpenAsync(cancellationToken);
        var locator = await ReadDayRequestLocatorAsync(connection, id, cancellationToken);
        await using var transaction = (SqlTransaction)await connection.BeginTransactionAsync(IsolationLevel.Serializable, cancellationToken);
        try
        {
            var projectId = locator.ProjectId;
            var taskId = locator.TaskId;
            var task = await ReadTaskAsync(connection, transaction, taskId, true, cancellationToken);
            if (task.ProjectId != projectId)
                throw new ApiException(StatusCodes.Status409Conflict, "schedule_day_request_invalid", "The day request no longer matches its task.");
            var project = await DemandPlanOwnerAsync(connection, transaction, projectId, actor, cancellationToken);
            if (task.Kind == "phase" || await HasActiveChildrenAsync(connection, transaction, taskId, cancellationToken))
                throw new ApiException(StatusCodes.Status409Conflict, "schedule_day_request_not_leaf", "A day request can only be answered while its task remains a non-phase leaf row.");

            int requestDays;
            string? existingAnswer;
            await using (var readRequest = new SqlCommand("""
                SELECT project_id, task_id, request_days, answer
                FROM dbo.schedule_updates WITH (UPDLOCK, HOLDLOCK)
                WHERE id = @request_id AND task_id IS NOT NULL
                  AND field = N'request' AND request_days > 0;
                """, connection, transaction))
            {
                readRequest.Parameters.AddParameter("@request_id", SqlDbType.BigInt, id);
                await using var reader = await readRequest.ExecuteReaderAsync(CommandBehavior.SingleRow, cancellationToken);
                if (!await reader.ReadAsync(cancellationToken))
                    throw new ApiException(StatusCodes.Status404NotFound, "schedule_day_request_not_found", "Schedule day request not found.");
                if (reader.GetInt64(0) != projectId || reader.GetInt64(1) != taskId)
                    throw new ApiException(StatusCodes.Status409Conflict, "schedule_day_request_invalid", "The day request no longer matches its task.");
                requestDays = reader.GetInt32(2);
                existingAnswer = reader.IsDBNull(3) ? null : reader.GetString(3);
            }
            if (existingAnswer is not null)
                throw new ApiException(StatusCodes.Status409Conflict, "schedule_day_request_answered", "This day request has already been answered.");

            await ValidateScheduleVersionAsync(connection, transaction, projectId, request.ScheduleVersion, cancellationToken);
            if (!task.RowVersion.AsSpan().SequenceEqual(expectedRowVersion)) throw Concurrency();
            if (request.Answer.Trim() == "Accepted" && task.PlanDays > 3650 - requestDays)
                throw Invalid("Accepting this request would make the task longer than 3650 calendar days.");

            byte[] rowVersion;
            await using (var answer = new SqlCommand("dbo.answer_schedule_day_request", connection, transaction)
            {
                CommandType = CommandType.StoredProcedure
            })
            {
                answer.Parameters.AddParameter("@request_id", SqlDbType.BigInt, id);
                answer.Parameters.AddParameter("@task_id", SqlDbType.BigInt, taskId);
                answer.Parameters.AddParameter("@project_id", SqlDbType.BigInt, projectId);
                answer.Parameters.AddParameter("@answer_by", SqlDbType.BigInt, actor.Id);
                answer.Parameters.AddParameter("@answer", SqlDbType.NVarChar, request.Answer.Trim(), 20);
                answer.Parameters.AddParameter("@answer_note", SqlDbType.NVarChar, request.Note?.Trim(), -1);
                answer.Parameters.AddParameter("@expected_row_version", SqlDbType.Timestamp, expectedRowVersion);
                await using var reader = await answer.ExecuteReaderAsync(CommandBehavior.SingleRow, cancellationToken);
                if (!await reader.ReadAsync(cancellationToken) || reader.GetInt64(0) != taskId)
                    throw Concurrency();
                rowVersion = (byte[])reader.GetValue(1);
            }

            var normalizedAnswer = request.Answer.Trim();
            var resultingPlanDays = normalizedAnswer == "Accepted" ? checked(task.PlanDays + requestDays) : task.PlanDays;
            if (normalizedAnswer == "Accepted")
            {
                await AppendUpdateAsync(connection, transaction, projectId, taskId, actor.Id, "plan_days",
                    task.PlanDays.ToString(CultureInfo.InvariantCulture),
                    resultingPlanDays.ToString(CultureInfo.InvariantCulture), request.Note?.Trim(), cancellationToken);
            }
            await AppendUpdateAsync(connection, transaction, projectId, taskId, actor.Id, "request_answer",
                null, normalizedAnswer, request.Note?.Trim(), cancellationToken);

            var before = new { requestId = id, answer = (string?)null, task.PlanDays };
            var after = new
            {
                requestId = id,
                answer = normalizedAnswer,
                answerNote = request.Note?.Trim(),
                requestDays,
                planDays = resultingPlanDays
            };
            await InquiryEndpoints.InsertAuditAsync(
                connection, transaction, actor.Id, "Schedule Day Request", id,
                FormattableString.Invariant($"T-{taskId}/R-{id}"), "Answered day request", before, after, cancellationToken);
            var scheduleVersion = await GetScheduleVersionAsync(connection, transaction, project.Id, false, cancellationToken);
            await transaction.CommitAsync(cancellationToken);
            return Results.Ok(new
            {
                id,
                projectId,
                taskId,
                answer = normalizedAnswer,
                answerNote = request.Note?.Trim(),
                requestDays,
                planDays = resultingPlanDays,
                rowVersion = Encode(rowVersion),
                scheduleVersion = Encode(scheduleVersion)
            });
        }
        catch
        {
            await transaction.RollbackAsync(cancellationToken);
            throw;
        }
    }

    private static async Task<IResult> CreateMemberDetailAsync(
        long id,
        CreateMemberScheduleDetailRequest request,
        SqlConnectionFactory connections,
        CurrentUserService users,
        CancellationToken cancellationToken)
    {
        await users.DemandPermissionAsync("schedule.read", cancellationToken);
        await users.DemandPermissionAsync("schedule.progress", cancellationToken);
        InputValidation.RequiredText(request.Name, 500, "Task name");
        if (request.PlanDays is < 1 or > 3650)
            throw Invalid("Plan days must be between 1 and 3650.");
        var expectedRowVersion = SqlExtensions.ParseRowVersion(request.RowVersion);
        var actor = await users.GetRequiredAsync(cancellationToken);

        await using var connection = await connections.OpenAsync(cancellationToken);
        await using var transaction = (SqlTransaction)await connection.BeginTransactionAsync(IsolationLevel.Serializable, cancellationToken);
        try
        {
            var parent = await ReadTaskAsync(connection, transaction, id, true, cancellationToken);
            await ProjectScope.DemandMyWorkAsync(connection, transaction, parent.ProjectId, actor, cancellationToken);
            var project = await ReadProjectAsync(connection, transaction, parent.ProjectId, true, cancellationToken);
            if (project.Status == "Closed")
                throw new ApiException(StatusCodes.Status409Conflict, "project_closed", "A closed project's schedule cannot be changed.");
            await ValidateScheduleVersionAsync(connection, transaction, parent.ProjectId, request.ScheduleVersion, cancellationToken);
            if (!parent.RowVersion.AsSpan().SequenceEqual(expectedRowVersion)) throw Concurrency();
            await DemandAssignedLeafAsync(connection, transaction, parent, actor.Id, cancellationToken);
            if (parent.Kind != "task")
                throw new ApiException(StatusCodes.Status422UnprocessableEntity, "schedule_detail_parent_required", "A member detail can only be added beneath an assigned task row.");
            if (parent.StartMode != "manual" || parent.PredecessorId is not null)
            {
                throw new ApiException(StatusCodes.Status409Conflict, "schedule_detail_parent_linked",
                    "A member cannot add a detail beneath a linked or predecessor-driven task because that would detach it from the live dependency. Ask the project manager to restructure the plan.");
            }
            if (parent.Status != "Not Started" || parent.PercentComplete != 0
                || parent.ActualStart is not null || parent.ActualEnd is not null
                || parent.ForecastEnd is not null || parent.ActualManDays != 0)
            {
                throw new ApiException(StatusCodes.Status409Conflict, "schedule_detail_parent_started",
                    "A member detail can only be added before the parent task has started or reported progress.");
            }
            if (await HasPendingDayRequestAsync(connection, transaction, parent.Id, cancellationToken))
                throw PendingDayRequestBlocksStructure();

            var tasks = await ReadTasksAsync(connection, transaction, parent.ProjectId, cancellationToken);
            var holidays = await ReadHolidaysAsync(connection, transaction, cancellationToken);
            var resolvedParent = Resolve(tasks, holidays).ById[parent.Id];
            var planStart = resolvedParent.PlanStart
                ?? throw new ApiException(StatusCodes.Status422UnprocessableEntity, "schedule_detail_start_unresolved", "The parent task must have a resolved start date before a detail can be added.");
            var planFinish = resolvedParent.PlanFinish
                ?? throw new ApiException(StatusCodes.Status422UnprocessableEntity, "schedule_detail_finish_unresolved", "The parent task must have a resolved finish date before a detail can be added.");
            var parentPlanDays = CalendarDays(planStart, planFinish);
            if (request.PlanDays != parentPlanDays)
            {
                throw new ApiException(StatusCodes.Status422UnprocessableEntity, "schedule_detail_outside_parent_plan",
                    "The first member detail must cover the current parent plan period exactly so member-owned work cannot change PM-owned project dates.");
            }

            int sortOrder;
            await using (var order = new SqlCommand("""
                SELECT COALESCE(MAX(sort_order), 0) + 1
                FROM dbo.schedule_tasks WITH (UPDLOCK, HOLDLOCK)
                WHERE parent_id = @parent_id AND deleted_at IS NULL;
                """, connection, transaction))
            {
                order.Parameters.AddParameter("@parent_id", SqlDbType.BigInt, id);
                sortOrder = Convert.ToInt32(await order.ExecuteScalarAsync(cancellationToken), CultureInfo.InvariantCulture);
            }

            long detailId;
            byte[] rowVersion;
            await using (var insert = new SqlCommand("""
                DECLARE @created TABLE (id bigint NOT NULL, row_version binary(8) NOT NULL);

                INSERT INTO dbo.schedule_tasks (
                    project_id, parent_id, sort_order, kind, name, is_milestone, origin,
                    created_by, visibility, plan_start, plan_days, start_mode, predecessor_id,
                    lag_days, pic_external, plan_man_days, updated_by)
                OUTPUT inserted.id, inserted.row_version INTO @created(id, row_version)
                VALUES (
                    @project_id, @parent_id, @sort_order, N'detail', @name, 0, N'Member',
                    @actor, N'Internal', @plan_start, @plan_days, N'manual', NULL,
                    0, N'', 0, @actor);

                SELECT id, row_version FROM @created;
                """, connection, transaction))
            {
                insert.Parameters.AddParameter("@project_id", SqlDbType.BigInt, parent.ProjectId);
                insert.Parameters.AddParameter("@parent_id", SqlDbType.BigInt, parent.Id);
                insert.Parameters.AddParameter("@sort_order", SqlDbType.Int, sortOrder);
                insert.Parameters.AddParameter("@name", SqlDbType.NVarChar, request.Name.Trim(), 500);
                insert.Parameters.AddParameter("@actor", SqlDbType.BigInt, actor.Id);
                insert.Parameters.AddParameter("@plan_start", SqlDbType.Date, planStart);
                insert.Parameters.AddParameter("@plan_days", SqlDbType.Int, request.PlanDays);
                await using var reader = await insert.ExecuteReaderAsync(CommandBehavior.SingleRow, cancellationToken);
                await reader.ReadAsync(cancellationToken);
                detailId = reader.GetInt64(0);
                rowVersion = (byte[])reader.GetValue(1);
            }

            await using (var assign = new SqlCommand(
                "INSERT INTO dbo.schedule_task_pics (task_id, user_id) VALUES (@task_id, @actor);",
                connection, transaction))
            {
                assign.Parameters.AddParameter("@task_id", SqlDbType.BigInt, detailId);
                assign.Parameters.AddParameter("@actor", SqlDbType.BigInt, actor.Id);
                await assign.ExecuteNonQueryAsync(cancellationToken);
            }

            var after = new
            {
                id = detailId,
                projectId = parent.ProjectId,
                parentId = parent.Id,
                kind = "detail",
                name = request.Name.Trim(),
                origin = "Member",
                visibility = "Internal",
                planStart,
                request.PlanDays,
                picUserIds = new[] { actor.Id }
            };
            await AppendUpdateAsync(connection, transaction, parent.ProjectId, detailId, actor.Id, "created", null,
                request.Name.Trim(), "Member detail created", cancellationToken);
            await InquiryEndpoints.InsertAuditAsync(
                connection, transaction, actor.Id, "Schedule Task", detailId,
                FormattableString.Invariant($"T-{detailId}"), "Created member detail", null, after, cancellationToken);
            var scheduleVersion = await GetScheduleVersionAsync(connection, transaction, parent.ProjectId, false, cancellationToken);
            await transaction.CommitAsync(cancellationToken);
            return Results.Created($"/api/v1/schedule/tasks/{detailId}", new
            {
                id = detailId,
                parentId = parent.Id,
                rowVersion = Encode(rowVersion),
                scheduleVersion = Encode(scheduleVersion)
            });
        }
        catch
        {
            await transaction.RollbackAsync(cancellationToken);
            throw;
        }
    }

    private static async Task<IResult> DeleteMemberDetailAsync(
        long id,
        [Microsoft.AspNetCore.Mvc.FromBody] DeleteMemberScheduleDetailRequest request,
        SqlConnectionFactory connections,
        CurrentUserService users,
        CancellationToken cancellationToken)
    {
        await users.DemandPermissionAsync("schedule.read", cancellationToken);
        await users.DemandPermissionAsync("schedule.progress", cancellationToken);
        var expectedRowVersion = SqlExtensions.ParseRowVersion(request.RowVersion);
        var actor = await users.GetRequiredAsync(cancellationToken);

        await using var connection = await connections.OpenAsync(cancellationToken);
        await using var transaction = (SqlTransaction)await connection.BeginTransactionAsync(IsolationLevel.Serializable, cancellationToken);
        try
        {
            var detail = await ReadTaskAsync(connection, transaction, id, true, cancellationToken);
            await ProjectScope.DemandMyWorkAsync(connection, transaction, detail.ProjectId, actor, cancellationToken);
            var project = await ReadProjectAsync(connection, transaction, detail.ProjectId, true, cancellationToken);
            if (project.Status == "Closed")
                throw new ApiException(StatusCodes.Status409Conflict, "project_closed", "A closed project's schedule cannot be changed.");
            await ValidateScheduleVersionAsync(connection, transaction, detail.ProjectId, request.ScheduleVersion, cancellationToken);
            if (!detail.RowVersion.AsSpan().SequenceEqual(expectedRowVersion)) throw Concurrency();

            long createdBy;
            bool assigned;
            await using (var ownership = new SqlCommand("""
                SELECT t.created_by,
                       CASE WHEN EXISTS (
                           SELECT 1 FROM dbo.schedule_task_pics pic
                           WHERE pic.task_id = t.id AND pic.user_id = @actor
                       ) THEN CAST(1 AS bit) ELSE CAST(0 AS bit) END
                FROM dbo.schedule_tasks t WITH (UPDLOCK, HOLDLOCK)
                WHERE t.id = @task_id AND t.deleted_at IS NULL;
                """, connection, transaction))
            {
                ownership.Parameters.AddParameter("@task_id", SqlDbType.BigInt, id);
                ownership.Parameters.AddParameter("@actor", SqlDbType.BigInt, actor.Id);
                await using var reader = await ownership.ExecuteReaderAsync(CommandBehavior.SingleRow, cancellationToken);
                if (!await reader.ReadAsync(cancellationToken))
                    throw new ApiException(StatusCodes.Status404NotFound, "schedule_task_not_found", "Schedule task not found.");
                createdBy = reader.GetInt64(0);
                assigned = reader.GetBoolean(1);
            }

            if (detail.Kind != "detail" || detail.Origin != "Member" || createdBy != actor.Id || !assigned)
                throw new ApiException(StatusCodes.Status403Forbidden, "schedule_member_detail_owner_required", "Only the member who created and owns this detail can delete it.");
            if (detail.Status != "Not Started" || detail.PercentComplete != 0 || detail.ActualStart is not null || detail.ActualEnd is not null)
                throw new ApiException(StatusCodes.Status409Conflict, "schedule_detail_started", "A member detail cannot be deleted after work has started.");
            if (await HasActiveChildrenAsync(connection, transaction, id, cancellationToken))
                throw new ApiException(StatusCodes.Status409Conflict, "schedule_detail_has_children", "A member detail with active children cannot be deleted.");
            if (await HasPendingDayRequestAsync(connection, transaction, id, cancellationToken))
                throw PendingDayRequestBlocksStructure();

            await using (var references = new SqlCommand("""
                SELECT CASE WHEN EXISTS (
                    SELECT 1 FROM dbo.schedule_tasks WITH (UPDLOCK, HOLDLOCK)
                    WHERE predecessor_id = @task_id AND deleted_at IS NULL
                ) THEN CAST(1 AS bit) ELSE CAST(0 AS bit) END;
                """, connection, transaction))
            {
                references.Parameters.AddParameter("@task_id", SqlDbType.BigInt, id);
                if ((bool)(await references.ExecuteScalarAsync(cancellationToken) ?? false))
                    throw new ApiException(StatusCodes.Status409Conflict, "schedule_detail_referenced", "A member detail used as a predecessor cannot be deleted.");
            }

            var before = new
            {
                detail.Id,
                detail.ProjectId,
                detail.ParentId,
                detail.Name,
                detail.Kind,
                detail.Origin,
                detail.PlanStart,
                detail.PlanDays,
                detail.Status
            };
            await AppendUpdateAsync(connection, transaction, detail.ProjectId, id, actor.Id, "deleted",
                detail.Name, null, "Member detail deleted", cancellationToken);
            await InquiryEndpoints.InsertAuditAsync(
                connection, transaction, actor.Id, "Schedule Task", id,
                FormattableString.Invariant($"T-{id}"), "Deleted member detail", before, null, cancellationToken);

            await using (var delete = new SqlCommand("""
                UPDATE dbo.schedule_tasks
                SET deleted_at = SYSUTCDATETIME(), updated_by = @actor, updated_at = SYSUTCDATETIME()
                WHERE id = @task_id AND deleted_at IS NULL AND row_version = @row_version;
                """, connection, transaction))
            {
                delete.Parameters.AddParameter("@actor", SqlDbType.BigInt, actor.Id);
                delete.Parameters.AddParameter("@task_id", SqlDbType.BigInt, id);
                delete.Parameters.AddParameter("@row_version", SqlDbType.Timestamp, expectedRowVersion);
                if (await delete.ExecuteNonQueryAsync(cancellationToken) != 1) throw Concurrency();
            }

            var scheduleVersion = await GetScheduleVersionAsync(connection, transaction, detail.ProjectId, false, cancellationToken);
            await transaction.CommitAsync(cancellationToken);
            return Results.Ok(new { id, deleted = true, scheduleVersion = Encode(scheduleVersion) });
        }
        catch
        {
            await transaction.RollbackAsync(cancellationToken);
            throw;
        }
    }

    private static async Task<IResult> CreateBaselineAsync(
        long projectId,
        CreateScheduleBaselineRequest request,
        SqlConnectionFactory connections,
        CurrentUserService users,
        CancellationToken cancellationToken)
    {
        await users.DemandPermissionAsync("schedule.plan", cancellationToken);
        InputValidation.RequiredText(request.Label, 200, "Baseline label");
        InputValidation.RequiredText(request.Reason, 20_000, "Baseline reason");
        var actor = await users.GetRequiredAsync(cancellationToken);

        await using var connection = await connections.OpenAsync(cancellationToken);
        await using var transaction = (SqlTransaction)await connection.BeginTransactionAsync(IsolationLevel.Serializable, cancellationToken);
        try
        {
            var project = await DemandPlanOwnerAsync(connection, transaction, projectId, actor, cancellationToken);
            await ValidateScheduleVersionAsync(connection, transaction, projectId, request.ScheduleVersion, cancellationToken);
            var tasks = await ReadTasksAsync(connection, transaction, projectId, cancellationToken);
            if (tasks.Count == 0)
                throw new ApiException(StatusCodes.Status409Conflict, "schedule_empty", "A baseline cannot be taken before the schedule has tasks.");
            var holidays = await ReadHolidaysAsync(connection, transaction, cancellationToken);
            var calculation = Resolve(tasks, holidays);

            int revision;
            await using (var nextRevision = new SqlCommand("""
                SELECT COALESCE(MAX(revision), 0) + 1
                FROM dbo.schedule_baselines WITH (UPDLOCK, HOLDLOCK)
                WHERE project_id = @project_id;
                """, connection, transaction))
            {
                nextRevision.Parameters.AddParameter("@project_id", SqlDbType.BigInt, projectId);
                revision = (int)(await nextRevision.ExecuteScalarAsync(cancellationToken) ?? 1);
            }

            var snapshot = JsonSerializer.Serialize(calculation.ById.Values
                .OrderBy(item => item.Wbs, StringComparer.Ordinal)
                .Select(item => new
                {
                    item.Source.Id,
                    item.Source.ParentId,
                    item.Wbs,
                    item.PlanStart,
                    item.PlanFinish,
                    planDays = item.Source.PlanDays,
                    item.WorkDays,
                    item.PercentComplete,
                    item.Status
                }));

            foreach (var task in tasks)
            {
                var resolved = calculation.ById[task.Id];
                await using var freeze = new SqlCommand("""
                    UPDATE dbo.schedule_tasks
                    SET baseline_start = @baseline_start, baseline_end = @baseline_end,
                        baseline_days = @baseline_days, baseline_rev = @baseline_rev,
                        updated_by = @actor, updated_at = SYSUTCDATETIME()
                    WHERE id = @id AND deleted_at IS NULL AND row_version = @row_version;
                    """, connection, transaction);
                freeze.Parameters.AddParameter("@baseline_start", SqlDbType.Date, resolved.PlanStart);
                freeze.Parameters.AddParameter("@baseline_end", SqlDbType.Date, resolved.PlanFinish);
                freeze.Parameters.AddParameter("@baseline_days", SqlDbType.Int, CalendarDays(resolved.PlanStart, resolved.PlanFinish));
                freeze.Parameters.AddParameter("@baseline_rev", SqlDbType.Int, revision);
                freeze.Parameters.AddParameter("@actor", SqlDbType.BigInt, actor.Id);
                freeze.Parameters.AddParameter("@id", SqlDbType.BigInt, task.Id);
                freeze.Parameters.AddParameter("@row_version", SqlDbType.Timestamp, task.RowVersion);
                if (await freeze.ExecuteNonQueryAsync(cancellationToken) != 1) throw Concurrency();
            }

            var promisedFinish = Maximum(calculation.Roots.Select(item => item.PlanFinish));
            long baselineId;
            await using (var insert = new SqlCommand("""
                INSERT INTO dbo.schedule_baselines (
                    project_id, revision, label, taken_by, reason, task_count, promised_finish, snapshot_json)
                VALUES (@project_id, @revision, @label, @actor, @reason, @task_count, @promised_finish, @snapshot);
                SELECT CONVERT(bigint, SCOPE_IDENTITY());
                """, connection, transaction))
            {
                insert.Parameters.AddParameter("@project_id", SqlDbType.BigInt, projectId);
                insert.Parameters.AddParameter("@revision", SqlDbType.Int, revision);
                insert.Parameters.AddParameter("@label", SqlDbType.NVarChar, request.Label.Trim(), 200);
                insert.Parameters.AddParameter("@actor", SqlDbType.BigInt, actor.Id);
                insert.Parameters.AddParameter("@reason", SqlDbType.NVarChar, request.Reason.Trim(), -1);
                insert.Parameters.AddParameter("@task_count", SqlDbType.Int, tasks.Count);
                insert.Parameters.AddParameter("@promised_finish", SqlDbType.Date, promisedFinish);
                insert.Parameters.AddParameter("@snapshot", SqlDbType.NVarChar, snapshot, -1);
                baselineId = (long)(await insert.ExecuteScalarAsync(cancellationToken)
                    ?? throw new InvalidOperationException("The baseline insert did not return an id."));
            }

            await AppendUpdateAsync(connection, transaction, projectId, null, actor.Id, "baseline",
                revision > 1 ? (revision - 1).ToString(CultureInfo.InvariantCulture) : null,
                revision.ToString(CultureInfo.InvariantCulture), request.Reason.Trim(), cancellationToken);
            await InquiryEndpoints.InsertAuditAsync(
                connection, transaction, actor.Id, "Schedule Baseline", baselineId,
                FormattableString.Invariant($"{project.Number}/BL-{revision:D3}"), "Created baseline", null,
                new { revision, request.Label, request.Reason, taskCount = tasks.Count, promisedFinish }, cancellationToken);
            var scheduleVersion = await GetScheduleVersionAsync(connection, transaction, projectId, false, cancellationToken);
            await transaction.CommitAsync(cancellationToken);
            return Results.Created($"/api/v1/projects/{projectId}/schedule/baseline/{baselineId}", new
            {
                id = baselineId,
                revision,
                taskCount = tasks.Count,
                promisedFinish,
                scheduleVersion = Encode(scheduleVersion)
            });
        }
        catch
        {
            await transaction.RollbackAsync(cancellationToken);
            throw;
        }
    }

    private static async Task<IResult> GetMyWorkAsync(
        SqlConnectionFactory connections,
        CurrentUserService users,
        CancellationToken cancellationToken)
    {
        await users.DemandPermissionAsync("schedule.read", cancellationToken);
        await users.DemandPermissionAsync("schedule.progress", cancellationToken);
        var actor = await users.GetRequiredAsync(cancellationToken);
        await using var connection = await connections.OpenAsync(cancellationToken);
        var holidays = await ReadHolidaysAsync(connection, null, cancellationToken);

        var projects = new List<WorkProjectRow>();
        await using (var command = new SqlCommand("""
            SELECT DISTINCT p.id, p.project_no, p.name, p.manager_id, manager.name, p.status,
                   CAST(CASE WHEN p.status <> N'Closed' AND scope.is_allowed = 1 THEN 1 ELSE 0 END AS bit)
            FROM dbo.projects p
            INNER JOIN dbo.users manager ON manager.id = p.manager_id
            INNER JOIN dbo.schedule_tasks t ON t.project_id = p.id AND t.deleted_at IS NULL
            INNER JOIN dbo.schedule_task_pics pic ON pic.task_id = t.id
            CROSS APPLY (VALUES (CAST(CASE
                WHEN @elevated = 1 OR p.manager_id = @actor OR p.lead_engineer_id = @actor
                     OR EXISTS (SELECT 1 FROM dbo.project_members m
                                WHERE m.project_id = p.id AND m.user_id = @actor)
                THEN 1 ELSE 0 END AS bit))) scope(is_allowed)
            WHERE pic.user_id = @actor AND p.deleted_at IS NULL AND scope.is_allowed = 1;
            """, connection))
        {
            command.Parameters.AddParameter("@actor", SqlDbType.BigInt, actor.Id);
            command.Parameters.AddParameter("@elevated", SqlDbType.Bit, ProjectScope.IsMyWorkElevated(actor));
            await using var reader = await command.ExecuteReaderAsync(cancellationToken);
            while (await reader.ReadAsync(cancellationToken))
                projects.Add(new WorkProjectRow(reader.GetInt64(0), reader.GetString(1), reader.GetString(2),
                    reader.GetInt64(3), reader.GetString(4), reader.GetString(5), reader.GetBoolean(6)));
        }

        var work = new List<MyWorkResponse>();
        foreach (var project in projects)
        {
            var tasks = await ReadTasksAsync(connection, null, project.Id, cancellationToken);
            var pics = await ReadPicsAsync(connection, null, project.Id, cancellationToken);
            var calculation = Resolve(tasks, holidays);
            var byId = tasks.ToDictionary(task => task.Id);
            var pending = await ReadPendingRequestsAsync(connection, project.Id, actor.Id, cancellationToken);
            var dependentTaskIds = tasks
                .Where(candidate => candidate.PredecessorId is not null)
                .Select(candidate => candidate.PredecessorId!.Value)
                .ToHashSet();
            var scheduleVersion = Encode(await GetScheduleVersionAsync(connection, null, project.Id, false, cancellationToken));
            foreach (var task in tasks.Where(task =>
                         task.Kind != "phase"
                         && calculation.ById[task.Id].Children.Count == 0
                         && pics.GetValueOrDefault(task.Id, []).Any(pic => pic.Id == actor.Id)))
            {
                var item = calculation.ById[task.Id];
                var phase = FindTopPhase(task, byId, calculation);
                var hasPendingRequest = pending.AllTaskIds.Contains(task.Id);
                var isOwnDetail = task.Kind == "detail" && task.Origin == "Member" && task.CreatedBy == actor.Id;
                var canAddDetail = project.CanUpdate
                    && task.Kind == "task"
                    && task.StartMode == "manual"
                    && task.PredecessorId is null
                    && task.Status == "Not Started"
                    && task.PercentComplete == 0
                    && task.ActualStart is null
                    && task.ActualEnd is null
                    && task.ForecastEnd is null
                    && task.ActualManDays == 0
                    && item.PlanStart is not null
                    && item.PlanFinish is not null
                    && !hasPendingRequest;
                var canDeleteDetail = project.CanUpdate
                    && isOwnDetail
                    && task.Status == "Not Started"
                    && task.PercentComplete == 0
                    && task.ActualStart is null
                    && task.ActualEnd is null
                    && !hasPendingRequest
                    && !dependentTaskIds.Contains(task.Id);
                work.Add(new MyWorkResponse(
                    project.Id, project.Number, project.Name, project.ManagerId, project.ManagerName,
                    project.Status, scheduleVersion, project.CanUpdate, isOwnDetail, canAddDetail, canDeleteDetail,
                    task.Id, task.ParentId, item.Wbs, task.Name, task.Kind, task.Origin, task.IsMilestone,
                    phase?.Wbs, phase?.Name, item.PlanStart, item.PlanFinish, item.WorkDays,
                    item.PercentComplete, item.Status, item.ActualStart, item.ActualFinish,
                    item.ForecastFinish, task.Note, pending.ActorRequests.GetValueOrDefault(task.Id),
                    Encode(task.RowVersion)!, task.UpdatedAt));
            }
        }

        return Results.Ok(work
            .OrderBy(item => item.Status == "Done")
            .ThenBy(item => item.PlanFinish)
            .ThenBy(item => item.ProjectNo, StringComparer.Ordinal)
            .ThenBy(item => item.Wbs, StringComparer.Ordinal));
    }

    private static async Task<IResult> GetMyWorkUpdatesAsync(
        SqlConnectionFactory connections,
        CurrentUserService users,
        CancellationToken cancellationToken)
    {
        await users.DemandPermissionAsync("schedule.read", cancellationToken);
        await users.DemandPermissionAsync("schedule.progress", cancellationToken);
        var actor = await users.GetRequiredAsync(cancellationToken);
        await using var connection = await connections.OpenAsync(cancellationToken);

        var updates = new List<MyUpdateRow>();
        await using (var command = new SqlCommand("""
            SELECT TOP (100)
                   s.id, s.project_id, p.project_no, p.name, s.task_id, t.name,
                   s.field, s.from_value, s.to_value, s.comment, s.request_days,
                   s.answer, s.answer_note, s.occurred_at
            FROM dbo.schedule_updates s
            INNER JOIN dbo.projects p ON p.id = s.project_id
            LEFT JOIN dbo.schedule_tasks t ON t.id = s.task_id
            WHERE s.actor_id = @actor AND p.deleted_at IS NULL
              AND (@elevated = 1 OR p.manager_id = @actor OR p.lead_engineer_id = @actor
                   OR EXISTS (SELECT 1 FROM dbo.project_members m
                              WHERE m.project_id = p.id AND m.user_id = @actor))
            ORDER BY s.occurred_at DESC, s.id DESC;
            """, connection))
        {
            command.Parameters.AddParameter("@actor", SqlDbType.BigInt, actor.Id);
            command.Parameters.AddParameter("@elevated", SqlDbType.Bit, ProjectScope.IsMyWorkElevated(actor));
            await using var reader = await command.ExecuteReaderAsync(cancellationToken);
            while (await reader.ReadAsync(cancellationToken))
            {
                updates.Add(new MyUpdateRow(
                    reader.GetInt64(0), reader.GetInt64(1), reader.GetString(2), reader.GetString(3),
                    reader.IsDBNull(4) ? null : reader.GetInt64(4), reader.IsDBNull(5) ? null : reader.GetString(5),
                    reader.GetString(6), reader.IsDBNull(7) ? null : reader.GetString(7),
                    reader.IsDBNull(8) ? null : reader.GetString(8), reader.IsDBNull(9) ? null : reader.GetString(9),
                    reader.GetInt32(10), reader.IsDBNull(11) ? null : reader.GetString(11),
                    reader.IsDBNull(12) ? null : reader.GetString(12), reader.GetFieldValue<DateTimeOffset>(13)));
            }
        }

        var wbsByTask = new Dictionary<long, string>();
        var holidays = await ReadHolidaysAsync(connection, null, cancellationToken);
        foreach (var projectId in updates.Select(update => update.ProjectId).Distinct())
        {
            var tasks = await ReadTasksAsync(connection, null, projectId, cancellationToken);
            if (tasks.Count == 0) continue;
            foreach (var item in Resolve(tasks, holidays).ById.Values)
                wbsByTask[item.Source.Id] = item.Wbs;
        }

        return Results.Ok(updates.Select(update => new
        {
            update.Id,
            update.ProjectId,
            update.ProjectNo,
            update.ProjectName,
            update.TaskId,
            wbs = update.TaskId is long taskId ? wbsByTask.GetValueOrDefault(taskId) : null,
            update.TaskName,
            update.Field,
            update.FromValue,
            update.ToValue,
            update.Comment,
            update.RequestDays,
            update.Answer,
            update.AnswerNote,
            update.OccurredAt
        }));
    }

    private static ResolvedSchedule Resolve(IReadOnlyCollection<TaskRow> tasks, IReadOnlySet<DateOnly> holidays) =>
        ScheduleCalculator.Resolve(tasks.Select(task => new ScheduleCalculationTask(
            task.Id, task.ParentId, task.SortOrder, task.PlanStart, task.PlanDays, task.StartMode,
            task.PredecessorId, task.LagDays, task.ActualStart, task.ActualEnd, task.ForecastEnd,
            task.PercentComplete, task.Status)).ToArray(), holidays);

    private static PhaseLabel? FindTopPhase(
        TaskRow task,
        IReadOnlyDictionary<long, TaskRow> tasks,
        ResolvedSchedule calculation)
    {
        TaskRow? current = task;
        PhaseLabel? phase = null;
        while (current.ParentId is long parentId && tasks.TryGetValue(parentId, out var parent))
        {
            if (parent.Kind == "phase")
                phase = new PhaseLabel(calculation.ById[parent.Id].Wbs, parent.Name);
            current = parent;
        }
        return phase;
    }

    private static async Task<PendingRequestState> ReadPendingRequestsAsync(
        SqlConnection connection,
        long projectId,
        long actorId,
        CancellationToken cancellationToken)
    {
        var actorRequests = new Dictionary<long, PendingRequestResponse>();
        var allTaskIds = new HashSet<long>();
        await using var command = new SqlCommand("""
            SELECT id, task_id, actor_id, request_days, comment, occurred_at
            FROM dbo.schedule_updates
            WHERE project_id = @project_id
              AND task_id IS NOT NULL AND field = N'request'
              AND request_days > 0 AND answer IS NULL
            ORDER BY occurred_at DESC, id DESC;
            """, connection);
        command.Parameters.AddParameter("@project_id", SqlDbType.BigInt, projectId);
        await using var reader = await command.ExecuteReaderAsync(cancellationToken);
        while (await reader.ReadAsync(cancellationToken))
        {
            var taskId = reader.GetInt64(1);
            allTaskIds.Add(taskId);
            if (reader.GetInt64(2) == actorId && !actorRequests.ContainsKey(taskId))
            {
                actorRequests[taskId] = new PendingRequestResponse(
                    reader.GetInt64(0), reader.GetInt32(3),
                    reader.IsDBNull(4) ? null : reader.GetString(4), reader.GetFieldValue<DateTimeOffset>(5));
            }
        }
        return new PendingRequestState(actorRequests, allTaskIds);
    }

    private static async Task<DayRequestLocator> ReadDayRequestLocatorAsync(
        SqlConnection connection,
        long requestId,
        CancellationToken cancellationToken)
    {
        await using var command = new SqlCommand("""
            SELECT project_id, task_id
            FROM dbo.schedule_updates
            WHERE id = @request_id AND task_id IS NOT NULL
              AND field = N'request' AND request_days > 0;
            """, connection);
        command.Parameters.AddParameter("@request_id", SqlDbType.BigInt, requestId);
        await using var reader = await command.ExecuteReaderAsync(CommandBehavior.SingleRow, cancellationToken);
        if (!await reader.ReadAsync(cancellationToken))
            throw new ApiException(StatusCodes.Status404NotFound, "schedule_day_request_not_found", "Schedule day request not found.");
        return new DayRequestLocator(reader.GetInt64(0), reader.GetInt64(1));
    }

    private static ScheduleTaskResponse ToResponse(
        ResolvedScheduleTask resolved,
        IReadOnlyCollection<TaskRow> tasks,
        IReadOnlyDictionary<long, IReadOnlyList<PicRow>> pics)
    {
        var task = tasks.First(item => item.Id == resolved.Source.Id);
        return new ScheduleTaskResponse(
            task.Id, task.ParentId, task.SortOrder, resolved.Wbs, resolved.Depth, task.Kind, task.Name,
            task.IsMilestone, task.Origin, task.Visibility, resolved.PlanStart, resolved.PlanFinish,
            task.PlanDays, resolved.WorkDays, task.StartMode, task.PredecessorId, task.LagDays,
            pics.GetValueOrDefault(task.Id, []), task.PicExternal, task.PlanManDays,
            task.BaselineStart, task.BaselineEnd, task.BaselineDays, task.BaselineRevision,
            resolved.ActualStart, resolved.ActualFinish, resolved.ForecastFinish, resolved.PercentComplete,
            resolved.Status, task.Note, task.ActualManDays, Encode(task.RowVersion)!, task.UpdatedAt, task.UpdatedBy,
            resolved.Children.Select(child => ToResponse(child, tasks, pics)).ToArray());
    }

    private static async Task<ProjectRow> ReadProjectAsync(
        SqlConnection connection,
        SqlTransaction? transaction,
        long projectId,
        bool forUpdate,
        CancellationToken cancellationToken)
    {
        var hint = forUpdate ? " WITH (UPDLOCK, HOLDLOCK)" : string.Empty;
        await using var command = new SqlCommand($"""
            SELECT id, project_no, name, manager_id, status
            FROM dbo.projects{hint}
            WHERE id = @project_id AND deleted_at IS NULL;
            """, connection, transaction);
        command.Parameters.AddParameter("@project_id", SqlDbType.BigInt, projectId);
        await using var reader = await command.ExecuteReaderAsync(CommandBehavior.SingleRow, cancellationToken);
        if (!await reader.ReadAsync(cancellationToken))
            throw new ApiException(StatusCodes.Status404NotFound, "project_not_found", "Project not found.");
        return new ProjectRow(reader.GetInt64(0), reader.GetString(1), reader.GetString(2), reader.GetInt64(3), reader.GetString(4));
    }

    private static async Task<ProjectRow> DemandPlanOwnerAsync(
        SqlConnection connection,
        SqlTransaction transaction,
        long projectId,
        CurrentUser actor,
        CancellationToken cancellationToken)
    {
        var project = await ReadProjectAsync(connection, transaction, projectId, true, cancellationToken);
        if (project.Status == "Closed")
            throw new ApiException(StatusCodes.Status409Conflict, "project_closed", "A closed project's schedule cannot be changed.");
        if (project.ManagerId != actor.Id && actor.Role is not ("Engineering Manager" or "Admin"))
            throw new ApiException(StatusCodes.Status403Forbidden, "schedule_plan_owner_required", "Only this project's manager, an Engineering Manager, or an Admin can change its plan.");
        return project;
    }

    private static async Task<List<TaskRow>> ReadTasksAsync(
        SqlConnection connection,
        SqlTransaction? transaction,
        long projectId,
        CancellationToken cancellationToken)
    {
        var tasks = new List<TaskRow>();
        await using var command = new SqlCommand("""
            SELECT id, project_id, parent_id, sort_order, kind, name, is_milestone, origin, created_by, visibility,
                   plan_start, plan_days, start_mode, predecessor_id, lag_days, pic_external, plan_man_days,
                   baseline_start, baseline_end, baseline_days, baseline_rev, actual_start, actual_end,
                   forecast_end, percent_done, status, blocked_reason, note, actual_man_days,
                   updated_by, updated_at, row_version
            FROM dbo.schedule_tasks
            WHERE project_id = @project_id AND deleted_at IS NULL
            ORDER BY parent_id, sort_order, id;
            """, connection, transaction);
        command.Parameters.AddParameter("@project_id", SqlDbType.BigInt, projectId);
        await using var reader = await command.ExecuteReaderAsync(cancellationToken);
        while (await reader.ReadAsync(cancellationToken)) tasks.Add(ReadTask(reader));
        return tasks;
    }

    private static async Task<TaskRow> ReadTaskAsync(
        SqlConnection connection,
        SqlTransaction transaction,
        long id,
        bool forUpdate,
        CancellationToken cancellationToken)
    {
        var hint = forUpdate ? " WITH (UPDLOCK, HOLDLOCK)" : string.Empty;
        await using var command = new SqlCommand($"""
            SELECT id, project_id, parent_id, sort_order, kind, name, is_milestone, origin, created_by, visibility,
                   plan_start, plan_days, start_mode, predecessor_id, lag_days, pic_external, plan_man_days,
                   baseline_start, baseline_end, baseline_days, baseline_rev, actual_start, actual_end,
                   forecast_end, percent_done, status, blocked_reason, note, actual_man_days,
                   updated_by, updated_at, row_version
            FROM dbo.schedule_tasks{hint}
            WHERE id = @id AND deleted_at IS NULL;
            """, connection, transaction);
        command.Parameters.AddParameter("@id", SqlDbType.BigInt, id);
        await using var reader = await command.ExecuteReaderAsync(CommandBehavior.SingleRow, cancellationToken);
        if (!await reader.ReadAsync(cancellationToken))
            throw new ApiException(StatusCodes.Status404NotFound, "schedule_task_not_found", "Schedule task not found.");
        return ReadTask(reader);
    }

    private static TaskRow ReadTask(SqlDataReader reader) => new(
        reader.GetInt64(0), reader.GetInt64(1), reader.IsDBNull(2) ? null : reader.GetInt64(2),
        reader.GetInt32(3), reader.GetString(4), reader.GetString(5), reader.GetBoolean(6), reader.GetString(7),
        reader.GetInt64(8), reader.GetString(9), ReadDate(reader, 10), reader.GetInt32(11), reader.GetString(12),
        reader.IsDBNull(13) ? null : reader.GetInt64(13), reader.GetInt32(14), reader.GetString(15), reader.GetDecimal(16),
        ReadDate(reader, 17), ReadDate(reader, 18), reader.GetInt32(19), reader.GetInt32(20),
        ReadDate(reader, 21), ReadDate(reader, 22), ReadDate(reader, 23), reader.GetDecimal(24), reader.GetString(25),
        reader.IsDBNull(26) ? null : reader.GetString(26), reader.IsDBNull(27) ? null : reader.GetString(27),
        reader.GetDecimal(28), reader.GetInt64(29), reader.GetFieldValue<DateTimeOffset>(30), (byte[])reader.GetValue(31));

    private static async Task<HashSet<DateOnly>> ReadHolidaysAsync(
        SqlConnection connection,
        SqlTransaction? transaction,
        CancellationToken cancellationToken)
    {
        var holidays = new HashSet<DateOnly>();
        await using var command = new SqlCommand("SELECT holiday_date FROM dbo.holidays;", connection, transaction);
        await using var reader = await command.ExecuteReaderAsync(cancellationToken);
        while (await reader.ReadAsync(cancellationToken)) holidays.Add(reader.GetFieldValue<DateOnly>(0));
        return holidays;
    }

    private static async Task<Dictionary<long, IReadOnlyList<PicRow>>> ReadPicsAsync(
        SqlConnection connection,
        SqlTransaction? transaction,
        long projectId,
        CancellationToken cancellationToken)
    {
        var mutable = new Dictionary<long, List<PicRow>>();
        await using var command = new SqlCommand("""
            SELECT pic.task_id, u.id, u.name, u.email
            FROM dbo.schedule_task_pics pic
            INNER JOIN dbo.schedule_tasks t ON t.id = pic.task_id
            INNER JOIN dbo.users u ON u.id = pic.user_id
            WHERE t.project_id = @project_id AND t.deleted_at IS NULL
            ORDER BY pic.task_id, u.name, u.id;
            """, connection, transaction);
        command.Parameters.AddParameter("@project_id", SqlDbType.BigInt, projectId);
        await using var reader = await command.ExecuteReaderAsync(cancellationToken);
        while (await reader.ReadAsync(cancellationToken))
        {
            var taskId = reader.GetInt64(0);
            if (!mutable.TryGetValue(taskId, out var list)) mutable.Add(taskId, list = []);
            list.Add(new PicRow(reader.GetInt64(1), reader.GetString(2), reader.GetString(3)));
        }
        return mutable.ToDictionary(pair => pair.Key, pair => (IReadOnlyList<PicRow>)pair.Value);
    }

    private static async Task<IReadOnlyList<object>> ReadBaselinesAsync(
        SqlConnection connection,
        long projectId,
        CancellationToken cancellationToken)
    {
        var result = new List<object>();
        await using var command = new SqlCommand("""
            SELECT b.id, b.revision, b.label, b.taken_at, u.name, b.reason, b.task_count,
                   b.promised_finish, b.snapshot_json
            FROM dbo.schedule_baselines b
            INNER JOIN dbo.users u ON u.id = b.taken_by
            WHERE b.project_id = @project_id
            ORDER BY b.revision DESC;
            """, connection);
        command.Parameters.AddParameter("@project_id", SqlDbType.BigInt, projectId);
        await using var reader = await command.ExecuteReaderAsync(cancellationToken);
        while (await reader.ReadAsync(cancellationToken))
        {
            result.Add(new
            {
                id = reader.GetInt64(0),
                revision = reader.GetInt32(1),
                label = reader.GetString(2),
                takenAt = reader.GetFieldValue<DateTimeOffset>(3),
                takenBy = reader.GetString(4),
                reason = reader.GetString(5),
                taskCount = reader.GetInt32(6),
                promisedFinish = ReadDate(reader, 7),
                snapshot = JsonSerializer.Deserialize<JsonElement>(reader.GetString(8))
            });
        }
        return result;
    }

    private static async Task<IReadOnlyList<object>> ReadUpdatesAsync(
        SqlConnection connection,
        long projectId,
        CancellationToken cancellationToken)
    {
        var result = new List<object>();
        await using var command = new SqlCommand("""
            WITH ranked_updates AS (
                SELECT s.*,
                       ROW_NUMBER() OVER (ORDER BY s.occurred_at DESC, s.id DESC) AS recent_rank
                FROM dbo.schedule_updates s
                WHERE s.project_id = @project_id
            )
            SELECT s.id, s.task_id, s.field, s.from_value, s.to_value, s.comment,
                   s.request_days, s.answer, s.answer_by, answered.name, s.answer_note, s.answered_at,
                   s.occurred_at, u.id, u.name
            FROM ranked_updates s
            INNER JOIN dbo.users u ON u.id = s.actor_id
            LEFT JOIN dbo.users answered ON answered.id = s.answer_by
            WHERE s.recent_rank <= 100
               OR (s.field = N'request' AND s.request_days > 0 AND s.answer IS NULL)
            ORDER BY s.occurred_at DESC, s.id DESC;
            """, connection);
        command.Parameters.AddParameter("@project_id", SqlDbType.BigInt, projectId);
        await using var reader = await command.ExecuteReaderAsync(cancellationToken);
        while (await reader.ReadAsync(cancellationToken))
        {
            result.Add(new
            {
                id = reader.GetInt64(0),
                taskId = reader.IsDBNull(1) ? (long?)null : reader.GetInt64(1),
                field = reader.GetString(2),
                fromValue = reader.IsDBNull(3) ? null : reader.GetString(3),
                toValue = reader.IsDBNull(4) ? null : reader.GetString(4),
                comment = reader.IsDBNull(5) ? null : reader.GetString(5),
                requestDays = reader.GetInt32(6),
                answer = reader.IsDBNull(7) ? null : reader.GetString(7),
                answerBy = reader.IsDBNull(8) ? null : new { id = reader.GetInt64(8), name = reader.GetString(9) },
                answerNote = reader.IsDBNull(10) ? null : reader.GetString(10),
                answeredAt = reader.IsDBNull(11) ? (DateTimeOffset?)null : reader.GetFieldValue<DateTimeOffset>(11),
                occurredAt = reader.GetFieldValue<DateTimeOffset>(12),
                actor = new { id = reader.GetInt64(13), name = reader.GetString(14) }
            });
        }
        return result;
    }

    private static async Task<byte[]?> GetScheduleVersionAsync(
        SqlConnection connection,
        SqlTransaction? transaction,
        long projectId,
        bool forUpdate,
        CancellationToken cancellationToken)
    {
        var hint = forUpdate ? " WITH (UPDLOCK, HOLDLOCK)" : string.Empty;
        await using var command = new SqlCommand($"""
            SELECT TOP (1) row_version
            FROM dbo.schedule_tasks{hint}
            WHERE project_id = @project_id
            ORDER BY row_version DESC;
            """, connection, transaction);
        command.Parameters.AddParameter("@project_id", SqlDbType.BigInt, projectId);
        return await command.ExecuteScalarAsync(cancellationToken) as byte[];
    }

    private static async Task ValidateScheduleVersionAsync(
        SqlConnection connection,
        SqlTransaction transaction,
        long projectId,
        string? expected,
        CancellationToken cancellationToken)
    {
        var current = await GetScheduleVersionAsync(connection, transaction, projectId, true, cancellationToken);
        if (current is null)
        {
            if (string.IsNullOrWhiteSpace(expected)) return;
            throw Concurrency();
        }
        if (string.IsNullOrWhiteSpace(expected)) throw Concurrency();
        var expectedBytes = SqlExtensions.ParseRowVersion(expected);
        if (!current.AsSpan().SequenceEqual(expectedBytes)) throw Concurrency();
    }

    private static async Task ValidateTaskReferencesAsync(
        SqlConnection connection,
        SqlTransaction transaction,
        long projectId,
        long? taskId,
        long? parentId,
        long? predecessorId,
        CancellationToken cancellationToken)
    {
        if (taskId is long existingId && (parentId == existingId || predecessorId == existingId))
            throw new ApiException(StatusCodes.Status400BadRequest, "schedule_self_reference", "A task cannot be its own parent or predecessor.");
        foreach (var reference in new[] { parentId, predecessorId }.Where(value => value is not null).Distinct())
        {
            await using var command = new SqlCommand("""
                SELECT CASE WHEN EXISTS (
                    SELECT 1 FROM dbo.schedule_tasks
                    WHERE id = @id AND project_id = @project_id AND deleted_at IS NULL
                ) THEN CAST(1 AS bit) ELSE CAST(0 AS bit) END;
                """, connection, transaction);
            command.Parameters.AddParameter("@id", SqlDbType.BigInt, reference);
            command.Parameters.AddParameter("@project_id", SqlDbType.BigInt, projectId);
            if (!(bool)(await command.ExecuteScalarAsync(cancellationToken) ?? false))
                throw new ApiException(StatusCodes.Status422UnprocessableEntity, "schedule_reference_invalid", "Parent and predecessor tasks must be active rows in the same project.");
        }
    }

    private static async Task ValidateTaskGraphAsync(
        SqlConnection connection,
        SqlTransaction transaction,
        long projectId,
        long? taskId,
        long? parentId,
        long? predecessorId,
        CancellationToken cancellationToken)
    {
        var graph = new Dictionary<long, (long? Parent, long? Predecessor)>();
        await using (var command = new SqlCommand("""
            SELECT id, parent_id, predecessor_id
            FROM dbo.schedule_tasks WITH (UPDLOCK, HOLDLOCK)
            WHERE project_id = @project_id AND deleted_at IS NULL;
            """, connection, transaction))
        {
            command.Parameters.AddParameter("@project_id", SqlDbType.BigInt, projectId);
            await using var reader = await command.ExecuteReaderAsync(cancellationToken);
            while (await reader.ReadAsync(cancellationToken))
                graph[reader.GetInt64(0)] = (reader.IsDBNull(1) ? null : reader.GetInt64(1), reader.IsDBNull(2) ? null : reader.GetInt64(2));
        }

        var key = taskId ?? -1;
        graph[key] = (parentId, predecessorId);
        var visiting = new HashSet<long>();
        var visited = new HashSet<long>();
        bool HasCycle(long id)
        {
            if (visited.Contains(id)) return false;
            if (!visiting.Add(id)) return true;
            if (graph.TryGetValue(id, out var edges))
            {
                if (edges.Parent is long parent && graph.ContainsKey(parent) && HasCycle(parent)) return true;
                if (edges.Predecessor is long predecessor && graph.ContainsKey(predecessor) && HasCycle(predecessor)) return true;
            }
            visiting.Remove(id);
            visited.Add(id);
            return false;
        }

        if (graph.Keys.Any(HasCycle))
            throw new ApiException(StatusCodes.Status409Conflict, "schedule_cycle", "The change would create a circular schedule relationship.");
    }

    private static async Task ValidateTaskHierarchyAsync(
        SqlConnection connection,
        SqlTransaction transaction,
        long projectId,
        long? taskId,
        long? parentId,
        string kind,
        CancellationToken cancellationToken)
    {
        if (kind == "phase" && parentId is not null)
            throw Invalid("A phase must be a top-level schedule row.");
        if (kind == "detail" && parentId is null)
            throw Invalid("A detail row must belong to a task.");

        if (parentId is long parent)
        {
            await using var parentKind = new SqlCommand("""
                SELECT kind
                FROM dbo.schedule_tasks WITH (UPDLOCK, HOLDLOCK)
                WHERE id = @parent_id AND project_id = @project_id AND deleted_at IS NULL;
                """, connection, transaction);
            parentKind.Parameters.AddParameter("@parent_id", SqlDbType.BigInt, parent);
            parentKind.Parameters.AddParameter("@project_id", SqlDbType.BigInt, projectId);
            var parentValue = await parentKind.ExecuteScalarAsync(cancellationToken) as string;
            var validParent = kind switch
            {
                "task" => parentValue == "phase",
                "detail" => parentValue == "task",
                _ => false
            };
            if (!validParent)
                throw new ApiException(StatusCodes.Status422UnprocessableEntity, "schedule_parent_kind_invalid", "Tasks may be top-level or belong to a phase, and detail rows must belong to a task.");
        }

        if (taskId is not long existingId) return;
        await using var children = new SqlCommand("""
            SELECT kind, COUNT_BIG(*)
            FROM dbo.schedule_tasks WITH (UPDLOCK, HOLDLOCK)
            WHERE parent_id = @task_id AND deleted_at IS NULL
            GROUP BY kind;
            """, connection, transaction);
        children.Parameters.AddParameter("@task_id", SqlDbType.BigInt, existingId);
        await using var reader = await children.ExecuteReaderAsync(cancellationToken);
        while (await reader.ReadAsync(cancellationToken))
        {
            var childKind = reader.GetString(0);
            if ((kind == "phase" && childKind != "task")
                || (kind == "task" && childKind != "detail")
                || kind == "detail")
                throw new ApiException(StatusCodes.Status422UnprocessableEntity, "schedule_child_kind_invalid", "The row kind is incompatible with its existing child rows.");
        }
    }

    private static async Task<bool> HasActiveChildrenAsync(
        SqlConnection connection,
        SqlTransaction transaction,
        long taskId,
        CancellationToken cancellationToken)
    {
        await using var command = new SqlCommand("""
            SELECT CASE WHEN EXISTS (
                SELECT 1 FROM dbo.schedule_tasks WITH (UPDLOCK, HOLDLOCK)
                WHERE parent_id = @task_id AND deleted_at IS NULL
            ) THEN CAST(1 AS bit) ELSE CAST(0 AS bit) END;
            """, connection, transaction);
        command.Parameters.AddParameter("@task_id", SqlDbType.BigInt, taskId);
        return (bool)(await command.ExecuteScalarAsync(cancellationToken) ?? false);
    }

    private static async Task<bool> HasPendingDayRequestAsync(
        SqlConnection connection,
        SqlTransaction transaction,
        long taskId,
        CancellationToken cancellationToken)
    {
        await using var command = new SqlCommand("""
            SELECT CASE WHEN EXISTS (
                SELECT 1
                FROM dbo.schedule_updates WITH (UPDLOCK, HOLDLOCK)
                WHERE task_id = @task_id
                  AND field = N'request' AND request_days > 0 AND answer IS NULL
            ) THEN CAST(1 AS bit) ELSE CAST(0 AS bit) END;
            """, connection, transaction);
        command.Parameters.AddParameter("@task_id", SqlDbType.BigInt, taskId);
        return (bool)(await command.ExecuteScalarAsync(cancellationToken) ?? false);
    }

    private static async Task DemandAssignedLeafAsync(
        SqlConnection connection,
        SqlTransaction transaction,
        TaskRow task,
        long actorId,
        CancellationToken cancellationToken)
    {
        await using var ownership = new SqlCommand("""
            SELECT CASE WHEN EXISTS (
                SELECT 1 FROM dbo.schedule_task_pics WITH (UPDLOCK, HOLDLOCK)
                WHERE task_id = @task_id AND user_id = @actor
            ) AND NOT EXISTS (
                SELECT 1 FROM dbo.schedule_tasks WITH (UPDLOCK, HOLDLOCK)
                WHERE parent_id = @task_id AND deleted_at IS NULL
            ) THEN CAST(1 AS bit) ELSE CAST(0 AS bit) END;
            """, connection, transaction);
        ownership.Parameters.AddParameter("@task_id", SqlDbType.BigInt, task.Id);
        ownership.Parameters.AddParameter("@actor", SqlDbType.BigInt, actorId);
        var assignedLeaf = (bool)(await ownership.ExecuteScalarAsync(cancellationToken) ?? false);
        if (!assignedLeaf || task.Kind == "phase")
            throw new ApiException(StatusCodes.Status403Forbidden, "schedule_pic_required", "Only an assigned PIC can change a non-phase leaf task.");
    }

    private static async Task ValidatePicsAsync(
        SqlConnection connection,
        SqlTransaction transaction,
        ProjectRow project,
        IReadOnlyList<long> picIds,
        CancellationToken cancellationToken)
    {
        foreach (var picId in picIds)
        {
            await using var command = new SqlCommand("""
                SELECT CASE WHEN EXISTS (
                    SELECT 1 FROM dbo.users u
                    WHERE u.id = @user_id AND u.is_active = 1 AND u.deleted_at IS NULL
                      AND (@user_id = @manager_id OR EXISTS (
                          SELECT 1 FROM dbo.projects p WHERE p.id = @project_id AND p.lead_engineer_id = @user_id
                      ) OR EXISTS (
                          SELECT 1 FROM dbo.project_members pm WHERE pm.project_id = @project_id AND pm.user_id = @user_id
                      ))
                ) THEN CAST(1 AS bit) ELSE CAST(0 AS bit) END;
                """, connection, transaction);
            command.Parameters.AddParameter("@user_id", SqlDbType.BigInt, picId);
            command.Parameters.AddParameter("@manager_id", SqlDbType.BigInt, project.ManagerId);
            command.Parameters.AddParameter("@project_id", SqlDbType.BigInt, project.Id);
            if (!(bool)(await command.ExecuteScalarAsync(cancellationToken) ?? false))
                throw new ApiException(StatusCodes.Status422UnprocessableEntity, "schedule_pic_invalid", "Every PIC must be an active member of the project.");
        }
    }

    private static async Task ReplacePicsAsync(
        SqlConnection connection,
        SqlTransaction transaction,
        long taskId,
        IReadOnlyList<long> picIds,
        CancellationToken cancellationToken)
    {
        await using (var delete = new SqlCommand("DELETE FROM dbo.schedule_task_pics WHERE task_id = @task_id;", connection, transaction))
        {
            delete.Parameters.AddParameter("@task_id", SqlDbType.BigInt, taskId);
            await delete.ExecuteNonQueryAsync(cancellationToken);
        }
        foreach (var picId in picIds)
        {
            await using var insert = new SqlCommand("INSERT INTO dbo.schedule_task_pics (task_id, user_id) VALUES (@task_id, @user_id);", connection, transaction);
            insert.Parameters.AddParameter("@task_id", SqlDbType.BigInt, taskId);
            insert.Parameters.AddParameter("@user_id", SqlDbType.BigInt, picId);
            await insert.ExecuteNonQueryAsync(cancellationToken);
        }
    }

    private static async Task AppendUpdateAsync(
        SqlConnection connection,
        SqlTransaction transaction,
        long projectId,
        long? taskId,
        long actorId,
        string field,
        string? before,
        string? after,
        string? comment,
        CancellationToken cancellationToken)
    {
        await using var command = new SqlCommand("""
            INSERT INTO dbo.schedule_updates (
                project_id, task_id, actor_id, field, from_value, to_value, comment)
            VALUES (@project_id, @task_id, @actor, @field, @before, @after, @comment);
            """, connection, transaction);
        command.Parameters.AddParameter("@project_id", SqlDbType.BigInt, projectId);
        command.Parameters.AddParameter("@task_id", SqlDbType.BigInt, taskId);
        command.Parameters.AddParameter("@actor", SqlDbType.BigInt, actorId);
        command.Parameters.AddParameter("@field", SqlDbType.NVarChar, field, 50);
        command.Parameters.AddParameter("@before", SqlDbType.NVarChar, before, -1);
        command.Parameters.AddParameter("@after", SqlDbType.NVarChar, after, -1);
        command.Parameters.AddParameter("@comment", SqlDbType.NVarChar, comment, -1);
        await command.ExecuteNonQueryAsync(cancellationToken);
    }

    private static async Task<bool> HasPermissionAsync(
        SqlConnection connection,
        string role,
        string permission,
        CancellationToken cancellationToken)
    {
        await using var command = new SqlCommand("""
            SELECT CASE WHEN EXISTS (
                SELECT 1 FROM dbo.roles r
                INNER JOIN dbo.role_permissions rp ON rp.role_id = r.id
                INNER JOIN dbo.permissions p ON p.id = rp.permission_id
                WHERE r.code = @role AND p.code = @permission
            ) THEN CAST(1 AS bit) ELSE CAST(0 AS bit) END;
            """, connection);
        command.Parameters.AddParameter("@role", SqlDbType.NVarChar, role, 50);
        command.Parameters.AddParameter("@permission", SqlDbType.NVarChar, permission, 100);
        return (bool)(await command.ExecuteScalarAsync(cancellationToken) ?? false);
    }

    private static void AddPlanParameters(
        SqlCommand command,
        long projectId,
        long? parentId,
        int sortOrder,
        string kind,
        string name,
        bool isMilestone,
        string visibility,
        DateOnly? planStart,
        int planDays,
        string startMode,
        long? predecessorId,
        int lagDays,
        string? picExternal,
        decimal planManDays,
        long actorId)
    {
        command.Parameters.AddParameter("@project_id", SqlDbType.BigInt, projectId);
        command.Parameters.AddParameter("@parent_id", SqlDbType.BigInt, parentId);
        command.Parameters.AddParameter("@sort_order", SqlDbType.Int, sortOrder);
        command.Parameters.AddParameter("@kind", SqlDbType.NVarChar, kind.Trim(), 20);
        command.Parameters.AddParameter("@name", SqlDbType.NVarChar, name.Trim(), 500);
        command.Parameters.AddParameter("@is_milestone", SqlDbType.Bit, isMilestone);
        command.Parameters.AddParameter("@visibility", SqlDbType.NVarChar, visibility.Trim(), 20);
        command.Parameters.AddParameter("@plan_start", SqlDbType.Date, planStart);
        command.Parameters.AddParameter("@plan_days", SqlDbType.Int, planDays);
        command.Parameters.AddParameter("@start_mode", SqlDbType.NVarChar, startMode.Trim(), 20);
        command.Parameters.AddParameter("@predecessor_id", SqlDbType.BigInt, predecessorId);
        command.Parameters.AddParameter("@lag_days", SqlDbType.Int, lagDays);
        command.Parameters.AddParameter("@pic_external", SqlDbType.NVarChar, picExternal?.Trim() ?? string.Empty, 300);
        command.Parameters.AddParameter("@plan_man_days", SqlDbType.Decimal, planManDays, precision: 9, scale: 2);
        command.Parameters.AddParameter("@actor", SqlDbType.BigInt, actorId);
    }

    private static void ValidatePlan(
        long? parentId,
        string name,
        string kind,
        string visibility,
        DateOnly? planStart,
        int planDays,
        string startMode,
        long? predecessorId,
        int lagDays,
        string? picExternal,
        decimal planManDays,
        IReadOnlyList<long>? picUserIds,
        bool isMilestone,
        bool enforcePhaseValues)
    {
        var normalizedKind = kind.Trim();
        var normalizedStartMode = startMode.Trim();
        InputValidation.RequiredText(name, 500, "Task name");
        InputValidation.OneOf(kind, "Task kind", "phase", "task", "detail");
        InputValidation.OneOf(visibility, "Visibility", "Customer", "Internal");
        InputValidation.OneOf(startMode, "Start mode", "manual", "linked");
        InputValidation.OptionalText(picExternal, 300, "External PIC");
        if (planDays is < 1 or > 3650)
            throw Invalid("Plan days must be between 1 and 3650.");
        if (lagDays is < -365 or > 3650)
            throw Invalid("Lag days must be between -365 and 3650.");
        InputValidation.DecimalRange(planManDays, 0, 1_000_000, "Plan man-days");
        InputValidation.DecimalScale(planManDays, 2, "Plan man-days");
        if (normalizedStartMode == "linked" && predecessorId is null)
            throw Invalid("A linked task requires a predecessor.");
        if (normalizedKind != "phase" && planStart is null && normalizedStartMode != "linked")
            throw Invalid("A manually scheduled task requires a plan start date.");
        if (isMilestone && planDays != 1)
            throw Invalid("A milestone must have a one-day duration.");
        var normalizedPics = NormalizePicIds(picUserIds);
        if (normalizedPics.Count > 50)
            throw Invalid("A task cannot have more than 50 PICs.");
        if (planStart is DateOnly start)
        {
            try
            {
                _ = start.AddDays(planDays - 1);
            }
            catch (ArgumentOutOfRangeException)
            {
                throw Invalid("The plan date and duration exceed the supported date range.");
            }
        }
        if (normalizedKind == "phase" && enforcePhaseValues)
            ValidatePhaseValues(parentId, planStart, planDays, normalizedStartMode, predecessorId, lagDays,
                normalizedPics, picExternal, planManDays, isMilestone);
        if (normalizedKind == "detail" && parentId is null)
            throw Invalid("A detail row must belong to a task.");
    }

    private static void ValidateProgress(UpdateScheduleProgressRequest request)
    {
        var status = request.Status.Trim();
        InputValidation.DecimalRange(request.PercentComplete, 0, 100, "Percent complete");
        InputValidation.DecimalScale(request.PercentComplete, 2, "Percent complete");
        InputValidation.OneOf(request.Status, "Schedule status", "Not Started", "In Progress", "Blocked", "Done");
        InputValidation.OptionalText(request.Remark, 20_000, "Remark");
        if (status == "Blocked" && string.IsNullOrWhiteSpace(request.Remark))
            throw Invalid("A blocked task requires a non-empty reason.");
        if (request.ActualFinish is not null && request.ActualStart is null)
            throw Invalid("Actual finish requires an actual start.");
        if (request.ActualFinish < request.ActualStart)
            throw Invalid("Actual finish cannot be before actual start.");
        if (request.ForecastFinish is not null && request.ActualStart is not null
            && request.ForecastFinish < request.ActualStart)
            throw Invalid("Forecast finish cannot be before actual start.");
        if (status == "Done" && (request.PercentComplete != 100 || request.ActualStart is null || request.ActualFinish is null))
            throw Invalid("A completed task requires 100 percent and both actual dates.");
        if (status != "Done" && request.PercentComplete == 100)
            throw Invalid("A task at 100 percent must have status Done.");
        if (status == "Not Started" && (request.PercentComplete != 0 || request.ActualStart is not null || request.ActualFinish is not null))
            throw Invalid("A task that has not started cannot have progress or actual dates.");
    }

    private static IReadOnlyList<long> NormalizePicIds(IReadOnlyList<long>? ids)
    {
        var result = (ids ?? []).Distinct().ToArray();
        if (result.Any(id => id <= 0)) throw Invalid("PIC user ids must be positive.");
        return result;
    }

    private static void ValidatePhaseValues(
        long? parentId,
        DateOnly? planStart,
        int planDays,
        string startMode,
        long? predecessorId,
        int lagDays,
        IReadOnlyList<long> picIds,
        string? picExternal,
        decimal planManDays,
        bool isMilestone)
    {
        if (parentId is not null || planStart is not null || planDays != 1 || startMode.Trim() != "manual"
            || predecessorId is not null || lagDays != 0 || picIds.Count != 0
            || !string.IsNullOrWhiteSpace(picExternal) || planManDays != 0 || isMilestone)
            throw Invalid("A phase is a top-level roll-up row and cannot contain task dates, dependencies, PICs, effort, or milestone values.");
    }

    private static bool PlanFieldsChanged(TaskRow before, UpdateSchedulePlanRequest after) =>
        before.PlanStart != after.PlanStart
        || before.PlanDays != after.PlanDays
        || before.StartMode != after.StartMode.Trim()
        || before.PredecessorId != after.PredecessorId
        || before.LagDays != after.LagDays;

    private static bool PendingRequestSensitivePlanFieldsChanged(
        TaskRow before,
        UpdateSchedulePlanRequest after,
        IReadOnlyCollection<long> beforePicIds,
        IReadOnlyCollection<long> afterPicIds) =>
        before.ParentId != after.ParentId
        || before.SortOrder != after.SortOrder
        || before.Kind != after.Kind.Trim()
        || before.Name != after.Name.Trim()
        || before.IsMilestone != after.IsMilestone
        || before.Visibility != after.Visibility.Trim()
        || PlanFieldsChanged(before, after)
        || before.PlanManDays != after.PlanManDays
        || before.PicExternal != (after.PicExternal?.Trim() ?? string.Empty)
        || !beforePicIds.Order().SequenceEqual(afterPicIds.Order());

    private static IEnumerable<FieldChange> ProgressChanges(TaskRow before, UpdateScheduleProgressRequest after)
    {
        if (before.PercentComplete != after.PercentComplete)
            yield return new FieldChange("percent_complete", Invariant(before.PercentComplete), Invariant(after.PercentComplete));
        if (before.ActualStart != after.ActualStart)
            yield return new FieldChange("actual_start", Invariant(before.ActualStart), Invariant(after.ActualStart));
        if (before.ActualEnd != after.ActualFinish)
            yield return new FieldChange("actual_finish", Invariant(before.ActualEnd), Invariant(after.ActualFinish));
        if (before.ForecastEnd != after.ForecastFinish)
            yield return new FieldChange("forecast_finish", Invariant(before.ForecastEnd), Invariant(after.ForecastFinish));
        if (before.Status != after.Status.Trim())
            yield return new FieldChange("status", before.Status, after.Status.Trim());
        var blockedReason = after.Status.Trim() == "Blocked" ? after.Remark?.Trim() : null;
        if ((before.BlockedReason ?? string.Empty) != (blockedReason ?? string.Empty))
            yield return new FieldChange("blocked_reason", before.BlockedReason, blockedReason);
        if ((before.Note ?? string.Empty) != (after.Remark?.Trim() ?? string.Empty))
            yield return new FieldChange("remark", before.Note, after.Remark?.Trim());
    }

    private static object PlanAudit(TaskRow task, IReadOnlyList<long> picUserIds) => new
    {
        task.ParentId,
        task.SortOrder,
        task.Kind,
        task.Name,
        task.IsMilestone,
        task.Visibility,
        task.PlanStart,
        task.PlanDays,
        task.StartMode,
        task.PredecessorId,
        task.LagDays,
        PicUserIds = picUserIds,
        task.PicExternal,
        task.PlanManDays
    };

    private static int CalendarDays(DateOnly? start, DateOnly? finish) =>
        start is null || finish is null || finish < start
            ? 0
            : checked(finish.Value.DayNumber - start.Value.DayNumber + 1);

    private static DateOnly? ReadDate(SqlDataReader reader, int ordinal) =>
        reader.IsDBNull(ordinal) ? null : reader.GetFieldValue<DateOnly>(ordinal);

    private static string? Encode(byte[]? value) => value is null ? null : Convert.ToBase64String(value);

    private static string? Invariant(decimal? value) => value?.ToString(CultureInfo.InvariantCulture);
    private static string? Invariant(DateOnly? value) => value?.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture);

    private static DateOnly? Minimum(IEnumerable<DateOnly?> values) =>
        values.Where(value => value is not null).Select(value => value!.Value).Cast<DateOnly?>().Min();

    private static DateOnly? Maximum(IEnumerable<DateOnly?> values) =>
        values.Where(value => value is not null).Select(value => value!.Value).Cast<DateOnly?>().Max();

    private static ApiException Concurrency() =>
        new(StatusCodes.Status409Conflict, "concurrency_conflict", "The schedule changed. Reload it and try again.");

    private static ApiException PendingDayRequestBlocksStructure() =>
        new(StatusCodes.Status409Conflict, "schedule_day_request_pending",
            "Answer the pending request for more days before changing this task's child rows.");

    private static ApiException PendingDayRequestBlocksPlanChange() =>
        new(StatusCodes.Status409Conflict, "schedule_day_request_pending",
            "Answer the pending request for more days before changing this task's plan or assignment.");

    private static ApiException Invalid(string message) =>
        new(StatusCodes.Status400BadRequest, "validation_failed", message);

    private sealed record ProjectRow(long Id, string Number, string Name, long ManagerId, string Status);
    private sealed record WorkProjectRow(
        long Id,
        string Number,
        string Name,
        long ManagerId,
        string ManagerName,
        string Status,
        bool CanUpdate);
    private sealed record PicRow(long Id, string Name, string Email);
    private sealed record FieldChange(string Field, string? Before, string? After);
    private sealed record PhaseLabel(string Wbs, string Name);
    private sealed record PendingRequestResponse(long Id, int RequestDays, string? Comment, DateTimeOffset OccurredAt);
    private sealed record PendingRequestState(
        IReadOnlyDictionary<long, PendingRequestResponse> ActorRequests,
        IReadOnlySet<long> AllTaskIds);
    private sealed record DayRequestLocator(long ProjectId, long TaskId);
    private sealed record MyUpdateRow(
        long Id,
        long ProjectId,
        string ProjectNo,
        string ProjectName,
        long? TaskId,
        string? TaskName,
        string Field,
        string? FromValue,
        string? ToValue,
        string? Comment,
        int RequestDays,
        string? Answer,
        string? AnswerNote,
        DateTimeOffset OccurredAt);
    private sealed record MyWorkResponse(
        long ProjectId,
        string ProjectNo,
        string ProjectName,
        long ManagerId,
        string ManagerName,
        string ProjectStatus,
        string? ScheduleVersion,
        bool CanUpdate,
        bool IsOwnDetail,
        bool CanAddDetail,
        bool CanDeleteDetail,
        long TaskId,
        long? ParentId,
        string Wbs,
        string Name,
        string Kind,
        string Origin,
        bool IsMilestone,
        string? PhaseWbs,
        string? PhaseName,
        DateOnly? PlanStart,
        DateOnly? PlanFinish,
        int WorkDays,
        decimal PercentComplete,
        string Status,
        DateOnly? ActualStart,
        DateOnly? ActualFinish,
        DateOnly? ForecastFinish,
        string? Remark,
        PendingRequestResponse? PendingRequest,
        string RowVersion,
        DateTimeOffset UpdatedAt);

    private sealed record ScheduleTaskResponse(
        long Id,
        long? ParentId,
        int SortOrder,
        string Wbs,
        int Depth,
        string Kind,
        string Name,
        bool IsMilestone,
        string Origin,
        string Visibility,
        DateOnly? PlanStart,
        DateOnly? PlanFinish,
        int PlanDays,
        int WorkDays,
        string StartMode,
        long? PredecessorId,
        int LagDays,
        IReadOnlyList<PicRow> Pics,
        string PicExternal,
        decimal PlanManDays,
        DateOnly? BaselineStart,
        DateOnly? BaselineFinish,
        int BaselineDays,
        int BaselineRevision,
        DateOnly? ActualStart,
        DateOnly? ActualFinish,
        DateOnly? ForecastFinish,
        decimal PercentComplete,
        string Status,
        string? Remark,
        decimal ActualManDays,
        string RowVersion,
        DateTimeOffset UpdatedAt,
        long UpdatedBy,
        IReadOnlyList<ScheduleTaskResponse> Children);

    private sealed record TaskRow(
        long Id,
        long ProjectId,
        long? ParentId,
        int SortOrder,
        string Kind,
        string Name,
        bool IsMilestone,
        string Origin,
        long CreatedBy,
        string Visibility,
        DateOnly? PlanStart,
        int PlanDays,
        string StartMode,
        long? PredecessorId,
        int LagDays,
        string PicExternal,
        decimal PlanManDays,
        DateOnly? BaselineStart,
        DateOnly? BaselineEnd,
        int BaselineDays,
        int BaselineRevision,
        DateOnly? ActualStart,
        DateOnly? ActualEnd,
        DateOnly? ForecastEnd,
        decimal PercentComplete,
        string Status,
        string? BlockedReason,
        string? Note,
        decimal ActualManDays,
        long UpdatedBy,
        DateTimeOffset UpdatedAt,
        byte[] RowVersion);
}
