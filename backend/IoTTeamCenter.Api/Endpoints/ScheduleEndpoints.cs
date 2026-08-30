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

        app.MapGet("/api/v1/me/work", GetMyWorkAsync).RequireAuthorization();
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

            await ValidateTaskReferencesAsync(connection, transaction, existing.ProjectId, id, request.ParentId, request.PredecessorId, cancellationToken);
            await ValidateTaskGraphAsync(connection, transaction, existing.ProjectId, id, request.ParentId, request.PredecessorId, cancellationToken);
            await ValidateTaskHierarchyAsync(connection, transaction, existing.ProjectId, id, request.ParentId, request.Kind.Trim(), cancellationToken);
            var picIds = NormalizePicIds(request.PicUserIds);
            await ValidatePicsAsync(connection, transaction, project, picIds, cancellationToken);
            var existingPics = (await ReadPicsAsync(connection, transaction, existing.ProjectId, cancellationToken))
                .GetValueOrDefault(id, [])
                .Select(pic => pic.Id)
                .ToArray();

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
            await ProjectScope.DemandAsync(connection, transaction, existing.ProjectId, actor, cancellationToken);
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
                    status = @status, note = @remark, updated_by = @actor, updated_at = SYSUTCDATETIME()
                OUTPUT inserted.row_version INTO @changed(row_version)
                WHERE id = @id AND deleted_at IS NULL AND row_version = @row_version;

                SELECT row_version FROM @changed;
                """, connection, transaction))
            {
                update.Parameters.AddParameter("@percent", SqlDbType.Decimal, request.PercentComplete, precision: 5, scale: 2);
                update.Parameters.AddParameter("@actual_start", SqlDbType.Date, request.ActualStart);
                update.Parameters.AddParameter("@actual_finish", SqlDbType.Date, request.ActualFinish);
                update.Parameters.AddParameter("@status", SqlDbType.NVarChar, request.Status.Trim(), 30);
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
                existing.Status,
                remark = existing.Note
            };
            var after = new
            {
                request.PercentComplete,
                request.ActualStart,
                request.ActualFinish,
                status = request.Status.Trim(),
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
        await users.DemandPermissionAsync("schedule.progress", cancellationToken);
        var actor = await users.GetRequiredAsync(cancellationToken);
        await using var connection = await connections.OpenAsync(cancellationToken);
        var holidays = await ReadHolidaysAsync(connection, null, cancellationToken);

        var projects = new List<ProjectRow>();
        await using (var command = new SqlCommand("""
            SELECT DISTINCT p.id, p.project_no, p.name, p.manager_id, p.status
            FROM dbo.projects p
            INNER JOIN dbo.schedule_tasks t ON t.project_id = p.id AND t.deleted_at IS NULL
            INNER JOIN dbo.schedule_task_pics pic ON pic.task_id = t.id
            WHERE pic.user_id = @actor AND p.deleted_at IS NULL;
            """, connection))
        {
            command.Parameters.AddParameter("@actor", SqlDbType.BigInt, actor.Id);
            await using var reader = await command.ExecuteReaderAsync(cancellationToken);
            while (await reader.ReadAsync(cancellationToken))
                projects.Add(new ProjectRow(reader.GetInt64(0), reader.GetString(1), reader.GetString(2), reader.GetInt64(3), reader.GetString(4)));
        }

        var work = new List<MyWorkResponse>();
        foreach (var project in projects)
        {
            var tasks = await ReadTasksAsync(connection, null, project.Id, cancellationToken);
            var pics = await ReadPicsAsync(connection, null, project.Id, cancellationToken);
            var calculation = Resolve(tasks, holidays);
            foreach (var task in tasks.Where(task => pics.GetValueOrDefault(task.Id, []).Any(pic => pic.Id == actor.Id)))
            {
                var item = calculation.ById[task.Id];
                work.Add(new MyWorkResponse(
                    project.Id, project.Number, project.Name, task.Id, task.ParentId, item.Wbs,
                    task.Name, item.PlanStart, item.PlanFinish, item.WorkDays, item.PercentComplete,
                    item.Status, item.ActualStart, item.ActualFinish, task.Note, Encode(task.RowVersion)!, task.UpdatedAt));
            }
        }

        return Results.Ok(work
            .OrderBy(item => item.Status == "Done")
            .ThenBy(item => item.PlanFinish)
            .ThenBy(item => item.ProjectNo, StringComparer.Ordinal)
            .ThenBy(item => item.Wbs, StringComparer.Ordinal));
    }

    private static ResolvedSchedule Resolve(IReadOnlyCollection<TaskRow> tasks, IReadOnlySet<DateOnly> holidays) =>
        ScheduleCalculator.Resolve(tasks.Select(task => new ScheduleCalculationTask(
            task.Id, task.ParentId, task.SortOrder, task.PlanStart, task.PlanDays, task.StartMode,
            task.PredecessorId, task.LagDays, task.ActualStart, task.ActualEnd, task.ForecastEnd,
            task.PercentComplete, task.Status)).ToArray(), holidays);

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
            SELECT id, project_id, parent_id, sort_order, kind, name, is_milestone, origin, visibility,
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
            SELECT id, project_id, parent_id, sort_order, kind, name, is_milestone, origin, visibility,
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
        reader.GetString(8), ReadDate(reader, 9), reader.GetInt32(10), reader.GetString(11),
        reader.IsDBNull(12) ? null : reader.GetInt64(12), reader.GetInt32(13), reader.GetString(14), reader.GetDecimal(15),
        ReadDate(reader, 16), ReadDate(reader, 17), reader.GetInt32(18), reader.GetInt32(19),
        ReadDate(reader, 20), ReadDate(reader, 21), ReadDate(reader, 22), reader.GetDecimal(23), reader.GetString(24),
        reader.IsDBNull(25) ? null : reader.GetString(25), reader.IsDBNull(26) ? null : reader.GetString(26),
        reader.GetDecimal(27), reader.GetInt64(28), reader.GetFieldValue<DateTimeOffset>(29), (byte[])reader.GetValue(30));

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
            SELECT TOP (100) s.id, s.task_id, s.field, s.from_value, s.to_value, s.comment,
                   s.occurred_at, u.id, u.name
            FROM dbo.schedule_updates s
            INNER JOIN dbo.users u ON u.id = s.actor_id
            WHERE s.project_id = @project_id
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
                occurredAt = reader.GetFieldValue<DateTimeOffset>(6),
                actor = new { id = reader.GetInt64(7), name = reader.GetString(8) }
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
        if (request.ActualFinish is not null && request.ActualStart is null)
            throw Invalid("Actual finish requires an actual start.");
        if (request.ActualFinish < request.ActualStart)
            throw Invalid("Actual finish cannot be before actual start.");
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

    private static IEnumerable<FieldChange> ProgressChanges(TaskRow before, UpdateScheduleProgressRequest after)
    {
        if (before.PercentComplete != after.PercentComplete)
            yield return new FieldChange("percent_complete", Invariant(before.PercentComplete), Invariant(after.PercentComplete));
        if (before.ActualStart != after.ActualStart)
            yield return new FieldChange("actual_start", Invariant(before.ActualStart), Invariant(after.ActualStart));
        if (before.ActualEnd != after.ActualFinish)
            yield return new FieldChange("actual_finish", Invariant(before.ActualEnd), Invariant(after.ActualFinish));
        if (before.Status != after.Status.Trim())
            yield return new FieldChange("status", before.Status, after.Status.Trim());
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

    private static ApiException Invalid(string message) =>
        new(StatusCodes.Status400BadRequest, "validation_failed", message);

    private sealed record ProjectRow(long Id, string Number, string Name, long ManagerId, string Status);
    private sealed record PicRow(long Id, string Name, string Email);
    private sealed record FieldChange(string Field, string? Before, string? After);
    private sealed record MyWorkResponse(
        long ProjectId,
        string ProjectNo,
        string ProjectName,
        long TaskId,
        long? ParentId,
        string Wbs,
        string Name,
        DateOnly? PlanStart,
        DateOnly? PlanFinish,
        int WorkDays,
        decimal PercentComplete,
        string Status,
        DateOnly? ActualStart,
        DateOnly? ActualFinish,
        string? Remark,
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
