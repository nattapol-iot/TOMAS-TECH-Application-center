/**
 * One header funnel over a single-value filter. The funnel offers several ticks (ColumnFilter.tsx); the portfolio filters on
 * one value, so the value ticked last wins, and clearing every tick clears the filter.
 */
export function singleFilterValue(previous: string | null, next: readonly string[]): string | null {
  if (!next.length) return null;
  return next.find((value) => value !== previous) ?? next[next.length - 1] ?? null;
}
