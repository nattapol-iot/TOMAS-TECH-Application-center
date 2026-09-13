/** Reorder siblings without changing membership or any line values. */
export function moveSibling<T>(values: readonly T[], index: number, direction: -1 | 1): T[] {
  const next = [...values];
  const target = index + direction;
  if (index < 0 || index >= next.length || target < 0 || target >= next.length) return next;
  [next[index], next[target]] = [next[target], next[index]];
  return next;
}

/** Move an entire module block, retaining each child's current order. */
export function moveModule<T>(values: readonly T[], keyOf: (line: T) => string, key: string, direction: -1 | 1): T[] {
  const groups = new Map<string, T[]>();
  for (const line of values) { const name = keyOf(line); const group = groups.get(name) ?? []; group.push(line); groups.set(name, group); }
  const keys = [...groups.keys()];
  return moveSibling(keys, keys.indexOf(key), direction).flatMap(name => groups.get(name)!);
}

export type EstimateOrderSource = "CostItem" | "ManhourLine" | "ExpenseLine" | "OtherCostLine";
export type ReorderEstimate = (sourceType: EstimateOrderSource, orderedIds: number[]) => Promise<void>;
