import sql from "mssql";
import type { Transaction as TransactionType } from "mssql";
import { insertAudit } from "./audit.js";

/*
 * One person owns an inquiry's estimating work, on the inquiry and on its estimate alike.
 *
 * Bug 2026-11-26: "Assign owner" on an inquiry changed only the inquiry. On EBARA INQ-2611-0019 the owner was changed
 * to Sukanya after EST-2611-0021 existed; the inquiry list named her and the estimate still named the person it was
 * created with. The inquiry's assignment now carries over to its estimate, in any status, together with the estimate's
 * open section assignments that were the previous owner's (they are what My Work lists). Saving the same owner again
 * repairs an estimate that had drifted before this fix.
 */

/** Section assignments in these states are finished work and keep the person who did them. */
export const CLOSED_SECTION_STATUSES = ["Completed", "Reviewed"] as const;

export type EstimateOwnerMove = { estimateId: number; estimateNumber: string; previousOwnerId: number; sectionsMoved: number };

/** Gives the inquiry's estimate (if it has one) the inquiry's owner. Returns what moved, or null when nothing had to. */
export async function alignEstimateOwner(transaction: TransactionType, inquiryId: number, ownerId: number, actorId: number): Promise<EstimateOwnerMove | null> {
  const read = new sql.Request(transaction);
  read.input("inquiry", sql.BigInt, inquiryId);
  const estimate = (
    await read.query<{ id: number | string; estimate_no: string; owner_id: number | string }>(
      `SELECT id,estimate_no,owner_id FROM dbo.estimates WITH(UPDLOCK,HOLDLOCK) WHERE inquiry_id=@inquiry AND deleted_at IS NULL;`,
    )
  ).recordset[0];
  if (!estimate || Number(estimate.owner_id) === ownerId) return null;
  const move = new sql.Request(transaction);
  move.input("id", sql.BigInt, Number(estimate.id));
  move.input("owner", sql.BigInt, ownerId);
  move.input("previous", sql.BigInt, Number(estimate.owner_id));
  move.input("actor", sql.BigInt, actorId);
  const result = await move.query(`
    UPDATE dbo.estimates SET owner_id=@owner,updated_by=@actor,updated_at=SYSUTCDATETIME() WHERE id=@id;
    UPDATE dbo.estimate_assignments SET owner_id=@owner,support_id=CASE WHEN support_id=@owner THEN NULL ELSE support_id END
      WHERE estimate_id=@id AND owner_id=@previous AND status NOT IN(${CLOSED_SECTION_STATUSES.map((status) => `N'${status}'`).join(",")});
  `);
  const moved: EstimateOwnerMove = {
    estimateId: Number(estimate.id),
    estimateNumber: estimate.estimate_no,
    previousOwnerId: Number(estimate.owner_id),
    sectionsMoved: result.rowsAffected[1] ?? 0,
  };
  await insertAudit(
    transaction,
    actorId,
    "Estimate",
    moved.estimateId,
    moved.estimateNumber,
    "Owner changed",
    { ownerId: moved.previousOwnerId },
    { ownerId, inquiryId, sectionsMoved: moved.sectionsMoved, source: "Inquiry owner assigned" },
  );
  return moved;
}
