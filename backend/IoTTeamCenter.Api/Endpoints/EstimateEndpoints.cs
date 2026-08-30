using System.Data;
using IoTTeamCenter.Api.Infrastructure;
using IoTTeamCenter.Api.Models;
using Microsoft.Data.SqlClient;

namespace IoTTeamCenter.Api.Endpoints;

public static class EstimateEndpoints
{
    public static void MapEstimateEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/v1/estimates").RequireAuthorization();
        group.MapGet("/", ListAsync);
        group.MapPost("/", CreateAsync);
        group.MapGet("/{id:long}/validation", ValidateAsync);
        group.MapPost("/{id:long}/submit", SubmitAsync);
        group.MapPost("/{id:long}/approve", ApproveAsync);
        group.MapPost("/{id:long}/request-revision", RequestRevisionAsync);
    }

    private static async Task<IResult> ListAsync(
        int page,
        int pageSize,
        string? search,
        string? status,
        SqlConnectionFactory connections,
        CurrentUserService users,
        CancellationToken cancellationToken)
    {
        await users.DemandPermissionAsync("estimate.read", cancellationToken);
        page = Math.Max(1, page);
        pageSize = Math.Clamp(pageSize == 0 ? 25 : pageSize, 1, 100);
        await using var connection = await connections.OpenAsync(cancellationToken);
        await using var command = new SqlCommand("""
            SELECT
                e.id, e.estimate_no, i.inquiry_no, e.customer_id, c.name,
                e.project_name, e.project_type, e.owner_id, u.name, e.revision,
                e.due_date, e.status, e.progress,
                t.material_total, t.engineering_total, t.total,
                e.updated_at, e.row_version, COUNT_BIG(*) OVER()
            FROM dbo.estimates e
            INNER JOIN dbo.inquiries i ON i.id = e.inquiry_id
            INNER JOIN dbo.customers c ON c.id = e.customer_id
            INNER JOIN dbo.users u ON u.id = e.owner_id
            INNER JOIN dbo.v_estimate_totals t ON t.estimate_id = e.id
            WHERE e.deleted_at IS NULL
              AND (@status IS NULL OR e.status = @status)
              AND (@search IS NULL OR e.estimate_no LIKE N'%' + @search + N'%'
                   OR i.inquiry_no LIKE N'%' + @search + N'%'
                   OR e.project_name LIKE N'%' + @search + N'%'
                   OR c.name LIKE N'%' + @search + N'%')
            ORDER BY e.updated_at DESC, e.id DESC
            OFFSET @offset ROWS FETCH NEXT @page_size ROWS ONLY;
            """, connection);
        command.Parameters.AddParameter("@status", SqlDbType.NVarChar, string.IsNullOrWhiteSpace(status) ? null : status.Trim(), 50);
        command.Parameters.AddParameter("@search", SqlDbType.NVarChar, string.IsNullOrWhiteSpace(search) ? null : search.Trim(), 200);
        command.Parameters.AddParameter("@offset", SqlDbType.Int, (page - 1) * pageSize);
        command.Parameters.AddParameter("@page_size", SqlDbType.Int, pageSize);

        var items = new List<EstimateSummary>();
        long total = 0;
        await using var reader = await command.ExecuteReaderAsync(cancellationToken);
        while (await reader.ReadAsync(cancellationToken))
        {
            total = reader.GetInt64(18);
            items.Add(new EstimateSummary(
                reader.GetInt64(0), reader.GetString(1), reader.GetString(2), reader.GetInt64(3), reader.GetString(4),
                reader.GetString(5), reader.GetString(6), reader.GetInt64(7), reader.GetString(8), reader.GetInt32(9),
                reader.GetFieldValue<DateOnly>(10), reader.GetString(11), reader.GetDecimal(12), reader.GetDecimal(13),
                reader.GetDecimal(14), reader.GetDecimal(15), reader.GetFieldValue<DateTimeOffset>(16), reader.RowVersionString(17)));
        }
        return Results.Ok(new PagedResult<EstimateSummary>(items, page, pageSize, total));
    }

    private static async Task<IResult> CreateAsync(
        CreateEstimateRequest request,
        SqlConnectionFactory connections,
        CurrentUserService users,
        BusinessClock clock,
        CancellationToken cancellationToken)
    {
        await users.DemandPermissionAsync("estimate.write", cancellationToken);
        var actor = await users.GetRequiredAsync(cancellationToken);
        if (request.InquiryId <= 0 || request.OwnerId <= 0 || request.ContingencyRate is < 0 or > 100)
            throw new ApiException(StatusCodes.Status400BadRequest, "validation_failed", "Inquiry, owner and a valid contingency rate are required.");
        InputValidation.DecimalScale(request.ContingencyRate, 4, "Contingency rate");
        if (!HasEstimateManagerOverride(actor) && request.OwnerId != actor.Id)
            throw new ApiException(StatusCodes.Status403Forbidden, "estimate_owner_required", "Only an engineering manager or administrator can create an estimate for another owner.");
        var today = clock.Today;
        if (request.DueDate < today || request.DueDate > today.AddYears(5))
            throw new ApiException(StatusCodes.Status400BadRequest, "validation_failed", "Due date must be between today and five years from today.");

        await using var connection = await connections.OpenAsync(cancellationToken);
        await using var transaction = await connection.BeginTransactionAsync(IsolationLevel.Serializable, cancellationToken);
        try
        {
            long customerId;
            string projectName;
            string projectType;
            string inquiryNo;
            long inquiryOwnerId;
            string inquiryStatus;
            long? existingEstimateId;
            await using (var lookup = new SqlCommand("""
                SELECT customer_id, project_name, project_type, inquiry_no,
                       estimate_owner_id, status, estimate_id
                FROM dbo.inquiries WITH (UPDLOCK, HOLDLOCK)
                WHERE id = @id AND deleted_at IS NULL;
                """, connection, (SqlTransaction)transaction))
            {
                lookup.Parameters.AddParameter("@id", SqlDbType.BigInt, request.InquiryId);
                await using var reader = await lookup.ExecuteReaderAsync(CommandBehavior.SingleRow, cancellationToken);
                if (!await reader.ReadAsync(cancellationToken))
                    throw new ApiException(StatusCodes.Status404NotFound, "inquiry_not_found", "Inquiry not found.");
                customerId = reader.GetInt64(0);
                projectName = reader.GetString(1);
                projectType = reader.GetString(2);
                inquiryNo = reader.GetString(3);
                inquiryOwnerId = reader.GetInt64(4);
                inquiryStatus = reader.GetString(5);
                existingEstimateId = reader.IsDBNull(6) ? null : reader.GetInt64(6);
            }

            if (!string.Equals(inquiryStatus, "New", StringComparison.Ordinal) || existingEstimateId is not null)
                throw new ApiException(StatusCodes.Status409Conflict, "inquiry_not_eligible", "Only a new inquiry without an existing estimate can be converted to an estimate.");
            if (!HasEstimateManagerOverride(actor) && inquiryOwnerId != actor.Id)
                throw new ApiException(StatusCodes.Status403Forbidden, "inquiry_owner_required", "Only the assigned inquiry owner, an engineering manager or an administrator can create its estimate.");

            await ValidateActiveOwnerAsync(connection, (SqlTransaction)transaction, request.OwnerId, cancellationToken);

            var number = await InquiryEndpoints.IssueNumberAsync(connection, (SqlTransaction)transaction, "EST", today, cancellationToken);
            long id;
            byte[] rowVersion;
            await using (var insert = new SqlCommand("""
                INSERT INTO dbo.estimates (
                    estimate_no, inquiry_id, customer_id, project_name, project_type, owner_id,
                    revision, created_date, due_date, status, progress, contingency_rate, created_by, updated_by)
                OUTPUT inserted.id, inserted.row_version
                VALUES (@number, @inquiry_id, @customer_id, @project_name, @project_type, @owner_id,
                    0, @today, @due_date, N'Draft', 0, @contingency_rate, @actor, @actor);
                """, connection, (SqlTransaction)transaction))
            {
                insert.Parameters.AddParameter("@number", SqlDbType.NVarChar, number, 30);
                insert.Parameters.AddParameter("@inquiry_id", SqlDbType.BigInt, request.InquiryId);
                insert.Parameters.AddParameter("@customer_id", SqlDbType.BigInt, customerId);
                insert.Parameters.AddParameter("@project_name", SqlDbType.NVarChar, projectName, 300);
                insert.Parameters.AddParameter("@project_type", SqlDbType.NVarChar, projectType, 100);
                insert.Parameters.AddParameter("@owner_id", SqlDbType.BigInt, request.OwnerId);
                insert.Parameters.AddParameter("@today", SqlDbType.Date, today);
                insert.Parameters.AddParameter("@due_date", SqlDbType.Date, request.DueDate);
                insert.Parameters.AddParameter("@contingency_rate", SqlDbType.Decimal, request.ContingencyRate).Precision = 9;
                insert.Parameters["@contingency_rate"].Scale = 4;
                insert.Parameters.AddParameter("@actor", SqlDbType.BigInt, actor.Id);
                await using var reader = await insert.ExecuteReaderAsync(CommandBehavior.SingleRow, cancellationToken);
                await reader.ReadAsync(cancellationToken);
                id = reader.GetInt64(0);
                rowVersion = (byte[])reader.GetValue(1);
            }

            await using (var updateInquiry = new SqlCommand("""
                UPDATE dbo.inquiries
                SET estimate_id = @estimate_id, status = N'Estimating', updated_by = @actor, updated_at = SYSUTCDATETIME()
                WHERE id = @inquiry_id AND status = N'New' AND estimate_id IS NULL AND deleted_at IS NULL;
                """, connection, (SqlTransaction)transaction))
            {
                updateInquiry.Parameters.AddParameter("@estimate_id", SqlDbType.BigInt, id);
                updateInquiry.Parameters.AddParameter("@actor", SqlDbType.BigInt, actor.Id);
                updateInquiry.Parameters.AddParameter("@inquiry_id", SqlDbType.BigInt, request.InquiryId);
                if (await updateInquiry.ExecuteNonQueryAsync(cancellationToken) != 1)
                    throw new ApiException(StatusCodes.Status409Conflict, "inquiry_not_eligible", "The inquiry can no longer be converted to an estimate.");
            }

            await InquiryEndpoints.InsertAuditAsync(connection, (SqlTransaction)transaction, actor.Id, "Estimate", id, number, "Created from inquiry", inquiryNo, request, cancellationToken);
            await transaction.CommitAsync(cancellationToken);
            return Results.Created($"/api/v1/estimates/{id}", new { id, number, rowVersion = Convert.ToBase64String(rowVersion) });
        }
        catch
        {
            await transaction.RollbackAsync(cancellationToken);
            throw;
        }
    }

    private static async Task<IResult> ValidateAsync(
        long id,
        SqlConnectionFactory connections,
        CurrentUserService users,
        CancellationToken cancellationToken)
    {
        await users.DemandPermissionAsync("estimate.read", cancellationToken);
        await using var connection = await connections.OpenAsync(cancellationToken);
        var issues = await GetValidationIssuesAsync(connection, null, id, cancellationToken);
        return Results.Ok(new { estimateId = id, valid = issues.Count == 0, issues });
    }

    private static Task<IResult> SubmitAsync(long id, WorkflowRequest request, SqlConnectionFactory connections, CurrentUserService users, CancellationToken cancellationToken)
    {
        ValidateWorkflowRequest(request, requireComment: false);
        return TransitionAsync(
            id, request, "estimate.write",
            targetStatus: "Engineering Review", targetProgress: 90,
            inquiryStatus: "Engineering Review", inquiryProgress: 90,
            allowedStatuses: ["Draft", "Engineering Input", "Revision Required"],
            action: "Submitted", connections, users, validate: true, requireEstimateOwner: true, cancellationToken);
    }

    private static Task<IResult> ApproveAsync(long id, WorkflowRequest request, SqlConnectionFactory connections, CurrentUserService users, CancellationToken cancellationToken)
    {
        ValidateWorkflowRequest(request, requireComment: false);
        return TransitionAsync(
            id, request, "estimate.approve",
            targetStatus: "Approved", targetProgress: 100,
            inquiryStatus: "Approved", inquiryProgress: 100,
            allowedStatuses: ["Engineering Review"],
            action: "Approved", connections, users, validate: true, requireEstimateOwner: false, cancellationToken);
    }

    private static async Task<IResult> RequestRevisionAsync(
        long id,
        WorkflowRequest request,
        SqlConnectionFactory connections,
        CurrentUserService users,
        CancellationToken cancellationToken)
    {
        InputValidation.RequiredText(request.RowVersion, 100, "Estimate row version");
        InputValidation.RequiredText(request.Comment, 100, "Revision reason");
        var reason = request.Comment!.Trim();

        await users.DemandPermissionAsync("estimate.approve", cancellationToken);
        var actor = await users.GetRequiredAsync(cancellationToken);
        var expectedRowVersion = SqlExtensions.ParseRowVersion(request.RowVersion);
        await using var connection = await connections.OpenAsync(cancellationToken);
        await using var transaction = (SqlTransaction)await connection.BeginTransactionAsync(IsolationLevel.Serializable, cancellationToken);
        try
        {
            string number;
            string currentStatus;
            decimal currentProgress;
            int currentRevision;
            long inquiryId;
            string inquiryNumber;
            string inquiryCurrentStatus;
            decimal inquiryCurrentProgress;
            byte[] actualRowVersion;
            await using (var lookup = new SqlCommand("""
                SELECT e.estimate_no, e.status, e.progress, e.revision, e.inquiry_id, e.row_version,
                       i.inquiry_no, i.status, i.progress
                FROM dbo.estimates e WITH (UPDLOCK, HOLDLOCK)
                INNER JOIN dbo.inquiries i WITH (UPDLOCK, HOLDLOCK) ON i.id = e.inquiry_id
                WHERE e.id = @id AND e.deleted_at IS NULL AND i.deleted_at IS NULL;
                """, connection, transaction))
            {
                lookup.Parameters.AddParameter("@id", SqlDbType.BigInt, id);
                await using var reader = await lookup.ExecuteReaderAsync(CommandBehavior.SingleRow, cancellationToken);
                if (!await reader.ReadAsync(cancellationToken))
                    throw new ApiException(StatusCodes.Status404NotFound, "estimate_not_found", "Estimate or its linked inquiry was not found.");
                number = reader.GetString(0);
                currentStatus = reader.GetString(1);
                currentProgress = reader.GetDecimal(2);
                currentRevision = reader.GetInt32(3);
                inquiryId = reader.GetInt64(4);
                actualRowVersion = (byte[])reader.GetValue(5);
                inquiryNumber = reader.GetString(6);
                inquiryCurrentStatus = reader.GetString(7);
                inquiryCurrentProgress = reader.GetDecimal(8);
            }

            if (!actualRowVersion.AsSpan().SequenceEqual(expectedRowVersion))
                throw new ApiException(StatusCodes.Status409Conflict, "concurrency_conflict", "This estimate was changed by another user. Reload and try again.");
            if (!string.Equals(currentStatus, "Engineering Review", StringComparison.OrdinalIgnoreCase))
                throw new ApiException(StatusCodes.Status409Conflict, "invalid_transition", $"Cannot request a revision while the estimate is '{currentStatus}'.");

            await SnapshotRevisionAsync(connection, transaction, id, currentRevision, reason, actor.Id, cancellationToken);

            var nextRevision = checked(currentRevision + 1);
            await CloneCurrentCostsAsync(connection, transaction, id, currentRevision, nextRevision, actor.Id, cancellationToken);

            byte[] nextRowVersion;
            await using (var updateEstimate = new SqlCommand("""
                UPDATE dbo.estimates
                SET revision = @next_revision, status = N'Revision Required', progress = 75,
                    locked_at = NULL, locked_by = NULL,
                    updated_by = @actor, updated_at = SYSUTCDATETIME()
                OUTPUT inserted.row_version
                WHERE id = @id AND revision = @current_revision AND row_version = @row_version;
                """, connection, transaction))
            {
                updateEstimate.Parameters.AddParameter("@next_revision", SqlDbType.Int, nextRevision);
                updateEstimate.Parameters.AddParameter("@actor", SqlDbType.BigInt, actor.Id);
                updateEstimate.Parameters.AddParameter("@id", SqlDbType.BigInt, id);
                updateEstimate.Parameters.AddParameter("@current_revision", SqlDbType.Int, currentRevision);
                updateEstimate.Parameters.AddParameter("@row_version", SqlDbType.Timestamp, expectedRowVersion);
                nextRowVersion = await updateEstimate.ExecuteScalarAsync(cancellationToken) as byte[]
                    ?? throw new ApiException(StatusCodes.Status409Conflict, "concurrency_conflict", "This estimate was changed by another user. Reload and try again.");
            }

            await UpdateInquiryWorkflowAsync(connection, transaction, inquiryId, "Estimating", 75, actor.Id, cancellationToken);

            await InquiryEndpoints.InsertAuditAsync(
                connection, transaction, actor.Id, "Estimate", id, number, "Revision requested",
                new { revision = currentRevision, status = currentStatus, progress = currentProgress },
                new { revision = nextRevision, status = "Revision Required", progress = 75m, reason },
                cancellationToken);
            await InquiryEndpoints.InsertAuditAsync(
                connection, transaction, actor.Id, "Inquiry", inquiryId, inquiryNumber, "Estimate revision requested",
                new { status = inquiryCurrentStatus, progress = inquiryCurrentProgress },
                new { status = "Estimating", progress = 75m, estimateRevision = nextRevision },
                cancellationToken);

            await transaction.CommitAsync(cancellationToken);
            return Results.Ok(new
            {
                id,
                revision = nextRevision,
                status = "Revision Required",
                progress = 75m,
                rowVersion = Convert.ToBase64String(nextRowVersion)
            });
        }
        catch
        {
            await transaction.RollbackAsync(cancellationToken);
            throw;
        }
    }

    private static async Task<IResult> TransitionAsync(
        long id,
        WorkflowRequest request,
        string permission,
        string targetStatus,
        decimal targetProgress,
        string inquiryStatus,
        decimal inquiryProgress,
        string[] allowedStatuses,
        string action,
        SqlConnectionFactory connections,
        CurrentUserService users,
        bool validate,
        bool requireEstimateOwner,
        CancellationToken cancellationToken)
    {
        await users.DemandPermissionAsync(permission, cancellationToken);
        var actor = await users.GetRequiredAsync(cancellationToken);
        var expectedRowVersion = SqlExtensions.ParseRowVersion(request.RowVersion);
        await using var connection = await connections.OpenAsync(cancellationToken);
        await using var transaction = await connection.BeginTransactionAsync(IsolationLevel.Serializable, cancellationToken);
        try
        {
            string number;
            string currentStatus;
            decimal currentProgress;
            int currentRevision;
            long estimateOwnerId;
            long inquiryId;
            string inquiryNumber;
            string inquiryCurrentStatus;
            decimal inquiryCurrentProgress;
            await using (var lookup = new SqlCommand("""
                SELECT e.estimate_no, e.status, e.progress, e.revision, e.owner_id, e.inquiry_id,
                       i.inquiry_no, i.status, i.progress
                FROM dbo.estimates e WITH (UPDLOCK, HOLDLOCK)
                INNER JOIN dbo.inquiries i WITH (UPDLOCK, HOLDLOCK) ON i.id = e.inquiry_id
                WHERE e.id = @id AND e.deleted_at IS NULL AND i.deleted_at IS NULL;
                """, connection, (SqlTransaction)transaction))
            {
                lookup.Parameters.AddParameter("@id", SqlDbType.BigInt, id);
                await using var reader = await lookup.ExecuteReaderAsync(CommandBehavior.SingleRow, cancellationToken);
                if (!await reader.ReadAsync(cancellationToken))
                    throw new ApiException(StatusCodes.Status404NotFound, "estimate_not_found", "Estimate or its linked inquiry was not found.");
                number = reader.GetString(0);
                currentStatus = reader.GetString(1);
                currentProgress = reader.GetDecimal(2);
                currentRevision = reader.GetInt32(3);
                estimateOwnerId = reader.GetInt64(4);
                inquiryId = reader.GetInt64(5);
                inquiryNumber = reader.GetString(6);
                inquiryCurrentStatus = reader.GetString(7);
                inquiryCurrentProgress = reader.GetDecimal(8);
            }

            if (!allowedStatuses.Contains(currentStatus, StringComparer.OrdinalIgnoreCase))
                throw new ApiException(StatusCodes.Status409Conflict, "invalid_transition", $"Cannot move an estimate from '{currentStatus}' to '{targetStatus}'.");
            if (requireEstimateOwner && estimateOwnerId != actor.Id && !HasEstimateManagerOverride(actor))
                throw new ApiException(StatusCodes.Status403Forbidden, "estimate_owner_required", "Only the estimate owner, an engineering manager or an administrator can submit this estimate.");
            if (validate)
            {
                var issues = await GetValidationIssuesAsync(connection, (SqlTransaction)transaction, id, cancellationToken);
                if (issues.Count > 0)
                    throw new ApiException(StatusCodes.Status422UnprocessableEntity, "estimate_invalid", "The estimate has critical validation errors.", issues);
            }

            await using var update = new SqlCommand("""
                UPDATE dbo.estimates
                SET status = @status, progress = @progress,
                    updated_by = @actor, updated_at = SYSUTCDATETIME()
                OUTPUT inserted.row_version
                WHERE id = @id AND row_version = @row_version;
                """, connection, (SqlTransaction)transaction);
            update.Parameters.AddParameter("@status", SqlDbType.NVarChar, targetStatus, 50);
            update.Parameters.AddParameter("@progress", SqlDbType.Decimal, targetProgress, precision: 5, scale: 2);
            update.Parameters.AddParameter("@actor", SqlDbType.BigInt, actor.Id);
            update.Parameters.AddParameter("@id", SqlDbType.BigInt, id);
            update.Parameters.AddParameter("@row_version", SqlDbType.Timestamp, expectedRowVersion);
            var result = await update.ExecuteScalarAsync(cancellationToken);
            if (result is null)
                throw new ApiException(StatusCodes.Status409Conflict, "concurrency_conflict", "This estimate was changed by another user. Reload and try again.");

            await UpdateInquiryWorkflowAsync(connection, (SqlTransaction)transaction, inquiryId, inquiryStatus, inquiryProgress, actor.Id, cancellationToken);

            await InquiryEndpoints.InsertAuditAsync(
                connection, (SqlTransaction)transaction, actor.Id, "Estimate", id, number, action,
                new { revision = currentRevision, status = currentStatus, progress = currentProgress },
                new { revision = currentRevision, status = targetStatus, progress = targetProgress, request.Comment },
                cancellationToken);
            await InquiryEndpoints.InsertAuditAsync(
                connection, (SqlTransaction)transaction, actor.Id, "Inquiry", inquiryId, inquiryNumber, $"Estimate {action.ToLowerInvariant()}",
                new { status = inquiryCurrentStatus, progress = inquiryCurrentProgress },
                new { status = inquiryStatus, progress = inquiryProgress, estimateRevision = currentRevision },
                cancellationToken);
            await transaction.CommitAsync(cancellationToken);
            return Results.Ok(new { id, revision = currentRevision, status = targetStatus, progress = targetProgress, rowVersion = Convert.ToBase64String((byte[])result) });
        }
        catch
        {
            await transaction.RollbackAsync(cancellationToken);
            throw;
        }
    }

    private static async Task SnapshotRevisionAsync(
        SqlConnection connection,
        SqlTransaction transaction,
        long estimateId,
        int revision,
        string reason,
        long actorId,
        CancellationToken cancellationToken)
    {
        await using var command = new SqlCommand("""
            DECLARE @snapshot nvarchar(max) = (
                SELECT
                    e.estimate_no AS estimateNumber,
                    e.inquiry_id AS inquiryId,
                    e.customer_id AS customerId,
                    e.project_name AS projectName,
                    e.project_type AS projectType,
                    e.owner_id AS ownerId,
                    e.revision,
                    e.created_date AS createdDate,
                    e.due_date AS dueDate,
                    e.status,
                    e.progress,
                    e.contingency_rate AS contingencyRate,
                    e.created_by AS createdBy,
                    e.updated_by AS updatedBy,
                    e.created_at AS createdAt,
                    e.updated_at AS updatedAt,
                    @reason AS reviewComment,
                    JSON_QUERY((
                        SELECT t.material_total AS material,
                               t.engineering_total AS engineering,
                               t.outsource_total AS outsource,
                               t.transportation_total AS transportation,
                               t.accommodation_total AS accommodation,
                               t.other_total AS other,
                               t.base_total AS subtotal,
                               t.contingency_total AS contingency,
                               t.total
                        FROM dbo.v_estimate_totals t
                        WHERE t.estimate_id = e.id
                        FOR JSON PATH, WITHOUT_ARRAY_WRAPPER
                    )) AS totals
                FROM dbo.estimates e
                WHERE e.id = @estimate_id AND e.revision = @revision
                FOR JSON PATH, WITHOUT_ARRAY_WRAPPER
            );

            INSERT INTO dbo.estimate_revisions (
                estimate_id, revision, reason, description, created_by,
                reviewed_by, reviewed_at, status, total)
            OUTPUT inserted.id
            SELECT e.id, e.revision, @reason, @snapshot, @actor,
                   @actor, SYSUTCDATETIME(), N'Revision Required', t.total
            FROM dbo.estimates e
            INNER JOIN dbo.v_estimate_totals t ON t.estimate_id = e.id
            WHERE e.id = @estimate_id AND e.revision = @revision;
            """, connection, transaction);
        command.Parameters.AddParameter("@estimate_id", SqlDbType.BigInt, estimateId);
        command.Parameters.AddParameter("@revision", SqlDbType.Int, revision);
        command.Parameters.AddParameter("@reason", SqlDbType.NVarChar, reason, 100);
        command.Parameters.AddParameter("@actor", SqlDbType.BigInt, actorId);
        if (await command.ExecuteScalarAsync(cancellationToken) is null)
            throw new ApiException(StatusCodes.Status409Conflict, "revision_snapshot_failed", "The current estimate revision could not be snapshotted.");
    }

    private static async Task CloneCurrentCostsAsync(
        SqlConnection connection,
        SqlTransaction transaction,
        long estimateId,
        int currentRevision,
        int nextRevision,
        long actorId,
        CancellationToken cancellationToken)
    {
        await using var command = new SqlCommand("""
            INSERT INTO dbo.cost_items (
                estimate_id, revision, category_code, category, subcategory, module, item_code, description,
                brand, model, specification, supplier_id, qty, unit, unit_cost, price_source, reference_no,
                reference_project, price_date, remark, owner_id, status, created_by, updated_by)
            SELECT estimate_id, @next_revision, category_code, category, subcategory, module, item_code, description,
                   brand, model, specification, supplier_id, qty, unit, unit_cost, price_source, reference_no,
                   reference_project, price_date, remark, owner_id, status, @actor, @actor
            FROM dbo.cost_items WITH (HOLDLOCK)
            WHERE estimate_id = @estimate_id AND revision = @current_revision AND deleted_at IS NULL;

            INSERT INTO dbo.manhour_lines (
                estimate_id, revision, package, activity, department, level, cost_type, provider,
                supplier_id, quotation_no, price_date, engineers, man_days, hours_per_day, daily_rate,
                owner_id, remark, created_by, updated_by)
            SELECT estimate_id, @next_revision, package, activity, department, level, cost_type, provider,
                   supplier_id, quotation_no, price_date, engineers, man_days, hours_per_day, daily_rate,
                   owner_id, remark, @actor, @actor
            FROM dbo.manhour_lines WITH (HOLDLOCK)
            WHERE estimate_id = @estimate_id AND revision = @current_revision AND deleted_at IS NULL;

            INSERT INTO dbo.expense_lines (
                estimate_id, revision, package, expense_type, description, cost_type, supplier_id,
                reference_no, qty, unit, unit_cost, owner_id, remark, created_by, updated_by)
            SELECT estimate_id, @next_revision, package, expense_type, description, cost_type, supplier_id,
                   reference_no, qty, unit, unit_cost, owner_id, remark, @actor, @actor
            FROM dbo.expense_lines WITH (HOLDLOCK)
            WHERE estimate_id = @estimate_id AND revision = @current_revision AND deleted_at IS NULL;

            INSERT INTO dbo.other_cost_lines (
                estimate_id, revision, category, description, qty, unit, unit_cost, remark, created_by, updated_by)
            SELECT estimate_id, @next_revision, category, description, qty, unit, unit_cost, remark, @actor, @actor
            FROM dbo.other_cost_lines WITH (HOLDLOCK)
            WHERE estimate_id = @estimate_id AND revision = @current_revision AND deleted_at IS NULL;
            """, connection, transaction);
        command.Parameters.AddParameter("@estimate_id", SqlDbType.BigInt, estimateId);
        command.Parameters.AddParameter("@current_revision", SqlDbType.Int, currentRevision);
        command.Parameters.AddParameter("@next_revision", SqlDbType.Int, nextRevision);
        command.Parameters.AddParameter("@actor", SqlDbType.BigInt, actorId);
        await command.ExecuteNonQueryAsync(cancellationToken);
    }

    private static async Task UpdateInquiryWorkflowAsync(
        SqlConnection connection,
        SqlTransaction transaction,
        long inquiryId,
        string status,
        decimal progress,
        long actorId,
        CancellationToken cancellationToken)
    {
        await using var command = new SqlCommand("""
            UPDATE dbo.inquiries
            SET status = @status, progress = @progress,
                updated_by = @actor, updated_at = SYSUTCDATETIME()
            WHERE id = @id AND deleted_at IS NULL;
            """, connection, transaction);
        command.Parameters.AddParameter("@status", SqlDbType.NVarChar, status, 50);
        command.Parameters.AddParameter("@progress", SqlDbType.Decimal, progress, precision: 5, scale: 2);
        command.Parameters.AddParameter("@actor", SqlDbType.BigInt, actorId);
        command.Parameters.AddParameter("@id", SqlDbType.BigInt, inquiryId);
        if (await command.ExecuteNonQueryAsync(cancellationToken) != 1)
            throw new ApiException(StatusCodes.Status409Conflict, "inquiry_update_failed", "The linked inquiry could not be updated.");
    }

    private static bool HasEstimateManagerOverride(CurrentUser actor) =>
        actor.Role is "Engineering Manager" or "Admin";

    private static void ValidateWorkflowRequest(WorkflowRequest request, bool requireComment)
    {
        InputValidation.RequiredText(request.RowVersion, 100, "Estimate row version");
        if (requireComment) InputValidation.RequiredText(request.Comment, 20_000, "Workflow comment");
        else InputValidation.OptionalText(request.Comment, 20_000, "Workflow comment");
    }

    private static async Task ValidateActiveOwnerAsync(
        SqlConnection connection,
        SqlTransaction transaction,
        long ownerId,
        CancellationToken cancellationToken)
    {
        await using var command = new SqlCommand("""
            SELECT CASE WHEN EXISTS (
                SELECT 1
                FROM dbo.users u
                INNER JOIN dbo.roles r ON r.id = u.role_id
                WHERE u.id = @owner_id
                  AND u.is_active = 1
                  AND u.deleted_at IS NULL
                  AND r.code IN (N'Engineer', N'Engineering Manager', N'Admin')
            ) THEN CAST(1 AS bit) ELSE CAST(0 AS bit) END;
            """, connection, transaction);
        command.Parameters.AddParameter("@owner_id", SqlDbType.BigInt, ownerId);
        if (!((bool?)await command.ExecuteScalarAsync(cancellationToken) ?? false))
            throw new ApiException(StatusCodes.Status400BadRequest, "validation_failed", "The selected estimate owner must be an active engineer, engineering manager or administrator.");
    }

    private static async Task<List<object>> GetValidationIssuesAsync(SqlConnection connection, SqlTransaction? transaction, long estimateId, CancellationToken cancellationToken)
    {
        await using var command = new SqlCommand("""
            SELECT code, message, entity_type, entity_id
            FROM dbo.fn_estimate_validation(@estimate_id)
            ORDER BY code, entity_id;
            """, connection, transaction);
        command.Parameters.AddParameter("@estimate_id", SqlDbType.BigInt, estimateId);
        var issues = new List<object>();
        await using var reader = await command.ExecuteReaderAsync(cancellationToken);
        while (await reader.ReadAsync(cancellationToken))
            issues.Add(new { code = reader.GetString(0), message = reader.GetString(1), entityType = reader.GetString(2), entityId = reader.GetInt64(3) });
        return issues;
    }
}
