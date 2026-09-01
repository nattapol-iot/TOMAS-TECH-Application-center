import sql from "mssql/msnodesqlv8.js";
import type { Transaction } from "mssql";
import type { FastifyInstance } from "fastify";
import { insertAudit } from "./audit.js";
import type { Database } from "./db.js";
import { ApiError } from "./errors.js";
import { bodyObject, parseRowVersion, positiveLong } from "./http.js";
import { demandProjectScope } from "./project-scope.js";
import type { CurrentUserService } from "./users.js";

export function endUserCustomerId(value: unknown, required = false): number | null | undefined {
  if (value === undefined && !required) return undefined;
  if (value === null) return null;
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value <= 0) {
    throw new ApiError(400, "validation_failed", "End user must be a customer id or null.");
  }
  return value;
}

export function demandEditableEndUser(status: string): void {
  if (["Closed", "Cancelled", "Rejected"].includes(status)) {
    throw new ApiError(409, "source_closed", "The end user cannot be changed on a closed, cancelled or rejected record.");
  }
}

export async function validateEndUser(transaction: Transaction, id: number | null): Promise<{ endUserCustomerId: number | null; endUserName: string | null; endUserCode: string | null }> {
  if (id === null) return { endUserCustomerId: null, endUserName: null, endUserCode: null };
  const lookup = new sql.Request(transaction);
  lookup.input("end_user_id", sql.BigInt, id);
  const row = (await lookup.query<{ name: string; code: string }>(`
    SELECT name,code FROM dbo.customers WITH (HOLDLOCK) WHERE id=@end_user_id AND is_active=1 AND deleted_at IS NULL;
  `)).recordset[0];
  if (!row) throw new ApiError(422, "invalid_reference", "The selected end user must be an active customer.");
  return { endUserCustomerId: id, endUserName: row.name, endUserCode: row.code };
}

export function registerEndUserUpdateRoute(app: FastifyInstance, database: Database, users: CurrentUserService, entity: "Inquiry" | "Project"): void {
  const project = entity === "Project";
  const table = project ? "projects" : "inquiries";
  const numberColumn = project ? "project_no" : "inquiry_no";
  app.put(`/api/v1/${table}/:id/end-user`, async (request) => {
    await users.demandPermission(request, project ? "project.write" : "inquiry.write");
    const actor = await users.required(request);
    const id = positiveLong((request.params as { id: string }).id, `${entity} id`);
    const body = bodyObject(request.body);
    const nextId = endUserCustomerId(body.endUserCustomerId, true)!;
    const rowVersion = parseRowVersion(body.rowVersion);
    return database.transaction(async (transaction) => {
      if (project) await demandProjectScope(database, actor, id, transaction);
      const lookup = new sql.Request(transaction);
      lookup.input("id", sql.BigInt, id);
      const current = (await lookup.query<{ number: string; status: string; end_user_customer_id: number | string | null; end_user_name: string | null; end_user_code: string | null; row_version: Buffer }>(`
        SELECT s.${numberColumn} AS number,s.status,s.end_user_customer_id,c.name AS end_user_name,c.code AS end_user_code,s.row_version
        FROM dbo.${table} s WITH (UPDLOCK,HOLDLOCK) LEFT JOIN dbo.customers c ON c.id=s.end_user_customer_id
        WHERE s.id=@id AND s.deleted_at IS NULL;
      `)).recordset[0];
      if (!current) throw new ApiError(404, "not_found", `${entity} not found.`);
      if (!current.row_version.equals(rowVersion)) throw new ApiError(409, "concurrency_conflict", `This ${entity.toLowerCase()} was updated by another user. Reload and try again.`);
      demandEditableEndUser(current.status);
      const next = await validateEndUser(transaction, nextId);
      const update = new sql.Request(transaction);
      update.input("id", sql.BigInt, id); update.input("actor", sql.BigInt, actor.id);
      update.input("end_user_id", sql.BigInt, nextId); update.input("row_version", sql.VarBinary(8), rowVersion);
      const updated = (await update.query<{ row_version: Buffer }>(`
        UPDATE dbo.${table} SET end_user_customer_id=@end_user_id,updated_by=@actor,updated_at=SYSUTCDATETIME()
        OUTPUT inserted.row_version WHERE id=@id AND deleted_at IS NULL AND row_version=@row_version;
      `)).recordset[0];
      if (!updated) throw new ApiError(409, "concurrency_conflict", "This record was updated by another user. Reload and try again.");
      await insertAudit(transaction, actor.id, entity, id, current.number, "End user updated", {
        endUserCustomerId: current.end_user_customer_id === null ? null : Number(current.end_user_customer_id),
        endUserName: current.end_user_name, endUserCode: current.end_user_code,
      }, next);
      return { id, ...next, rowVersion: updated.row_version.toString("base64") };
    }, sql.ISOLATION_LEVEL.READ_COMMITTED);
  });
}
