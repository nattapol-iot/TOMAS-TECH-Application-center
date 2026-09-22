/** The legacy SQL validator treats duplicates across the entire revision as errors.
 * Node workflows replace only that rule with module-scoped advisory warnings. */
export function withoutLegacyDuplicateErrors<T extends { code: unknown }>(issues: T[]): T[] {
  return issues.filter(issue => issue.code !== "duplicate_cost_item");
}

type DuplicateCandidate = {
  id: number; categoryCode: string; module: string; itemCode: string; model: string; description: string;
};

/** Call with active items from one estimate's current revision only. */
export function estimateDuplicateWarnings(items: readonly DuplicateCandidate[]) {
  const groups = new Map<string, DuplicateCandidate[]>();
  for (const item of items) {
    const key = JSON.stringify([item.categoryCode, item.module, item.itemCode, item.model, item.description]
      .map(value => value.trim().toLowerCase()));
    const group = groups.get(key) ?? [];
    group.push(item);
    groups.set(key, group);
  }
  return [...groups.values()].filter(group => group.length > 1).map(group => {
    const rows = [...group].sort((a, b) => a.id - b.id);
    const item = rows[0]!;
    return {
      code: "duplicate_cost_item", severity: "Warning", entityType: "CostItem", entityId: item.id,
      message: `Review repeated item "${item.itemCode.trim()}" in category ${item.categoryCode.trim()}, module "${item.module.trim() || "(unassigned)"}". Model: ${item.model.trim() || "—"}; description: ${item.description.trim()}. Rows: ${rows.map(row => `#${row.id}`).join(", ")}. This warning does not block submission or approval.`,
    };
  });
}
