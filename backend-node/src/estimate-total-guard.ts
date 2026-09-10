import sql from "mssql";
import type { Transaction } from "mssql";

/** Force the canonical estimate totals view to fit its decimal(19,4) API/storage contract before commit. */
export async function assertEstimateTotals(transaction: Transaction, estimateId: number): Promise<void> {
  const request = new sql.Request(transaction);
  request.input("estimate_id", sql.BigInt, estimateId);
  await request.query("EXEC dbo.assert_estimate_totals @estimate_id=@estimate_id;");
}
