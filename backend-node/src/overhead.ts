import sql from "mssql";
import type { Transaction as TransactionType } from "mssql";
import { ApiError } from "./errors.js";

export const OVERHEAD_METHOD = "InternalEngineeringHour" as const;

export type OverheadPolicyInput = {
  monthlyBudget: number;
  normalDirectHours: number;
  effectiveFrom: string;
  reason: string;
};

export function overheadDecimal(value: unknown, minimum: number, maximum: number, label: string): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < minimum || value > maximum) {
    throw new ApiError(400, "validation_failed", `${label} must be between ${minimum} and ${maximum}.`);
  }
  const text = value.toString().toLowerCase();
  if (text.includes("e") || (text.split(".")[1]?.length ?? 0) > 4) {
    throw new ApiError(400, "validation_failed", `${label} cannot have more than 4 decimal places.`);
  }
  return value;
}

export function validateOverheadRate(monthlyBudget: number, normalDirectHours: number): void {
  const hourlyRate = monthlyBudget / normalDirectHours;
  if (monthlyBudget > 0 && Math.round(hourlyRate * 10_000) === 0) {
    throw new ApiError(400,"validation_failed","The derived overhead hourly rate is too small to store. Increase the budget or reduce normal direct hours.");
  }
  if (hourlyRate >= 1_000_000_000_000_000) {
    throw new ApiError(400,"validation_failed","The derived overhead hourly rate is too large to store. Reduce the budget or increase normal direct hours.");
  }
}

export type OverheadSnapshotRow = {
  policy_id: number | string;
  policy_version: number;
  method: string;
  monthly_budget: number | string;
  normal_direct_hours: number | string;
  hourly_rate: number | string;
  effective_from: Date | string;
  reason: string;
};

export async function snapshotOverheadPolicy(
  transaction: TransactionType,
  estimateId: number,
  revision: number,
  actorId: number,
  asOf: string,
  policyId: number | null = null,
): Promise<OverheadSnapshotRow | null> {
  const request = new sql.Request(transaction);
  request.input("estimate_id", sql.BigInt, estimateId);
  request.input("revision", sql.Int, revision);
  request.input("actor", sql.BigInt, actorId);
  request.input("as_of", sql.Date, asOf);
  request.input("policy_id", sql.BigInt, policyId);
  const result = await request.query<OverheadSnapshotRow>(`
    DECLARE @selected_policy_id bigint=(
      SELECT TOP(1) id FROM dbo.overhead_policies WITH(UPDLOCK,HOLDLOCK)
      WHERE effective_from<=@as_of AND (@policy_id IS NULL OR id=@policy_id)
      ORDER BY effective_from DESC,id DESC
    );
    IF NOT EXISTS (SELECT 1 FROM dbo.estimate_overhead_snapshots WITH(UPDLOCK,HOLDLOCK)
      WHERE estimate_id=@estimate_id AND revision=@revision) AND @selected_policy_id IS NOT NULL
      INSERT dbo.estimate_overhead_snapshots(estimate_id,revision,policy_id,policy_version,method,monthly_budget,
        normal_direct_hours,hourly_rate,effective_from,reason,applied_by)
      SELECT @estimate_id,@revision,id,policy_version,method,monthly_budget,normal_direct_hours,hourly_rate,
        effective_from,reason,@actor FROM dbo.overhead_policies WHERE id=@selected_policy_id;

    SELECT policy_id,policy_version,method,monthly_budget,normal_direct_hours,hourly_rate,effective_from,reason
    FROM dbo.estimate_overhead_snapshots WHERE estimate_id=@estimate_id AND revision=@revision;
  `);
  const snapshot = result.recordset[0] ?? null;
  if (policyId !== null && snapshot && Number(snapshot.policy_id) !== policyId) {
    throw new ApiError(409, "overhead_already_snapshotted", "This revision already uses another overhead policy. Create a new revision to use a different policy.");
  }
  return snapshot;
}
