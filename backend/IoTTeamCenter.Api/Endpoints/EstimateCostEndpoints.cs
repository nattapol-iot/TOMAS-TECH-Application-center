using System.Data;
using IoTTeamCenter.Api.Infrastructure;
using IoTTeamCenter.Api.Models;
using Microsoft.Data.SqlClient;

namespace IoTTeamCenter.Api.Endpoints;

public static class EstimateCostEndpoints
{
    private static readonly string[] EditableStatuses = ["Draft", "Engineering Input", "Revision Required"];
    private static readonly HashSet<string> AllowedCategoryCodes = new(
        ["01", "02", "03", "04", "05", "06", "07", "08", "09", "10"],
        StringComparer.Ordinal);
    private static readonly HashSet<string> AllowedPriceSources = new(
        [
            "Supplier Quotation", "Price Library", "Previous Project", "Budgetary",
            "Previous Estimate", "Previous Project Cost", "Purchase Price", "Master Price",
            "Manual Estimate", "Budgetary Price"
        ],
        StringComparer.Ordinal);

    private sealed record EditableEstimate(string Number, int Revision, long OwnerId, DateOnly DueDate);
    private sealed record CategoryAssignment(long OwnerId, long? SupportId);
    private sealed record CostItemAuditSnapshot(
        long Id,
        string CategoryCode,
        string Category,
        string Subcategory,
        string Module,
        string ItemCode,
        string Description,
        string Brand,
        string Model,
        string? Specification,
        long? SupplierId,
        decimal Quantity,
        string Unit,
        decimal UnitCost,
        string PriceSource,
        string? ReferenceNumber,
        string? ReferenceProject,
        DateOnly? PriceDate,
        string? Remark,
        long OwnerId,
        string Status,
        DateTimeOffset? DeletedAt,
        string RowVersion);

    public static void MapEstimateCostEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/v1/estimates").RequireAuthorization();
        group.MapGet("/{id:long}/cost-workspace", GetWorkspaceAsync);
        group.MapPost("/{id:long}/cost-items", CreateCostItemAsync);
        group.MapPut("/{id:long}/cost-items/{lineId:long}", UpdateCostItemAsync);
        group.MapPost("/{id:long}/cost-items/{lineId:long}/remove", RemoveCostItemAsync);
    }

    private static async Task<IResult> GetWorkspaceAsync(
        long id,
        SqlConnectionFactory connections,
        CurrentUserService users,
        CancellationToken cancellationToken)
    {
        await users.DemandPermissionAsync("estimate.read", cancellationToken);
        await using var connection = await connections.OpenAsync(cancellationToken);
        await using var command = new SqlCommand("""
            SELECT e.id, e.estimate_no, e.revision, e.status, e.contingency_rate, e.row_version,
                   t.material_total, t.engineering_total, t.outsource_total, t.transportation_total,
                   t.accommodation_total, t.other_total, t.base_total, t.contingency_total, t.total
            FROM dbo.estimates e
            INNER JOIN dbo.v_estimate_totals t ON t.estimate_id = e.id
            WHERE e.id = @id AND e.deleted_at IS NULL;

            SELECT ci.id, ci.category_code, ci.category, ci.subcategory, ci.module, ci.item_code,
                   ci.description, ci.brand, ci.model, ci.supplier_id, s.name, ci.qty, ci.unit,
                   ci.unit_cost, ci.line_total, ci.price_source, ci.reference_no, ci.price_date,
                   ci.owner_id, u.name, ci.status, ci.row_version
            FROM dbo.cost_items ci
            INNER JOIN dbo.estimates e ON e.id = ci.estimate_id AND e.revision = ci.revision
            INNER JOIN dbo.users u ON u.id = ci.owner_id
            LEFT JOIN dbo.suppliers s ON s.id = ci.supplier_id
            WHERE ci.estimate_id = @id AND ci.deleted_at IS NULL
            ORDER BY ci.category_code, ci.id;
            """, connection);
        command.Parameters.AddParameter("@id", SqlDbType.BigInt, id);

        await using var reader = await command.ExecuteReaderAsync(cancellationToken);
        if (!await reader.ReadAsync(cancellationToken))
            throw new ApiException(StatusCodes.Status404NotFound, "estimate_not_found", "Estimate not found.");

        var header = new
        {
            id = reader.GetInt64(0),
            number = reader.GetString(1),
            revision = reader.GetInt32(2),
            status = reader.GetString(3),
            contingencyRate = reader.GetDecimal(4),
            rowVersion = reader.RowVersionString(5),
            totals = new
            {
                material = reader.GetDecimal(6), engineering = reader.GetDecimal(7), outsource = reader.GetDecimal(8),
                transportation = reader.GetDecimal(9), accommodation = reader.GetDecimal(10), other = reader.GetDecimal(11),
                subtotal = reader.GetDecimal(12), contingency = reader.GetDecimal(13), total = reader.GetDecimal(14)
            }
        };

        var lines = new List<object>();
        await reader.NextResultAsync(cancellationToken);
        while (await reader.ReadAsync(cancellationToken))
            lines.Add(new
            {
                id = reader.GetInt64(0), categoryCode = reader.GetString(1), category = reader.GetString(2),
                subcategory = reader.GetString(3), module = reader.GetString(4), itemCode = reader.GetString(5),
                description = reader.GetString(6), brand = reader.GetString(7), model = reader.GetString(8),
                supplierId = reader.IsDBNull(9) ? (long?)null : reader.GetInt64(9), supplierName = reader.IsDBNull(10) ? null : reader.GetString(10),
                quantity = reader.GetDecimal(11), unit = reader.GetString(12), unitCost = reader.GetDecimal(13), lineTotal = reader.GetDecimal(14),
                priceSource = reader.GetString(15), referenceNumber = reader.IsDBNull(16) ? null : reader.GetString(16),
                priceDate = reader.IsDBNull(17) ? (DateOnly?)null : reader.GetFieldValue<DateOnly>(17),
                ownerId = reader.GetInt64(18), ownerName = reader.GetString(19), status = reader.GetString(20), rowVersion = reader.RowVersionString(21)
            });

        return Results.Ok(new { header, costItems = lines });
    }

    private static async Task<IResult> CreateCostItemAsync(
        long id,
        CostItemRequest request,
        SqlConnectionFactory connections,
        CurrentUserService users,
        CancellationToken cancellationToken)
    {
        await users.DemandPermissionAsync("estimate.write", cancellationToken);
        Validate(request, requireLineVersion: false);
        var actor = await users.GetRequiredAsync(cancellationToken);
        await using var connection = await connections.OpenAsync(cancellationToken);
        await using var transaction = (SqlTransaction)await connection.BeginTransactionAsync(IsolationLevel.Serializable, cancellationToken);
        try
        {
            var estimate = await LockEditableEstimateAsync(connection, transaction, id, request.EstimateRowVersion, cancellationToken);
            await ValidateReferencesAsync(connection, transaction, request.OwnerId, request.SupplierId, cancellationToken);
            var elevated = IsElevatedCostWriter(actor, estimate);
            if (!elevated)
            {
                var assignment = await GetCategoryAssignmentAsync(connection, transaction, id, request.CategoryCode.Trim(), cancellationToken);
                if (!IsAssigned(actor, assignment))
                    throw new ApiException(StatusCodes.Status403Forbidden, "estimate_section_forbidden", "You may add cost lines only to an estimate section assigned to you.");
                if (request.OwnerId != assignment!.OwnerId && request.OwnerId != assignment.SupportId)
                    throw new ApiException(StatusCodes.Status403Forbidden, "cost_owner_forbidden", "You cannot assign a cost line to a user outside your assigned section.");
            }
            else
            {
                await UpsertCategoryAssignmentAsync(connection, transaction, id, request.CategoryCode.Trim(), request.OwnerId, estimate.DueDate, cancellationToken);
            }
            await using var insert = new SqlCommand("""
                INSERT INTO dbo.cost_items (
                    estimate_id, revision, category_code, category, subcategory, module, item_code, description,
                    brand, model, specification, supplier_id, qty, unit, unit_cost, price_source, reference_no,
                    reference_project, price_date, remark, owner_id, status, created_by, updated_by)
                OUTPUT inserted.id, inserted.row_version
                VALUES (@estimate_id, @revision, @category_code, @category, @subcategory, @module, @item_code, @description,
                    @brand, @model, @specification, @supplier_id, @qty, @unit, @unit_cost, @price_source, @reference_no,
                    @reference_project, @price_date, @remark, @owner_id, N'Active', @actor, @actor);
                """, connection, transaction);
            AddCostParameters(insert, id, estimate.Revision, request, actor.Id);
            long lineId;
            byte[] lineVersion;
            await using (var reader = await insert.ExecuteReaderAsync(CommandBehavior.SingleRow, cancellationToken))
            {
                await reader.ReadAsync(cancellationToken);
                lineId = reader.GetInt64(0);
                lineVersion = (byte[])reader.GetValue(1);
            }
            var estimateVersion = await TouchEstimateAsync(connection, transaction, id, actor.Id, cancellationToken);
            var after = await GetCostItemSnapshotAsync(connection, transaction, id, estimate.Revision, lineId, lineVersion, includeDeleted: false, cancellationToken);
            await InquiryEndpoints.InsertAuditAsync(connection, transaction, actor.Id, "CostItem", lineId, estimate.Number, "Created", null, after, cancellationToken);
            await transaction.CommitAsync(cancellationToken);
            return Results.Created($"/api/v1/estimates/{id}/cost-items/{lineId}", new { id = lineId, rowVersion = Convert.ToBase64String(lineVersion), estimateRowVersion = Convert.ToBase64String(estimateVersion) });
        }
        catch
        {
            await transaction.RollbackAsync(cancellationToken);
            throw;
        }
    }

    private static async Task<IResult> UpdateCostItemAsync(
        long id,
        long lineId,
        CostItemRequest request,
        SqlConnectionFactory connections,
        CurrentUserService users,
        CancellationToken cancellationToken)
    {
        await users.DemandPermissionAsync("estimate.write", cancellationToken);
        Validate(request, requireLineVersion: true);
        var actor = await users.GetRequiredAsync(cancellationToken);
        await using var connection = await connections.OpenAsync(cancellationToken);
        await using var transaction = (SqlTransaction)await connection.BeginTransactionAsync(IsolationLevel.Serializable, cancellationToken);
        try
        {
            var estimate = await LockEditableEstimateAsync(connection, transaction, id, request.EstimateRowVersion, cancellationToken);
            await ValidateReferencesAsync(connection, transaction, request.OwnerId, request.SupplierId, cancellationToken);
            var lineVersion = SqlExtensions.ParseRowVersion(request.LineRowVersion!);
            var before = await GetCostItemSnapshotAsync(connection, transaction, id, estimate.Revision, lineId, lineVersion, includeDeleted: false, cancellationToken);
            var elevated = IsElevatedCostWriter(actor, estimate);
            if (!elevated)
            {
                var currentAssignment = await GetCategoryAssignmentAsync(connection, transaction, id, before.CategoryCode, cancellationToken);
                if (before.OwnerId != actor.Id && !IsAssigned(actor, currentAssignment))
                    throw new ApiException(StatusCodes.Status403Forbidden, "cost_line_forbidden", "You may update only your own line or a line in a section assigned to you.");
                if (request.OwnerId != before.OwnerId)
                    throw new ApiException(StatusCodes.Status403Forbidden, "cost_owner_forbidden", "Only the estimate owner, an engineering manager or an administrator can reassign a cost line.");
                if (!string.Equals(before.CategoryCode, request.CategoryCode.Trim(), StringComparison.Ordinal))
                {
                    var targetAssignment = await GetCategoryAssignmentAsync(connection, transaction, id, request.CategoryCode.Trim(), cancellationToken);
                    if (!IsAssigned(actor, targetAssignment))
                        throw new ApiException(StatusCodes.Status403Forbidden, "estimate_section_forbidden", "You cannot move a line to an estimate section that is not assigned to you.");
                }
            }
            else
            {
                await UpsertCategoryAssignmentAsync(connection, transaction, id, request.CategoryCode.Trim(), request.OwnerId, estimate.DueDate, cancellationToken);
            }
            await using var update = new SqlCommand("""
                UPDATE dbo.cost_items SET
                    category_code=@category_code, category=@category, subcategory=@subcategory, module=@module,
                    item_code=@item_code, description=@description, brand=@brand, model=@model, specification=@specification,
                    supplier_id=@supplier_id, qty=@qty, unit=@unit, unit_cost=@unit_cost, price_source=@price_source,
                    reference_no=@reference_no, reference_project=@reference_project, price_date=@price_date, remark=@remark,
                    owner_id=@owner_id, updated_by=@actor, updated_at=SYSUTCDATETIME()
                OUTPUT inserted.row_version
                WHERE id=@line_id AND estimate_id=@estimate_id AND revision=@revision AND deleted_at IS NULL AND row_version=@line_version;
                """, connection, transaction);
            AddCostParameters(update, id, estimate.Revision, request, actor.Id);
            update.Parameters.AddParameter("@line_id", SqlDbType.BigInt, lineId);
            update.Parameters.AddParameter("@line_version", SqlDbType.Timestamp, lineVersion);
            var version = await update.ExecuteScalarAsync(cancellationToken) as byte[]
                ?? throw new ApiException(StatusCodes.Status409Conflict, "concurrency_conflict", "This cost line was changed or removed. Reload and try again.");
            var estimateVersion = await TouchEstimateAsync(connection, transaction, id, actor.Id, cancellationToken);
            var after = await GetCostItemSnapshotAsync(connection, transaction, id, estimate.Revision, lineId, version, includeDeleted: false, cancellationToken);
            await InquiryEndpoints.InsertAuditAsync(connection, transaction, actor.Id, "CostItem", lineId, estimate.Number, "Updated", before, after, cancellationToken);
            await transaction.CommitAsync(cancellationToken);
            return Results.Ok(new { id = lineId, rowVersion = Convert.ToBase64String(version), estimateRowVersion = Convert.ToBase64String(estimateVersion) });
        }
        catch
        {
            await transaction.RollbackAsync(cancellationToken);
            throw;
        }
    }

    private static async Task<IResult> RemoveCostItemAsync(
        long id,
        long lineId,
        DeleteCostItemRequest request,
        SqlConnectionFactory connections,
        CurrentUserService users,
        CancellationToken cancellationToken)
    {
        await users.DemandPermissionAsync("estimate.write", cancellationToken);
        InputValidation.RequiredText(request.EstimateRowVersion, 100, "Estimate row version");
        InputValidation.RequiredText(request.LineRowVersion, 100, "Cost line row version");
        InputValidation.OptionalText(request.Reason, 20_000, "Removal reason");
        var actor = await users.GetRequiredAsync(cancellationToken);
        await using var connection = await connections.OpenAsync(cancellationToken);
        await using var transaction = (SqlTransaction)await connection.BeginTransactionAsync(IsolationLevel.Serializable, cancellationToken);
        try
        {
            var estimate = await LockEditableEstimateAsync(connection, transaction, id, request.EstimateRowVersion, cancellationToken);
            var lineVersion = SqlExtensions.ParseRowVersion(request.LineRowVersion);
            var before = await GetCostItemSnapshotAsync(connection, transaction, id, estimate.Revision, lineId, lineVersion, includeDeleted: false, cancellationToken);
            if (!IsElevatedCostWriter(actor, estimate))
            {
                var assignment = await GetCategoryAssignmentAsync(connection, transaction, id, before.CategoryCode, cancellationToken);
                if (before.OwnerId != actor.Id && !IsAssigned(actor, assignment))
                    throw new ApiException(StatusCodes.Status403Forbidden, "cost_line_forbidden", "You may remove only your own line or a line in a section assigned to you.");
            }
            await using var update = new SqlCommand("""
                UPDATE dbo.cost_items SET deleted_at=SYSUTCDATETIME(), updated_by=@actor, updated_at=SYSUTCDATETIME()
                OUTPUT inserted.row_version
                WHERE id=@line_id AND estimate_id=@estimate_id AND revision=@revision AND deleted_at IS NULL AND row_version=@line_version;
                """, connection, transaction);
            update.Parameters.AddParameter("@actor", SqlDbType.BigInt, actor.Id);
            update.Parameters.AddParameter("@line_id", SqlDbType.BigInt, lineId);
            update.Parameters.AddParameter("@estimate_id", SqlDbType.BigInt, id);
            update.Parameters.AddParameter("@revision", SqlDbType.Int, estimate.Revision);
            update.Parameters.AddParameter("@line_version", SqlDbType.Timestamp, lineVersion);
            var removedVersion = await update.ExecuteScalarAsync(cancellationToken) as byte[]
                ?? throw new ApiException(StatusCodes.Status409Conflict, "concurrency_conflict", "This cost line was changed or removed. Reload and try again.");
            var estimateVersion = await TouchEstimateAsync(connection, transaction, id, actor.Id, cancellationToken);
            var after = await GetCostItemSnapshotAsync(connection, transaction, id, estimate.Revision, lineId, removedVersion, includeDeleted: true, cancellationToken);
            await InquiryEndpoints.InsertAuditAsync(
                connection, transaction, actor.Id, "CostItem", lineId, estimate.Number, "Removed",
                new { line = before }, new { line = after, removalReason = request.Reason?.Trim() }, cancellationToken);
            await transaction.CommitAsync(cancellationToken);
            return Results.Ok(new { id = lineId, estimateRowVersion = Convert.ToBase64String(estimateVersion) });
        }
        catch
        {
            await transaction.RollbackAsync(cancellationToken);
            throw;
        }
    }

    private static void Validate(CostItemRequest request, bool requireLineVersion)
    {
        InputValidation.RequiredText(request.EstimateRowVersion, 100, "Estimate row version");
        if (requireLineVersion) InputValidation.RequiredText(request.LineRowVersion, 100, "Cost line row version");
        else InputValidation.OptionalText(request.LineRowVersion, 100, "Cost line row version");
        InputValidation.RequiredText(request.CategoryCode, 2, "Category code");
        if (!AllowedCategoryCodes.Contains(request.CategoryCode.Trim()))
            throw new ApiException(StatusCodes.Status400BadRequest, "validation_failed", "Category code is not allowed.");
        InputValidation.RequiredText(request.Category, 100, "Category");
        InputValidation.OptionalText(request.Subcategory, 100, "Subcategory");
        InputValidation.RequiredText(request.Module, 200, "Module");
        InputValidation.RequiredText(request.ItemCode, 100, "Item code");
        InputValidation.RequiredText(request.Description, 500, "Description");
        InputValidation.OptionalText(request.Brand, 100, "Brand");
        InputValidation.OptionalText(request.Model, 200, "Model");
        InputValidation.OptionalText(request.Specification, 20_000, "Specification");
        InputValidation.RequiredText(request.Unit, 50, "Unit");
        InputValidation.RequiredText(request.PriceSource, 100, "Price source");
        if (!AllowedPriceSources.Contains(request.PriceSource.Trim()))
            throw new ApiException(StatusCodes.Status400BadRequest, "validation_failed", "Price source is not allowed.");
        InputValidation.OptionalText(request.ReferenceNumber, 200, "Reference number");
        InputValidation.OptionalText(request.ReferenceProject, 200, "Reference project");
        InputValidation.OptionalText(request.Remark, 20_000, "Remark");
        if (request.OwnerId <= 0)
            throw new ApiException(StatusCodes.Status400BadRequest, "validation_failed", "A valid owner is required.");
        InputValidation.DecimalRange(request.Quantity, 0.0001m, 1_000_000_000m, "Quantity");
        InputValidation.DecimalRange(request.UnitCost, 0m, 1_000_000_000m, "Unit cost");
        InputValidation.DecimalScale(request.Quantity, 4, "Quantity");
        InputValidation.DecimalScale(request.UnitCost, 4, "Unit cost");
        if (request.Quantity * request.UnitCost > 999_999_999_999_999m)
            throw new ApiException(StatusCodes.Status400BadRequest, "validation_failed", "Line total exceeds the supported monetary range.");
    }

    private static async Task<EditableEstimate> LockEditableEstimateAsync(SqlConnection connection, SqlTransaction transaction, long id, string rowVersion, CancellationToken cancellationToken)
    {
        await using var command = new SqlCommand("SELECT estimate_no, revision, status, row_version, owner_id, due_date FROM dbo.estimates WITH (UPDLOCK, HOLDLOCK) WHERE id=@id AND deleted_at IS NULL;", connection, transaction);
        command.Parameters.AddParameter("@id", SqlDbType.BigInt, id);
        await using var reader = await command.ExecuteReaderAsync(CommandBehavior.SingleRow, cancellationToken);
        if (!await reader.ReadAsync(cancellationToken))
            throw new ApiException(StatusCodes.Status404NotFound, "estimate_not_found", "Estimate not found.");
        var actual = (byte[])reader.GetValue(3);
        if (!actual.AsSpan().SequenceEqual(SqlExtensions.ParseRowVersion(rowVersion)))
            throw new ApiException(StatusCodes.Status409Conflict, "concurrency_conflict", "This estimate changed. Reload and try again.");
        var status = reader.GetString(2);
        if (!EditableStatuses.Contains(status, StringComparer.OrdinalIgnoreCase))
            throw new ApiException(StatusCodes.Status409Conflict, "estimate_locked", $"Cost lines cannot be changed while the estimate is '{status}'.");
        return new EditableEstimate(reader.GetString(0), reader.GetInt32(1), reader.GetInt64(4), reader.GetFieldValue<DateOnly>(5));
    }

    private static async Task<CostItemAuditSnapshot> GetCostItemSnapshotAsync(
        SqlConnection connection,
        SqlTransaction transaction,
        long estimateId,
        int revision,
        long lineId,
        byte[] expectedRowVersion,
        bool includeDeleted,
        CancellationToken cancellationToken)
    {
        await using var command = new SqlCommand("""
            SELECT id, category_code, category, subcategory, module, item_code, description,
                   brand, model, specification, supplier_id, qty, unit, unit_cost, price_source,
                   reference_no, reference_project, price_date, remark, owner_id, status,
                   deleted_at, row_version
            FROM dbo.cost_items WITH (UPDLOCK, HOLDLOCK)
            WHERE id = @line_id AND estimate_id = @estimate_id AND revision = @revision
              AND (@include_deleted = 1 OR deleted_at IS NULL);
            """, connection, transaction);
        command.Parameters.AddParameter("@line_id", SqlDbType.BigInt, lineId);
        command.Parameters.AddParameter("@estimate_id", SqlDbType.BigInt, estimateId);
        command.Parameters.AddParameter("@revision", SqlDbType.Int, revision);
        command.Parameters.AddParameter("@include_deleted", SqlDbType.Bit, includeDeleted);
        await using var reader = await command.ExecuteReaderAsync(CommandBehavior.SingleRow, cancellationToken);
        if (!await reader.ReadAsync(cancellationToken))
            throw new ApiException(StatusCodes.Status409Conflict, "concurrency_conflict", "This cost line was changed or removed. Reload and try again.");
        var actualRowVersion = (byte[])reader.GetValue(22);
        if (!actualRowVersion.AsSpan().SequenceEqual(expectedRowVersion))
            throw new ApiException(StatusCodes.Status409Conflict, "concurrency_conflict", "This cost line was changed or removed. Reload and try again.");

        return new CostItemAuditSnapshot(
            reader.GetInt64(0), reader.GetString(1), reader.GetString(2), reader.GetString(3),
            reader.GetString(4), reader.GetString(5), reader.GetString(6), reader.GetString(7), reader.GetString(8),
            reader.IsDBNull(9) ? null : reader.GetString(9),
            reader.IsDBNull(10) ? null : reader.GetInt64(10),
            reader.GetDecimal(11), reader.GetString(12), reader.GetDecimal(13), reader.GetString(14),
            reader.IsDBNull(15) ? null : reader.GetString(15), reader.IsDBNull(16) ? null : reader.GetString(16),
            reader.IsDBNull(17) ? null : reader.GetFieldValue<DateOnly>(17), reader.IsDBNull(18) ? null : reader.GetString(18),
            reader.GetInt64(19), reader.GetString(20), reader.IsDBNull(21) ? null : reader.GetFieldValue<DateTimeOffset>(21),
            Convert.ToBase64String(actualRowVersion));
    }

    private static async Task<CategoryAssignment?> GetCategoryAssignmentAsync(
        SqlConnection connection,
        SqlTransaction transaction,
        long estimateId,
        string categoryCode,
        CancellationToken cancellationToken)
    {
        await using var command = new SqlCommand("""
            SELECT owner_id, support_id
            FROM dbo.estimate_assignments WITH (UPDLOCK, HOLDLOCK)
            WHERE estimate_id = @estimate_id AND section = @section;
            """, connection, transaction);
        command.Parameters.AddParameter("@estimate_id", SqlDbType.BigInt, estimateId);
        command.Parameters.AddParameter("@section", SqlDbType.NVarChar, categoryCode, 100);
        await using var reader = await command.ExecuteReaderAsync(CommandBehavior.SingleRow, cancellationToken);
        if (!await reader.ReadAsync(cancellationToken)) return null;
        return new CategoryAssignment(reader.GetInt64(0), reader.IsDBNull(1) ? null : reader.GetInt64(1));
    }

    private static async Task UpsertCategoryAssignmentAsync(
        SqlConnection connection,
        SqlTransaction transaction,
        long estimateId,
        string categoryCode,
        long ownerId,
        DateOnly dueDate,
        CancellationToken cancellationToken)
    {
        await using var command = new SqlCommand("""
            UPDATE dbo.estimate_assignments
            SET progress = CASE WHEN owner_id = @owner_id THEN progress ELSE 0 END,
                status = CASE WHEN owner_id = @owner_id THEN status ELSE N'In Progress' END,
                owner_id = @owner_id,
                support_id = CASE WHEN support_id = @owner_id THEN NULL ELSE support_id END,
                due_date = @due_date
            WHERE estimate_id = @estimate_id AND section = @section;

            IF @@ROWCOUNT = 0
                INSERT INTO dbo.estimate_assignments (
                    estimate_id, section, owner_id, support_id, due_date, status, progress, comment)
                VALUES (@estimate_id, @section, @owner_id, NULL, @due_date, N'In Progress', 0, NULL);
            """, connection, transaction);
        command.Parameters.AddParameter("@estimate_id", SqlDbType.BigInt, estimateId);
        command.Parameters.AddParameter("@section", SqlDbType.NVarChar, categoryCode, 100);
        command.Parameters.AddParameter("@owner_id", SqlDbType.BigInt, ownerId);
        command.Parameters.AddParameter("@due_date", SqlDbType.Date, dueDate);
        await command.ExecuteNonQueryAsync(cancellationToken);
    }

    private static async Task ValidateReferencesAsync(
        SqlConnection connection,
        SqlTransaction transaction,
        long ownerId,
        long? supplierId,
        CancellationToken cancellationToken)
    {
        await using var command = new SqlCommand("""
            SELECT
                CASE WHEN EXISTS (
                    SELECT 1
                    FROM dbo.users u
                    INNER JOIN dbo.roles r ON r.id = u.role_id
                    WHERE u.id = @owner_id
                      AND u.is_active = 1
                      AND u.deleted_at IS NULL
                      AND r.code IN (N'Engineer', N'Engineering Manager', N'Admin')
                ) THEN CAST(1 AS bit) ELSE CAST(0 AS bit) END,
                CASE WHEN @supplier_id IS NULL OR EXISTS (
                    SELECT 1 FROM dbo.suppliers
                    WHERE id = @supplier_id AND is_active = 1 AND deleted_at IS NULL
                ) THEN CAST(1 AS bit) ELSE CAST(0 AS bit) END;
            """, connection, transaction);
        command.Parameters.AddParameter("@owner_id", SqlDbType.BigInt, ownerId);
        command.Parameters.AddParameter("@supplier_id", SqlDbType.BigInt, supplierId);
        await using var reader = await command.ExecuteReaderAsync(CommandBehavior.SingleRow, cancellationToken);
        await reader.ReadAsync(cancellationToken);
        if (!reader.GetBoolean(0))
            throw new ApiException(StatusCodes.Status400BadRequest, "validation_failed", "The selected cost owner must be an active engineer, engineering manager or administrator.");
        if (!reader.GetBoolean(1))
            throw new ApiException(StatusCodes.Status400BadRequest, "validation_failed", "The selected supplier is inactive or does not exist.");
    }

    private static bool IsElevatedCostWriter(CurrentUser actor, EditableEstimate estimate) =>
        actor.Id == estimate.OwnerId || actor.Role is "Engineering Manager" or "Admin";

    private static bool IsAssigned(CurrentUser actor, CategoryAssignment? assignment) =>
        assignment is not null && (assignment.OwnerId == actor.Id || assignment.SupportId == actor.Id);

    private static void AddCostParameters(SqlCommand command, long estimateId, int revision, CostItemRequest request, long actorId)
    {
        command.Parameters.AddParameter("@estimate_id", SqlDbType.BigInt, estimateId);
        command.Parameters.AddParameter("@revision", SqlDbType.Int, revision);
        command.Parameters.AddParameter("@category_code", SqlDbType.Char, request.CategoryCode.Trim().ToUpperInvariant(), 2);
        command.Parameters.AddParameter("@category", SqlDbType.NVarChar, request.Category.Trim(), 100);
        command.Parameters.AddParameter("@subcategory", SqlDbType.NVarChar, request.Subcategory?.Trim() ?? "", 100);
        command.Parameters.AddParameter("@module", SqlDbType.NVarChar, request.Module.Trim(), 200);
        command.Parameters.AddParameter("@item_code", SqlDbType.NVarChar, request.ItemCode.Trim(), 100);
        command.Parameters.AddParameter("@description", SqlDbType.NVarChar, request.Description.Trim(), 500);
        command.Parameters.AddParameter("@brand", SqlDbType.NVarChar, request.Brand?.Trim() ?? "", 100);
        command.Parameters.AddParameter("@model", SqlDbType.NVarChar, request.Model?.Trim() ?? "", 200);
        command.Parameters.AddParameter("@specification", SqlDbType.NVarChar, request.Specification?.Trim(), -1);
        command.Parameters.AddParameter("@supplier_id", SqlDbType.BigInt, request.SupplierId);
        command.Parameters.AddParameter("@qty", SqlDbType.Decimal, request.Quantity, precision: 19, scale: 4);
        command.Parameters.AddParameter("@unit", SqlDbType.NVarChar, request.Unit.Trim(), 50);
        command.Parameters.AddParameter("@unit_cost", SqlDbType.Decimal, request.UnitCost, precision: 19, scale: 4);
        command.Parameters.AddParameter("@price_source", SqlDbType.NVarChar, request.PriceSource.Trim(), 100);
        command.Parameters.AddParameter("@reference_no", SqlDbType.NVarChar, request.ReferenceNumber?.Trim(), 200);
        command.Parameters.AddParameter("@reference_project", SqlDbType.NVarChar, request.ReferenceProject?.Trim(), 200);
        command.Parameters.AddParameter("@price_date", SqlDbType.Date, request.PriceDate);
        command.Parameters.AddParameter("@remark", SqlDbType.NVarChar, request.Remark?.Trim(), -1);
        command.Parameters.AddParameter("@owner_id", SqlDbType.BigInt, request.OwnerId);
        command.Parameters.AddParameter("@actor", SqlDbType.BigInt, actorId);
    }

    private static async Task<byte[]> TouchEstimateAsync(SqlConnection connection, SqlTransaction transaction, long id, long actorId, CancellationToken cancellationToken)
    {
        await using var command = new SqlCommand("UPDATE dbo.estimates SET updated_by=@actor, updated_at=SYSUTCDATETIME(), progress=CASE WHEN progress < 10 THEN 10 ELSE progress END OUTPUT inserted.row_version WHERE id=@id;", connection, transaction);
        command.Parameters.AddParameter("@actor", SqlDbType.BigInt, actorId);
        command.Parameters.AddParameter("@id", SqlDbType.BigInt, id);
        return (byte[])(await command.ExecuteScalarAsync(cancellationToken)
            ?? throw new ApiException(StatusCodes.Status409Conflict, "concurrency_conflict", "The estimate could not be updated."));
    }
}
