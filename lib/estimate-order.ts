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

/** Move a whole module block to sit before or after another module. */
export function dropModule<T>(values: readonly T[], keyOf: (line: T) => string, key: string, targetKey: string, after: boolean): T[] {
  const groups = new Map<string, T[]>();
  for (const line of values) { const name = keyOf(line); const group = groups.get(name) ?? []; group.push(line); groups.set(name, group); }
  if (key === targetKey || !groups.has(key) || !groups.has(targetKey)) return [...values];
  const keys = [...groups.keys()].filter(name => name !== key);
  keys.splice(keys.indexOf(targetKey) + (after ? 1 : 0), 0, key);
  return keys.flatMap(name => groups.get(name)!);
}

export type EstimateOrderSource = "CostItem" | "ManhourLine" | "ExpenseLine" | "OtherCostLine";
export type CostMove = { lineId: number; targetLineId: number } | { lineIds: number[]; targetLineId: number; keepModule: true };
export type ReorderEstimate = (sourceType: EstimateOrderSource, orderedIds: number[], move?: CostMove) => Promise<void>;

/** Insert relative to an existing line; preserve hidden rows and do not mutate the source. */
export function insertCostLine(ids: readonly number[], lineId: number, targetId: number, after: boolean): number[] {
  if (lineId === targetId || !ids.includes(lineId) || !ids.includes(targetId)) return [...ids];
  const next = ids.filter(id => id !== lineId);
  next.splice(next.indexOf(targetId) + (after ? 1 : 0), 0, lineId);
  return next;
}
