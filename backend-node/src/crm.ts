import sql from "mssql";
import type { FastifyRequest } from "fastify";
import type { Database } from "./db.js";
import type { CurrentUserService } from "./users.js";
import { ApiError } from "./errors.js";
import { optionalBodyText, requiredText, requiredInteger, parseDateOnly } from "./http.js";

export const CRM_STAGES = ["NEW", "QUALIFICATION", "REQUIREMENT", "ESTIMATING", "PROPOSAL", "NEGOTIATION", "WON", "LOST", "ON_HOLD"] as const;
export const CRM_ACTIVITY_TYPES = ["Meeting", "Call", "Email", "SiteVisit", "CustomerUpdate", "InternalDiscussion", "MessageLINE", "Note", "Other"];
export const TERMINAL_INQUIRY_STATUSES = ["Approved", "Cancelled"] as const;
export function opportunityStageAfterInquiry(stage: unknown): string {
  return ["NEW", "QUALIFICATION", "REQUIREMENT"].includes(String(stage)) ? "ESTIMATING" : String(stage);
}
export type CrmRow = Record<string, unknown>;
export type CrmAccess = { id: number; department: string; permissions: string[] };
export async function crmAccess(database: Database, users: CurrentUserService, request: FastifyRequest, permission = "crm.read"): Promise<CrmAccess> {
  await users.demandPermission(request, permission);
  const actor = await users.required(request);
  const result = await database.query<{ code: string }>("SELECT code FROM dbo.user_effective_permissions WHERE user_id=@actor", q => q.input("actor", sql.BigInt, actor.id));
  return { id: actor.id, department: actor.department, permissions: result.recordset.map(r => r.code) };
}
export function bindAccess(q: sql.Request, actor: CrmAccess) {
  return q.input("actor", sql.BigInt, actor.id).input("department", sql.NVarChar(100), actor.department)
    .input("all", sql.Bit, actor.permissions.includes("crm.read.all"))
    .input("team", sql.Bit, actor.permissions.includes("crm.read.team"));
}
export const CRM_SCOPE = `(@all=1 OR o.sales_owner_id=@actor OR o.technical_owner_id=@actor
 OR EXISTS(SELECT 1 FROM dbo.crm_followups f WHERE f.opportunity_id=o.id AND f.owner_id=@actor)
 OR (@team=1 AND @department<>N'' AND EXISTS(SELECT 1 FROM dbo.users team_owner WHERE team_owner.id IN(o.sales_owner_id,o.technical_owner_id) AND team_owner.department=@department)))`;
export const CRM_READ_JOINS = `FROM dbo.crm_opportunities o
 LEFT JOIN dbo.crm_options opt ON opt.kind='stage' AND opt.code=o.stage
 OUTER APPLY(SELECT MAX(occurred_at) last_activity FROM dbo.crm_activities WHERE opportunity_id=o.id) a
 OUTER APPLY(SELECT TOP(1) action,due_date,status,owner_id FROM dbo.crm_followups WHERE opportunity_id=o.id AND status NOT IN('Done','Cancelled') ORDER BY due_date,id) f
 OUTER APPLY(SELECT MIN(e.due_date) estimate_due FROM dbo.estimates e JOIN dbo.inquiries i ON i.id=e.inquiry_id WHERE i.opportunity_id=o.id AND e.deleted_at IS NULL AND e.status NOT IN('Approved','Locked')) ed`;
export const CRM_NEEDS_FOLLOWUP = `(o.stage NOT IN('WON','LOST','ON_HOLD') AND ((opt.quiet_days IS NOT NULL AND DATEDIFF(day,CASE WHEN o.stage='PROPOSAL' THEN o.stage_changed_at ELSE COALESCE(a.last_activity,o.created_at) END,@today)>=opt.quiet_days) OR (o.stage='ESTIMATING' AND ed.estimate_due<=DATEADD(day,3,@today))))`;
export async function scopedOpportunity(q: sql.Request, id: number, lock = false): Promise<CrmRow> {
  q.input("id", sql.BigInt, id);
  const row = (await q.query(`SELECT o.*,eu.name end_user_name,eu.code end_user_code FROM dbo.crm_opportunities o ${lock ? "WITH(UPDLOCK,HOLDLOCK)" : ""} LEFT JOIN dbo.customers eu ON eu.id=o.end_user_customer_id WHERE o.id=@id AND ${CRM_SCOPE}`)).recordset[0];
  if (!row) throw new ApiError(404, "crm_not_found", "CRM record not found or unavailable.");
  return row;
}
export function crmDto(row: CrmRow, commercial = true): CrmRow {
  return Object.fromEntries(Object.entries(row).filter(([key]) => commercial || !["expected_value", "total", "before_json", "after_json"].includes(key)).map(([key,value]) => [key.replace(/_([a-z])/g, (_,c: string) => c.toUpperCase()), Buffer.isBuffer(value) ? value.toString("base64") : value instanceof Date ? (["due_date","expected_close","next_due","estimate_due","target_delivery"].includes(key)?value.toISOString().slice(0,10):value.toISOString()) : value!=null&&(key==="id"||key.endsWith("_id"))?Number(value):value]));
}
export function crmChoice(value: unknown, choices: readonly string[], label: string): string {
  const result = requiredText(value, 40, label);
  if (!choices.includes(result)) throw new ApiError(400, "validation_failed", `${label} is invalid.`);
  return result;
}
export function crmId(value: unknown, label: string): number | null { return value === "" || value == null ? null : requiredInteger(typeof value==="string"&&/^\d+$/.test(value)?Number(value):value,label,1); }
export function crmText(value: unknown, max = 4000): string { return optionalBodyText(value,max,"CRM text") ?? ""; }
export function opportunityInput(body: CrmRow, commercial: boolean) {
  const stage = crmChoice(body.stage ?? "NEW", CRM_STAGES,"Stage");
  const lostReason = crmText(body.lostReason,40) || null, lostDetail = crmText(body.lostDetail,2000);
  if (stage === "LOST" && (!lostReason || (lostReason === "Other" && !lostDetail.trim()))) throw new ApiError(400,"crm_lost_reason_required","Lost reason is required; Other requires details.");
  let value: number | null = null;
  if (commercial && body.expectedValue !== "" && body.expectedValue != null) {
    if(typeof body.expectedValue!=="number" && !(typeof body.expectedValue==="string"&&/^\d+(\.\d+)?$/.test(body.expectedValue)))throw new ApiError(400,"validation_failed","Expected value must be a number.");
    value = Number(body.expectedValue);
    if (!Number.isFinite(value) || value < 0 || value > 99999999999999) throw new ApiError(400,"validation_failed","Expected value must be non-negative.");
  }
  return {
    name: requiredText(body.name,300,"Opportunity name"), customerId: requiredInteger(body.customerId,"Customer",1), endUserCustomerId: crmId(body.endUserCustomerId,"End user"),
    siteId: crmId(body.siteId,"Site"), contactId: crmId(body.contactId,"Contact"), salesOwnerId: requiredInteger(body.salesOwnerId,"Sales owner",1), technicalOwnerId: crmId(body.technicalOwnerId,"Technical owner"),
    source: crmText(body.source,40) || "DirectInquiry", need: crmText(body.need,20000), scope: crmText(body.scope,20000),
    expectedValue: value, expectedClose: parseDateOnly(body.expectedClose || null,"Expected close",true), stage,
    probability: body.probability === "" || body.probability == null ? null : requiredInteger(body.probability,"Probability",0,100),
    competitor: crmText(body.competitor,300), priority: crmChoice(body.priority ?? "Normal",["Low","Normal","High","Urgent"],"Priority"),
    lostReason, lostDetail, internalNote: crmText(body.internalNote,20000),
  };
}
export function followupInput(body: CrmRow) {
  return { action: requiredText(body.action,1000,"Next action"), ownerId: requiredInteger(body.ownerId,"Action owner",1),
    dueDate: parseDateOnly(body.dueDate,"Due date")!, priority: crmChoice(body.priority ?? "Normal",["Low","Normal","High","Urgent"],"Priority"),
    status: crmChoice(body.status ?? "Open",["Open","WaitingCustomer","WaitingInternal","WaitingSupplier","Done","Cancelled"],"Follow-up status") };
}
export function crmAttention(row: CrmRow, today: string): string[] {
  if (["WON","LOST","ON_HOLD"].includes(String(row.stage))) return [];
  const flags: string[] = [];
  const date = (v: unknown) => v instanceof Date ? v.toISOString().slice(0,10) : String(v ?? "").slice(0,10);
  const due = date(row.next_due), estimateDue = date(row.estimate_due);
  const soon = new Date(`${today}T00:00:00Z`); soon.setUTCDate(soon.getUTCDate()+3);
  if (!row.next_action) flags.push("NoNextAction");
  if (due) flags.push(due < today ? "Overdue" : due === today ? "DueToday" : due <= soon.toISOString().slice(0,10) ? "DueSoon" : "Scheduled");
  if (String(row.next_status).startsWith("Waiting")) flags.push(String(row.next_status));
  if (!row.last_activity) flags.push("NoActivity");
  const base = row.stage === "PROPOSAL" ? row.stage_changed_at : row.last_activity ?? row.created_at;
  const quiet = Math.floor((Date.parse(`${today}T00:00:00Z`) - Date.parse(date(base))) / 86400000);
  if ((row.quiet_days != null && quiet >= Number(row.quiet_days)) || (row.stage === "ESTIMATING" && estimateDue && estimateDue <= soon.toISOString().slice(0,10))) flags.push("NeedsFollowup");
  if (estimateDue && estimateDue <= soon.toISOString().slice(0,10)) flags.push("EstimateDueSoon");
  return flags;
}

export async function validateCrmReferences(q: sql.Request, input: ReturnType<typeof opportunityInput>) {
  q.input("customer",sql.BigInt,input.customerId).input("endUser",sql.BigInt,input.endUserCustomerId).input("site",sql.BigInt,input.siteId).input("contact",sql.BigInt,input.contactId)
    .input("sales",sql.BigInt,input.salesOwnerId).input("technical",sql.BigInt,input.technicalOwnerId)
    .input("source",sql.NVarChar(40),input.source).input("lost",sql.NVarChar(40),input.lostReason);
  const r = (await q.query(`SELECT CASE WHEN EXISTS(SELECT 1 FROM dbo.customers WHERE id=@customer AND is_active=1 AND deleted_at IS NULL)
 AND (@endUser IS NULL OR EXISTS(SELECT 1 FROM dbo.customers WHERE id=@endUser AND is_active=1 AND deleted_at IS NULL))
 AND (@site IS NULL OR EXISTS(SELECT 1 FROM dbo.customer_sites WHERE id=@site AND customer_id=@customer AND is_active=1 AND deleted_at IS NULL))
 AND (@contact IS NULL OR EXISTS(SELECT 1 FROM dbo.customer_site_contacts c JOIN dbo.customer_sites s ON s.id=c.site_id WHERE c.id=@contact AND s.customer_id=@customer AND (@site IS NULL OR s.id=@site) AND c.is_active=1 AND c.deleted_at IS NULL AND s.is_active=1 AND s.deleted_at IS NULL))
 AND EXISTS(SELECT 1 FROM dbo.users WHERE id=@sales AND is_active=1 AND deleted_at IS NULL)
 AND (@technical IS NULL OR EXISTS(SELECT 1 FROM dbo.users WHERE id=@technical AND is_active=1 AND deleted_at IS NULL))
 AND EXISTS(SELECT 1 FROM dbo.crm_options WHERE kind='source' AND code=@source AND is_active=1)
 AND (@lost IS NULL OR EXISTS(SELECT 1 FROM dbo.crm_options WHERE kind='lostReason' AND code=@lost AND is_active=1))
 THEN 1 ELSE 0 END valid`)).recordset[0];
  if (!r?.valid) throw new ApiError(422,"invalid_reference","Select active CRM references belonging to this customer.");
}
