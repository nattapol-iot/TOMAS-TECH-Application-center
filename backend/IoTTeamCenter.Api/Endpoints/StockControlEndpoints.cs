using System.Data;
using IoTTeamCenter.Api.Infrastructure;
using IoTTeamCenter.Api.Models;
using Microsoft.Data.SqlClient;

namespace IoTTeamCenter.Api.Endpoints;

/// <summary>
/// Stock control: the corrections and the quarantine gate. A balance is never
/// edited — a discrepancy becomes an adjustment the inventory controller has
/// to approve, and quarantined goods only leave by an explicit decision that
/// says where they went.
/// </summary>
public static class StockControlEndpoints
{
    public static void MapStockControlEndpoints(this IEndpointRouteBuilder app)
    {
        var adjustments = app.MapGroup("/api/v1/stock-adjustments").RequireAuthorization();
        adjustments.MapGet("/", ListAdjustmentsAsync);
        adjustments.MapPost("/", RequestAdjustmentAsync);
        adjustments.MapPost("/{id:long}/decide", DecideAdjustmentAsync);

        var quarantine = app.MapGroup("/api/v1/quarantine").RequireAuthorization();
        quarantine.MapGet("/", ListQuarantineAsync);
        quarantine.MapPost("/release", ReleaseQuarantineAsync);
    }

    /* ---- Stock adjustments ------------------------------------------------ */

    private static async Task<IResult> ListAdjustmentsAsync(
        string? status,
        SqlConnectionFactory connections,
        CurrentUserService users,
        CancellationToken cancellationToken)
    {
        await users.DemandPermissionAsync("inventory.read", cancellationToken);
        await using var connection = await connections.OpenAsync(cancellationToken);
        await using var command = new SqlCommand("""
            SELECT a.id, a.adjustment_no, a.item_id, i.item_code, i.part_no, i.description,
                   a.qty_change, a.reason, a.requested_by, ru.name, a.status,
                   a.approved_by, au.name, a.approved_at, a.row_version,
                   COALESCE(vb.usable, 0)
            FROM dbo.stock_adjustments a
            INNER JOIN dbo.mat_items i ON i.id = a.item_id
            INNER JOIN dbo.users ru ON ru.id = a.requested_by
            LEFT JOIN dbo.users au ON au.id = a.approved_by
            LEFT JOIN dbo.v_item_balances vb ON vb.item_id = a.item_id
            WHERE (@status IS NULL OR a.status = @status)
            ORDER BY a.id DESC;
            """, connection);
        command.Parameters.AddParameter("@status", SqlDbType.NVarChar, string.IsNullOrWhiteSpace(status) ? null : status.Trim(), 30);

        var items = new List<object>();
        await using var reader = await command.ExecuteReaderAsync(cancellationToken);
        while (await reader.ReadAsync(cancellationToken))
            items.Add(new
            {
                id = reader.GetInt64(0), number = reader.GetString(1),
                itemId = reader.GetInt64(2), itemCode = reader.GetString(3),
                partNumber = reader.GetString(4), description = reader.GetString(5),
                quantityChange = reader.GetDecimal(6), reason = reader.GetString(7),
                requestedById = reader.GetInt64(8), requestedByName = reader.GetString(9),
                status = reader.GetString(10),
                approvedById = reader.IsDBNull(11) ? (long?)null : reader.GetInt64(11),
                approvedByName = reader.IsDBNull(12) ? null : reader.GetString(12),
                approvedAt = reader.IsDBNull(13) ? (DateTimeOffset?)null : reader.GetFieldValue<DateTimeOffset>(13),
                rowVersion = reader.RowVersionString(14),
                currentUsable = reader.GetDecimal(15)
            });
        return Results.Ok(items);
    }

    /// <summary>
    /// Raise a discrepancy. Nothing moves yet: the ledger stays untouched
    /// until the inventory controller approves it.
    /// </summary>
    private static async Task<IResult> RequestAdjustmentAsync(
        CreateStockAdjustmentRequest request,
        SqlConnectionFactory connections,
        CurrentUserService users,
        BusinessClock clock,
        CancellationToken cancellationToken)
    {
        await users.DemandPermissionAsync("inventory.receive", cancellationToken);
        var actor = await users.GetRequiredAsync(cancellationToken);
        if (request.ItemId <= 0) throw Invalid("An item is required.");
        if (request.QuantityChange == 0) throw Invalid("A quantity change of zero adjusts nothing.");
        InputValidation.DecimalRange(request.QuantityChange, -1_000_000_000m, 1_000_000_000m, "Quantity change");
        InputValidation.DecimalScale(request.QuantityChange, 4, "Quantity change");
        InputValidation.RequiredText(request.Reason, 20_000, "Reason");

        await using var connection = await connections.OpenAsync(cancellationToken);
        await using var transaction = (SqlTransaction)await connection.BeginTransactionAsync(IsolationLevel.Serializable, cancellationToken);
        try
        {
            string itemCode;
            decimal usable;
            await using (var item = new SqlCommand("""
                SELECT i.item_code,
                       COALESCE((SELECT SUM(t.qty) FROM dbo.stock_txns t WHERE t.item_id = i.id AND t.bucket = N'stock'), 0)
                FROM dbo.mat_items i
                WHERE i.id = @item_id AND i.deleted_at IS NULL AND i.is_active = 1;
                """, connection, transaction))
            {
                item.Parameters.AddParameter("@item_id", SqlDbType.BigInt, request.ItemId);
                await using var reader = await item.ExecuteReaderAsync(CommandBehavior.SingleRow, cancellationToken);
                if (!await reader.ReadAsync(cancellationToken))
                    throw new ApiException(StatusCodes.Status404NotFound, "item_not_found", "Item not found or inactive.");
                itemCode = reader.GetString(0);
                usable = reader.GetDecimal(1);
            }
            if (usable + request.QuantityChange < 0)
                throw new ApiException(StatusCodes.Status409Conflict, "negative_balance",
                    $"{itemCode}: the adjustment would take stock below zero ({usable:0.####} on hand).",
                    new { onHand = usable });

            var number = await BomEndpoints.IssueNumberAsync(connection, transaction, "ADJ", clock, cancellationToken);
            long adjustmentId;
            byte[] rowVersion;
            await using (var insert = new SqlCommand("""
                INSERT INTO dbo.stock_adjustments (adjustment_no, item_id, qty_change, reason, requested_by, status)
                OUTPUT inserted.id, inserted.row_version
                VALUES (@no, @item_id, @qty, @reason, @actor, N'Pending Approval');
                """, connection, transaction))
            {
                insert.Parameters.AddParameter("@no", SqlDbType.NVarChar, number, 30);
                insert.Parameters.AddParameter("@item_id", SqlDbType.BigInt, request.ItemId);
                insert.Parameters.AddParameter("@qty", SqlDbType.Decimal, request.QuantityChange, precision: 19, scale: 4);
                insert.Parameters.AddParameter("@reason", SqlDbType.NVarChar, request.Reason.Trim(), -1);
                insert.Parameters.AddParameter("@actor", SqlDbType.BigInt, actor.Id);
                await using var reader = await insert.ExecuteReaderAsync(CommandBehavior.SingleRow, cancellationToken);
                await reader.ReadAsync(cancellationToken);
                adjustmentId = reader.GetInt64(0);
                rowVersion = (byte[])reader.GetValue(1);
            }

            await MaterialAudit.WriteAsync(
                connection, transaction, actor, "Requested stock adjustment", "Adjustment", adjustmentId, number,
                new { onHand = usable }, new { change = request.QuantityChange, itemCode },
                cancellationToken, quantity: request.QuantityChange, reason: request.Reason.Trim());
            await transaction.CommitAsync(cancellationToken);
            return Results.Created($"/api/v1/stock-adjustments/{adjustmentId}", new
            {
                id = adjustmentId, number, status = "Pending Approval",
                rowVersion = Convert.ToBase64String(rowVersion)
            });
        }
        catch
        {
            await transaction.RollbackAsync(cancellationToken);
            throw;
        }
    }

    /// <summary>
    /// The inventory controller decides. Approving is the only thing that
    /// writes the ledger transaction, and the requester never decides their
    /// own discrepancy.
    /// </summary>
    private static async Task<IResult> DecideAdjustmentAsync(
        long id,
        DecideStockAdjustmentRequest request,
        SqlConnectionFactory connections,
        CurrentUserService users,
        BusinessClock clock,
        CancellationToken cancellationToken)
    {
        await users.DemandPermissionAsync("inventory.adjust", cancellationToken);
        InputValidation.OneOf(request.Decision, "Decision", "Approve", "Reject");
        InputValidation.OptionalText(request.Comment, 20_000, "Comment");
        var actor = await users.GetRequiredAsync(cancellationToken);
        var approve = string.Equals(request.Decision.Trim(), "Approve", StringComparison.Ordinal);
        if (!approve && string.IsNullOrWhiteSpace(request.Comment))
            throw new ApiException(StatusCodes.Status400BadRequest, "comment_required", "A comment is required when rejecting an adjustment.");

        await using var connection = await connections.OpenAsync(cancellationToken);
        await using var transaction = (SqlTransaction)await connection.BeginTransactionAsync(IsolationLevel.Serializable, cancellationToken);
        try
        {
            string number;
            long itemId;
            decimal change;
            string reason;
            long requestedBy;
            string status;
            string location;
            decimal unitCost;
            await using (var read = new SqlCommand("""
                SELECT a.adjustment_no, a.item_id, a.qty_change, a.reason, a.requested_by, a.status,
                       COALESCE(i.location, N''), i.avg_unit_cost
                FROM dbo.stock_adjustments a WITH (UPDLOCK, HOLDLOCK)
                INNER JOIN dbo.mat_items i ON i.id = a.item_id
                WHERE a.id = @id;
                """, connection, transaction))
            {
                read.Parameters.AddParameter("@id", SqlDbType.BigInt, id);
                await using var reader = await read.ExecuteReaderAsync(CommandBehavior.SingleRow, cancellationToken);
                if (!await reader.ReadAsync(cancellationToken))
                    throw new ApiException(StatusCodes.Status404NotFound, "adjustment_not_found", "Stock adjustment not found.");
                number = reader.GetString(0);
                itemId = reader.GetInt64(1);
                change = reader.GetDecimal(2);
                reason = reader.GetString(3);
                requestedBy = reader.GetInt64(4);
                status = reader.GetString(5);
                location = reader.GetString(6);
                unitCost = reader.GetDecimal(7);
            }
            if (!string.Equals(status, "Pending Approval", StringComparison.Ordinal))
                throw new ApiException(StatusCodes.Status409Conflict, "adjustment_decided", $"This adjustment is already '{status}'.");
            if (requestedBy == actor.Id)
                throw new ApiException(StatusCodes.Status403Forbidden, "self_approval_forbidden", "The requester cannot approve their own stock adjustment.");

            byte[] version;
            await using (var update = new SqlCommand("""
                UPDATE dbo.stock_adjustments
                SET status = @status, approved_by = @actor, approved_at = SYSUTCDATETIME()
                OUTPUT inserted.row_version
                WHERE id = @id AND status = N'Pending Approval';
                """, connection, transaction))
            {
                update.Parameters.AddParameter("@status", SqlDbType.NVarChar, approve ? "Approved" : "Rejected", 30);
                update.Parameters.AddParameter("@actor", SqlDbType.BigInt, actor.Id);
                update.Parameters.AddParameter("@id", SqlDbType.BigInt, id);
                version = await update.ExecuteScalarAsync(cancellationToken) as byte[]
                    ?? throw new ApiException(StatusCodes.Status409Conflict, "concurrency_conflict", "This adjustment changed. Reload and try again.");
            }

            if (approve)
                await GoodsReceiptEndpoints.AppendLedgerAsync(
                    connection, transaction, $"adj:{id}", "STOCK_ADJUSTMENT", itemId, change, "stock",
                    location, number, null, unitCost, actor.Id, reason, clock.Today, cancellationToken);

            await MaterialAudit.WriteAsync(
                connection, transaction, actor, $"{request.Decision.Trim()} stock adjustment", "Adjustment", id, number,
                new { status = "Pending Approval" }, new { status = approve ? "Approved" : "Rejected", change },
                cancellationToken, quantity: change, reason: request.Comment?.Trim() ?? reason, approverId: actor.Id);
            await transaction.CommitAsync(cancellationToken);
            return Results.Ok(new { id, status = approve ? "Approved" : "Rejected", rowVersion = Convert.ToBase64String(version) });
        }
        catch
        {
            await transaction.RollbackAsync(cancellationToken);
            throw;
        }
    }

    /* ---- Quarantine ------------------------------------------------------- */

    private static async Task<IResult> ListQuarantineAsync(
        SqlConnectionFactory connections,
        CurrentUserService users,
        CancellationToken cancellationToken)
    {
        await users.DemandPermissionAsync("inventory.read", cancellationToken);
        await using var connection = await connections.OpenAsync(cancellationToken);
        await using var command = new SqlCommand("""
            SELECT i.id, i.item_code, i.part_no, i.description, i.brand, i.unit,
                   COALESCE(vb.quarantine, 0), COALESCE(vb.usable, 0), i.avg_unit_cost,
                   (SELECT MAX(t.occurred_at) FROM dbo.stock_txns t
                    WHERE t.item_id = i.id AND t.bucket = N'quarantine')
            FROM dbo.mat_items i
            LEFT JOIN dbo.v_item_balances vb ON vb.item_id = i.id
            WHERE COALESCE(vb.quarantine, 0) > 0
            ORDER BY i.item_code;
            """, connection);

        var items = new List<object>();
        await using var reader = await command.ExecuteReaderAsync(cancellationToken);
        while (await reader.ReadAsync(cancellationToken))
            items.Add(new
            {
                itemId = reader.GetInt64(0), itemCode = reader.GetString(1), partNumber = reader.GetString(2),
                description = reader.GetString(3), brand = reader.GetString(4), unit = reader.GetString(5),
                quarantineQuantity = reader.GetDecimal(6), usableQuantity = reader.GetDecimal(7),
                averageUnitCost = reader.GetDecimal(8),
                heldSince = reader.IsDBNull(9) ? (DateTimeOffset?)null : reader.GetFieldValue<DateTimeOffset>(9)
            });
        return Results.Ok(items);
    }

    /// <summary>
    /// Decide what happens to held goods. Passing QC moves them into stock,
    /// a supplier return or scrap takes them out of the building — either way
    /// the quarantine bucket is debited by exactly what was decided, and the
    /// decision is on the record.
    /// </summary>
    private static async Task<IResult> ReleaseQuarantineAsync(
        ReleaseQuarantineRequest request,
        SqlConnectionFactory connections,
        CurrentUserService users,
        BusinessClock clock,
        CancellationToken cancellationToken)
    {
        await users.DemandPermissionAsync("inventory.adjust", cancellationToken);
        InputValidation.OneOf(request.Outcome, "Outcome", "Accept", "Return to Supplier", "Scrap");
        InputValidation.RequiredText(request.Reason, 20_000, "Reason");
        InputValidation.DecimalRange(request.Quantity, 0.0001m, 1_000_000_000m, "Quantity");
        InputValidation.DecimalScale(request.Quantity, 4, "Quantity");
        var actor = await users.GetRequiredAsync(cancellationToken);
        var outcome = request.Outcome.Trim();

        await using var connection = await connections.OpenAsync(cancellationToken);
        await using var transaction = (SqlTransaction)await connection.BeginTransactionAsync(IsolationLevel.Serializable, cancellationToken);
        try
        {
            string itemCode;
            string location;
            decimal quarantine;
            decimal unitCost;
            await using (var read = new SqlCommand("""
                SELECT i.item_code, COALESCE(i.location, N''), i.avg_unit_cost,
                       COALESCE((SELECT SUM(t.qty) FROM dbo.stock_txns t WITH (UPDLOCK, HOLDLOCK)
                                 WHERE t.item_id = i.id AND t.bucket = N'quarantine'), 0)
                FROM dbo.mat_items i
                WHERE i.id = @item_id AND i.deleted_at IS NULL;
                """, connection, transaction))
            {
                read.Parameters.AddParameter("@item_id", SqlDbType.BigInt, request.ItemId);
                await using var reader = await read.ExecuteReaderAsync(CommandBehavior.SingleRow, cancellationToken);
                if (!await reader.ReadAsync(cancellationToken))
                    throw new ApiException(StatusCodes.Status404NotFound, "item_not_found", "Item not found.");
                itemCode = reader.GetString(0);
                location = reader.GetString(1);
                unitCost = reader.GetDecimal(2);
                quarantine = reader.GetDecimal(3);
            }
            if (request.Quantity > quarantine)
                throw new ApiException(StatusCodes.Status409Conflict, "insufficient_quarantine",
                    $"{itemCode}: only {quarantine:0.####} is held in quarantine.",
                    new { quarantine });

            var sequence = await NextQuarantineSequenceAsync(connection, transaction, request.ItemId, cancellationToken);
            var reference = FormattableString.Invariant($"QC-{clock.Today:yyyyMMdd}-{request.ItemId}-{sequence}");

            // Leaving quarantine is always its own debit; where the goods land
            // afterwards depends on the decision.
            await GoodsReceiptEndpoints.AppendLedgerAsync(
                connection, transaction, $"qc:{request.ItemId}:{sequence}:out", "QC_RELEASE_OUT",
                request.ItemId, -request.Quantity, "quarantine", location, reference, null,
                unitCost, actor.Id, $"{outcome} — {request.Reason.Trim()}", clock.Today, cancellationToken);

            if (string.Equals(outcome, "Accept", StringComparison.Ordinal))
                await GoodsReceiptEndpoints.AppendLedgerAsync(
                    connection, transaction, $"qc:{request.ItemId}:{sequence}:in", "QC_RELEASE_IN",
                    request.ItemId, request.Quantity, "stock", location, reference, null,
                    unitCost, actor.Id, $"Passed inspection — {request.Reason.Trim()}", clock.Today, cancellationToken);

            await MaterialAudit.WriteAsync(
                connection, transaction, actor, $"Quarantine {outcome.ToLowerInvariant()}", "Stock", request.ItemId, itemCode,
                new { quarantine }, new { outcome, quantity = request.Quantity, remaining = quarantine - request.Quantity },
                cancellationToken, quantity: request.Quantity, reason: request.Reason.Trim(), approverId: actor.Id);
            await transaction.CommitAsync(cancellationToken);
            return Results.Ok(new
            {
                itemId = request.ItemId, itemCode, outcome, quantity = request.Quantity,
                quarantineRemaining = quarantine - request.Quantity, reference
            });
        }
        catch
        {
            await transaction.RollbackAsync(cancellationToken);
            throw;
        }
    }

    private static async Task<int> NextQuarantineSequenceAsync(
        SqlConnection connection, SqlTransaction transaction, long itemId, CancellationToken cancellationToken)
    {
        await using var command = new SqlCommand(
            "SELECT COUNT(*) FROM dbo.stock_txns WHERE source_event_key LIKE @prefix AND txn_type = N'QC_RELEASE_OUT';",
            connection, transaction);
        command.Parameters.AddParameter("@prefix", SqlDbType.NVarChar, $"qc:{itemId}:%", 200);
        return (int)(await command.ExecuteScalarAsync(cancellationToken))! + 1;
    }

    private static ApiException Invalid(string message) =>
        new(StatusCodes.Status400BadRequest, "validation_failed", message);
}
