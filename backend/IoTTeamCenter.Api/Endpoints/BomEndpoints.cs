using System.Data;
using IoTTeamCenter.Api.Infrastructure;
using IoTTeamCenter.Api.Models;
using Microsoft.Data.SqlClient;

namespace IoTTeamCenter.Api.Endpoints;

/// <summary>
/// BOM is the bridge between the approved estimate and everything the team
/// buys, reserves and issues. Generation copies the estimate's material lines
/// once; after release the lines are read-only and a change needs a revision.
/// </summary>
public static class BomEndpoints
{
    private sealed record BomHeader(long Id, string Number, int Revision, string Status, long ProjectId, long EstimateId);

    public static void MapBomEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/v1/boms").RequireAuthorization();
        group.MapGet("/", ListAsync);
        group.MapGet("/{id:long}", GetAsync);
        group.MapPost("/", GenerateAsync);
        group.MapPost("/{id:long}/release", ReleaseAsync);
        group.MapPost("/{id:long}/reservations", ReserveAsync);
        group.MapPost("/{id:long}/reservations/{reservationId:long}/release", ReleaseReservationAsync);
    }

    private static async Task<IResult> ListAsync(
        long? projectId,
        SqlConnectionFactory connections,
        CurrentUserService users,
        CancellationToken cancellationToken)
    {
        await users.DemandPermissionAsync("procurement.read", cancellationToken);
        var actor = await users.GetRequiredAsync(cancellationToken);
        await using var connection = await connections.OpenAsync(cancellationToken);
        await using var command = new SqlCommand("""
            SELECT b.id, b.bom_no, b.revision, b.status, b.project_id, p.project_no, p.name,
                   b.estimate_id, e.estimate_no, e.revision, b.created_at, cu.name, b.released_at, ru.name,
                   (SELECT COUNT(*) FROM dbo.bom_lines l WHERE l.bom_id = b.id AND l.deleted_at IS NULL),
                   (SELECT COALESCE(SUM(l.qty_required * l.est_unit_cost), 0) FROM dbo.bom_lines l WHERE l.bom_id = b.id AND l.deleted_at IS NULL),
                   b.row_version
            FROM dbo.boms b
            INNER JOIN dbo.projects p ON p.id = b.project_id
            INNER JOIN dbo.estimates e ON e.id = b.estimate_id
            INNER JOIN dbo.users cu ON cu.id = b.created_by
            LEFT JOIN dbo.users ru ON ru.id = b.released_by
            WHERE b.deleted_at IS NULL
              AND (@project_id IS NULL OR b.project_id = @project_id)
              AND (@elevated = 1 OR p.manager_id = @actor OR p.lead_engineer_id = @actor
                   OR EXISTS (SELECT 1 FROM dbo.project_members m WHERE m.project_id = p.id AND m.user_id = @actor))
            ORDER BY b.id DESC;
            """, connection);
        command.Parameters.AddParameter("@project_id", SqlDbType.BigInt, projectId);
        command.Parameters.AddParameter("@actor", SqlDbType.BigInt, actor.Id);
        command.Parameters.AddParameter("@elevated", SqlDbType.Bit, ProjectScope.IsElevated(actor));

        var items = new List<object>();
        await using var reader = await command.ExecuteReaderAsync(cancellationToken);
        while (await reader.ReadAsync(cancellationToken))
            items.Add(new
            {
                id = reader.GetInt64(0), number = reader.GetString(1), revision = reader.GetInt32(2), status = reader.GetString(3),
                projectId = reader.GetInt64(4), projectNumber = reader.GetString(5), projectName = reader.GetString(6),
                estimateId = reader.GetInt64(7), estimateNumber = reader.GetString(8), estimateRevision = reader.GetInt32(9),
                createdAt = reader.GetFieldValue<DateTimeOffset>(10), createdByName = reader.GetString(11),
                releasedAt = reader.IsDBNull(12) ? (DateTimeOffset?)null : reader.GetFieldValue<DateTimeOffset>(12),
                releasedByName = reader.IsDBNull(13) ? null : reader.GetString(13),
                lineCount = reader.GetInt32(14), bomBudget = reader.GetDecimal(15), rowVersion = reader.RowVersionString(16)
            });
        return Results.Ok(items);
    }

    /// <summary>
    /// The workspace: every line with its live balance, allocation and the
    /// derived purchase shortage. The arithmetic lives here, never in the client.
    /// </summary>
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

        await using var command = new SqlCommand("""
            SELECT b.bom_no, b.revision, b.status, b.project_id, p.project_no, p.name,
                   b.estimate_id, e.estimate_no, e.revision, b.row_version,
                   t.material_total
            FROM dbo.boms b
            INNER JOIN dbo.projects p ON p.id = b.project_id
            INNER JOIN dbo.estimates e ON e.id = b.estimate_id
            LEFT JOIN dbo.v_estimate_totals t ON t.estimate_id = e.id
            WHERE b.id = @id AND b.deleted_at IS NULL;

            SELECT l.id, l.section_code, l.item_id, i.item_code, i.part_no, l.description, i.brand,
                   l.qty_required, l.unit, l.est_unit_cost, l.customer_supplied_qty, l.non_stock,
                   l.estimate_line_id, ci.item_code, l.owner_id, u.name, l.sort_order, l.row_version,
                   COALESCE(vb.usable, 0), COALESCE(vb.reserved, 0), COALESCE(vb.available, 0), COALESCE(vb.quarantine, 0),
                   COALESCE((SELECT SUM(r.qty) FROM dbo.reservations r
                             WHERE r.bom_line_id = l.id AND r.status IN (N'Active', N'Consumed')), 0),
                   COALESCE((SELECT SUM(r.qty) FROM dbo.reservations r
                             WHERE r.bom_line_id = l.id AND r.status = N'Active'), 0),
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
                   COALESCE((SELECT SUM(ml.issued_qty - ml.returned_qty) FROM dbo.mir_lines ml
                             INNER JOIN dbo.mirs m ON m.id = ml.mir_id
                                  AND m.status IN (N'Issued', N'Received', N'Completed')
                             WHERE ml.bom_line_id = l.id), 0)
            FROM dbo.bom_lines l
            LEFT JOIN dbo.mat_items i ON i.id = l.item_id
            LEFT JOIN dbo.v_item_balances vb ON vb.item_id = l.item_id
            LEFT JOIN dbo.cost_items ci ON ci.id = l.estimate_line_id
            INNER JOIN dbo.users u ON u.id = l.owner_id
            WHERE l.bom_id = @id AND l.deleted_at IS NULL
            ORDER BY l.section_code, l.sort_order, l.id;
            """, connection);
        command.Parameters.AddParameter("@id", SqlDbType.BigInt, id);

        await using var reader = await command.ExecuteReaderAsync(cancellationToken);
        if (!await reader.ReadAsync(cancellationToken))
            throw new ApiException(StatusCodes.Status404NotFound, "bom_not_found", "BOM not found.");
        var bom = new
        {
            id,
            number = reader.GetString(0),
            revision = reader.GetInt32(1),
            status = reader.GetString(2),
            projectId = reader.GetInt64(3),
            projectNumber = reader.GetString(4),
            projectName = reader.GetString(5),
            estimateId = reader.GetInt64(6),
            estimateNumber = reader.GetString(7),
            estimateRevision = reader.GetInt32(8),
            rowVersion = reader.RowVersionString(9),
            approvedMaterialBudget = reader.IsDBNull(10) ? 0m : reader.GetDecimal(10)
        };

        var lines = new List<object>();
        await reader.NextResultAsync(cancellationToken);
        while (await reader.ReadAsync(cancellationToken))
        {
            var quantityRequired = reader.GetDecimal(7);
            var customerSupplied = reader.GetDecimal(10);
            var nonStock = reader.GetBoolean(11);
            var allocated = reader.GetDecimal(22);
            var activeReserved = reader.GetDecimal(23);
            var onOrder = reader.GetDecimal(24);
            var onOpenPr = reader.GetDecimal(25);
            var netIssued = reader.GetDecimal(26);
            // Required minus what is already covered: an allocation, material
            // already issued without one, the customer's own supply, and an
            // open order. Never negative.
            var covered = Math.Max(allocated, netIssued + activeReserved);
            var purchaseRequired = nonStock
                ? 0m
                : Math.Max(0m, quantityRequired - covered - customerSupplied - onOrder);
            lines.Add(new
            {
                id = reader.GetInt64(0), sectionCode = reader.GetString(1),
                itemId = reader.IsDBNull(2) ? (long?)null : reader.GetInt64(2),
                itemCode = reader.IsDBNull(3) ? null : reader.GetString(3),
                partNumber = reader.IsDBNull(4) ? null : reader.GetString(4),
                description = reader.GetString(5),
                brand = reader.IsDBNull(6) ? null : reader.GetString(6),
                quantityRequired, unit = reader.GetString(8), estimatedUnitCost = reader.GetDecimal(9),
                customerSuppliedQuantity = customerSupplied, nonStock,
                estimateLineId = reader.IsDBNull(12) ? (long?)null : reader.GetInt64(12),
                estimateItemCode = reader.IsDBNull(13) ? null : reader.GetString(13),
                ownerId = reader.GetInt64(14), ownerName = reader.GetString(15),
                sortOrder = reader.GetInt32(16), rowVersion = reader.RowVersionString(17),
                onHand = reader.GetDecimal(18) + reader.GetDecimal(21),
                reserved = reader.GetDecimal(19),
                available = reader.GetDecimal(20),
                allocated, activeReserved, onOrder, onOpenPr, netIssued,
                purchaseRequired,
                budget = quantityRequired * reader.GetDecimal(9)
            });
        }
        return Results.Ok(new { bom, lines });
    }

    /// <summary>
    /// Generate the first BOM revision from an approved estimate. Only the
    /// material categories become stock lines; software and service lines are
    /// carried as non-stock so the budget still reconciles.
    /// </summary>
    private static async Task<IResult> GenerateAsync(
        GenerateBomRequest request,
        SqlConnectionFactory connections,
        CurrentUserService users,
        BusinessClock clock,
        CancellationToken cancellationToken)
    {
        await users.DemandPermissionAsync("procurement.request", cancellationToken);
        var actor = await users.GetRequiredAsync(cancellationToken);
        if (request.ProjectId <= 0) throw Invalid("A project is required.");
        await using var connection = await connections.OpenAsync(cancellationToken);
        await using var transaction = (SqlTransaction)await connection.BeginTransactionAsync(IsolationLevel.Serializable, cancellationToken);
        try
        {
            await ProjectScope.DemandAsync(connection, transaction, request.ProjectId, actor, cancellationToken);

            long estimateId;
            int estimateRevision;
            string estimateNumber;
            await using (var lookup = new SqlCommand("""
                SELECT e.id, e.revision, e.estimate_no, e.status
                FROM dbo.projects p WITH (UPDLOCK, HOLDLOCK)
                INNER JOIN dbo.estimates e WITH (UPDLOCK, HOLDLOCK) ON e.id = p.estimate_id AND e.deleted_at IS NULL
                WHERE p.id = @project_id AND p.deleted_at IS NULL;
                """, connection, transaction))
            {
                lookup.Parameters.AddParameter("@project_id", SqlDbType.BigInt, request.ProjectId);
                await using var reader = await lookup.ExecuteReaderAsync(CommandBehavior.SingleRow, cancellationToken);
                if (!await reader.ReadAsync(cancellationToken))
                    throw new ApiException(StatusCodes.Status409Conflict, "estimate_missing", "This project has no linked estimate to generate a BOM from.");
                estimateId = reader.GetInt64(0);
                estimateRevision = reader.GetInt32(1);
                estimateNumber = reader.GetString(2);
                var status = reader.GetString(3);
                if (!string.Equals(status, "Approved", StringComparison.OrdinalIgnoreCase))
                    throw new ApiException(StatusCodes.Status409Conflict, "estimate_not_approved", $"A BOM can only be generated from an approved estimate; this one is '{status}'.");
            }

            await using (var existing = new SqlCommand(
                "SELECT TOP (1) bom_no FROM dbo.boms WITH (UPDLOCK, HOLDLOCK) WHERE project_id = @project_id AND deleted_at IS NULL;",
                connection, transaction))
            {
                existing.Parameters.AddParameter("@project_id", SqlDbType.BigInt, request.ProjectId);
                if (await existing.ExecuteScalarAsync(cancellationToken) is string existingNumber)
                    throw new ApiException(StatusCodes.Status409Conflict, "bom_exists", $"{existingNumber} already exists for this project. Create a revision instead.");
            }

            var bomNumber = await IssueNumberAsync(connection, transaction, "BOM", clock, cancellationToken);
            long bomId;
            byte[] rowVersion;
            await using (var insert = new SqlCommand("""
                INSERT INTO dbo.boms (bom_no, revision, project_id, estimate_id, status, created_by, updated_by)
                OUTPUT inserted.id, inserted.row_version
                VALUES (@bom_no, 1, @project_id, @estimate_id, N'Draft', @actor, @actor);
                """, connection, transaction))
            {
                insert.Parameters.AddParameter("@bom_no", SqlDbType.NVarChar, bomNumber, 30);
                insert.Parameters.AddParameter("@project_id", SqlDbType.BigInt, request.ProjectId);
                insert.Parameters.AddParameter("@estimate_id", SqlDbType.BigInt, estimateId);
                insert.Parameters.AddParameter("@actor", SqlDbType.BigInt, actor.Id);
                await using var reader = await insert.ExecuteReaderAsync(CommandBehavior.SingleRow, cancellationToken);
                await reader.ReadAsync(cancellationToken);
                bomId = reader.GetInt64(0);
                rowVersion = (byte[])reader.GetValue(1);
            }

            // One BOM line per estimate cost line. A line matches an inventory
            // item by item code when one exists, which is what later gives the
            // line its live balance; anything else is carried as non-stock.
            int lineCount;
            await using (var copy = new SqlCommand("""
                INSERT INTO dbo.bom_lines (
                    bom_id, section_code, sort_order, item_id, estimate_line_id, description,
                    qty_required, unit, est_unit_cost, customer_supplied_qty, owner_id, non_stock, created_by, updated_by)
                SELECT
                    @bom_id,
                    CASE ci.category_code
                        WHEN '01' THEN N'HW.STD' WHEN '02' THEN N'SW' WHEN '03' THEN N'HW.EL'
                        WHEN '04' THEN N'HW.ME' WHEN '05' THEN N'HW.STD' ELSE N'SVC' END,
                    ROW_NUMBER() OVER (ORDER BY ci.category_code, ci.id),
                    mi.id,
                    ci.id,
                    ci.description,
                    ci.qty,
                    ci.unit,
                    ci.unit_cost,
                    0,
                    ci.owner_id,
                    CASE WHEN mi.id IS NULL THEN 1 ELSE 0 END,
                    @actor, @actor
                FROM dbo.cost_items ci
                INNER JOIN dbo.estimates e ON e.id = ci.estimate_id AND e.revision = ci.revision
                LEFT JOIN dbo.mat_items mi ON mi.item_code = ci.item_code AND mi.deleted_at IS NULL AND mi.is_active = 1
                WHERE ci.estimate_id = @estimate_id AND ci.revision = @revision AND ci.deleted_at IS NULL
                  AND ci.qty > 0;
                """, connection, transaction))
            {
                copy.Parameters.AddParameter("@bom_id", SqlDbType.BigInt, bomId);
                copy.Parameters.AddParameter("@estimate_id", SqlDbType.BigInt, estimateId);
                copy.Parameters.AddParameter("@revision", SqlDbType.Int, estimateRevision);
                copy.Parameters.AddParameter("@actor", SqlDbType.BigInt, actor.Id);
                lineCount = await copy.ExecuteNonQueryAsync(cancellationToken);
            }
            if (lineCount == 0)
                throw new ApiException(StatusCodes.Status409Conflict, "estimate_has_no_lines", "The approved estimate revision has no cost lines to generate a BOM from.");

            await MaterialAudit.WriteAsync(
                connection, transaction, actor, "Generated BOM from estimate", "BOM", bomId, bomNumber,
                null, new { estimate = estimateNumber, estimateRevision, lines = lineCount },
                cancellationToken, projectId: request.ProjectId);
            await transaction.CommitAsync(cancellationToken);
            return Results.Created($"/api/v1/boms/{bomId}", new
            {
                id = bomId, number = bomNumber, revision = 1, status = "Draft",
                lineCount, rowVersion = Convert.ToBase64String(rowVersion)
            });
        }
        catch
        {
            await transaction.RollbackAsync(cancellationToken);
            throw;
        }
    }

    /// <summary>Releasing freezes the lines: from here a change needs a revision.</summary>
    private static async Task<IResult> ReleaseAsync(
        long id,
        ReleaseBomRequest request,
        SqlConnectionFactory connections,
        CurrentUserService users,
        CancellationToken cancellationToken)
    {
        await users.DemandPermissionAsync("procurement.approve", cancellationToken);
        InputValidation.RequiredText(request.RowVersion, 100, "BOM row version");
        var actor = await users.GetRequiredAsync(cancellationToken);
        await using var connection = await connections.OpenAsync(cancellationToken);
        await using var transaction = (SqlTransaction)await connection.BeginTransactionAsync(IsolationLevel.Serializable, cancellationToken);
        try
        {
            var header = await ReadHeaderAsync(connection, transaction, id, forUpdate: true, cancellationToken);
            await ProjectScope.DemandAsync(connection, transaction, header.ProjectId, actor, cancellationToken);
            if (!string.Equals(header.Status, "Draft", StringComparison.Ordinal))
                throw new ApiException(StatusCodes.Status409Conflict, "bom_not_draft", $"Only a draft BOM can be released; this one is '{header.Status}'.");

            await using var update = new SqlCommand("""
                UPDATE dbo.boms
                SET status = N'Released', released_at = SYSUTCDATETIME(), released_by = @actor,
                    updated_by = @actor, updated_at = SYSUTCDATETIME()
                OUTPUT inserted.row_version
                WHERE id = @id AND deleted_at IS NULL AND row_version = @row_version;
                """, connection, transaction);
            update.Parameters.AddParameter("@actor", SqlDbType.BigInt, actor.Id);
            update.Parameters.AddParameter("@id", SqlDbType.BigInt, id);
            update.Parameters.AddParameter("@row_version", SqlDbType.Timestamp, SqlExtensions.ParseRowVersion(request.RowVersion));
            var version = await update.ExecuteScalarAsync(cancellationToken) as byte[]
                ?? throw new ApiException(StatusCodes.Status409Conflict, "concurrency_conflict", "This BOM changed. Reload and try again.");

            await MaterialAudit.WriteAsync(
                connection, transaction, actor, "Released BOM", "BOM", id, header.Number,
                new { status = header.Status }, new { status = "Released" },
                cancellationToken, projectId: header.ProjectId, reason: request.Comment?.Trim(), approverId: actor.Id);
            await transaction.CommitAsync(cancellationToken);
            return Results.Ok(new { id, status = "Released", rowVersion = Convert.ToBase64String(version) });
        }
        catch
        {
            await transaction.RollbackAsync(cancellationToken);
            throw;
        }
    }

    /// <summary>
    /// Reserve free stock for this project's BOM line. The availability check
    /// runs inside the serializable transaction, so two projects can never be
    /// granted the same quantity.
    /// </summary>
    private static async Task<IResult> ReserveAsync(
        long id,
        ReserveStockRequest request,
        SqlConnectionFactory connections,
        CurrentUserService users,
        CancellationToken cancellationToken)
    {
        await users.DemandPermissionAsync("procurement.request", cancellationToken);
        var actor = await users.GetRequiredAsync(cancellationToken);
        InputValidation.DecimalRange(request.Quantity, 0.0001m, 1_000_000_000m, "Quantity");
        InputValidation.DecimalScale(request.Quantity, 4, "Quantity");
        await using var connection = await connections.OpenAsync(cancellationToken);
        await using var transaction = (SqlTransaction)await connection.BeginTransactionAsync(IsolationLevel.Serializable, cancellationToken);
        try
        {
            var header = await ReadHeaderAsync(connection, transaction, id, forUpdate: true, cancellationToken);
            await ProjectScope.DemandAsync(connection, transaction, header.ProjectId, actor, cancellationToken);

            long itemId;
            string itemCode;
            decimal available;
            await using (var lookup = new SqlCommand("""
                SELECT l.item_id, i.item_code,
                       COALESCE((SELECT SUM(t.qty) FROM dbo.stock_txns t WITH (UPDLOCK, HOLDLOCK)
                                 WHERE t.item_id = l.item_id AND t.bucket = N'stock'), 0)
                     - COALESCE((SELECT SUM(r.qty) FROM dbo.reservations r WITH (UPDLOCK, HOLDLOCK)
                                 WHERE r.item_id = l.item_id AND r.status = N'Active'), 0)
                FROM dbo.bom_lines l
                INNER JOIN dbo.mat_items i ON i.id = l.item_id
                WHERE l.id = @line_id AND l.bom_id = @bom_id AND l.deleted_at IS NULL AND l.non_stock = 0;
                """, connection, transaction))
            {
                lookup.Parameters.AddParameter("@line_id", SqlDbType.BigInt, request.BomLineId);
                lookup.Parameters.AddParameter("@bom_id", SqlDbType.BigInt, id);
                await using var reader = await lookup.ExecuteReaderAsync(CommandBehavior.SingleRow, cancellationToken);
                if (!await reader.ReadAsync(cancellationToken))
                    throw new ApiException(StatusCodes.Status404NotFound, "bom_line_not_found", "This BOM line does not exist or is not a stock line.");
                itemId = reader.GetInt64(0);
                itemCode = reader.GetString(1);
                available = reader.GetDecimal(2);
            }

            if (request.Quantity > available)
                throw new ApiException(
                    StatusCodes.Status409Conflict, "insufficient_stock",
                    $"Only {available:0.####} of {itemCode} is available to reserve.",
                    new { available });

            long reservationId;
            await using (var insert = new SqlCommand("""
                INSERT INTO dbo.reservations (item_id, project_id, bom_line_id, qty, required_date, owner_id, status)
                OUTPUT inserted.id
                VALUES (@item_id, @project_id, @bom_line_id, @qty, @required_date, @actor, N'Active');
                """, connection, transaction))
            {
                insert.Parameters.AddParameter("@item_id", SqlDbType.BigInt, itemId);
                insert.Parameters.AddParameter("@project_id", SqlDbType.BigInt, header.ProjectId);
                insert.Parameters.AddParameter("@bom_line_id", SqlDbType.BigInt, request.BomLineId);
                insert.Parameters.AddParameter("@qty", SqlDbType.Decimal, request.Quantity, precision: 19, scale: 4);
                insert.Parameters.AddParameter("@required_date", SqlDbType.Date, request.RequiredDate);
                insert.Parameters.AddParameter("@actor", SqlDbType.BigInt, actor.Id);
                reservationId = (long)(await insert.ExecuteScalarAsync(cancellationToken))!;
            }

            await MaterialAudit.WriteAsync(
                connection, transaction, actor, "Reserved stock for project", "Reservation", reservationId, itemCode,
                new { available }, new { reserved = request.Quantity, remaining = available - request.Quantity },
                cancellationToken, quantity: request.Quantity, projectId: header.ProjectId, reason: "BOM allocation");
            await transaction.CommitAsync(cancellationToken);
            return Results.Created($"/api/v1/boms/{id}/reservations/{reservationId}", new
            {
                id = reservationId, itemId, quantity = request.Quantity, available = available - request.Quantity
            });
        }
        catch
        {
            await transaction.RollbackAsync(cancellationToken);
            throw;
        }
    }

    private static async Task<IResult> ReleaseReservationAsync(
        long id,
        long reservationId,
        SqlConnectionFactory connections,
        CurrentUserService users,
        CancellationToken cancellationToken)
    {
        await users.DemandPermissionAsync("procurement.request", cancellationToken);
        var actor = await users.GetRequiredAsync(cancellationToken);
        await using var connection = await connections.OpenAsync(cancellationToken);
        await using var transaction = (SqlTransaction)await connection.BeginTransactionAsync(IsolationLevel.Serializable, cancellationToken);
        try
        {
            var header = await ReadHeaderAsync(connection, transaction, id, forUpdate: true, cancellationToken);
            await ProjectScope.DemandAsync(connection, transaction, header.ProjectId, actor, cancellationToken);

            await using var update = new SqlCommand("""
                UPDATE r
                SET r.status = N'Released', r.updated_at = SYSUTCDATETIME()
                OUTPUT inserted.qty, i.item_code
                FROM dbo.reservations r
                INNER JOIN dbo.mat_items i ON i.id = r.item_id
                INNER JOIN dbo.bom_lines l ON l.id = r.bom_line_id
                WHERE r.id = @reservation_id AND l.bom_id = @bom_id AND r.status = N'Active';
                """, connection, transaction);
            update.Parameters.AddParameter("@reservation_id", SqlDbType.BigInt, reservationId);
            update.Parameters.AddParameter("@bom_id", SqlDbType.BigInt, id);
            decimal quantity;
            string itemCode;
            await using (var reader = await update.ExecuteReaderAsync(CommandBehavior.SingleRow, cancellationToken))
            {
                if (!await reader.ReadAsync(cancellationToken))
                    throw new ApiException(StatusCodes.Status409Conflict, "reservation_not_active", "This reservation is not active on this BOM.");
                quantity = reader.GetDecimal(0);
                itemCode = reader.GetString(1);
            }

            await MaterialAudit.WriteAsync(
                connection, transaction, actor, "Released reservation", "Reservation", reservationId, itemCode,
                new { status = "Active", quantity }, new { status = "Released" },
                cancellationToken, quantity: quantity, projectId: header.ProjectId);
            await transaction.CommitAsync(cancellationToken);
            return Results.Ok(new { id = reservationId, status = "Released", quantity });
        }
        catch
        {
            await transaction.RollbackAsync(cancellationToken);
            throw;
        }
    }

    private static async Task<BomHeader> ReadHeaderAsync(
        SqlConnection connection,
        SqlTransaction? transaction,
        long id,
        bool forUpdate,
        CancellationToken cancellationToken)
    {
        var hint = forUpdate ? " WITH (UPDLOCK, HOLDLOCK)" : string.Empty;
        await using var command = new SqlCommand(
            $"SELECT id, bom_no, revision, status, project_id, estimate_id FROM dbo.boms{hint} WHERE id = @id AND deleted_at IS NULL;",
            connection, transaction);
        command.Parameters.AddParameter("@id", SqlDbType.BigInt, id);
        await using var reader = await command.ExecuteReaderAsync(CommandBehavior.SingleRow, cancellationToken);
        if (!await reader.ReadAsync(cancellationToken))
            throw new ApiException(StatusCodes.Status404NotFound, "bom_not_found", "BOM not found.");
        return new BomHeader(
            reader.GetInt64(0), reader.GetString(1), reader.GetInt32(2),
            reader.GetString(3), reader.GetInt64(4), reader.GetInt64(5));
    }

    internal static async Task<string> IssueNumberAsync(
        SqlConnection connection,
        SqlTransaction transaction,
        string documentType,
        BusinessClock clock,
        CancellationToken cancellationToken)
    {
        await using var command = new SqlCommand("dbo.issue_document_number", connection, transaction)
        {
            CommandType = CommandType.StoredProcedure
        };
        command.Parameters.AddParameter("@document_type", SqlDbType.VarChar, documentType, 20);
        command.Parameters.AddParameter("@issue_date", SqlDbType.Date, clock.Today);
        var output = command.Parameters.Add("@document_number", SqlDbType.NVarChar, 30);
        output.Direction = ParameterDirection.Output;
        await command.ExecuteNonQueryAsync(cancellationToken);
        return (string)output.Value;
    }

    private static ApiException Invalid(string message) =>
        new(StatusCodes.Status400BadRequest, "validation_failed", message);
}
