import type { FastifyInstance } from "fastify";
import sql from "mssql";
import type { Transaction as TransactionType } from "mssql";
import type { AppConfig } from "../config.js";
import type { Database } from "../db.js";
import { issueDocumentNumber } from "../document-number.js";
import { ApiError } from "../errors.js";
import { hasRole } from "../user-roles.js";
import { bodyObject, booleanQuery, oneOf, optionalBodyText, optionalPositiveLong, optionalText, parseDateOnly, parseRowVersion, positiveLong, requiredInteger, requiredText } from "../http.js";
import { insertMaterialAudit } from "../material-audit.js";
import { type ApprovalRoute, approvalSteps, type BomLineForRequest, ERP_STEP, FINAL_STEP, LEGACY_PO_CREATION_STEP, MAX_PR_LINES, moduleBudgets, NO_MODULE, planPrLines, type PlannedPrLine,
  type PrLineInput, type PrLineKind, procurementRuleFlags, remainingToRequest, REQUESTING_PR_STATUSES, type RuleFlag } from "../procurement-rules.js";
import type { EmailService, PurchaseRequisitionApprovalEmail } from "../email.js";
import { describeErpFailure, type ErpDepartment, type ErpFailure, type ErpGateway, type ErpLine, erpLineProblem, ERP_MAX_QUANTITY, type ErpRequest, erpRequestArguments,
  isFinalErpStatus, localStatusFor, newErpRef, suggestDepartment } from "../erp-purchasing.js";
import { demandProjectScope, isProjectElevated } from "../project-scope.js";
import { notifyUsers } from "../site-visit-common.js";
import type { CurrentUser } from "../types.js";
import type { CurrentUserService } from "../users.js";

export type ErpLink = { gateway: ErpGateway; appBaseUrl: string };
export type ErpOutcome = { sent: boolean; prNo?: string; message?: string; pending?: boolean; kind?: ErpFailure["kind"] | "department_required" | "not_configured" };

// "Estimate" is the estimate's own unit cost: the planner's default, and honest about where the price came from.
const priceSources = ["Estimate", "Price Library", "Supplier Quotation", "Previous Purchase", "Manual"];
const lineTypes: PrLineKind[] = ["Planned", "Substitute", "Unplanned"];
// The ERP team allows reading a PR's status every 5-15 minutes; one list open reads at most a batch of PRs, one after another.
const ERP_LIST_SYNC_MINUTES = 15;
const ERP_LIST_SYNC_BATCH = 20;
// The final approval waits this long for the ERP's answer, then replies while the send carries on: a proxy in between may cut a slower request.
const ERP_APPROVE_WAIT_MS = 20_000;
type PrHeader = { id: number | string; pr_no: string; project_id: number | string; bom_id: number | string; requested_by: number | string; status: string; priority: string;
  required_date: Date | string; erp_po_ref: string | null; purpose: string | null; erp_ref: string | null; erp_department: string | null; erp_pr_no: string | null;
  erp_status: string | null; erp_status_label: string | null; erp_url: string | null; erp_revision_no: number | null; erp_rejection_reason: string | null;
  erp_synced_at: Date | string | null; erp_error: string | null; row_version: Buffer };
const HEADER_COLUMNS = "id,pr_no,project_id,bom_id,requested_by,status,priority,required_date,erp_po_ref,purpose,erp_ref,erp_department,erp_pr_no,erp_status,erp_status_label,erp_url,erp_revision_no,erp_rejection_reason,erp_synced_at,erp_error,row_version";
const erpView = (h: PrHeader) => ({ ref: h.erp_ref, department: h.erp_department, prNo: h.erp_pr_no, status: h.erp_status, statusLabel: h.erp_status_label, url: h.erp_url,
  revisionNo: h.erp_revision_no, rejectionReason: h.erp_rejection_reason, poNo: h.erp_po_ref, syncedAt: h.erp_synced_at, error: h.erp_error });

function todayIn(timeZone: string): string { const p = new Intl.DateTimeFormat("en-GB", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date());
  const v = Object.fromEntries(p.map((x) => [x.type, x.value])); return `${v.year}-${v.month}-${v.day}`; }
function decimal(value: unknown, minimum: number, maximum: number, label: string): number { if (typeof value !== "number" || !Number.isFinite(value) || value < minimum || value > maximum) throw new ApiError(400, "validation_failed", `${label} is outside the supported range.`);
  if (!value.toString().toLowerCase().includes("e") && (value.toString().split(".")[1]?.length ?? 0) > 4) throw new ApiError(400, "validation_failed", `${label} cannot have more than 4 decimal places.`); return value; }
async function readHeader(transaction: TransactionType, id: number): Promise<PrHeader> { const request = new sql.Request(transaction); request.input("id", sql.BigInt, id);
  const row = (await request.query<PrHeader>(`SELECT ${HEADER_COLUMNS} FROM dbo.mat_prs WITH (UPDLOCK,HOLDLOCK) WHERE id=@id AND deleted_at IS NULL;`)).recordset[0];
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
        quantity: decimal(body.quantity, 0.0001, ERP_MAX_QUANTITY, "Quantity"), coveredQuantity: absent(body.coveredQuantity) ? null : decimal(body.coveredQuantity, 0.0001, 1_000_000_000, "Replaced quantity"),
        unitPrice: decimal(body.unitPrice, 0, 1_000_000_000, "Unit price"),
        priceSource: absent(body.priceSource) ? "Estimate" : oneOf(requiredText(body.priceSource, 100, "Price source"), "Price source", priceSources),
        supplierId: absent(body.supplierId) ? null : requiredInteger(body.supplierId, "Supplier", 1), remark: optionalBodyText(body.remark, 20_000, "Remark") };
    } catch (error) {
      if (error instanceof ApiError) throw new ApiError(error.statusCode, error.code, `Line ${index + 1}: ${error.message}`, { line: index + 1 });
      throw error;
    }
  });
}

/** What a new PR and an edited draft both carry. */
function parseRequestFields(body: Record<string, unknown>) {
  return { priority: oneOf(requiredText(body.priority, 30, "Priority"), "Priority", ["Normal", "High", "Emergency"]), requiredDate: parseDateOnly(body.requiredDate, "Required date")!,
    purpose: optionalBodyText(body.purpose, 20_000, "Purpose"), lines: parseLines(body.lines), erpDepartment: optionalBodyText(body.erpDepartment, 50, "ERP department") };
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

/** The owner's route for a requester (migration 097): their department's head and the final approver, or null without a final approver. Inactive people are left out. */
async function approvalRoute(transaction: TransactionType, requesterId: number): Promise<ApprovalRoute | null> {
  const request = new sql.Request(transaction); request.input("requester", sql.BigInt, requesterId);
  const row = (await request.query<{ final_id: number | string; head_id: number | string | null; final_may_decide: boolean | null }>(`SELECT s.final_approver_id final_id,d.approver_id head_id,d.final_may_decide
    FROM dbo.pr_approval_settings s INNER JOIN dbo.users f ON f.id=s.final_approver_id AND f.is_active=1 AND f.deleted_at IS NULL
    LEFT JOIN dbo.users r ON r.id=@requester
    LEFT JOIN dbo.pr_department_approvers d ON d.department=LTRIM(RTRIM(r.department))
      AND EXISTS(SELECT 1 FROM dbo.users h WHERE h.id=d.approver_id AND h.is_active=1 AND h.deleted_at IS NULL)
    WHERE s.id=1;`)).recordset[0];
  if (!row) return null;
  const head = row.head_id === null ? null : Number(row.head_id);
  return { finalApproverId: Number(row.final_id), departmentApproverId: head === requesterId ? null : head, finalMayDecide: Boolean(row.final_may_decide) };
}

async function buildApprovalRoute(transaction: TransactionType, prId: number, projectId: number, actor: CurrentUser, requesterId: number, flags: RuleFlag[]): Promise<void> {
  const project = new sql.Request(transaction); project.input("id", sql.BigInt, projectId); const row = (await project.query<{ manager_id: number | string | null }>(`SELECT manager_id FROM dbo.projects WHERE id=@id AND deleted_at IS NULL;`)).recordset[0]!;
  const clear = new sql.Request(transaction); clear.input("pr", sql.BigInt, prId); await clear.query(`DELETE FROM dbo.mat_pr_approval_steps WHERE pr_id=@pr;`);
  const steps = approvalSteps(actor.id, row.manager_id === null ? null : Number(row.manager_id), flags, await approvalRoute(transaction, requesterId));
  for (let index = 0; index < steps.length; index++) { const step = steps[index]!; const insert = new sql.Request(transaction); insert.input("pr", sql.BigInt, prId); insert.input("sequence", sql.Int, index + 1);
    insert.input("name", sql.NVarChar(100), step.name); insert.input("role", sql.NVarChar(50), step.role); insert.input("approver", sql.BigInt, step.approver); insert.input("rule", sql.NVarChar(100), step.rule);
    insert.input("status", sql.NVarChar(30), step.status); insert.input("finalMay", sql.Bit, Boolean(step.finalMayDecide));
    await insert.query(`INSERT INTO dbo.mat_pr_approval_steps(pr_id,sequence,name,approver_role,approver_id,rule_code,status,decision,acted_at,final_may_decide)
      VALUES(@pr,@sequence,@name,@role,@approver,@rule,@status,CASE WHEN @status=N'Completed' THEN N'Submitted' ELSE NULL END,CASE WHEN @status=N'Completed' THEN SYSUTCDATETIME() ELSE NULL END,@finalMay);`); }
}

// The step waiting for a decision (cs) and the PR's final step while it is still ahead (fs), beside dbo.mat_prs pr.
const stepsOf = (lock = "") => `OUTER APPLY(SELECT TOP(1) s.id,s.sequence,s.name,s.approver_role,s.approver_id,s.final_may_decide FROM dbo.mat_pr_approval_steps s${lock}
    WHERE s.pr_id=pr.id AND s.status=N'Current' ORDER BY s.sequence) cs
  OUTER APPLY(SELECT TOP(1) f.id,f.sequence,f.approver_id FROM dbo.mat_pr_approval_steps f${lock} WHERE f.pr_id=pr.id AND f.name=N'${FINAL_STEP}' AND f.status IN(N'Current',N'Pending') ORDER BY f.sequence) fs`;
/**
 * Who decides the waiting step, an Admin aside: the person it names (their own PR only at the final step), the final approver in place
 * of a department step marked for it (their own PR too), and anyone holding the role it names with procurement.approve, never on their
 * own PR. A named person needs no procurement.approve: the route chose them. Needs @actor and @approve.
 */
const WAITING_FOR_ACTOR = `(pr.status=N'In Approval' AND cs.id IS NOT NULL AND ((cs.final_may_decide=1 AND fs.approver_id=@actor)
    OR (cs.approver_id=@actor AND (pr.requested_by<>@actor OR cs.name=N'${FINAL_STEP}'))
    OR (@approve=1 AND pr.requested_by<>@actor AND cs.approver_id IS NULL AND cs.approver_role IN(SELECT code FROM dbo.user_effective_roles WHERE user_id=@actor))))`;
const APPROVE_HELD = `DECLARE @approve bit=CASE WHEN EXISTS(SELECT 1 FROM dbo.user_effective_permissions WHERE user_id=@actor AND code=N'procurement.approve') THEN 1 ELSE 0 END;`;
/** The project's people see its PRs, and so does anyone a step of the PR names: a department head need not be on the project. Needs @actor and @elevated. */
const PR_SCOPE = `(@elevated=1 OR p.manager_id=@actor OR p.lead_engineer_id=@actor OR EXISTS(SELECT 1 FROM dbo.project_members m WHERE m.project_id=p.id AND m.user_id=@actor)
    OR EXISTS(SELECT 1 FROM dbo.mat_pr_approval_steps ns WHERE ns.pr_id=pr.id AND ns.approver_id=@actor))`;

async function demandPrScope(database: Database, transaction: TransactionType, actor: CurrentUser, h: PrHeader): Promise<void> {
  const named = new sql.Request(transaction); named.input("pr", sql.BigInt, Number(h.id)); named.input("actor", sql.BigInt, actor.id);
  if ((await named.query(`SELECT TOP(1) 1 named FROM dbo.mat_pr_approval_steps WHERE pr_id=@pr AND approver_id=@actor;`)).recordset.length) return;
  await demandProjectScope(database, actor, Number(h.project_id), transaction);
}

/**
 * Tells whoever the PR now waits for: the person its current step names gets the bell, and the final approver, when the PR is theirs
 * to decide now (their own step, or a department step they may decide), the bell and an email. Not the person acting. Returns the
 * email to send after the commit.
 */
async function noticeWaiting(transaction: TransactionType, prId: number, actorId: number): Promise<PurchaseRequisitionApprovalEmail | null> {
  const request = new sql.Request(transaction); request.input("id", sql.BigInt, prId);
  const row = (await request.query<Record<string, unknown>>(`SELECT pr.pr_no,p.project_no,p.name project_name,ru.name requester,cs.id step_id,cs.name step,cs.approver_id,
      au.name approver_name,cs.final_may_decide,fs.approver_id final_id,fu.name final_name,fu.email final_email,
      (SELECT COALESCE(SUM(l.line_total),0) FROM dbo.mat_pr_lines l WHERE l.pr_id=pr.id) amount
    FROM dbo.mat_prs pr INNER JOIN dbo.projects p ON p.id=pr.project_id INNER JOIN dbo.users ru ON ru.id=pr.requested_by ${stepsOf()}
    LEFT JOIN dbo.users au ON au.id=cs.approver_id LEFT JOIN dbo.users fu ON fu.id=fs.approver_id AND fu.is_active=1 AND fu.deleted_at IS NULL
    WHERE pr.id=@id AND pr.status=N'In Approval';`)).recordset[0];
  if (!row || row.step_id === null || row.step_id === undefined) return null;
  const finalId = row.final_id === null ? null : Number(row.final_id), approverId = row.approver_id === null ? null : Number(row.approver_id);
  const finalDecidesNow = finalId !== null && (approverId === finalId || Boolean(row.final_may_decide));
  const recipients = [approverId, finalDecidesNow ? finalId : null].filter((id): id is number => id !== null && id !== actorId);
  if (!recipients.length) return null;
  await notifyUsers(transaction, recipients, "PR_APPROVAL", `PR ${String(row.pr_no)} รออนุมัติ`, `${String(row.project_no)} · ${String(row.requester)} · ${String(row.step)}`,
    "PurchaseRequisition", prId, `pr-approval:${prId}:${Number(row.step_id)}`);
  if (!finalDecidesNow || finalId === actorId || !row.final_email) return null;
  return { prNumber: String(row.pr_no), projectNumber: String(row.project_no), projectName: String(row.project_name), requesterName: String(row.requester),
    amount: Number(row.amount), step: String(row.step), stepApproverName: approverId === finalId ? "" : String(row.approver_name ?? ""),
    recipients: [{ name: String(row.final_name ?? ""), email: String(row.final_email) }] };
}

export function registerPurchaseRequisitionRoutes(app: FastifyInstance, config: AppConfig, database: Database, users: CurrentUserService, erp: ErpLink | null = null,
  email: Pick<EmailService, "sendPurchaseRequisitionApproval"> | null = null): void {
  const mail = async (message: PurchaseRequisitionApprovalEmail | null) => { if (message && email) await email.sendPurchaseRequisitionApproval(message); };
  const subjectOf = async (userId: number) => String((await database.query<{ subject: string | null }>(`SELECT entra_object_id subject FROM dbo.users WHERE id=@id;`,
    (r) => r.input("id", sql.BigInt, userId))).recordset[0]?.subject ?? "");

  /**
   * Writes what the ERP said about the PR, and moves our status when the ERP has ordered, rejected or cancelled it. Only while the PR
   * still carries the reference the ERP was asked about: a PR taken back to Draft meanwhile has dropped it, and stays a draft.
   */
  const recordErp = async (prId: number, current: string, ref: string, request: ErpRequest, actorId: number) => {
    const status = localStatusFor(request.status, current);
    await database.query(`UPDATE dbo.mat_prs SET erp_pr_id=@erp_id,erp_pr_no=@erp_no,erp_status=@erp_status,erp_status_label=@label,erp_url=@url,erp_revision_no=@revision,
        erp_rejection_reason=@reason,erp_po_ref=COALESCE(@po,erp_po_ref),erp_synced_at=SYSUTCDATETIME(),erp_error=NULL,status=@status,updated_by=@actor,updated_at=SYSUTCDATETIME()
      WHERE id=@id AND deleted_at IS NULL AND erp_ref=@ref;
      UPDATE dbo.mat_pr_approval_steps SET status=N'Completed',decision=N'Sent',comment=@erp_no,acted_at=COALESCE(acted_at,SYSUTCDATETIME()) WHERE pr_id=@id AND name=@step AND status<>N'Completed'
        AND EXISTS(SELECT 1 FROM dbo.mat_prs WHERE id=@id AND erp_ref=@ref);`, (r) => {
      r.input("erp_id", sql.BigInt, request.pr_id); r.input("erp_no", sql.NVarChar(50), request.pr_no); r.input("erp_status", sql.NVarChar(30), request.status);
      r.input("label", sql.NVarChar(50), request.status_label); r.input("url", sql.NVarChar(500), request.url); r.input("revision", sql.Int, request.revision_no);
      r.input("reason", sql.NVarChar(sql.MAX), request.rejection_reason); r.input("po", sql.NVarChar(200), request.po_no); r.input("status", sql.NVarChar(30), status);
      r.input("actor", sql.BigInt, actorId); r.input("id", sql.BigInt, prId); r.input("ref", sql.NVarChar(100), ref); r.input("step", sql.NVarChar(100), ERP_STEP); });
    return status;
  };
  const recordError = (prId: number, message: string) => database.query(`UPDATE dbo.mat_prs SET erp_error=@error WHERE id=@id;`, (r) => {
    r.input("error", sql.NVarChar(500), message.slice(0, 500)); r.input("id", sql.BigInt, prId); });
  // A PR the ERP deleted cannot be ordered any more; saying so offers its requester to take it back to Draft or cancel it.
  const DELETED_IN_ERP = "The ERP has deleted this requisition. Take it back to Draft to correct and submit it again, or cancel it.";

  // PRs this process is sending now. Taking one back meanwhile would leave the ERP holding a PR that this app no longer has.
  const sending = new Set<number>();

  /**
   * Sends an approved PR to the ERP as its requester. The external_ref is kept before the call, so a timeout or a second press
   * returns the same ERP PR instead of making another. The department comes from the PR, or is matched from the requester's.
   */
  const sendToErp = async (prId: number, requesterId: number, actorId: number, department: string | null): Promise<ErpOutcome> => {
    sending.add(prId);
    try { return await sendOnce(prId, requesterId, actorId, department); }
    finally { sending.delete(prId); }
  };
  const sendOnce = async (prId: number, requesterId: number, actorId: number, department: string | null): Promise<ErpOutcome> => {
    if (!erp) return { sent: false, kind: "not_configured", message: "The ERP connection is not configured on this server." };
    const subject = await subjectOf(requesterId);
    const prepared = await database.transaction(async (transaction) => {
      const h = await readHeader(transaction, prId);
      if (h.status !== "Approved") throw new ApiError(409, "pr_not_approved", `Only an approved requisition goes to the ERP; this one is '${h.status}'.`);
      if (h.erp_pr_no) return { h, ref: h.erp_ref! };
      const ref = h.erp_ref ?? newErpRef(); const update = new sql.Request(transaction); update.input("ref", sql.NVarChar(100), ref); update.input("department", sql.NVarChar(50), department); update.input("id", sql.BigInt, prId);
      await update.query(`UPDATE dbo.mat_prs SET erp_ref=@ref,erp_department=COALESCE(@department,erp_department) WHERE id=@id;`);
      return { h: { ...h, erp_ref: ref, erp_department: department ?? h.erp_department }, ref };
    });
    if (prepared.h.erp_pr_no) return { sent: true, prNo: prepared.h.erp_pr_no };
    let erpDepartment = prepared.h.erp_department;
    if (!erpDepartment) {
      const options = await erp.gateway.call<{ departments?: ErpDepartment[] }>(subject, "purchasing_options_get", {});
      if (!options.ok) { await recordError(prId, describeErpFailure(options)); return { sent: false, kind: options.kind, message: options.message }; }
      const personDepartment = (await database.query<{ department: string | null }>(`SELECT department FROM dbo.users WHERE id=@id;`, (r) => r.input("id", sql.BigInt, requesterId))).recordset[0]?.department;
      erpDepartment = suggestDepartment(personDepartment, options.data.departments ?? []);
      if (!erpDepartment) { const message = "Choose the ERP department for this PR, then send it."; await recordError(prId, message); return { sent: false, kind: "department_required", message }; }
      await database.query(`UPDATE dbo.mat_prs SET erp_department=@department WHERE id=@id;`, (r) => { r.input("department", sql.NVarChar(50), erpDepartment); r.input("id", sql.BigInt, prId); });
    }
    const detail = (await database.query<Record<string, unknown>>(`SELECT p.project_no,p.name project_name,b.bom_no FROM dbo.mat_prs pr INNER JOIN dbo.projects p ON p.id=pr.project_id INNER JOIN dbo.boms b ON b.id=pr.bom_id WHERE pr.id=@id;
      SELECT l.line_type,l.item_code,l.part_no,l.description,l.brand,l.qty,l.unit,l.unit_price,l.remark,l.budget_module,COALESCE(bi.item_code,ci.item_code,bl.description) original_code
      FROM dbo.mat_pr_lines l LEFT JOIN dbo.bom_lines bl ON bl.id=l.bom_line_id LEFT JOIN dbo.mat_items bi ON bi.id=bl.item_id LEFT JOIN dbo.cost_items ci ON ci.id=bl.estimate_line_id
      WHERE l.pr_id=@id ORDER BY l.id;`, (r) => r.input("id", sql.BigInt, prId)));
    const project = (detail.recordsets[0]?.[0] ?? {}) as Record<string, unknown>;
    const lines = (detail.recordsets[1] ?? []).map((row) => { const line = row as Record<string, unknown>; return { line_type: String(line.line_type), item_code: String(line.item_code ?? ""),
      part_no: String(line.part_no ?? ""), description: String(line.description ?? ""), brand: String(line.brand ?? ""), qty: Number(line.qty), unit: String(line.unit ?? ""),
      unit_price: Number(line.unit_price), remark: line.remark === null ? null : String(line.remark), budget_module: String(line.budget_module ?? ""),
      original_code: line.original_code === null ? null : String(line.original_code) } satisfies ErpLine; });
    const problem = erpLineProblem(lines);
    if (problem) { await recordError(prId, problem); return { sent: false, kind: "validation", message: problem }; }
    const args = erpRequestArguments({ pr_no: prepared.h.pr_no, erp_ref: prepared.ref, erp_department: erpDepartment, required_date: prepared.h.required_date, purpose: prepared.h.purpose,
      project_no: String(project.project_no ?? ""), project_name: String(project.project_name ?? ""), bom_no: String(project.bom_no ?? "") }, lines, erp.appBaseUrl);
    const created = await erp.gateway.call<{ created: boolean; request: ErpRequest }>(subject, "purchase_request_create", args);
    if (!created.ok) { await recordError(prId, describeErpFailure(created)); return { sent: false, kind: created.kind, message: describeErpFailure(created) }; }
    await recordErp(prId, "Approved", prepared.ref, created.data.request, actorId);
    await database.transaction((transaction) => insertMaterialAudit(transaction, { id: actorId, role: "System" } as CurrentUser, "Sent to the ERP", "PR", prId, prepared.h.pr_no, null,
      { erpPrNo: created.data.request.pr_no, erpStatus: created.data.request.status, created: created.data.created }, { projectId: Number(prepared.h.project_id) }));
    return { sent: true, prNo: created.data.request.pr_no };
  };
  app.get("/api/v1/purchase-requisitions", async (request) => { await users.demandPermission(request, "procurement.read"); const actor = await users.required(request); const q = request.query as Record<string, unknown>;
    const projectId = optionalPositiveLong(q.projectId, "Project id"); const status = optionalText(q.status, 30, "Status"); const waiting = booleanQuery(q.waitingForMe, false);
    const result = await database.query<Record<string, unknown> & { row_version: Buffer }>(`${APPROVE_HELD}
      SELECT pr.id,pr.pr_no,pr.project_id,p.project_no,p.name project_name,pr.bom_id,b.bom_no,pr.requested_by,ru.name requested_by_name,
      pr.priority,pr.required_date,pr.status,pr.submitted_at,pr.erp_po_ref,pr.erp_pr_no,pr.erp_status,pr.erp_status_label,pr.erp_url,pr.erp_error,
      lines.line_count,lines.amount,lines.estimate_amount,lines.substitutes,lines.unplanned,
      cs.name current_step,cs.approver_role,cs.approver_id,au.name approver_name,pr.row_version,
      CASE WHEN ${WAITING_FOR_ACTOR} OR (@admin=1 AND @approve=1 AND pr.status=N'In Approval' AND cs.id IS NOT NULL AND pr.requested_by<>@actor) THEN 1 ELSE 0 END can_decide
      FROM dbo.mat_prs pr INNER JOIN dbo.projects p ON p.id=pr.project_id
      INNER JOIN dbo.boms b ON b.id=pr.bom_id INNER JOIN dbo.users ru ON ru.id=pr.requested_by
      OUTER APPLY(SELECT COUNT(*) line_count,COALESCE(SUM(l.line_total),0) amount,COALESCE(SUM(l.estimate_total),0) estimate_amount,
        SUM(CASE WHEN l.line_type=N'Substitute' THEN 1 ELSE 0 END) substitutes,
        SUM(CASE WHEN l.line_type=N'Unplanned' THEN 1 ELSE 0 END) unplanned FROM dbo.mat_pr_lines l WHERE l.pr_id=pr.id) lines
      ${stepsOf()}
      LEFT JOIN dbo.users au ON au.id=cs.approver_id WHERE pr.deleted_at IS NULL AND (@project IS NULL OR pr.project_id=@project) AND (@status IS NULL OR pr.status=@status)
      AND ${PR_SCOPE} AND (@waiting=0 OR ${WAITING_FOR_ACTOR}) ORDER BY pr.id DESC;`, (r) => {
      r.input("project", sql.BigInt, projectId); r.input("status", sql.NVarChar(30), status); r.input("actor", sql.BigInt, actor.id); r.input("elevated", sql.Bit, isProjectElevated(actor)); r.input("waiting", sql.Bit, waiting);
      r.input("admin", sql.Bit, hasRole(actor, "Admin")); });
    return result.recordset.map((row) => { const amount = Number(row.amount), estimate = Number(row.estimate_amount); return { id: Number(row.id), number: row.pr_no, projectId: Number(row.project_id), projectNumber: row.project_no,
      projectName: row.project_name, bomId: Number(row.bom_id), bomNumber: row.bom_no, requestedById: Number(row.requested_by), requestedByName: row.requested_by_name, priority: row.priority,
      requiredDate: row.required_date, status: row.status, submittedAt: row.submitted_at, erpPoRef: row.erp_po_ref, lineCount: Number(row.line_count), amount, estimateAmount: estimate,
      substituteLines: Number(row.substitutes ?? 0), unplannedLines: Number(row.unplanned ?? 0),
      erp: { prNo: row.erp_pr_no ?? null, status: row.erp_status ?? null, statusLabel: row.erp_status_label ?? null, url: row.erp_url ?? null, error: row.erp_error ?? null },
      variancePercent: estimate > 0 ? Math.round(((amount - estimate) / estimate * 100) * 100) / 100 : 0, currentStep: row.current_step, currentApproverRole: row.approver_role,
      currentApproverId: row.approver_id === null ? null : Number(row.approver_id), currentApproverName: row.approver_name, canDecide: Boolean(row.can_decide),
      rowVersion: row.row_version.toString("base64") }; });
  });

  // Who the signed-in person's PR goes to, for the PR sheet: their department's head and the final approver (migration 097), or
  // null while no final approver is set and the PM / Engineering Manager route applies.
  app.get("/api/v1/purchase-requisitions/approval-route", async (request) => { await users.demandPermission(request, "procurement.request"); const actor = await users.required(request);
    return database.transaction(async (transaction) => {
      const route = await approvalRoute(transaction, actor.id); if (!route) return { approvers: null };
      const steps = approvalSteps(actor.id, null, [], route).filter((step) => step.status !== "Completed" && step.approver !== null);
      const names = new sql.Request(transaction); names.input("ids", sql.NVarChar(sql.MAX), JSON.stringify(steps.map((step) => step.approver)));
      const found = new Map((await names.query<{ id: number | string; name: string }>(`SELECT u.id,u.name FROM dbo.users u INNER JOIN OPENJSON(@ids) WITH (id bigint '$') j ON j.id=u.id;`)).recordset
        .map((row) => [Number(row.id), row.name]));
      return { approvers: steps.map((step) => ({ step: step.name, name: found.get(step.approver!) ?? "" })) };
    });
  });

  app.get("/api/v1/purchase-requisitions/:id", async (request) => { await users.demandPermission(request, "procurement.read"); const actor = await users.required(request); const id = positiveLong((request.params as { id?: string }).id, "Purchase requisition id");
    return database.transaction(async (transaction) => { const h = await readHeader(transaction, id); await demandPrScope(database, transaction, actor, h); const query = new sql.Request(transaction); query.input("id", sql.BigInt, id);
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
        priority: h.priority, requiredDate: h.required_date, purpose: h.purpose, erpPoRef: h.erp_po_ref, rowVersion: h.row_version.toString("base64") }, erp: { ...erpView(h), enabled: Boolean(erp) }, lines, steps, modules, ruleFlags: flags }; });
  });

  app.post("/api/v1/purchase-requisitions", async (request, reply) => { await users.demandPermission(request, "procurement.request"); const actor = await users.required(request); const body = bodyObject(request.body);
    const bomId = requiredInteger(body.bomId, "BOM", 1); const { priority, requiredDate, purpose, lines, erpDepartment } = parseRequestFields(body); const today = todayIn(config.businessTimeZone);
    const created = await database.transaction(async (transaction) => { const lookup = new sql.Request(transaction); lookup.input("bom", sql.BigInt, bomId); const bom = (await lookup.query<{ project_id: number | string; status: string }>(`SELECT project_id,status FROM dbo.boms WITH (UPDLOCK,HOLDLOCK) WHERE id=@bom AND deleted_at IS NULL;`)).recordset[0];
      if (!bom) throw new ApiError(404, "bom_not_found", "BOM not found."); if (bom.status !== "Released") throw new ApiError(409, "bom_not_released", `A requisition can only be raised against a released BOM; this one is '${bom.status}'.`);
      const projectId = Number(bom.project_id); await demandProjectScope(database, actor, projectId, transaction);
      const requestable = await requestableBomLines(transaction, bomId); const planned = planPrLines(lines, requestable.lines, requestable.modules);
      await assertActiveSuppliers(transaction, planned.flatMap((line) => line.supplierId === null ? [] : [line.supplierId]));
      const number = await issueDocumentNumber(transaction, "PR", today); const insert = new sql.Request(transaction);
      insert.input("number", sql.NVarChar(30), number); insert.input("project", sql.BigInt, projectId); insert.input("bom", sql.BigInt, bomId); insert.input("actor", sql.BigInt, actor.id);
      insert.input("priority", sql.NVarChar(30), priority); insert.input("required", sql.Date, requiredDate); insert.input("purpose", sql.NVarChar(sql.MAX), purpose);
      insert.input("department", sql.NVarChar(50), erpDepartment);
      const pr = (await insert.query<{ id: number | string; row_version: Buffer }>(`INSERT INTO dbo.mat_prs(pr_no,project_id,bom_id,requested_by,priority,required_date,purpose,status,created_by,updated_by,erp_department)
        OUTPUT inserted.id,inserted.row_version VALUES(@number,@project,@bom,@actor,@priority,@required,@purpose,N'Draft',@actor,@actor,@department);`)).recordset[0]!; const id = Number(pr.id);
      await insertLines(transaction, id, bomId, planned); const totalRequest = new sql.Request(transaction); totalRequest.input("id", sql.BigInt, id);
      const total = Number((await totalRequest.query<{ total: number | string }>(`SELECT COALESCE(SUM(line_total),0) total FROM dbo.mat_pr_lines WHERE pr_id=@id;`)).recordset[0]!.total);
      const kinds = Object.fromEntries(lineTypes.map((kind) => [kind, planned.filter((line) => line.lineType === kind).length]));
      await insertMaterialAudit(transaction, actor, "Created purchase requisition", "PR", id, number, null, { lines: planned.length, ...kinds, amount: total, priority }, { projectId, reason: purpose });
      return { id, number, status: "Draft", lineCount: planned.length, amount: total, rowVersion: pr.row_version.toString("base64") }; });
    return reply.status(201).header("Location", `/api/v1/purchase-requisitions/${created.id}`).send(created);
  });

  // A draft's requester (or an Admin) rewrites its header and lines: a PR taken back from the ERP is corrected here, then submitted again.
  // Its old lines go first, so what the BOM still needs is counted without them, under the same BOM lock as a new PR.
  app.put("/api/v1/purchase-requisitions/:id", async (request) => { await users.demandPermission(request, "procurement.request"); const actor = await users.required(request); const id = positiveLong((request.params as { id?: string }).id, "Purchase requisition id");
    const body = bodyObject(request.body); const version = parseRowVersion(body.rowVersion); const { priority, requiredDate, purpose, lines, erpDepartment } = parseRequestFields(body);
    return database.transaction(async (transaction) => { const h = await readHeader(transaction, id); await demandProjectScope(database, actor, Number(h.project_id), transaction);
      if (h.status !== "Draft") throw new ApiError(409, "pr_not_draft", `Only a draft requisition can be edited; this one is '${h.status}'.`);
      if (Number(h.requested_by) !== actor.id && !hasRole(actor, "Admin")) throw new ApiError(403, "requester_required", "Only the requester can edit this requisition.");
      const bomId = Number(h.bom_id); const lookup = new sql.Request(transaction); lookup.input("bom", sql.BigInt, bomId);
      const bom = (await lookup.query<{ status: string }>(`SELECT status FROM dbo.boms WITH (UPDLOCK,HOLDLOCK) WHERE id=@bom AND deleted_at IS NULL;`)).recordset[0];
      if (!bom) throw new ApiError(404, "bom_not_found", "BOM not found."); if (bom.status !== "Released") throw new ApiError(409, "bom_not_released", `A requisition can only be raised against a released BOM; this one is '${bom.status}'.`);
      const update = new sql.Request(transaction); update.input("actor", sql.BigInt, actor.id); update.input("id", sql.BigInt, id); update.input("version", sql.VarBinary(8), version);
      update.input("priority", sql.NVarChar(30), priority); update.input("required", sql.Date, requiredDate); update.input("purpose", sql.NVarChar(sql.MAX), purpose); update.input("department", sql.NVarChar(50), erpDepartment);
      const row = (await update.query<{ row_version: Buffer }>(`UPDATE dbo.mat_prs SET priority=@priority,required_date=@required,purpose=@purpose,erp_department=COALESCE(@department,erp_department),
          updated_by=@actor,updated_at=SYSUTCDATETIME() OUTPUT inserted.row_version WHERE id=@id AND status=N'Draft' AND deleted_at IS NULL AND row_version=@version;`)).recordset[0];
      if (!row) throw new ApiError(409, "concurrency_conflict", "This requisition changed. Reload and try again.");
      const clear = new sql.Request(transaction); clear.input("id", sql.BigInt, id); await clear.query(`DELETE FROM dbo.mat_pr_lines WHERE pr_id=@id;`);
      const requestable = await requestableBomLines(transaction, bomId); const planned = planPrLines(lines, requestable.lines, requestable.modules);
      await assertActiveSuppliers(transaction, planned.flatMap((line) => line.supplierId === null ? [] : [line.supplierId]));
      await insertLines(transaction, id, bomId, planned); const totalRequest = new sql.Request(transaction); totalRequest.input("id", sql.BigInt, id);
      const total = Number((await totalRequest.query<{ total: number | string }>(`SELECT COALESCE(SUM(line_total),0) total FROM dbo.mat_pr_lines WHERE pr_id=@id;`)).recordset[0]!.total);
      const kinds = Object.fromEntries(lineTypes.map((kind) => [kind, planned.filter((line) => line.lineType === kind).length]));
      await insertMaterialAudit(transaction, actor, "Edited purchase requisition", "PR", id, h.pr_no, { status: "Draft" }, { lines: planned.length, ...kinds, amount: total, priority }, { projectId: Number(h.project_id), reason: purpose });
      return { id, number: h.pr_no, status: "Draft", lineCount: planned.length, amount: total, rowVersion: row.row_version.toString("base64") }; });
  });

  app.post("/api/v1/purchase-requisitions/:id/submit", async (request) => { await users.demandPermission(request, "procurement.request"); const actor = await users.required(request); const id = positiveLong((request.params as { id?: string }).id, "Purchase requisition id");
    const body = bodyObject(request.body); const version = parseRowVersion(body.rowVersion); const comment = optionalBodyText(body.comment, 20_000, "Workflow comment"); const submitted = await database.transaction(async (transaction) => { const h = await readHeader(transaction, id);
      await demandProjectScope(database, actor, Number(h.project_id), transaction); if (h.status !== "Draft") throw new ApiError(409, "pr_not_draft", `Only a draft requisition can be submitted; this one is '${h.status}'.`);
      if (Number(h.requested_by) !== actor.id && !isProjectElevated(actor)) throw new ApiError(403, "requester_required", "Only the requester can submit this requisition."); const countRequest = new sql.Request(transaction); countRequest.input("id", sql.BigInt, id);
      if (Number((await countRequest.query<{ count: number }>(`SELECT COUNT(*) count FROM dbo.mat_pr_lines WHERE pr_id=@id;`)).recordset[0]!.count) === 0) throw new ApiError(409, "pr_empty", "A requisition needs at least one line before it can be submitted.");
      const flags = await procurementRuleFlags(transaction, id); await buildApprovalRoute(transaction, id, Number(h.project_id), actor, Number(h.requested_by), flags); const update = new sql.Request(transaction); update.input("actor", sql.BigInt, actor.id); update.input("id", sql.BigInt, id); update.input("version", sql.VarBinary(8), version);
      const row = (await update.query<{ row_version: Buffer }>(`UPDATE dbo.mat_prs SET status=N'In Approval',submitted_at=SYSUTCDATETIME(),updated_by=@actor,updated_at=SYSUTCDATETIME()
        OUTPUT inserted.row_version WHERE id=@id AND deleted_at IS NULL AND row_version=@version;`)).recordset[0]; if (!row) throw new ApiError(409, "concurrency_conflict", "This requisition changed. Reload and try again.");
      await insertMaterialAudit(transaction, actor, "Submitted purchase requisition", "PR", id, h.pr_no, { status: "Draft" }, { status: "In Approval", ruleFlags: flags.map((x) => x.text) }, { projectId: Number(h.project_id), reason: comment });
      return { result: { id, status: "In Approval", rowVersion: row.row_version.toString("base64"), ruleFlags: flags }, notice: await noticeWaiting(transaction, id, actor.id) }; });
    await mail(submitted.notice);
    return submitted.result;
  });

  app.post("/api/v1/purchase-requisitions/:id/decide", async (request) => { await users.demandPermission(request, "procurement.read"); const actor = await users.required(request); const id = positiveLong((request.params as { id?: string }).id, "Purchase requisition id");
    // No "Request Changes": a PR's lines cannot be edited, so one sent back to Draft could only be resubmitted as it was. Reject it with the reason instead.
    const body = bodyObject(request.body); const decision = oneOf(requiredText(body.decision, 30, "Decision"), "Decision", ["Approve", "Reject"]); const comment = optionalBodyText(body.comment, 20_000, "Comment");
    const decided = await database.transaction(async (transaction) => { const h = await readHeader(transaction, id); await demandPrScope(database, transaction, actor, h);
      if (h.status !== "In Approval") throw new ApiError(409, "pr_not_in_approval", `This requisition is '${h.status}' and has no step waiting for a decision.`);
      // The waiting step and the final one, locked. Who may decide is the rule the list shows (WAITING_FOR_ACTOR), plus an Admin on someone else's PR.
      const read = new sql.Request(transaction); read.input("id", sql.BigInt, id); read.input("actor", sql.BigInt, actor.id);
      const found = (await read.query<Record<string, unknown>>(`${APPROVE_HELD}
        SELECT cs.id,cs.sequence,cs.name,cs.approver_role,cs.approver_id,fs.id final_id,fs.sequence final_sequence,@approve approve,
          CASE WHEN ${WAITING_FOR_ACTOR} THEN 1 ELSE 0 END may_decide,
          CASE WHEN cs.final_may_decide=1 AND fs.approver_id=@actor AND fs.id<>cs.id THEN 1 ELSE 0 END for_department
        FROM dbo.mat_prs pr ${stepsOf(" WITH (UPDLOCK,HOLDLOCK)")} WHERE pr.id=@id;`)).recordset[0];
      if (!found || found.id === null || found.id === undefined) throw new ApiError(409, "no_current_step", "No approval step is waiting for a decision.");
      const own = Number(h.requested_by) === actor.id;
      if (!found.may_decide && !(hasRole(actor, "Admin") && found.approve && !own)) throw own ? new ApiError(403, "self_approval_forbidden", "The requester cannot decide their own requisition.")
        : new ApiError(403, "not_the_approver", `'${String(found.name)}' is waiting for ${found.approver_id !== null ? "another user" : String(found.approver_role)}.`);
      let current = { id: Number(found.id), sequence: Number(found.sequence), name: String(found.name) };
      if (found.for_department) {
        // The final approver decides in place of the department head: that step is no longer needed and this decision is the final one.
        const skip = new sql.Request(transaction); skip.input("step", sql.BigInt, current.id); skip.input("final", sql.BigInt, Number(found.final_id));
        await skip.query(`UPDATE dbo.mat_pr_approval_steps SET status=N'Not Required',comment=N'Decided by the final approver' WHERE id=@step AND status=N'Current';
          UPDATE dbo.mat_pr_approval_steps SET status=N'Current' WHERE id=@final AND status=N'Pending';`);
        current = { id: Number(found.final_id), sequence: Number(found.final_sequence), name: FINAL_STEP };
      }
      const flags = await procurementRuleFlags(transaction, id); if ((decision !== "Approve" || flags.length) && !comment) throw new ApiError(400, "comment_required", flags.length && decision === "Approve" ? "This requisition is flagged; approving it requires a comment for the audit trail." : "A comment is required for this decision.");
      // The step records who decided it: an Admin deciding a step that names someone else shows as the Admin.
      const step = new sql.Request(transaction); step.input("decision", sql.NVarChar(30), decision); step.input("comment", sql.NVarChar(sql.MAX), comment); step.input("actor", sql.BigInt, actor.id); step.input("step", sql.BigInt, current.id);
      if ((await step.query(`UPDATE dbo.mat_pr_approval_steps SET status=N'Completed',decision=@decision,comment=@comment,acted_at=SYSUTCDATETIME(),approver_id=@actor WHERE id=@step AND status=N'Current';`)).rowsAffected[0] === 0) throw new ApiError(409, "concurrency_conflict", "This step was already decided. Reload and try again.");
      let nextStatus: string; if (decision === "Reject") { nextStatus = "Rejected"; const cancel = new sql.Request(transaction); cancel.input("pr", sql.BigInt, id); cancel.input("sequence", sql.Int, current.sequence);
        await cancel.query(`UPDATE dbo.mat_pr_approval_steps SET status=N'Not Required' WHERE pr_id=@pr AND sequence>@sequence AND status IN(N'Pending',N'Current');`); }
      else { const advance = new sql.Request(transaction); advance.input("pr", sql.BigInt, id); advance.input("erp", sql.NVarChar(100), ERP_STEP); advance.input("po", sql.NVarChar(100), LEGACY_PO_CREATION_STEP);
        // The ERP step (and the PO step of PRs routed before the ERP) is done by the system, never waited on by a person.
        const result = await advance.query(`UPDATE s SET s.status=N'Current' FROM dbo.mat_pr_approval_steps s WHERE s.pr_id=@pr AND s.status=N'Pending' AND s.name NOT IN(@erp,@po)
        AND s.sequence=(SELECT MIN(x.sequence) FROM dbo.mat_pr_approval_steps x WHERE x.pr_id=@pr AND x.status=N'Pending' AND x.name NOT IN(@erp,@po));`); nextStatus = (result.rowsAffected[0] ?? 0) > 0 ? "In Approval" : "Approved"; }
      const update = new sql.Request(transaction); update.input("status", sql.NVarChar(30), nextStatus); update.input("actor", sql.BigInt, actor.id); update.input("id", sql.BigInt, id);
      const row = (await update.query<{ row_version: Buffer }>(`UPDATE dbo.mat_prs SET status=@status,updated_by=@actor,updated_at=SYSUTCDATETIME() OUTPUT inserted.row_version WHERE id=@id AND deleted_at IS NULL;`)).recordset[0]!;
      await insertMaterialAudit(transaction, actor, `${decision} — ${current.name}`, "PR", id, h.pr_no, { step: current.name, status: h.status },
        { status: nextStatus, ...(found.for_department ? { inPlaceOf: String(found.name) } : {}) }, { projectId: Number(h.project_id), reason: comment, approverId: actor.id });
      const notice = nextStatus === "In Approval" ? await noticeWaiting(transaction, id, actor.id) : null;
      return { id, number: h.pr_no, requestedBy: Number(h.requested_by), status: nextStatus, step: current.name, decision, rowVersion: row.row_version.toString("base64"), notice }; });
    await mail(decided.notice);
    // Fully approved: send it to the ERP as the requester now. If their TMT ID session has ended (or the ERP says no), the PR
    // stays Approved and the requester is told to send it themselves. A slow ERP does not hold the approver's request: after a
    // short wait the reply goes back and the send finishes on its own, telling the requester if it failed.
    let erpOutcome: ErpOutcome | null = null;
    if (decided.status === "Approved" && erp) {
      const sent = sendToErp(id, decided.requestedBy, actor.id, null)
        .catch((error: unknown): ErpOutcome => ({ sent: false, message: error instanceof Error ? error.message : String(error) }))
        .then(async (outcome) => {
          if (!outcome.sent) await database.transaction((transaction) => notifyUsers(transaction, [decided.requestedBy], "PR_ERP_SEND", `PR ${decided.number} อนุมัติแล้ว · กดส่งเข้า ERP`,
            outcome.message ?? "", "PurchaseRequisition", id, `pr-erp-send:${id}:${Date.now()}`)).catch((error: unknown) => request.log.error({ err: error, prId: id }, "PR ERP send notification failed"));
          return outcome;
        });
      let timer: NodeJS.Timeout | undefined;
      const waited = new Promise<null>((resolve) => { timer = setTimeout(() => resolve(null), ERP_APPROVE_WAIT_MS); timer.unref(); });
      erpOutcome = await Promise.race([sent, waited]).finally(() => clearTimeout(timer)) ?? { sent: false, pending: true, message: "The ERP is still answering; the requester is told if it fails." };
    }
    return { id: decided.id, status: decided.status, step: decided.step, decision: decided.decision, rowVersion: decided.rowVersion, ...(erpOutcome ? { erp: erpOutcome } : {}) };
  });

  // The approved PR's requester sends it (again) to the ERP, choosing the ERP department when it could not be matched.
  app.post("/api/v1/purchase-requisitions/:id/erp-send", async (request) => { await users.demandPermission(request, "procurement.request"); const actor = await users.required(request); const id = positiveLong((request.params as { id?: string }).id, "Purchase requisition id");
    const body = bodyObject(request.body ?? {}); const department = optionalBodyText(body.department, 50, "ERP department");
    if (!erp) throw new ApiError(503, "erp_not_configured", "The ERP connection is not configured on this server.");
    const header = await database.transaction(async (transaction) => { const h = await readHeader(transaction, id); await demandProjectScope(database, actor, Number(h.project_id), transaction); return h; });
    // The ERP names whoever's token sends the PR as its requester, so only the requester may send it.
    if (Number(header.requested_by) !== actor.id) throw new ApiError(403, "requester_required", "Only the requester can send this requisition to the ERP: the ERP names the sender as the requester.");
    const outcome = await sendToErp(id, actor.id, actor.id, department);
    if (!outcome.sent && outcome.kind === "validation") throw new ApiError(422, "erp_validation_failed", outcome.message ?? "The ERP refused the requisition.");
    return outcome;
  });

  // Opening the PR list reads the viewer's open ERP PRs with the viewer's token. The ERP sends no webhook and allows a read every 5-15 minutes,
  // so a PR synced in the last 15 minutes is skipped, and one whose read failed waits the same 15 minutes in memory.
  const listChecked = new Map<number, number>();
  app.post("/api/v1/purchase-requisitions/erp-sync", async (request) => { await users.demandPermission(request, "procurement.read"); const actor = await users.required(request);
    if (!erp) return { checked: 0, updated: 0 };
    const now = Date.now(); for (const [prId, at] of listChecked) if (now - at >= ERP_LIST_SYNC_MINUTES * 60_000) listChecked.delete(prId);
    const due = (await database.query<{ id: number | string; status: string; erp_ref: string; erp_status: string | null; erp_po_ref: string | null }>(`SELECT TOP(100) pr.id,pr.status,pr.erp_ref,pr.erp_status,pr.erp_po_ref
      FROM dbo.mat_prs pr INNER JOIN dbo.projects p ON p.id=pr.project_id WHERE pr.deleted_at IS NULL AND pr.erp_ref IS NOT NULL AND pr.erp_pr_no IS NOT NULL
        AND (pr.erp_status IS NULL OR pr.erp_status NOT IN(N'CONVERTED',N'REJECTED',N'CANCELLED')) AND (pr.erp_error IS NULL OR pr.erp_error<>@deleted) AND (pr.erp_synced_at IS NULL OR pr.erp_synced_at<DATEADD(minute,-@minutes,SYSUTCDATETIME()))
        AND (@elevated=1 OR p.manager_id=@actor OR p.lead_engineer_id=@actor OR EXISTS(SELECT 1 FROM dbo.project_members m WHERE m.project_id=p.id AND m.user_id=@actor)) ORDER BY pr.erp_synced_at,pr.id;`, (r) => {
      r.input("minutes", sql.Int, ERP_LIST_SYNC_MINUTES); r.input("deleted", sql.NVarChar(500), DELETED_IN_ERP); r.input("actor", sql.BigInt, actor.id); r.input("elevated", sql.Bit, isProjectElevated(actor)); }))
      .recordset.filter((row) => !listChecked.has(Number(row.id))).slice(0, ERP_LIST_SYNC_BATCH);
    let checked = 0, updated = 0;
    for (const row of due) { const prId = Number(row.id); listChecked.set(prId, Date.now()); checked += 1;
      const result = await erp.gateway.call<{ request: ErpRequest }>(actor.entraObjectId, "purchase_request_get", { external_ref: row.erp_ref });
      if (!result.ok) {
        // The viewer's sign-in failed, not the PR: leave it for the next viewer. An ERP that is down keeps the mark, so it is not asked again on every open.
        if (result.kind === "signed_out" || result.kind === "unauthorized") { listChecked.delete(prId); break; }
        if (result.kind === "unavailable") break;
        if (result.kind === "ref_deleted") { await recordError(prId, DELETED_IN_ERP); updated += 1; }
        continue;
      }
      const status = await recordErp(prId, row.status, row.erp_ref, result.data.request, actor.id);
      if (status !== row.status || result.data.request.status !== row.erp_status || (result.data.request.po_no ?? row.erp_po_ref) !== row.erp_po_ref) updated += 1;
    }
    return { checked, updated };
  });

  // Reads one PR from the ERP with the viewer's own token when they open it.
  app.post("/api/v1/purchase-requisitions/:id/erp-sync", async (request) => { await users.demandPermission(request, "procurement.read"); const actor = await users.required(request); const id = positiveLong((request.params as { id?: string }).id, "Purchase requisition id");
    if (!erp) throw new ApiError(503, "erp_not_configured", "The ERP connection is not configured on this server.");
    const header = await database.transaction(async (transaction) => { const h = await readHeader(transaction, id); await demandPrScope(database, transaction, actor, h); return h; });
    if (!header.erp_ref || !header.erp_pr_no) return { synced: false, erp: erpView(header) };
    if (isFinalErpStatus(header.erp_status)) return { synced: true, erp: erpView(header) };
    const result = await erp.gateway.call<{ request: ErpRequest }>(actor.entraObjectId, "purchase_request_get", { external_ref: header.erp_ref });
    if (!result.ok) {
      if (result.kind !== "ref_deleted") return { synced: false, message: result.message, kind: result.kind, erp: erpView(header) };
      await recordError(id, DELETED_IN_ERP);
      return { synced: false, message: DELETED_IN_ERP, kind: result.kind, erp: erpView(await database.transaction((transaction) => readHeader(transaction, id))) };
    }
    const status = await recordErp(id, header.status, header.erp_ref, result.data.request, actor.id);
    const fresh = await database.transaction((transaction) => readHeader(transaction, id));
    return { synced: true, status, erp: erpView(fresh) };
  });

  // The ERP's departments for the PR sheet, with the one matching the signed-in person's department preselected.
  app.get("/api/v1/erp/purchasing/options", async (request) => { await users.demandPermission(request, "procurement.request"); const actor = await users.required(request);
    if (!erp) return { enabled: false, departments: [], suggestedDepartment: null };
    const result = await erp.gateway.call<{ departments?: ErpDepartment[] }>(actor.entraObjectId, "purchasing_options_get", {});
    if (!result.ok) return { enabled: true, departments: [], suggestedDepartment: null, message: result.message, kind: result.kind };
    const departments = result.data.departments ?? [];
    return { enabled: true, departments: departments.map((item) => ({ value: item.value, label: item.label })), suggestedDepartment: suggestDepartment(actor.department, departments) };
  });

  /**
   * An approved PR is taken back only while the ERP does not hold it: never sent, refused, or deleted there. The ERP is asked with
   * the person's own token; anything but "not found" or "deleted" leaves the PR where it is.
   */
  const assertNotInErp = async (h: PrHeader, actor: CurrentUser): Promise<void> => {
    const id = Number(h.id);
    if (sending.has(id)) throw new ApiError(409, "pr_erp_sending", "This requisition is being sent to the ERP now. Wait a moment, then try again.");
    if (!h.erp_ref) return;
    if (!erp) throw new ApiError(409, "erp_check_failed", "The ERP connection is off, so it cannot be confirmed that the ERP does not hold this requisition.");
    const result = await erp.gateway.call<{ request: ErpRequest }>(actor.entraObjectId, "purchase_request_get", { external_ref: h.erp_ref });
    if (result.ok) {
      const status = await recordErp(id, h.status, h.erp_ref, result.data.request, actor.id);
      throw new ApiError(409, "pr_in_erp", status === "Rejected"
        ? `The ERP has closed this requisition (${result.data.request.pr_no}), so it no longer holds its BOM lines.`
        : `The ERP already holds this requisition as ${result.data.request.pr_no}. Ask Purchasing to cancel it in the ERP.`);
    }
    if (result.kind === "not_found" || result.kind === "ref_deleted") return;
    throw new ApiError(409, "erp_check_failed", `It could not be confirmed that the ERP does not hold this requisition: ${result.message}`);
  };
  /** Reads a PR for its requester (or an Admin) to take back; the ERP is asked afterwards, outside the transaction. */
  const takeBackHeader = (id: number, actor: CurrentUser, action: string) => database.transaction(async (transaction) => { const h = await readHeader(transaction, id);
    await demandProjectScope(database, actor, Number(h.project_id), transaction);
    if (Number(h.requested_by) !== actor.id && !hasRole(actor, "Admin")) throw new ApiError(403, "requester_required", `Only the requester can ${action} this requisition.`);
    return h; });

  // An approved PR the ERP does not hold goes back to Draft, so its requester can correct the lines and submit it again. Its ERP
  // reference is dropped with it: the next send issues a new one, which the ERP needs after it deleted the old.
  app.post("/api/v1/purchase-requisitions/:id/withdraw", async (request) => { await users.demandPermission(request, "procurement.request"); const actor = await users.required(request); const id = positiveLong((request.params as { id?: string }).id, "Purchase requisition id");
    const body = bodyObject(request.body); const version = parseRowVersion(body.rowVersion); const reason = optionalBodyText(body.reason, 20_000, "Reason");
    const header = await takeBackHeader(id, actor, "take back");
    if (header.status !== "Approved") throw new ApiError(409, "pr_not_approved", `Only an approved requisition the ERP does not hold can be taken back; this one is '${header.status}'.`);
    await assertNotInErp(header, actor);
    return database.transaction(async (transaction) => { const h = await readHeader(transaction, id);
      const update = new sql.Request(transaction); update.input("actor", sql.BigInt, actor.id); update.input("id", sql.BigInt, id); update.input("version", sql.VarBinary(8), version);
      const row = (await update.query<{ row_version: Buffer }>(`UPDATE dbo.mat_prs SET status=N'Draft',submitted_at=NULL,erp_ref=NULL,erp_pr_id=NULL,erp_pr_no=NULL,erp_status=NULL,
          erp_status_label=NULL,erp_url=NULL,erp_revision_no=NULL,erp_rejection_reason=NULL,erp_synced_at=NULL,erp_error=NULL,updated_by=@actor,updated_at=SYSUTCDATETIME()
        OUTPUT inserted.row_version WHERE id=@id AND status=N'Approved' AND deleted_at IS NULL AND row_version=@version;`)).recordset[0];
      if (!row) throw new ApiError(409, "concurrency_conflict", "This requisition changed. Reload and try again.");
      // The route is built again when it is submitted; until then a draft shows none.
      const steps = new sql.Request(transaction); steps.input("id", sql.BigInt, id); await steps.query(`DELETE FROM dbo.mat_pr_approval_steps WHERE pr_id=@id;`);
      await insertMaterialAudit(transaction, actor, "Took purchase requisition back to Draft", "PR", id, h.pr_no, { status: "Approved", erpRef: h.erp_ref, erpPrNo: h.erp_pr_no, erpError: h.erp_error },
        { status: "Draft" }, { projectId: Number(h.project_id), reason });
      return { id, status: "Draft", rowVersion: row.row_version.toString("base64") }; });
  });

  // A PR nobody will go on with still counts against its BOM lines, which blocks a new request for them. Its requester can cancel
  // a draft, or an approved PR the ERP does not hold.
  app.post("/api/v1/purchase-requisitions/:id/cancel", async (request) => { await users.demandPermission(request, "procurement.request"); const actor = await users.required(request); const id = positiveLong((request.params as { id?: string }).id, "Purchase requisition id");
    const body = bodyObject(request.body); const version = parseRowVersion(body.rowVersion); const reason = optionalBodyText(body.reason, 20_000, "Reason");
    const header = await takeBackHeader(id, actor, "cancel");
    if (header.status !== "Draft" && header.status !== "Approved") throw new ApiError(409, "pr_not_draft", `Only a draft, or an approved requisition the ERP does not hold, can be cancelled; this one is '${header.status}'.`);
    if (header.status === "Approved") await assertNotInErp(header, actor);
    return database.transaction(async (transaction) => { const h = await readHeader(transaction, id);
      const update = new sql.Request(transaction); update.input("actor", sql.BigInt, actor.id); update.input("id", sql.BigInt, id); update.input("version", sql.VarBinary(8), version);
      update.input("status", sql.NVarChar(30), header.status);
      const row = (await update.query<{ id: number | string }>(`UPDATE dbo.mat_prs SET deleted_at=SYSUTCDATETIME(),updated_by=@actor,updated_at=SYSUTCDATETIME() OUTPUT inserted.id WHERE id=@id AND status=@status AND deleted_at IS NULL AND row_version=@version;`)).recordset[0];
      if (!row) throw new ApiError(409, "concurrency_conflict", "This requisition changed. Reload and try again.");
      await insertMaterialAudit(transaction, actor, h.status === "Draft" ? "Cancelled draft purchase requisition" : "Cancelled approved purchase requisition the ERP does not hold", "PR", id, h.pr_no,
        { status: h.status, ...(h.erp_ref ? { erpRef: h.erp_ref, erpPrNo: h.erp_pr_no, erpError: h.erp_error } : {}) }, { status: "Cancelled" }, { projectId: Number(h.project_id), reason });
      return { id, status: "Cancelled" }; });
  });

  // The Approvals menu badge: exactly what the Approvals screen lists for this user (PRs waiting for them, others' material issues and stock adjustments).
  app.get("/api/v1/procurement/approvals/attention", async (request) => { const actor = await users.required(request);
    const result = await database.query<{ waiting: number | string }>(`${APPROVE_HELD}
      DECLARE @adjust bit=CASE WHEN EXISTS(SELECT 1 FROM dbo.user_effective_permissions WHERE user_id=@actor AND code=N'inventory.adjust') THEN 1 ELSE 0 END;
      SELECT (SELECT COUNT(*) FROM dbo.mat_prs pr INNER JOIN dbo.projects p ON p.id=pr.project_id ${stepsOf()}
          WHERE pr.deleted_at IS NULL AND ${PR_SCOPE} AND ${WAITING_FOR_ACTOR})
        +(SELECT COUNT(*) FROM dbo.mirs m INNER JOIN dbo.projects p ON p.id=m.project_id WHERE @approve=1 AND m.status=N'Pending Approval' AND m.requested_by<>@actor
          AND (@elevated=1 OR p.manager_id=@actor OR p.lead_engineer_id=@actor OR EXISTS(SELECT 1 FROM dbo.project_members pm WHERE pm.project_id=p.id AND pm.user_id=@actor)))
        +(SELECT COUNT(*) FROM dbo.stock_adjustments a WHERE @adjust=1 AND a.status=N'Pending Approval' AND a.requested_by<>@actor) waiting;`, (r) => {
      r.input("actor", sql.BigInt, actor.id); r.input("elevated", sql.Bit, isProjectElevated(actor)); });
    return { waiting: Number(result.recordset[0]?.waiting ?? 0) };
  });

}
