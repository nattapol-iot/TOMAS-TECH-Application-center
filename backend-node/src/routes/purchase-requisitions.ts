import type { FastifyInstance } from "fastify";
import sql from "mssql";
import type { Transaction as TransactionType } from "mssql";
import type { AppConfig } from "../config.js";
import type { Database } from "../db.js";
import { issueDocumentNumber } from "../document-number.js";
import { ApiError } from "../errors.js";
import { hasRole } from "../user-roles.js";
import { rolesOf } from "../user-roles.js";
import { bodyObject, booleanQuery, oneOf, optionalBodyText, optionalPositiveLong, optionalText, parseDateOnly, parseRowVersion, positiveLong, requiredInteger, requiredText } from "../http.js";
import { insertMaterialAudit } from "../material-audit.js";
import { approvalSteps, type BomLineForRequest, MAX_PR_LINES, moduleBudgets, NO_MODULE, PO_CREATION_STEP as poCreationStep, planPrLines, type PlannedPrLine,
  type PrLineInput, type PrLineKind, procurementRuleFlags, PURCHASING_REVIEW_STEP, remainingToRequest, REQUESTING_PR_STATUSES, type RuleFlag } from "../procurement-rules.js";
import { demandProjectScope, isProjectElevated } from "../project-scope.js";
import type { CurrentUser } from "../types.js";
import type { CurrentUserService } from "../users.js";

// "Estimate" is the estimate's own unit cost: the planner's default, and honest about where the price came from.
const priceSources = ["Estimate", "Price Library", "Supplier Quotation", "Previous Purchase", "Manual"];
const lineTypes: PrLineKind[] = ["Planned", "Substitute", "Unplanned"];
type PrHeader = { id: number | string; pr_no: string; project_id: number | string; bom_id: number | string; requested_by: number | string; status: string; priority: string;
  required_date: Date | string; erp_po_ref: string | null };

function todayIn(timeZone: string): string { const p = new Intl.DateTimeFormat("en-GB", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date());
  const v = Object.fromEntries(p.map((x) => [x.type, x.value])); return `${v.year}-${v.month}-${v.day}`; }
function decimal(value: unknown, minimum: number, maximum: number, label: string): number { if (typeof value !== "number" || !Number.isFinite(value) || value < minimum || value > maximum) throw new ApiError(400, "validation_failed", `${label} is outside the supported range.`);
  if (!value.toString().toLowerCase().includes("e") && (value.toString().split(".")[1]?.length ?? 0) > 4) throw new ApiError(400, "validation_failed", `${label} cannot have more than 4 decimal places.`); return value; }
async function readHeader(transaction: TransactionType, id: number): Promise<PrHeader> { const request = new sql.Request(transaction); request.input("id", sql.BigInt, id);
  const row = (await request.query<PrHeader>(`SELECT id,pr_no,project_id,bom_id,requested_by,status,priority,required_date,erp_po_ref FROM dbo.mat_prs WITH (UPDLOCK,HOLDLOCK) WHERE id=@id AND deleted_at IS NULL;`)).recordset[0];
  if (!row) throw new ApiError(404, "pr_not_found", "Purchase requisition not found."); return row; }

/** A rejected field names its line: with a thousand lines, "Quantity is outside the supported range" alone is no help. */
function parseLines(value: unknown): PrLineInput[] {
  if (!Array.isArray(value) || !value.length) throw new ApiError(400, "validation_failed", "At least one line is required.");
  if (value.length > MAX_PR_LINES) throw new ApiError(400, "validation_failed", `A requisition carries at most ${MAX_PR_LINES} lines; put the rest on another PR.`);
  return value.map((raw, index) => {
    try {
      const body = bodyObject(raw); const absent = (field: unknown) => field === undefined || field === null || field === "" || field === 0;
      return { lineType: absent(body.lineType) ? "Planned" : oneOf(String(body.lineType), "Line type", lineTypes) as PrLineKind,
        bomLineId: absent(body.bomLineId) ? null : requiredInteger(body.bomLineId, "BOM line", 1), module: optionalBodyText(body.module, 200, "Module"),
        itemCode: optionalBodyText(body.itemCode, 100, "Item code"), partNumber: optionalBodyText(body.partNumber, 200, "Part number"),
        description: optionalBodyText(body.description, 500, "Description"), brand: optionalBodyText(body.brand, 200, "Brand"), unit: optionalBodyText(body.unit, 50, "Unit"),
        quantity: decimal(body.quantity, 0.0001, 1_000_000_000, "Quantity"), coveredQuantity: absent(body.coveredQuantity) ? null : decimal(body.coveredQuantity, 0.0001, 1_000_000_000, "Replaced quantity"),
        unitPrice: decimal(body.unitPrice, 0, 1_000_000_000, "Unit price"),
        priceSource: absent(body.priceSource) ? "Estimate" : oneOf(requiredText(body.priceSource, 100, "Price source"), "Price source", priceSources),
        supplierId: absent(body.supplierId) ? null : requiredInteger(body.supplierId, "Supplier", 1), remark: optionalBodyText(body.remark, 20_000, "Remark") };
    } catch (error) {
      if (error instanceof ApiError) throw new ApiError(error.statusCode, error.code, `Line ${index + 1}: ${error.message}`, { line: index + 1 });
      throw error;
    }
  });
}

/** Every material line of a BOM with what it still needs requested, read while the BOM row is locked so two PRs cannot both take the same need. */
async function requestableBomLines(transaction: TransactionType, bomId: number): Promise<{ lines: Map<number, BomLineForRequest>; modules: string[] }> {
  const request = new sql.Request(transaction); request.input("bom", sql.BigInt, bomId); request.input("none", sql.NVarChar(200), NO_MODULE);
  const rows = (await request.query<Record<string, unknown>>(`SELECT l.id,l.item_id,COALESCE(i.item_code,ci.item_code,N'') item_code,COALESCE(i.part_no,N'') part_no,l.description,
      COALESCE(i.brand,N'') brand,l.unit,l.est_unit_cost,COALESCE(NULLIF(LTRIM(RTRIM(ci.module)),N''),@none) module,l.qty_required,l.customer_supplied_qty,
      COALESCE((SELECT SUM(r.qty) FROM dbo.reservations r WHERE r.bom_line_id=l.id AND r.status IN(N'Active',N'Consumed')),0) allocated,
      COALESCE((SELECT SUM(r.qty) FROM dbo.reservations r WHERE r.bom_line_id=l.id AND r.status=N'Active'),0) active_reserved,
      COALESCE((SELECT SUM(ml.issued_qty-ml.returned_qty) FROM dbo.mir_lines ml INNER JOIN dbo.mirs m ON m.id=ml.mir_id AND m.status IN(N'Issued',N'Received') WHERE ml.bom_line_id=l.id),0) net_issued,
      COALESCE((SELECT SUM(prl.covered_qty) FROM dbo.mat_pr_lines prl INNER JOIN dbo.mat_prs pr ON pr.id=prl.pr_id AND pr.deleted_at IS NULL AND pr.status IN(${REQUESTING_PR_STATUSES})
        WHERE prl.bom_line_id=l.id),0) requested
    FROM dbo.bom_lines l LEFT JOIN dbo.mat_items i ON i.id=l.item_id LEFT JOIN dbo.cost_items ci ON ci.id=l.estimate_line_id
    WHERE l.bom_id=@bom AND l.deleted_at IS NULL AND l.section_code<>N'SVC';`)).recordset;
  const lines = new Map<number, BomLineForRequest>();
  for (const row of rows) lines.set(Number(row.id), { id: Number(row.id), itemId: row.item_id === null ? null : Number(row.item_id), itemCode: String(row.item_code),
    partNumber: String(row.part_no), description: String(row.description), brand: String(row.brand), unit: String(row.unit), estimatedUnitCost: Number(row.est_unit_cost), module: String(row.module),
    remaining: remainingToRequest({ required: Number(row.qty_required), customerSupplied: Number(row.customer_supplied_qty), allocated: Number(row.allocated),
      activeReserved: Number(row.active_reserved), netIssued: Number(row.net_issued), requested: Number(row.requested) }) });
  return { lines, modules: [...new Set([...lines.values()].map((line) => line.module))] };
}

async function assertActiveSuppliers(transaction: TransactionType, supplierIds: number[]): Promise<void> {
  const unique = [...new Set(supplierIds)]; if (!unique.length) return;
  const request = new sql.Request(transaction); request.input("ids", sql.NVarChar(sql.MAX), JSON.stringify(unique));
  const found = Number((await request.query<{ count: number }>(`SELECT COUNT(*) count FROM dbo.suppliers s INNER JOIN OPENJSON(@ids) WITH (id bigint '$') j ON j.id=s.id WHERE s.is_active=1 AND s.deleted_at IS NULL;`)).recordset[0]!.count);
  if (found !== unique.length) throw new ApiError(400, "validation_failed", "A selected supplier is inactive or does not exist.");
}

/** One statement for every line: a thousand-line PR is one round trip, not three per line. */
async function insertLines(transaction: TransactionType, prId: number, bomId: number, lines: PlannedPrLine[]): Promise<void> {
  const request = new sql.Request(transaction); request.input("pr", sql.BigInt, prId); request.input("bom", sql.BigInt, bomId);
  request.input("lines", sql.NVarChar(sql.MAX), JSON.stringify(lines.map((line, order) => ({ ...line, order }))));
  await request.query(`INSERT INTO dbo.mat_pr_lines(pr_id,bom_id,bom_line_id,item_id,item_code,part_no,description,brand,supplier_id,qty,unit,unit_price,est_qty,est_unit_cost,
      price_source,stock_snapshot,is_unplanned,buy_despite_stock,remark,line_type,budget_module,covered_qty)
    SELECT @pr,@bom,j.bom_line_id,j.item_id,j.item_code,j.part_no,j.description,j.brand,j.supplier_id,j.qty,j.unit,j.unit_price,j.est_qty,j.est_unit_cost,
      j.price_source,0,CASE WHEN j.line_type=N'Unplanned' THEN 1 ELSE 0 END,0,j.remark,j.line_type,j.budget_module,j.covered_qty
    FROM OPENJSON(@lines) WITH (ord int '$.order', bom_line_id bigint '$.bomLineId', item_id bigint '$.itemId', item_code nvarchar(100) '$.itemCode',
      part_no nvarchar(200) '$.partNumber', description nvarchar(500) '$.description', brand nvarchar(200) '$.brand', supplier_id bigint '$.supplierId',
      qty decimal(19,4) '$.quantity', unit nvarchar(50) '$.unit', unit_price decimal(19,4) '$.unitPrice', est_qty decimal(19,4) '$.estimatedQuantity',
      est_unit_cost decimal(19,4) '$.estimatedUnitCost', price_source nvarchar(100) '$.priceSource', remark nvarchar(max) '$.remark', line_type nvarchar(20) '$.lineType',
      budget_module nvarchar(200) '$.budgetModule', covered_qty decimal(19,4) '$.coveredQuantity') j ORDER BY j.ord;`);
}

async function missingSuppliers(transaction: TransactionType, prId: number): Promise<number> {
  const request = new sql.Request(transaction); request.input("pr", sql.BigInt, prId);
  return Number((await request.query<{ count: number }>(`SELECT COUNT(*) count FROM dbo.mat_pr_lines WHERE pr_id=@pr AND supplier_id IS NULL;`)).recordset[0]!.count);
}

async function buildApprovalRoute(transaction: TransactionType, prId: number, projectId: number, actor: CurrentUser, flags: RuleFlag[]): Promise<void> {
  const project = new sql.Request(transaction); project.input("id", sql.BigInt, projectId); const row = (await project.query<{ manager_id: number | string | null }>(`SELECT manager_id FROM dbo.projects WHERE id=@id AND deleted_at IS NULL;`)).recordset[0]!;
  const clear = new sql.Request(transaction); clear.input("pr", sql.BigInt, prId); await clear.query(`DELETE FROM dbo.mat_pr_approval_steps WHERE pr_id=@pr;`);
  const steps = approvalSteps(actor.id, row.manager_id === null ? null : Number(row.manager_id), flags);
  for (let index = 0; index < steps.length; index++) { const step = steps[index]!; const insert = new sql.Request(transaction); insert.input("pr", sql.BigInt, prId); insert.input("sequence", sql.Int, index + 1);
    insert.input("name", sql.NVarChar(100), step.name); insert.input("role", sql.NVarChar(50), step.role); insert.input("approver", sql.BigInt, step.approver); insert.input("rule", sql.NVarChar(100), step.rule);
    insert.input("status", sql.NVarChar(30), step.status); await insert.query(`INSERT INTO dbo.mat_pr_approval_steps(pr_id,sequence,name,approver_role,approver_id,rule_code,status,decision,acted_at)
      VALUES(@pr,@sequence,@name,@role,@approver,@rule,@status,CASE WHEN @status=N'Completed' THEN N'Submitted' ELSE NULL END,CASE WHEN @status=N'Completed' THEN SYSUTCDATETIME() ELSE NULL END);`); }
}

export function registerPurchaseRequisitionRoutes(app: FastifyInstance, config: AppConfig, database: Database, users: CurrentUserService): void {
  app.get("/api/v1/purchase-requisitions", async (request) => { await users.demandPermission(request, "procurement.read"); const actor = await users.required(request); const q = request.query as Record<string, unknown>;
    const projectId = optionalPositiveLong(q.projectId, "Project id"); const status = optionalText(q.status, 30, "Status"); const waiting = booleanQuery(q.waitingForMe, false);
    const result = await database.query<Record<string, unknown> & { row_version: Buffer }>(`SELECT pr.id,pr.pr_no,pr.project_id,p.project_no,p.name project_name,pr.bom_id,b.bom_no,pr.requested_by,ru.name requested_by_name,
      pr.priority,pr.required_date,pr.status,pr.submitted_at,pr.erp_po_ref,lines.line_count,lines.amount,lines.estimate_amount,lines.missing_suppliers,lines.substitutes,lines.unplanned,
      cs.name current_step,cs.approver_role,cs.approver_id,au.name approver_name,pr.row_version FROM dbo.mat_prs pr INNER JOIN dbo.projects p ON p.id=pr.project_id
      INNER JOIN dbo.boms b ON b.id=pr.bom_id INNER JOIN dbo.users ru ON ru.id=pr.requested_by
      OUTER APPLY(SELECT COUNT(*) line_count,COALESCE(SUM(l.line_total),0) amount,COALESCE(SUM(l.estimate_total),0) estimate_amount,
        SUM(CASE WHEN l.supplier_id IS NULL THEN 1 ELSE 0 END) missing_suppliers,SUM(CASE WHEN l.line_type=N'Substitute' THEN 1 ELSE 0 END) substitutes,
        SUM(CASE WHEN l.line_type=N'Unplanned' THEN 1 ELSE 0 END) unplanned FROM dbo.mat_pr_lines l WHERE l.pr_id=pr.id) lines
      OUTER APPLY(SELECT TOP(1) s.name,s.approver_role,s.approver_id FROM dbo.mat_pr_approval_steps s WHERE s.pr_id=pr.id AND s.status=N'Current' ORDER BY s.sequence) cs
      LEFT JOIN dbo.users au ON au.id=cs.approver_id WHERE pr.deleted_at IS NULL AND (@project IS NULL OR pr.project_id=@project) AND (@status IS NULL OR pr.status=@status)
      AND (@elevated=1 OR p.manager_id=@actor OR p.lead_engineer_id=@actor OR EXISTS(SELECT 1 FROM dbo.project_members m WHERE m.project_id=p.id AND m.user_id=@actor))
      AND (@waiting=0 OR (cs.name IS NOT NULL AND (cs.approver_id=@actor OR (cs.approver_id IS NULL AND cs.approver_role IN(SELECT code FROM dbo.user_effective_roles WHERE user_id=@actor))) AND pr.requested_by<>@actor)) ORDER BY pr.id DESC;`, (r) => {
      r.input("project", sql.BigInt, projectId); r.input("status", sql.NVarChar(30), status); r.input("actor", sql.BigInt, actor.id); r.input("elevated", sql.Bit, isProjectElevated(actor)); r.input("waiting", sql.Bit, waiting); });
    return result.recordset.map((row) => { const amount = Number(row.amount), estimate = Number(row.estimate_amount); return { id: Number(row.id), number: row.pr_no, projectId: Number(row.project_id), projectNumber: row.project_no,
      projectName: row.project_name, bomId: Number(row.bom_id), bomNumber: row.bom_no, requestedById: Number(row.requested_by), requestedByName: row.requested_by_name, priority: row.priority,
      requiredDate: row.required_date, status: row.status, submittedAt: row.submitted_at, erpPoRef: row.erp_po_ref, lineCount: Number(row.line_count), amount, estimateAmount: estimate,
      missingSuppliers: Number(row.missing_suppliers ?? 0), substituteLines: Number(row.substitutes ?? 0), unplannedLines: Number(row.unplanned ?? 0),
      variancePercent: estimate > 0 ? Math.round(((amount - estimate) / estimate * 100) * 100) / 100 : 0, currentStep: row.current_step, currentApproverRole: row.approver_role,
      currentApproverId: row.approver_id === null ? null : Number(row.approver_id), currentApproverName: row.approver_name, rowVersion: row.row_version.toString("base64") }; });
  });

  app.get("/api/v1/purchase-requisitions/:id", async (request) => { await users.demandPermission(request, "procurement.read"); const actor = await users.required(request); const id = positiveLong((request.params as { id?: string }).id, "Purchase requisition id");
    return database.transaction(async (transaction) => { const h = await readHeader(transaction, id); await demandProjectScope(database, actor, Number(h.project_id), transaction); const query = new sql.Request(transaction); query.input("id", sql.BigInt, id);
      const result = await query.query<Record<string, unknown> & { row_version?: Buffer }>(`SELECT l.id,l.line_type,l.bom_line_id,l.item_id,l.item_code,l.part_no,l.description,l.brand,l.supplier_id,s.name supplier_name,l.qty,l.unit,l.unit_price,
        l.est_qty,l.est_unit_cost,l.covered_qty,l.budget_module,l.price_source,l.remark,l.line_total,l.estimate_total,l.row_version,
        bl.section_code,bl.estimate_line_id,COALESCE(bi.item_code,ci.item_code,N'') original_item_code,bl.description original_description,bl.unit original_unit
        FROM dbo.mat_pr_lines l LEFT JOIN dbo.suppliers s ON s.id=l.supplier_id LEFT JOIN dbo.bom_lines bl ON bl.id=l.bom_line_id
        LEFT JOIN dbo.mat_items bi ON bi.id=bl.item_id LEFT JOIN dbo.cost_items ci ON ci.id=bl.estimate_line_id WHERE l.pr_id=@id ORDER BY l.id;
        SELECT s.id,s.sequence,s.name,s.approver_role,s.approver_id,u.name approver_name,s.rule_code,s.status,s.decision,s.comment,s.acted_at
        FROM dbo.mat_pr_approval_steps s LEFT JOIN dbo.users u ON u.id=s.approver_id WHERE s.pr_id=@id ORDER BY s.sequence;`);
      const lines = (result.recordsets[0] ?? []).map((raw) => { const row = raw as Record<string, unknown> & { row_version: Buffer }; return { id: Number(row.id), lineType: row.line_type,
        bomLineId: row.bom_line_id === null ? null : Number(row.bom_line_id), itemId: row.item_id === null ? null : Number(row.item_id), itemCode: row.item_code, partNumber: row.part_no,
        description: row.description, brand: row.brand, supplierId: row.supplier_id === null ? null : Number(row.supplier_id), supplierName: row.supplier_name ?? null,
        quantity: Number(row.qty), unit: row.unit, unitPrice: Number(row.unit_price), estimateQuantity: Number(row.est_qty), estimatedUnitCost: Number(row.est_unit_cost),
        coveredQuantity: Number(row.covered_qty), module: row.budget_module, priceSource: row.price_source, remark: row.remark, lineTotal: Number(row.line_total),
        estimateTotal: Number(row.estimate_total), rowVersion: row.row_version.toString("base64"), sectionCode: row.section_code ?? null,
        estimateLineId: row.estimate_line_id === null || row.estimate_line_id === undefined ? null : Number(row.estimate_line_id),
        original: row.bom_line_id === null ? null : { itemCode: row.original_item_code, description: row.original_description, unit: row.original_unit } }; });
      const steps = (result.recordsets[1] ?? []).map((raw) => { const row = raw as Record<string, unknown>; return { id: Number(row.id), sequence: Number(row.sequence), name: row.name, approverRole: row.approver_role,
        approverId: row.approver_id === null ? null : Number(row.approver_id), approverName: row.approver_name, ruleCode: row.rule_code, status: row.status, decision: row.decision, comment: row.comment, actedAt: row.acted_at }; });
      const modules = (await moduleBudgets(transaction, Number(h.bom_id), id)).filter((module) => module.thisRequest > 0);
      const flags = await procurementRuleFlags(transaction, id);
      return { purchaseRequisition: { id: Number(h.id), number: h.pr_no, projectId: Number(h.project_id), bomId: Number(h.bom_id), requestedBy: Number(h.requested_by), status: h.status,
        priority: h.priority, requiredDate: h.required_date, erpPoRef: h.erp_po_ref }, lines, steps, modules, ruleFlags: flags }; });
  });

  app.post("/api/v1/purchase-requisitions", async (request, reply) => { await users.demandPermission(request, "procurement.request"); const actor = await users.required(request); const body = bodyObject(request.body);
    const bomId = requiredInteger(body.bomId, "BOM", 1); const priority = oneOf(requiredText(body.priority, 30, "Priority"), "Priority", ["Normal", "High", "Emergency"]);
    const requiredDate = parseDateOnly(body.requiredDate, "Required date")!; const purpose = optionalBodyText(body.purpose, 20_000, "Purpose"); const lines = parseLines(body.lines); const today = todayIn(config.businessTimeZone);
    const created = await database.transaction(async (transaction) => { const lookup = new sql.Request(transaction); lookup.input("bom", sql.BigInt, bomId); const bom = (await lookup.query<{ project_id: number | string; status: string }>(`SELECT project_id,status FROM dbo.boms WITH (UPDLOCK,HOLDLOCK) WHERE id=@bom AND deleted_at IS NULL;`)).recordset[0];
      if (!bom) throw new ApiError(404, "bom_not_found", "BOM not found."); if (bom.status !== "Released") throw new ApiError(409, "bom_not_released", `A requisition can only be raised against a released BOM; this one is '${bom.status}'.`);
      const projectId = Number(bom.project_id); await demandProjectScope(database, actor, projectId, transaction);
      const requestable = await requestableBomLines(transaction, bomId); const planned = planPrLines(lines, requestable.lines, requestable.modules);
      await assertActiveSuppliers(transaction, planned.flatMap((line) => line.supplierId === null ? [] : [line.supplierId]));
      const number = await issueDocumentNumber(transaction, "PR", today); const insert = new sql.Request(transaction);
      insert.input("number", sql.NVarChar(30), number); insert.input("project", sql.BigInt, projectId); insert.input("bom", sql.BigInt, bomId); insert.input("actor", sql.BigInt, actor.id);
      insert.input("priority", sql.NVarChar(30), priority); insert.input("required", sql.Date, requiredDate); insert.input("purpose", sql.NVarChar(sql.MAX), purpose);
      const pr = (await insert.query<{ id: number | string; row_version: Buffer }>(`INSERT INTO dbo.mat_prs(pr_no,project_id,bom_id,requested_by,priority,required_date,purpose,status,created_by,updated_by)
        OUTPUT inserted.id,inserted.row_version VALUES(@number,@project,@bom,@actor,@priority,@required,@purpose,N'Draft',@actor,@actor);`)).recordset[0]!; const id = Number(pr.id);
      await insertLines(transaction, id, bomId, planned); const totalRequest = new sql.Request(transaction); totalRequest.input("id", sql.BigInt, id);
      const total = Number((await totalRequest.query<{ total: number | string }>(`SELECT COALESCE(SUM(line_total),0) total FROM dbo.mat_pr_lines WHERE pr_id=@id;`)).recordset[0]!.total);
      const kinds = Object.fromEntries(lineTypes.map((kind) => [kind, planned.filter((line) => line.lineType === kind).length]));
      await insertMaterialAudit(transaction, actor, "Created purchase requisition", "PR", id, number, null, { lines: planned.length, ...kinds, amount: total, priority }, { projectId, reason: purpose });
      return { id, number, status: "Draft", lineCount: planned.length, amount: total, rowVersion: pr.row_version.toString("base64") }; });
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
    // No "Request Changes": a PR's lines cannot be edited, so one sent back to Draft could only be resubmitted as it was. Reject it with the reason instead.
    const body = bodyObject(request.body); const decision = oneOf(requiredText(body.decision, 30, "Decision"), "Decision", ["Approve", "Reject"]); const comment = optionalBodyText(body.comment, 20_000, "Comment");
    return database.transaction(async (transaction) => { const h = await readHeader(transaction, id); await demandProjectScope(database, actor, Number(h.project_id), transaction);
      if (h.status !== "In Approval") throw new ApiError(409, "pr_not_in_approval", `This requisition is '${h.status}' and has no step waiting for a decision.`); if (Number(h.requested_by) === actor.id) throw new ApiError(403, "self_approval_forbidden", "The requester cannot decide their own requisition.");
      const currentRequest = new sql.Request(transaction); currentRequest.input("pr", sql.BigInt, id); const current = (await currentRequest.query<Record<string, unknown>>(`SELECT TOP(1) id,sequence,name,approver_role,approver_id,status FROM dbo.mat_pr_approval_steps WITH (UPDLOCK,HOLDLOCK) WHERE pr_id=@pr AND status=N'Current' ORDER BY sequence;`)).recordset[0];
      if (!current) throw new ApiError(409, "no_current_step", "No approval step is waiting for a decision."); const isNamed = Number(current.approver_id) === actor.id; const isRole = current.approver_id === null && rolesOf(actor).includes(String(current.approver_role ?? ""));
      if (!isNamed && !isRole && !hasRole(actor, "Admin")) throw new ApiError(403, "not_the_approver", `'${current.name}' is waiting for ${current.approver_id !== null ? "another user" : current.approver_role}.`);
      // Purchasing chooses the suppliers the engineer left open; the PR cannot move on until every line has one.
      if (decision === "Approve" && current.name === PURCHASING_REVIEW_STEP) { const missing = await missingSuppliers(transaction, id);
        if (missing) throw new ApiError(409, "suppliers_required", `Choose a supplier for every line before approving Purchasing Review; ${missing} line(s) have none.`, { missing }); }
      const flags = await procurementRuleFlags(transaction, id); if ((decision !== "Approve" || flags.length) && !comment) throw new ApiError(400, "comment_required", flags.length && decision === "Approve" ? "This requisition is flagged; approving it requires a comment for the audit trail." : "A comment is required for this decision.");
      const step = new sql.Request(transaction); step.input("decision", sql.NVarChar(30), decision); step.input("comment", sql.NVarChar(sql.MAX), comment); step.input("actor", sql.BigInt, actor.id); step.input("step", sql.BigInt, Number(current.id));
      if ((await step.query(`UPDATE dbo.mat_pr_approval_steps SET status=N'Completed',decision=@decision,comment=@comment,acted_at=SYSUTCDATETIME(),approver_id=COALESCE(approver_id,@actor) WHERE id=@step AND status=N'Current';`)).rowsAffected[0] === 0) throw new ApiError(409, "concurrency_conflict", "This step was already decided. Reload and try again.");
      let nextStatus: string; if (decision === "Reject") { nextStatus = "Rejected"; const cancel = new sql.Request(transaction); cancel.input("pr", sql.BigInt, id); cancel.input("sequence", sql.Int, Number(current.sequence));
        await cancel.query(`UPDATE dbo.mat_pr_approval_steps SET status=N'Not Required' WHERE pr_id=@pr AND sequence>@sequence AND status IN(N'Pending',N'Current');`); }
      else { const advance = new sql.Request(transaction); advance.input("pr", sql.BigInt, id); advance.input("po", sql.NVarChar(100), poCreationStep); const result = await advance.query(`UPDATE s SET s.status=N'Current' FROM dbo.mat_pr_approval_steps s WHERE s.pr_id=@pr AND s.status=N'Pending' AND s.name<>@po
        AND s.sequence=(SELECT MIN(x.sequence) FROM dbo.mat_pr_approval_steps x WHERE x.pr_id=@pr AND x.status=N'Pending' AND x.name<>@po);`); nextStatus = (result.rowsAffected[0] ?? 0) > 0 ? "In Approval" : "Approved"; }
      const update = new sql.Request(transaction); update.input("status", sql.NVarChar(30), nextStatus); update.input("actor", sql.BigInt, actor.id); update.input("id", sql.BigInt, id);
      const row = (await update.query<{ row_version: Buffer }>(`UPDATE dbo.mat_prs SET status=@status,updated_by=@actor,updated_at=SYSUTCDATETIME() OUTPUT inserted.row_version WHERE id=@id AND deleted_at IS NULL;`)).recordset[0]!;
      await insertMaterialAudit(transaction, actor, `${decision} — ${current.name}`, "PR", id, h.pr_no, { step: current.name, status: h.status }, { status: nextStatus }, { projectId: Number(h.project_id), reason: comment, approverId: actor.id });
      return { id, status: nextStatus, step: current.name, decision, rowVersion: row.row_version.toString("base64") }; });
  });

  // Purchasing sets the supplier of many lines at once, while the PR is still in approval or approved and not yet ordered.
  app.put("/api/v1/purchase-requisitions/:id/suppliers", async (request) => { await users.demandPermission(request, "procurement.order"); const actor = await users.required(request); const id = positiveLong((request.params as { id?: string }).id, "Purchase requisition id");
    const body = bodyObject(request.body); if (!Array.isArray(body.assignments) || !body.assignments.length) throw new ApiError(400, "validation_failed", "At least one supplier assignment is required.");
    if (body.assignments.length > MAX_PR_LINES) throw new ApiError(400, "validation_failed", `At most ${MAX_PR_LINES} lines can be assigned at once.`);
    const assignments = body.assignments.map((raw: unknown) => { const item = bodyObject(raw); return { lineId: requiredInteger(item.lineId, "PR line", 1), supplierId: requiredInteger(item.supplierId, "Supplier", 1) }; });
    if (new Set(assignments.map((item) => item.lineId)).size !== assignments.length) throw new ApiError(400, "validation_failed", "A PR line can appear only once.");
    return database.transaction(async (transaction) => { const h = await readHeader(transaction, id); await demandProjectScope(database, actor, Number(h.project_id), transaction);
      if (h.status !== "In Approval" && h.status !== "Approved") throw new ApiError(409, "pr_not_open", `Suppliers are chosen while a requisition is in approval or approved; this one is '${h.status}'.`);
      await assertActiveSuppliers(transaction, assignments.map((item) => item.supplierId));
      const update = new sql.Request(transaction); update.input("pr", sql.BigInt, id); update.input("assignments", sql.NVarChar(sql.MAX), JSON.stringify(assignments));
      const changed = (await update.query(`UPDATE l SET l.supplier_id=j.supplier_id FROM dbo.mat_pr_lines l
        INNER JOIN OPENJSON(@assignments) WITH (line_id bigint '$.lineId', supplier_id bigint '$.supplierId') j ON j.line_id=l.id WHERE l.pr_id=@pr;`)).rowsAffected[0] ?? 0;
      if (changed !== assignments.length) throw new ApiError(404, "pr_line_not_found", "A line does not belong to this requisition. Reload and try again.");
      const missing = await missingSuppliers(transaction, id);
      await insertMaterialAudit(transaction, actor, "Assigned suppliers", "PR", id, h.pr_no, null, { lines: changed, withoutSupplier: missing }, { projectId: Number(h.project_id) });
      return { id, assigned: changed, missingSuppliers: missing }; });
  });

  // A draft nobody will submit still counts as an open PR against its BOM lines, which blocks a new request for them. Its requester can withdraw it.
  app.post("/api/v1/purchase-requisitions/:id/cancel", async (request) => { await users.demandPermission(request, "procurement.request"); const actor = await users.required(request); const id = positiveLong((request.params as { id?: string }).id, "Purchase requisition id");
    const body = bodyObject(request.body); const version = parseRowVersion(body.rowVersion); const reason = optionalBodyText(body.reason, 20_000, "Reason");
    return database.transaction(async (transaction) => { const h = await readHeader(transaction, id); await demandProjectScope(database, actor, Number(h.project_id), transaction);
      if (h.status !== "Draft") throw new ApiError(409, "pr_not_draft", `Only a draft requisition can be cancelled; this one is '${h.status}'.`);
      if (Number(h.requested_by) !== actor.id && !hasRole(actor, "Admin")) throw new ApiError(403, "requester_required", "Only the requester can cancel this requisition.");
      const update = new sql.Request(transaction); update.input("actor", sql.BigInt, actor.id); update.input("id", sql.BigInt, id); update.input("version", sql.VarBinary(8), version);
      const row = (await update.query<{ id: number | string }>(`UPDATE dbo.mat_prs SET deleted_at=SYSUTCDATETIME(),updated_by=@actor,updated_at=SYSUTCDATETIME() OUTPUT inserted.id WHERE id=@id AND status=N'Draft' AND deleted_at IS NULL AND row_version=@version;`)).recordset[0];
      if (!row) throw new ApiError(409, "concurrency_conflict", "This requisition changed. Reload and try again.");
      await insertMaterialAudit(transaction, actor, "Cancelled draft purchase requisition", "PR", id, h.pr_no, { status: "Draft" }, { status: "Cancelled" }, { projectId: Number(h.project_id), reason });
      return { id, status: "Cancelled" }; });
  });

  // The Approvals menu badge: exactly what the Approvals screen lists for this user (PRs waiting for them, others' material issues and stock adjustments).
  app.get("/api/v1/procurement/approvals/attention", async (request) => { const actor = await users.required(request);
    const result = await database.query<{ waiting: number | string }>(`DECLARE @approve bit=CASE WHEN EXISTS(SELECT 1 FROM dbo.user_effective_permissions WHERE user_id=@actor AND code=N'procurement.approve') THEN 1 ELSE 0 END;
      DECLARE @adjust bit=CASE WHEN EXISTS(SELECT 1 FROM dbo.user_effective_permissions WHERE user_id=@actor AND code=N'inventory.adjust') THEN 1 ELSE 0 END;
      SELECT (SELECT COUNT(*) FROM dbo.mat_prs pr INNER JOIN dbo.projects p ON p.id=pr.project_id
          OUTER APPLY(SELECT TOP(1) s.approver_role,s.approver_id FROM dbo.mat_pr_approval_steps s WHERE s.pr_id=pr.id AND s.status=N'Current' ORDER BY s.sequence) cs
          WHERE @approve=1 AND pr.deleted_at IS NULL AND pr.status=N'In Approval' AND pr.requested_by<>@actor
          AND (@elevated=1 OR p.manager_id=@actor OR p.lead_engineer_id=@actor OR EXISTS(SELECT 1 FROM dbo.project_members m WHERE m.project_id=p.id AND m.user_id=@actor))
          AND (cs.approver_id=@actor OR (cs.approver_id IS NULL AND cs.approver_role IN(SELECT code FROM dbo.user_effective_roles WHERE user_id=@actor))))
        +(SELECT COUNT(*) FROM dbo.mirs m INNER JOIN dbo.projects p ON p.id=m.project_id WHERE @approve=1 AND m.status=N'Pending Approval' AND m.requested_by<>@actor
          AND (@elevated=1 OR p.manager_id=@actor OR p.lead_engineer_id=@actor OR EXISTS(SELECT 1 FROM dbo.project_members pm WHERE pm.project_id=p.id AND pm.user_id=@actor)))
        +(SELECT COUNT(*) FROM dbo.stock_adjustments a WHERE @adjust=1 AND a.status=N'Pending Approval' AND a.requested_by<>@actor) waiting;`, (r) => {
      r.input("actor", sql.BigInt, actor.id); r.input("elevated", sql.Bit, isProjectElevated(actor)); });
    return { waiting: Number(result.recordset[0]?.waiting ?? 0) };
  });

  // The company ERP raises the purchase order. Purchasing records its number here, which closes the requisition; nothing is ordered in this app.
  app.post("/api/v1/purchase-requisitions/:id/erp-order", async (request) => { await users.demandPermission(request, "procurement.order"); const actor = await users.required(request); const id = positiveLong((request.params as { id?: string }).id, "Purchase requisition id");
    const body = bodyObject(request.body); const version = parseRowVersion(body.rowVersion); const reference = requiredText(body.erpPoRef, 200, "ERP PO number"); const comment = optionalBodyText(body.comment, 20_000, "Comment");
    return database.transaction(async (transaction) => { const h = await readHeader(transaction, id); await demandProjectScope(database, actor, Number(h.project_id), transaction);
      if (h.status !== "Approved") throw new ApiError(409, "pr_not_approved", `Only an approved requisition can be ordered; this one is '${h.status}'.`);
      const missing = await missingSuppliers(transaction, id); if (missing) throw new ApiError(409, "suppliers_required", `${missing} line(s) have no supplier yet.`, { missing });
      const complete = new sql.Request(transaction); complete.input("comment", sql.NVarChar(sql.MAX), comment ? `${reference} · ${comment}` : reference); complete.input("actor", sql.BigInt, actor.id); complete.input("pr", sql.BigInt, id); complete.input("step", sql.NVarChar(100), poCreationStep);
      await complete.query(`UPDATE dbo.mat_pr_approval_steps SET status=N'Completed',decision=N'Ordered in ERP',comment=@comment,acted_at=SYSUTCDATETIME(),approver_id=COALESCE(approver_id,@actor) WHERE pr_id=@pr AND name=@step;`);
      const update = new sql.Request(transaction); update.input("actor", sql.BigInt, actor.id); update.input("id", sql.BigInt, id); update.input("version", sql.VarBinary(8), version); update.input("reference", sql.NVarChar(200), reference);
      const row = (await update.query<{ row_version: Buffer }>(`UPDATE dbo.mat_prs SET status=N'Converted to PO',erp_po_ref=@reference,updated_by=@actor,updated_at=SYSUTCDATETIME() OUTPUT inserted.row_version WHERE id=@id AND deleted_at IS NULL AND row_version=@version;`)).recordset[0];
      if (!row) throw new ApiError(409, "concurrency_conflict", "This requisition changed. Reload and try again.");
      await insertMaterialAudit(transaction, actor, "Ordered in ERP", "PR", id, h.pr_no, { status: "Approved" }, { status: "Converted to PO", erpPoRef: reference }, { projectId: Number(h.project_id), reason: comment });
      return { id, status: "Converted to PO", erpPoRef: reference, rowVersion: row.row_version.toString("base64") }; });
  });
}
