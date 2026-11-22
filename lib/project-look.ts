/*
 * The Projects screens in two looks (owner 2026-11-22, "อยากปรับ UI ตรงฟีเจอร์ Project ให้เป็น tomastech-ui-design-system และ
 * อยากลีนฟีเจอร์นี้"), arranged the way Estimating and Sales are (lib/estimate-look.ts, lib/sales-look.ts):
 * - V1 is the screen as it was.
 * - V2 is the same screen in the Pegasus ERP look, leaner:
 *   - the Overview is a Pegasus list: a count in the title, a status summary bar, filters in the column headers;
 *   - the plan is edited in one place, the Plan tab.
 * Both read and write through the same API, so a feature added later shows in both. Everyone starts on V1; the choice is
 * kept per person in this browser, apart from the Estimating and Sales ones.
 */
export type ProjectLook = "v1" | "v2";

export const PROJECT_LOOK_DEFAULT: ProjectLook = "v1";

export function projectLookKey(userId: number | string): string {
  return `tomas-tech-project-look:${userId}`;
}

/** Anything that is not exactly "v2" reads as the default. */
export function parseProjectLook(value: unknown): ProjectLook {
  return value === "v2" ? "v2" : PROJECT_LOOK_DEFAULT;
}

/**
 * One header funnel over a single-value filter. The funnel offers several ticks (ColumnFilter.tsx); the portfolio filters on
 * one value, so the value ticked last wins, and clearing every tick clears the filter.
 */
export function singleFilterValue(previous: string | null, next: readonly string[]): string | null {
  if (!next.length) return null;
  return next.find((value) => value !== previous) ?? next[next.length - 1] ?? null;
}
