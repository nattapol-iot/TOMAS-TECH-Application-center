import sql from "mssql/msnodesqlv8.js";
import type { Transaction as TransactionType } from "mssql";

/** SQL Server ISJSON() (without a type constraint) requires object/array roots. */
export function auditJson(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  return JSON.stringify(typeof value === "object" ? value : { value });
}

export async function insertAudit(
  transaction: TransactionType,
  actorId: number,
  entityType: string,
  entityId: number,
  entityNumber: string,
  action: string,
  before: unknown,
  after: unknown,
): Promise<void> {
  const request = new sql.Request(transaction);
  request.input("actor", sql.BigInt, actorId);
  request.input("entity_type", sql.NVarChar(50), entityType);
  request.input("entity_id", sql.BigInt, entityId);
  request.input("entity_no", sql.NVarChar(50), entityNumber);
  request.input("action", sql.NVarChar(100), action);
  request.input("before", sql.NVarChar(sql.MAX), auditJson(before));
  request.input("after", sql.NVarChar(sql.MAX), auditJson(after));
  await request.query(`
    INSERT INTO dbo.audit_log (actor_id, entity_type, entity_id, entity_no, action, before_json, after_json)
    VALUES (@actor, @entity_type, @entity_id, @entity_no, @action, @before, @after);
  `);
}
