using System.Data;
using IoTTeamCenter.Api.Infrastructure;
using IoTTeamCenter.Api.Models;
using Microsoft.Data.SqlClient;

namespace IoTTeamCenter.Api.Endpoints;

/// <summary>
/// Purchase requisitions. A requisition is raised against a released BOM for
/// the quantity the project is actually short of, routed through an approval
/// chain whose length depends on what the requisition is asking for, and only
/// then converted into one purchase order per supplier.
/// </summary>
public static class PurchaseRequisitionEndpoints
{
    private const string SectionOwnerStep = "Section Owner Review";
    private const string BudgetOwnerStep = "Budget Owner Approval";
    private const string PurchasingStep = "Purchasing Review";
    private const string ManagementStep = "Management Approval";
    private const string PoCreationStep = "PO Creation";

    private static readonly string[] AllowedPriceSources =
        ["Price Library", "Supplier Quotation", "Previous Purchase", "Manual"];

    private sealed record PrHeader(
        long Id, string Number, long ProjectId, long BomId, long RequestedBy,
        string Status, string Priority, DateOnly RequiredDate);

    private sealed record StepRow(long Id, int Sequence, string Name, string? ApproverRole, long? ApproverId, string Status);

    public static void MapPurchaseRequisitionEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/v1/purchase-requisitions").RequireAuthorization();
        group.MapGet("/", ListAsync);
        group.MapGet("/{id:long}", GetAsync);
        group.MapPost("/", CreateAsync);
        group.MapPost("/{id:long}/submit", SubmitAsync);
        group.MapPost("/{id:long}/decide", DecideAsync);
        group.MapPost("/{id:long}/convert", ConvertAsync);
    }

    private static async Task<IResult> ListAsync(
        long? projectId,
        string? status,
        bool? waitingForMe,
        SqlConnectionFactory connections,
        CurrentUserService users,
        CancellationToken cancellationToken)
    {
        await users.DemandPermissionAsync("procurement.read", cancellationToken);
        var actor = await users.GetRequiredAsync(cancellationToken);
        await using var connection = await connections.OpenAsync(cancellationToken);
        await using var command = new SqlCommand("""
            SELECT pr.id, pr.pr_no, pr.project_id, p.project_no, p.name, pr.bom_id, b.bom_no,
                   pr.requested_by, ru.name, pr.priority, pr.required_date, pr.status, pr.submitted_at,
                   (SELECT COUNT(*) FROM dbo.mat_pr_lines l WHERE l.pr_id = pr.id),
                   COALESCE((SELECT SUM(l.line_total) FROM dbo.mat_pr_lines l WHERE l.pr_id = pr.id), 0),
                   COALESCE((SELECT SUM(l.estimate_total) FROM dbo.mat_pr_lines l WHERE l.pr_id = pr.id), 0),
                   cs.name, cs.approver_role, cs.approver_id, au.name, pr.row_version
            FROM dbo.mat_prs pr
            INNER JOIN dbo.projects p ON p.id = pr.project_id
            INNER JOIN dbo.boms b ON b.id = pr.bom_id
            INNER JOIN dbo.users ru ON ru.id = pr.requested_by
            OUTER APPLY (SELECT TOP (1) s.name, s.approver_role, s.approver_id
                         FROM dbo.mat_pr_approval_steps s
                         WHERE s.pr_id = pr.id AND s.status = N'Current'
                         ORDER BY s.sequence) cs
            LEFT JOIN dbo.users au ON au.id = cs.approver_id
            WHERE pr.deleted_at IS NULL
              AND (@project_id IS NULL OR pr.project_id = @project_id)
              AND (@status IS NULL OR pr.status = @status)
              AND (@elevated = 1 OR p.manager_id = @actor OR p.lead_engineer_id = @actor
                   OR EXISTS (SELECT 1 FROM dbo.project_members m WHERE m.project_id = p.id AND m.user_id = @actor))
              AND (@waiting = 0 OR (cs.name IS NOT NULL
                   AND (cs.approver_id = @actor OR (cs.approver_id IS NULL AND cs.approver_role = @actor_role))
                   AND pr.requested_by <> @actor))
            ORDER BY pr.id DESC;
            """, connection);
        command.Parameters.AddParameter("@project_id", SqlDbType.BigInt, projectId);
        command.Parameters.AddParameter("@status", SqlDbType.NVarChar, string.IsNullOrWhiteSpace(status) ? null : status.Trim(), 30);
        command.Parameters.AddParameter("@actor", SqlDbType.BigInt, actor.Id);
        command.Parameters.AddParameter("@actor_role", SqlDbType.NVarChar, actor.Role, 50);
        command.Parameters.AddParameter("@elevated", SqlDbType.Bit, ProjectScope.IsElevated(actor));
        command.Parameters.AddParameter("@waiting", SqlDbType.Bit, waitingForMe ?? false);

        var items = new List<object>();
        await using var reader = await command.ExecuteReaderAsync(cancellationToken);
        while (await reader.ReadAsync(cancellationToken))
        {
            var amount = reader.GetDecimal(14);
            var estimateAmount = reader.GetDecimal(15);
            items.Add(new
            {
                id = reader.GetInt64(0), number = reader.GetString(1),
                projectId = reader.GetInt64(2), projectNumber = reader.GetString(3), projectName = reader.GetString(4),
                bomId = reader.GetInt64(5), bomNumber = reader.GetString(6),
                requestedById = reader.GetInt64(7), requestedByName = reader.GetString(8),
                priority = reader.GetString(9), requiredDate = reader.GetFieldValue<DateOnly>(10),
                status = reader.GetString(11),
                submittedAt = reader.IsDBNull(12) ? (DateTimeOffset?)null : reader.GetFieldValue<DateTimeOffset>(12),
                lineCount = reader.GetInt32(13), amount, estimateAmount,
                variancePercent = estimateAmount > 0 ? Math.Round((amount - estimateAmount) / estimateAmount * 100m, 2) : 0m,
                currentStep = reader.IsDBNull(16) ? null : reader.GetString(16),
                currentApproverRole = reader.IsDBNull(17) ? null : reader.GetString(17),
                currentApproverId = reader.IsDBNull(18) ? (long?)null : reader.GetInt64(18),
                currentApproverName = reader.IsDBNull(19) ? null : reader.GetString(19),
                rowVersion = reader.RowVersionString(20)
            });
        }
        return Results.Ok(items);
    }

    private static async Task<IResult> GetAsync(
        long id,
        SqlConnectionFactory connections,
        CurrentUserService users,
        CancellationToken cancellationToken)
    {
        await users.DemandPermissionAsync("procurement.read", cancellationToken);
        var actor = await users.GetRequiredAsync(cancellationToken);
        await using var connection = await connections.OpenAsync(cancellationToken);
        var header = await ReadHeaderAsync(connection, null, id, forUpdate: false, cancellationToken);
        await ProjectScope.DemandAsync(connection, null, header.ProjectId, actor, cancellationToken);

        var lines = new List<object>();
        var steps = new List<object>();
        await using (var command = new SqlCommand("""
            SELECT l.id, l.bom_line_id, l.item_id, l.item_code, l.part_no, l.description,
                   l.supplier_id, s.name, l.qty, l.unit, l.unit_price, l.est_qty, l.est_unit_cost,
                   l.price_source, l.stock_snapshot, l.is_unplanned, l.buy_despite_stock, l.remark,
                   l.line_total, l.estimate_total, l.row_version, COALESCE(vb.available, 0)
            FROM dbo.mat_pr_lines l
            INNER JOIN dbo.suppliers s ON s.id = l.supplier_id
            LEFT JOIN dbo.v_item_balances vb ON vb.item_id = l.item_id
            WHERE l.pr_id = @id
            ORDER BY l.id;

            SELECT s.id, s.sequence, s.name, s.approver_role, s.approver_id, u.name,
                   s.rule_code, s.status, s.decision, s.comment, s.acted_at
            FROM dbo.mat_pr_approval_steps s
            LEFT JOIN dbo.users u ON u.id = s.approver_id
            WHERE s.pr_id = @id
            ORDER BY s.sequence;
            """, connection))
        {
            command.Parameters.AddParameter("@id", SqlDbType.BigInt, id);
            await using var reader = await command.ExecuteReaderAsync(cancellationToken);
            while (await reader.ReadAsync(cancellationToken))
            {
                var unitPrice = reader.GetDecimal(10);
                var estimatedUnitCost = reader.GetDecimal(12);
                lines.Add(new
                {
                    id = reader.GetInt64(0), bomLineId = reader.GetInt64(1),
                    itemId = reader.IsDBNull(2) ? (long?)null : reader.GetInt64(2),
                    itemCode = reader.GetString(3), partNumber = reader.GetString(4), description = reader.GetString(5),
                    supplierId = reader.GetInt64(6), supplierName = reader.GetString(7),
                    quantity = reader.GetDecimal(8), unit = reader.GetString(9), unitPrice,
                    estimateQuantity = reader.GetDecimal(11), estimatedUnitCost,
                    priceSource = reader.GetString(13), stockSnapshot = reader.GetDecimal(14),
                    isUnplanned = reader.GetBoolean(15), buyDespiteStock = reader.GetBoolean(16),
                    remark = reader.IsDBNull(17) ? null : reader.GetString(17),
                    lineTotal = reader.GetDecimal(18), estimateTotal = reader.GetDecimal(19),
                    rowVersion = reader.RowVersionString(20),
                    availableNow = reader.GetDecimal(21),
                    variancePercent = estimatedUnitCost > 0
                        ? Math.Round((unitPrice - estimatedUnitCost) / estimatedUnitCost * 100m, 2)
                        : 0m
                });
            }

            await reader.NextResultAsync(cancellationToken);
            while (await reader.ReadAsync(cancellationToken))
                steps.Add(new
                {
                    id = reader.GetInt64(0), sequence = reader.GetInt32(1), name = reader.GetString(2),
                    approverRole = reader.IsDBNull(3) ? null : reader.GetString(3),
                    approverId = reader.IsDBNull(4) ? (long?)null : reader.GetInt64(4),
                    approverName = reader.IsDBNull(5) ? null : reader.GetString(5),
                    ruleCode = reader.IsDBNull(6) ? null : reader.GetString(6),
                    status = reader.GetString(7),
                    decision = reader.IsDBNull(8) ? null : reader.GetString(8),
                    comment = reader.IsDBNull(9) ? null : reader.GetString(9),
                    actedAt = reader.IsDBNull(10) ? (DateTimeOffset?)null : reader.GetFieldValue<DateTimeOffset>(10)
                });
        }

        var budget = await ProcurementRules.GetBudgetPictureAsync(connection, null, header.ProjectId, id, cancellationToken);
        var flags = await ProcurementRules.GetRuleFlagsAsync(connection, null, id, cancellationToken);
        return Results.Ok(new
        {
            purchaseRequisition = new
            {
                header.Id, number = header.Number, header.ProjectId, header.BomId,
                requestedBy = header.RequestedBy, header.Status, header.Priority, header.RequiredDate
            },
            lines,
            steps,
            budget = new
            {
                budget.ApprovedBudget, budget.ActualConsumed, budget.OpenCommitment, budget.ReservedValue,
                budget.SiblingOpenPrValue, currentAmount = budget.Amount,
                budget.ForecastBefore, budget.ForecastAfter, budget.RemainingAfter, budget.WithinBudget
            },
            ruleFlags = flags.Select(flag => new { flag.Code, flag.Text })
        });
    }

    /// <summary>
    /// Raise a requisition against a released BOM. Quantities are validated
    /// against the live shortage, and the stock position at this moment is
    /// frozen onto every line so an approver can see what the requester saw.
    /// </summary>
    private static async Task<IResult> CreateAsync(
        CreatePurchaseRequisitionRequest request,
        SqlConnectionFactory connections,
        CurrentUserService users,
        BusinessClock clock,
        CancellationToken cancellationToken)
    {
        await users.DemandPermissionAsync("procurement.request", cancellationToken);
        var actor = await users.GetRequiredAsync(cancellationToken);
        ValidateCreate(request);

        await using var connection = await connections.OpenAsync(cancellationToken);
        await using var transaction = (SqlTransaction)await connection.BeginTransactionAsync(IsolationLevel.Serializable, cancellationToken);
        try
        {
            long projectId;
            string bomStatus;
            await using (var bom = new SqlCommand(
                "SELECT project_id, status FROM dbo.boms WITH (UPDLOCK, HOLDLOCK) WHERE id = @bom_id AND deleted_at IS NULL;",
                connection, transaction))
            {
                bom.Parameters.AddParameter("@bom_id", SqlDbType.BigInt, request.BomId);
                await using var reader = await bom.ExecuteReaderAsync(CommandBehavior.SingleRow, cancellationToken);
                if (!await reader.ReadAsync(cancellationToken))
                    throw new ApiException(StatusCodes.Status404NotFound, "bom_not_found", "BOM not found.");
                projectId = reader.GetInt64(0);
                bomStatus = reader.GetString(1);
            }
            if (!string.Equals(bomStatus, "Released", StringComparison.Ordinal))
                throw new ApiException(StatusCodes.Status409Conflict, "bom_not_released",
                    $"A requisition can only be raised against a released BOM; this one is '{bomStatus}'.");
            await ProjectScope.DemandAsync(connection, transaction, projectId, actor, cancellationToken);

            var prNumber = await BomEndpoints.IssueNumberAsync(connection, transaction, "PR", clock, cancellationToken);
            long prId;
            byte[] rowVersion;
            await using (var insert = new SqlCommand("""
                INSERT INTO dbo.mat_prs (pr_no, project_id, bom_id, requested_by, priority, required_date, purpose, status, created_by, updated_by)
                OUTPUT inserted.id, inserted.row_version
                VALUES (@pr_no, @project_id, @bom_id, @actor, @priority, @required_date, @purpose, N'Draft', @actor, @actor);
                """, connection, transaction))
            {
                insert.Parameters.AddParameter("@pr_no", SqlDbType.NVarChar, prNumber, 30);
                insert.Parameters.AddParameter("@project_id", SqlDbType.BigInt, projectId);
                insert.Parameters.AddParameter("@bom_id", SqlDbType.BigInt, request.BomId);
                insert.Parameters.AddParameter("@actor", SqlDbType.BigInt, actor.Id);
                insert.Parameters.AddParameter("@priority", SqlDbType.NVarChar, request.Priority.Trim(), 30);
                insert.Parameters.AddParameter("@required_date", SqlDbType.Date, request.RequiredDate);
                insert.Parameters.AddParameter("@purpose", SqlDbType.NVarChar, request.Purpose?.Trim(), -1);
                await using var reader = await insert.ExecuteReaderAsync(CommandBehavior.SingleRow, cancellationToken);
                await reader.ReadAsync(cancellationToken);
                prId = reader.GetInt64(0);
                rowVersion = (byte[])reader.GetValue(1);
            }

            foreach (var line in request.Lines)
            {
                await InsertLineAsync(connection, transaction, prId, request.BomId, line, cancellationToken);
            }
            decimal total;
            await using (var sum = new SqlCommand(
                "SELECT COALESCE(SUM(line_total), 0) FROM dbo.mat_pr_lines WHERE pr_id = @pr_id;", connection, transaction))
            {
                sum.Parameters.AddParameter("@pr_id", SqlDbType.BigInt, prId);
                total = (decimal)(await sum.ExecuteScalarAsync(cancellationToken))!;
            }

            await MaterialAudit.WriteAsync(
                connection, transaction, actor, "Created purchase requisition", "PR", prId, prNumber,
                null, new { lines = request.Lines.Count, amount = total, priority = request.Priority },
                cancellationToken, quantity: null, projectId: projectId, reason: request.Purpose?.Trim());
            await transaction.CommitAsync(cancellationToken);
            return Results.Created($"/api/v1/purchase-requisitions/{prId}", new
            {
                id = prId, number = prNumber, status = "Draft", lineCount = request.Lines.Count,
                amount = total, rowVersion = Convert.ToBase64String(rowVersion)
            });
        }
        catch
        {
            await transaction.RollbackAsync(cancellationToken);
            throw;
        }
    }

    /// <summary>
    /// One requisition line. The item is copied from the BOM line (a database
    /// trigger refuses any other value), and the requested quantity may not
    /// exceed what the line is genuinely short of unless the requester says
    /// out loud that they are buying despite available stock.
    /// </summary>
    private static async Task InsertLineAsync(
        SqlConnection connection,
        SqlTransaction transaction,
        long prId,
        long bomId,
        PurchaseRequisitionLineRequest line,
        CancellationToken cancellationToken)
    {
        long? itemId;
        string itemCode;
        string partNumber;
        string description;
        string unit;
        decimal quantityRequired;
        decimal customerSupplied;
        decimal estimatedUnitCost;
        bool nonStock;
        decimal covered;
        decimal onOrder;
        decimal onOpenPr;
        decimal available;

        await using (var lookup = new SqlCommand("""
            SELECT l.item_id, COALESCE(i.item_code, N''), COALESCE(i.part_no, N''), l.description, l.unit,
                   l.qty_required, l.customer_supplied_qty, l.est_unit_cost, l.non_stock,
                   COALESCE((SELECT SUM(r.qty) FROM dbo.reservations r WITH (UPDLOCK, HOLDLOCK)
                             WHERE r.bom_line_id = l.id AND r.status IN (N'Active', N'Consumed')), 0),
                   COALESCE((SELECT SUM(r.qty) FROM dbo.reservations r
                             WHERE r.bom_line_id = l.id AND r.status = N'Active'), 0),
                   COALESCE((SELECT SUM(ml.issued_qty - ml.returned_qty) FROM dbo.mir_lines ml
                             INNER JOIN dbo.mirs m ON m.id = ml.mir_id
                                  AND m.status IN (N'Issued', N'Received', N'Completed')
                             WHERE ml.bom_line_id = l.id), 0),
                   COALESCE((SELECT SUM(CASE WHEN pol.qty > COALESCE(gr.received_qty, 0) THEN pol.qty - COALESCE(gr.received_qty, 0) ELSE 0 END)
                             FROM dbo.mat_po_lines pol
                             INNER JOIN dbo.mat_pos po ON po.id = pol.po_id AND po.deleted_at IS NULL
                                  AND po.status IN (N'Ordered', N'Partially Received')
                             OUTER APPLY (SELECT SUM(gl.received_qty) AS received_qty
                                          FROM dbo.grn_lines gl
                                          INNER JOIN dbo.grns g ON g.id = gl.grn_id AND g.status = N'Confirmed'
                                          WHERE gl.po_line_id = pol.id) gr
                             WHERE pol.bom_line_id = l.id), 0),
                   COALESCE((SELECT SUM(prl.qty) FROM dbo.mat_pr_lines prl
                             INNER JOIN dbo.mat_prs pr ON pr.id = prl.pr_id AND pr.deleted_at IS NULL
                                  AND pr.status IN (N'Draft', N'In Approval', N'Approved')
                             WHERE prl.bom_line_id = l.id), 0),
                   COALESCE(vb.available, 0)
            FROM dbo.bom_lines l
            LEFT JOIN dbo.mat_items i ON i.id = l.item_id
            LEFT JOIN dbo.v_item_balances vb ON vb.item_id = l.item_id
            WHERE l.id = @line_id AND l.bom_id = @bom_id AND l.deleted_at IS NULL;
            """, connection, transaction))
        {
            lookup.Parameters.AddParameter("@line_id", SqlDbType.BigInt, line.BomLineId);
            lookup.Parameters.AddParameter("@bom_id", SqlDbType.BigInt, bomId);
            await using var reader = await lookup.ExecuteReaderAsync(CommandBehavior.SingleRow, cancellationToken);
            if (!await reader.ReadAsync(cancellationToken))
                throw new ApiException(StatusCodes.Status404NotFound, "bom_line_not_found",
                    $"BOM line {line.BomLineId} does not belong to this BOM.");
            itemId = reader.IsDBNull(0) ? null : reader.GetInt64(0);
            itemCode = reader.GetString(1);
            partNumber = reader.GetString(2);
            description = reader.GetString(3);
            unit = reader.GetString(4);
            quantityRequired = reader.GetDecimal(5);
            customerSupplied = reader.GetDecimal(6);
            estimatedUnitCost = reader.GetDecimal(7);
            nonStock = reader.GetBoolean(8);
            var allocated = reader.GetDecimal(9);
            var activeReserved = reader.GetDecimal(10);
            var netIssued = reader.GetDecimal(11);
            onOrder = reader.GetDecimal(12);
            onOpenPr = reader.GetDecimal(13);
            available = reader.GetDecimal(14);
            covered = Math.Max(allocated, netIssued + activeReserved);
        }

        if (string.IsNullOrEmpty(itemCode)) itemCode = line.ItemCodeOverride?.Trim() ?? description;
        var shortage = Math.Max(0m, quantityRequired - covered - customerSupplied - onOrder - onOpenPr);
        if (!line.IsUnplanned && line.Quantity > shortage)
            throw new ApiException(
                StatusCodes.Status409Conflict, "quantity_exceeds_shortage",
                $"{itemCode}: the line is short of {shortage:0.####} {unit}, so {line.Quantity:0.####} cannot be requested. Flag it as unplanned with a reason if this is deliberate.",
                new { shortage, requested = line.Quantity });
        if (!nonStock && available >= line.Quantity && !line.BuyDespiteStock)
            throw new ApiException(
                StatusCodes.Status409Conflict, "stock_available",
                $"{itemCode}: {available:0.####} is available in stock. Allocate it, or set buyDespiteStock with a reason.",
                new { available });
        if (line.BuyDespiteStock && string.IsNullOrWhiteSpace(line.Remark))
            throw new ApiException(StatusCodes.Status400BadRequest, "reason_required",
                $"{itemCode}: buying despite available stock needs a reason.");
        if (line.IsUnplanned && string.IsNullOrWhiteSpace(line.Remark))
            throw new ApiException(StatusCodes.Status400BadRequest, "reason_required",
                $"{itemCode}: an unplanned line needs a business reason.");

        await using (var supplier = new SqlCommand(
            "SELECT CASE WHEN EXISTS (SELECT 1 FROM dbo.suppliers WHERE id = @supplier_id AND is_active = 1 AND deleted_at IS NULL) THEN 1 ELSE 0 END;",
            connection, transaction))
        {
            supplier.Parameters.AddParameter("@supplier_id", SqlDbType.BigInt, line.SupplierId);
            if ((int)(await supplier.ExecuteScalarAsync(cancellationToken))! == 0)
                throw new ApiException(StatusCodes.Status400BadRequest, "validation_failed", "The selected supplier is inactive or does not exist.");
        }

        await using var insert = new SqlCommand("""
            INSERT INTO dbo.mat_pr_lines (
                pr_id, bom_id, bom_line_id, item_id, item_code, part_no, description, supplier_id,
                qty, unit, unit_price, est_qty, est_unit_cost, price_source, stock_snapshot,
                is_unplanned, buy_despite_stock, remark)
            VALUES (
                @pr_id, @bom_id, @bom_line_id, @item_id, @item_code, @part_no, @description, @supplier_id,
                @qty, @unit, @unit_price, @est_qty, @est_unit_cost, @price_source, @stock_snapshot,
                @unplanned, @buy_despite_stock, @remark);
            """, connection, transaction);
        insert.Parameters.AddParameter("@pr_id", SqlDbType.BigInt, prId);
        insert.Parameters.AddParameter("@bom_id", SqlDbType.BigInt, bomId);
        insert.Parameters.AddParameter("@bom_line_id", SqlDbType.BigInt, line.BomLineId);
        insert.Parameters.AddParameter("@item_id", SqlDbType.BigInt, itemId);
        insert.Parameters.AddParameter("@item_code", SqlDbType.NVarChar, itemCode, 100);
        insert.Parameters.AddParameter("@part_no", SqlDbType.NVarChar, partNumber, 200);
        insert.Parameters.AddParameter("@description", SqlDbType.NVarChar, description, 500);
        insert.Parameters.AddParameter("@supplier_id", SqlDbType.BigInt, line.SupplierId);
        insert.Parameters.AddParameter("@qty", SqlDbType.Decimal, line.Quantity, precision: 19, scale: 4);
        insert.Parameters.AddParameter("@unit", SqlDbType.NVarChar, unit, 50);
        insert.Parameters.AddParameter("@unit_price", SqlDbType.Decimal, line.UnitPrice, precision: 19, scale: 4);
        insert.Parameters.AddParameter("@est_qty", SqlDbType.Decimal, quantityRequired, precision: 19, scale: 4);
        insert.Parameters.AddParameter("@est_unit_cost", SqlDbType.Decimal, estimatedUnitCost, precision: 19, scale: 4);
        insert.Parameters.AddParameter("@price_source", SqlDbType.NVarChar, line.PriceSource.Trim(), 100);
        insert.Parameters.AddParameter("@stock_snapshot", SqlDbType.Decimal, Math.Max(0m, available), precision: 19, scale: 4);
        insert.Parameters.AddParameter("@unplanned", SqlDbType.Bit, line.IsUnplanned);
        insert.Parameters.AddParameter("@buy_despite_stock", SqlDbType.Bit, line.BuyDespiteStock);
        insert.Parameters.AddParameter("@remark", SqlDbType.NVarChar, line.Remark?.Trim(), -1);
        await insert.ExecuteNonQueryAsync(cancellationToken);
    }

    /// <summary>
    /// Submit for approval. The route is built here, from the rules the
    /// requisition actually triggers — a clean requisition skips management,
    /// a flagged one cannot.
    /// </summary>
    private static async Task<IResult> SubmitAsync(
        long id,
        WorkflowRequest request,
        SqlConnectionFactory connections,
        CurrentUserService users,
        CancellationToken cancellationToken)
    {
        await users.DemandPermissionAsync("procurement.request", cancellationToken);
        InputValidation.RequiredText(request.RowVersion, 100, "Requisition row version");
        var actor = await users.GetRequiredAsync(cancellationToken);
        await using var connection = await connections.OpenAsync(cancellationToken);
        await using var transaction = (SqlTransaction)await connection.BeginTransactionAsync(IsolationLevel.Serializable, cancellationToken);
        try
        {
            var header = await ReadHeaderAsync(connection, transaction, id, forUpdate: true, cancellationToken);
            await ProjectScope.DemandAsync(connection, transaction, header.ProjectId, actor, cancellationToken);
            if (!string.Equals(header.Status, "Draft", StringComparison.Ordinal))
                throw new ApiException(StatusCodes.Status409Conflict, "pr_not_draft", $"Only a draft requisition can be submitted; this one is '{header.Status}'.");
            if (header.RequestedBy != actor.Id && !ProjectScope.IsElevated(actor))
                throw new ApiException(StatusCodes.Status403Forbidden, "requester_required", "Only the requester can submit this requisition.");

            await using (var lineCount = new SqlCommand("SELECT COUNT(*) FROM dbo.mat_pr_lines WHERE pr_id = @id;", connection, transaction))
            {
                lineCount.Parameters.AddParameter("@id", SqlDbType.BigInt, id);
                if ((int)(await lineCount.ExecuteScalarAsync(cancellationToken))! == 0)
                    throw new ApiException(StatusCodes.Status409Conflict, "pr_empty", "A requisition needs at least one line before it can be submitted.");
            }

            var flags = await ProcurementRules.GetRuleFlagsAsync(connection, transaction, id, cancellationToken);
            await BuildApprovalRouteAsync(connection, transaction, id, header.ProjectId, actor, flags, cancellationToken);

            await using var update = new SqlCommand("""
                UPDATE dbo.mat_prs
                SET status = N'In Approval', submitted_at = SYSUTCDATETIME(), updated_by = @actor, updated_at = SYSUTCDATETIME()
                OUTPUT inserted.row_version
                WHERE id = @id AND deleted_at IS NULL AND row_version = @row_version;
                """, connection, transaction);
            update.Parameters.AddParameter("@actor", SqlDbType.BigInt, actor.Id);
            update.Parameters.AddParameter("@id", SqlDbType.BigInt, id);
            update.Parameters.AddParameter("@row_version", SqlDbType.Timestamp, SqlExtensions.ParseRowVersion(request.RowVersion));
            var version = await update.ExecuteScalarAsync(cancellationToken) as byte[]
                ?? throw new ApiException(StatusCodes.Status409Conflict, "concurrency_conflict", "This requisition changed. Reload and try again.");

            await MaterialAudit.WriteAsync(
                connection, transaction, actor, "Submitted purchase requisition", "PR", id, header.Number,
                new { status = "Draft" }, new { status = "In Approval", ruleFlags = flags.Select(flag => flag.Text) },
                cancellationToken, projectId: header.ProjectId, reason: request.Comment?.Trim());
            await transaction.CommitAsync(cancellationToken);
            return Results.Ok(new
            {
                id, status = "In Approval", rowVersion = Convert.ToBase64String(version),
                ruleFlags = flags.Select(flag => new { flag.Code, flag.Text })
            });
        }
        catch
        {
            await transaction.RollbackAsync(cancellationToken);
            throw;
        }
    }

    /// <summary>
    /// Rebuild the approval route from scratch. Requester, section owner and
    /// budget owner always; purchasing always; management only when a rule
    /// earns it; then PO creation.
    /// </summary>
    private static async Task BuildApprovalRouteAsync(
        SqlConnection connection,
        SqlTransaction transaction,
        long prId,
        long projectId,
        CurrentUser actor,
        IReadOnlyList<ProcurementRules.RuleFlag> flags,
        CancellationToken cancellationToken)
    {
        long leadEngineerId;
        long managerId;
        await using (var project = new SqlCommand(
            "SELECT lead_engineer_id, manager_id FROM dbo.projects WHERE id = @project_id AND deleted_at IS NULL;",
            connection, transaction))
        {
            project.Parameters.AddParameter("@project_id", SqlDbType.BigInt, projectId);
            await using var reader = await project.ExecuteReaderAsync(CommandBehavior.SingleRow, cancellationToken);
            await reader.ReadAsync(cancellationToken);
            leadEngineerId = reader.GetInt64(0);
            managerId = reader.GetInt64(1);
        }

        await using (var clear = new SqlCommand("DELETE FROM dbo.mat_pr_approval_steps WHERE pr_id = @pr_id;", connection, transaction))
        {
            clear.Parameters.AddParameter("@pr_id", SqlDbType.BigInt, prId);
            await clear.ExecuteNonQueryAsync(cancellationToken);
        }

        var steps = new List<(string Name, string? Role, long? ApproverId, string? Rule, string Status)>
        {
            ("Submitted by Requester", null, actor.Id, null, "Completed")
        };
        // The requester must never sit on their own approval route; when they
        // are the lead engineer or the manager, that step falls to the role.
        steps.Add((SectionOwnerStep, leadEngineerId == actor.Id ? "Engineering Manager" : null,
            leadEngineerId == actor.Id ? null : leadEngineerId, null, "Current"));
        steps.Add((BudgetOwnerStep, managerId == actor.Id ? "Engineering Manager" : null,
            managerId == actor.Id ? null : managerId, null, "Pending"));
        steps.Add((PurchasingStep, "Purchasing", null, null, "Pending"));
        if (flags.Count > 0)
        {
            var rule = string.Join(" · ", flags.Select(flag => flag.Text));
            steps.Add((ManagementStep, "Engineering Manager", null, rule.Length > 100 ? rule[..100] : rule, "Pending"));
        }
        steps.Add((PoCreationStep, "Purchasing", null, null, "Pending"));

        var sequence = 1;
        foreach (var step in steps)
        {
            await using var insert = new SqlCommand("""
                INSERT INTO dbo.mat_pr_approval_steps (pr_id, sequence, name, approver_role, approver_id, rule_code, status, decision, acted_at)
                VALUES (@pr_id, @sequence, @name, @role, @approver, @rule, @status,
                        CASE WHEN @status = N'Completed' THEN N'Submitted' ELSE NULL END,
                        CASE WHEN @status = N'Completed' THEN SYSUTCDATETIME() ELSE NULL END);
                """, connection, transaction);
            insert.Parameters.AddParameter("@pr_id", SqlDbType.BigInt, prId);
            insert.Parameters.AddParameter("@sequence", SqlDbType.Int, sequence++);
            insert.Parameters.AddParameter("@name", SqlDbType.NVarChar, step.Name, 100);
            insert.Parameters.AddParameter("@role", SqlDbType.NVarChar, step.Role, 50);
            insert.Parameters.AddParameter("@approver", SqlDbType.BigInt, step.ApproverId);
            insert.Parameters.AddParameter("@rule", SqlDbType.NVarChar, step.Rule, 100);
            insert.Parameters.AddParameter("@status", SqlDbType.NVarChar, step.Status, 30);
            await insert.ExecuteNonQueryAsync(cancellationToken);
        }
    }

    /// <summary>
    /// Decide the step that is currently waiting. The requester can never
    /// decide, only the named approver or the named role may, and any decision
    /// on a flagged requisition carries a mandatory comment onto the trail.
    /// </summary>
    private static async Task<IResult> DecideAsync(
        long id,
        DecidePurchaseRequisitionRequest request,
        SqlConnectionFactory connections,
        CurrentUserService users,
        CancellationToken cancellationToken)
    {
        await users.DemandPermissionAsync("procurement.approve", cancellationToken);
        InputValidation.OneOf(request.Decision, "Decision", "Approve", "Reject", "Request Changes");
        InputValidation.OptionalText(request.Comment, 20_000, "Comment");
        var actor = await users.GetRequiredAsync(cancellationToken);
        var decision = request.Decision.Trim();

        await using var connection = await connections.OpenAsync(cancellationToken);
        await using var transaction = (SqlTransaction)await connection.BeginTransactionAsync(IsolationLevel.Serializable, cancellationToken);
        try
        {
            var header = await ReadHeaderAsync(connection, transaction, id, forUpdate: true, cancellationToken);
            await ProjectScope.DemandAsync(connection, transaction, header.ProjectId, actor, cancellationToken);
            if (!string.Equals(header.Status, "In Approval", StringComparison.Ordinal))
                throw new ApiException(StatusCodes.Status409Conflict, "pr_not_in_approval", $"This requisition is '{header.Status}' and has no step waiting for a decision.");
            if (header.RequestedBy == actor.Id)
                throw new ApiException(StatusCodes.Status403Forbidden, "self_approval_forbidden", "The requester cannot decide their own requisition.");

            var current = await ReadCurrentStepAsync(connection, transaction, id, cancellationToken);
            var isNamedApprover = current.ApproverId == actor.Id;
            var isRoleApprover = current.ApproverId is null
                && current.ApproverRole is not null
                && string.Equals(current.ApproverRole, actor.Role, StringComparison.Ordinal);
            if (!isNamedApprover && !isRoleApprover && !string.Equals(actor.Role, "Admin", StringComparison.Ordinal))
                throw new ApiException(StatusCodes.Status403Forbidden, "not_the_approver",
                    $"'{current.Name}' is waiting for {(current.ApproverId is not null ? "another user" : current.ApproverRole)}.");

            var flags = await ProcurementRules.GetRuleFlagsAsync(connection, transaction, id, cancellationToken);
            var commentRequired = !string.Equals(decision, "Approve", StringComparison.Ordinal) || flags.Count > 0;
            if (commentRequired && string.IsNullOrWhiteSpace(request.Comment))
                throw new ApiException(StatusCodes.Status400BadRequest, "comment_required",
                    flags.Count > 0 && string.Equals(decision, "Approve", StringComparison.Ordinal)
                        ? "This requisition is flagged; approving it requires a comment for the audit trail."
                        : "A comment is required for this decision.");

            await using (var step = new SqlCommand("""
                UPDATE dbo.mat_pr_approval_steps
                SET status = N'Completed', decision = @decision, comment = @comment, acted_at = SYSUTCDATETIME(),
                    approver_id = COALESCE(approver_id, @actor)
                WHERE id = @step_id AND status = N'Current';
                """, connection, transaction))
            {
                step.Parameters.AddParameter("@decision", SqlDbType.NVarChar, decision, 30);
                step.Parameters.AddParameter("@comment", SqlDbType.NVarChar, request.Comment?.Trim(), -1);
                step.Parameters.AddParameter("@actor", SqlDbType.BigInt, actor.Id);
                step.Parameters.AddParameter("@step_id", SqlDbType.BigInt, current.Id);
                if (await step.ExecuteNonQueryAsync(cancellationToken) == 0)
                    throw new ApiException(StatusCodes.Status409Conflict, "concurrency_conflict", "This step was already decided. Reload and try again.");
            }

            string nextStatus;
            if (string.Equals(decision, "Reject", StringComparison.Ordinal))
            {
                nextStatus = "Rejected";
                await CancelRemainingStepsAsync(connection, transaction, id, current.Sequence, "Not Required", cancellationToken);
            }
            else if (string.Equals(decision, "Request Changes", StringComparison.Ordinal))
            {
                nextStatus = "Draft";
                await CancelRemainingStepsAsync(connection, transaction, id, current.Sequence, "Pending", cancellationToken);
            }
            else
            {
                // Approving the last decision step before PO creation approves
                // the requisition itself; PO creation is purchasing's own act.
                await using var advance = new SqlCommand("""
                    UPDATE s
                    SET s.status = N'Current'
                    FROM dbo.mat_pr_approval_steps s
                    WHERE s.pr_id = @pr_id AND s.status = N'Pending' AND s.name <> @po_step
                      AND s.sequence = (SELECT MIN(x.sequence) FROM dbo.mat_pr_approval_steps x
                                        WHERE x.pr_id = @pr_id AND x.status = N'Pending' AND x.name <> @po_step);
                    """, connection, transaction);
                advance.Parameters.AddParameter("@pr_id", SqlDbType.BigInt, id);
                advance.Parameters.AddParameter("@po_step", SqlDbType.NVarChar, PoCreationStep, 100);
                nextStatus = await advance.ExecuteNonQueryAsync(cancellationToken) > 0 ? "In Approval" : "Approved";
            }

            byte[] version;
            await using (var update = new SqlCommand("""
                UPDATE dbo.mat_prs SET status = @status, updated_by = @actor, updated_at = SYSUTCDATETIME()
                OUTPUT inserted.row_version
                WHERE id = @id AND deleted_at IS NULL;
                """, connection, transaction))
            {
                update.Parameters.AddParameter("@status", SqlDbType.NVarChar, nextStatus, 30);
                update.Parameters.AddParameter("@actor", SqlDbType.BigInt, actor.Id);
                update.Parameters.AddParameter("@id", SqlDbType.BigInt, id);
                version = (byte[])(await update.ExecuteScalarAsync(cancellationToken))!;
            }

            await MaterialAudit.WriteAsync(
                connection, transaction, actor, $"{decision} — {current.Name}", "PR", id, header.Number,
                new { step = current.Name, status = header.Status }, new { status = nextStatus },
                cancellationToken, projectId: header.ProjectId, reason: request.Comment?.Trim(), approverId: actor.Id);
            await transaction.CommitAsync(cancellationToken);
            return Results.Ok(new { id, status = nextStatus, step = current.Name, decision, rowVersion = Convert.ToBase64String(version) });
        }
        catch
        {
            await transaction.RollbackAsync(cancellationToken);
            throw;
        }
    }

    /// <summary>
    /// Convert an approved requisition into one purchase order per supplier.
    /// The composite foreign keys make the database itself refuse a PO line
    /// that drifts from its requisition line's supplier, BOM line or item.
    /// </summary>
    private static async Task<IResult> ConvertAsync(
        long id,
        ConvertPurchaseRequisitionRequest request,
        SqlConnectionFactory connections,
        CurrentUserService users,
        BusinessClock clock,
        CancellationToken cancellationToken)
    {
        await users.DemandPermissionAsync("procurement.order", cancellationToken);
        InputValidation.RequiredText(request.RowVersion, 100, "Requisition row version");
        var actor = await users.GetRequiredAsync(cancellationToken);
        await using var connection = await connections.OpenAsync(cancellationToken);
        await using var transaction = (SqlTransaction)await connection.BeginTransactionAsync(IsolationLevel.Serializable, cancellationToken);
        try
        {
            var header = await ReadHeaderAsync(connection, transaction, id, forUpdate: true, cancellationToken);
            if (!string.Equals(header.Status, "Approved", StringComparison.Ordinal))
                throw new ApiException(StatusCodes.Status409Conflict, "pr_not_approved", $"Only an approved requisition can be converted; this one is '{header.Status}'.");

            var suppliers = new List<long>();
            await using (var list = new SqlCommand(
                "SELECT DISTINCT supplier_id FROM dbo.mat_pr_lines WHERE pr_id = @pr_id ORDER BY supplier_id;",
                connection, transaction))
            {
                list.Parameters.AddParameter("@pr_id", SqlDbType.BigInt, id);
                await using var reader = await list.ExecuteReaderAsync(cancellationToken);
                while (await reader.ReadAsync(cancellationToken)) suppliers.Add(reader.GetInt64(0));
            }
            if (suppliers.Count == 0)
                throw new ApiException(StatusCodes.Status409Conflict, "pr_empty", "This requisition has no lines to order.");

            var created = new List<object>();
            foreach (var supplierId in suppliers)
            {
                var poNumber = await BomEndpoints.IssueNumberAsync(connection, transaction, "PO", clock, cancellationToken);
                long poId;
                await using (var insert = new SqlCommand("""
                    INSERT INTO dbo.mat_pos (po_no, pr_id, project_id, supplier_id, order_date, expected_date, status, created_by, updated_by)
                    OUTPUT inserted.id
                    VALUES (@po_no, @pr_id, @project_id, @supplier_id, @order_date, @expected_date, N'Ordered', @actor, @actor);
                    """, connection, transaction))
                {
                    insert.Parameters.AddParameter("@po_no", SqlDbType.NVarChar, poNumber, 30);
                    insert.Parameters.AddParameter("@pr_id", SqlDbType.BigInt, id);
                    insert.Parameters.AddParameter("@project_id", SqlDbType.BigInt, header.ProjectId);
                    insert.Parameters.AddParameter("@supplier_id", SqlDbType.BigInt, supplierId);
                    insert.Parameters.AddParameter("@order_date", SqlDbType.Date, clock.Today);
                    insert.Parameters.AddParameter("@expected_date", SqlDbType.Date, request.ExpectedDate);
                    insert.Parameters.AddParameter("@actor", SqlDbType.BigInt, actor.Id);
                    poId = (long)(await insert.ExecuteScalarAsync(cancellationToken))!;
                }

                await using var copy = new SqlCommand("""
                    INSERT INTO dbo.mat_po_lines (po_id, pr_id, supplier_id, pr_line_id, bom_line_id, item_id, qty, unit_price)
                    SELECT @po_id, l.pr_id, l.supplier_id, l.id, l.bom_line_id, l.item_id, l.qty, l.unit_price
                    FROM dbo.mat_pr_lines l
                    WHERE l.pr_id = @pr_id AND l.supplier_id = @supplier_id;
                    """, connection, transaction);
                copy.Parameters.AddParameter("@po_id", SqlDbType.BigInt, poId);
                copy.Parameters.AddParameter("@pr_id", SqlDbType.BigInt, id);
                copy.Parameters.AddParameter("@supplier_id", SqlDbType.BigInt, supplierId);
                var lineCount = await copy.ExecuteNonQueryAsync(cancellationToken);
                created.Add(new { id = poId, number = poNumber, supplierId, lineCount });
            }

            await using (var complete = new SqlCommand("""
                UPDATE dbo.mat_pr_approval_steps
                SET status = N'Completed', decision = N'Created', comment = @comment, acted_at = SYSUTCDATETIME(),
                    approver_id = COALESCE(approver_id, @actor)
                WHERE pr_id = @pr_id AND name = @po_step;
                """, connection, transaction))
            {
                complete.Parameters.AddParameter("@comment", SqlDbType.NVarChar, string.Join(" / ", created.Select(po => ((dynamic)po).number)), -1);
                complete.Parameters.AddParameter("@actor", SqlDbType.BigInt, actor.Id);
                complete.Parameters.AddParameter("@pr_id", SqlDbType.BigInt, id);
                complete.Parameters.AddParameter("@po_step", SqlDbType.NVarChar, PoCreationStep, 100);
                await complete.ExecuteNonQueryAsync(cancellationToken);
            }

            byte[] version;
            await using (var update = new SqlCommand("""
                UPDATE dbo.mat_prs SET status = N'Converted to PO', updated_by = @actor, updated_at = SYSUTCDATETIME()
                OUTPUT inserted.row_version
                WHERE id = @id AND deleted_at IS NULL AND row_version = @row_version;
                """, connection, transaction))
            {
                update.Parameters.AddParameter("@actor", SqlDbType.BigInt, actor.Id);
                update.Parameters.AddParameter("@id", SqlDbType.BigInt, id);
                update.Parameters.AddParameter("@row_version", SqlDbType.Timestamp, SqlExtensions.ParseRowVersion(request.RowVersion));
                version = await update.ExecuteScalarAsync(cancellationToken) as byte[]
                    ?? throw new ApiException(StatusCodes.Status409Conflict, "concurrency_conflict", "This requisition changed. Reload and try again.");
            }

            await MaterialAudit.WriteAsync(
                connection, transaction, actor, "Converted requisition to purchase orders", "PO", id, header.Number,
                new { status = "Approved" }, new { status = "Converted to PO", purchaseOrders = created },
                cancellationToken, projectId: header.ProjectId);
            await transaction.CommitAsync(cancellationToken);
            return Results.Ok(new { id, status = "Converted to PO", purchaseOrders = created, rowVersion = Convert.ToBase64String(version) });
        }
        catch
        {
            await transaction.RollbackAsync(cancellationToken);
            throw;
        }
    }

    private static async Task CancelRemainingStepsAsync(
        SqlConnection connection,
        SqlTransaction transaction,
        long prId,
        int afterSequence,
        string status,
        CancellationToken cancellationToken)
    {
        await using var command = new SqlCommand("""
            UPDATE dbo.mat_pr_approval_steps
            SET status = @status
            WHERE pr_id = @pr_id AND sequence > @sequence AND status IN (N'Pending', N'Current');
            """, connection, transaction);
        command.Parameters.AddParameter("@status", SqlDbType.NVarChar, status, 30);
        command.Parameters.AddParameter("@pr_id", SqlDbType.BigInt, prId);
        command.Parameters.AddParameter("@sequence", SqlDbType.Int, afterSequence);
        await command.ExecuteNonQueryAsync(cancellationToken);
    }

    private static async Task<StepRow> ReadCurrentStepAsync(
        SqlConnection connection,
        SqlTransaction transaction,
        long prId,
        CancellationToken cancellationToken)
    {
        await using var command = new SqlCommand("""
            SELECT TOP (1) id, sequence, name, approver_role, approver_id, status
            FROM dbo.mat_pr_approval_steps WITH (UPDLOCK, HOLDLOCK)
            WHERE pr_id = @pr_id AND status = N'Current'
            ORDER BY sequence;
            """, connection, transaction);
        command.Parameters.AddParameter("@pr_id", SqlDbType.BigInt, prId);
        await using var reader = await command.ExecuteReaderAsync(CommandBehavior.SingleRow, cancellationToken);
        if (!await reader.ReadAsync(cancellationToken))
            throw new ApiException(StatusCodes.Status409Conflict, "no_current_step", "No approval step is waiting for a decision.");
        return new StepRow(
            reader.GetInt64(0), reader.GetInt32(1), reader.GetString(2),
            reader.IsDBNull(3) ? null : reader.GetString(3),
            reader.IsDBNull(4) ? (long?)null : reader.GetInt64(4),
            reader.GetString(5));
    }

    private static async Task<PrHeader> ReadHeaderAsync(
        SqlConnection connection,
        SqlTransaction? transaction,
        long id,
        bool forUpdate,
        CancellationToken cancellationToken)
    {
        var hint = forUpdate ? " WITH (UPDLOCK, HOLDLOCK)" : string.Empty;
        await using var command = new SqlCommand(
            $"SELECT id, pr_no, project_id, bom_id, requested_by, status, priority, required_date FROM dbo.mat_prs{hint} WHERE id = @id AND deleted_at IS NULL;",
            connection, transaction);
        command.Parameters.AddParameter("@id", SqlDbType.BigInt, id);
        await using var reader = await command.ExecuteReaderAsync(CommandBehavior.SingleRow, cancellationToken);
        if (!await reader.ReadAsync(cancellationToken))
            throw new ApiException(StatusCodes.Status404NotFound, "pr_not_found", "Purchase requisition not found.");
        return new PrHeader(
            reader.GetInt64(0), reader.GetString(1), reader.GetInt64(2), reader.GetInt64(3),
            reader.GetInt64(4), reader.GetString(5), reader.GetString(6), reader.GetFieldValue<DateOnly>(7));
    }

    private static void ValidateCreate(CreatePurchaseRequisitionRequest request)
    {
        if (request.BomId <= 0) throw Invalid("A BOM is required.");
        InputValidation.OneOf(request.Priority, "Priority", "Normal", "High", "Emergency");
        InputValidation.OptionalText(request.Purpose, 20_000, "Purpose");
        if (request.Lines is null || request.Lines.Count == 0) throw Invalid("At least one line is required.");
        if (request.Lines.Count > 200) throw Invalid("A requisition cannot carry more than 200 lines.");
        foreach (var line in request.Lines)
        {
            if (line.BomLineId <= 0) throw Invalid("Every line needs a BOM line.");
            if (line.SupplierId <= 0) throw Invalid("Every line needs a supplier.");
            InputValidation.OneOf(line.PriceSource, "Price source", AllowedPriceSources);
            InputValidation.OptionalText(line.Remark, 20_000, "Remark");
            InputValidation.OptionalText(line.ItemCodeOverride, 100, "Item code");
            InputValidation.DecimalRange(line.Quantity, 0.0001m, 1_000_000_000m, "Quantity");
            InputValidation.DecimalRange(line.UnitPrice, 0m, 1_000_000_000m, "Unit price");
            InputValidation.DecimalScale(line.Quantity, 4, "Quantity");
            InputValidation.DecimalScale(line.UnitPrice, 4, "Unit price");
        }
    }

    private static ApiException Invalid(string message) =>
        new(StatusCodes.Status400BadRequest, "validation_failed", message);
}
