using System.Data;
using IoTTeamCenter.Api.Infrastructure;
using IoTTeamCenter.Api.Models;
using Microsoft.Data.SqlClient;

namespace IoTTeamCenter.Api.Endpoints;

/// <summary>
/// Material issues. A project member asks for material off the BOM, the
/// project owner approves it, the store picks and issues it, and the member
/// confirms what they physically received. Only the issue step moves stock,
/// and every step records who did it — the chain of custody the team could
/// never reconstruct from the old spreadsheets.
/// </summary>
public static class MaterialIssueEndpoints
{
    public static void MapMaterialIssueEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/v1/material-issues").RequireAuthorization();
        group.MapGet("/", ListAsync);
        group.MapGet("/{id:long}", GetAsync);
        group.MapPost("/", CreateAsync);
        group.MapPost("/{id:long}/decide", DecideAsync);
        group.MapPost("/{id:long}/issue", IssueAsync);
        group.MapPost("/{id:long}/receipt", ConfirmReceiptAsync);
        group.MapPost("/{id:long}/returns", ReturnAsync);
    }

    private sealed record MirHeader(long Id, string Number, long ProjectId, long RequestedBy, string Status);

    private static async Task<IResult> ListAsync(
        long? projectId,
        string? status,
        bool? mine,
        SqlConnectionFactory connections,
        CurrentUserService users,
        CancellationToken cancellationToken)
    {
        await users.DemandPermissionAsync("inventory.read", cancellationToken);
        var actor = await users.GetRequiredAsync(cancellationToken);
        await using var connection = await connections.OpenAsync(cancellationToken);
        await using var command = new SqlCommand("""
            SELECT m.id, m.mir_no, m.project_id, p.project_no, p.name, m.requested_by, ru.name,
                   m.requested_at, m.required_date, m.status,
                   m.approved_by, au.name, m.issued_by, iu.name, m.issued_at, m.received_by, rcu.name, m.received_at,
                   COUNT(ml.id), COALESCE(SUM(ml.requested_qty), 0), COALESCE(SUM(ml.issued_qty), 0),
                   COALESCE(SUM(ml.returned_qty), 0), m.row_version
            FROM dbo.mirs m
            INNER JOIN dbo.projects p ON p.id = m.project_id
            INNER JOIN dbo.users ru ON ru.id = m.requested_by
            LEFT JOIN dbo.users au ON au.id = m.approved_by
            LEFT JOIN dbo.users iu ON iu.id = m.issued_by
            LEFT JOIN dbo.users rcu ON rcu.id = m.received_by
            LEFT JOIN dbo.mir_lines ml ON ml.mir_id = m.id
            WHERE (@project_id IS NULL OR m.project_id = @project_id)
              AND (@status IS NULL OR m.status = @status)
              AND (@mine = 0 OR m.requested_by = @actor)
              AND (@elevated = 1 OR p.manager_id = @actor OR p.lead_engineer_id = @actor
                   OR EXISTS (SELECT 1 FROM dbo.project_members pm WHERE pm.project_id = p.id AND pm.user_id = @actor))
            GROUP BY m.id, m.mir_no, m.project_id, p.project_no, p.name, m.requested_by, ru.name,
                     m.requested_at, m.required_date, m.status, m.approved_by, au.name, m.issued_by, iu.name,
                     m.issued_at, m.received_by, rcu.name, m.received_at, m.row_version
            ORDER BY m.id DESC;
            """, connection);
        command.Parameters.AddParameter("@project_id", SqlDbType.BigInt, projectId);
        command.Parameters.AddParameter("@status", SqlDbType.NVarChar, string.IsNullOrWhiteSpace(status) ? null : status.Trim(), 30);
        command.Parameters.AddParameter("@mine", SqlDbType.Bit, mine ?? false);
        command.Parameters.AddParameter("@actor", SqlDbType.BigInt, actor.Id);
        command.Parameters.AddParameter("@elevated", SqlDbType.Bit, ProjectScope.IsElevated(actor));

        var items = new List<object>();
        await using var reader = await command.ExecuteReaderAsync(cancellationToken);
        while (await reader.ReadAsync(cancellationToken))
            items.Add(new
            {
                id = reader.GetInt64(0), number = reader.GetString(1),
                projectId = reader.GetInt64(2), projectNumber = reader.GetString(3), projectName = reader.GetString(4),
                requestedById = reader.GetInt64(5), requestedByName = reader.GetString(6),
                requestedAt = reader.GetFieldValue<DateTimeOffset>(7), requiredDate = reader.GetFieldValue<DateOnly>(8),
                status = reader.GetString(9),
                approvedByName = reader.IsDBNull(11) ? null : reader.GetString(11),
                issuedByName = reader.IsDBNull(13) ? null : reader.GetString(13),
                issuedAt = reader.IsDBNull(14) ? (DateTimeOffset?)null : reader.GetFieldValue<DateTimeOffset>(14),
                receivedByName = reader.IsDBNull(16) ? null : reader.GetString(16),
                receivedAt = reader.IsDBNull(17) ? (DateTimeOffset?)null : reader.GetFieldValue<DateTimeOffset>(17),
                lineCount = reader.GetInt32(18), requestedQuantity = reader.GetDecimal(19),
                issuedQuantity = reader.GetDecimal(20), returnedQuantity = reader.GetDecimal(21),
                rowVersion = reader.RowVersionString(22)
            });
        return Results.Ok(items);
    }

    private static async Task<IResult> GetAsync(
        long id,
        SqlConnectionFactory connections,
        CurrentUserService users,
        CancellationToken cancellationToken)
    {
        await users.DemandPermissionAsync("inventory.read", cancellationToken);
        var actor = await users.GetRequiredAsync(cancellationToken);
        await using var connection = await connections.OpenAsync(cancellationToken);

        long projectId;
        object issue;
        var lines = new List<object>();
        await using (var command = new SqlCommand("""
            SELECT m.id, m.mir_no, m.project_id, p.project_no, p.name, m.requested_by, ru.name, m.requested_at,
                   m.required_date, m.status, m.approved_by, au.name, m.approved_at, m.picked_by, pu.name,
                   m.issued_by, iu.name, m.issued_at, m.received_by, rcu.name, m.received_at, m.row_version
            FROM dbo.mirs m
            INNER JOIN dbo.projects p ON p.id = m.project_id
            INNER JOIN dbo.users ru ON ru.id = m.requested_by
            LEFT JOIN dbo.users au ON au.id = m.approved_by
            LEFT JOIN dbo.users pu ON pu.id = m.picked_by
            LEFT JOIN dbo.users iu ON iu.id = m.issued_by
            LEFT JOIN dbo.users rcu ON rcu.id = m.received_by
            WHERE m.id = @id;

            SELECT ml.id, ml.bom_line_id, ml.item_id, i.item_code, i.part_no, bl.description,
                   ml.bom_qty, ml.previously_issued_qty, ml.requested_qty, ml.issued_qty, ml.returned_qty,
                   ml.location, ml.purpose, bl.unit, ml.row_version,
                   COALESCE(vb.usable, 0), COALESCE(vb.available, 0),
                   COALESCE((SELECT SUM(r.qty) FROM dbo.reservations r
                             WHERE r.item_id = ml.item_id AND r.project_id = @project_scope AND r.status = N'Active'), 0)
            FROM dbo.mir_lines ml
            INNER JOIN dbo.bom_lines bl ON bl.id = ml.bom_line_id
            INNER JOIN dbo.mat_items i ON i.id = ml.item_id
            LEFT JOIN dbo.v_item_balances vb ON vb.item_id = ml.item_id
            WHERE ml.mir_id = @id
            ORDER BY ml.id;
            """, connection))
        {
            command.Parameters.AddParameter("@id", SqlDbType.BigInt, id);
            // Resolved below from the header row; the second result set only
            // needs it to show what this project already holds on reservation.
            command.Parameters.AddParameter("@project_scope", SqlDbType.BigInt,
                await ResolveProjectAsync(connection, id, cancellationToken));

            await using var reader = await command.ExecuteReaderAsync(cancellationToken);
            if (!await reader.ReadAsync(cancellationToken))
                throw new ApiException(StatusCodes.Status404NotFound, "mir_not_found", "Material issue request not found.");
            projectId = reader.GetInt64(2);
            issue = new
            {
                id = reader.GetInt64(0), number = reader.GetString(1), projectId,
                projectNumber = reader.GetString(3), projectName = reader.GetString(4),
                requestedById = reader.GetInt64(5), requestedByName = reader.GetString(6),
                requestedAt = reader.GetFieldValue<DateTimeOffset>(7),
                requiredDate = reader.GetFieldValue<DateOnly>(8), status = reader.GetString(9),
                approvedById = reader.IsDBNull(10) ? (long?)null : reader.GetInt64(10),
                approvedByName = reader.IsDBNull(11) ? null : reader.GetString(11),
                approvedAt = reader.IsDBNull(12) ? (DateTimeOffset?)null : reader.GetFieldValue<DateTimeOffset>(12),
                pickedByName = reader.IsDBNull(14) ? null : reader.GetString(14),
                issuedById = reader.IsDBNull(15) ? (long?)null : reader.GetInt64(15),
                issuedByName = reader.IsDBNull(16) ? null : reader.GetString(16),
                issuedAt = reader.IsDBNull(17) ? (DateTimeOffset?)null : reader.GetFieldValue<DateTimeOffset>(17),
                receivedById = reader.IsDBNull(18) ? (long?)null : reader.GetInt64(18),
                receivedByName = reader.IsDBNull(19) ? null : reader.GetString(19),
                receivedAt = reader.IsDBNull(20) ? (DateTimeOffset?)null : reader.GetFieldValue<DateTimeOffset>(20),
                rowVersion = reader.RowVersionString(21)
            };

            await reader.NextResultAsync(cancellationToken);
            while (await reader.ReadAsync(cancellationToken))
            {
                var issued = reader.GetDecimal(9);
                var returned = reader.GetDecimal(10);
                lines.Add(new
                {
                    id = reader.GetInt64(0), bomLineId = reader.GetInt64(1), itemId = reader.GetInt64(2),
                    itemCode = reader.GetString(3), partNumber = reader.GetString(4), description = reader.GetString(5),
                    bomQuantity = reader.GetDecimal(6), previouslyIssued = reader.GetDecimal(7),
                    requestedQuantity = reader.GetDecimal(8), issuedQuantity = issued, returnedQuantity = returned,
                    netIssued = issued - returned,
                    location = reader.GetString(11),
                    purpose = reader.IsDBNull(12) ? null : reader.GetString(12),
                    unit = reader.GetString(13), rowVersion = reader.RowVersionString(14),
                    onHand = reader.GetDecimal(15), available = reader.GetDecimal(16),
                    reservedForThisProject = reader.GetDecimal(17)
                });
            }
        }

        await ProjectScope.DemandAsync(connection, null, projectId, actor, cancellationToken);
        return Results.Ok(new { materialIssue = issue, lines });
    }

    /// <summary>
    /// A member raises a request against their own project's BOM. The database
    /// refuses a quantity beyond what the BOM line still has left, and the
    /// project scope check refuses a project the member is not on.
    /// </summary>
    private static async Task<IResult> CreateAsync(
        CreateMaterialIssueRequest request,
        SqlConnectionFactory connections,
        CurrentUserService users,
        BusinessClock clock,
        CancellationToken cancellationToken)
    {
        await users.DemandPermissionAsync("procurement.request", cancellationToken);
        var actor = await users.GetRequiredAsync(cancellationToken);
        Validate(request);

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
                    $"Material can only be issued against a released BOM; this one is '{bomStatus}'.");
            await ProjectScope.DemandAsync(connection, transaction, projectId, actor, cancellationToken);

            var mirNumber = await BomEndpoints.IssueNumberAsync(connection, transaction, "MIR", clock, cancellationToken);
            long mirId;
            byte[] rowVersion;
            await using (var insert = new SqlCommand("""
                INSERT INTO dbo.mirs (mir_no, project_id, requested_by, required_date, status)
                OUTPUT inserted.id, inserted.row_version
                VALUES (@mir_no, @project_id, @actor, @required_date, N'Pending Approval');
                """, connection, transaction))
            {
                insert.Parameters.AddParameter("@mir_no", SqlDbType.NVarChar, mirNumber, 30);
                insert.Parameters.AddParameter("@project_id", SqlDbType.BigInt, projectId);
                insert.Parameters.AddParameter("@actor", SqlDbType.BigInt, actor.Id);
                insert.Parameters.AddParameter("@required_date", SqlDbType.Date, request.RequiredDate);
                await using var reader = await insert.ExecuteReaderAsync(CommandBehavior.SingleRow, cancellationToken);
                await reader.ReadAsync(cancellationToken);
                mirId = reader.GetInt64(0);
                rowVersion = (byte[])reader.GetValue(1);
            }

            foreach (var line in request.Lines)
                await InsertLineAsync(connection, transaction, mirId, request.BomId, line, cancellationToken);

            await MaterialAudit.WriteAsync(
                connection, transaction, actor, "Requested material issue", "MIR", mirId, mirNumber,
                null, new { lines = request.Lines.Count, status = "Pending Approval" },
                cancellationToken, quantity: request.Lines.Sum(line => line.RequestedQuantity),
                projectId: projectId, reason: request.Purpose?.Trim());
            await transaction.CommitAsync(cancellationToken);
            return Results.Created($"/api/v1/material-issues/{mirId}", new
            {
                id = mirId, number = mirNumber, status = "Pending Approval",
                lineCount = request.Lines.Count, rowVersion = Convert.ToBase64String(rowVersion)
            });
        }
        catch
        {
            await transaction.RollbackAsync(cancellationToken);
            throw;
        }
    }

    private static async Task InsertLineAsync(
        SqlConnection connection,
        SqlTransaction transaction,
        long mirId,
        long bomId,
        MaterialIssueLineRequest line,
        CancellationToken cancellationToken)
    {
        long itemId;
        string itemCode;
        decimal bomQuantity;
        decimal customerSupplied;
        decimal previouslyIssued;
        string defaultLocation;
        await using (var lookup = new SqlCommand("""
            SELECT bl.item_id, i.item_code, bl.qty_required, bl.customer_supplied_qty, COALESCE(i.location, N''),
                   COALESCE((SELECT SUM(ml.issued_qty - ml.returned_qty) FROM dbo.mir_lines ml
                             INNER JOIN dbo.mirs m ON m.id = ml.mir_id
                                  AND m.status IN (N'Issued', N'Received')
                             WHERE ml.bom_line_id = bl.id), 0)
            FROM dbo.bom_lines bl
            INNER JOIN dbo.mat_items i ON i.id = bl.item_id
            WHERE bl.id = @line_id AND bl.bom_id = @bom_id AND bl.deleted_at IS NULL AND bl.non_stock = 0;
            """, connection, transaction))
        {
            lookup.Parameters.AddParameter("@line_id", SqlDbType.BigInt, line.BomLineId);
            lookup.Parameters.AddParameter("@bom_id", SqlDbType.BigInt, bomId);
            await using var reader = await lookup.ExecuteReaderAsync(CommandBehavior.SingleRow, cancellationToken);
            if (!await reader.ReadAsync(cancellationToken))
                throw new ApiException(StatusCodes.Status404NotFound, "bom_line_not_found",
                    $"BOM line {line.BomLineId} is not a stock line on this BOM.");
            itemId = reader.GetInt64(0);
            itemCode = reader.GetString(1);
            bomQuantity = reader.GetDecimal(2);
            customerSupplied = reader.GetDecimal(3);
            defaultLocation = reader.GetString(4);
            previouslyIssued = reader.GetDecimal(5);
        }

        // The BOM quantity the project may still draw, less anything the
        // customer supplies themselves.
        var issuable = bomQuantity - customerSupplied;
        if (line.RequestedQuantity > issuable - previouslyIssued)
            throw new ApiException(
                StatusCodes.Status409Conflict, "exceeds_bom_quantity",
                $"{itemCode}: the BOM allows {issuable:0.####} and {previouslyIssued:0.####} is already issued, so {line.RequestedQuantity:0.####} cannot be requested.",
                new { issuable, previouslyIssued, requested = line.RequestedQuantity });

        await using var insert = new SqlCommand("""
            INSERT INTO dbo.mir_lines (
                mir_id, bom_line_id, item_id, bom_qty, previously_issued_qty, requested_qty, location, purpose)
            VALUES (@mir_id, @bom_line_id, @item_id, @bom_qty, @previously_issued, @requested, @location, @purpose);
            """, connection, transaction);
        insert.Parameters.AddParameter("@mir_id", SqlDbType.BigInt, mirId);
        insert.Parameters.AddParameter("@bom_line_id", SqlDbType.BigInt, line.BomLineId);
        insert.Parameters.AddParameter("@item_id", SqlDbType.BigInt, itemId);
        insert.Parameters.AddParameter("@bom_qty", SqlDbType.Decimal, issuable, precision: 19, scale: 4);
        insert.Parameters.AddParameter("@previously_issued", SqlDbType.Decimal, previouslyIssued, precision: 19, scale: 4);
        insert.Parameters.AddParameter("@requested", SqlDbType.Decimal, line.RequestedQuantity, precision: 19, scale: 4);
        insert.Parameters.AddParameter("@location", SqlDbType.NVarChar,
            string.IsNullOrWhiteSpace(line.Location) ? defaultLocation : line.Location.Trim(), 100);
        insert.Parameters.AddParameter("@purpose", SqlDbType.NVarChar, line.Purpose?.Trim(), -1);
        await insert.ExecuteNonQueryAsync(cancellationToken);
    }

    /// <summary>The project owner approves or rejects. The requester never decides their own request.</summary>
    private static async Task<IResult> DecideAsync(
        long id,
        DecideMaterialIssueRequest request,
        SqlConnectionFactory connections,
        CurrentUserService users,
        CancellationToken cancellationToken)
    {
        await users.DemandPermissionAsync("procurement.approve", cancellationToken);
        InputValidation.OneOf(request.Decision, "Decision", "Approve", "Reject");
        InputValidation.OptionalText(request.Comment, 20_000, "Comment");
        var actor = await users.GetRequiredAsync(cancellationToken);
        var approve = string.Equals(request.Decision.Trim(), "Approve", StringComparison.Ordinal);

        await using var connection = await connections.OpenAsync(cancellationToken);
        await using var transaction = (SqlTransaction)await connection.BeginTransactionAsync(IsolationLevel.Serializable, cancellationToken);
        try
        {
            var header = await ReadHeaderAsync(connection, transaction, id, forUpdate: true, cancellationToken);
            await ProjectScope.DemandAsync(connection, transaction, header.ProjectId, actor, cancellationToken);
            if (!string.Equals(header.Status, "Pending Approval", StringComparison.Ordinal))
                throw new ApiException(StatusCodes.Status409Conflict, "mir_not_pending", $"This request is '{header.Status}' and is not waiting for approval.");
            if (header.RequestedBy == actor.Id)
                throw new ApiException(StatusCodes.Status403Forbidden, "self_approval_forbidden", "The requester cannot approve their own material issue request.");

            // Asking for more than the BOM line has left is allowed, but the
            // approver has to say why in writing.
            var overBom = await HasOverBomLineAsync(connection, transaction, id, cancellationToken);
            if ((!approve || overBom) && string.IsNullOrWhiteSpace(request.Comment))
                throw new ApiException(StatusCodes.Status400BadRequest, "comment_required",
                    approve
                        ? "This request exceeds the remaining BOM quantity — a comment is required to approve it."
                        : "A comment is required when rejecting.");

            var nextStatus = approve ? "Approved" : "Rejected";
            byte[] version;
            await using (var update = new SqlCommand("""
                UPDATE dbo.mirs
                SET status = @status,
                    approved_by = CASE WHEN @approve = 1 THEN @actor ELSE NULL END,
                    approved_at = CASE WHEN @approve = 1 THEN SYSUTCDATETIME() ELSE NULL END
                OUTPUT inserted.row_version
                WHERE id = @id AND status = N'Pending Approval';
                """, connection, transaction))
            {
                update.Parameters.AddParameter("@status", SqlDbType.NVarChar, nextStatus, 30);
                update.Parameters.AddParameter("@approve", SqlDbType.Bit, approve);
                update.Parameters.AddParameter("@actor", SqlDbType.BigInt, actor.Id);
                update.Parameters.AddParameter("@id", SqlDbType.BigInt, id);
                version = await update.ExecuteScalarAsync(cancellationToken) as byte[]
                    ?? throw new ApiException(StatusCodes.Status409Conflict, "concurrency_conflict", "This request changed. Reload and try again.");
            }

            await MaterialAudit.WriteAsync(
                connection, transaction, actor, $"{request.Decision.Trim()} material issue", "MIR", id, header.Number,
                new { status = "Pending Approval" }, new { status = nextStatus },
                cancellationToken, projectId: header.ProjectId, reason: request.Comment?.Trim(), approverId: actor.Id);
            await transaction.CommitAsync(cancellationToken);
            return Results.Ok(new { id, status = nextStatus, rowVersion = Convert.ToBase64String(version) });
        }
        catch
        {
            await transaction.RollbackAsync(cancellationToken);
            throw;
        }
    }

    /// <summary>
    /// The store picks and issues. Stock leaves here: the ledger is debited,
    /// and the project's own reservations are consumed first — splitting a
    /// reservation larger than the issued quantity so the remainder stays
    /// held. Another project's reserved stock can never be handed out.
    /// </summary>
    private static async Task<IResult> IssueAsync(
        long id,
        WorkflowRequest request,
        SqlConnectionFactory connections,
        CurrentUserService users,
        BusinessClock clock,
        CancellationToken cancellationToken)
    {
        await users.DemandPermissionAsync("inventory.issue", cancellationToken);
        InputValidation.RequiredText(request.RowVersion, 100, "Request row version");
        var actor = await users.GetRequiredAsync(cancellationToken);
        await using var connection = await connections.OpenAsync(cancellationToken);
        await using var transaction = (SqlTransaction)await connection.BeginTransactionAsync(IsolationLevel.Serializable, cancellationToken);
        try
        {
            var header = await ReadHeaderAsync(connection, transaction, id, forUpdate: true, cancellationToken);
            if (header.Status is not ("Approved" or "Picking"))
                throw new ApiException(StatusCodes.Status409Conflict, "mir_not_approved", $"Material can only be issued against an approved request; this one is '{header.Status}'.");

            var lines = new List<(long LineId, long ItemId, string ItemCode, decimal Requested, string Location, decimal UnitCost, decimal Usable, decimal OwnReserved, decimal Available)>();
            await using (var read = new SqlCommand("""
                SELECT ml.id, ml.item_id, i.item_code, ml.requested_qty, ml.location, i.avg_unit_cost,
                       COALESCE((SELECT SUM(t.qty) FROM dbo.stock_txns t WITH (UPDLOCK, HOLDLOCK)
                                 WHERE t.item_id = ml.item_id AND t.bucket = N'stock'), 0),
                       COALESCE((SELECT SUM(r.qty) FROM dbo.reservations r WITH (UPDLOCK, HOLDLOCK)
                                 WHERE r.item_id = ml.item_id AND r.project_id = @project_id AND r.status = N'Active'), 0),
                       COALESCE((SELECT SUM(r.qty) FROM dbo.reservations r
                                 WHERE r.item_id = ml.item_id AND r.status = N'Active'), 0)
                FROM dbo.mir_lines ml
                INNER JOIN dbo.mat_items i ON i.id = ml.item_id
                WHERE ml.mir_id = @id
                ORDER BY ml.id;
                """, connection, transaction))
            {
                read.Parameters.AddParameter("@id", SqlDbType.BigInt, id);
                read.Parameters.AddParameter("@project_id", SqlDbType.BigInt, header.ProjectId);
                await using var reader = await read.ExecuteReaderAsync(cancellationToken);
                while (await reader.ReadAsync(cancellationToken))
                {
                    var usable = reader.GetDecimal(6);
                    var ownReserved = reader.GetDecimal(7);
                    var totalReserved = reader.GetDecimal(8);
                    lines.Add((reader.GetInt64(0), reader.GetInt64(1), reader.GetString(2), reader.GetDecimal(3),
                        reader.GetString(4), reader.GetDecimal(5), usable, ownReserved, usable - totalReserved));
                }
            }
            if (lines.Count == 0)
                throw new ApiException(StatusCodes.Status409Conflict, "mir_empty", "This request has no lines to issue.");

            // Nothing moves until every line is proven issuable.
            foreach (var line in lines)
            {
                if (line.Requested > line.Usable)
                    throw new ApiException(StatusCodes.Status409Conflict, "insufficient_stock",
                        $"{line.ItemCode}: only {line.Usable:0.####} is physically in stock.",
                        new { inStock = line.Usable, requested = line.Requested });
                if (line.Requested > line.OwnReserved + line.Available)
                    throw new ApiException(StatusCodes.Status409Conflict, "reserved_for_another_project",
                        $"{line.ItemCode}: {line.Requested - line.OwnReserved - line.Available:0.####} of what you asked for is reserved for another project.",
                        new { reservedForThisProject = line.OwnReserved, free = line.Available });
            }

            foreach (var line in lines)
            {
                await GoodsReceiptEndpoints.AppendLedgerAsync(
                    connection, transaction, $"mir:{id}:line:{line.LineId}:issue", "MIR_ISSUE",
                    line.ItemId, -line.Requested, "stock", line.Location, header.Number,
                    header.ProjectId, line.UnitCost, actor.Id, "Issued to project", clock.Today, cancellationToken);
                await ConsumeReservationsAsync(connection, transaction, line.ItemId, header.ProjectId, line.Requested, cancellationToken);
                await using var mark = new SqlCommand(
                    "UPDATE dbo.mir_lines SET issued_qty = requested_qty WHERE id = @line_id;", connection, transaction);
                mark.Parameters.AddParameter("@line_id", SqlDbType.BigInt, line.LineId);
                await mark.ExecuteNonQueryAsync(cancellationToken);
            }

            byte[] version;
            await using (var update = new SqlCommand("""
                UPDATE dbo.mirs
                SET status = N'Issued', picked_by = COALESCE(picked_by, @actor), issued_by = @actor, issued_at = SYSUTCDATETIME()
                OUTPUT inserted.row_version
                WHERE id = @id AND status IN (N'Approved', N'Picking') AND row_version = @row_version;
                """, connection, transaction))
            {
                update.Parameters.AddParameter("@actor", SqlDbType.BigInt, actor.Id);
                update.Parameters.AddParameter("@id", SqlDbType.BigInt, id);
                update.Parameters.AddParameter("@row_version", SqlDbType.Timestamp, SqlExtensions.ParseRowVersion(request.RowVersion));
                version = await update.ExecuteScalarAsync(cancellationToken) as byte[]
                    ?? throw new ApiException(StatusCodes.Status409Conflict, "concurrency_conflict", "This request changed. Reload and try again.");
            }

            await MaterialAudit.WriteAsync(
                connection, transaction, actor, "Issued material", "MIR", id, header.Number,
                new { status = header.Status }, new { status = "Issued", lines = lines.Count },
                cancellationToken, quantity: lines.Sum(line => line.Requested),
                projectId: header.ProjectId, reason: request.Comment?.Trim());
            await transaction.CommitAsync(cancellationToken);
            return Results.Ok(new
            {
                id, status = "Issued", issuedQuantity = lines.Sum(line => line.Requested),
                rowVersion = Convert.ToBase64String(version)
            });
        }
        catch
        {
            await transaction.RollbackAsync(cancellationToken);
            throw;
        }
    }

    /// <summary>
    /// Consume this project's reservations against an issue, splitting the one
    /// that straddles the boundary so the untouched remainder stays reserved.
    /// </summary>
    private static async Task ConsumeReservationsAsync(
        SqlConnection connection,
        SqlTransaction transaction,
        long itemId,
        long projectId,
        decimal quantity,
        CancellationToken cancellationToken)
    {
        var remaining = quantity;
        var reservations = new List<(long Id, decimal Quantity)>();
        await using (var read = new SqlCommand("""
            SELECT id, qty FROM dbo.reservations WITH (UPDLOCK, HOLDLOCK)
            WHERE item_id = @item_id AND project_id = @project_id AND status = N'Active'
            ORDER BY required_date, id;
            """, connection, transaction))
        {
            read.Parameters.AddParameter("@item_id", SqlDbType.BigInt, itemId);
            read.Parameters.AddParameter("@project_id", SqlDbType.BigInt, projectId);
            await using var reader = await read.ExecuteReaderAsync(cancellationToken);
            while (await reader.ReadAsync(cancellationToken))
                reservations.Add((reader.GetInt64(0), reader.GetDecimal(1)));
        }

        foreach (var reservation in reservations)
        {
            if (remaining <= 0) break;
            if (reservation.Quantity <= remaining)
            {
                await using var consume = new SqlCommand(
                    "UPDATE dbo.reservations SET status = N'Consumed', updated_at = SYSUTCDATETIME() WHERE id = @id AND status = N'Active';",
                    connection, transaction);
                consume.Parameters.AddParameter("@id", SqlDbType.BigInt, reservation.Id);
                await consume.ExecuteNonQueryAsync(cancellationToken);
                remaining -= reservation.Quantity;
            }
            else
            {
                await using var split = new SqlCommand("""
                    UPDATE dbo.reservations SET qty = qty - @consumed, updated_at = SYSUTCDATETIME()
                    WHERE id = @id AND status = N'Active';

                    INSERT INTO dbo.reservations (item_id, project_id, bom_line_id, qty, required_date, owner_id, status)
                    SELECT item_id, project_id, bom_line_id, @consumed, required_date, owner_id, N'Consumed'
                    FROM dbo.reservations WHERE id = @id;
                    """, connection, transaction);
                split.Parameters.AddParameter("@consumed", SqlDbType.Decimal, remaining, precision: 19, scale: 4);
                split.Parameters.AddParameter("@id", SqlDbType.BigInt, reservation.Id);
                await split.ExecuteNonQueryAsync(cancellationToken);
                remaining = 0;
            }
        }
    }

    /// <summary>The member confirms what physically reached them — the last link in the chain.</summary>
    private static async Task<IResult> ConfirmReceiptAsync(
        long id,
        WorkflowRequest request,
        SqlConnectionFactory connections,
        CurrentUserService users,
        CancellationToken cancellationToken)
    {
        await users.DemandPermissionAsync("procurement.request", cancellationToken);
        InputValidation.RequiredText(request.RowVersion, 100, "Request row version");
        var actor = await users.GetRequiredAsync(cancellationToken);
        await using var connection = await connections.OpenAsync(cancellationToken);
        await using var transaction = (SqlTransaction)await connection.BeginTransactionAsync(IsolationLevel.Serializable, cancellationToken);
        try
        {
            var header = await ReadHeaderAsync(connection, transaction, id, forUpdate: true, cancellationToken);
            if (!string.Equals(header.Status, "Issued", StringComparison.Ordinal))
                throw new ApiException(StatusCodes.Status409Conflict, "mir_not_issued", $"Only issued material can be confirmed; this request is '{header.Status}'.");
            if (header.RequestedBy != actor.Id && !ProjectScope.IsElevated(actor))
                throw new ApiException(StatusCodes.Status403Forbidden, "requester_required", "Only the requester confirms receipt of their own material.");

            byte[] version;
            await using (var update = new SqlCommand("""
                UPDATE dbo.mirs SET status = N'Received', received_by = @actor, received_at = SYSUTCDATETIME()
                OUTPUT inserted.row_version
                WHERE id = @id AND status = N'Issued' AND row_version = @row_version;
                """, connection, transaction))
            {
                update.Parameters.AddParameter("@actor", SqlDbType.BigInt, actor.Id);
                update.Parameters.AddParameter("@id", SqlDbType.BigInt, id);
                update.Parameters.AddParameter("@row_version", SqlDbType.Timestamp, SqlExtensions.ParseRowVersion(request.RowVersion));
                version = await update.ExecuteScalarAsync(cancellationToken) as byte[]
                    ?? throw new ApiException(StatusCodes.Status409Conflict, "concurrency_conflict", "This request changed. Reload and try again.");
            }

            await MaterialAudit.WriteAsync(
                connection, transaction, actor, "Confirmed member receipt", "MIR", id, header.Number,
                new { status = "Issued" }, new { status = "Received", receivedBy = actor.Name },
                cancellationToken, projectId: header.ProjectId, reason: request.Comment?.Trim());
            await transaction.CommitAsync(cancellationToken);
            return Results.Ok(new { id, status = "Received", rowVersion = Convert.ToBase64String(version) });
        }
        catch
        {
            await transaction.RollbackAsync(cancellationToken);
            throw;
        }
    }

    /// <summary>
    /// Unused material goes back to the store. The return re-enters stock on
    /// the ledger, which lowers the project's actual consumed cost by exactly
    /// what came back.
    /// </summary>
    private static async Task<IResult> ReturnAsync(
        long id,
        ReturnMaterialRequest request,
        SqlConnectionFactory connections,
        CurrentUserService users,
        BusinessClock clock,
        CancellationToken cancellationToken)
    {
        await users.DemandPermissionAsync("inventory.issue", cancellationToken);
        InputValidation.RequiredText(request.Reason, 20_000, "Reason");
        InputValidation.DecimalRange(request.Quantity, 0.0001m, 1_000_000_000m, "Quantity");
        InputValidation.DecimalScale(request.Quantity, 4, "Quantity");
        var actor = await users.GetRequiredAsync(cancellationToken);

        await using var connection = await connections.OpenAsync(cancellationToken);
        await using var transaction = (SqlTransaction)await connection.BeginTransactionAsync(IsolationLevel.Serializable, cancellationToken);
        try
        {
            var header = await ReadHeaderAsync(connection, transaction, id, forUpdate: true, cancellationToken);
            if (header.Status is not ("Issued" or "Received"))
                throw new ApiException(StatusCodes.Status409Conflict, "mir_not_issued", $"Material can only be returned against an issued request; this one is '{header.Status}'.");

            long itemId;
            string itemCode;
            string location;
            decimal issued;
            decimal alreadyReturned;
            decimal unitCost;
            await using (var read = new SqlCommand("""
                SELECT ml.item_id, i.item_code, ml.location, ml.issued_qty, ml.returned_qty, i.avg_unit_cost
                FROM dbo.mir_lines ml WITH (UPDLOCK, HOLDLOCK)
                INNER JOIN dbo.mat_items i ON i.id = ml.item_id
                WHERE ml.id = @line_id AND ml.mir_id = @mir_id;
                """, connection, transaction))
            {
                read.Parameters.AddParameter("@line_id", SqlDbType.BigInt, request.LineId);
                read.Parameters.AddParameter("@mir_id", SqlDbType.BigInt, id);
                await using var reader = await read.ExecuteReaderAsync(CommandBehavior.SingleRow, cancellationToken);
                if (!await reader.ReadAsync(cancellationToken))
                    throw new ApiException(StatusCodes.Status404NotFound, "mir_line_not_found", "This line does not belong to the request.");
                itemId = reader.GetInt64(0);
                itemCode = reader.GetString(1);
                location = reader.GetString(2);
                issued = reader.GetDecimal(3);
                alreadyReturned = reader.GetDecimal(4);
                unitCost = reader.GetDecimal(5);
            }

            var returnable = issued - alreadyReturned;
            if (request.Quantity > returnable)
                throw new ApiException(StatusCodes.Status409Conflict, "exceeds_issued",
                    $"{itemCode}: {issued:0.####} was issued and {alreadyReturned:0.####} already came back, so only {returnable:0.####} can be returned.",
                    new { returnable });

            await using (var update = new SqlCommand(
                "UPDATE dbo.mir_lines SET returned_qty = returned_qty + @qty WHERE id = @line_id;", connection, transaction))
            {
                update.Parameters.AddParameter("@qty", SqlDbType.Decimal, request.Quantity, precision: 19, scale: 4);
                update.Parameters.AddParameter("@line_id", SqlDbType.BigInt, request.LineId);
                await update.ExecuteNonQueryAsync(cancellationToken);
            }

            // Each return is its own ledger event, so a line can come back in
            // several trips without the keys colliding.
            var sequence = await NextReturnSequenceAsync(connection, transaction, id, request.LineId, cancellationToken);
            await GoodsReceiptEndpoints.AppendLedgerAsync(
                connection, transaction, $"mir:{id}:line:{request.LineId}:return:{sequence}", "MIR_RETURN",
                itemId, request.Quantity, "stock", location, header.Number, header.ProjectId,
                unitCost, actor.Id, request.Reason.Trim(), clock.Today, cancellationToken);

            await MaterialAudit.WriteAsync(
                connection, transaction, actor, "Returned material to store", "MIR", id, header.Number,
                new { issued, alreadyReturned }, new { returned = request.Quantity, itemCode },
                cancellationToken, quantity: request.Quantity, projectId: header.ProjectId, reason: request.Reason.Trim());
            await transaction.CommitAsync(cancellationToken);
            return Results.Ok(new { id, lineId = request.LineId, returned = request.Quantity, itemCode });
        }
        catch
        {
            await transaction.RollbackAsync(cancellationToken);
            throw;
        }
    }

    private static async Task<int> NextReturnSequenceAsync(
        SqlConnection connection, SqlTransaction transaction, long mirId, long lineId, CancellationToken cancellationToken)
    {
        await using var command = new SqlCommand(
            "SELECT COUNT(*) FROM dbo.stock_txns WHERE source_event_key LIKE @prefix;", connection, transaction);
        command.Parameters.AddParameter("@prefix", SqlDbType.NVarChar, $"mir:{mirId}:line:{lineId}:return:%", 200);
        return (int)(await command.ExecuteScalarAsync(cancellationToken))! + 1;
    }

    private static async Task<bool> HasOverBomLineAsync(
        SqlConnection connection, SqlTransaction transaction, long mirId, CancellationToken cancellationToken)
    {
        await using var command = new SqlCommand("""
            SELECT CASE WHEN EXISTS (
                SELECT 1 FROM dbo.mir_lines
                WHERE mir_id = @id AND requested_qty > bom_qty - previously_issued_qty
            ) THEN CAST(1 AS bit) ELSE CAST(0 AS bit) END;
            """, connection, transaction);
        command.Parameters.AddParameter("@id", SqlDbType.BigInt, mirId);
        return (bool)(await command.ExecuteScalarAsync(cancellationToken))!;
    }

    private static async Task<long> ResolveProjectAsync(SqlConnection connection, long mirId, CancellationToken cancellationToken)
    {
        await using var command = new SqlCommand("SELECT project_id FROM dbo.mirs WHERE id = @id;", connection);
        command.Parameters.AddParameter("@id", SqlDbType.BigInt, mirId);
        return await command.ExecuteScalarAsync(cancellationToken) as long?
            ?? throw new ApiException(StatusCodes.Status404NotFound, "mir_not_found", "Material issue request not found.");
    }

    private static async Task<MirHeader> ReadHeaderAsync(
        SqlConnection connection,
        SqlTransaction? transaction,
        long id,
        bool forUpdate,
        CancellationToken cancellationToken)
    {
        var hint = forUpdate ? " WITH (UPDLOCK, HOLDLOCK)" : string.Empty;
        await using var command = new SqlCommand(
            $"SELECT id, mir_no, project_id, requested_by, status FROM dbo.mirs{hint} WHERE id = @id;",
            connection, transaction);
        command.Parameters.AddParameter("@id", SqlDbType.BigInt, id);
        await using var reader = await command.ExecuteReaderAsync(CommandBehavior.SingleRow, cancellationToken);
        if (!await reader.ReadAsync(cancellationToken))
            throw new ApiException(StatusCodes.Status404NotFound, "mir_not_found", "Material issue request not found.");
        return new MirHeader(reader.GetInt64(0), reader.GetString(1), reader.GetInt64(2), reader.GetInt64(3), reader.GetString(4));
    }

    private static void Validate(CreateMaterialIssueRequest request)
    {
        if (request.BomId <= 0) throw Invalid("A BOM is required.");
        InputValidation.OptionalText(request.Purpose, 20_000, "Purpose");
        if (request.Lines is null || request.Lines.Count == 0) throw Invalid("At least one line is required.");
        if (request.Lines.Count > 200) throw Invalid("A request cannot carry more than 200 lines.");
        var seen = new HashSet<long>();
        foreach (var line in request.Lines)
        {
            if (line.BomLineId <= 0) throw Invalid("Every line needs a BOM line.");
            if (!seen.Add(line.BomLineId)) throw Invalid("A BOM line can appear only once on a request.");
            InputValidation.DecimalRange(line.RequestedQuantity, 0.0001m, 1_000_000_000m, "Requested quantity");
            InputValidation.DecimalScale(line.RequestedQuantity, 4, "Requested quantity");
            InputValidation.OptionalText(line.Location, 100, "Location");
            InputValidation.OptionalText(line.Purpose, 20_000, "Purpose");
        }
    }

    private static ApiException Invalid(string message) =>
        new(StatusCodes.Status400BadRequest, "validation_failed", message);
}
