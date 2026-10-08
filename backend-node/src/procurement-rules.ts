import sql from "mssql";
import type { Transaction as TransactionType } from "mssql";
import { ApiError } from "./errors.js";

export type BudgetPicture = { approvedBudget: number; actualConsumed: number; openCommitment: number; reservedValue: number;
  siblingOpenPrValue: number; amount: number; forecastBefore: number; forecastAfter: number; remainingAfter: number; withinBudget: boolean };
/** "manager": the project's PM decides it in the PM step; "management": it adds the Engineering Manager's step. */
export type FlagLevel = "manager" | "management";
export type RuleFlag = { code: string; text: string; level: FlagLevel };
export type ApprovalStepPlan = { name: string; role: string | null; approver: number | null; rule: string | null; status: "Completed" | "Current" | "Pending" };
export type ModuleBudget = { module: string; budget: number; requestedElsewhere: number; thisRequest: number };
export type PrLineKind = "Planned" | "Substitute" | "Unplanned";
export type PrLineInput = { lineType: PrLineKind; bomLineId: number | null; module: string | null; itemCode: string | null; partNumber: string | null;
  description: string | null; brand: string | null; unit: string | null; quantity: number; coveredQuantity: number | null; unitPrice: number;
  priceSource: string; supplierId: number | null; remark: string | null };
export type BomLineForRequest = { id: number; itemId: number | null; itemCode: string; partNumber: string; description: string; brand: string; unit: string;
  estimatedUnitCost: number; module: string; remaining: number };
export type PlannedPrLine = { lineType: PrLineKind; bomLineId: number | null; itemId: number | null; itemCode: string; partNumber: string; description: string;
  brand: string; unit: string; quantity: number; coveredQuantity: number; unitPrice: number; estimatedQuantity: number; estimatedUnitCost: number;
  budgetModule: string; priceSource: string; supplierId: number | null; remark: string | null };

/** Estimate categories bought on a PR: Hardware, Software, Electrical, Mechanical, Robot. Engineering, outsource, travel and other costs are not material. */
export const MATERIAL_CATEGORY_CODES = ["01", "02", "03", "04", "05"] as const;
export const PO_CREATION_STEP = "PO Creation";
export const PURCHASING_REVIEW_STEP = "Purchasing Review";
/** An overrun up to this share of the module's budget is the PM's call; beyond it the Engineering Manager approves too. */
export const MANAGEMENT_OVERRUN_PERCENT = 10;
export const MAX_PR_LINES = 2000;
export const NO_MODULE = "(No module)";
/** PRs whose lines spend a module's budget and cover their BOM lines: everything not rejected or cancelled. */
export const REQUESTING_PR_STATUSES = "N'Draft',N'In Approval',N'Approved',N'Converted to PO'";

export const moduleName = (module: string | null | undefined) => (module ?? "").trim() || NO_MODULE;
const round = (value: number, places: number) => Math.round(value * 10 ** places) / 10 ** places;

/** What a BOM line still needs requested: every PR line that covers it counts, ordered or not; the company ERP holds the stock. */
export function remainingToRequest(line: { required: number; customerSupplied: number; allocated: number; activeReserved: number; netIssued: number; requested: number }): number {
  const covered = Math.max(line.allocated, line.netIssued + line.activeReserved);
  return Math.max(0, round(line.required - covered - line.customerSupplied - line.requested, 4));
}

/** A module whose PRs, this one included, cost more than its estimate: up to 10% over is the PM's decision, beyond that Management's. */
export function moduleBudgetFlags(modules: ModuleBudget[]): RuleFlag[] {
  return modules.flatMap((module) => {
    if (module.thisRequest <= 0) return [];
    const over = round(module.requestedElsewhere + module.thisRequest - module.budget, 2);
    if (over <= 0) return [];
    const percent = module.budget > 0 ? over / module.budget * 100 : Number.POSITIVE_INFINITY;
    const share = Number.isFinite(percent) ? `${percent.toFixed(1)}%` : "no budget";
    return [{ code: "over_module_budget", level: percent > MANAGEMENT_OVERRUN_PERCENT ? "management" as const : "manager" as const,
      text: `${module.module}: ${Math.round(over).toLocaleString("en-US")} THB over budget (${share})` }];
  });
}

/** Two approvals: the project's PM, then Purchasing. Management joins only for a management-level flag, and never as a second step for the same role. */
export function approvalSteps(requesterId: number, projectManagerId: number | null, flags: RuleFlag[]): ApprovalStepPlan[] {
  const describe = (list: RuleFlag[]) => list.length ? list.map((flag) => flag.text).join(" · ").slice(0, 100) : null;
  const management = flags.filter((flag) => flag.level === "management");
  // A PM raising their own PR, or a project without a PM, goes to the Engineering Manager role instead.
  const managerDecides = !projectManagerId || projectManagerId === requesterId;
  const steps: ApprovalStepPlan[] = [
    { name: "Submitted by Requester", role: null, approver: requesterId, rule: null, status: "Completed" },
    { name: "Project Manager Approval", role: managerDecides ? "Engineering Manager" : null, approver: managerDecides ? null : projectManagerId, rule: describe(flags), status: "Current" },
    { name: PURCHASING_REVIEW_STEP, role: "Purchasing", approver: null, rule: null, status: "Pending" },
  ];
  if (management.length && !managerDecides) steps.push({ name: "Management Approval", role: "Engineering Manager", approver: null, rule: describe(management), status: "Pending" });
  steps.push({ name: PO_CREATION_STEP, role: "Purchasing", approver: null, rule: null, status: "Pending" });
  return steps;
}

/**
 * Turns what the engineer wrote into stored lines. A Planned line is the BOM line's own item and may not ask for more than is left;
 * a Substitute is another item bought in place of (part of) a BOM line and spends that line's module; an Unplanned line spends a module
 * of the same BOM. Several lines may cover one BOM line, never more than it still needs.
 */
export function planPrLines(inputs: PrLineInput[], bomLines: Map<number, BomLineForRequest>, modules: string[]): PlannedPrLine[] {
  const modulesByKey = new Map(modules.map((module) => [module.toLocaleLowerCase(), module]));
  const covered = new Map<number, number>();
  const fail = (status: number, code: string, index: number, message: string, details: Record<string, unknown> = {}): never => {
    throw new ApiError(status, code, `Line ${index + 1}: ${message}`, { line: index + 1, ...details });
  };
  return inputs.map((input, index) => {
    const base = { priceSource: input.priceSource, supplierId: input.supplierId, remark: input.remark, unitPrice: input.unitPrice, quantity: input.quantity };
    if (input.lineType === "Unplanned") {
      if (input.bomLineId !== null) fail(400, "validation_failed", index, "an unplanned item has no BOM line.");
      const charged = modulesByKey.get(moduleName(input.module).toLocaleLowerCase());
      if (!charged) fail(400, "module_required", index, "choose which of this BOM's modules pays for the unplanned item.", { module: input.module });
      if (!input.description && !input.partNumber) fail(400, "validation_failed", index, "describe the unplanned item.");
      if (!input.unit) fail(400, "validation_failed", index, "an unplanned item needs a unit.");
      return { ...base, lineType: "Unplanned", bomLineId: null, itemId: null, itemCode: input.itemCode ?? "", partNumber: input.partNumber ?? "",
        description: input.description ?? input.partNumber ?? "", brand: input.brand ?? "", unit: input.unit!, coveredQuantity: 0,
        estimatedQuantity: 0, estimatedUnitCost: 0, budgetModule: charged! };
    }
    const bom = input.bomLineId === null ? undefined : bomLines.get(input.bomLineId);
    if (!bom) return fail(404, "bom_line_not_found", index, `BOM line ${input.bomLineId ?? "(none)"} is not a material line of this BOM.`);
    const left = round(bom.remaining - (covered.get(bom.id) ?? 0), 4);
    const name = bom.itemCode || bom.partNumber || bom.description;
    if (input.lineType === "Planned") {
      if (input.quantity > left) fail(409, "quantity_exceeds_shortage", index, `${name}: ${left} ${bom.unit} is still to request, so ${input.quantity} cannot be requested. Buy another item in its place as a substitute instead.`, { shortage: left, requested: input.quantity });
      covered.set(bom.id, (covered.get(bom.id) ?? 0) + input.quantity);
      return { ...base, lineType: "Planned", bomLineId: bom.id, itemId: bom.itemId, itemCode: bom.itemCode, partNumber: bom.partNumber, description: bom.description,
        brand: bom.brand, unit: bom.unit, coveredQuantity: input.quantity, estimatedQuantity: input.quantity, estimatedUnitCost: bom.estimatedUnitCost, budgetModule: bom.module };
    }
    const replaces = input.coveredQuantity ?? left;
    if (replaces <= 0 || replaces > left) fail(409, "covered_exceeds_remaining", index, `${name}: a substitute can replace up to the ${left} ${bom.unit} still to request.`, { shortage: left, covered: replaces });
    if (!input.description && !input.partNumber && !input.itemCode) fail(400, "validation_failed", index, "describe the substitute item.");
    covered.set(bom.id, (covered.get(bom.id) ?? 0) + replaces);
    return { ...base, lineType: "Substitute", bomLineId: bom.id, itemId: null, itemCode: input.itemCode ?? "", partNumber: input.partNumber ?? "",
      description: input.description ?? input.partNumber ?? input.itemCode ?? "", brand: input.brand ?? "", unit: input.unit ?? bom.unit,
      coveredQuantity: replaces, estimatedQuantity: replaces, estimatedUnitCost: bom.estimatedUnitCost, budgetModule: bom.module };
  });
}

/**
 * Each module of a BOM: its estimate budget, what earlier live PRs already spend in it, and what this PR spends. Only PRs raised before this one
 * count against it, so the PR that takes a module over its budget carries the overrun, not the ones that were within it when raised.
 */
export async function moduleBudgets(transaction: TransactionType, bomId: number, prId: number | null): Promise<ModuleBudget[]> {
  const request = new sql.Request(transaction); request.input("bom", sql.BigInt, bomId); request.input("pr", sql.BigInt, prId); request.input("none", sql.NVarChar(200), NO_MODULE);
  const rows = (await request.query<{ module: string; budget: number | string; elsewhere: number | string; this_request: number | string }>(`WITH budgets AS (
      SELECT COALESCE(NULLIF(LTRIM(RTRIM(ci.module)),N''),@none) module,SUM(bl.qty_required*bl.est_unit_cost) budget
      FROM dbo.bom_lines bl LEFT JOIN dbo.cost_items ci ON ci.id=bl.estimate_line_id
      WHERE bl.bom_id=@bom AND bl.deleted_at IS NULL AND bl.section_code<>N'SVC' GROUP BY COALESCE(NULLIF(LTRIM(RTRIM(ci.module)),N''),@none)),
    requested AS (
      SELECT l.budget_module module,SUM(CASE WHEN l.pr_id=@pr THEN l.line_total ELSE 0 END) this_request,SUM(CASE WHEN l.pr_id=@pr THEN 0 WHEN @pr IS NULL OR l.pr_id<@pr THEN l.line_total ELSE 0 END) elsewhere
      FROM dbo.mat_pr_lines l INNER JOIN dbo.mat_prs pr ON pr.id=l.pr_id AND pr.deleted_at IS NULL AND pr.status IN(${REQUESTING_PR_STATUSES})
      WHERE l.bom_id=@bom GROUP BY l.budget_module)
    SELECT COALESCE(b.module,r.module) module,COALESCE(b.budget,0) budget,COALESCE(r.elsewhere,0) elsewhere,COALESCE(r.this_request,0) this_request
    FROM budgets b FULL OUTER JOIN requested r ON r.module=b.module ORDER BY 1;`)).recordset;
  return rows.map((row) => ({ module: row.module, budget: Number(row.budget), requestedElsewhere: Number(row.elsewhere), thisRequest: Number(row.this_request) }));
}

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

/**
 * What needs more than the PM's approval. A substitute or an unplanned item within its module's budget raises nothing:
 * the module budget is the limit, not the estimate's exact item or unit price.
 */
export async function procurementRuleFlags(transaction: TransactionType, prId: number): Promise<RuleFlag[]> {
  const request = new sql.Request(transaction); request.input("pr", sql.BigInt, prId);
  const header = (await request.query<{ bom_id: number | string; priority: string; amount: number | string }>(`SELECT pr.bom_id,pr.priority,
    COALESCE((SELECT SUM(l.line_total) FROM dbo.mat_pr_lines l WHERE l.pr_id=pr.id),0) amount FROM dbo.mat_prs pr WHERE pr.id=@pr AND pr.deleted_at IS NULL;`)).recordset[0];
  if (!header) throw new ApiError(404, "pr_not_found", "Purchase requisition not found.");
  const flags = moduleBudgetFlags(await moduleBudgets(transaction, Number(header.bom_id), prId));
  if (Number(header.amount) > 1_000_000) flags.push({ code: "high_value", level: "management", text: "Requisition value exceeds 1,000,000 THB" });
  if (header.priority === "Emergency") flags.push({ code: "emergency", level: "management", text: "Emergency purchase" });
  return flags;
}
