/* Shaping one earlier estimate revision for its read-only view (app/system/production/EstimateRevisionView.tsx). */

export type RevisionCostLine = { id: number; categoryCode: string; category: string; module: string; lineTotal: number; amount: number };
export type RevisionCostGroup<Line extends RevisionCostLine> = { key: string; title: string; lines: Line[]; counted: number; multiplied: boolean };

/**
 * Cost items by category and module, in the order the server sent them. `counted` is what the group added to the
 * revision's total; it differs from the sum of its lines when the module had a quantity, and `multiplied` says so.
 */
export function revisionCostGroups<Line extends RevisionCostLine>(items: readonly Line[]): RevisionCostGroup<Line>[] {
  const groups: RevisionCostGroup<Line>[] = [];
  for (const item of items) {
    const moduleName = item.module.trim();
    const key = `${item.categoryCode}|${moduleName}`;
    let group = groups[groups.length - 1];
    if (!group || group.key !== key) {
      group = { key, title: [item.categoryCode, item.category, moduleName].filter(Boolean).join(" · "), lines: [], counted: 0, multiplied: false };
      groups.push(group);
    }
    group.lines.push(item);
    group.counted += item.amount;
  }
  for (const group of groups) group.multiplied = Math.abs(group.counted - group.lines.reduce((sum, line) => sum + line.lineTotal, 0)) > 0.005;
  return groups;
}
