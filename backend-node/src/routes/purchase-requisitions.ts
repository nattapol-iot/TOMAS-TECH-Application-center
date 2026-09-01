import type { FastifyInstance } from "fastify";
import sql from "mssql/msnodesqlv8.js";
import type { Transaction as TransactionType } from "mssql";
import type { AppConfig } from "../config.js";
import type { Database } from "../db.js";
import { issueDocumentNumber } from "../document-number.js";
import { ApiError } from "../errors.js";
import { bodyObject, booleanQuery, oneOf, optionalBodyText, optionalPositiveLong, optionalText, parseDateOnly, parseRowVersion, positiveLong, requiredInteger, requiredText } from "../http.js";
import { insertMaterialAudit } from "../material-audit.js";
import { budgetPicture, procurementRuleFlags, type RuleFlag } from "../procurement-rules.js";
import { demandProjectScope, isProjectElevated } from "../project-scope.js";
import type { CurrentUser } from "../types.js";
import type { CurrentUserService } from "../users.js";

const priceSources = ["Price Library", "Supplier Quotation", "Previous Purchase", "Manual"];
const poCreationStep = "PO Creation";
type PrHeader = { id: number | string; pr_no: string; project_id: number | string; bom_id: number | string; requested_by: number | string; status: string; priority: string; required_date: Date | string };
type PrLineInput = { bomLineId: number; supplierId: number; quantity: number; unitPrice: number; priceSource: string; isUnplanned: boolean; buyDespiteStock: boolean; remark: string | null; itemCodeOverride: string | null };

function todayIn(timeZone: string): string { const p = new Intl.DateTimeFormat("en-GB", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date());
  const v = Object.fromEntries(p.map((x) => [x.type, x.value])); return `${v.year}-${v.month}-${v.day}`; }
function decimal(value: unknown, minimum: number, maximum: number, label: string): number { if (typeof value !== "number" || !Number.isFinite(value) || value < minimum || value > maximum) throw new ApiError(400, "validation_failed", `${label} is outside the supported range.`);
  if (!value.toString().toLowerCase().includes("e") && (value.toString().split(".")[1]?.length ?? 0) > 4) throw new ApiError(400, "validation_failed", `${label} cannot have more than 4 decimal places.`); return value; }
async function readHeader(transaction: TransactionType, id: number): Promise<PrHeader> { const request = new sql.Request(transaction); request.input("id", sql.BigInt, id);
  const row = (await request.query<PrHeader>(`SELECT id,pr_no,project_id,bom_id,requested_by,status,priority,required_date FROM dbo.mat_prs WITH (UPDLOCK,HOLDLOCK) WHERE id=@id AND deleted_at IS NULL;`)).recordset[0];
  if (!row) throw new ApiError(404, "pr_not_found", "Purchase requisition not found."); return row; }

function parseLines(value: unknown): PrLineInput[] { if (!Array.isArray(value) || !value.length) throw new ApiError(400, "validation_failed", "At least one line is required.");
  if (value.length > 200) throw new ApiError(400, "validation_failed", "A requisition cannot carry more than 200 lines."); return value.map((raw) => { const body = bodyObject(raw);
    return { bomLineId: requiredInteger(body.bomLineId, "BOM line", 1), supplierId: requiredInteger(body.supplierId, "Supplier", 1),
      quantity: decimal(body.quantity, 0.0001, 1_000_000_000, "Quantity"), unitPrice: decimal(body.unitPrice, 0, 1_000_000_000, "Unit price"),
      priceSource: oneOf(requiredText(body.priceSource, 100, "Price source"), "Price source", priceSources), isUnplanned: body.isUnplanned === true,
      buyDespiteStock: body.buyDespiteStock === true, remark: optionalBodyText(body.remark, 20_000, "Remark"), itemCodeOverride: optionalBodyText(body.itemCodeOverride, 100, "Item code") }; }); }

async function insertLine(transaction: TransactionType, prId: number, bomId: number, line: PrLineInput): Promise<void> {
  const lookup = new sql.Request(transaction); lookup.input("line", sql.BigInt, line.bomLineId); lookup.input("bom", sql.BigInt, bomId);
  const row = (await lookup.query<Record<string, unknown>>(`SELECT l.item_id,COALESCE(i.item_code,ci.item_code,N'') item_code,COALESCE(i.part_no,N'') part_no,l.description,l.unit,
    l.qty_required,l.customer_supplied_qty,l.est_unit_cost,l.non_stock,
    COALESCE((SELECT SUM(r.qty) FROM dbo.reservations r WITH (UPDLOCK,HOLDLOCK) WHERE r.bom_line_id=l.id AND r.status IN(N'Active',N'Consumed')),0) allocated,
    COALESCE((SELECT SUM(r.qty) FROM dbo.reservations r WHERE r.bom_line_id=l.id AND r.status=N'Active'),0) active_reserved,
    COALESCE((SELECT SUM(ml.issued_qty-ml.returned_qty) FROM dbo.mir_lines ml INNER JOIN dbo.mirs m ON m.id=ml.mir_id AND m.status IN(N'Issued',N'Received',N'Completed') WHERE ml.bom_line_id=l.id),0) net_issued,
    COALESCE((SELECT SUM(CASE WHEN pol.qty>COALESCE(gr.received_qty,0) THEN pol.qty-COALESCE(gr.received_qty,0) ELSE 0 END) FROM dbo.mat_po_lines pol
      INNER JOIN dbo.mat_pos po ON po.id=pol.po_id AND po.deleted_at IS NULL AND po.status IN(N'Ordered',N'Partially Received')
      OUTER APPLY(SELECT SUM(gl.received_qty) received_qty FROM dbo.grn_lines gl INNER JOIN dbo.grns g ON g.id=gl.grn_id AND g.status=N'Confirmed' WHERE gl.po_line_id=pol.id) gr WHERE pol.bom_line_id=l.id),0) on_order,
    COALESCE((SELECT SUM(prl.qty) FROM dbo.mat_pr_lines prl INNER JOIN dbo.mat_prs pr ON pr.id=prl.pr_id AND pr.deleted_at IS NULL AND pr.status IN(N'Draft',N'In Approval',N'Approved') WHERE prl.bom_line_id=l.id),0) on_open_pr,
    COALESCE(vb.available,0) available FROM dbo.bom_lines l LEFT JOIN dbo.mat_items i ON i.id=l.item_id LEFT JOIN dbo.cost_items ci ON ci.id=l.estimate_line_id AND ci.deleted_at IS NULL
    LEFT JOIN dbo.v_item_balances vb ON vb.item_id=l.item_id WHERE l.id=@line AND l.bom_id=@bom AND l.deleted_at IS NULL;`)).recordset[0];
  if (!row) throw new ApiError(404, "bom_line_not_found", `BOM line ${line.bomLineId} does not belong to this BOM.`);
  let itemCode = String(row.item_code); if (!itemCode) { if (!line.itemCodeOverride) throw new ApiError(400, "item_code_required", `BOM line ${line.bomLineId} has no authoritative item code; provide itemCodeOverride.`); itemCode = line.itemCodeOverride; }
  else if (line.itemCodeOverride && line.itemCodeOverride.toLowerCase() !== itemCode.toLowerCase()) throw new ApiError(400, "item_code_override_mismatch", `BOM line ${line.bomLineId} is '${itemCode}', not '${line.itemCodeOverride}'. Reload the BOM and try again.`, { bomLineId: line.bomLineId, authoritativeItemCode: itemCode });
  const covered = Math.max(Number(row.allocated), Number(row.net_issued) + Number(row.active_reserved)); const shortage = Math.max(0, Number(row.qty_required) - covered - Number(row.customer_supplied_qty) - Number(row.on_order) - Number(row.on_open_pr));
  if (!line.isUnplanned && line.quantity > shortage) throw new ApiError(409, "quantity_exceeds_shortage", `${itemCode}: the line is short of ${shortage} ${row.unit}, so ${line.quantity} cannot be requested. Flag it as unplanned with a reason if this is deliberate.`, { shortage, requested: line.quantity });
  if (!row.non_stock && Number(row.available) >= line.quantity && !line.buyDespiteStock) throw new ApiError(409, "stock_available", `${itemCode}: ${row.available} is available in stock. Allocate it, or set buyDespiteStock with a reason.`, { available: Number(row.available) });
  if ((line.buyDespiteStock || line.isUnplanned) && !line.remark) throw new ApiError(400, "reason_required", `${itemCode}: ${line.isUnplanned ? "an unplanned line" : "buying despite available stock"} needs a business reason.`);
  const supplier = new sql.Request(transaction); supplier.input("id", sql.BigInt, line.supplierId); const valid = (await supplier.query<{ allowed: boolean }>(`SELECT CASE WHEN EXISTS(SELECT 1 FROM dbo.suppliers WHERE id=@id AND is_active=1 AND deleted_at IS NULL) THEN CAST(1 AS bit) ELSE CAST(0 AS bit) END allowed;`)).recordset[0]?.allowed;
  if (!valid) throw new ApiError(400, "validation_failed", "The selected supplier is inactive or does not exist.");
  const insert = new sql.Request(transaction); insert.input("pr", sql.BigInt, prId); insert.input("bom", sql.BigInt, bomId); insert.input("line", sql.BigInt, line.bomLineId);
  insert.input("item", sql.BigInt, row.item_id === null ? null : Number(row.item_id)); insert.input("code", sql.NVarChar(100), itemCode); insert.input("part", sql.NVarChar(200), String(row.part_no));
  insert.input("description", sql.NVarChar(500), String(row.description)); insert.input("supplier", sql.BigInt, line.supplierId); insert.input("qty", sql.Decimal(19, 4), line.quantity);
  insert.input("unit", sql.NVarChar(50), String(row.unit)); insert.input("price", sql.Decimal(19, 4), line.unitPrice); insert.input("est_qty", sql.Decimal(19, 4), Number(row.qty_required));
  insert.input("est_cost", sql.Decimal(19, 4), Number(row.est_unit_cost)); insert.input("source", sql.NVarChar(100), line.priceSource); insert.input("stock", sql.Decimal(19, 4), Math.max(0, Number(row.available)));
  insert.input("unplanned", sql.Bit, line.isUnplanned); insert.input("despite", sql.Bit, line.buyDespiteStock); insert.input("remark", sql.NVarChar(sql.MAX), line.remark);
  await insert.query(`INSERT INTO dbo.mat_pr_lines(pr_id,bom_id,bom_line_id,item_id,item_code,part_no,description,supplier_id,qty,unit,unit_price,est_qty,est_unit_cost,price_source,stock_snapshot,is_unplanned,buy_despite_stock,remark)
    VALUES(@pr,@bom,@line,@item,@code,@part,@description,@supplier,@qty,@unit,@price,@est_qty,@est_cost,@source,@stock,@unplanned,@despite,@remark);`);
}

async function buildApprovalRoute(transaction: TransactionType, prId: number, projectId: number, actor: CurrentUser, flags: RuleFlag[]): Promise<void> {
  const project = new sql.Request(transaction); project.input("id", sql.BigInt, projectId); const row = (await project.query<{ lead_engineer_id: number | string; manager_id: number | string }>(`SELECT lead_engineer_id,manager_id FROM dbo.projects WHERE id=@id AND deleted_at IS NULL;`)).recordset[0]!;
  const clear = new sql.Request(transaction); clear.input("pr", sql.BigInt, prId); await clear.query(`DELETE FROM dbo.mat_pr_approval_steps WHERE pr_id=@pr;`);
  const lead = Number(row.lead_engineer_id), manager = Number(row.manager_id); const steps: Array<{ name: string; role: string | null; approver: number | null; rule: string | null; status: string }> = [
    { name: "Submitted by Requester", role: null, approver: actor.id, rule: null, status: "Completed" },
    { name: "Section Owner Review", role: lead === actor.id ? "Engineering Manager" : null, approver: lead === actor.id ? null : lead, rule: null, status: "Current" },
    { name: "Budget Owner Approval", role: manager === actor.id ? "Engineering Manager" : null, approver: manager === actor.id ? null : manager, rule: null, status: "Pending" },
    { name: "Purchasing Review", role: "Purchasing", approver: null, rule: null, status: "Pending" },
  ];
  if (flags.length) steps.push({ name: "Management Approval", role: "Engineering Manager", approver: null, rule: flags.map((x) => x.text).join(" · ").slice(0, 100), status: "Pending" });
  steps.push({ name: poCreationStep, role: "Purchasing", approver: null, rule: null, status: "Pending" });
  for (let index = 0; index < steps.length; index++) { const step = steps[index]!; const insert = new sql.Request(transaction); insert.input("pr", sql.BigInt, prId); insert.input("sequence", sql.Int, index + 1);
    insert.input("name", sql.NVarChar(100), step.name); insert.input("role", sql.NVarChar(50), step.role); insert.input("approver", sql.BigInt, step.approver); insert.input("rule", sql.NVarChar(100), step.rule);
    insert.input("status", sql.NVarChar(30), step.status); await insert.query(`INSERT INTO dbo.mat_pr_approval_steps(pr_id,sequence,name,approver_role,approver_id,rule_code,status,decision,acted_at)
      VALUES(@pr,@sequence,@name,@role,@approver,@rule,@status,CASE WHEN @status=N'Completed' THEN N'Submitted' ELSE NULL END,CASE WHEN @status=N'Completed' THEN SYSUTCDATETIME() ELSE NULL END);`); }
}

export function registerPurchaseRequisitionRoutes(app: FastifyInstance, config: AppConfig, database: Database, users: CurrentUserService): void {
  app.get("/api/v1/purchase-requisitions", async (request) => { await users.demandPermission(request, "procurement.read"); const actor = await users.required(request); const q = request.query as Record<string, unknown>;
    const projectId = optionalPositiveLong(q.projectId, "Project id"); const status = optionalText(q.status, 30, "Status"); const waiting = booleanQuery(q.waitingForMe, false);
    const result = await database.query<Record<string, unknown> & { row_version: Buffer }>(`SELECT pr.id,pr.pr_no,pr.project_id,p.project_no,p.name project_name,pr.bom_id,b.bom_no,pr.requested_by,ru.name requested_by_name,
      pr.priority,pr.required_date,pr.status,pr.submitted_at,(SELECT COUNT(*) FROM dbo.mat_pr_lines l WHERE l.pr_id=pr.id) line_count,
      COALESCE((SELECT SUM(l.line_total) FROM dbo.mat_pr_lines l WHERE l.pr_id=pr.id),0) amount,COALESCE((SELECT SUM(l.estimate_total) FROM dbo.mat_pr_lines l WHERE l.pr_id=pr.id),0) estimate_amount,
      cs.name current_step,cs.approver_role,cs.approver_id,au.name approver_name,pr.row_version FROM dbo.mat_prs pr INNER JOIN dbo.projects p ON p.id=pr.project_id
      INNER JOIN dbo.boms b ON b.id=pr.bom_id INNER JOIN dbo.users ru ON ru.id=pr.requested_by OUTER APPLY(SELECT TOP(1) s.name,s.approver_role,s.approver_id FROM dbo.mat_pr_approval_steps s WHERE s.pr_id=pr.id AND s.status=N'Current' ORDER BY s.sequence) cs
      LEFT JOIN dbo.users au ON au.id=cs.approver_id WHERE pr.deleted_at IS NULL AND (@project IS NULL OR pr.project_id=@project) AND (@status IS NULL OR pr.status=@status)
      AND (@elevated=1 OR p.manager_id=@actor OR p.lead_engineer_id=@actor OR EXISTS(SELECT 1 FROM dbo.project_members m WHERE m.project_id=p.id AND m.user_id=@actor))
      AND (@waiting=0 OR (cs.name IS NOT NULL AND (cs.approver_id=@actor OR (cs.approver_id IS NULL AND cs.approver_role=@role)) AND pr.requested_by<>@actor)) ORDER BY pr.id DESC;`, (r) => {
      r.input("project", sql.BigInt, projectId); r.input("status", sql.NVarChar(30), status); r.input("actor", sql.BigInt, actor.id); r.input("role", sql.NVarChar(50), actor.role); r.input("elevated", sql.Bit, isProjectElevated(actor)); r.input("waiting", sql.Bit, waiting); });
    return result.recordset.map((row) => { const amount = Number(row.amount), estimate = Number(row.estimate_amount); return { id: Number(row.id), number: row.pr_no, projectId: Number(row.project_id), projectNumber: row.project_no,
      projectName: row.project_name, bomId: Number(row.bom_id), bomNumber: row.bom_no, requestedById: Number(row.requested_by), requestedByName: row.requested_by_name, priority: row.priority,
      requiredDate: row.required_date, status: row.status, submittedAt: row.submitted_at, lineCount: Number(row.line_count), amount, estimateAmount: estimate,
      variancePercent: estimate > 0 ? Math.round(((amount - estimate) / estimate * 100) * 100) / 100 : 0, currentStep: row.current_step, currentApproverRole: row.approver_role,
      currentApproverId: row.approver_id === null ? null : Number(row.approver_id), currentApproverName: row.approver_name, rowVersion: row.row_version.toString("base64") }; });
  });

  app.get("/api/v1/purchase-requisitions/:id", async (request) => { await users.demandPermission(request, "procurement.read"); const actor = await users.required(request); const id = positiveLong((request.params as { id?: string }).id, "Purchase requisition id");
    return database.transaction(async (transaction) => { const h = await readHeader(transaction, id); await demandProjectScope(database, actor, Number(h.project_id), transaction); const query = new sql.Request(transaction); query.input("id", sql.BigInt, id);
      const result = await query.query<Record<string, unknown> & { row_version?: Buffer }>(`SELECT l.id,l.bom_line_id,l.item_id,l.item_code,l.part_no,l.description,l.supplier_id,s.name supplier_name,l.qty,l.unit,l.unit_price,l.est_qty,l.est_unit_cost,
        l.price_source,l.stock_snapshot,l.is_unplanned,l.buy_despite_stock,l.remark,l.line_total,l.estimate_total,l.row_version,COALESCE(vb.available,0) available_now,
        bl.section_code,bl.estimate_line_id,ci.item_code estimate_item_code,ci.module estimate_module
        FROM dbo.mat_pr_lines l INNER JOIN dbo.suppliers s ON s.id=l.supplier_id INNER JOIN dbo.bom_lines bl ON bl.id=l.bom_line_id
        LEFT JOIN dbo.cost_items ci ON ci.id=bl.estimate_line_id AND ci.deleted_at IS NULL LEFT JOIN dbo.v_item_balances vb ON vb.item_id=l.item_id WHERE l.pr_id=@id ORDER BY l.id;
        SELECT s.id,s.sequence,s.name,s.approver_role,s.approver_id,u.name approver_name,s.rule_code,s.status,s.decision,s.comment,s.acted_at
        FROM dbo.mat_pr_approval_steps s LEFT JOIN dbo.users u ON u.id=s.approver_id WHERE s.pr_id=@id ORDER BY s.sequence;`);
      const lines = (result.recordsets[0] ?? []).map((raw) => { const row = raw as Record<string, unknown> & { row_version: Buffer }; const unit = Number(row.unit_price), estimated = Number(row.est_unit_cost); return { id: Number(row.id), bomLineId: Number(row.bom_line_id),
        itemId: row.item_id === null ? null : Number(row.item_id), itemCode: row.item_code, partNumber: row.part_no, description: row.description, supplierId: Number(row.supplier_id), supplierName: row.supplier_name,
        quantity: Number(row.qty), unit: row.unit, unitPrice: unit, estimateQuantity: Number(row.est_qty), estimatedUnitCost: estimated, priceSource: row.price_source,
        stockSnapshot: Number(row.stock_snapshot), isUnplanned: Boolean(row.is_unplanned), buyDespiteStock: Boolean(row.buy_despite_stock), remark: row.remark,
        lineTotal: Number(row.line_total), estimateTotal: Number(row.estimate_total), rowVersion: row.row_version.toString("base64"), availableNow: Number(row.available_now),
        sectionCode: row.section_code, estimateLineId: row.estimate_line_id === null ? null : Number(row.estimate_line_id), estimateItemCode: row.estimate_item_code, estimateModule: row.estimate_module,
        variancePercent: estimated > 0 ? Math.round((unit - estimated) / estimated * 10000) / 100 : 0 }; });
      const steps = (result.recordsets[1] ?? []).map((raw) => { const row = raw as Record<string, unknown>; return { id: Number(row.id), sequence: Number(row.sequence), name: row.name, approverRole: row.approver_role,
        approverId: row.approver_id === null ? null : Number(row.approver_id), approverName: row.approver_name, ruleCode: row.rule_code, status: row.status, decision: row.decision, comment: row.comment, actedAt: row.acted_at }; });
      const budget = await budgetPicture(transaction, Number(h.project_id), id); const flags = await procurementRuleFlags(transaction, id); return { purchaseRequisition: { id: Number(h.id), number: h.pr_no, projectId: Number(h.project_id), bomId: Number(h.bom_id),
        requestedBy: Number(h.requested_by), status: h.status, priority: h.priority, requiredDate: h.required_date }, lines, steps, budget: { approvedBudget: budget.approvedBudget, actualConsumed: budget.actualConsumed,
        openCommitment: budget.openCommitment, reservedValue: budget.reservedValue, siblingOpenPrValue: budget.siblingOpenPrValue, currentAmount: budget.amount,
        forecastBefore: budget.forecastBefore, forecastAfter: budget.forecastAfter, remainingAfter: budget.remainingAfter, withinBudget: budget.withinBudget }, ruleFlags: flags }; });
  });

  app.post("/api/v1/purchase-requisitions", async (request, reply) => { await users.demandPermission(request, "procurement.request"); const actor = await users.required(request); const body = bodyObject(request.body);
    const bomId = requiredInteger(body.bomId, "BOM", 1); const priority = oneOf(requiredText(body.priority, 30, "Priority"), "Priority", ["Normal", "High", "Emergency"]);
    const requiredDate = parseDateOnly(body.requiredDate, "Required date")!; const purpose = optionalBodyText(body.purpose, 20_000, "Purpose"); const lines = parseLines(body.lines); const today = todayIn(config.businessTimeZone);
    const created = await database.transaction(async (transaction) => { const lookup = new sql.Request(transaction); lookup.input("bom", sql.BigInt, bomId); const bom = (await lookup.query<{ project_id: number | string; status: string }>(`SELECT project_id,status FROM dbo.boms WITH (UPDLOCK,HOLDLOCK) WHERE id=@bom AND deleted_at IS NULL;`)).recordset[0];
      if (!bom) throw new ApiError(404, "bom_not_found", "BOM not found."); if (bom.status !== "Released") throw new ApiError(409, "bom_not_released", `A requisition can only be raised against a released BOM; this one is '${bom.status}'.`);
      const projectId = Number(bom.project_id); await demandProjectScope(database, actor, projectId, transaction); const number = await issueDocumentNumber(transaction, "PR", today); const insert = new sql.Request(transaction);
      insert.input("number", sql.NVarChar(30), number); insert.input("project", sql.BigInt, projectId); insert.input("bom", sql.BigInt, bomId); insert.input("actor", sql.BigInt, actor.id);
      insert.input("priority", sql.NVarChar(30), priority); insert.input("required", sql.Date, requiredDate); insert.input("purpose", sql.NVarChar(sql.MAX), purpose);
      const pr = (await insert.query<{ id: number | string; row_version: Buffer }>(`INSERT INTO dbo.mat_prs(pr_no,project_id,bom_id,requested_by,priority,required_date,purpose,status,created_by,updated_by)
        OUTPUT inserted.id,inserted.row_version VALUES(@number,@project,@bom,@actor,@priority,@required,@purpose,N'Draft',@actor,@actor);`)).recordset[0]!; const id = Number(pr.id);
      for (const line of lines) await insertLine(transaction, id, bomId, line); const totalRequest = new sql.Request(transaction); totalRequest.input("id", sql.BigInt, id);
      const total = Number((await totalRequest.query<{ total: number | string }>(`SELECT COALESCE(SUM(line_total),0) total FROM dbo.mat_pr_lines WHERE pr_id=@id;`)).recordset[0]!.total);
      await insertMaterialAudit(transaction, actor, "Created purchase requisition", "PR", id, number, null, { lines: lines.length, amount: total, priority }, { projectId, reason: purpose });
      return { id, number, status: "Draft", lineCount: lines.length, amount: total, rowVersion: pr.row_version.toString("base64") }; });
    return reply.status(201).header("Location", `/api/v1/purchase-requisitions/${created.id}`).send(created);
  });

  app.post("/api/v1/purchase-requisitions/:id/submit", async (request) => { await users.demandPermission(request, "procurement.request"); const actor = await users.required(request); const id = positiveLong((request.params as { id?: string }).id, "Purchase requisition id");
    const body = bodyObject(request.body); const version = parseRowVersion(body.rowVersion); const comment = optionalBodyText(body.comment, 20_000, "Workflow comment"); return database.transaction(async (transaction) => { const h = await readHeader(transaction, id);
      await demandProjectScope(database, actor, Number(h.project_id), transaction); if (h.status !== "Draft") throw new ApiError(409, "pr_not_draft", `Only a draft requisition can be submitted; this one is '${h.status}'.`);
      if (Number(h.requested_by) !== actor.id && !isProjectElevated(actor)) throw new ApiError(403, "requester_required", "Only the requester can submit this requisition."); const countRequest = new sql.Request(transaction); countRequest.input("id", sql.BigInt, id);
      if (Number((await countRequest.query<{ count: number }>(`SELECT COUNT(*) count FROM dbo.mat_pr_lines WHERE pr_id=@id;`)).recordset[0]!.count) === 0) throw new ApiError(409, "pr_empty", "A requisition needs at least one line before it can be submitted.");
      const flags = await procurementRuleFlags(transaction, id); await buildApprovalRoute(transaction, id, Number(h.project_id), actor, flags); const update = new sql.Request(transaction); update.input("actor", sql.BigInt, actor.id); update.input("id", sql.BigInt, id); update.input("version", sql.VarBinary(8), version);
      const row = (await update.query<{ row_version: Buffer }>(`UPDATE dbo.mat_prs SET status=N'In Approval',submitted_at=SYSUTCDATETIME(),updated_by=@actor,updated_at=SYSUTCDATETIME()
        OUTPUT inserted.row_version WHERE id=@id AND deleted_at IS NULL AND row_version=@version;`)).recordset[0]; if (!row) throw new ApiError(409, "concurrency_conflict", "This requisition changed. Reload and try again.");
      await insertMaterialAudit(transaction, actor, "Submitted purchase requisition", "PR", id, h.pr_no, { status: "Draft" }, { status: "In Approval", ruleFlags: flags.map((x) => x.text) }, { projectId: Number(h.project_id), reason: comment });
      return { id, status: "In Approval", rowVersion: row.row_version.toString("base64"), ruleFlags: flags }; });
  });

  app.post("/api/v1/purchase-requisitions/:id/decide", async (request) => { await users.demandPermission(request, "procurement.approve"); const actor = await users.required(request); const id = positiveLong((request.params as { id?: string }).id, "Purchase requisition id");
    const body = bodyObject(request.body); const decision = oneOf(requiredText(body.decision, 30, "Decision"), "Decision", ["Approve", "Reject", "Request Changes"]); const comment = optionalBodyText(body.comment, 20_000, "Comment");
    return database.transaction(async (transaction) => { const h = await readHeader(transaction, id); await demandProjectScope(database, actor, Number(h.project_id), transaction);
      if (h.status !== "In Approval") throw new ApiError(409, "pr_not_in_approval", `This requisition is '${h.status}' and has no step waiting for a decision.`); if (Number(h.requested_by) === actor.id) throw new ApiError(403, "self_approval_forbidden", "The requester cannot decide their own requisition.");
      const currentRequest = new sql.Request(transaction); currentRequest.input("pr", sql.BigInt, id); const current = (await currentRequest.query<Record<string, unknown>>(`SELECT TOP(1) id,sequence,name,approver_role,approver_id,status FROM dbo.mat_pr_approval_steps WITH (UPDLOCK,HOLDLOCK) WHERE pr_id=@pr AND status=N'Current' ORDER BY sequence;`)).recordset[0];
      if (!current) throw new ApiError(409, "no_current_step", "No approval step is waiting for a decision."); const isNamed = Number(current.approver_id) === actor.id; const isRole = current.approver_id === null && current.approver_role === actor.role;
      if (!isNamed && !isRole && actor.role !== "Admin") throw new ApiError(403, "not_the_approver", `'${current.name}' is waiting for ${current.approver_id !== null ? "another user" : current.approver_role}.`);
      const flags = await procurementRuleFlags(transaction, id); if ((decision !== "Approve" || flags.length) && !comment) throw new ApiError(400, "comment_required", flags.length && decision === "Approve" ? "This requisition is flagged; approving it requires a comment for the audit trail." : "A comment is required for this decision.");
      const step = new sql.Request(transaction); step.input("decision", sql.NVarChar(30), decision); step.input("comment", sql.NVarChar(sql.MAX), comment); step.input("actor", sql.BigInt, actor.id); step.input("step", sql.BigInt, Number(current.id));
      if ((await step.query(`UPDATE dbo.mat_pr_approval_steps SET status=N'Completed',decision=@decision,comment=@comment,acted_at=SYSUTCDATETIME(),approver_id=COALESCE(approver_id,@actor) WHERE id=@step AND status=N'Current';`)).rowsAffected[0] === 0) throw new ApiError(409, "concurrency_conflict", "This step was already decided. Reload and try again.");
      let nextStatus: string; if (decision === "Reject" || decision === "Request Changes") { nextStatus = decision === "Reject" ? "Rejected" : "Draft"; const cancel = new sql.Request(transaction); cancel.input("status", sql.NVarChar(30), decision === "Reject" ? "Not Required" : "Pending"); cancel.input("pr", sql.BigInt, id); cancel.input("sequence", sql.Int, Number(current.sequence));
        await cancel.query(`UPDATE dbo.mat_pr_approval_steps SET status=@status WHERE pr_id=@pr AND sequence>@sequence AND status IN(N'Pending',N'Current');`); }
      else { const advance = new sql.Request(transaction); advance.input("pr", sql.BigInt, id); advance.input("po", sql.NVarChar(100), poCreationStep); const result = await advance.query(`UPDATE s SET s.status=N'Current' FROM dbo.mat_pr_approval_steps s WHERE s.pr_id=@pr AND s.status=N'Pending' AND s.name<>@po
        AND s.sequence=(SELECT MIN(x.sequence) FROM dbo.mat_pr_approval_steps x WHERE x.pr_id=@pr AND x.status=N'Pending' AND x.name<>@po);`); nextStatus = (result.rowsAffected[0] ?? 0) > 0 ? "In Approval" : "Approved"; }
      const update = new sql.Request(transaction); update.input("status", sql.NVarChar(30), nextStatus); update.input("actor", sql.BigInt, actor.id); update.input("id", sql.BigInt, id);
      const row = (await update.query<{ row_version: Buffer }>(`UPDATE dbo.mat_prs SET status=@status,updated_by=@actor,updated_at=SYSUTCDATETIME() OUTPUT inserted.row_version WHERE id=@id AND deleted_at IS NULL;`)).recordset[0]!;
      await insertMaterialAudit(transaction, actor, `${decision} — ${current.name}`, "PR", id, h.pr_no, { step: current.name, status: h.status }, { status: nextStatus }, { projectId: Number(h.project_id), reason: comment, approverId: actor.id });
      return { id, status: nextStatus, step: current.name, decision, rowVersion: row.row_version.toString("base64") }; });
  });

  app.post("/api/v1/purchase-requisitions/:id/convert", async (request) => { await users.demandPermission(request, "procurement.order"); const actor = await users.required(request); const id = positiveLong((request.params as { id?: string }).id, "Purchase requisition id");
    const body = bodyObject(request.body); const version = parseRowVersion(body.rowVersion); const expectedDate = parseDateOnly(body.expectedDate, "Expected date", true); const today = todayIn(config.businessTimeZone);
    return database.transaction(async (transaction) => { const h = await readHeader(transaction, id); if (h.status !== "Approved") throw new ApiError(409, "pr_not_approved", `Only an approved requisition can be converted; this one is '${h.status}'.`);
      const suppliersRequest = new sql.Request(transaction); suppliersRequest.input("pr", sql.BigInt, id); const suppliers = (await suppliersRequest.query<{ supplier_id: number | string }>(`SELECT DISTINCT supplier_id FROM dbo.mat_pr_lines WHERE pr_id=@pr ORDER BY supplier_id;`)).recordset.map((x) => Number(x.supplier_id));
      if (!suppliers.length) throw new ApiError(409, "pr_empty", "This requisition has no lines to order."); const created: Array<{ id: number; number: string; supplierId: number; lineCount: number }> = [];
      for (const supplierId of suppliers) { const number = await issueDocumentNumber(transaction, "PO", today); const insert = new sql.Request(transaction); insert.input("number", sql.NVarChar(30), number); insert.input("pr", sql.BigInt, id); insert.input("project", sql.BigInt, Number(h.project_id)); insert.input("supplier", sql.BigInt, supplierId); insert.input("today", sql.Date, today); insert.input("expected", sql.Date, expectedDate); insert.input("actor", sql.BigInt, actor.id);
        const po = (await insert.query<{ id: number | string }>(`INSERT INTO dbo.mat_pos(po_no,pr_id,project_id,supplier_id,order_date,expected_date,status,created_by,updated_by) OUTPUT inserted.id VALUES(@number,@pr,@project,@supplier,@today,@expected,N'Ordered',@actor,@actor);`)).recordset[0]!; const poId = Number(po.id);
        const copy = new sql.Request(transaction); copy.input("po", sql.BigInt, poId); copy.input("pr", sql.BigInt, id); copy.input("supplier", sql.BigInt, supplierId); const copied = await copy.query(`INSERT INTO dbo.mat_po_lines(po_id,pr_id,supplier_id,pr_line_id,bom_line_id,item_id,qty,unit_price)
          SELECT @po,l.pr_id,l.supplier_id,l.id,l.bom_line_id,l.item_id,l.qty,l.unit_price FROM dbo.mat_pr_lines l WHERE l.pr_id=@pr AND l.supplier_id=@supplier;`); created.push({ id: poId, number, supplierId, lineCount: copied.rowsAffected[0] ?? 0 }); }
      const complete = new sql.Request(transaction); complete.input("comment", sql.NVarChar(sql.MAX), created.map((x) => x.number).join(" / ")); complete.input("actor", sql.BigInt, actor.id); complete.input("pr", sql.BigInt, id); complete.input("step", sql.NVarChar(100), poCreationStep);
      await complete.query(`UPDATE dbo.mat_pr_approval_steps SET status=N'Completed',decision=N'Created',comment=@comment,acted_at=SYSUTCDATETIME(),approver_id=COALESCE(approver_id,@actor) WHERE pr_id=@pr AND name=@step;`);
      const update = new sql.Request(transaction); update.input("actor", sql.BigInt, actor.id); update.input("id", sql.BigInt, id); update.input("version", sql.VarBinary(8), version); const row = (await update.query<{ row_version: Buffer }>(`UPDATE dbo.mat_prs SET status=N'Converted to PO',updated_by=@actor,updated_at=SYSUTCDATETIME() OUTPUT inserted.row_version WHERE id=@id AND deleted_at IS NULL AND row_version=@version;`)).recordset[0];
      if (!row) throw new ApiError(409, "concurrency_conflict", "This requisition changed. Reload and try again."); await insertMaterialAudit(transaction, actor, "Converted requisition to purchase orders", "PO", id, h.pr_no, { status: "Approved" }, { status: "Converted to PO", purchaseOrders: created }, { projectId: Number(h.project_id) });
      return { id, status: "Converted to PO", purchaseOrders: created, rowVersion: row.row_version.toString("base64") }; });
  });
}
