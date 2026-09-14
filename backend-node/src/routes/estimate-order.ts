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
export function parseCostMove(value: unknown, sourceType: string, ids: number[]) {
  if (value === undefined) return null;
  if (!value || typeof value !== "object" || sourceType !== "CostItem") throw new ApiError(400, "validation_failed", "Only cost items can move between modules.");
  const { lineId, targetLineId } = value as Record<string, unknown>;
  if (typeof lineId !== "number" || typeof targetLineId !== "number" || lineId === targetLineId || !ids.includes(lineId) || !ids.includes(targetLineId)) throw new ApiError(400, "validation_failed", "Choose a current cost item and destination.");
  return { lineId, targetLineId };
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
      const before = (await query.query<{ id: number; sort_order: number; price_set_key?: string | null }>(`SELECT id,sort_order${sourceType === "CostItem" ? ",category_code,category,module,price_set_key" : ""} FROM dbo.${table} WITH(UPDLOCK,HOLDLOCK) WHERE estimate_id=@id AND revision=@revision AND deleted_at IS NULL;`)).recordset;
      assertCompleteOrder(ids, before.map(line => Number(line.id)));
      if (move) {
        if (before.find(row => Number(row.id) === move.lineId)?.price_set_key) throw new ApiError(409, "price_set_member", "Move the whole module or remove the item from its price set first.");
        query.input("moving_id", sql.BigInt, move.lineId);
        query.input("target_id", sql.BigInt, move.targetLineId);
        // Destination identity is read from locked current-revision rows, never trusted from the browser.
        await query.query(`UPDATE moving SET module=target.module,category_code=target.category_code,category=target.category,
          updated_by=@actor,updated_at=SYSUTCDATETIME()
          FROM dbo.cost_items moving INNER JOIN dbo.cost_items target ON target.id=@target_id
          AND target.estimate_id=@id AND target.revision=@revision AND target.deleted_at IS NULL
          WHERE moving.id=@moving_id AND moving.estimate_id=@id AND moving.revision=@revision AND moving.deleted_at IS NULL;`);
      }
      await query.query(`UPDATE line SET sort_order=CONVERT(int,ordering.[key]),updated_by=@actor,updated_at=SYSUTCDATETIME()
        FROM dbo.${table} line INNER JOIN OPENJSON(@ids) ordering ON line.id=CONVERT(bigint,ordering.value)
        WHERE line.estimate_id=@id AND line.revision=@revision AND line.deleted_at IS NULL;`);
      const updated = await touchEstimate(transaction, id, actor.id);
      await insertAudit(transaction, actor.id, "Estimate", id, estimate.estimate_no, move ? "Cost item moved" : "Line order updated", { sourceType, revision: estimate.revision, lines: before }, { sourceType, revision: estimate.revision, orderedIds: ids, move });
      return { estimateRowVersion: updated.toString("base64") };
    });
  });
}
