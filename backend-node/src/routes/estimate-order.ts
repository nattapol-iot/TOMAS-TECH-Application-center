import type { FastifyInstance } from "fastify";
import sql from "mssql";
import type { Database } from "../db.js";
import type { CurrentUserService } from "../users.js";
import { ApiError } from "../errors.js";
import { bodyObject, parseRowVersion, positiveLong } from "../http.js";
import { insertAudit } from "../audit.js";
import { assigned, elevated, estimateAssignees, lockEditableEstimate, touchEstimate } from "./estimate-cost-write.js";

const tables = { CostItem: "cost_items", ManhourLine: "manhour_lines", ExpenseLine: "expense_lines", OtherCostLine: "other_cost_lines" } as const;
export function parseOrder(body: Record<string, unknown>) {
  if (typeof body.sourceType !== "string" || !Object.hasOwn(tables, body.sourceType)) throw new ApiError(400, "validation_failed", "Invalid order source.");
  const ids = body.orderedIds;
  if (!Array.isArray(ids) || !ids.length || ids.length > 20000 || ids.some(id => !Number.isSafeInteger(id) || id <= 0) || new Set(ids).size !== ids.length) throw new ApiError(400, "validation_failed", "Order must contain unique positive line ids.");
  return { sourceType: body.sourceType as keyof typeof tables, ids: ids as number[] };
}
export function assertCompleteOrder(ids: number[], current: number[]) {
  const expected = new Set(current);
  if (ids.length !== current.length || ids.some(id => !expected.has(id))) throw new ApiError(409, "concurrency_conflict", "Estimate lines changed. Reload before reordering.");
}
/**
 * A move carries one line into the target's module, or — with keepModule — a whole
 * module block into the target's section under its own name.
 */
export function parseCostMove(value: unknown, sourceType: string, ids: number[]) {
  if (value === undefined) return null;
  if (!value || typeof value !== "object" || sourceType !== "CostItem") throw new ApiError(400, "validation_failed", "Only cost items can move between modules.");
  const { lineId, lineIds, targetLineId, keepModule } = value as Record<string, unknown>;
  const moving = lineIds === undefined ? [lineId] : lineIds;
  if (!Array.isArray(moving) || !moving.length || moving.length > 20000 || new Set(moving).size !== moving.length
    || moving.some(id => typeof id !== "number" || !ids.includes(id))
    || typeof targetLineId !== "number" || !ids.includes(targetLineId) || moving.includes(targetLineId)
    || (keepModule !== undefined && typeof keepModule !== "boolean"))
    throw new ApiError(400, "validation_failed", "Choose a current cost item and destination.");
  return { lineIds: moving as number[], targetLineId, keepModule: keepModule === true };
}
export function registerEstimateOrderRoutes(app: FastifyInstance, database: Database, users: CurrentUserService) {
  app.put("/api/v1/estimates/:id/line-order", async request => {
    await users.demandPermission(request, "estimate.write");
    const actor = await users.required(request);
    const id = positiveLong((request.params as { id: string }).id, "Estimate id");
    const body = bodyObject(request.body);
    const { sourceType, ids } = parseOrder(body);
    const version = parseRowVersion(body.estimateRowVersion);
    const move = parseCostMove(body.move, sourceType, ids);
    return database.transaction(async transaction => {
      const estimate = await lockEditableEstimate(transaction, id, version);
      if (!elevated(actor, estimate) && (sourceType === "OtherCostLine" || !assigned(actor, await estimateAssignees(transaction, id, estimate.revision)))) throw new ApiError(403, "estimate_section_forbidden", "You cannot reorder this estimate.");
      const query = new sql.Request(transaction);
      query.input("id", sql.BigInt, id); query.input("revision", sql.Int, estimate.revision);
      query.input("actor", sql.BigInt, actor.id); query.input("ids", sql.NVarChar(sql.MAX), JSON.stringify(ids));
      const table = tables[sourceType];
      const before = (await query.query<{ id: number; sort_order: number; price_set_key?: string | null; module?: string | null; category_code?: string | null; category?: string | null }>(`SELECT id,sort_order${sourceType === "CostItem" ? ",category_code,category,module,price_set_key" : ""} FROM dbo.${table} WITH(UPDLOCK,HOLDLOCK) WHERE estimate_id=@id AND revision=@revision AND deleted_at IS NULL;`)).recordset;
      assertCompleteOrder(ids, before.map(line => Number(line.id)));
      if (move) {
        const rows = new Map(before.map(row => [Number(row.id), row]));
        const moving = move.lineIds.map(lineId => rows.get(lineId)!);
        const target = rows.get(move.targetLineId)!;
        const trimmed = (value: string | null | undefined) => (value ?? "").trim();
        /* A price set is one priced thing: its members change section together or
           not at all, so a move that would strand one of them is refused. */
        const sets = new Set(moving.map(row => trimmed(row.price_set_key)).filter(Boolean));
        if (before.some(row => sets.has(trimmed(row.price_set_key)) && !move.lineIds.includes(Number(row.id))))
          throw new ApiError(409, "price_set_member", "Move the whole module or remove the item from its price set first.");
        const [first] = moving;
        if (!first) throw new ApiError(400, "validation_failed", "Choose a current cost item and destination.");
        const name = trimmed(first.module);
        const from = first.category_code;
        if (move.keepModule && moving.some(row => trimmed(row.module) !== name || row.category_code !== from))
          throw new ApiError(400, "validation_failed", "A module move carries one module of one section.");
        query.input("moving_ids", sql.NVarChar(sql.MAX), JSON.stringify(move.lineIds));
        query.input("target_id", sql.BigInt, move.targetLineId);
        if (move.keepModule && name && target.category_code !== from) {
          const clash = new sql.Request(transaction);
          clash.input("id", sql.BigInt, id); clash.input("revision", sql.Int, estimate.revision);
          clash.input("category", sql.Char(2), target.category_code); clash.input("module", sql.NVarChar(200), name);
          clash.input("moving_ids", sql.NVarChar(sql.MAX), JSON.stringify(move.lineIds));
          if ((await clash.query(`SELECT TOP(1) id FROM dbo.cost_items WHERE estimate_id=@id AND revision=@revision
            AND deleted_at IS NULL AND category_code=@category AND LTRIM(RTRIM(module)) COLLATE Latin1_General_100_BIN2=@module
            AND id NOT IN (SELECT CONVERT(bigint,value) FROM OPENJSON(@moving_ids));`)).recordset[0])
            throw new ApiError(409, "module_name_exists", "Another module already uses this name in that section.");
          /* The module's quantity, unit and description rows are stored under a key
             that names its section, so they travel with it instead of being
             silently left behind under the old key. */
          const details = new sql.Request(transaction);
          details.input("id", sql.BigInt, id); details.input("revision", sql.Int, estimate.revision);
          details.input("old_key", sql.NVarChar(250), "category:" + from + ":" + name);
          details.input("new_key", sql.NVarChar(250), "category:" + target.category_code + ":" + name);
          await details.query(`DELETE FROM dbo.estimate_module_details WHERE estimate_id=@id AND revision=@revision AND module_key=@new_key;
            UPDATE dbo.estimate_module_details SET module_key=@new_key WHERE estimate_id=@id AND revision=@revision AND module_key=@old_key;
            DELETE FROM dbo.estimate_module_details WHERE estimate_id=@id AND revision=@revision AND module_key=N'erp:'+@new_key;
            UPDATE dbo.estimate_module_details SET module_key=N'erp:'+@new_key WHERE estimate_id=@id AND revision=@revision AND module_key=N'erp:'+@old_key;`);
        }
        // Destination identity is read from locked current-revision rows, never trusted from the browser.
        await query.query(`UPDATE moving SET ${move.keepModule ? "" : "module=target.module,"}category_code=target.category_code,category=target.category,
          updated_by=@actor,updated_at=SYSUTCDATETIME()
          FROM dbo.cost_items moving INNER JOIN dbo.cost_items target ON target.id=@target_id
          AND target.estimate_id=@id AND target.revision=@revision AND target.deleted_at IS NULL
          INNER JOIN OPENJSON(@moving_ids) ordering ON moving.id=CONVERT(bigint,ordering.value)
          WHERE moving.estimate_id=@id AND moving.revision=@revision AND moving.deleted_at IS NULL;`);
      }
      await query.query(`UPDATE line SET sort_order=CONVERT(int,ordering.[key]),updated_by=@actor,updated_at=SYSUTCDATETIME()
        FROM dbo.${table} line INNER JOIN OPENJSON(@ids) ordering ON line.id=CONVERT(bigint,ordering.value)
        WHERE line.estimate_id=@id AND line.revision=@revision AND line.deleted_at IS NULL;`);
      const updated = await touchEstimate(transaction, id, actor.id);
      await insertAudit(transaction, actor.id, "Estimate", id, estimate.estimate_no, move ? (move.keepModule ? "Module moved" : "Cost item moved") : "Line order updated", { sourceType, revision: estimate.revision, lines: before }, { sourceType, revision: estimate.revision, orderedIds: ids, move });
      return { estimateRowVersion: updated.toString("base64") };
    });
  });
}
