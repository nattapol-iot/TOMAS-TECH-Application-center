import type { FastifyInstance } from "fastify";
import sql from "mssql";
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
import { isProjectElevated, isProjectManagerRole } from "../project-scope.js";
import { elevated } from "../resource-task-service.js";
import { permissionFor } from "../schedule-service.js";
import { WORK_KEY, WORKLOAD_SQL, workloadItems, workOrders } from "../resource-workload.js";

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
// Capacities, effort and holidays: shared by the planning read and the Workload read. Binds @actor.
const PLANNING_SQL = `
      SELECT * FROM dbo.resource_capacity;
      SELECT e.* FROM dbo.resource_effort e
      WHERE EXISTS(SELECT 1 FROM dbo.user_effective_permissions p WHERE p.user_id=@actor
        AND p.code=CASE e.entity_type WHEN N'Inquiry' THEN N'inquiry.read' ELSE N'estimate.read' END)
      AND ((e.entity_type=N'Inquiry' AND EXISTS(SELECT 1 FROM dbo.inquiries i WHERE i.id=e.entity_id AND i.deleted_at IS NULL))
        OR (e.entity_type=N'Estimate' AND EXISTS(SELECT 1 FROM dbo.estimates i WHERE i.id=e.entity_id AND i.deleted_at IS NULL))
        OR (e.entity_type=N'EstimateSection' AND EXISTS(SELECT 1 FROM dbo.estimate_assignments a JOIN dbo.estimates i ON i.id=a.estimate_id
          WHERE a.id=e.entity_id AND i.deleted_at IS NULL)));
      SELECT holiday_date FROM dbo.holidays;`;
const holidayDates = (rows: unknown) => (rows as { holiday_date: Date }[]).map((r) => dateOnly(r.holiday_date)!);
export function registerResourcePlanningRoutes(
  app: FastifyInstance,
  db: Database,
  users: CurrentUserService,
) {
  app.get("/api/v1/resource-planning", async (request) => {
    await users.demandPermission(request, "schedule.read");
    const actor = await users.required(request);
    const result = await db.query<Row>(PLANNING_SQL, (q) => q.input("actor", sql.BigInt, actor.id));
    return {
      capacities: (result.recordsets[0] as Row[]).map(map),
      efforts: (result.recordsets[1] as Row[]).map(map),
      holidays: holidayDates(result.recordsets[2]),
    };
  });
  // Everything the Workload screen shows, in one read; the page needs both schedule.read and project.read.
  app.get("/api/v1/resource-planning/workload", async (request) => {
    await users.demandPermission(request, "schedule.read");
    await users.demandPermission(request, "project.read");
    const actor = await users.required(request);
    const result = await db.query<Row>(`SET NOCOUNT ON;${PLANNING_SQL}${WORKLOAD_SQL}`, (q) => q
      .input("actor", sql.BigInt, actor.id)
      .input("project_elevated", sql.Bit, isProjectElevated(actor))
      // Admin, Engineering Managers and Project Managers see every inquiry task; others see the ones they are part of.
      .input("task_elevated", sql.Bit, elevated(actor) || isProjectManagerRole(actor)));
    const sets = result.recordsets as unknown as Record<string, unknown>[][];
    const holidays = holidayDates(sets[2]);
    const work = workloadItems(sets.slice(3), new Set(holidays));
    // My Work asks for the caller's own work only.
    const query = request.query as Record<string, unknown>;
    const items = query.mine === "1" || query.mine === "true" ? work.items.filter((item) => item.ownerId === actor.id) : work.items;
    return {
      capacities: (sets[0] as Row[]).map(map),
      efforts: (sets[1] as Row[]).map(map),
      holidays,
      items,
      warnings: work.warnings,
      priorities: workOrders(work.orderRows, items),
    };
  });
  // A person's own order of work, set by them or by a manager for them. Only the order is stored: plan dates never
  // move here, and a projected slip goes through the PM's day request.
  app.put("/api/v1/resource-planning/work-order/:userId", async (request) => {
    await users.demandPermission(request, "schedule.read");
    const actor = await users.required(request);
    const userId = positiveLong((request.params as { userId?: string }).userId, "User id");
    if (userId !== actor.id && !isProjectManagerRole(actor))
      throw new ApiError(403, "work_order_forbidden", "Only the person or a manager can change this work order.");
    const keys = bodyObject(request.body).keys;
    if (!Array.isArray(keys) || keys.length > 500 || new Set(keys).size !== keys.length
      || keys.some((key) => typeof key !== "string" || !WORK_KEY.test(key)))
      throw new ApiError(400, "validation_failed", "Send the work keys in order, each once, at most 500.");
    const person = (await db.query<{ id: number }>(
      "SELECT id FROM dbo.users WHERE id=@user AND is_active=1 AND deleted_at IS NULL;",
      (q) => q.input("user", sql.BigInt, userId),
    )).recordset[0];
    if (!person) throw new ApiError(404, "user_not_found", "That person is not an active user.");
    await db.transaction(async (transaction) => {
      const replace = new sql.Request(transaction);
      replace.input("user", sql.BigInt, userId).input("actor", sql.BigInt, actor.id).input("keys", sql.NVarChar(sql.MAX), JSON.stringify(keys));
      await replace.query(`DELETE FROM dbo.work_priorities WHERE user_id=@user;
        INSERT dbo.work_priorities(user_id,work_key,sort_order,updated_by)
        SELECT @user,CONVERT(nvarchar(40),ordering.[value]),CONVERT(int,ordering.[key])+1,@actor FROM OPENJSON(@keys) ordering;`);
    });
    return { userId, keys };
  });
  app.put("/api/v1/resource-planning/:kind/:id", async (request) => {
    const params = request.params as { kind: string; id: string };
    // An estimate section's own engineers plan its effort; every other planning record needs schedule.plan and write
    // access to its source. A planner may set a section's effort too (checked against the section below).
    const section = params.kind === "EstimateSection";
    if (section) await users.demandPermission(request, "estimate.read");
    else await users.demandPermission(request, "schedule.plan");
    const actor = await users.required(request);
    const id = positiveLong(params.id, "Record id"),
      body = bodyObject(request.body);
    const capacity = params.kind === "capacity";
    if (!capacity && !["Inquiry", "Estimate", "EstimateSection"].includes(params.kind))
      throw new ApiError(400, "validation_failed", "Unknown planning record.");
    if (!capacity && !section)
      await users.demandPermission(
        request,
        params.kind === "Inquiry" ? "inquiry.write" : "estimate.write",
      );
    const planner = section && (await permissionFor(db, actor.id, "schedule.plan")) && (await permissionFor(db, actor.id, "estimate.write"));
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
        await q.query<{ id: number; owner_id?: number; support_id?: number | null }>(
          section
            ? "SELECT a.id,a.owner_id,a.support_id FROM dbo.estimate_assignments a WITH(UPDLOCK,HOLDLOCK) INNER JOIN dbo.estimates e ON e.id=a.estimate_id WHERE a.id=@id AND e.deleted_at IS NULL;"
            : `SELECT id FROM dbo.${source} WITH(UPDLOCK,HOLDLOCK) WHERE id=@id AND deleted_at IS NULL${capacity ? " AND is_active=1" : ""};`,
        )
      ).recordset[0];
      if (!ref)
        throw new ApiError(404, "not_found", "Source record is unavailable.");
      if (section && !planner && Number(ref.owner_id) !== actor.id && Number(ref.support_id) !== actor.id)
        throw new ApiError(403, "section_effort_forbidden", "Only the section's engineers or a planner can plan its effort.");
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
