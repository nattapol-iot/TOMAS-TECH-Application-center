using System.Data;
using IoTTeamCenter.Api.Infrastructure;
using IoTTeamCenter.Api.Models;
using Microsoft.Data.SqlClient;

namespace IoTTeamCenter.Api.Endpoints;

public static class EstimateWorkspaceEndpoints
{
    private static readonly string[] EditableStatuses = ["Draft", "Engineering Input", "Revision Required"];
    private static readonly string[] AssignmentStatuses = ["Not Started", "In Progress", "Waiting Information", "Waiting Supplier", "Completed", "Reviewed"];
    private static readonly string[] ExpenseTypes = ["Travel", "Accommodation", "Per Diem", "Transportation", "Equipment Rental", "Other"];
    private static readonly string[] OtherCostCategories = ["Outsource", "Transportation", "Accommodation", "Other Cost"];

    private sealed record EstimateContext(string Number, int Revision, string Status, long OwnerId, DateOnly DueDate, string RowVersion);
    private sealed record EstimateTotals(
        decimal Material, decimal Engineering, decimal Outsource, decimal Transportation,
        decimal Accommodation, decimal Other, decimal Subtotal, decimal Contingency, decimal Total);
    private sealed record WorkspaceHeader(
        long Id, string Number, long InquiryId, string InquiryNumber,
        long CustomerId, string CustomerCode, string CustomerName,
        string ProjectName, string ProjectType, long OwnerId, string OwnerName,
        int Revision, DateOnly CreatedDate, DateOnly DueDate, string Status, decimal Progress,
        decimal ContingencyRate, DateTimeOffset? LockedAt, long? LockedBy, string? LockedByName,
        DateTimeOffset CreatedAt, DateTimeOffset UpdatedAt, string RowVersion, EstimateTotals Totals);
    private sealed record WorkspaceCapabilities(
        bool CanEdit, bool CanEditAllSections, IReadOnlyList<string> EditableSections,
        bool CanSubmit, bool CanApprove, bool CanRequestRevision,
        bool CanManageAssignments, bool CanUpdateContingency,
        bool CanEditCostItems, bool CanEditManhour, bool CanEditExpenses, bool CanEditOtherCosts);
    private sealed record AssignmentDto(
        long Id, string Section, long OwnerId, string OwnerName, long? SupportId, string? SupportName,
        DateOnly DueDate, string Status, decimal Progress, string? Comment, string RowVersion, bool CanEdit);
    private sealed record ValidationIssueDto(string Code, string Message, string EntityType, long EntityId, string Severity);
    private sealed record ManhourSnapshot(
        long Id, string Package, string Activity, string Department, string Level, string CostType,
        string Provider, long? SupplierId, string? QuotationNumber, DateOnly? PriceDate,
        decimal Engineers, decimal ManDays, decimal HoursPerDay, decimal DailyRate,
        long OwnerId, string? Remark, DateTimeOffset? DeletedAt, string RowVersion);
    private sealed record ExpenseSnapshot(
        long Id, string Package, string ExpenseType, string Description, string CostType,
        long? SupplierId, string? ReferenceNumber, decimal Quantity, string Unit,
        decimal UnitCost, long OwnerId, string? Remark, DateTimeOffset? DeletedAt, string RowVersion);
    private sealed record OtherCostSnapshot(
        long Id, string Category, string Description, decimal Quantity, string Unit,
        decimal UnitCost, string? Remark, DateTimeOffset? DeletedAt, string RowVersion);
    private sealed record AssignmentSnapshot(
        long Id, string Section, long OwnerId, long? SupportId, DateOnly DueDate,
        string Status, decimal Progress, string? Comment, string RowVersion);

    public static void MapEstimateWorkspaceEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/v1/estimates").RequireAuthorization();
        group.MapGet("/{id:long}/cost-workspace", GetWorkspaceAsync);

        group.MapPost("/{id:long}/manhour-lines", CreateManhourLineAsync);
        group.MapPut("/{id:long}/manhour-lines/{lineId:long}", UpdateManhourLineAsync);
        group.MapPost("/{id:long}/manhour-lines/{lineId:long}/remove", RemoveManhourLineAsync);

        group.MapPost("/{id:long}/expense-lines", CreateExpenseLineAsync);
        group.MapPut("/{id:long}/expense-lines/{lineId:long}", UpdateExpenseLineAsync);
        group.MapPost("/{id:long}/expense-lines/{lineId:long}/remove", RemoveExpenseLineAsync);

        group.MapPost("/{id:long}/other-cost-lines", CreateOtherCostLineAsync);
        group.MapPut("/{id:long}/other-cost-lines/{lineId:long}", UpdateOtherCostLineAsync);
        group.MapPost("/{id:long}/other-cost-lines/{lineId:long}/remove", RemoveOtherCostLineAsync);

        group.MapPut("/{id:long}/assignments/{assignmentId:long}", UpdateAssignmentAsync);
        group.MapPut("/{id:long}/contingency", UpdateContingencyAsync);
    }

    private static async Task<IResult> GetWorkspaceAsync(
        long id,
        SqlConnectionFactory connections,
        CurrentUserService users,
        BusinessClock clock,
        CancellationToken cancellationToken)
    {
        await users.DemandPermissionAsync("estimate.read", cancellationToken);
        var actor = await users.GetRequiredAsync(cancellationToken);
        await using var connection = await connections.OpenAsync(cancellationToken);

        var header = await ReadWorkspaceHeaderAsync(connection, id, cancellationToken);
        var (canWrite, canApprove) = await ReadEstimatePermissionsAsync(connection, actor.Role, cancellationToken);
        var assignments = await ReadAssignmentsAsync(connection, id, actor, header.OwnerId, header.Status, canWrite, cancellationToken);
        var assignedSections = assignments
            .Where(item => item.OwnerId == actor.Id || item.SupportId == actor.Id)
            .Select(item => CanonicalSectionCode(item.Section))
            .Where(item => item is not null)
            .Select(item => item!)
            .ToHashSet(StringComparer.OrdinalIgnoreCase);
        var editable = EditableStatuses.Contains(header.Status, StringComparer.OrdinalIgnoreCase);
        var elevated = IsElevated(actor, header.OwnerId);
        var canEditCostItems = canWrite && editable && (elevated || assignedSections.Count > 0);
        var canEditManhour = canWrite && editable && (elevated || assignedSections.Contains("06"));
        var canEditExpenses = canWrite && editable && (elevated || assignedSections.Overlaps(["08", "09", "10"]));
        var canEditOtherCosts = canWrite && editable && elevated;
        var capabilities = new WorkspaceCapabilities(
            canEditCostItems || canEditManhour || canEditExpenses || canEditOtherCosts,
            canWrite && editable && elevated,
            assignedSections.OrderBy(value => value, StringComparer.OrdinalIgnoreCase).ToArray(),
            canWrite && editable && elevated,
            canApprove && string.Equals(header.Status, "Engineering Review", StringComparison.OrdinalIgnoreCase) && actor.Id != header.OwnerId,
            canApprove && string.Equals(header.Status, "Engineering Review", StringComparison.OrdinalIgnoreCase) && actor.Id != header.OwnerId,
            canWrite && editable && elevated,
            canWrite && editable && elevated,
            canEditCostItems,
            canEditManhour,
            canEditExpenses,
            canEditOtherCosts);

        var costItems = await ReadCostItemsAsync(connection, id, actor, header, assignedSections, canWrite, cancellationToken);
        var manhourLines = await ReadManhourLinesAsync(connection, id, actor, header, assignedSections, canWrite, cancellationToken);
        var expenseLines = await ReadExpenseLinesAsync(connection, id, actor, header, assignedSections, canWrite, cancellationToken);
        var otherCostLines = await ReadOtherCostLinesAsync(connection, id, header, canWrite && editable && elevated, cancellationToken);
        var revisionHistory = await ReadRevisionHistoryAsync(connection, id, cancellationToken);
        var validationIssues = await ReadValidationIssuesAsync(connection, null, id, clock.Today, cancellationToken);

        return Results.Ok(new
        {
            header,
            capabilities,
            costItems,
            manhourLines,
            expenseLines,
            otherCostLines,
            assignments,
            revisionHistory,
            validationIssues
        });
    }

    private static async Task<WorkspaceHeader> ReadWorkspaceHeaderAsync(
        SqlConnection connection,
        long id,
        CancellationToken cancellationToken)
    {
        await using var command = new SqlCommand("""
            SELECT e.id, e.estimate_no, e.inquiry_id, i.inquiry_no,
                   e.customer_id, c.code, c.name, e.project_name, e.project_type,
                   e.owner_id, owner_user.name, e.revision, e.created_date, e.due_date,
                   e.status, e.progress, e.contingency_rate, e.locked_at, e.locked_by,
                   locked_user.name, e.created_at, e.updated_at, e.row_version,
                   t.material_total, t.engineering_total, t.outsource_total,
                   t.transportation_total, t.accommodation_total, t.other_total,
                   t.base_total, t.contingency_total, t.total
            FROM dbo.estimates e
            INNER JOIN dbo.inquiries i ON i.id = e.inquiry_id AND i.deleted_at IS NULL
            INNER JOIN dbo.customers c ON c.id = e.customer_id AND c.deleted_at IS NULL
            INNER JOIN dbo.users owner_user ON owner_user.id = e.owner_id
            LEFT JOIN dbo.users locked_user ON locked_user.id = e.locked_by
            INNER JOIN dbo.v_estimate_totals t ON t.estimate_id = e.id
            WHERE e.id = @id AND e.deleted_at IS NULL;
            """, connection);
        command.Parameters.AddParameter("@id", SqlDbType.BigInt, id);
        await using var reader = await command.ExecuteReaderAsync(CommandBehavior.SingleRow, cancellationToken);
        if (!await reader.ReadAsync(cancellationToken))
            throw new ApiException(StatusCodes.Status404NotFound, "estimate_not_found", "Estimate not found.");

        return new WorkspaceHeader(
            reader.GetInt64(0), reader.GetString(1), reader.GetInt64(2), reader.GetString(3),
            reader.GetInt64(4), reader.GetString(5), reader.GetString(6), reader.GetString(7), reader.GetString(8),
            reader.GetInt64(9), reader.GetString(10), reader.GetInt32(11), reader.GetFieldValue<DateOnly>(12),
            reader.GetFieldValue<DateOnly>(13), reader.GetString(14), reader.GetDecimal(15), reader.GetDecimal(16),
            reader.IsDBNull(17) ? null : reader.GetFieldValue<DateTimeOffset>(17),
            reader.IsDBNull(18) ? null : reader.GetInt64(18), reader.IsDBNull(19) ? null : reader.GetString(19),
            reader.GetFieldValue<DateTimeOffset>(20), reader.GetFieldValue<DateTimeOffset>(21), reader.RowVersionString(22),
            new EstimateTotals(
                reader.GetDecimal(23), reader.GetDecimal(24), reader.GetDecimal(25), reader.GetDecimal(26),
                reader.GetDecimal(27), reader.GetDecimal(28), reader.GetDecimal(29), reader.GetDecimal(30), reader.GetDecimal(31)));
    }

    private static async Task<List<AssignmentDto>> ReadAssignmentsAsync(
        SqlConnection connection,
        long estimateId,
        CurrentUser actor,
        long estimateOwnerId,
        string estimateStatus,
        bool canWrite,
        CancellationToken cancellationToken)
    {
        await using var command = new SqlCommand("""
            SELECT a.id, a.section, a.owner_id, owner_user.name, a.support_id, support_user.name,
                   a.due_date, a.status, a.progress, a.comment, a.row_version
            FROM dbo.estimate_assignments a
            INNER JOIN dbo.users owner_user ON owner_user.id = a.owner_id
            LEFT JOIN dbo.users support_user ON support_user.id = a.support_id
            WHERE a.estimate_id = @estimate_id
            ORDER BY a.section, a.id;
            """, connection);
        command.Parameters.AddParameter("@estimate_id", SqlDbType.BigInt, estimateId);
        var result = new List<AssignmentDto>();
        await using var reader = await command.ExecuteReaderAsync(cancellationToken);
        while (await reader.ReadAsync(cancellationToken))
        {
            var ownerId = reader.GetInt64(2);
            var supportId = reader.IsDBNull(4) ? (long?)null : reader.GetInt64(4);
            result.Add(new AssignmentDto(
                reader.GetInt64(0), reader.GetString(1), ownerId, reader.GetString(3), supportId,
                reader.IsDBNull(5) ? null : reader.GetString(5), reader.GetFieldValue<DateOnly>(6), reader.GetString(7),
                reader.GetDecimal(8), reader.IsDBNull(9) ? null : reader.GetString(9), reader.RowVersionString(10),
                canWrite && EditableStatuses.Contains(estimateStatus, StringComparer.OrdinalIgnoreCase)
                    && (IsElevated(actor, estimateOwnerId) || ownerId == actor.Id || supportId == actor.Id)));
        }
        return result;
    }

    private static async Task<(bool CanWrite, bool CanApprove)> ReadEstimatePermissionsAsync(
        SqlConnection connection,
        string role,
        CancellationToken cancellationToken)
    {
        await using var command = new SqlCommand("""
            SELECT
                CONVERT(bit, COALESCE(MAX(CASE WHEN p.code = N'estimate.write' THEN 1 ELSE 0 END), 0)),
                CONVERT(bit, COALESCE(MAX(CASE WHEN p.code = N'estimate.approve' THEN 1 ELSE 0 END), 0))
            FROM dbo.roles r
            LEFT JOIN dbo.role_permissions rp ON rp.role_id = r.id
            LEFT JOIN dbo.permissions p ON p.id = rp.permission_id
            WHERE r.code = @role;
            """, connection);
        command.Parameters.AddParameter("@role", SqlDbType.NVarChar, role, 50);
        await using var reader = await command.ExecuteReaderAsync(CommandBehavior.SingleRow, cancellationToken);
        await reader.ReadAsync(cancellationToken);
        return (reader.GetBoolean(0), reader.GetBoolean(1));
    }

    private static async Task<List<object>> ReadCostItemsAsync(
        SqlConnection connection,
        long estimateId,
        CurrentUser actor,
        WorkspaceHeader header,
        HashSet<string> assignedSections,
        bool canWrite,
        CancellationToken cancellationToken)
    {
        await using var command = new SqlCommand("""
            SELECT ci.id, ci.category_code, ci.category, ci.subcategory, ci.module, ci.item_code,
                   ci.description, ci.brand, ci.model, ci.specification, ci.supplier_id, s.name,
                   ci.qty, ci.unit, ci.unit_cost, ci.line_total, ci.price_source, ci.reference_no,
                   ci.reference_project, ci.price_date, ci.remark, ci.owner_id, u.name, ci.status,
                   ci.updated_at, ci.row_version
            FROM dbo.cost_items ci
            INNER JOIN dbo.estimates e ON e.id = ci.estimate_id AND e.revision = ci.revision
            INNER JOIN dbo.users u ON u.id = ci.owner_id
            LEFT JOIN dbo.suppliers s ON s.id = ci.supplier_id
            WHERE ci.estimate_id = @estimate_id AND ci.deleted_at IS NULL
            ORDER BY ci.category_code, ci.module, ci.id;
            """, connection);
        command.Parameters.AddParameter("@estimate_id", SqlDbType.BigInt, estimateId);
        var result = new List<object>();
        var editable = canWrite && EditableStatuses.Contains(header.Status, StringComparer.OrdinalIgnoreCase);
        var elevated = IsElevated(actor, header.OwnerId);
        await using var reader = await command.ExecuteReaderAsync(cancellationToken);
        while (await reader.ReadAsync(cancellationToken))
        {
            var categoryCode = reader.GetString(1);
            var ownerId = reader.GetInt64(21);
            result.Add(new
            {
                id = reader.GetInt64(0), categoryCode, category = reader.GetString(2), subcategory = reader.GetString(3),
                module = reader.GetString(4), itemCode = reader.GetString(5), description = reader.GetString(6),
                brand = reader.GetString(7), model = reader.GetString(8), specification = reader.IsDBNull(9) ? null : reader.GetString(9),
                supplierId = reader.IsDBNull(10) ? (long?)null : reader.GetInt64(10), supplierName = reader.IsDBNull(11) ? null : reader.GetString(11),
                quantity = reader.GetDecimal(12), unit = reader.GetString(13), unitCost = reader.GetDecimal(14), lineTotal = reader.GetDecimal(15),
                priceSource = reader.GetString(16), referenceNumber = reader.IsDBNull(17) ? null : reader.GetString(17),
                referenceProject = reader.IsDBNull(18) ? null : reader.GetString(18), priceDate = reader.IsDBNull(19) ? (DateOnly?)null : reader.GetFieldValue<DateOnly>(19),
                remark = reader.IsDBNull(20) ? null : reader.GetString(20), ownerId, ownerName = reader.GetString(22), status = reader.GetString(23),
                updatedAt = reader.GetFieldValue<DateTimeOffset>(24), rowVersion = reader.RowVersionString(25),
                canEdit = editable && (elevated || assignedSections.Contains(categoryCode))
            });
        }
        return result;
    }

    private static async Task<List<object>> ReadManhourLinesAsync(
        SqlConnection connection,
        long estimateId,
        CurrentUser actor,
        WorkspaceHeader header,
        HashSet<string> assignedSections,
        bool canWrite,
        CancellationToken cancellationToken)
    {
        await using var command = new SqlCommand("""
            SELECT l.id, l.package, l.activity, l.department, l.level, l.cost_type, l.provider,
                   l.supplier_id, s.name, l.quotation_no, l.price_date, l.engineers, l.man_days,
                   l.hours_per_day, l.daily_rate, l.line_cost, l.owner_id, u.name, l.remark,
                   l.updated_at, l.row_version
            FROM dbo.manhour_lines l
            INNER JOIN dbo.estimates e ON e.id = l.estimate_id AND e.revision = l.revision
            INNER JOIN dbo.users u ON u.id = l.owner_id
            LEFT JOIN dbo.suppliers s ON s.id = l.supplier_id
            WHERE l.estimate_id = @estimate_id AND l.deleted_at IS NULL
            ORDER BY l.package, l.id;
            """, connection);
        command.Parameters.AddParameter("@estimate_id", SqlDbType.BigInt, estimateId);
        var result = new List<object>();
        var editable = canWrite && EditableStatuses.Contains(header.Status, StringComparer.OrdinalIgnoreCase);
        var elevated = IsElevated(actor, header.OwnerId);
        await using var reader = await command.ExecuteReaderAsync(cancellationToken);
        while (await reader.ReadAsync(cancellationToken))
        {
            var package = reader.GetString(1);
            var ownerId = reader.GetInt64(16);
            result.Add(new
            {
                id = reader.GetInt64(0), package, activity = reader.GetString(2), department = reader.GetString(3),
                level = reader.GetString(4), costType = reader.GetString(5), provider = reader.GetString(6),
                supplierId = reader.IsDBNull(7) ? (long?)null : reader.GetInt64(7), supplierName = reader.IsDBNull(8) ? null : reader.GetString(8),
                quotationNumber = reader.IsDBNull(9) ? null : reader.GetString(9), priceDate = reader.IsDBNull(10) ? (DateOnly?)null : reader.GetFieldValue<DateOnly>(10),
                engineers = reader.GetDecimal(11), manDays = reader.GetDecimal(12), hoursPerDay = reader.GetDecimal(13), dailyRate = reader.GetDecimal(14),
                manHours = reader.GetDecimal(11) * reader.GetDecimal(12) * reader.GetDecimal(13), lineCost = reader.GetDecimal(15),
                ownerId, ownerName = reader.GetString(17), remark = reader.IsDBNull(18) ? null : reader.GetString(18),
                updatedAt = reader.GetFieldValue<DateTimeOffset>(19), rowVersion = reader.RowVersionString(20),
                canEdit = editable && (elevated || (assignedSections.Contains("06") && ownerId == actor.Id))
            });
        }
        return result;
    }

    private static async Task<List<object>> ReadExpenseLinesAsync(
        SqlConnection connection,
        long estimateId,
        CurrentUser actor,
        WorkspaceHeader header,
        HashSet<string> assignedSections,
        bool canWrite,
        CancellationToken cancellationToken)
    {
        await using var command = new SqlCommand("""
            SELECT l.id, l.package, l.expense_type, l.description, l.cost_type, l.supplier_id, s.name,
                   l.reference_no, l.qty, l.unit, l.unit_cost, l.line_total, l.owner_id, u.name,
                   l.remark, l.updated_at, l.row_version
            FROM dbo.expense_lines l
            INNER JOIN dbo.estimates e ON e.id = l.estimate_id AND e.revision = l.revision
            INNER JOIN dbo.users u ON u.id = l.owner_id
            LEFT JOIN dbo.suppliers s ON s.id = l.supplier_id
            WHERE l.estimate_id = @estimate_id AND l.deleted_at IS NULL
            ORDER BY l.package, l.id;
            """, connection);
        command.Parameters.AddParameter("@estimate_id", SqlDbType.BigInt, estimateId);
        var result = new List<object>();
        var editable = canWrite && EditableStatuses.Contains(header.Status, StringComparer.OrdinalIgnoreCase);
        var elevated = IsElevated(actor, header.OwnerId);
        await using var reader = await command.ExecuteReaderAsync(cancellationToken);
        while (await reader.ReadAsync(cancellationToken))
        {
            var expenseType = reader.GetString(2);
            var ownerId = reader.GetInt64(12);
            result.Add(new
            {
                id = reader.GetInt64(0), package = reader.GetString(1), expenseType, description = reader.GetString(3),
                costType = reader.GetString(4), supplierId = reader.IsDBNull(5) ? (long?)null : reader.GetInt64(5),
                supplierName = reader.IsDBNull(6) ? null : reader.GetString(6), referenceNumber = reader.IsDBNull(7) ? null : reader.GetString(7),
                quantity = reader.GetDecimal(8), unit = reader.GetString(9), unitCost = reader.GetDecimal(10), lineTotal = reader.GetDecimal(11),
                ownerId, ownerName = reader.GetString(13), remark = reader.IsDBNull(14) ? null : reader.GetString(14),
                updatedAt = reader.GetFieldValue<DateTimeOffset>(15), rowVersion = reader.RowVersionString(16),
                canEdit = editable && (elevated || (assignedSections.Contains(ExpenseSectionCode(expenseType)) && ownerId == actor.Id))
            });
        }
        return result;
    }

    private static async Task<List<object>> ReadOtherCostLinesAsync(
        SqlConnection connection,
        long estimateId,
        WorkspaceHeader header,
        bool canEdit,
        CancellationToken cancellationToken)
    {
        await using var command = new SqlCommand("""
            SELECT l.id, l.category, l.description, l.qty, l.unit, l.unit_cost, l.line_total,
                   l.remark, l.row_version
            FROM dbo.other_cost_lines l
            INNER JOIN dbo.estimates e ON e.id = l.estimate_id AND e.revision = l.revision
            WHERE l.estimate_id = @estimate_id AND l.deleted_at IS NULL
            ORDER BY l.category, l.id;
            """, connection);
        command.Parameters.AddParameter("@estimate_id", SqlDbType.BigInt, estimateId);
        var result = new List<object>();
        await using var reader = await command.ExecuteReaderAsync(cancellationToken);
        while (await reader.ReadAsync(cancellationToken))
            result.Add(new
            {
                id = reader.GetInt64(0), category = reader.GetString(1), description = reader.GetString(2),
                quantity = reader.GetDecimal(3), unit = reader.GetString(4), unitCost = reader.GetDecimal(5), lineTotal = reader.GetDecimal(6),
                remark = reader.IsDBNull(7) ? null : reader.GetString(7), rowVersion = reader.RowVersionString(8), canEdit
            });
        return result;
    }

    private static async Task<List<object>> ReadRevisionHistoryAsync(
        SqlConnection connection,
        long estimateId,
        CancellationToken cancellationToken)
    {
        await using var command = new SqlCommand("""
            SELECT r.id, r.revision, r.code, r.reason, r.description, r.created_by, creator.name,
                   r.created_at, r.reviewed_by, reviewer.name, r.reviewed_at, r.status, r.total
            FROM dbo.estimate_revisions r
            INNER JOIN dbo.users creator ON creator.id = r.created_by
            LEFT JOIN dbo.users reviewer ON reviewer.id = r.reviewed_by
            WHERE r.estimate_id = @estimate_id
            ORDER BY r.revision DESC, r.id DESC;
            """, connection);
        command.Parameters.AddParameter("@estimate_id", SqlDbType.BigInt, estimateId);
        var result = new List<object>();
        await using var reader = await command.ExecuteReaderAsync(cancellationToken);
        while (await reader.ReadAsync(cancellationToken))
            result.Add(new
            {
                id = reader.GetInt64(0), revision = reader.GetInt32(1), code = reader.GetString(2), reason = reader.GetString(3),
                description = reader.GetString(4), createdById = reader.GetInt64(5), createdByName = reader.GetString(6),
                createdAt = reader.GetFieldValue<DateTimeOffset>(7), reviewedById = reader.IsDBNull(8) ? (long?)null : reader.GetInt64(8),
                reviewedByName = reader.IsDBNull(9) ? null : reader.GetString(9), reviewedAt = reader.IsDBNull(10) ? (DateTimeOffset?)null : reader.GetFieldValue<DateTimeOffset>(10),
                status = reader.GetString(11), total = reader.GetDecimal(12)
            });
        return result;
    }

    private static async Task<List<ValidationIssueDto>> ReadValidationIssuesAsync(
        SqlConnection connection,
        SqlTransaction? transaction,
        long estimateId,
        DateOnly businessDate,
        CancellationToken cancellationToken)
    {
        await using var command = new SqlCommand("""
            SELECT code, message, entity_type, entity_id, CAST(N'Error' AS nvarchar(20)) AS severity
            FROM dbo.fn_estimate_validation(@estimate_id)

            UNION ALL

            SELECT N'cost_reference_missing',
                   N'Cost item "' + ci.item_code + N'" has no reference number.',
                   N'CostItem', ci.id, N'Warning'
            FROM dbo.cost_items ci
            INNER JOIN dbo.estimates e ON e.id=ci.estimate_id AND e.revision=ci.revision
            WHERE ci.estimate_id=@estimate_id AND ci.deleted_at IS NULL
              AND NULLIF(LTRIM(RTRIM(ci.reference_no)), N'') IS NULL

            UNION ALL

            SELECT N'cost_price_stale',
                   N'Cost item "' + ci.item_code + N'" uses a price older than 180 days.',
                   N'CostItem', ci.id, N'Warning'
            FROM dbo.cost_items ci
            INNER JOIN dbo.estimates e ON e.id=ci.estimate_id AND e.revision=ci.revision
            WHERE ci.estimate_id=@estimate_id AND ci.deleted_at IS NULL
              AND ci.price_date < @stale_before

            UNION ALL

            SELECT N'transportation_category_missing',
                   N'No current cost item is assigned to category 08 Transportation.',
                   N'Estimate', e.id, N'Warning'
            FROM dbo.estimates e
            WHERE e.id=@estimate_id AND e.deleted_at IS NULL
              AND NOT EXISTS (
                  SELECT 1 FROM dbo.cost_items ci
                  WHERE ci.estimate_id=e.id AND ci.revision=e.revision
                    AND ci.category_code='08' AND ci.deleted_at IS NULL)

            UNION ALL

            SELECT N'manhour_capacity_high',
                   N'Man-hour activity "' + l.activity + N'" exceeds 20 engineer-days.',
                   N'ManhourLine', l.id, N'Warning'
            FROM dbo.manhour_lines l
            INNER JOIN dbo.estimates e ON e.id=l.estimate_id AND e.revision=l.revision
            WHERE l.estimate_id=@estimate_id AND l.deleted_at IS NULL
              AND l.engineers*l.man_days > 20

            UNION ALL

            SELECT N'supplier_price_stale',
                   N'Supplier man-hour activity "' + l.activity + N'" uses a quotation older than 180 days.',
                   N'ManhourLine', l.id, N'Warning'
            FROM dbo.manhour_lines l
            INNER JOIN dbo.estimates e ON e.id=l.estimate_id AND e.revision=l.revision
            WHERE l.estimate_id=@estimate_id AND l.deleted_at IS NULL
              AND l.provider=N'Supplier' AND l.price_date < @stale_before

            UNION ALL

            SELECT N'installation_transportation_missing',
                   N'Installation effort exists without a Travel or Transportation expense.',
                   N'Estimate', e.id, N'Warning'
            FROM dbo.estimates e
            WHERE e.id=@estimate_id AND e.deleted_at IS NULL
              AND EXISTS (
                  SELECT 1 FROM dbo.manhour_lines l
                  WHERE l.estimate_id=e.id AND l.revision=e.revision
                    AND l.cost_type=N'Installation' AND l.deleted_at IS NULL)
              AND NOT EXISTS (
                  SELECT 1 FROM dbo.expense_lines x
                  WHERE x.estimate_id=e.id AND x.revision=e.revision
                    AND x.expense_type IN (N'Travel', N'Transportation') AND x.deleted_at IS NULL)

            UNION ALL

            SELECT N'installation_accommodation_missing',
                   N'Installation effort exists without an Accommodation or Per Diem expense.',
                   N'Estimate', e.id, N'Warning'
            FROM dbo.estimates e
            WHERE e.id=@estimate_id AND e.deleted_at IS NULL
              AND EXISTS (
                  SELECT 1 FROM dbo.manhour_lines l
                  WHERE l.estimate_id=e.id AND l.revision=e.revision
                    AND l.cost_type=N'Installation' AND l.deleted_at IS NULL)
              AND NOT EXISTS (
                  SELECT 1 FROM dbo.expense_lines x
                  WHERE x.estimate_id=e.id AND x.revision=e.revision
                    AND x.expense_type IN (N'Accommodation', N'Per Diem') AND x.deleted_at IS NULL)

            ORDER BY severity, code, entity_id;
            """, connection, transaction);
        command.Parameters.AddParameter("@estimate_id", SqlDbType.BigInt, estimateId);
        command.Parameters.AddParameter("@stale_before", SqlDbType.Date, businessDate.AddDays(-180));
        var result = new List<ValidationIssueDto>();
        await using var reader = await command.ExecuteReaderAsync(cancellationToken);
        while (await reader.ReadAsync(cancellationToken))
            result.Add(new ValidationIssueDto(reader.GetString(0), reader.GetString(1), reader.GetString(2), reader.GetInt64(3), reader.GetString(4)));
        return result;
    }

    private static bool IsElevated(CurrentUser actor, long ownerId) =>
        actor.Id == ownerId || actor.Role is "Engineering Manager" or "Admin";

    private static string? CanonicalSectionCode(string section)
    {
        var value = section.Trim();
        if (value.Length < 2 || !char.IsAsciiDigit(value[0]) || !char.IsAsciiDigit(value[1])) return null;
        var code = value[..2];
        return int.TryParse(code, out var number) && number is >= 1 and <= 10 ? code : null;
    }

    private static string ExpenseSectionCode(string expenseType) => expenseType.Trim() switch
    {
        "Travel" or "Transportation" => "08",
        "Accommodation" or "Per Diem" => "09",
        "Equipment Rental" or "Other" => "10",
        _ => throw new ApiException(StatusCodes.Status400BadRequest, "validation_failed", "Expense type does not map to a controlled estimate section.")
    };

    private static async Task<IResult> CreateManhourLineAsync(
        long id,
        ManhourLineRequest request,
        SqlConnectionFactory connections,
        CurrentUserService users,
        BusinessClock clock,
        CancellationToken cancellationToken)
    {
        await users.DemandPermissionAsync("estimate.write", cancellationToken);
        ValidateManhourRequest(request, requireLineVersion: false);
        var actor = await users.GetRequiredAsync(cancellationToken);
        await using var connection = await connections.OpenAsync(cancellationToken);
        await using var transaction = (SqlTransaction)await connection.BeginTransactionAsync(IsolationLevel.Serializable, cancellationToken);
        try
        {
            var estimate = await LockEditableEstimateAsync(connection, transaction, id, request.EstimateRowVersion, cancellationToken);
            await DemandAssignedSectionWriterAsync(connection, transaction, id, actor, estimate, "06", request.OwnerId, cancellationToken);
            await ValidateActiveOwnerAndSupplierAsync(connection, transaction, request.OwnerId, request.SupplierId, cancellationToken);
            var dailyRate = await ResolveDailyRateAsync(connection, transaction, request, clock.Today, cancellationToken);
            ValidateManhourLineCost(request.Engineers, request.ManDays, dailyRate);

            await using var insert = new SqlCommand("""
                DECLARE @result table (id bigint NOT NULL, row_version binary(8) NOT NULL);

                INSERT INTO dbo.manhour_lines (
                    estimate_id, revision, package, activity, department, level, cost_type, provider,
                    supplier_id, quotation_no, price_date, engineers, man_days, hours_per_day,
                    daily_rate, owner_id, remark, created_by, updated_by)
                OUTPUT inserted.id, inserted.row_version INTO @result (id, row_version)
                VALUES (@estimate_id, @revision, @package, @activity, @department, @level, @cost_type, @provider,
                    @supplier_id, @quotation_no, @price_date, @engineers, @man_days, @hours_per_day,
                    @daily_rate, @owner_id, @remark, @actor, @actor);

                SELECT id, row_version FROM @result;
                """, connection, transaction);
            AddManhourParameters(insert, id, estimate.Revision, request, dailyRate, clock.Today, actor.Id);
            long lineId;
            byte[] lineVersion;
            await using (var reader = await insert.ExecuteReaderAsync(CommandBehavior.SingleRow, cancellationToken))
            {
                await reader.ReadAsync(cancellationToken);
                lineId = reader.GetInt64(0);
                lineVersion = (byte[])reader.GetValue(1);
            }

            var estimateVersion = await TouchEstimateAsync(connection, transaction, id, actor.Id, cancellationToken);
            var after = await ReadManhourSnapshotAsync(connection, transaction, id, estimate.Revision, lineId, lineVersion, includeDeleted: false, cancellationToken);
            await InquiryEndpoints.InsertAuditAsync(connection, transaction, actor.Id, "ManhourLine", lineId, estimate.Number, "Created", null, after, cancellationToken);
            await transaction.CommitAsync(cancellationToken);
            return Results.Created($"/api/v1/estimates/{id}/manhour-lines/{lineId}", new
            {
                id = lineId,
                rowVersion = Convert.ToBase64String(lineVersion),
                estimateRowVersion = Convert.ToBase64String(estimateVersion)
            });
        }
        catch
        {
            await transaction.RollbackAsync(cancellationToken);
            throw;
        }
    }

    private static async Task<IResult> UpdateManhourLineAsync(
        long id,
        long lineId,
        ManhourLineRequest request,
        SqlConnectionFactory connections,
        CurrentUserService users,
        BusinessClock clock,
        CancellationToken cancellationToken)
    {
        await users.DemandPermissionAsync("estimate.write", cancellationToken);
        ValidateManhourRequest(request, requireLineVersion: true);
        var actor = await users.GetRequiredAsync(cancellationToken);
        await using var connection = await connections.OpenAsync(cancellationToken);
        await using var transaction = (SqlTransaction)await connection.BeginTransactionAsync(IsolationLevel.Serializable, cancellationToken);
        try
        {
            var estimate = await LockEditableEstimateAsync(connection, transaction, id, request.EstimateRowVersion, cancellationToken);
            var expectedLineVersion = SqlExtensions.ParseRowVersion(request.LineRowVersion!);
            var before = await ReadManhourSnapshotAsync(connection, transaction, id, estimate.Revision, lineId, expectedLineVersion, includeDeleted: false, cancellationToken);
            await DemandExistingOwnedSectionWriterAsync(connection, transaction, id, actor, estimate, "06", "06", before.OwnerId, request.OwnerId, cancellationToken);
            await ValidateActiveOwnerAndSupplierAsync(connection, transaction, request.OwnerId, request.SupplierId, cancellationToken);
            var dailyRate = await ResolveDailyRateAsync(connection, transaction, request, clock.Today, cancellationToken);
            ValidateManhourLineCost(request.Engineers, request.ManDays, dailyRate);

            await using var update = new SqlCommand("""
                DECLARE @result table (row_version binary(8) NOT NULL);

                UPDATE dbo.manhour_lines SET
                    package=@package, activity=@activity, department=@department, level=@level,
                    cost_type=@cost_type, provider=@provider, supplier_id=@supplier_id,
                    quotation_no=@quotation_no, price_date=@price_date, engineers=@engineers,
                    man_days=@man_days, hours_per_day=@hours_per_day, daily_rate=@daily_rate,
                    owner_id=@owner_id, remark=@remark, updated_by=@actor, updated_at=SYSUTCDATETIME()
                OUTPUT inserted.row_version INTO @result (row_version)
                WHERE id=@line_id AND estimate_id=@estimate_id AND revision=@revision
                  AND deleted_at IS NULL AND row_version=@line_version;

                SELECT row_version FROM @result;
                """, connection, transaction);
            AddManhourParameters(update, id, estimate.Revision, request, dailyRate, clock.Today, actor.Id);
            update.Parameters.AddParameter("@line_id", SqlDbType.BigInt, lineId);
            update.Parameters.AddParameter("@line_version", SqlDbType.Timestamp, expectedLineVersion);
            var lineVersion = await update.ExecuteScalarAsync(cancellationToken) as byte[]
                ?? throw new ApiException(StatusCodes.Status409Conflict, "concurrency_conflict", "This man-hour line changed or was removed. Reload and try again.");
            var estimateVersion = await TouchEstimateAsync(connection, transaction, id, actor.Id, cancellationToken);
            var after = await ReadManhourSnapshotAsync(connection, transaction, id, estimate.Revision, lineId, lineVersion, includeDeleted: false, cancellationToken);
            await InquiryEndpoints.InsertAuditAsync(connection, transaction, actor.Id, "ManhourLine", lineId, estimate.Number, "Updated", before, after, cancellationToken);
            await transaction.CommitAsync(cancellationToken);
            return Results.Ok(new
            {
                id = lineId,
                rowVersion = Convert.ToBase64String(lineVersion),
                estimateRowVersion = Convert.ToBase64String(estimateVersion)
            });
        }
        catch
        {
            await transaction.RollbackAsync(cancellationToken);
            throw;
        }
    }

    private static async Task<IResult> RemoveManhourLineAsync(
        long id,
        long lineId,
        RemoveEstimateLineRequest request,
        SqlConnectionFactory connections,
        CurrentUserService users,
        CancellationToken cancellationToken)
    {
        await users.DemandPermissionAsync("estimate.write", cancellationToken);
        ValidateRemoveRequest(request);
        var actor = await users.GetRequiredAsync(cancellationToken);
        await using var connection = await connections.OpenAsync(cancellationToken);
        await using var transaction = (SqlTransaction)await connection.BeginTransactionAsync(IsolationLevel.Serializable, cancellationToken);
        try
        {
            var estimate = await LockEditableEstimateAsync(connection, transaction, id, request.EstimateRowVersion, cancellationToken);
            var expectedLineVersion = SqlExtensions.ParseRowVersion(request.LineRowVersion);
            var before = await ReadManhourSnapshotAsync(connection, transaction, id, estimate.Revision, lineId, expectedLineVersion, includeDeleted: false, cancellationToken);
            await DemandExistingOwnedSectionWriterAsync(connection, transaction, id, actor, estimate, "06", "06", before.OwnerId, before.OwnerId, cancellationToken);
            var removedVersion = await SoftDeleteLineAsync(connection, transaction, "manhour_lines", id, estimate.Revision, lineId, expectedLineVersion, actor.Id, cancellationToken);
            var estimateVersion = await TouchEstimateAsync(connection, transaction, id, actor.Id, cancellationToken);
            var after = await ReadManhourSnapshotAsync(connection, transaction, id, estimate.Revision, lineId, removedVersion, includeDeleted: true, cancellationToken);
            await InquiryEndpoints.InsertAuditAsync(connection, transaction, actor.Id, "ManhourLine", lineId, estimate.Number, "Removed", new { line = before }, new { line = after, removalReason = request.Reason?.Trim() }, cancellationToken);
            await transaction.CommitAsync(cancellationToken);
            return Results.Ok(new { id = lineId, estimateRowVersion = Convert.ToBase64String(estimateVersion) });
        }
        catch
        {
            await transaction.RollbackAsync(cancellationToken);
            throw;
        }
    }

    private static void ValidateManhourRequest(ManhourLineRequest request, bool requireLineVersion)
    {
        ValidateEstimateAndLineVersions(request.EstimateRowVersion, request.LineRowVersion, requireLineVersion);
        InputValidation.RequiredText(request.Package, 200, "Work package");
        InputValidation.RequiredText(request.Activity, 300, "Activity");
        InputValidation.RequiredText(request.Department, 100, "Department");
        InputValidation.RequiredText(request.Level, 100, "Engineer level");
        InputValidation.OneOf(request.CostType, "Cost type", "Engineering", "Installation");
        InputValidation.OneOf(request.Provider, "Provider", "Internal", "Supplier");
        InputValidation.OptionalText(request.QuotationNumber, 100, "Quotation number");
        InputValidation.OptionalText(request.Remark, 20_000, "Remark");
        InputValidation.DecimalRange(request.Engineers, 0.01m, 1_000_000m, "Engineers");
        InputValidation.DecimalRange(request.ManDays, 0.01m, 1_000_000m, "Man-days");
        InputValidation.DecimalRange(request.HoursPerDay, 0.01m, 24m, "Hours per day");
        InputValidation.DecimalRange(request.DailyRate, 0m, 1_000_000_000m, "Daily rate");
        InputValidation.DecimalScale(request.Engineers, 2, "Engineers");
        InputValidation.DecimalScale(request.ManDays, 2, "Man-days");
        InputValidation.DecimalScale(request.HoursPerDay, 2, "Hours per day");
        InputValidation.DecimalScale(request.DailyRate, 4, "Daily rate");
        if (request.OwnerId <= 0)
            throw new ApiException(StatusCodes.Status400BadRequest, "validation_failed", "A valid owner is required.");
        if (string.Equals(request.Provider.Trim(), "Supplier", StringComparison.Ordinal)
            && (request.SupplierId is null || string.IsNullOrWhiteSpace(request.QuotationNumber) || request.PriceDate is null))
            throw new ApiException(StatusCodes.Status400BadRequest, "validation_failed", "Supplier man-hour requires supplier, quotation number and price date.");
        if (string.Equals(request.Provider.Trim(), "Internal", StringComparison.Ordinal)
            && (request.SupplierId is not null || !string.IsNullOrWhiteSpace(request.QuotationNumber)))
            throw new ApiException(StatusCodes.Status400BadRequest, "validation_failed", "Internal man-hour cannot contain supplier quotation fields.");
    }

    private static async Task<decimal> ResolveDailyRateAsync(
        SqlConnection connection,
        SqlTransaction transaction,
        ManhourLineRequest request,
        DateOnly businessDate,
        CancellationToken cancellationToken)
    {
        if (string.Equals(request.Provider.Trim(), "Supplier", StringComparison.Ordinal)) return request.DailyRate;
        await using var command = new SqlCommand("""
            SELECT TOP (1)
                CASE WHEN @cost_type = N'Installation' THEN installation_daily ELSE engineering_daily END
            FROM dbo.engineering_rates
            WHERE level = @level AND department = @department AND is_active = 1
              AND effective_from <= @business_date
              AND (effective_to IS NULL OR effective_to >= @business_date)
            ORDER BY effective_from DESC, id DESC;
            """, connection, transaction);
        command.Parameters.AddParameter("@cost_type", SqlDbType.NVarChar, request.CostType.Trim(), 30);
        command.Parameters.AddParameter("@level", SqlDbType.NVarChar, request.Level.Trim(), 100);
        command.Parameters.AddParameter("@department", SqlDbType.NVarChar, request.Department.Trim(), 100);
        command.Parameters.AddParameter("@business_date", SqlDbType.Date, businessDate);
        var rate = await command.ExecuteScalarAsync(cancellationToken);
        if (rate is null || rate is DBNull)
            throw new ApiException(StatusCodes.Status422UnprocessableEntity, "engineering_rate_missing", "No active engineering rate matches the selected level, department and cost type.");
        return (decimal)rate;
    }

    private static void ValidateManhourLineCost(decimal engineers, decimal manDays, decimal dailyRate)
    {
        const decimal maximumLineCost = 999_999_999_999_999m;
        if (engineers * manDays * dailyRate > maximumLineCost)
            throw new ApiException(
                StatusCodes.Status400BadRequest,
                "validation_failed",
                "Man-hour line cost exceeds the maximum amount supported by the estimate ledger.");
    }

    private static void AddManhourParameters(
        SqlCommand command,
        long estimateId,
        int revision,
        ManhourLineRequest request,
        decimal dailyRate,
        DateOnly businessDate,
        long actorId)
    {
        var supplierProvider = string.Equals(request.Provider.Trim(), "Supplier", StringComparison.Ordinal);
        command.Parameters.AddParameter("@estimate_id", SqlDbType.BigInt, estimateId);
        command.Parameters.AddParameter("@revision", SqlDbType.Int, revision);
        command.Parameters.AddParameter("@package", SqlDbType.NVarChar, request.Package.Trim(), 200);
        command.Parameters.AddParameter("@activity", SqlDbType.NVarChar, request.Activity.Trim(), 300);
        command.Parameters.AddParameter("@department", SqlDbType.NVarChar, request.Department.Trim(), 100);
        command.Parameters.AddParameter("@level", SqlDbType.NVarChar, request.Level.Trim(), 100);
        command.Parameters.AddParameter("@cost_type", SqlDbType.NVarChar, request.CostType.Trim(), 30);
        command.Parameters.AddParameter("@provider", SqlDbType.NVarChar, request.Provider.Trim(), 30);
        command.Parameters.AddParameter("@supplier_id", SqlDbType.BigInt, supplierProvider ? request.SupplierId : null);
        command.Parameters.AddParameter("@quotation_no", SqlDbType.NVarChar, supplierProvider ? request.QuotationNumber?.Trim() : null, 100);
        command.Parameters.AddParameter("@price_date", SqlDbType.Date, supplierProvider ? request.PriceDate : businessDate);
        command.Parameters.AddParameter("@engineers", SqlDbType.Decimal, request.Engineers, precision: 9, scale: 2);
        command.Parameters.AddParameter("@man_days", SqlDbType.Decimal, request.ManDays, precision: 9, scale: 2);
        command.Parameters.AddParameter("@hours_per_day", SqlDbType.Decimal, request.HoursPerDay, precision: 9, scale: 2);
        command.Parameters.AddParameter("@daily_rate", SqlDbType.Decimal, dailyRate, precision: 19, scale: 4);
        command.Parameters.AddParameter("@owner_id", SqlDbType.BigInt, request.OwnerId);
        command.Parameters.AddParameter("@remark", SqlDbType.NVarChar, request.Remark?.Trim(), -1);
        command.Parameters.AddParameter("@actor", SqlDbType.BigInt, actorId);
    }

    private static async Task<ManhourSnapshot> ReadManhourSnapshotAsync(
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
            SELECT id, package, activity, department, level, cost_type, provider, supplier_id,
                   quotation_no, price_date, engineers, man_days, hours_per_day, daily_rate,
                   owner_id, remark, deleted_at, row_version
            FROM dbo.manhour_lines WITH (UPDLOCK, HOLDLOCK)
            WHERE id=@line_id AND estimate_id=@estimate_id AND revision=@revision
              AND (@include_deleted=1 OR deleted_at IS NULL);
            """, connection, transaction);
        command.Parameters.AddParameter("@line_id", SqlDbType.BigInt, lineId);
        command.Parameters.AddParameter("@estimate_id", SqlDbType.BigInt, estimateId);
        command.Parameters.AddParameter("@revision", SqlDbType.Int, revision);
        command.Parameters.AddParameter("@include_deleted", SqlDbType.Bit, includeDeleted);
        await using var reader = await command.ExecuteReaderAsync(CommandBehavior.SingleRow, cancellationToken);
        if (!await reader.ReadAsync(cancellationToken))
            throw new ApiException(StatusCodes.Status409Conflict, "concurrency_conflict", "This man-hour line changed or was removed. Reload and try again.");
        var actualVersion = (byte[])reader.GetValue(17);
        if (!actualVersion.AsSpan().SequenceEqual(expectedRowVersion))
            throw new ApiException(StatusCodes.Status409Conflict, "concurrency_conflict", "This man-hour line changed or was removed. Reload and try again.");
        return new ManhourSnapshot(
            reader.GetInt64(0), reader.GetString(1), reader.GetString(2), reader.GetString(3), reader.GetString(4), reader.GetString(5),
            reader.GetString(6), reader.IsDBNull(7) ? null : reader.GetInt64(7), reader.IsDBNull(8) ? null : reader.GetString(8),
            reader.IsDBNull(9) ? (DateOnly?)null : reader.GetFieldValue<DateOnly>(9), reader.GetDecimal(10), reader.GetDecimal(11),
            reader.GetDecimal(12), reader.GetDecimal(13), reader.GetInt64(14), reader.IsDBNull(15) ? null : reader.GetString(15),
            reader.IsDBNull(16) ? (DateTimeOffset?)null : reader.GetFieldValue<DateTimeOffset>(16), Convert.ToBase64String(actualVersion));
    }

    private static async Task<IResult> CreateExpenseLineAsync(
        long id, ExpenseLineRequest request, SqlConnectionFactory connections, CurrentUserService users,
        CancellationToken cancellationToken)
    {
        await users.DemandPermissionAsync("estimate.write", cancellationToken);
        ValidateExpenseRequest(request, requireLineVersion: false);
        var actor = await users.GetRequiredAsync(cancellationToken);
        await using var connection = await connections.OpenAsync(cancellationToken);
        await using var transaction = (SqlTransaction)await connection.BeginTransactionAsync(IsolationLevel.Serializable, cancellationToken);
        try
        {
            var estimate = await LockEditableEstimateAsync(connection, transaction, id, request.EstimateRowVersion, cancellationToken);
            await DemandAssignedSectionWriterAsync(
                connection, transaction, id, actor, estimate, ExpenseSectionCode(request.ExpenseType), request.OwnerId, cancellationToken);
            await ValidateActiveOwnerAndSupplierAsync(connection, transaction, request.OwnerId, request.SupplierId, cancellationToken);
            await using var insert = new SqlCommand("""
                DECLARE @result table (id bigint NOT NULL, row_version binary(8) NOT NULL);

                INSERT INTO dbo.expense_lines (
                    estimate_id, revision, package, expense_type, description, cost_type,
                    supplier_id, reference_no, qty, unit, unit_cost, owner_id, remark, created_by, updated_by)
                OUTPUT inserted.id, inserted.row_version INTO @result (id, row_version)
                VALUES (@estimate_id, @revision, @package, @expense_type, @description, @cost_type,
                    @supplier_id, @reference_no, @qty, @unit, @unit_cost, @owner_id, @remark, @actor, @actor);

                SELECT id, row_version FROM @result;
                """, connection, transaction);
            AddExpenseParameters(insert, id, estimate.Revision, request, actor.Id);
            long lineId;
            byte[] lineVersion;
            await using (var reader = await insert.ExecuteReaderAsync(CommandBehavior.SingleRow, cancellationToken))
            {
                await reader.ReadAsync(cancellationToken);
                lineId = reader.GetInt64(0);
                lineVersion = (byte[])reader.GetValue(1);
            }
            var estimateVersion = await TouchEstimateAsync(connection, transaction, id, actor.Id, cancellationToken);
            var after = await ReadExpenseSnapshotAsync(connection, transaction, id, estimate.Revision, lineId, lineVersion, false, cancellationToken);
            await InquiryEndpoints.InsertAuditAsync(connection, transaction, actor.Id, "ExpenseLine", lineId, estimate.Number, "Created", null, after, cancellationToken);
            await transaction.CommitAsync(cancellationToken);
            return Results.Created($"/api/v1/estimates/{id}/expense-lines/{lineId}", new
            {
                id = lineId, rowVersion = Convert.ToBase64String(lineVersion), estimateRowVersion = Convert.ToBase64String(estimateVersion)
            });
        }
        catch
        {
            await transaction.RollbackAsync(cancellationToken);
            throw;
        }
    }

    private static async Task<IResult> UpdateExpenseLineAsync(
        long id, long lineId, ExpenseLineRequest request, SqlConnectionFactory connections, CurrentUserService users,
        CancellationToken cancellationToken)
    {
        await users.DemandPermissionAsync("estimate.write", cancellationToken);
        ValidateExpenseRequest(request, requireLineVersion: true);
        var actor = await users.GetRequiredAsync(cancellationToken);
        await using var connection = await connections.OpenAsync(cancellationToken);
        await using var transaction = (SqlTransaction)await connection.BeginTransactionAsync(IsolationLevel.Serializable, cancellationToken);
        try
        {
            var estimate = await LockEditableEstimateAsync(connection, transaction, id, request.EstimateRowVersion, cancellationToken);
            var expectedLineVersion = SqlExtensions.ParseRowVersion(request.LineRowVersion!);
            var before = await ReadExpenseSnapshotAsync(connection, transaction, id, estimate.Revision, lineId, expectedLineVersion, false, cancellationToken);
            await DemandExistingOwnedSectionWriterAsync(
                connection, transaction, id, actor, estimate,
                ExpenseSectionCode(before.ExpenseType), ExpenseSectionCode(request.ExpenseType),
                before.OwnerId, request.OwnerId, cancellationToken);
            await ValidateActiveOwnerAndSupplierAsync(connection, transaction, request.OwnerId, request.SupplierId, cancellationToken);
            await using var update = new SqlCommand("""
                DECLARE @result table (row_version binary(8) NOT NULL);

                UPDATE dbo.expense_lines SET
                    package=@package, expense_type=@expense_type, description=@description, cost_type=@cost_type,
                    supplier_id=@supplier_id, reference_no=@reference_no, qty=@qty, unit=@unit,
                    unit_cost=@unit_cost, owner_id=@owner_id, remark=@remark,
                    updated_by=@actor, updated_at=SYSUTCDATETIME()
                OUTPUT inserted.row_version INTO @result (row_version)
                WHERE id=@line_id AND estimate_id=@estimate_id AND revision=@revision
                  AND deleted_at IS NULL AND row_version=@line_version;

                SELECT row_version FROM @result;
                """, connection, transaction);
            AddExpenseParameters(update, id, estimate.Revision, request, actor.Id);
            update.Parameters.AddParameter("@line_id", SqlDbType.BigInt, lineId);
            update.Parameters.AddParameter("@line_version", SqlDbType.Timestamp, expectedLineVersion);
            var lineVersion = await update.ExecuteScalarAsync(cancellationToken) as byte[]
                ?? throw new ApiException(StatusCodes.Status409Conflict, "concurrency_conflict", "This expense line changed or was removed. Reload and try again.");
            var estimateVersion = await TouchEstimateAsync(connection, transaction, id, actor.Id, cancellationToken);
            var after = await ReadExpenseSnapshotAsync(connection, transaction, id, estimate.Revision, lineId, lineVersion, false, cancellationToken);
            await InquiryEndpoints.InsertAuditAsync(connection, transaction, actor.Id, "ExpenseLine", lineId, estimate.Number, "Updated", before, after, cancellationToken);
            await transaction.CommitAsync(cancellationToken);
            return Results.Ok(new
            {
                id = lineId, rowVersion = Convert.ToBase64String(lineVersion), estimateRowVersion = Convert.ToBase64String(estimateVersion)
            });
        }
        catch
        {
            await transaction.RollbackAsync(cancellationToken);
            throw;
        }
    }

    private static async Task<IResult> RemoveExpenseLineAsync(
        long id, long lineId, RemoveEstimateLineRequest request, SqlConnectionFactory connections, CurrentUserService users,
        CancellationToken cancellationToken)
    {
        await users.DemandPermissionAsync("estimate.write", cancellationToken);
        ValidateRemoveRequest(request);
        var actor = await users.GetRequiredAsync(cancellationToken);
        await using var connection = await connections.OpenAsync(cancellationToken);
        await using var transaction = (SqlTransaction)await connection.BeginTransactionAsync(IsolationLevel.Serializable, cancellationToken);
        try
        {
            var estimate = await LockEditableEstimateAsync(connection, transaction, id, request.EstimateRowVersion, cancellationToken);
            var expectedLineVersion = SqlExtensions.ParseRowVersion(request.LineRowVersion);
            var before = await ReadExpenseSnapshotAsync(connection, transaction, id, estimate.Revision, lineId, expectedLineVersion, false, cancellationToken);
            var sectionCode = ExpenseSectionCode(before.ExpenseType);
            await DemandExistingOwnedSectionWriterAsync(
                connection, transaction, id, actor, estimate, sectionCode, sectionCode,
                before.OwnerId, before.OwnerId, cancellationToken);
            var removedVersion = await SoftDeleteLineAsync(connection, transaction, "expense_lines", id, estimate.Revision, lineId, expectedLineVersion, actor.Id, cancellationToken);
            var estimateVersion = await TouchEstimateAsync(connection, transaction, id, actor.Id, cancellationToken);
            var after = await ReadExpenseSnapshotAsync(connection, transaction, id, estimate.Revision, lineId, removedVersion, true, cancellationToken);
            await InquiryEndpoints.InsertAuditAsync(connection, transaction, actor.Id, "ExpenseLine", lineId, estimate.Number, "Removed", new { line = before }, new { line = after, removalReason = request.Reason?.Trim() }, cancellationToken);
            await transaction.CommitAsync(cancellationToken);
            return Results.Ok(new { id = lineId, estimateRowVersion = Convert.ToBase64String(estimateVersion) });
        }
        catch
        {
            await transaction.RollbackAsync(cancellationToken);
            throw;
        }
    }

    private static void ValidateExpenseRequest(ExpenseLineRequest request, bool requireLineVersion)
    {
        ValidateEstimateAndLineVersions(request.EstimateRowVersion, request.LineRowVersion, requireLineVersion);
        InputValidation.RequiredText(request.Package, 200, "Work package");
        InputValidation.OneOf(request.ExpenseType, "Expense type", ExpenseTypes);
        InputValidation.RequiredText(request.Description, 500, "Description");
        InputValidation.OneOf(request.CostType, "Cost type", "Engineering", "Installation");
        InputValidation.OptionalText(request.ReferenceNumber, 200, "Reference number");
        InputValidation.RequiredText(request.Unit, 50, "Unit");
        InputValidation.OptionalText(request.Remark, 20_000, "Remark");
        InputValidation.DecimalRange(request.Quantity, 0.0001m, 1_000_000_000m, "Quantity");
        InputValidation.DecimalRange(request.UnitCost, 0m, 1_000_000_000m, "Unit cost");
        InputValidation.DecimalScale(request.Quantity, 4, "Quantity");
        InputValidation.DecimalScale(request.UnitCost, 4, "Unit cost");
        if (request.OwnerId <= 0)
            throw new ApiException(StatusCodes.Status400BadRequest, "validation_failed", "A valid owner is required.");
        if (request.Quantity * request.UnitCost > 999_999_999_999_999m)
            throw new ApiException(StatusCodes.Status400BadRequest, "validation_failed", "Line total exceeds the supported monetary range.");
    }

    private static void AddExpenseParameters(SqlCommand command, long estimateId, int revision, ExpenseLineRequest request, long actorId)
    {
        command.Parameters.AddParameter("@estimate_id", SqlDbType.BigInt, estimateId);
        command.Parameters.AddParameter("@revision", SqlDbType.Int, revision);
        command.Parameters.AddParameter("@package", SqlDbType.NVarChar, request.Package.Trim(), 200);
        command.Parameters.AddParameter("@expense_type", SqlDbType.NVarChar, request.ExpenseType.Trim(), 100);
        command.Parameters.AddParameter("@description", SqlDbType.NVarChar, request.Description.Trim(), 500);
        command.Parameters.AddParameter("@cost_type", SqlDbType.NVarChar, request.CostType.Trim(), 30);
        command.Parameters.AddParameter("@supplier_id", SqlDbType.BigInt, request.SupplierId);
        command.Parameters.AddParameter("@reference_no", SqlDbType.NVarChar, request.ReferenceNumber?.Trim(), 200);
        command.Parameters.AddParameter("@qty", SqlDbType.Decimal, request.Quantity, precision: 19, scale: 4);
        command.Parameters.AddParameter("@unit", SqlDbType.NVarChar, request.Unit.Trim(), 50);
        command.Parameters.AddParameter("@unit_cost", SqlDbType.Decimal, request.UnitCost, precision: 19, scale: 4);
        command.Parameters.AddParameter("@owner_id", SqlDbType.BigInt, request.OwnerId);
        command.Parameters.AddParameter("@remark", SqlDbType.NVarChar, request.Remark?.Trim(), -1);
        command.Parameters.AddParameter("@actor", SqlDbType.BigInt, actorId);
    }

    private static async Task<ExpenseSnapshot> ReadExpenseSnapshotAsync(
        SqlConnection connection, SqlTransaction transaction, long estimateId, int revision, long lineId,
        byte[] expectedRowVersion, bool includeDeleted, CancellationToken cancellationToken)
    {
        await using var command = new SqlCommand("""
            SELECT id, package, expense_type, description, cost_type, supplier_id, reference_no,
                   qty, unit, unit_cost, owner_id, remark, deleted_at, row_version
            FROM dbo.expense_lines WITH (UPDLOCK, HOLDLOCK)
            WHERE id=@line_id AND estimate_id=@estimate_id AND revision=@revision
              AND (@include_deleted=1 OR deleted_at IS NULL);
            """, connection, transaction);
        command.Parameters.AddParameter("@line_id", SqlDbType.BigInt, lineId);
        command.Parameters.AddParameter("@estimate_id", SqlDbType.BigInt, estimateId);
        command.Parameters.AddParameter("@revision", SqlDbType.Int, revision);
        command.Parameters.AddParameter("@include_deleted", SqlDbType.Bit, includeDeleted);
        await using var reader = await command.ExecuteReaderAsync(CommandBehavior.SingleRow, cancellationToken);
        if (!await reader.ReadAsync(cancellationToken))
            throw new ApiException(StatusCodes.Status409Conflict, "concurrency_conflict", "This expense line changed or was removed. Reload and try again.");
        var actualVersion = (byte[])reader.GetValue(13);
        if (!actualVersion.AsSpan().SequenceEqual(expectedRowVersion))
            throw new ApiException(StatusCodes.Status409Conflict, "concurrency_conflict", "This expense line changed or was removed. Reload and try again.");
        return new ExpenseSnapshot(
            reader.GetInt64(0), reader.GetString(1), reader.GetString(2), reader.GetString(3), reader.GetString(4),
            reader.IsDBNull(5) ? null : reader.GetInt64(5), reader.IsDBNull(6) ? null : reader.GetString(6),
            reader.GetDecimal(7), reader.GetString(8), reader.GetDecimal(9), reader.GetInt64(10),
            reader.IsDBNull(11) ? null : reader.GetString(11), reader.IsDBNull(12) ? (DateTimeOffset?)null : reader.GetFieldValue<DateTimeOffset>(12),
            Convert.ToBase64String(actualVersion));
    }

    private static async Task<IResult> CreateOtherCostLineAsync(
        long id, OtherCostLineRequest request, SqlConnectionFactory connections, CurrentUserService users,
        CancellationToken cancellationToken)
    {
        await users.DemandPermissionAsync("estimate.write", cancellationToken);
        ValidateOtherCostRequest(request, requireLineVersion: false);
        var actor = await users.GetRequiredAsync(cancellationToken);
        await using var connection = await connections.OpenAsync(cancellationToken);
        await using var transaction = (SqlTransaction)await connection.BeginTransactionAsync(IsolationLevel.Serializable, cancellationToken);
        try
        {
            var estimate = await LockEditableEstimateAsync(connection, transaction, id, request.EstimateRowVersion, cancellationToken);
            DemandElevatedEstimateWriter(actor, estimate, "Only the estimate owner, an engineering manager or an administrator can add other project costs.");
            await using var insert = new SqlCommand("""
                DECLARE @result table (id bigint NOT NULL, row_version binary(8) NOT NULL);

                INSERT INTO dbo.other_cost_lines (
                    estimate_id, revision, category, description, qty, unit, unit_cost,
                    remark, created_by, updated_by)
                OUTPUT inserted.id, inserted.row_version INTO @result (id, row_version)
                VALUES (@estimate_id, @revision, @category, @description, @qty, @unit, @unit_cost,
                    @remark, @actor, @actor);

                SELECT id, row_version FROM @result;
                """, connection, transaction);
            AddOtherCostParameters(insert, id, estimate.Revision, request, actor.Id);
            long lineId;
            byte[] lineVersion;
            await using (var reader = await insert.ExecuteReaderAsync(CommandBehavior.SingleRow, cancellationToken))
            {
                await reader.ReadAsync(cancellationToken);
                lineId = reader.GetInt64(0);
                lineVersion = (byte[])reader.GetValue(1);
            }
            var estimateVersion = await TouchEstimateAsync(connection, transaction, id, actor.Id, cancellationToken);
            var after = await ReadOtherCostSnapshotAsync(connection, transaction, id, estimate.Revision, lineId, lineVersion, false, cancellationToken);
            await InquiryEndpoints.InsertAuditAsync(connection, transaction, actor.Id, "OtherCostLine", lineId, estimate.Number, "Created", null, after, cancellationToken);
            await transaction.CommitAsync(cancellationToken);
            return Results.Created($"/api/v1/estimates/{id}/other-cost-lines/{lineId}", new
            {
                id = lineId, rowVersion = Convert.ToBase64String(lineVersion), estimateRowVersion = Convert.ToBase64String(estimateVersion)
            });
        }
        catch
        {
            await transaction.RollbackAsync(cancellationToken);
            throw;
        }
    }

    private static async Task<IResult> UpdateOtherCostLineAsync(
        long id, long lineId, OtherCostLineRequest request, SqlConnectionFactory connections, CurrentUserService users,
        CancellationToken cancellationToken)
    {
        await users.DemandPermissionAsync("estimate.write", cancellationToken);
        ValidateOtherCostRequest(request, requireLineVersion: true);
        var actor = await users.GetRequiredAsync(cancellationToken);
        await using var connection = await connections.OpenAsync(cancellationToken);
        await using var transaction = (SqlTransaction)await connection.BeginTransactionAsync(IsolationLevel.Serializable, cancellationToken);
        try
        {
            var estimate = await LockEditableEstimateAsync(connection, transaction, id, request.EstimateRowVersion, cancellationToken);
            DemandElevatedEstimateWriter(actor, estimate, "Only the estimate owner, an engineering manager or an administrator can update other project costs.");
            var expectedLineVersion = SqlExtensions.ParseRowVersion(request.LineRowVersion!);
            var before = await ReadOtherCostSnapshotAsync(connection, transaction, id, estimate.Revision, lineId, expectedLineVersion, false, cancellationToken);
            await using var update = new SqlCommand("""
                DECLARE @result table (row_version binary(8) NOT NULL);

                UPDATE dbo.other_cost_lines SET
                    category=@category, description=@description, qty=@qty, unit=@unit,
                    unit_cost=@unit_cost, remark=@remark, updated_by=@actor
                OUTPUT inserted.row_version INTO @result (row_version)
                WHERE id=@line_id AND estimate_id=@estimate_id AND revision=@revision
                  AND deleted_at IS NULL AND row_version=@line_version;

                SELECT row_version FROM @result;
                """, connection, transaction);
            AddOtherCostParameters(update, id, estimate.Revision, request, actor.Id);
            update.Parameters.AddParameter("@line_id", SqlDbType.BigInt, lineId);
            update.Parameters.AddParameter("@line_version", SqlDbType.Timestamp, expectedLineVersion);
            var lineVersion = await update.ExecuteScalarAsync(cancellationToken) as byte[]
                ?? throw new ApiException(StatusCodes.Status409Conflict, "concurrency_conflict", "This other-cost line changed or was removed. Reload and try again.");
            var estimateVersion = await TouchEstimateAsync(connection, transaction, id, actor.Id, cancellationToken);
            var after = await ReadOtherCostSnapshotAsync(connection, transaction, id, estimate.Revision, lineId, lineVersion, false, cancellationToken);
            await InquiryEndpoints.InsertAuditAsync(connection, transaction, actor.Id, "OtherCostLine", lineId, estimate.Number, "Updated", before, after, cancellationToken);
            await transaction.CommitAsync(cancellationToken);
            return Results.Ok(new
            {
                id = lineId, rowVersion = Convert.ToBase64String(lineVersion), estimateRowVersion = Convert.ToBase64String(estimateVersion)
            });
        }
        catch
        {
            await transaction.RollbackAsync(cancellationToken);
            throw;
        }
    }

    private static async Task<IResult> RemoveOtherCostLineAsync(
        long id, long lineId, RemoveEstimateLineRequest request, SqlConnectionFactory connections, CurrentUserService users,
        CancellationToken cancellationToken)
    {
        await users.DemandPermissionAsync("estimate.write", cancellationToken);
        ValidateRemoveRequest(request);
        var actor = await users.GetRequiredAsync(cancellationToken);
        await using var connection = await connections.OpenAsync(cancellationToken);
        await using var transaction = (SqlTransaction)await connection.BeginTransactionAsync(IsolationLevel.Serializable, cancellationToken);
        try
        {
            var estimate = await LockEditableEstimateAsync(connection, transaction, id, request.EstimateRowVersion, cancellationToken);
            DemandElevatedEstimateWriter(actor, estimate, "Only the estimate owner, an engineering manager or an administrator can remove other project costs.");
            var expectedLineVersion = SqlExtensions.ParseRowVersion(request.LineRowVersion);
            var before = await ReadOtherCostSnapshotAsync(connection, transaction, id, estimate.Revision, lineId, expectedLineVersion, false, cancellationToken);
            var removedVersion = await SoftDeleteLineAsync(connection, transaction, "other_cost_lines", id, estimate.Revision, lineId, expectedLineVersion, actor.Id, cancellationToken);
            var estimateVersion = await TouchEstimateAsync(connection, transaction, id, actor.Id, cancellationToken);
            var after = await ReadOtherCostSnapshotAsync(connection, transaction, id, estimate.Revision, lineId, removedVersion, true, cancellationToken);
            await InquiryEndpoints.InsertAuditAsync(connection, transaction, actor.Id, "OtherCostLine", lineId, estimate.Number, "Removed", new { line = before }, new { line = after, removalReason = request.Reason?.Trim() }, cancellationToken);
            await transaction.CommitAsync(cancellationToken);
            return Results.Ok(new { id = lineId, estimateRowVersion = Convert.ToBase64String(estimateVersion) });
        }
        catch
        {
            await transaction.RollbackAsync(cancellationToken);
            throw;
        }
    }

    private static void ValidateOtherCostRequest(OtherCostLineRequest request, bool requireLineVersion)
    {
        ValidateEstimateAndLineVersions(request.EstimateRowVersion, request.LineRowVersion, requireLineVersion);
        InputValidation.OneOf(request.Category, "Other-cost category", OtherCostCategories);
        InputValidation.RequiredText(request.Description, 500, "Description");
        InputValidation.RequiredText(request.Unit, 50, "Unit");
        InputValidation.OptionalText(request.Remark, 20_000, "Remark");
        InputValidation.DecimalRange(request.Quantity, 0.0001m, 1_000_000_000m, "Quantity");
        InputValidation.DecimalRange(request.UnitCost, 0m, 1_000_000_000m, "Unit cost");
        InputValidation.DecimalScale(request.Quantity, 4, "Quantity");
        InputValidation.DecimalScale(request.UnitCost, 4, "Unit cost");
        if (request.Quantity * request.UnitCost > 999_999_999_999_999m)
            throw new ApiException(StatusCodes.Status400BadRequest, "validation_failed", "Line total exceeds the supported monetary range.");
    }

    private static void AddOtherCostParameters(SqlCommand command, long estimateId, int revision, OtherCostLineRequest request, long actorId)
    {
        command.Parameters.AddParameter("@estimate_id", SqlDbType.BigInt, estimateId);
        command.Parameters.AddParameter("@revision", SqlDbType.Int, revision);
        command.Parameters.AddParameter("@category", SqlDbType.NVarChar, request.Category.Trim(), 100);
        command.Parameters.AddParameter("@description", SqlDbType.NVarChar, request.Description.Trim(), 500);
        command.Parameters.AddParameter("@qty", SqlDbType.Decimal, request.Quantity, precision: 19, scale: 4);
        command.Parameters.AddParameter("@unit", SqlDbType.NVarChar, request.Unit.Trim(), 50);
        command.Parameters.AddParameter("@unit_cost", SqlDbType.Decimal, request.UnitCost, precision: 19, scale: 4);
        command.Parameters.AddParameter("@remark", SqlDbType.NVarChar, request.Remark?.Trim(), -1);
        command.Parameters.AddParameter("@actor", SqlDbType.BigInt, actorId);
    }

    private static async Task<OtherCostSnapshot> ReadOtherCostSnapshotAsync(
        SqlConnection connection, SqlTransaction transaction, long estimateId, int revision, long lineId,
        byte[] expectedRowVersion, bool includeDeleted, CancellationToken cancellationToken)
    {
        await using var command = new SqlCommand("""
            SELECT id, category, description, qty, unit, unit_cost, remark, deleted_at, row_version
            FROM dbo.other_cost_lines WITH (UPDLOCK, HOLDLOCK)
            WHERE id=@line_id AND estimate_id=@estimate_id AND revision=@revision
              AND (@include_deleted=1 OR deleted_at IS NULL);
            """, connection, transaction);
        command.Parameters.AddParameter("@line_id", SqlDbType.BigInt, lineId);
        command.Parameters.AddParameter("@estimate_id", SqlDbType.BigInt, estimateId);
        command.Parameters.AddParameter("@revision", SqlDbType.Int, revision);
        command.Parameters.AddParameter("@include_deleted", SqlDbType.Bit, includeDeleted);
        await using var reader = await command.ExecuteReaderAsync(CommandBehavior.SingleRow, cancellationToken);
        if (!await reader.ReadAsync(cancellationToken))
            throw new ApiException(StatusCodes.Status409Conflict, "concurrency_conflict", "This other-cost line changed or was removed. Reload and try again.");
        var actualVersion = (byte[])reader.GetValue(8);
        if (!actualVersion.AsSpan().SequenceEqual(expectedRowVersion))
            throw new ApiException(StatusCodes.Status409Conflict, "concurrency_conflict", "This other-cost line changed or was removed. Reload and try again.");
        return new OtherCostSnapshot(
            reader.GetInt64(0), reader.GetString(1), reader.GetString(2), reader.GetDecimal(3), reader.GetString(4),
            reader.GetDecimal(5), reader.IsDBNull(6) ? null : reader.GetString(6),
            reader.IsDBNull(7) ? (DateTimeOffset?)null : reader.GetFieldValue<DateTimeOffset>(7), Convert.ToBase64String(actualVersion));
    }

    private static async Task<IResult> UpdateAssignmentAsync(
        long id, long assignmentId, EstimateAssignmentRequest request, SqlConnectionFactory connections, CurrentUserService users,
        CancellationToken cancellationToken)
    {
        await users.DemandPermissionAsync("estimate.write", cancellationToken);
        ValidateAssignmentRequest(request);
        var actor = await users.GetRequiredAsync(cancellationToken);
        await using var connection = await connections.OpenAsync(cancellationToken);
        await using var transaction = (SqlTransaction)await connection.BeginTransactionAsync(IsolationLevel.Serializable, cancellationToken);
        try
        {
            var estimate = await LockEditableEstimateAsync(connection, transaction, id, request.EstimateRowVersion, cancellationToken);
            var before = await ReadAssignmentSnapshotAsync(connection, transaction, id, assignmentId, SqlExtensions.ParseRowVersion(request.LineRowVersion), cancellationToken);
            var elevated = IsElevated(actor, estimate.OwnerId);
            if (!elevated && before.OwnerId != actor.Id && before.SupportId != actor.Id)
                throw new ApiException(StatusCodes.Status403Forbidden, "estimate_assignment_forbidden", "Only the estimate owner, manager, assignment owner or support engineer can update this section.");
            if (!elevated && (request.OwnerId != before.OwnerId || request.SupportId != before.SupportId || request.DueDate != before.DueDate))
                throw new ApiException(StatusCodes.Status403Forbidden, "estimate_assignment_reassign_forbidden", "Only the estimate owner, an engineering manager or an administrator can reassign a section or change its due date.");
            if (request.DueDate > estimate.DueDate)
                throw new ApiException(StatusCodes.Status400BadRequest, "validation_failed", "Assignment due date cannot be later than the estimate due date.");
            await ValidateActiveOwnerAndSupportAsync(connection, transaction, request.OwnerId, request.SupportId, cancellationToken);

            await using var update = new SqlCommand("""
                UPDATE dbo.estimate_assignments SET owner_id=@owner_id, support_id=@support_id,
                    due_date=@due_date, status=@status, progress=@progress, comment=@comment
                OUTPUT inserted.row_version
                WHERE id=@assignment_id AND estimate_id=@estimate_id AND row_version=@assignment_row_version;
                """, connection, transaction);
            update.Parameters.AddParameter("@owner_id", SqlDbType.BigInt, request.OwnerId);
            update.Parameters.AddParameter("@support_id", SqlDbType.BigInt, request.SupportId);
            update.Parameters.AddParameter("@due_date", SqlDbType.Date, request.DueDate);
            update.Parameters.AddParameter("@status", SqlDbType.NVarChar, request.Status.Trim(), 50);
            update.Parameters.AddParameter("@progress", SqlDbType.Decimal, request.Progress, precision: 5, scale: 2);
            update.Parameters.AddParameter("@comment", SqlDbType.NVarChar, request.Comment?.Trim(), -1);
            update.Parameters.AddParameter("@assignment_id", SqlDbType.BigInt, assignmentId);
            update.Parameters.AddParameter("@estimate_id", SqlDbType.BigInt, id);
            update.Parameters.AddParameter("@assignment_row_version", SqlDbType.Timestamp, SqlExtensions.ParseRowVersion(request.LineRowVersion));
            var assignmentVersion = await update.ExecuteScalarAsync(cancellationToken) as byte[]
                ?? throw new ApiException(StatusCodes.Status409Conflict, "concurrency_conflict", "This estimate assignment changed. Reload and try again.");
            var estimateVersion = await TouchEstimateAsync(connection, transaction, id, actor.Id, cancellationToken);
            var after = await ReadAssignmentSnapshotAsync(connection, transaction, id, assignmentId, assignmentVersion, cancellationToken);
            await InquiryEndpoints.InsertAuditAsync(connection, transaction, actor.Id, "EstimateAssignment", assignmentId, estimate.Number, "Updated", before, after, cancellationToken);
            await transaction.CommitAsync(cancellationToken);
            return Results.Ok(new
            {
                id = assignmentId, rowVersion = Convert.ToBase64String(assignmentVersion), estimateRowVersion = Convert.ToBase64String(estimateVersion)
            });
        }
        catch
        {
            await transaction.RollbackAsync(cancellationToken);
            throw;
        }
    }

    private static void ValidateAssignmentRequest(EstimateAssignmentRequest request)
    {
        InputValidation.RequiredText(request.EstimateRowVersion, 100, "Estimate row version");
        InputValidation.RequiredText(request.LineRowVersion, 100, "Assignment row version");
        InputValidation.OneOf(request.Status, "Assignment status", AssignmentStatuses);
        InputValidation.OptionalText(request.Comment, 20_000, "Comment");
        InputValidation.DecimalRange(request.Progress, 0m, 100m, "Progress");
        InputValidation.DecimalScale(request.Progress, 2, "Progress");
        if (request.OwnerId <= 0 || request.SupportId == request.OwnerId)
            throw new ApiException(StatusCodes.Status400BadRequest, "validation_failed", "Assignment owner must be valid and support must be a different user.");
        if (string.Equals(request.Status.Trim(), "Not Started", StringComparison.Ordinal) && request.Progress != 0)
            throw new ApiException(StatusCodes.Status400BadRequest, "validation_failed", "A not-started assignment must have zero progress.");
        if (request.Status.Trim() is "Completed" or "Reviewed" && request.Progress != 100)
            throw new ApiException(StatusCodes.Status400BadRequest, "validation_failed", "A completed or reviewed assignment must have 100 percent progress.");
    }

    private static async Task<AssignmentSnapshot> ReadAssignmentSnapshotAsync(
        SqlConnection connection, SqlTransaction transaction, long estimateId, long assignmentId,
        byte[] expectedRowVersion, CancellationToken cancellationToken)
    {
        await using var command = new SqlCommand("""
            SELECT id, section, owner_id, support_id, due_date, status, progress, comment, row_version
            FROM dbo.estimate_assignments WITH (UPDLOCK, HOLDLOCK)
            WHERE id=@assignment_id AND estimate_id=@estimate_id;
            """, connection, transaction);
        command.Parameters.AddParameter("@assignment_id", SqlDbType.BigInt, assignmentId);
        command.Parameters.AddParameter("@estimate_id", SqlDbType.BigInt, estimateId);
        await using var reader = await command.ExecuteReaderAsync(CommandBehavior.SingleRow, cancellationToken);
        if (!await reader.ReadAsync(cancellationToken))
            throw new ApiException(StatusCodes.Status404NotFound, "estimate_assignment_not_found", "Estimate assignment not found.");
        var actualVersion = (byte[])reader.GetValue(8);
        if (!actualVersion.AsSpan().SequenceEqual(expectedRowVersion))
            throw new ApiException(StatusCodes.Status409Conflict, "concurrency_conflict", "This estimate assignment changed. Reload and try again.");
        return new AssignmentSnapshot(
            reader.GetInt64(0), reader.GetString(1), reader.GetInt64(2), reader.IsDBNull(3) ? null : reader.GetInt64(3),
            reader.GetFieldValue<DateOnly>(4), reader.GetString(5), reader.GetDecimal(6), reader.IsDBNull(7) ? null : reader.GetString(7),
            Convert.ToBase64String(actualVersion));
    }

    private static async Task<IResult> UpdateContingencyAsync(
        long id, EstimateContingencyRequest request, SqlConnectionFactory connections, CurrentUserService users,
        CancellationToken cancellationToken)
    {
        await users.DemandPermissionAsync("estimate.write", cancellationToken);
        InputValidation.RequiredText(request.RowVersion, 100, "Estimate row version");
        InputValidation.DecimalRange(request.ContingencyRate, 0m, 100m, "Contingency rate");
        InputValidation.DecimalScale(request.ContingencyRate, 4, "Contingency rate");
        var actor = await users.GetRequiredAsync(cancellationToken);
        await using var connection = await connections.OpenAsync(cancellationToken);
        await using var transaction = (SqlTransaction)await connection.BeginTransactionAsync(IsolationLevel.Serializable, cancellationToken);
        try
        {
            var estimate = await LockEditableEstimateAsync(connection, transaction, id, request.RowVersion, cancellationToken);
            DemandElevatedEstimateWriter(actor, estimate, "Only the estimate owner, an engineering manager or an administrator can update contingency.");
            var previousRate = await ReadContingencyRateAsync(connection, transaction, id, cancellationToken);
            await using var update = new SqlCommand("""
                UPDATE dbo.estimates SET contingency_rate=@rate, updated_by=@actor, updated_at=SYSUTCDATETIME(),
                    progress=CASE WHEN progress < 10 THEN 10 ELSE progress END
                OUTPUT inserted.row_version
                WHERE id=@id AND revision=@revision AND row_version=@row_version;
                """, connection, transaction);
            update.Parameters.AddParameter("@rate", SqlDbType.Decimal, request.ContingencyRate, precision: 9, scale: 4);
            update.Parameters.AddParameter("@actor", SqlDbType.BigInt, actor.Id);
            update.Parameters.AddParameter("@id", SqlDbType.BigInt, id);
            update.Parameters.AddParameter("@revision", SqlDbType.Int, estimate.Revision);
            update.Parameters.AddParameter("@row_version", SqlDbType.Timestamp, SqlExtensions.ParseRowVersion(request.RowVersion));
            var version = await update.ExecuteScalarAsync(cancellationToken) as byte[]
                ?? throw new ApiException(StatusCodes.Status409Conflict, "concurrency_conflict", "This estimate changed. Reload and try again.");
            await InquiryEndpoints.InsertAuditAsync(connection, transaction, actor.Id, "Estimate", id, estimate.Number, "Contingency updated",
                new { contingencyRate = previousRate },
                new { contingencyRate = request.ContingencyRate }, cancellationToken);
            await transaction.CommitAsync(cancellationToken);
            return Results.Ok(new { id, contingencyRate = request.ContingencyRate, rowVersion = Convert.ToBase64String(version) });
        }
        catch
        {
            await transaction.RollbackAsync(cancellationToken);
            throw;
        }
    }

    private static void ValidateEstimateAndLineVersions(string estimateRowVersion, string? lineRowVersion, bool requireLineVersion)
    {
        InputValidation.RequiredText(estimateRowVersion, 100, "Estimate row version");
        if (requireLineVersion) InputValidation.RequiredText(lineRowVersion, 100, "Line row version");
        else InputValidation.OptionalText(lineRowVersion, 100, "Line row version");
    }

    private static void ValidateRemoveRequest(RemoveEstimateLineRequest request)
    {
        InputValidation.RequiredText(request.EstimateRowVersion, 100, "Estimate row version");
        InputValidation.RequiredText(request.LineRowVersion, 100, "Line row version");
        InputValidation.OptionalText(request.Reason, 20_000, "Removal reason");
    }

    private static async Task<EstimateContext> LockEditableEstimateAsync(
        SqlConnection connection, SqlTransaction transaction, long id, string rowVersion,
        CancellationToken cancellationToken)
    {
        await using var command = new SqlCommand("""
            SELECT estimate_no, revision, status, row_version, owner_id, due_date
            FROM dbo.estimates WITH (UPDLOCK, HOLDLOCK)
            WHERE id=@id AND deleted_at IS NULL;
            """, connection, transaction);
        command.Parameters.AddParameter("@id", SqlDbType.BigInt, id);
        await using var reader = await command.ExecuteReaderAsync(CommandBehavior.SingleRow, cancellationToken);
        if (!await reader.ReadAsync(cancellationToken))
            throw new ApiException(StatusCodes.Status404NotFound, "estimate_not_found", "Estimate not found.");
        var actualVersion = (byte[])reader.GetValue(3);
        if (!actualVersion.AsSpan().SequenceEqual(SqlExtensions.ParseRowVersion(rowVersion)))
            throw new ApiException(StatusCodes.Status409Conflict, "concurrency_conflict", "This estimate changed. Reload and try again.");
        var status = reader.GetString(2);
        if (!EditableStatuses.Contains(status, StringComparer.OrdinalIgnoreCase))
            throw new ApiException(StatusCodes.Status409Conflict, "estimate_locked", $"Estimate lines cannot be changed while the estimate is '{status}'.");
        return new EstimateContext(
            reader.GetString(0), reader.GetInt32(1), status, reader.GetInt64(4), reader.GetFieldValue<DateOnly>(5),
            Convert.ToBase64String(actualVersion));
    }

    private static void DemandElevatedEstimateWriter(CurrentUser actor, EstimateContext estimate, string message)
    {
        if (!IsElevated(actor, estimate.OwnerId))
            throw new ApiException(StatusCodes.Status403Forbidden, "estimate_owner_required", message);
    }

    private static async Task DemandAssignedSectionWriterAsync(
        SqlConnection connection, SqlTransaction transaction, long estimateId, CurrentUser actor,
        EstimateContext estimate, string sectionCode, long requestedOwnerId, CancellationToken cancellationToken)
    {
        if (IsElevated(actor, estimate.OwnerId)) return;
        if (requestedOwnerId != actor.Id
            || !await HasSectionAssignmentAsync(connection, transaction, estimateId, estimate.Revision, sectionCode, actor.Id, cancellationToken))
            throw new ApiException(StatusCodes.Status403Forbidden, "estimate_section_forbidden", $"You may add this estimate line only when section {sectionCode} is assigned to you, and the new line must remain assigned to you.");
    }

    private static async Task DemandExistingOwnedSectionWriterAsync(
        SqlConnection connection, SqlTransaction transaction, long estimateId, CurrentUser actor,
        EstimateContext estimate, string existingSectionCode, string requestedSectionCode,
        long existingOwnerId, long requestedOwnerId, CancellationToken cancellationToken)
    {
        if (IsElevated(actor, estimate.OwnerId)) return;
        var assignedToExistingSection = await HasSectionAssignmentAsync(
            connection, transaction, estimateId, estimate.Revision, existingSectionCode, actor.Id, cancellationToken);
        var assignedToRequestedSection = string.Equals(existingSectionCode, requestedSectionCode, StringComparison.Ordinal)
            || await HasSectionAssignmentAsync(
                connection, transaction, estimateId, estimate.Revision, requestedSectionCode, actor.Id, cancellationToken);
        if (existingOwnerId != actor.Id || requestedOwnerId != existingOwnerId
            || !assignedToExistingSection || !assignedToRequestedSection)
            throw new ApiException(StatusCodes.Status403Forbidden, "estimate_line_forbidden", "You may update or remove only your own line while its controlled estimate section is assigned to you.");
    }

    private static async Task<bool> HasSectionAssignmentAsync(
        SqlConnection connection, SqlTransaction transaction, long estimateId, int revision,
        string sectionCode, long actorId,
        CancellationToken cancellationToken)
    {
        await using var command = new SqlCommand("""
            SELECT CASE WHEN EXISTS (
                SELECT 1
                FROM dbo.estimate_assignments a WITH (UPDLOCK, HOLDLOCK)
                INNER JOIN dbo.estimates e WITH (UPDLOCK, HOLDLOCK)
                    ON e.id=a.estimate_id AND e.revision=@revision AND e.deleted_at IS NULL
                WHERE a.estimate_id=@estimate_id
                  AND (a.section=@section_code OR (LEFT(a.section, 2)=@section_code AND SUBSTRING(a.section, 3, 1)=N' '))
                  AND (a.owner_id=@actor OR a.support_id=@actor)
            ) THEN CAST(1 AS bit) ELSE CAST(0 AS bit) END;
            """, connection, transaction);
        command.Parameters.AddParameter("@estimate_id", SqlDbType.BigInt, estimateId);
        command.Parameters.AddParameter("@revision", SqlDbType.Int, revision);
        command.Parameters.AddParameter("@section_code", SqlDbType.NVarChar, sectionCode, 2);
        command.Parameters.AddParameter("@actor", SqlDbType.BigInt, actorId);
        return (bool)(await command.ExecuteScalarAsync(cancellationToken) ?? false);
    }

    private static async Task ValidateActiveOwnerAndSupplierAsync(
        SqlConnection connection, SqlTransaction transaction, long ownerId, long? supplierId,
        CancellationToken cancellationToken)
    {
        await using var command = new SqlCommand("""
            SELECT
                CASE WHEN EXISTS (
                    SELECT 1 FROM dbo.users u INNER JOIN dbo.roles r ON r.id=u.role_id
                    WHERE u.id=@owner_id AND u.is_active=1 AND u.deleted_at IS NULL
                      AND r.code IN (N'Engineer', N'Engineering Manager', N'Admin')
                ) THEN CAST(1 AS bit) ELSE CAST(0 AS bit) END,
                CASE WHEN @supplier_id IS NULL OR EXISTS (
                    SELECT 1 FROM dbo.suppliers WHERE id=@supplier_id AND is_active=1 AND deleted_at IS NULL
                ) THEN CAST(1 AS bit) ELSE CAST(0 AS bit) END;
            """, connection, transaction);
        command.Parameters.AddParameter("@owner_id", SqlDbType.BigInt, ownerId);
        command.Parameters.AddParameter("@supplier_id", SqlDbType.BigInt, supplierId);
        await using var reader = await command.ExecuteReaderAsync(CommandBehavior.SingleRow, cancellationToken);
        await reader.ReadAsync(cancellationToken);
        if (!reader.GetBoolean(0))
            throw new ApiException(StatusCodes.Status400BadRequest, "validation_failed", "The selected line owner must be an active engineer, engineering manager or administrator.");
        if (!reader.GetBoolean(1))
            throw new ApiException(StatusCodes.Status400BadRequest, "validation_failed", "The selected supplier is inactive or does not exist.");
    }

    private static async Task ValidateActiveOwnerAndSupportAsync(
        SqlConnection connection, SqlTransaction transaction, long ownerId, long? supportId,
        CancellationToken cancellationToken)
    {
        await ValidateActiveOwnerAndSupplierAsync(connection, transaction, ownerId, null, cancellationToken);
        if (supportId is null) return;
        await ValidateActiveOwnerAndSupplierAsync(connection, transaction, supportId.Value, null, cancellationToken);
    }

    private static async Task<byte[]> SoftDeleteLineAsync(
        SqlConnection connection, SqlTransaction transaction, string table, long estimateId, int revision,
        long lineId, byte[] lineVersion, long actorId, CancellationToken cancellationToken)
    {
        var tableName = table switch
        {
            "manhour_lines" => "dbo.manhour_lines",
            "expense_lines" => "dbo.expense_lines",
            "other_cost_lines" => "dbo.other_cost_lines",
            _ => throw new InvalidOperationException("Unsupported estimate line table.")
        };
        await using var command = new SqlCommand($"""
            DECLARE @result table (row_version binary(8) NOT NULL);

            UPDATE {tableName} SET deleted_at=SYSUTCDATETIME(), updated_by=@actor
                {((table is "manhour_lines" or "expense_lines") ? ", updated_at=SYSUTCDATETIME()" : "")}
            OUTPUT inserted.row_version INTO @result (row_version)
            WHERE id=@line_id AND estimate_id=@estimate_id AND revision=@revision
              AND deleted_at IS NULL AND row_version=@line_version;

            SELECT row_version FROM @result;
            """, connection, transaction);
        command.Parameters.AddParameter("@actor", SqlDbType.BigInt, actorId);
        command.Parameters.AddParameter("@line_id", SqlDbType.BigInt, lineId);
        command.Parameters.AddParameter("@estimate_id", SqlDbType.BigInt, estimateId);
        command.Parameters.AddParameter("@revision", SqlDbType.Int, revision);
        command.Parameters.AddParameter("@line_version", SqlDbType.Timestamp, lineVersion);
        return await command.ExecuteScalarAsync(cancellationToken) as byte[]
            ?? throw new ApiException(StatusCodes.Status409Conflict, "concurrency_conflict", "This estimate line changed or was removed. Reload and try again.");
    }

    private static async Task<byte[]> TouchEstimateAsync(
        SqlConnection connection, SqlTransaction transaction, long id, long actorId,
        CancellationToken cancellationToken)
    {
        await using var command = new SqlCommand("""
            UPDATE dbo.estimates SET updated_by=@actor, updated_at=SYSUTCDATETIME(),
                progress=CASE WHEN progress < 10 THEN 10 ELSE progress END
            OUTPUT inserted.row_version WHERE id=@id;
            """, connection, transaction);
        command.Parameters.AddParameter("@actor", SqlDbType.BigInt, actorId);
        command.Parameters.AddParameter("@id", SqlDbType.BigInt, id);
        return (byte[])(await command.ExecuteScalarAsync(cancellationToken)
            ?? throw new ApiException(StatusCodes.Status409Conflict, "concurrency_conflict", "The estimate could not be updated."));
    }

    private static async Task<decimal> ReadContingencyRateAsync(
        SqlConnection connection, SqlTransaction transaction, long id, CancellationToken cancellationToken)
    {
        await using var command = new SqlCommand("SELECT contingency_rate FROM dbo.estimates WITH (UPDLOCK, HOLDLOCK) WHERE id=@id AND deleted_at IS NULL;", connection, transaction);
        command.Parameters.AddParameter("@id", SqlDbType.BigInt, id);
        return (decimal)(await command.ExecuteScalarAsync(cancellationToken)
            ?? throw new ApiException(StatusCodes.Status404NotFound, "estimate_not_found", "Estimate not found."));
    }
}
