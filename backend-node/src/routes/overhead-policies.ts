import type { FastifyInstance } from "fastify";
import sql from "mssql";
import type { AppConfig } from "../config.js";
import { insertAudit } from "../audit.js";
import type { Database } from "../db.js";
import { ApiError } from "../errors.js";
import { hasRole } from "../user-roles.js";
import { bodyObject, dateOnly, parseDateOnly, parseRowVersion, positiveLong, requiredInteger, requiredText } from "../http.js";
import { OVERHEAD_METHOD, overheadDecimal, snapshotOverheadPolicy, validateOverheadRate, type OverheadSnapshotRow } from "../overhead.js";
import { assertEstimateTotals } from "../estimate-total-guard.js";
import type { CurrentUserService } from "../users.js";

const EDITABLE = new Set(["Draft", "Engineering Input", "Revision Required"]);

function todayIn(timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function mapPolicy(row: Record<string, unknown>) {
  return { id: Number(row.id), version: Number(row.policy_version), method: row.method, monthlyBudget: Number(row.monthly_budget),
    normalDirectHours: Number(row.normal_direct_hours), hourlyRate: Number(row.hourly_rate),
    effectiveFrom: dateOnly(row.effective_from as Date | string), reason: row.reason, createdBy: Number(row.created_by),
    createdByName: row.created_by_name, createdAt: row.created_at, rowVersion: (row.row_version as Buffer).toString("base64") };
}

function mapSnapshot(row: OverheadSnapshotRow, eligibleDirectHours: number, amount: number) {
  const hourlyRate = Number(row.hourly_rate);
  return { state: Number(row.monthly_budget) === 0 ? "Zero" : "Applied", policyId: Number(row.policy_id),
    policyVersion: Number(row.policy_version), method: row.method, monthlyBudget: Number(row.monthly_budget),
    normalDirectHours: Number(row.normal_direct_hours), hourlyRate, effectiveFrom: dateOnly(row.effective_from),
    reason: row.reason, eligibleDirectHours, amount };
}

export function registerOverheadPolicyRoutes(app: FastifyInstance, config: AppConfig, database: Database, users: CurrentUserService): void {
  app.get("/api/v1/overhead-policies", async (request) => {
    await users.demandPermission(request, "master.read"); const today = todayIn(config.businessTimeZone);
    const result = await database.query<Record<string, unknown>>(`SELECT p.id,p.policy_version,p.method,p.monthly_budget,p.normal_direct_hours,
      p.hourly_rate,p.effective_from,p.reason,p.created_by,u.name created_by_name,p.created_at,p.row_version
      FROM dbo.overhead_policies p INNER JOIN dbo.users u ON u.id=p.created_by ORDER BY p.effective_from DESC,p.id DESC;
      SELECT TOP(1) id FROM dbo.overhead_policies WHERE effective_from<=@today ORDER BY effective_from DESC,id DESC;`,
      (sqlRequest) => sqlRequest.input("today", sql.Date, today));
    const active = (result.recordsets[1] as unknown as Array<{ id: number | string }>)[0];
    return { items: (result.recordsets[0] as unknown as Array<Record<string, unknown>>).map(mapPolicy), activePolicyId: active ? Number(active.id) : null };
  });

  app.post("/api/v1/overhead-policies", async (request, reply) => {
    await users.demandPermission(request, "master.write"); const actor = await users.required(request);
    if (!hasRole(actor, "Engineering Manager", "Admin")) throw new ApiError(403, "overhead_manager_required", "Only an engineering manager or administrator can create an overhead policy.");
    const body = bodyObject(request.body); const monthlyBudget = overheadDecimal(body.monthlyBudget, 0, 999_999_999_999, "Monthly overhead budget");
    const normalDirectHours = overheadDecimal(body.normalDirectHours, 0.0001, 1_000_000, "Normal direct hours");
    validateOverheadRate(monthlyBudget,normalDirectHours);
    const effectiveFrom = parseDateOnly(body.effectiveFrom, "Effective date")!; const reason = requiredText(body.reason, 500, "Policy reason");
    const today = todayIn(config.businessTimeZone);
    if (effectiveFrom < today) throw new ApiError(400, "overhead_retroactive_forbidden", "An overhead policy cannot start before today because historical estimates must not be recalculated.");
    const created = await database.transaction(async (transaction) => {
      const insert = new sql.Request(transaction); insert.input("budget", sql.Decimal(19,4), monthlyBudget);
      insert.input("hours", sql.Decimal(19,4), normalDirectHours); insert.input("effective_from", sql.Date, effectiveFrom);
      insert.input("reason", sql.NVarChar(500), reason); insert.input("actor", sql.BigInt, actor.id);
      const duplicate = (await insert.query<{ duplicate: boolean }>(`SELECT CONVERT(bit,CASE WHEN EXISTS(SELECT 1 FROM dbo.overhead_policies WITH(UPDLOCK,HOLDLOCK)
        WHERE effective_from=@effective_from) THEN 1 ELSE 0 END) duplicate;`)).recordset[0]?.duplicate;
      if (duplicate) throw new ApiError(409, "overhead_effective_date_exists", "An overhead policy already starts on this date. Choose another effective date.");
      const row = (await insert.query<Record<string, unknown>>(`DECLARE @version int=COALESCE((SELECT MAX(policy_version) FROM dbo.overhead_policies WITH(UPDLOCK,HOLDLOCK)),0)+1;
        INSERT dbo.overhead_policies(policy_version,method,monthly_budget,normal_direct_hours,effective_from,reason,created_by)
        OUTPUT inserted.id,inserted.policy_version,inserted.method,inserted.monthly_budget,inserted.normal_direct_hours,inserted.hourly_rate,
          inserted.effective_from,inserted.reason,inserted.created_by,inserted.created_at,inserted.row_version
        VALUES(@version,N'${OVERHEAD_METHOD}',@budget,@hours,@effective_from,@reason,@actor);`)).recordset[0]!;
      await insertAudit(transaction, actor.id, "OverheadPolicy", Number(row.id), `OH-${String(row.policy_version).padStart(3,"0")}`, "Created", null,
        { method: OVERHEAD_METHOD, monthlyBudget, normalDirectHours, hourlyRate: Number(row.hourly_rate), effectiveFrom, reason });
      return { ...row, created_by_name: actor.name };
    });
    return reply.status(201).send(mapPolicy(created));
  });

  app.post("/api/v1/estimates/:id/overhead/apply", async (request) => {
    await users.demandPermission(request, "estimate.write"); const actor = await users.required(request);
    const id = positiveLong((request.params as { id?: string }).id, "Estimate id"); const body = bodyObject(request.body);
    const rowVersion = parseRowVersion(body.rowVersion); const policyId = body.policyId === undefined ? null : requiredInteger(body.policyId, "Overhead policy", 1);
    const today = todayIn(config.businessTimeZone);
    return database.transaction(async (transaction) => {
      const lock = new sql.Request(transaction); lock.input("id",sql.BigInt,id); lock.input("row_version",sql.VarBinary(8),rowVersion);
      const estimate = (await lock.query<{ estimate_no:string; revision:number; status:string; owner_id:number|string; row_version:Buffer }>(`SELECT estimate_no,revision,status,owner_id,row_version
        FROM dbo.estimates WITH(UPDLOCK,HOLDLOCK) WHERE id=@id AND deleted_at IS NULL;`)).recordset[0];
      if (!estimate) throw new ApiError(404,"estimate_not_found","Estimate not found.");
      if (!estimate.row_version.equals(rowVersion)) throw new ApiError(409,"concurrency_conflict","This estimate was changed by another user. Reload and try again.");
      if (!EDITABLE.has(estimate.status)) throw new ApiError(409,"estimate_locked","Overhead can be applied only to an editable estimate revision.");
      if (Number(estimate.owner_id)!==actor.id && !hasRole(actor, "Engineering Manager", "Admin")) throw new ApiError(403,"estimate_owner_required","Only the estimate owner, an engineering manager or an administrator can apply overhead.");
      const snapshot = await snapshotOverheadPolicy(transaction,id,estimate.revision,actor.id,today,policyId);
      if (!snapshot) throw new ApiError(409,"overhead_policy_missing","No overhead policy is effective yet. Create a policy before applying overhead.");
      await assertEstimateTotals(transaction, id);
      const totalsRequest = new sql.Request(transaction); totalsRequest.input("id",sql.BigInt,id); totalsRequest.input("actor",sql.BigInt,actor.id);
      const totals = (await totalsRequest.query<{ internal_direct_hours:number|string; overhead_total:number|string; row_version:Buffer }>(`UPDATE dbo.estimates SET updated_by=@actor,updated_at=SYSUTCDATETIME() OUTPUT inserted.row_version WHERE id=@id;
        SELECT internal_direct_hours,overhead_total FROM dbo.v_estimate_totals WHERE estimate_id=@id;`));
      const version = (totals.recordsets[0] as unknown as Array<{row_version:Buffer}>)[0]!.row_version;
      const calculated=(totals.recordsets[1] as unknown as Array<{internal_direct_hours:number|string;overhead_total:number|string}>)[0]!;
      const overhead = mapSnapshot(snapshot,Number(calculated.internal_direct_hours ?? 0),Number(calculated.overhead_total ?? 0));
      await insertAudit(transaction,actor.id,"Estimate",id,estimate.estimate_no,"Overhead policy applied",null,overhead);
      return { estimateId:id,revision:estimate.revision,overhead,rowVersion:version.toString("base64") };
    });
  });
}
