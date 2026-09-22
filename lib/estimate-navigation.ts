export const ESTIMATE_TABS = ["summary", "cost", "manhour", "other", "assignment", "validation", "revision", "review"] as const;
export type EstimateTab = typeof ESTIMATE_TABS[number];
export type EstimateNavigation = { estimateId: number | null; tab: EstimateTab };

export function estimateNavigationKey(userId: number): string {
  return `tomas-tech-estimate-navigation:${userId}`;
}

/** Restore only navigation; explicit document links take precedence. */
export function restoreEstimateNavigation(saved: string | null, initialId: number | null): EstimateNavigation {
  let value: Partial<EstimateNavigation> = {};
  try {
    const parsed: unknown = JSON.parse(saved ?? "null");
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) value = parsed;
  } catch { /* An obsolete or damaged value opens the list. */ }
  const savedId = Number.isSafeInteger(value.estimateId) && Number(value.estimateId) > 0 ? value.estimateId! : null;
  const estimateId = initialId ?? savedId;
  const tab = estimateId !== null && estimateId === savedId && ESTIMATE_TABS.includes(value.tab as EstimateTab) ? value.tab! : "summary";
  return { estimateId, tab };
}
