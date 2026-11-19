/*
 * Estimating screens in two looks (owner 2026-11-19): V1 is the screen as it was, V2 is the same screen in the Pegasus
 * ERP look with the main parts laid out the Pegasus way. Both read and write through the same API, so a feature added
 * later shows in both. Everyone starts on V1 and switches with the V1 / V2 control at the top of the screen; the choice
 * is kept per person in this browser.
 */

export type EstimateLook = "v1" | "v2";

/** The menu screens of the Estimating group that carry the V1 / V2 switch. */
export const ESTIMATE_LOOK_VIEWS = ["estimates", "price", "quotations", "missing", "module-templates", "labor-packages"] as const;

export const ESTIMATE_LOOK_DEFAULT: EstimateLook = "v1";

export function estimateLookKey(userId: number | string): string {
  return `tomas-tech-estimate-look:${userId}`;
}

/** Anything that is not exactly "v2" (nothing stored, an old value, a hand-edited one) reads as the default. */
export function parseEstimateLook(value: unknown): EstimateLook {
  return value === "v2" ? "v2" : ESTIMATE_LOOK_DEFAULT;
}

export type EstimateHeaderAction = "approve" | "submit" | "export-erp" | "create-revision" | "request-revision";

/**
 * V2 shows one filled button: the step that moves the estimate forward now. Every other step goes into More actions.
 * Approve and Submit come first because the how-to guides point at them (estimate.approve, estimate.submit).
 */
export function estimatePrimaryAction(can: { approve: boolean; submit: boolean; exportErp: boolean; createRevision: boolean; requestRevision: boolean }): EstimateHeaderAction | null {
  if (can.approve) return "approve";
  if (can.submit) return "submit";
  if (can.exportErp) return "export-erp";
  if (can.createRevision) return "create-revision";
  if (can.requestRevision) return "request-revision";
  return null;
}

export type EstimateStatusCount = { status: string; count: number; total: number };

/**
 * The summary bar's cell for one status: how many estimates and their cost, over every filter but the status. A cell
 * counts exactly what pressing it lists (the API filters on the status as stored), so Locked shows under All only.
 */
export function estimateStatusCell(counts: readonly EstimateStatusCount[], status: string): { count: number; total: number } {
  const rows = status === "All status" ? counts : counts.filter((row) => row.status === status);
  return rows.reduce((sum, row) => ({ count: sum.count + row.count, total: sum.total + row.total }), { count: 0, total: 0 });
}
