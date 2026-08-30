using System.Data;
using IoTTeamCenter.Api.Infrastructure;
using IoTTeamCenter.Api.Models;
using Microsoft.Data.SqlClient;

namespace IoTTeamCenter.Api.Endpoints;

/// <summary>
/// Purchase orders and goods receiving. Receiving is the moment material
/// becomes real: confirming a receipt appends the ledger transactions that
/// every balance in the system is summed from. Accepted quantity lands in
/// stock; damaged and rejected quantity lands in quarantine and never counts
/// as available.
/// </summary>
public static class GoodsReceiptEndpoints
{
    public static void MapGoodsReceiptEndpoints(this IEndpointRouteBuilder app)
    {
        var orders = app.MapGroup("/api/v1/purchase-orders").RequireAuthorization();
        orders.MapGet("/", ListOrdersAsync);
        orders.MapGet("/{id:long}", GetOrderAsync);

        var receipts = app.MapGroup("/api/v1/goods-receipts").RequireAuthorization();
        receipts.MapGet("/", ListAsync);
        receipts.MapGet("/{id:long}", GetAsync);
        receipts.MapPost("/", CreateAsync);
        receipts.MapPost("/{id:long}/confirm", ConfirmAsync);
    }

    /* ---- Purchase orders ------------------------------------------------- */

    private static async Task<IResult> ListOrdersAsync(
        long? projectId,
        bool? openOnly,
        SqlConnectionFactory connections,
        CurrentUserService users,
        CancellationToken cancellationToken)
    {
        await users.DemandPermissionAsync("procurement.read", cancellationToken);
        var actor = await users.GetRequiredAsync(cancellationToken);
        await using var connection = await connections.OpenAsync(cancellationToken);
        await using var command = new SqlCommand("""
            SELECT po.id, po.po_no, po.pr_id, pr.pr_no, po.project_id, p.project_no,
                   po.supplier_id, s.name, po.order_date, po.confirmed_date, po.expected_date, po.status,
                   COALESCE(SUM(pol.qty), 0) AS ordered_qty,
                   COALESCE(SUM(rc.received_qty), 0) AS received_qty,
                   COALESCE(SUM(pol.qty * pol.unit_price), 0) AS value,
                   COALESCE(SUM(CASE WHEN pol.qty > COALESCE(rc.received_qty, 0)
                                     THEN (pol.qty - COALESCE(rc.received_qty, 0)) * pol.unit_price ELSE 0 END), 0) AS open_value,
                   po.row_version
            FROM dbo.mat_pos po
            INNER JOIN dbo.mat_prs pr ON pr.id = po.pr_id
            INNER JOIN dbo.projects p ON p.id = po.project_id
            INNER JOIN dbo.suppliers s ON s.id = po.supplier_id
            LEFT JOIN dbo.mat_po_lines pol ON pol.po_id = po.id
            OUTER APPLY (SELECT SUM(gl.received_qty) AS received_qty
                         FROM dbo.grn_lines gl
                         INNER JOIN dbo.grns g ON g.id = gl.grn_id AND g.status = N'Confirmed'
                         WHERE gl.po_line_id = pol.id) rc
            WHERE po.deleted_at IS NULL
              AND (@project_id IS NULL OR po.project_id = @project_id)
              AND (@open_only = 0 OR po.status IN (N'Ordered', N'Partially Received'))
              AND (@elevated = 1 OR p.manager_id = @actor OR p.lead_engineer_id = @actor
                   OR EXISTS (SELECT 1 FROM dbo.project_members m WHERE m.project_id = p.id AND m.user_id = @actor))
            GROUP BY po.id, po.po_no, po.pr_id, pr.pr_no, po.project_id, p.project_no,
                     po.supplier_id, s.name, po.order_date, po.confirmed_date, po.expected_date, po.status, po.row_version
            ORDER BY po.id DESC;
            """, connection);
        command.Parameters.AddParameter("@project_id", SqlDbType.BigInt, projectId);
        command.Parameters.AddParameter("@open_only", SqlDbType.Bit, openOnly ?? false);
        command.Parameters.AddParameter("@actor", SqlDbType.BigInt, actor.Id);
        command.Parameters.AddParameter("@elevated", SqlDbType.Bit, ProjectScope.IsElevated(actor));

        var items = new List<object>();
        await using var reader = await command.ExecuteReaderAsync(cancellationToken);
        while (await reader.ReadAsync(cancellationToken))
            items.Add(new
            {
                id = reader.GetInt64(0), number = reader.GetString(1),
                purchaseRequisitionId = reader.GetInt64(2), purchaseRequisitionNumber = reader.GetString(3),
                projectId = reader.GetInt64(4), projectNumber = reader.GetString(5),
                supplierId = reader.GetInt64(6), supplierName = reader.GetString(7),
                orderDate = reader.GetFieldValue<DateOnly>(8),
                confirmedDate = reader.IsDBNull(9) ? (DateOnly?)null : reader.GetFieldValue<DateOnly>(9),
                expectedDate = reader.IsDBNull(10) ? (DateOnly?)null : reader.GetFieldValue<DateOnly>(10),
                status = reader.GetString(11),
                orderedQuantity = reader.GetDecimal(12), receivedQuantity = reader.GetDecimal(13),
                value = reader.GetDecimal(14), openValue = reader.GetDecimal(15),
                rowVersion = reader.RowVersionString(16)
            });
        return Results.Ok(items);
    }

    /// <summary>A purchase order with the outstanding quantity per line — what the store needs to receive against.</summary>
    private static async Task<IResult> GetOrderAsync(
        long id,
        SqlConnectionFactory connections,
        CurrentUserService users,
        CancellationToken cancellationToken)
    {
        await users.DemandPermissionAsync("procurement.read", cancellationToken);
        var actor = await users.GetRequiredAsync(cancellationToken);
        await using var connection = await connections.OpenAsync(cancellationToken);
        await using var command = new SqlCommand("""
            SELECT po.id, po.po_no, po.project_id, p.project_no, po.supplier_id, s.name,
                   po.order_date, po.expected_date, po.status, po.row_version, pr.pr_no
            FROM dbo.mat_pos po
            INNER JOIN dbo.projects p ON p.id = po.project_id
            INNER JOIN dbo.suppliers s ON s.id = po.supplier_id
            INNER JOIN dbo.mat_prs pr ON pr.id = po.pr_id
            WHERE po.id = @id AND po.deleted_at IS NULL;

            SELECT pol.id, pol.item_id, COALESCE(i.item_code, prl.item_code), COALESCE(i.part_no, prl.part_no),
                   prl.description, pol.qty, prl.unit, pol.unit_price, pol.bom_line_id,
                   COALESCE(rc.received_qty, 0), COALESCE(i.location, N'')
            FROM dbo.mat_po_lines pol
            INNER JOIN dbo.mat_pr_lines prl ON prl.id = pol.pr_line_id
            LEFT JOIN dbo.mat_items i ON i.id = pol.item_id
            OUTER APPLY (SELECT SUM(gl.received_qty) AS received_qty
                         FROM dbo.grn_lines gl
                         INNER JOIN dbo.grns g ON g.id = gl.grn_id AND g.status = N'Confirmed'
                         WHERE gl.po_line_id = pol.id) rc
            WHERE pol.po_id = @id
            ORDER BY pol.id;
            """, connection);
        command.Parameters.AddParameter("@id", SqlDbType.BigInt, id);

        long projectId;
        object order;
        var lines = new List<object>();
        // The reader must be fully disposed before the scope check reuses the
        // same connection — SqlClient allows one open reader per connection.
        await using (var reader = await command.ExecuteReaderAsync(cancellationToken))
        {
            if (!await reader.ReadAsync(cancellationToken))
                throw new ApiException(StatusCodes.Status404NotFound, "po_not_found", "Purchase order not found.");
            projectId = reader.GetInt64(2);
            order = new
            {
                id = reader.GetInt64(0), number = reader.GetString(1), projectId,
                projectNumber = reader.GetString(3), supplierId = reader.GetInt64(4), supplierName = reader.GetString(5),
                orderDate = reader.GetFieldValue<DateOnly>(6),
                expectedDate = reader.IsDBNull(7) ? (DateOnly?)null : reader.GetFieldValue<DateOnly>(7),
                status = reader.GetString(8), rowVersion = reader.RowVersionString(9),
                purchaseRequisitionNumber = reader.GetString(10)
            };

            await reader.NextResultAsync(cancellationToken);
            while (await reader.ReadAsync(cancellationToken))
            {
                var ordered = reader.GetDecimal(5);
                var received = reader.GetDecimal(9);
                lines.Add(new
                {
                    id = reader.GetInt64(0),
                    itemId = reader.IsDBNull(1) ? (long?)null : reader.GetInt64(1),
                    itemCode = reader.GetString(2), partNumber = reader.GetString(3), description = reader.GetString(4),
                    orderedQuantity = ordered, unit = reader.GetString(6), unitPrice = reader.GetDecimal(7),
                    bomLineId = reader.GetInt64(8),
                    previouslyReceived = received,
                    outstandingQuantity = Math.Max(0m, ordered - received),
                    defaultLocation = reader.GetString(10)
                });
            }
        }

        await ProjectScope.DemandAsync(connection, null, projectId, actor, cancellationToken);
        return Results.Ok(new { purchaseOrder = order, lines });
    }

    /* ---- Goods receipts --------------------------------------------------- */

    private static async Task<IResult> ListAsync(
        long? poId,
        SqlConnectionFactory connections,
        CurrentUserService users,
        CancellationToken cancellationToken)
    {
        await users.DemandPermissionAsync("inventory.read", cancellationToken);
        await using var connection = await connections.OpenAsync(cancellationToken);
        await using var command = new SqlCommand("""
            SELECT g.id, g.grn_no, g.po_id, po.po_no, g.supplier_id, s.name, g.delivery_note,
                   g.received_date, g.status, g.confirmed_by, cu.name, g.confirmed_at, g.created_by, ou.name,
                   COALESCE(SUM(gl.received_qty), 0), COALESCE(SUM(gl.accepted_qty), 0),
                   COALESCE(SUM(gl.damaged_qty + gl.rejected_qty), 0), g.row_version
            FROM dbo.grns g
            INNER JOIN dbo.mat_pos po ON po.id = g.po_id
            INNER JOIN dbo.suppliers s ON s.id = g.supplier_id
            INNER JOIN dbo.users ou ON ou.id = g.created_by
            LEFT JOIN dbo.users cu ON cu.id = g.confirmed_by
            LEFT JOIN dbo.grn_lines gl ON gl.grn_id = g.id
            WHERE (@po_id IS NULL OR g.po_id = @po_id)
            GROUP BY g.id, g.grn_no, g.po_id, po.po_no, g.supplier_id, s.name, g.delivery_note,
                     g.received_date, g.status, g.confirmed_by, cu.name, g.confirmed_at, g.created_by, ou.name, g.row_version
            ORDER BY g.id DESC;
            """, connection);
        command.Parameters.AddParameter("@po_id", SqlDbType.BigInt, poId);

        var items = new List<object>();
        await using var reader = await command.ExecuteReaderAsync(cancellationToken);
        while (await reader.ReadAsync(cancellationToken))
            items.Add(new
            {
                id = reader.GetInt64(0), number = reader.GetString(1),
                purchaseOrderId = reader.GetInt64(2), purchaseOrderNumber = reader.GetString(3),
                supplierId = reader.GetInt64(4), supplierName = reader.GetString(5),
                deliveryNote = reader.GetString(6), receivedDate = reader.GetFieldValue<DateOnly>(7),
                status = reader.GetString(8),
                confirmedById = reader.IsDBNull(9) ? (long?)null : reader.GetInt64(9),
                confirmedByName = reader.IsDBNull(10) ? null : reader.GetString(10),
                confirmedAt = reader.IsDBNull(11) ? (DateTimeOffset?)null : reader.GetFieldValue<DateTimeOffset>(11),
                receivedById = reader.GetInt64(12), receivedByName = reader.GetString(13),
                receivedQuantity = reader.GetDecimal(14), acceptedQuantity = reader.GetDecimal(15),
                heldQuantity = reader.GetDecimal(16), rowVersion = reader.RowVersionString(17)
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
        await using var connection = await connections.OpenAsync(cancellationToken);
        await using var command = new SqlCommand("""
            SELECT g.id, g.grn_no, g.po_id, po.po_no, g.supplier_id, s.name, g.delivery_note,
                   g.received_date, g.status, g.created_by, ou.name, g.confirmed_by, cu.name, g.confirmed_at, g.row_version
            FROM dbo.grns g
            INNER JOIN dbo.mat_pos po ON po.id = g.po_id
            INNER JOIN dbo.suppliers s ON s.id = g.supplier_id
            INNER JOIN dbo.users ou ON ou.id = g.created_by
            LEFT JOIN dbo.users cu ON cu.id = g.confirmed_by
            WHERE g.id = @id;

            SELECT gl.id, gl.po_line_id, gl.item_id, COALESCE(i.item_code, prl.item_code),
                   COALESCE(i.part_no, prl.part_no), prl.description, pol.qty, gl.received_qty,
                   gl.accepted_qty, gl.damaged_qty, gl.rejected_qty, gl.lot_no, gl.serial_no,
                   gl.location, gl.qc_status, gl.project_allocation_id, gl.remark, prl.unit,
                   COALESCE(prev.received_qty, 0)
            FROM dbo.grn_lines gl
            INNER JOIN dbo.mat_po_lines pol ON pol.id = gl.po_line_id
            INNER JOIN dbo.mat_pr_lines prl ON prl.id = pol.pr_line_id
            LEFT JOIN dbo.mat_items i ON i.id = gl.item_id
            OUTER APPLY (SELECT SUM(x.received_qty) AS received_qty
                         FROM dbo.grn_lines x
                         INNER JOIN dbo.grns xg ON xg.id = x.grn_id AND xg.status = N'Confirmed'
                         WHERE x.po_line_id = gl.po_line_id AND x.grn_id <> gl.grn_id) prev
            WHERE gl.grn_id = @id
            ORDER BY gl.id;
            """, connection);
        command.Parameters.AddParameter("@id", SqlDbType.BigInt, id);

        await using var reader = await command.ExecuteReaderAsync(cancellationToken);
        if (!await reader.ReadAsync(cancellationToken))
            throw new ApiException(StatusCodes.Status404NotFound, "grn_not_found", "Goods receipt not found.");
        var receipt = new
        {
            id = reader.GetInt64(0), number = reader.GetString(1),
            purchaseOrderId = reader.GetInt64(2), purchaseOrderNumber = reader.GetString(3),
            supplierId = reader.GetInt64(4), supplierName = reader.GetString(5),
            deliveryNote = reader.GetString(6), receivedDate = reader.GetFieldValue<DateOnly>(7),
            status = reader.GetString(8), receivedById = reader.GetInt64(9), receivedByName = reader.GetString(10),
            confirmedById = reader.IsDBNull(11) ? (long?)null : reader.GetInt64(11),
            confirmedByName = reader.IsDBNull(12) ? null : reader.GetString(12),
            confirmedAt = reader.IsDBNull(13) ? (DateTimeOffset?)null : reader.GetFieldValue<DateTimeOffset>(13),
            rowVersion = reader.RowVersionString(14)
        };

        var lines = new List<object>();
        await reader.NextResultAsync(cancellationToken);
        while (await reader.ReadAsync(cancellationToken))
        {
            var ordered = reader.GetDecimal(6);
            var received = reader.GetDecimal(7);
            var previously = reader.GetDecimal(18);
            lines.Add(new
            {
                id = reader.GetInt64(0), purchaseOrderLineId = reader.GetInt64(1),
                itemId = reader.IsDBNull(2) ? (long?)null : reader.GetInt64(2),
                itemCode = reader.GetString(3), partNumber = reader.GetString(4), description = reader.GetString(5),
                orderedQuantity = ordered, previouslyReceived = previously, receivedQuantity = received,
                acceptedQuantity = reader.GetDecimal(8), damagedQuantity = reader.GetDecimal(9),
                rejectedQuantity = reader.GetDecimal(10),
                lotNumber = reader.IsDBNull(11) ? null : reader.GetString(11),
                serialNumber = reader.IsDBNull(12) ? null : reader.GetString(12),
                location = reader.GetString(13), qcStatus = reader.GetString(14),
                projectAllocationId = reader.IsDBNull(15) ? (long?)null : reader.GetInt64(15),
                remark = reader.IsDBNull(16) ? null : reader.GetString(16),
                unit = reader.GetString(17),
                outstandingAfter = Math.Max(0m, ordered - previously - received)
            });
        }
        return Results.Ok(new { goodsReceipt = receipt, lines });
    }

    /// <summary>
    /// Record a delivery as a draft. Partial deliveries are the normal case, so
    /// a line only has to say how much arrived and how it split between
    /// accepted, damaged and rejected; the database refuses a split that does
    /// not add up.
    /// </summary>
    private static async Task<IResult> CreateAsync(
        CreateGoodsReceiptRequest request,
        SqlConnectionFactory connections,
        CurrentUserService users,
        BusinessClock clock,
        CancellationToken cancellationToken)
    {
        await users.DemandPermissionAsync("inventory.receive", cancellationToken);
        var actor = await users.GetRequiredAsync(cancellationToken);
        Validate(request);

        await using var connection = await connections.OpenAsync(cancellationToken);
        await using var transaction = (SqlTransaction)await connection.BeginTransactionAsync(IsolationLevel.Serializable, cancellationToken);
        try
        {
            long supplierId;
            string poStatus;
            await using (var po = new SqlCommand(
                "SELECT supplier_id, status FROM dbo.mat_pos WITH (UPDLOCK, HOLDLOCK) WHERE id = @po_id AND deleted_at IS NULL;",
                connection, transaction))
            {
                po.Parameters.AddParameter("@po_id", SqlDbType.BigInt, request.PurchaseOrderId);
                await using var reader = await po.ExecuteReaderAsync(CommandBehavior.SingleRow, cancellationToken);
                if (!await reader.ReadAsync(cancellationToken))
                    throw new ApiException(StatusCodes.Status404NotFound, "po_not_found", "Purchase order not found.");
                supplierId = reader.GetInt64(0);
                poStatus = reader.GetString(1);
            }
            if (poStatus is not ("Ordered" or "Partially Received"))
                throw new ApiException(StatusCodes.Status409Conflict, "po_not_receivable",
                    $"Goods cannot be received against a purchase order that is '{poStatus}'.");

            var grnNumber = await BomEndpoints.IssueNumberAsync(connection, transaction, "GRN", clock, cancellationToken);
            long grnId;
            byte[] rowVersion;
            await using (var insert = new SqlCommand("""
                INSERT INTO dbo.grns (grn_no, po_id, supplier_id, delivery_note, received_date, status, created_by)
                OUTPUT inserted.id, inserted.row_version
                VALUES (@grn_no, @po_id, @supplier_id, @delivery_note, @received_date, N'Draft', @actor);
                """, connection, transaction))
            {
                insert.Parameters.AddParameter("@grn_no", SqlDbType.NVarChar, grnNumber, 30);
                insert.Parameters.AddParameter("@po_id", SqlDbType.BigInt, request.PurchaseOrderId);
                insert.Parameters.AddParameter("@supplier_id", SqlDbType.BigInt, supplierId);
                insert.Parameters.AddParameter("@delivery_note", SqlDbType.NVarChar, request.DeliveryNote?.Trim() ?? "", 200);
                insert.Parameters.AddParameter("@received_date", SqlDbType.Date, request.ReceivedDate ?? clock.Today);
                insert.Parameters.AddParameter("@actor", SqlDbType.BigInt, actor.Id);
                await using var reader = await insert.ExecuteReaderAsync(CommandBehavior.SingleRow, cancellationToken);
                await reader.ReadAsync(cancellationToken);
                grnId = reader.GetInt64(0);
                rowVersion = (byte[])reader.GetValue(1);
            }

            foreach (var line in request.Lines)
                await InsertLineAsync(connection, transaction, grnId, request.PurchaseOrderId, line, cancellationToken);

            await MaterialAudit.WriteAsync(
                connection, transaction, actor, "Recorded goods receipt", "GRN", grnId, grnNumber,
                null, new { purchaseOrderId = request.PurchaseOrderId, lines = request.Lines.Count, status = "Draft" },
                cancellationToken, quantity: request.Lines.Sum(line => line.ReceivedQuantity),
                reason: request.DeliveryNote?.Trim());
            await transaction.CommitAsync(cancellationToken);
            return Results.Created($"/api/v1/goods-receipts/{grnId}", new
            {
                id = grnId, number = grnNumber, status = "Draft",
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
        long grnId,
        long poId,
        GoodsReceiptLineRequest line,
        CancellationToken cancellationToken)
    {
        long? itemId;
        string itemCode;
        decimal ordered;
        decimal previouslyReceived;
        string defaultLocation;
        await using (var lookup = new SqlCommand("""
            SELECT pol.item_id, COALESCE(i.item_code, prl.item_code), pol.qty, COALESCE(i.location, N''),
                   COALESCE((SELECT SUM(gl.received_qty)
                             FROM dbo.grn_lines gl
                             INNER JOIN dbo.grns g ON g.id = gl.grn_id AND g.status = N'Confirmed'
                             WHERE gl.po_line_id = pol.id), 0)
            FROM dbo.mat_po_lines pol WITH (UPDLOCK, HOLDLOCK)
            INNER JOIN dbo.mat_pr_lines prl ON prl.id = pol.pr_line_id
            LEFT JOIN dbo.mat_items i ON i.id = pol.item_id
            WHERE pol.id = @po_line_id AND pol.po_id = @po_id;
            """, connection, transaction))
        {
            lookup.Parameters.AddParameter("@po_line_id", SqlDbType.BigInt, line.PurchaseOrderLineId);
            lookup.Parameters.AddParameter("@po_id", SqlDbType.BigInt, poId);
            await using var reader = await lookup.ExecuteReaderAsync(CommandBehavior.SingleRow, cancellationToken);
            if (!await reader.ReadAsync(cancellationToken))
                throw new ApiException(StatusCodes.Status404NotFound, "po_line_not_found",
                    $"PO line {line.PurchaseOrderLineId} does not belong to this purchase order.");
            itemId = reader.IsDBNull(0) ? null : reader.GetInt64(0);
            itemCode = reader.GetString(1);
            ordered = reader.GetDecimal(2);
            defaultLocation = reader.GetString(3);
            previouslyReceived = reader.GetDecimal(4);
        }

        // Receiving more than was ordered is a real event, but it is never
        // silent: it takes an explicit over-receipt flag and a reason.
        if (previouslyReceived + line.ReceivedQuantity > ordered)
        {
            if (!line.AllowOverReceipt)
                throw new ApiException(
                    StatusCodes.Status409Conflict, "over_receipt",
                    $"{itemCode}: {ordered:0.####} ordered and {previouslyReceived:0.####} already received, so {line.ReceivedQuantity:0.####} exceeds the order. Approve it with allowOverReceipt and a remark.",
                    new { ordered, previouslyReceived, requested = line.ReceivedQuantity });
            if (string.IsNullOrWhiteSpace(line.Remark))
                throw new ApiException(StatusCodes.Status400BadRequest, "reason_required",
                    $"{itemCode}: an over-receipt needs a remark.");
        }

        var location = string.IsNullOrWhiteSpace(line.Location) ? defaultLocation : line.Location.Trim();
        if (string.IsNullOrWhiteSpace(location))
            throw new ApiException(StatusCodes.Status400BadRequest, "validation_failed",
                $"{itemCode}: a storage location is required.");

        await using var insert = new SqlCommand("""
            INSERT INTO dbo.grn_lines (
                grn_id, po_id, po_line_id, item_id, received_qty, accepted_qty, damaged_qty, rejected_qty,
                lot_no, serial_no, location, qc_status, project_allocation_id, remark)
            VALUES (
                @grn_id, @po_id, @po_line_id, @item_id, @received, @accepted, @damaged, @rejected,
                @lot_no, @serial_no, @location, @qc_status, @project_id, @remark);
            """, connection, transaction);
        insert.Parameters.AddParameter("@grn_id", SqlDbType.BigInt, grnId);
        insert.Parameters.AddParameter("@po_id", SqlDbType.BigInt, poId);
        insert.Parameters.AddParameter("@po_line_id", SqlDbType.BigInt, line.PurchaseOrderLineId);
        insert.Parameters.AddParameter("@item_id", SqlDbType.BigInt, itemId);
        insert.Parameters.AddParameter("@received", SqlDbType.Decimal, line.ReceivedQuantity, precision: 19, scale: 4);
        insert.Parameters.AddParameter("@accepted", SqlDbType.Decimal, line.AcceptedQuantity, precision: 19, scale: 4);
        insert.Parameters.AddParameter("@damaged", SqlDbType.Decimal, line.DamagedQuantity, precision: 19, scale: 4);
        insert.Parameters.AddParameter("@rejected", SqlDbType.Decimal, line.RejectedQuantity, precision: 19, scale: 4);
        insert.Parameters.AddParameter("@lot_no", SqlDbType.NVarChar, line.LotNumber?.Trim(), 100);
        insert.Parameters.AddParameter("@serial_no", SqlDbType.NVarChar, line.SerialNumber?.Trim(), 200);
        insert.Parameters.AddParameter("@location", SqlDbType.NVarChar, location, 100);
        insert.Parameters.AddParameter("@qc_status", SqlDbType.NVarChar, line.QcStatus?.Trim() ?? "Pending", 30);
        insert.Parameters.AddParameter("@project_id", SqlDbType.BigInt, line.ProjectAllocationId);
        insert.Parameters.AddParameter("@remark", SqlDbType.NVarChar, line.Remark?.Trim(), -1);
        await insert.ExecuteNonQueryAsync(cancellationToken);
    }

    /// <summary>
    /// Confirm the receipt. This is the only place goods enter stock: accepted
    /// quantity is appended to the ledger in the stock bucket, damaged and
    /// rejected quantity in the quarantine bucket, each keyed so a retried
    /// confirmation cannot double-count. The purchase order then reflects
    /// whether anything is still outstanding.
    /// </summary>
    private static async Task<IResult> ConfirmAsync(
        long id,
        WorkflowRequest request,
        SqlConnectionFactory connections,
        CurrentUserService users,
        CancellationToken cancellationToken)
    {
        await users.DemandPermissionAsync("inventory.receive", cancellationToken);
        InputValidation.RequiredText(request.RowVersion, 100, "Goods receipt row version");
        var actor = await users.GetRequiredAsync(cancellationToken);
        await using var connection = await connections.OpenAsync(cancellationToken);
        await using var transaction = (SqlTransaction)await connection.BeginTransactionAsync(IsolationLevel.Serializable, cancellationToken);
        try
        {
            string grnNumber;
            long poId;
            string status;
            DateOnly receivedDate;
            await using (var header = new SqlCommand(
                "SELECT grn_no, po_id, status, received_date FROM dbo.grns WITH (UPDLOCK, HOLDLOCK) WHERE id = @id;",
                connection, transaction))
            {
                header.Parameters.AddParameter("@id", SqlDbType.BigInt, id);
                await using var reader = await header.ExecuteReaderAsync(CommandBehavior.SingleRow, cancellationToken);
                if (!await reader.ReadAsync(cancellationToken))
                    throw new ApiException(StatusCodes.Status404NotFound, "grn_not_found", "Goods receipt not found.");
                grnNumber = reader.GetString(0);
                poId = reader.GetInt64(1);
                status = reader.GetString(2);
                receivedDate = reader.GetFieldValue<DateOnly>(3);
            }
            if (!string.Equals(status, "Draft", StringComparison.Ordinal))
                throw new ApiException(StatusCodes.Status409Conflict, "grn_not_draft", $"Only a draft receipt can be confirmed; this one is '{status}'.");

            long projectId;
            await using (var project = new SqlCommand(
                "SELECT project_id FROM dbo.mat_pos WITH (UPDLOCK, HOLDLOCK) WHERE id = @po_id AND deleted_at IS NULL;",
                connection, transaction))
            {
                project.Parameters.AddParameter("@po_id", SqlDbType.BigInt, poId);
                projectId = (long)(await project.ExecuteScalarAsync(cancellationToken))!;
            }

            var movements = new List<(long LineId, long ItemId, decimal Accepted, decimal Held, string Location, decimal UnitCost)>();
            await using (var lines = new SqlCommand("""
                SELECT gl.id, gl.item_id, gl.accepted_qty, gl.damaged_qty + gl.rejected_qty, gl.location, pol.unit_price
                FROM dbo.grn_lines gl
                INNER JOIN dbo.mat_po_lines pol ON pol.id = gl.po_line_id
                WHERE gl.grn_id = @id
                ORDER BY gl.id;
                """, connection, transaction))
            {
                lines.Parameters.AddParameter("@id", SqlDbType.BigInt, id);
                await using var reader = await lines.ExecuteReaderAsync(cancellationToken);
                while (await reader.ReadAsync(cancellationToken))
                {
                    if (reader.IsDBNull(1)) continue; // A non-stock line records the delivery but moves no balance.
                    movements.Add((reader.GetInt64(0), reader.GetInt64(1), reader.GetDecimal(2),
                        reader.GetDecimal(3), reader.GetString(4), reader.GetDecimal(5)));
                }
            }
            if (movements.Count == 0 && await CountLinesAsync(connection, transaction, id, cancellationToken) == 0)
                throw new ApiException(StatusCodes.Status409Conflict, "grn_empty", "This receipt has no lines to confirm.");

            foreach (var movement in movements)
            {
                if (movement.Accepted > 0)
                    await AppendLedgerAsync(connection, transaction, $"grn:{id}:line:{movement.LineId}:accepted",
                        "GRN_RECEIPT", movement.ItemId, movement.Accepted, "stock", movement.Location,
                        grnNumber, null, movement.UnitCost, actor.Id, "Accepted on delivery", receivedDate, cancellationToken);
                if (movement.Held > 0)
                    await AppendLedgerAsync(connection, transaction, $"grn:{id}:line:{movement.LineId}:quarantine",
                        "GRN_QUARANTINE", movement.ItemId, movement.Held, "quarantine", movement.Location,
                        grnNumber, null, movement.UnitCost, actor.Id, "Damaged or rejected on delivery — held for inspection",
                        receivedDate, cancellationToken);
            }

            byte[] version;
            await using (var confirm = new SqlCommand("""
                UPDATE dbo.grns
                SET status = N'Confirmed', confirmed_by = @actor, confirmed_at = SYSUTCDATETIME()
                OUTPUT inserted.row_version
                WHERE id = @id AND status = N'Draft' AND row_version = @row_version;
                """, connection, transaction))
            {
                confirm.Parameters.AddParameter("@actor", SqlDbType.BigInt, actor.Id);
                confirm.Parameters.AddParameter("@id", SqlDbType.BigInt, id);
                confirm.Parameters.AddParameter("@row_version", SqlDbType.Timestamp, SqlExtensions.ParseRowVersion(request.RowVersion));
                version = await confirm.ExecuteScalarAsync(cancellationToken) as byte[]
                    ?? throw new ApiException(StatusCodes.Status409Conflict, "concurrency_conflict", "This receipt changed. Reload and try again.");
            }

            var poStatus = await RefreshOrderStatusAsync(connection, transaction, poId, actor.Id, cancellationToken);

            await MaterialAudit.WriteAsync(
                connection, transaction, actor, "Confirmed goods receipt", "GRN", id, grnNumber,
                new { status = "Draft" },
                new
                {
                    status = "Confirmed",
                    accepted = movements.Sum(movement => movement.Accepted),
                    quarantined = movements.Sum(movement => movement.Held),
                    purchaseOrderStatus = poStatus
                },
                cancellationToken,
                quantity: movements.Sum(movement => movement.Accepted + movement.Held),
                projectId: projectId, reason: request.Comment?.Trim());
            await transaction.CommitAsync(cancellationToken);
            return Results.Ok(new
            {
                id, status = "Confirmed", purchaseOrderStatus = poStatus,
                accepted = movements.Sum(movement => movement.Accepted),
                quarantined = movements.Sum(movement => movement.Held),
                rowVersion = Convert.ToBase64String(version)
            });
        }
        catch
        {
            await transaction.RollbackAsync(cancellationToken);
            throw;
        }
    }

    /// <summary>Received everything ordered? Then the order is closed; otherwise it stays partially received.</summary>
    private static async Task<string> RefreshOrderStatusAsync(
        SqlConnection connection,
        SqlTransaction transaction,
        long poId,
        long actorId,
        CancellationToken cancellationToken)
    {
        await using var command = new SqlCommand("""
            DECLARE @outstanding decimal(19,4) = (
                SELECT COALESCE(SUM(CASE WHEN pol.qty > COALESCE(rc.received_qty, 0)
                                         THEN pol.qty - COALESCE(rc.received_qty, 0) ELSE 0 END), 0)
                FROM dbo.mat_po_lines pol
                OUTER APPLY (SELECT SUM(gl.received_qty) AS received_qty
                             FROM dbo.grn_lines gl
                             INNER JOIN dbo.grns g ON g.id = gl.grn_id AND g.status = N'Confirmed'
                             WHERE gl.po_line_id = pol.id) rc
                WHERE pol.po_id = @po_id);
            DECLARE @received decimal(19,4) = (
                SELECT COALESCE(SUM(gl.received_qty), 0)
                FROM dbo.grn_lines gl
                INNER JOIN dbo.grns g ON g.id = gl.grn_id AND g.status = N'Confirmed'
                INNER JOIN dbo.mat_po_lines pol ON pol.id = gl.po_line_id
                WHERE pol.po_id = @po_id);
            DECLARE @status nvarchar(30) =
                CASE WHEN @outstanding <= 0 THEN N'Received'
                     WHEN @received > 0 THEN N'Partially Received'
                     ELSE N'Ordered' END;
            UPDATE dbo.mat_pos
            SET status = @status, updated_by = @actor, updated_at = SYSUTCDATETIME()
            WHERE id = @po_id AND deleted_at IS NULL;
            SELECT @status;
            """, connection, transaction);
        command.Parameters.AddParameter("@po_id", SqlDbType.BigInt, poId);
        command.Parameters.AddParameter("@actor", SqlDbType.BigInt, actorId);
        return (string)(await command.ExecuteScalarAsync(cancellationToken))!;
    }

    /// <summary>
    /// The one way stock moves. source_event_key is unique in the database, so
    /// a retried request appends nothing rather than doubling a balance.
    /// </summary>
    internal static async Task AppendLedgerAsync(
        SqlConnection connection,
        SqlTransaction transaction,
        string sourceEventKey,
        string transactionType,
        long itemId,
        decimal quantity,
        string bucket,
        string location,
        string referenceNumber,
        long? projectId,
        decimal unitCost,
        long actorId,
        string note,
        DateOnly occurredOn,
        CancellationToken cancellationToken)
    {
        await using var command = new SqlCommand("""
            IF NOT EXISTS (SELECT 1 FROM dbo.stock_txns WHERE source_event_key = @key)
                INSERT INTO dbo.stock_txns (
                    source_event_key, txn_type, item_id, qty, bucket, location, ref_no,
                    project_id, unit_cost, note, created_by, occurred_at)
                VALUES (
                    @key, @type, @item_id, @qty, @bucket, @location, @ref_no,
                    @project_id, @unit_cost, @note, @actor, @occurred_at);
            """, connection, transaction);
        command.Parameters.AddParameter("@key", SqlDbType.NVarChar, sourceEventKey, 200);
        command.Parameters.AddParameter("@type", SqlDbType.NVarChar, transactionType, 50);
        command.Parameters.AddParameter("@item_id", SqlDbType.BigInt, itemId);
        command.Parameters.AddParameter("@qty", SqlDbType.Decimal, quantity, precision: 19, scale: 4);
        command.Parameters.AddParameter("@bucket", SqlDbType.NVarChar, bucket, 30);
        command.Parameters.AddParameter("@location", SqlDbType.NVarChar, location, 100);
        command.Parameters.AddParameter("@ref_no", SqlDbType.NVarChar, referenceNumber, 100);
        command.Parameters.AddParameter("@project_id", SqlDbType.BigInt, projectId);
        command.Parameters.AddParameter("@unit_cost", SqlDbType.Decimal, unitCost, precision: 19, scale: 4);
        command.Parameters.AddParameter("@note", SqlDbType.NVarChar, note, -1);
        command.Parameters.AddParameter("@actor", SqlDbType.BigInt, actorId);
        command.Parameters.AddParameter("@occurred_at", SqlDbType.DateTimeOffset,
            new DateTimeOffset(occurredOn.ToDateTime(TimeOnly.MinValue), TimeSpan.Zero));
        await command.ExecuteNonQueryAsync(cancellationToken);
    }

    private static async Task<int> CountLinesAsync(
        SqlConnection connection, SqlTransaction transaction, long grnId, CancellationToken cancellationToken)
    {
        await using var command = new SqlCommand("SELECT COUNT(*) FROM dbo.grn_lines WHERE grn_id = @id;", connection, transaction);
        command.Parameters.AddParameter("@id", SqlDbType.BigInt, grnId);
        return (int)(await command.ExecuteScalarAsync(cancellationToken))!;
    }

    private static void Validate(CreateGoodsReceiptRequest request)
    {
        if (request.PurchaseOrderId <= 0) throw Invalid("A purchase order is required.");
        InputValidation.OptionalText(request.DeliveryNote, 200, "Delivery note");
        if (request.Lines is null || request.Lines.Count == 0) throw Invalid("At least one line is required.");
        if (request.Lines.Count > 200) throw Invalid("A receipt cannot carry more than 200 lines.");
        var seen = new HashSet<long>();
        foreach (var line in request.Lines)
        {
            if (line.PurchaseOrderLineId <= 0) throw Invalid("Every line needs a purchase order line.");
            if (!seen.Add(line.PurchaseOrderLineId))
                throw Invalid("A purchase order line can appear only once on a receipt.");
            InputValidation.DecimalRange(line.ReceivedQuantity, 0.0001m, 1_000_000_000m, "Received quantity");
            InputValidation.DecimalRange(line.AcceptedQuantity, 0m, 1_000_000_000m, "Accepted quantity");
            InputValidation.DecimalRange(line.DamagedQuantity, 0m, 1_000_000_000m, "Damaged quantity");
            InputValidation.DecimalRange(line.RejectedQuantity, 0m, 1_000_000_000m, "Rejected quantity");
            foreach (var (value, field) in new[]
                     {
                         (line.ReceivedQuantity, "Received quantity"), (line.AcceptedQuantity, "Accepted quantity"),
                         (line.DamagedQuantity, "Damaged quantity"), (line.RejectedQuantity, "Rejected quantity")
                     })
                InputValidation.DecimalScale(value, 4, field);
            if (line.AcceptedQuantity + line.DamagedQuantity + line.RejectedQuantity != line.ReceivedQuantity)
                throw Invalid("Accepted, damaged and rejected quantity must add up to the received quantity.");
            if (line.QcStatus is not null)
                InputValidation.OneOf(line.QcStatus, "QC status", "Pending", "Passed", "Failed");
            InputValidation.OptionalText(line.LotNumber, 100, "Lot number");
            InputValidation.OptionalText(line.SerialNumber, 200, "Serial number");
            InputValidation.OptionalText(line.Location, 100, "Location");
            InputValidation.OptionalText(line.Remark, 20_000, "Remark");
        }
    }

    private static ApiException Invalid(string message) =>
        new(StatusCodes.Status400BadRequest, "validation_failed", message);
}
