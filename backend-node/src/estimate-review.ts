// Who decides an estimate in review, and who hears about it (owner 2026-11-06): one of the listed approvers approves or
// sends it back, never on their own estimate; every approver is told when one is submitted and its owner of each decision.
import sql from "mssql";
import type { Transaction as TransactionType } from "mssql";
import type { EmailRecipient } from "./email.js";

export type EstimateApprover = { id: number; name: string; email: string };

/*
 * The people in dbo.estimate_approvers (migration 101): Nattapol, Warit, Tachapon and Taweesak. While the list is empty,
 * as in a new database, everyone holding estimate.approve decides, which was the rule before the list existed.
 */
export const ESTIMATE_APPROVERS_SQL = `
  IF EXISTS(SELECT 1 FROM dbo.estimate_approvers)
    SELECT u.id,u.name,u.email FROM dbo.estimate_approvers a INNER JOIN dbo.users u ON u.id=a.user_id
    WHERE u.is_active=1 AND u.deleted_at IS NULL ORDER BY a.sort_order,u.name;
  ELSE
    SELECT DISTINCT u.id,u.name,u.email FROM dbo.user_effective_permissions p INNER JOIN dbo.users u ON u.id=p.user_id
    WHERE p.code=N'estimate.approve' AND u.is_active=1 AND u.deleted_at IS NULL ORDER BY u.name;`;

export const mapApprovers = (rows: ReadonlyArray<{ id: number | string; name: string; email: string | null }>): EstimateApprover[] =>
  rows.map((row) => ({ id: Number(row.id), name: row.name, email: row.email ?? "" }));

export async function loadEstimateApprovers(transaction: TransactionType): Promise<EstimateApprover[]> {
  return mapApprovers((await new sql.Request(transaction).query<{ id: number | string; name: string; email: string | null }>(ESTIMATE_APPROVERS_SQL)).recordset);
}

/** A listed approver may approve or send back an estimate in review, but not their own unless they are an Admin (as before). */
export function mayDecideEstimate(actor: { id: number; roles: readonly string[] }, ownerId: number, approvers: readonly EstimateApprover[]): boolean {
  return approvers.some((approver) => approver.id === actor.id) && (actor.id !== ownerId || actor.roles.includes("Admin"));
}

/** The approvers the estimate waits for: everyone listed except its owner and whoever submitted it. */
export function waitingApprovers(approvers: readonly EstimateApprover[], ownerId: number, submittedById: number | null): EstimateApprover[] {
  return approvers.filter((approver) => approver.id !== ownerId && approver.id !== submittedById);
}

export const recipientsOf = (people: ReadonlyArray<{ name: string; email: string }>): EmailRecipient[] =>
  people.filter((person) => person.email.trim()).map((person) => ({ name: person.name, email: person.email }));

/** Who submitted the current revision for review, from the audit trail; null before it is submitted. */
export async function submitterOf(transaction: TransactionType, estimateId: number, revision: number): Promise<{ id: number; name: string; email: string } | null> {
  const request = new sql.Request(transaction); request.input("id", sql.BigInt, estimateId); request.input("revision", sql.Int, revision);
  const row = (await request.query<{ id: number | string; name: string; email: string | null }>(`
    SELECT TOP(1) u.id,u.name,u.email FROM dbo.audit_log a INNER JOIN dbo.users u ON u.id=a.actor_id
    WHERE a.entity_type=N'Estimate' AND a.entity_id=@id AND a.action=N'Submitted'
      AND TRY_CONVERT(int,JSON_VALUE(a.after_json,'$.revision'))=@revision
    ORDER BY a.id DESC;`)).recordset[0];
  return row ? { id: Number(row.id), name: row.name, email: row.email ?? "" } : null;
}
