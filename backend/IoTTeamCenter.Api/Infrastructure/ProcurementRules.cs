using System.Data;
using Microsoft.Data.SqlClient;

namespace IoTTeamCenter.Api.Infrastructure;

/// <summary>
/// The money and approval arithmetic behind a purchase requisition. Every
/// number here is derived from the database inside the caller's transaction —
/// the client is never trusted with a total, a variance or an approval route.
/// </summary>
public static class ProcurementRules
{
    /// <summary>Thresholds that decide when an extra approver is appended.</summary>
    public const decimal PriceVariancePercentLimit = 10m;
    public const decimal ManagementValueThreshold = 1_000_000m;

    public sealed record BudgetPicture(
        decimal ApprovedBudget,
        decimal ActualConsumed,
        decimal OpenCommitment,
        decimal ReservedValue,
        decimal SiblingOpenPrValue,
        decimal Amount)
    {
        /// <summary>What the project is already on the hook for, before this PR.</summary>
        public decimal ForecastBefore => ActualConsumed + OpenCommitment + ReservedValue + SiblingOpenPrValue;
        public decimal ForecastAfter => ForecastBefore + Amount;
        public decimal RemainingAfter => ApprovedBudget - ForecastAfter;
        public bool WithinBudget => ForecastAfter <= ApprovedBudget;
    }

    /// <summary>
    /// Forecast = consumed + open commitment + reserved stock + other open
    /// requisitions on the same project. A converted or rejected PR adds
    /// nothing: its value already lives in the commitment, or nowhere.
    /// </summary>
    public static async Task<BudgetPicture> GetBudgetPictureAsync(
        SqlConnection connection,
        SqlTransaction? transaction,
        long projectId,
        long? excludePrId,
        CancellationToken cancellationToken)
    {
        await using var command = new SqlCommand("""
            SELECT
                COALESCE((SELECT t.material_total
                          FROM dbo.projects p
                          INNER JOIN dbo.v_estimate_totals t ON t.estimate_id = p.estimate_id
                          WHERE p.id = @project_id), 0) AS approved_budget,
                COALESCE((SELECT SUM(-st.qty * st.unit_cost)
                          FROM dbo.stock_txns st
                          WHERE st.project_id = @project_id
                            AND st.txn_type IN (N'MIR_ISSUE', N'MIR_RETURN')), 0) AS actual_consumed,
                COALESCE((SELECT SUM(CASE WHEN pol.qty > COALESCE(gr.received_qty, 0)
                                          THEN (pol.qty - COALESCE(gr.received_qty, 0)) * pol.unit_price ELSE 0 END)
                          FROM dbo.mat_po_lines pol
                          INNER JOIN dbo.mat_pos po ON po.id = pol.po_id AND po.deleted_at IS NULL
                               AND po.project_id = @project_id
                               AND po.status IN (N'Ordered', N'Partially Received')
                          OUTER APPLY (SELECT SUM(gl.received_qty) AS received_qty
                                       FROM dbo.grn_lines gl
                                       INNER JOIN dbo.grns g ON g.id = gl.grn_id AND g.status = N'Confirmed'
                                       WHERE gl.po_line_id = pol.id) gr), 0) AS open_commitment,
                COALESCE((SELECT SUM(r.qty * i.avg_unit_cost)
                          FROM dbo.reservations r
                          INNER JOIN dbo.mat_items i ON i.id = r.item_id
                          WHERE r.project_id = @project_id AND r.status = N'Active'), 0) AS reserved_value,
                COALESCE((SELECT SUM(prl.line_total)
                          FROM dbo.mat_pr_lines prl
                          INNER JOIN dbo.mat_prs pr ON pr.id = prl.pr_id AND pr.deleted_at IS NULL
                          WHERE pr.project_id = @project_id
                            AND pr.status IN (N'Draft', N'In Approval', N'Approved')
                            AND (@exclude_pr IS NULL OR pr.id <> @exclude_pr)), 0) AS sibling_open_pr,
                COALESCE((SELECT SUM(prl.line_total)
                          FROM dbo.mat_pr_lines prl
                          INNER JOIN dbo.mat_prs pr ON pr.id = prl.pr_id AND pr.deleted_at IS NULL
                          WHERE pr.id = @exclude_pr
                            AND pr.status IN (N'Draft', N'In Approval', N'Approved')), 0) AS this_pr_amount;
            """, connection, transaction);
        command.Parameters.AddParameter("@project_id", SqlDbType.BigInt, projectId);
        command.Parameters.AddParameter("@exclude_pr", SqlDbType.BigInt, excludePrId);
        await using var reader = await command.ExecuteReaderAsync(CommandBehavior.SingleRow, cancellationToken);
        await reader.ReadAsync(cancellationToken);
        return new BudgetPicture(
            reader.GetDecimal(0), reader.GetDecimal(1), reader.GetDecimal(2),
            reader.GetDecimal(3), reader.GetDecimal(4), reader.GetDecimal(5));
    }

    public sealed record RuleFlag(string Code, string Text);

    /// <summary>
    /// Why this requisition needs more than the routine approvers. The list is
    /// recomputed from the database on submit and on every decision, so a
    /// changed price or a stock delivery cannot slip past the route it earned.
    /// </summary>
    public static async Task<IReadOnlyList<RuleFlag>> GetRuleFlagsAsync(
        SqlConnection connection,
        SqlTransaction? transaction,
        long prId,
        CancellationToken cancellationToken)
    {
        var flags = new List<RuleFlag>();
        long projectId;
        string priority;
        decimal amount;

        await using (var header = new SqlCommand("""
            SELECT pr.project_id, pr.priority,
                   COALESCE((SELECT SUM(l.line_total) FROM dbo.mat_pr_lines l WHERE l.pr_id = pr.id), 0)
            FROM dbo.mat_prs pr
            WHERE pr.id = @pr_id AND pr.deleted_at IS NULL;
            """, connection, transaction))
        {
            header.Parameters.AddParameter("@pr_id", SqlDbType.BigInt, prId);
            await using var reader = await header.ExecuteReaderAsync(CommandBehavior.SingleRow, cancellationToken);
            if (!await reader.ReadAsync(cancellationToken))
                throw new ApiException(StatusCodes.Status404NotFound, "pr_not_found", "Purchase requisition not found.");
            projectId = reader.GetInt64(0);
            priority = reader.GetString(1);
            amount = reader.GetDecimal(2);
        }

        await using (var lines = new SqlCommand("""
            SELECT l.item_code, l.unit_price, l.est_unit_cost, l.price_source, l.is_unplanned, l.qty,
                   COALESCE(vb.available, 0) AS available
            FROM dbo.mat_pr_lines l
            LEFT JOIN dbo.v_item_balances vb ON vb.item_id = l.item_id
            WHERE l.pr_id = @pr_id;
            """, connection, transaction))
        {
            lines.Parameters.AddParameter("@pr_id", SqlDbType.BigInt, prId);
            await using var reader = await lines.ExecuteReaderAsync(cancellationToken);
            while (await reader.ReadAsync(cancellationToken))
            {
                var itemCode = reader.GetString(0);
                var unitPrice = reader.GetDecimal(1);
                var estimatedUnitCost = reader.GetDecimal(2);
                var priceSource = reader.GetString(3);
                var unplanned = reader.GetBoolean(4);
                var quantity = reader.GetDecimal(5);
                var available = reader.GetDecimal(6);

                if (estimatedUnitCost > 0)
                {
                    var variance = (unitPrice - estimatedUnitCost) / estimatedUnitCost * 100m;
                    if (variance > PriceVariancePercentLimit)
                        flags.Add(new RuleFlag("price_variance",
                            $"{itemCode} unit price is {variance:0.0}% above the estimate (limit {PriceVariancePercentLimit:0}%)"));
                }
                if (unplanned)
                    flags.Add(new RuleFlag("unplanned_item", $"{itemCode} is not in the approved estimate"));
                if (string.Equals(priceSource, "Manual", StringComparison.OrdinalIgnoreCase))
                    flags.Add(new RuleFlag("manual_price", $"{itemCode} uses a manual price"));
                if (available >= quantity && quantity > 0)
                    flags.Add(new RuleFlag("stock_available",
                        $"{itemCode}: available stock covers this line — buying anyway needs a reason"));
            }
        }

        var budget = await GetBudgetPictureAsync(connection, transaction, projectId, prId, cancellationToken);
        if (!budget.WithinBudget)
            flags.Add(new RuleFlag("over_budget", "The requisition pushes the project forecast over its approved budget"));
        if (amount > ManagementValueThreshold)
            flags.Add(new RuleFlag("high_value", $"Requisition value exceeds {ManagementValueThreshold:N0} THB"));
        if (string.Equals(priority, "Emergency", StringComparison.Ordinal))
            flags.Add(new RuleFlag("emergency", "Emergency purchase"));
        return flags;
    }
}
