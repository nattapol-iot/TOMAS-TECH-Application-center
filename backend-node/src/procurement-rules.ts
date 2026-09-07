import sql from "mssql";
import type { Transaction as TransactionType } from "mssql";
import { ApiError } from "./errors.js";

export type BudgetPicture = { approvedBudget: number; actualConsumed: number; openCommitment: number; reservedValue: number;
  siblingOpenPrValue: number; amount: number; forecastBefore: number; forecastAfter: number; remainingAfter: number; withinBudget: boolean };
export type RuleFlag = { code: string; text: string };

export async function budgetPicture(transaction: TransactionType, projectId: number, excludePrId: number | null): Promise<BudgetPicture> {
  const request = new sql.Request(transaction); request.input("project", sql.BigInt, projectId); request.input("exclude", sql.BigInt, excludePrId);
  const row = (await request.query<Record<string, number | string>>(`SELECT
    COALESCE((SELECT t.material_total FROM dbo.projects p INNER JOIN dbo.v_estimate_totals t ON t.estimate_id=p.estimate_id WHERE p.id=@project),0) approved_budget,
    COALESCE((SELECT SUM(-st.qty*st.unit_cost) FROM dbo.stock_txns st WHERE st.project_id=@project AND st.txn_type IN(N'MIR_ISSUE',N'MIR_RETURN')),0) actual_consumed,
    COALESCE((SELECT SUM(CASE WHEN pol.qty>COALESCE(gr.received_qty,0) THEN (pol.qty-COALESCE(gr.received_qty,0))*pol.unit_price ELSE 0 END)
      FROM dbo.mat_po_lines pol INNER JOIN dbo.mat_pos po ON po.id=pol.po_id AND po.deleted_at IS NULL AND po.project_id=@project AND po.status IN(N'Ordered',N'Partially Received')
      OUTER APPLY(SELECT SUM(gl.received_qty) received_qty FROM dbo.grn_lines gl INNER JOIN dbo.grns g ON g.id=gl.grn_id AND g.status=N'Confirmed' WHERE gl.po_line_id=pol.id) gr),0) open_commitment,
    COALESCE((SELECT SUM(r.qty*i.avg_unit_cost) FROM dbo.reservations r INNER JOIN dbo.mat_items i ON i.id=r.item_id WHERE r.project_id=@project AND r.status=N'Active'),0) reserved_value,
    COALESCE((SELECT SUM(prl.line_total) FROM dbo.mat_pr_lines prl INNER JOIN dbo.mat_prs pr ON pr.id=prl.pr_id AND pr.deleted_at IS NULL
      WHERE pr.project_id=@project AND pr.status IN(N'Draft',N'In Approval',N'Approved') AND (@exclude IS NULL OR pr.id<>@exclude)),0) sibling_open_pr,
    COALESCE((SELECT SUM(prl.line_total) FROM dbo.mat_pr_lines prl INNER JOIN dbo.mat_prs pr ON pr.id=prl.pr_id AND pr.deleted_at IS NULL
      WHERE pr.id=@exclude AND pr.status IN(N'Draft',N'In Approval',N'Approved')),0) this_amount;`)).recordset[0]!;
  const approvedBudget = Number(row.approved_budget); const actualConsumed = Number(row.actual_consumed); const openCommitment = Number(row.open_commitment);
  const reservedValue = Number(row.reserved_value); const siblingOpenPrValue = Number(row.sibling_open_pr); const amount = Number(row.this_amount);
  const forecastBefore = actualConsumed + openCommitment + reservedValue + siblingOpenPrValue; const forecastAfter = forecastBefore + amount;
  return { approvedBudget, actualConsumed, openCommitment, reservedValue, siblingOpenPrValue, amount, forecastBefore, forecastAfter,
    remainingAfter: approvedBudget - forecastAfter, withinBudget: forecastAfter <= approvedBudget };
}

export async function procurementRuleFlags(transaction: TransactionType, prId: number): Promise<RuleFlag[]> {
  const request = new sql.Request(transaction); request.input("pr", sql.BigInt, prId);
  const result = await request.query<Record<string, unknown>>(`SELECT pr.project_id,pr.priority,COALESCE((SELECT SUM(l.line_total) FROM dbo.mat_pr_lines l WHERE l.pr_id=pr.id),0) amount
    FROM dbo.mat_prs pr WHERE pr.id=@pr AND pr.deleted_at IS NULL;
    SELECT l.item_code,l.unit_price,l.est_unit_cost,l.price_source,l.is_unplanned,l.qty,COALESCE(vb.available,0) available
    FROM dbo.mat_pr_lines l LEFT JOIN dbo.v_item_balances vb ON vb.item_id=l.item_id WHERE l.pr_id=@pr;`);
  const header = result.recordsets[0]?.[0] as Record<string, unknown> | undefined; if (!header) throw new ApiError(404, "pr_not_found", "Purchase requisition not found.");
  const flags: RuleFlag[] = []; for (const raw of result.recordsets[1] ?? []) { const row = raw as Record<string, unknown>; const item = String(row.item_code);
    const estimate = Number(row.est_unit_cost); if (estimate > 0) { const variance = (Number(row.unit_price) - estimate) / estimate * 100;
      if (variance > 10) flags.push({ code: "price_variance", text: `${item} unit price is ${variance.toFixed(1)}% above the estimate (limit 10%)` }); }
    if (row.is_unplanned) flags.push({ code: "unplanned_item", text: `${item} is not in the approved estimate` });
    if (String(row.price_source).toLowerCase() === "manual") flags.push({ code: "manual_price", text: `${item} uses a manual price` });
    if (Number(row.available) >= Number(row.qty) && Number(row.qty) > 0) flags.push({ code: "stock_available", text: `${item}: available stock covers this line — buying anyway needs a reason` });
  }
  const budget = await budgetPicture(transaction, Number(header.project_id), prId); if (!budget.withinBudget) flags.push({ code: "over_budget", text: "The requisition pushes the project forecast over its approved budget" });
  if (Number(header.amount) > 1_000_000) flags.push({ code: "high_value", text: "Requisition value exceeds 1,000,000 THB" });
  if (header.priority === "Emergency") flags.push({ code: "emergency", text: "Emergency purchase" }); return flags;
}
