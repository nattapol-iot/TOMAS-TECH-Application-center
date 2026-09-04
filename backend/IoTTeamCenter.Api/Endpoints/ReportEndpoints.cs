using System.Data;
using IoTTeamCenter.Api.Infrastructure;
using Microsoft.Data.SqlClient;

namespace IoTTeamCenter.Api.Endpoints;

public static class ReportEndpoints
{
    public static void MapReportEndpoints(this IEndpointRouteBuilder app)
    {
        var reports = app.MapGroup("/api/v1/reports").RequireAuthorization();
        reports.MapGet("/project-cost", GetProjectCostAsync);
        reports.MapGet("/inventory-value", GetInventoryValueAsync);
        reports.MapGet("/supplier-performance", GetSupplierPerformanceAsync);
        reports.MapGet("/pr-cycle-time", GetPrCycleTimeAsync);
    }

    private static async Task<IResult> GetProjectCostAsync(
        long projectId,
        SqlConnectionFactory connections,
        CurrentUserService users,
        CancellationToken cancellationToken)
    {
        if (projectId <= 0) throw Invalid("A project id is required.");
        await users.DemandPermissionAsync("report.read", cancellationToken);
        await users.DemandPermissionAsync("project.read", cancellationToken);
        var actor = await users.GetRequiredAsync(cancellationToken);
        await using var connection = await connections.OpenAsync(cancellationToken);
        await ProjectScope.DemandAsync(connection, null, projectId, actor, cancellationToken);

        await using var command = new SqlCommand("""
            WITH received AS (
                SELECT gl.po_line_id, SUM(gl.received_qty) AS qty
                FROM dbo.grn_lines gl
                INNER JOIN dbo.grns g ON g.id = gl.grn_id AND g.status = N'Confirmed'
                GROUP BY gl.po_line_id
            ), po_value AS (
                SELECT
                    COALESCE(SUM(pol.qty * pol.unit_price), 0) AS committed,
                    COALESCE(SUM(COALESCE(r.qty, 0) * pol.unit_price), 0) AS received_value,
                    COALESCE(SUM(CASE WHEN pol.qty > COALESCE(r.qty, 0)
                        THEN (pol.qty - COALESCE(r.qty, 0)) * pol.unit_price ELSE 0 END), 0) AS open_value
                FROM dbo.mat_po_lines pol
                INNER JOIN dbo.mat_pos po ON po.id = pol.po_id
                    AND po.project_id = @project_id AND po.deleted_at IS NULL AND po.status <> N'Cancelled'
                LEFT JOIN received r ON r.po_line_id = pol.id
            ), actual AS (
                SELECT COALESCE(SUM(-t.qty * t.unit_cost), 0) AS material_consumed
                FROM dbo.stock_txns t
                WHERE t.project_id = @project_id AND t.txn_type IN (N'MIR_ISSUE', N'MIR_RETURN')
            ), reserved AS (
                SELECT COALESCE(SUM(r.qty * i.avg_unit_cost), 0) AS value
                FROM dbo.reservations r
                INNER JOIN dbo.mat_items i ON i.id = r.item_id
                WHERE r.project_id = @project_id AND r.status = N'Active'
            ), open_pr AS (
                SELECT COALESCE(SUM(line.line_total), 0) AS value
                FROM dbo.mat_pr_lines line
                INNER JOIN dbo.mat_prs pr ON pr.id = line.pr_id
                    AND pr.project_id = @project_id AND pr.deleted_at IS NULL
                    AND pr.status IN (N'Draft', N'In Approval', N'Approved')
            )
            SELECT p.id, p.project_no, p.name, p.status, e.estimate_no,
                   totals.material_total, totals.engineering_total, totals.outsource_total,
                   totals.transportation_total, totals.accommodation_total, totals.other_total,
                   totals.contingency_total, totals.total,
                   po.committed, po.received_value, po.open_value,
                   actual.material_consumed, reserved.value, open_pr.value
            FROM dbo.projects p
            INNER JOIN dbo.estimates e ON e.id = p.estimate_id
            INNER JOIN dbo.v_estimate_totals totals ON totals.estimate_id = p.estimate_id
            CROSS JOIN po_value po
            CROSS JOIN actual
            CROSS JOIN reserved
            CROSS JOIN open_pr
            WHERE p.id = @project_id AND p.deleted_at IS NULL;
            """, connection);
        command.Parameters.AddParameter("@project_id", SqlDbType.BigInt, projectId);
        await using var reader = await command.ExecuteReaderAsync(CommandBehavior.SingleRow, cancellationToken);
        if (!await reader.ReadAsync(cancellationToken))
            throw new ApiException(StatusCodes.Status404NotFound, "project_not_found", "Project not found.");

        var materialBudget = reader.GetDecimal(5);
        var estimateTotal = reader.GetDecimal(12);
        var committed = reader.GetDecimal(13);
        var received = reader.GetDecimal(14);
        var openPo = reader.GetDecimal(15);
        var actual = reader.GetDecimal(16);
        var reserved = reader.GetDecimal(17);
        var openPr = reader.GetDecimal(18);
        var forecastExposure = actual + openPo + reserved + openPr;
        return Results.Ok(new
        {
            project = new
            {
                id = reader.GetInt64(0),
                number = reader.GetString(1),
                name = reader.GetString(2),
                status = reader.GetString(3),
                estimateNumber = reader.GetString(4)
            },
            budget = new
            {
                approvedMaterial = materialBudget,
                approvedEngineering = reader.GetDecimal(6),
                approvedOutsource = reader.GetDecimal(7),
                approvedTransportation = reader.GetDecimal(8),
                approvedAccommodation = reader.GetDecimal(9),
                approvedOther = reader.GetDecimal(10),
                contingency = reader.GetDecimal(11),
                approvedEstimateTotal = estimateTotal
            },
            procurement = new
            {
                poCommitted = committed,
                receivedAtPoPrice = received,
                openPoCommitment = openPo,
                openPr,
                reserved
            },
            actual = new { materialConsumed = actual },
            forecastExposure,
            remainingMaterialBudget = materialBudget - actual,
            remainingMaterialBudgetAfterActual = materialBudget - actual,
            remainingMaterialBudgetAfterForecast = materialBudget - forecastExposure,
            accountingScope = "Material actuals are the net MIR issue/return ledger at recorded unit cost.",
            forecastScope = "Forecast exposure is net MIR actual plus open PO, active reservation, and open PR value. Received but unissued stock is reported at PO price separately and is not included because the ledger does not link an issue to a receipt lot."
        });
    }

    private static async Task<IResult> GetInventoryValueAsync(
        DateOnly? asOf,
        int? slowMovingDays,
        string? search,
        bool? slowMovingOnly,
        SqlConnectionFactory connections,
        CurrentUserService users,
        BusinessClock clock,
        CancellationToken cancellationToken)
    {
        await users.DemandPermissionAsync("report.read", cancellationToken);
        await users.DemandPermissionAsync("inventory.read", cancellationToken);
        InputValidation.OptionalText(search, 200, "Search");
        var reportDate = asOf ?? clock.Today;
        var movingDays = slowMovingDays ?? 90;
        if (movingDays is < 1 or > 3650) throw Invalid("Slow-moving days must be between 1 and 3650.");
        if (reportDate < clock.Today.AddYears(-20) || reportDate > clock.Today.AddDays(1))
            throw Invalid("Inventory valuation date is outside the supported range.");

        await using var connection = await connections.OpenAsync(cancellationToken);
        await using var command = new SqlCommand("""
            WITH movement AS (
                SELECT t.item_id,
                       SUM(CASE WHEN t.bucket = N'stock' THEN t.qty ELSE 0 END) AS usable,
                       SUM(CASE WHEN t.bucket = N'quarantine' THEN t.qty ELSE 0 END) AS quarantine,
                       MAX(t.occurred_at) AS last_movement_at,
                       MAX(CASE WHEN t.txn_type IN (N'MIR_ISSUE', N'SUPPLIER_RETURN', N'TRANSFER_OUT')
                                THEN t.occurred_at END) AS last_outbound_at
                FROM dbo.stock_txns t
                WHERE t.occurred_at < DATEADD(day, 1, CONVERT(datetime2, @as_of))
                GROUP BY t.item_id
            )
            SELECT i.id, i.item_code, i.part_no, i.description, i.brand, i.unit, i.location,
                   CONVERT(decimal(19,4), COALESCE(m.usable, 0)),
                   CONVERT(decimal(19,4), COALESCE(m.quarantine, 0)),
                   i.avg_unit_cost,
                   CONVERT(decimal(19,4), COALESCE(m.usable, 0) * i.avg_unit_cost),
                   CONVERT(decimal(19,4), COALESCE(m.quarantine, 0) * i.avg_unit_cost),
                   m.last_movement_at, m.last_outbound_at,
                   DATEDIFF(day, CONVERT(date, COALESCE(m.last_outbound_at, m.last_movement_at, i.created_at)), @as_of)
            FROM dbo.mat_items i
            LEFT JOIN movement m ON m.item_id = i.id
            WHERE i.is_active = 1 AND i.deleted_at IS NULL
              AND i.created_at < DATEADD(day, 1, CONVERT(datetimeoffset, @as_of))
              AND (@search IS NULL OR i.item_code LIKE N'%' + @search + N'%'
                   OR i.part_no LIKE N'%' + @search + N'%'
                   OR i.description LIKE N'%' + @search + N'%')
              AND (@slow_only = 0 OR (
                  COALESCE(m.usable, 0) + COALESCE(m.quarantine, 0) > 0
                  AND DATEDIFF(day, CONVERT(date, COALESCE(m.last_outbound_at, m.last_movement_at, i.created_at)), @as_of) >= @slow_days))
            ORDER BY 15 DESC, i.item_code;
            """, connection);
        command.Parameters.AddParameter("@as_of", SqlDbType.Date, reportDate);
        command.Parameters.AddParameter("@search", SqlDbType.NVarChar, string.IsNullOrWhiteSpace(search) ? null : search.Trim(), 200);
        command.Parameters.AddParameter("@slow_only", SqlDbType.Bit, slowMovingOnly ?? false);
        command.Parameters.AddParameter("@slow_days", SqlDbType.Int, movingDays);

        var items = new List<InventoryValueRow>();
        await using var reader = await command.ExecuteReaderAsync(cancellationToken);
        while (await reader.ReadAsync(cancellationToken))
        {
            var inactiveDays = reader.GetInt32(14);
            items.Add(new InventoryValueRow(
                reader.GetInt64(0), reader.GetString(1), reader.GetString(2), reader.GetString(3), reader.GetString(4),
                reader.GetString(5), reader.GetString(6), reader.GetDecimal(7), reader.GetDecimal(8), reader.GetDecimal(9),
                reader.GetDecimal(10), reader.GetDecimal(11),
                reader.IsDBNull(12) ? null : reader.GetFieldValue<DateTimeOffset>(12),
                reader.IsDBNull(13) ? null : reader.GetFieldValue<DateTimeOffset>(13),
                inactiveDays, inactiveDays >= movingDays && reader.GetDecimal(7) + reader.GetDecimal(8) > 0));
        }

        return Results.Ok(new
        {
            asOf = reportDate,
            slowMovingDays = movingDays,
            valuationMethod = "current_average_unit_cost",
            summary = new
            {
                itemCount = items.Count,
                usableValue = items.Sum(item => item.UsableValue),
                quarantineValue = items.Sum(item => item.QuarantineValue),
                totalValue = items.Sum(item => item.UsableValue + item.QuarantineValue),
                slowMovingItemCount = items.Count(item => item.IsSlowMoving),
                slowMovingValue = items.Where(item => item.IsSlowMoving).Sum(item => item.UsableValue + item.QuarantineValue)
            },
            items
        });
    }

    private static async Task<IResult> GetSupplierPerformanceAsync(
        DateOnly? from,
        DateOnly? to,
        long? supplierId,
        SqlConnectionFactory connections,
        CurrentUserService users,
        BusinessClock clock,
        CancellationToken cancellationToken)
    {
        await users.DemandPermissionAsync("report.read", cancellationToken);
        await users.DemandPermissionAsync("procurement.read", cancellationToken);
        var actor = await users.GetRequiredAsync(cancellationToken);
        var end = to ?? clock.Today;
        var start = from ?? end.AddYears(-1);
        ValidateDateRange(start, end);
        if (supplierId is <= 0) throw Invalid("Supplier id must be positive.");

        await using var connection = await connections.OpenAsync(cancellationToken);
        await using var command = new SqlCommand("""
            WITH scoped_po AS (
                SELECT po.id, po.supplier_id, po.order_date, po.expected_date
                FROM dbo.mat_pos po
                INNER JOIN dbo.projects p ON p.id = po.project_id
                WHERE po.deleted_at IS NULL AND po.status <> N'Cancelled'
                  AND po.order_date >= @from AND po.order_date <= @to
                  AND (@supplier_id IS NULL OR po.supplier_id = @supplier_id)
                  AND (@elevated = 1 OR p.manager_id = @actor OR p.lead_engineer_id = @actor
                       OR EXISTS (SELECT 1 FROM dbo.project_members pm WHERE pm.project_id = p.id AND pm.user_id = @actor))
            ), po_lines AS (
                SELECT po.id AS po_id, po.supplier_id, po.order_date, po.expected_date,
                       line.id AS po_line_id, line.qty AS ordered_qty, line.unit_price
                FROM scoped_po po
                INNER JOIN dbo.mat_po_lines line ON line.po_id = po.id
            ), receipt_by_line_day AS (
                SELECT ordered.po_line_id, ordered.po_id, g.received_date,
                       SUM(line.received_qty) AS received_qty
                FROM po_lines ordered
                INNER JOIN dbo.grn_lines line ON line.po_line_id = ordered.po_line_id
                INNER JOIN dbo.grns g ON g.id = line.grn_id AND g.status = N'Confirmed'
                GROUP BY ordered.po_line_id, ordered.po_id, g.received_date
            ), cumulative_line_receipt AS (
                SELECT po_line_id, po_id, received_date,
                       SUM(received_qty) OVER (
                           PARTITION BY po_line_id ORDER BY received_date ROWS UNBOUNDED PRECEDING
                       ) AS cumulative_qty
                FROM receipt_by_line_day
            ), line_completion AS (
                SELECT cumulative.po_line_id, cumulative.po_id,
                       MIN(cumulative.received_date) AS completed_date
                FROM cumulative_line_receipt cumulative
                INNER JOIN po_lines ordered ON ordered.po_line_id = cumulative.po_line_id
                    AND cumulative.cumulative_qty >= ordered.ordered_qty
                GROUP BY cumulative.po_line_id, cumulative.po_id
            ), receipt_line_total AS (
                SELECT ordered.po_line_id,
                       SUM(line.received_qty) AS received_qty, SUM(line.accepted_qty) AS accepted_qty,
                       SUM(line.damaged_qty) AS damaged_qty, SUM(line.rejected_qty) AS rejected_qty,
                       SUM(line.received_qty * ordered.unit_price) AS received_value
                FROM po_lines ordered
                INNER JOIN dbo.grn_lines line ON line.po_line_id = ordered.po_line_id
                INNER JOIN dbo.grns g ON g.id = line.grn_id AND g.status = N'Confirmed'
                GROUP BY ordered.po_line_id
            ), per_po AS (
                SELECT ordered.po_id AS id, ordered.supplier_id, ordered.order_date, ordered.expected_date,
                       SUM(ordered.ordered_qty) AS ordered_qty,
                       SUM(ordered.ordered_qty * ordered.unit_price) AS ordered_value,
                       SUM(COALESCE(receipt.received_qty, 0)) AS received_qty,
                       SUM(COALESCE(receipt.accepted_qty, 0)) AS accepted_qty,
                       SUM(COALESCE(receipt.damaged_qty, 0)) AS damaged_qty,
                       SUM(COALESCE(receipt.rejected_qty, 0)) AS rejected_qty,
                       SUM(COALESCE(receipt.received_value, 0)) AS received_value,
                       SUM(CASE WHEN ordered.ordered_qty > COALESCE(receipt.received_qty, 0)
                           THEN (ordered.ordered_qty - COALESCE(receipt.received_qty, 0)) * ordered.unit_price
                           ELSE 0 END) AS open_value,
                       CASE WHEN COUNT_BIG(*) = COUNT_BIG(completion.completed_date)
                            THEN MAX(completion.completed_date) END AS completed_date
                FROM po_lines ordered
                LEFT JOIN receipt_line_total receipt ON receipt.po_line_id = ordered.po_line_id
                LEFT JOIN line_completion completion ON completion.po_line_id = ordered.po_line_id
                GROUP BY ordered.po_id, ordered.supplier_id, ordered.order_date, ordered.expected_date
            )
            SELECT s.id, s.code, s.name,
                   COUNT_BIG(*) AS po_count,
                   SUM(p.ordered_qty), SUM(p.ordered_value), SUM(p.received_qty), SUM(p.accepted_qty),
                   SUM(p.damaged_qty + p.rejected_qty), SUM(p.received_value), SUM(p.open_value),
                   SUM(CASE WHEN p.completed_date IS NOT NULL THEN 1 ELSE 0 END),
                   SUM(CASE WHEN p.completed_date IS NOT NULL AND p.expected_date IS NOT NULL THEN 1 ELSE 0 END),
                   SUM(CASE WHEN p.completed_date <= p.expected_date THEN 1 ELSE 0 END),
                   CONVERT(decimal(9,2), 100.0 * SUM(p.received_qty) / NULLIF(SUM(p.ordered_qty), 0)),
                   CONVERT(decimal(9,2), 100.0 * SUM(p.accepted_qty) / NULLIF(SUM(p.ordered_qty), 0)),
                   CONVERT(decimal(9,2), 100.0 * SUM(p.damaged_qty + p.rejected_qty) / NULLIF(SUM(p.received_qty), 0)),
                   CONVERT(decimal(9,2), 100.0 * SUM(CASE WHEN p.completed_date <= p.expected_date THEN 1 ELSE 0 END)
                       / NULLIF(SUM(CASE WHEN p.completed_date IS NOT NULL AND p.expected_date IS NOT NULL THEN 1 ELSE 0 END), 0)),
                   AVG(CASE WHEN p.completed_date IS NOT NULL THEN CONVERT(decimal(19,4), DATEDIFF(day, p.order_date, p.completed_date)) END)
            FROM per_po p
            INNER JOIN dbo.suppliers s ON s.id = p.supplier_id
            GROUP BY s.id, s.code, s.name
            ORDER BY s.name, s.id;
            """, connection);
        AddReportRangeParameters(command, start, end, actor.Id, ProjectScope.IsElevated(actor));
        command.Parameters.AddParameter("@supplier_id", SqlDbType.BigInt, supplierId);

        var suppliers = new List<SupplierPerformanceRow>();
        await using var reader = await command.ExecuteReaderAsync(cancellationToken);
        while (await reader.ReadAsync(cancellationToken))
        {
            suppliers.Add(new SupplierPerformanceRow(
                reader.GetInt64(0), reader.GetString(1), reader.GetString(2), reader.GetInt64(3),
                reader.GetDecimal(4), reader.GetDecimal(5), reader.GetDecimal(6), reader.GetDecimal(7),
                reader.GetDecimal(8), reader.GetDecimal(9), reader.GetDecimal(10),
                reader.GetInt32(11), reader.GetInt32(12), reader.GetInt32(13),
                ReadDecimal(reader, 14), ReadDecimal(reader, 15), ReadDecimal(reader, 16), ReadDecimal(reader, 17), ReadDecimal(reader, 18)));
        }
        return Results.Ok(new { from = start, to = end, suppliers });
    }

    private static async Task<IResult> GetPrCycleTimeAsync(
        DateOnly? from,
        DateOnly? to,
        long? projectId,
        SqlConnectionFactory connections,
        CurrentUserService users,
        BusinessClock clock,
        CancellationToken cancellationToken)
    {
        await users.DemandPermissionAsync("report.read", cancellationToken);
        await users.DemandPermissionAsync("procurement.read", cancellationToken);
        var actor = await users.GetRequiredAsync(cancellationToken);
        var end = to ?? clock.Today;
        var start = from ?? end.AddYears(-1);
        ValidateDateRange(start, end);
        if (projectId is <= 0) throw Invalid("Project id must be positive.");

        await using var connection = await connections.OpenAsync(cancellationToken);
        if (projectId is long scopedProject)
            await ProjectScope.DemandAsync(connection, null, scopedProject, actor, cancellationToken);

        await using var command = new SqlCommand("""
            WITH scoped_pr AS (
                SELECT pr.id, pr.created_at, pr.submitted_at, pr.project_id, pr.priority, pr.status
                FROM dbo.mat_prs pr
                INNER JOIN dbo.projects p ON p.id = pr.project_id
                WHERE pr.deleted_at IS NULL AND pr.submitted_at >= @from
                  AND pr.submitted_at < DATEADD(day, 1, CONVERT(datetime2, @to))
                  AND (@project_id IS NULL OR pr.project_id = @project_id)
                  AND (@elevated = 1 OR p.manager_id = @actor OR p.lead_engineer_id = @actor
                       OR EXISTS (SELECT 1 FROM dbo.project_members pm WHERE pm.project_id = p.id AND pm.user_id = @actor))
            ), ordered_steps AS (
                SELECT step.pr_id, step.sequence, step.name, step.decision, step.acted_at,
                       LAG(step.acted_at) OVER (PARTITION BY step.pr_id ORDER BY step.sequence) AS started_at
                FROM dbo.mat_pr_approval_steps step
                INNER JOIN scoped_pr pr ON pr.id = step.pr_id
                WHERE step.status = N'Completed' AND step.acted_at IS NOT NULL
            ), elapsed AS (
                SELECT pr_id, sequence, name,
                       CONVERT(decimal(19,4), DATEDIFF_BIG(second, started_at, acted_at) / 3600.0) AS hours
                FROM ordered_steps WHERE started_at IS NOT NULL
            )
            SELECT name, COUNT_BIG(*), AVG(hours), MIN(hours), MAX(hours), MIN(sequence)
            FROM elapsed
            GROUP BY name
            ORDER BY MIN(sequence);

            WITH scoped_pr AS (
                SELECT pr.id, pr.created_at, pr.submitted_at, pr.project_id, pr.status
                FROM dbo.mat_prs pr
                INNER JOIN dbo.projects p ON p.id = pr.project_id
                WHERE pr.deleted_at IS NULL AND pr.submitted_at >= @from
                  AND pr.submitted_at < DATEADD(day, 1, CONVERT(datetime2, @to))
                  AND (@project_id IS NULL OR pr.project_id = @project_id)
                  AND (@elevated = 1 OR p.manager_id = @actor OR p.lead_engineer_id = @actor
                       OR EXISTS (SELECT 1 FROM dbo.project_members pm WHERE pm.project_id = p.id AND pm.user_id = @actor))
            ), final_approval AS (
                SELECT step.pr_id, MAX(step.acted_at) AS approved_at
                FROM dbo.mat_pr_approval_steps step
                INNER JOIN scoped_pr pr ON pr.id = step.pr_id
                WHERE pr.status IN (N'Approved', N'Converted to PO')
                  AND step.status = N'Completed' AND step.decision = N'Approve'
                  AND step.name NOT IN (N'Submitted by Requester', N'PO Creation')
                GROUP BY step.pr_id
            ), first_po AS (
                SELECT po.pr_id, MIN(po.created_at) AS converted_at
                FROM dbo.mat_pos po
                INNER JOIN scoped_pr pr ON pr.id = po.pr_id
                WHERE po.deleted_at IS NULL
                GROUP BY po.pr_id
            )
            SELECT COUNT_BIG(*),
                   AVG(CONVERT(decimal(19,4), DATEDIFF_BIG(second, pr.created_at, pr.submitted_at) / 3600.0)),
                   AVG(CASE WHEN approval.approved_at IS NOT NULL THEN CONVERT(decimal(19,4), DATEDIFF_BIG(second, pr.submitted_at, approval.approved_at) / 3600.0) END),
                   AVG(CASE WHEN po.converted_at IS NOT NULL AND approval.approved_at IS NOT NULL THEN CONVERT(decimal(19,4), DATEDIFF_BIG(second, approval.approved_at, po.converted_at) / 3600.0) END),
                   AVG(CASE WHEN po.converted_at IS NOT NULL THEN CONVERT(decimal(19,4), DATEDIFF_BIG(second, pr.created_at, po.converted_at) / 3600.0) END)
            FROM scoped_pr pr
            LEFT JOIN final_approval approval ON approval.pr_id = pr.id
            LEFT JOIN first_po po ON po.pr_id = pr.id;

            WITH scoped_pr AS (
                SELECT pr.status
                FROM dbo.mat_prs pr
                INNER JOIN dbo.projects p ON p.id = pr.project_id
                WHERE pr.deleted_at IS NULL AND pr.submitted_at >= @from
                  AND pr.submitted_at < DATEADD(day, 1, CONVERT(datetime2, @to))
                  AND (@project_id IS NULL OR pr.project_id = @project_id)
                  AND (@elevated = 1 OR p.manager_id = @actor OR p.lead_engineer_id = @actor
                       OR EXISTS (SELECT 1 FROM dbo.project_members pm WHERE pm.project_id = p.id AND pm.user_id = @actor))
            )
            SELECT status, COUNT_BIG(*) FROM scoped_pr GROUP BY status ORDER BY status;
            """, connection);
        AddReportRangeParameters(command, start, end, actor.Id, ProjectScope.IsElevated(actor));
        command.Parameters.AddParameter("@project_id", SqlDbType.BigInt, projectId);

        var stages = new List<object>();
        var statusCounts = new Dictionary<string, long>(StringComparer.Ordinal);
        long prCount;
        decimal? createdToSubmitted;
        decimal? submittedToApproved;
        decimal? approvedToPo;
        decimal? createdToPo;
        await using (var reader = await command.ExecuteReaderAsync(cancellationToken))
        {
            while (await reader.ReadAsync(cancellationToken))
            {
                stages.Add(new
                {
                    stage = reader.GetString(0),
                    completedCount = reader.GetInt64(1),
                    averageHours = ReadDecimal(reader, 2),
                    minimumHours = ReadDecimal(reader, 3),
                    maximumHours = ReadDecimal(reader, 4)
                });
            }
            await reader.NextResultAsync(cancellationToken);
            await reader.ReadAsync(cancellationToken);
            prCount = reader.GetInt64(0);
            createdToSubmitted = ReadDecimal(reader, 1);
            submittedToApproved = ReadDecimal(reader, 2);
            approvedToPo = ReadDecimal(reader, 3);
            createdToPo = ReadDecimal(reader, 4);
            await reader.NextResultAsync(cancellationToken);
            while (await reader.ReadAsync(cancellationToken)) statusCounts[reader.GetString(0)] = reader.GetInt64(1);
        }

        return Results.Ok(new
        {
            from = start,
            to = end,
            projectId,
            stages,
            lifecycle = new
            {
                prCount,
                averageCreatedToSubmittedHours = createdToSubmitted,
                averageSubmittedToFinalApprovalHours = submittedToApproved,
                averageApprovalToFirstPurchaseOrderHours = approvedToPo,
                averageCreatedToFirstPurchaseOrderHours = createdToPo
            },
            statusCounts,
            durationBasis = "elapsed_utc_hours"
        });
    }

    private static void AddReportRangeParameters(SqlCommand command, DateOnly start, DateOnly end, long actorId, bool elevated)
    {
        command.Parameters.AddParameter("@from", SqlDbType.Date, start);
        command.Parameters.AddParameter("@to", SqlDbType.Date, end);
        command.Parameters.AddParameter("@actor", SqlDbType.BigInt, actorId);
        command.Parameters.AddParameter("@elevated", SqlDbType.Bit, elevated);
    }

    private static void ValidateDateRange(DateOnly start, DateOnly end)
    {
        if (end < start) throw Invalid("The report end date cannot be before its start date.");
        if (end > start.AddYears(10)) throw Invalid("A report range cannot exceed ten years.");
    }

    private static decimal? ReadDecimal(SqlDataReader reader, int ordinal) =>
        reader.IsDBNull(ordinal) ? null : reader.GetDecimal(ordinal);

    private static ApiException Invalid(string message) =>
        new(StatusCodes.Status400BadRequest, "validation_failed", message);

    private sealed record InventoryValueRow(
        long Id,
        string ItemCode,
        string PartNumber,
        string Description,
        string Brand,
        string Unit,
        string Location,
        decimal Usable,
        decimal Quarantine,
        decimal AverageUnitCost,
        decimal UsableValue,
        decimal QuarantineValue,
        DateTimeOffset? LastMovementAt,
        DateTimeOffset? LastOutboundAt,
        int InactiveDays,
        bool IsSlowMoving);

    private sealed record SupplierPerformanceRow(
        long SupplierId,
        string SupplierCode,
        string SupplierName,
        long PurchaseOrderCount,
        decimal OrderedQuantity,
        decimal OrderedValue,
        decimal ReceivedQuantity,
        decimal AcceptedQuantity,
        decimal HeldOrRejectedQuantity,
        decimal ReceivedValue,
        decimal OpenValue,
        int FullyReceivedPurchaseOrderCount,
        int CompletedWithExpectedDateCount,
        int OnTimeCompletedPurchaseOrderCount,
        decimal? FillRatePercent,
        decimal? AcceptedFillRatePercent,
        decimal? DefectRatePercent,
        decimal? OnTimeRatePercent,
        decimal? AverageCompletionLeadDays);
}
