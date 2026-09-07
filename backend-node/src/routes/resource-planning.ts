import type { FastifyInstance } from "fastify";
import sql from "mssql/msnodesqlv8.js";
import type { Database } from "../db.js";
import type { CurrentUserService } from "../users.js";
import {
  bodyObject,
  dateOnly,
  parseDateOnly,
  parseRowVersion,
  positiveLong,
} from "../http.js";
import { ApiError } from "../errors.js";
import { insertAudit } from "../audit.js";

type Row = Record<string, unknown> & { row_version: Buffer };
const map = (r: Row) => ({
  entityType: r.entity_type,
  entityId: Number(r.entity_id),
  userId: Number(r.user_id),
  start: dateOnly((r.start_date ?? null) as Date | null),
  end: dateOnly((r.end_date ?? null) as Date | null),
  manDays: Number(r.man_days),
  daysPerWeek: Number(r.days_per_week),
  rowVersion: r.row_version.toString("base64"),
});
function decimal(value: unknown, max: number): number {
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    value < 0 ||
    value > max ||
    Math.abs(value * 100 - Math.round(value * 100)) > 0.00001
  )
    throw new ApiError(
      400,
      "validation_failed",
      "Enter a non-negative number with at most two decimals.",
    );
  return value;
}
export function registerResourcePlanningRoutes(
  app: FastifyInstance,
  db: Database,
  users: CurrentUserService,
) {
  app.get("/api/v1/resource-planning", async (request) => {
    await users.demandPermission(request, "schedule.read");
    const actor = await users.required(request);
    const result = await db.query<Row>(
      `
      SELECT * FROM dbo.resource_capacity;
      SELECT e.* FROM dbo.resource_effort e
      WHERE EXISTS(SELECT 1 FROM dbo.roles r JOIN dbo.role_permissions rp ON rp.role_id=r.id
        JOIN dbo.permissions p ON p.id=rp.permission_id WHERE r.code=@role
        AND p.code=CASE e.entity_type WHEN N'Inquiry' THEN N'inquiry.read' ELSE N'estimate.read' END)
      AND ((e.entity_type=N'Inquiry' AND EXISTS(SELECT 1 FROM dbo.inquiries i WHERE i.id=e.entity_id AND i.deleted_at IS NULL))
        OR (e.entity_type=N'Estimate' AND EXISTS(SELECT 1 FROM dbo.estimates i WHERE i.id=e.entity_id AND i.deleted_at IS NULL)));
      SELECT holiday_date FROM dbo.holidays;
    `,
      (q) => q.input("role", sql.NVarChar(50), actor.role),
    );
    return {
      capacities: (result.recordsets[0] as Row[]).map(map),
      efforts: (result.recordsets[1] as Row[]).map(map),
      holidays: (
        result.recordsets[2] as unknown as { holiday_date: Date }[]
      ).map((r) => dateOnly(r.holiday_date)),
    };
  });
  app.put("/api/v1/resource-planning/:kind/:id", async (request) => {
    await users.demandPermission(request, "schedule.plan");
    const actor = await users.required(request),
      params = request.params as { kind: string; id: string };
    const id = positiveLong(params.id, "Record id"),
      body = bodyObject(request.body);
    const capacity = params.kind === "capacity";
    if (!capacity && !["Inquiry", "Estimate"].includes(params.kind))
      throw new ApiError(400, "validation_failed", "Unknown planning record.");
    if (!capacity)
      await users.demandPermission(
        request,
        params.kind === "Inquiry" ? "inquiry.write" : "estimate.write",
      );
    const expected =
      body.rowVersion == null ? null : parseRowVersion(body.rowVersion);
    const amount = decimal(
      capacity ? body.daysPerWeek : body.manDays,
      capacity ? 5 : 100000,
    );
    const start = capacity ? null : parseDateOnly(body.start, "Start date"),
      end = capacity ? null : parseDateOnly(body.end, "End date");
    if (
      !capacity &&
      (!start ||
        !end ||
        end < start ||
        Date.parse(end) - Date.parse(start) > 3650 * 86400000)
    )
      throw new ApiError(
        400,
        "validation_failed",
        "Valid start/end dates spanning at most ten years are required.",
      );
    return db.transaction(async (tx) => {
      const q = new sql.Request(tx);
      q.input("id", sql.BigInt, id)
        .input("kind", sql.NVarChar(20), params.kind)
        .input("amount", sql.Decimal(12, 2), amount)
        .input("start", sql.Date, start)
        .input("end", sql.Date, end)
        .input("actor", sql.BigInt, actor.id);
      // Table names are selected only from constants, never from request input.
      const source = capacity
        ? "users"
        : params.kind === "Inquiry"
          ? "inquiries"
          : "estimates";
      const ref = (
        await q.query(
          `SELECT id FROM dbo.${source} WITH(UPDLOCK,HOLDLOCK) WHERE id=@id AND deleted_at IS NULL${capacity ? " AND is_active=1" : ""};`,
        )
      ).recordset[0];
      if (!ref)
        throw new ApiError(404, "not_found", "Source record is unavailable.");
      if (params.kind === "Inquiry" && (await q.query('SELECT inquiry_id FROM dbo.resource_task_sources WHERE inquiry_id=@id')).recordset.length)
        throw new ApiError(409, "inquiry_task_mode", "This inquiry uses approved task effort. Submit a task plan change in Resource Plan instead.");
      const table = capacity ? "resource_capacity" : "resource_effort";
      const predicate = capacity
        ? "user_id=@id"
        : "entity_type=@kind AND entity_id=@id";
      const current = (
        await q.query<Row>(
          `SELECT * FROM dbo.${table} WITH(UPDLOCK,HOLDLOCK) WHERE ${predicate};`,
        )
      ).recordset[0];
      if (
        current
          ? !expected || !current.row_version.equals(expected)
          : expected !== null
      )
        throw new ApiError(
          409,
          "concurrency_conflict",
          "Planning data changed. Reload before saving.",
        );
      const statement = capacity
        ? current
          ? "UPDATE dbo.resource_capacity SET days_per_week=@amount,updated_by=@actor,updated_at=SYSUTCDATETIME() OUTPUT inserted.* WHERE user_id=@id"
          : "INSERT dbo.resource_capacity(user_id,days_per_week,updated_by) OUTPUT inserted.* VALUES(@id,@amount,@actor)"
        : current
          ? "UPDATE dbo.resource_effort SET start_date=@start,end_date=@end,man_days=@amount,updated_by=@actor,updated_at=SYSUTCDATETIME() OUTPUT inserted.* WHERE entity_type=@kind AND entity_id=@id"
          : "INSERT dbo.resource_effort(entity_type,entity_id,start_date,end_date,man_days,updated_by) OUTPUT inserted.* VALUES(@kind,@id,@start,@end,@amount,@actor)";
      const saved = (await q.query<Row>(statement)).recordset[0]!;
      await insertAudit(
        tx,
        actor.id,
        "ResourcePlan",
        id,
        params.kind,
        "Planning updated",
        current ? map(current) : null,
        map(saved),
      );
      return map(saved);
    }, sql.ISOLATION_LEVEL.SERIALIZABLE);
  });
}
