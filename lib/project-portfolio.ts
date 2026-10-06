/* The Projects portfolio sorts and filters every project in memory: the overview endpoint returns
   the whole scope unpaged. These helpers hold the rules so the screen and its tests share them. */

export type PortfolioHealth = "On Track" | "At Risk" | "Delayed" | "No plan" | "On Hold" | "Completed";

/** The fields of a portfolio row these helpers read; the overview item is a superset. */
export type PortfolioRow = {
  id: number; number: string; name: string; customerName: string; endUserName?: string | null;
  purchaseOrderNumber: string; managerName: string; managerId: number; leadEngineerId: number;
  team?: string | null; status: string; health?: PortfolioHealth; targetDelivery: string | null;
  slipDays: number | null; progress: number; lastProgressAt: string | null;
  taskCount: number; overdueCount: number; blockedCount: number; pendingRequests: number;
};

/** Worst first: the order the portfolio opens in and the order of the health bar. */
export const PORTFOLIO_HEALTH_ORDER: readonly PortfolioHealth[] = ["Delayed", "At Risk", "No plan", "On Track", "On Hold", "Completed"];

export const PORTFOLIO_SORT_KEYS = ["health", "project", "pm", "target", "slip", "progress", "lastUpdate"] as const;
export type PortfolioSortKey = (typeof PORTFOLIO_SORT_KEYS)[number];
export type PortfolioSort = { key: PortfolioSortKey; direction: "asc" | "desc" };
/** Health ascending means worst first, then the largest slip, then the project number. */
export const DEFAULT_PORTFOLIO_SORT: PortfolioSort = { key: "health", direction: "asc" };

export const PORTFOLIO_CHIPS = ["overdue", "blocked", "waiting", "stale", "pastTarget"] as const;
export type PortfolioChip = (typeof PORTFOLIO_CHIPS)[number];

export const STALE_PROGRESS_DAYS = 7;

export function healthRank(health: PortfolioHealth | undefined): number {
  const index = health ? PORTFOLIO_HEALTH_ORDER.indexOf(health) : -1;
  return index < 0 ? PORTFOLIO_HEALTH_ORDER.indexOf("No plan") : index;
}

/** A missing value sorts last whichever way the column is sorted. */
function compareNullable<T>(a: T | null | undefined, b: T | null | undefined, compare: (x: T, y: T) => number, direction: 1 | -1) {
  const aMissing = a === null || a === undefined || a === "", bMissing = b === null || b === undefined || b === "";
  if (aMissing || bMissing) return aMissing === bMissing ? 0 : aMissing ? 1 : -1;
  return compare(a, b) * direction;
}
const byNumber = (a: number, b: number) => a - b;
const byText = (a: string, b: string) => a.localeCompare(b, "en", { numeric: true, sensitivity: "base" });

/** The tie-breakers every sort ends with: the largest slip first, then the project number. */
function compareTail(a: PortfolioRow, b: PortfolioRow) {
  return compareNullable(a.slipDays, b.slipDays, byNumber, -1) || byText(a.number, b.number) || a.id - b.id;
}

export function comparePortfolio(a: PortfolioRow, b: PortfolioRow, sort: PortfolioSort = DEFAULT_PORTFOLIO_SORT): number {
  const direction = sort.direction === "asc" ? 1 : -1;
  const primary = sort.key === "health" ? (healthRank(a.health) - healthRank(b.health)) * direction
    : sort.key === "project" ? byText(a.number, b.number) * direction
    : sort.key === "pm" ? compareNullable(a.managerName, b.managerName, byText, direction)
    : sort.key === "target" ? compareNullable(a.targetDelivery, b.targetDelivery, byText, direction)
    : sort.key === "slip" ? compareNullable(a.slipDays, b.slipDays, byNumber, direction)
    : sort.key === "progress" ? (a.progress - b.progress) * direction
    : compareNullable(a.lastProgressAt ? Date.parse(a.lastProgressAt) : null, b.lastProgressAt ? Date.parse(b.lastProgressAt) : null, byNumber, direction);
  return primary || compareTail(a, b);
}

export function sortPortfolio<T extends PortfolioRow>(rows: readonly T[], sort: PortfolioSort = DEFAULT_PORTFOLIO_SORT): T[] {
  return [...rows].sort((a, b) => comparePortfolio(a, b, sort));
}

/** Clicking the sorted column flips it; a new column starts ascending (health: worst first). */
export function nextPortfolioSort(current: PortfolioSort, key: PortfolioSortKey): PortfolioSort {
  return current.key === key ? { key, direction: current.direction === "asc" ? "desc" : "asc" } : { key, direction: "asc" };
}

/** Reads a remembered sort; anything damaged or unknown falls back to the default. */
export function parsePortfolioSort(raw: string | null): PortfolioSort {
  if (!raw) return DEFAULT_PORTFOLIO_SORT;
  try {
    const value = JSON.parse(raw) as Partial<PortfolioSort> | null;
    const key = PORTFOLIO_SORT_KEYS.find((candidate) => candidate === value?.key);
    return key && (value?.direction === "asc" || value?.direction === "desc") ? { key, direction: value.direction } : DEFAULT_PORTFOLIO_SORT;
  } catch {
    return DEFAULT_PORTFOLIO_SORT;
  }
}

export const portfolioSortStorageKey = (userId: number) => `tomas-tech-project-portfolio-sort:${userId}`;

const normalize = (value: string) => value.normalize("NFKC").toLocaleLowerCase("en").replace(/\s+/g, " ").trim();

/** Every word typed must appear in the number, name, customer, end user, PO or PM. */
export function matchesPortfolioSearch(row: PortfolioRow, query: string): boolean {
  const words = normalize(query).split(" ").filter(Boolean);
  if (!words.length) return true;
  const haystack = normalize([row.number, row.name, row.customerName, row.endUserName ?? "", row.purchaseOrderNumber, row.managerName].join(" "));
  return words.every((word) => haystack.includes(word));
}

/** True when the project has tasks but nobody has reported progress on them for a week. */
export function isProgressStale(row: PortfolioRow, nowMs: number): boolean {
  if (row.status === "Closed" || row.status === "On Hold" || row.taskCount <= 0) return false;
  if (!row.lastProgressAt) return true;
  const last = Date.parse(row.lastProgressAt);
  return !Number.isFinite(last) || last < nowMs - STALE_PROGRESS_DAYS * 86_400_000;
}

export function matchesPortfolioChip(row: PortfolioRow, chip: PortfolioChip, nowMs: number): boolean {
  switch (chip) {
    case "overdue": return row.overdueCount > 0;
    case "blocked": return row.blockedCount > 0;
    case "waiting": return row.pendingRequests > 0;
    case "stale": return isProgressStale(row, nowMs);
    case "pastTarget": return (row.slipDays ?? 0) > 0;
  }
}

export type PortfolioFilters = {
  search: string;
  managerId: number | null;
  team: string | null;
  /** The signed-in user's id when "Mine" is ticked: projects they manage or lead. */
  mineUserId: number | null;
  status: string | null;
  health: PortfolioHealth | null;
  chip: PortfolioChip | null;
};

export const EMPTY_PORTFOLIO_FILTERS: PortfolioFilters = { search: "", managerId: null, team: null, mineUserId: null, status: null, health: null, chip: null };

/** The search, PM, team, Mine and status filters: everything except the health bar and the chips. */
export function scopePortfolio<T extends PortfolioRow>(rows: readonly T[], filters: PortfolioFilters): T[] {
  return rows.filter((row) => matchesPortfolioSearch(row, filters.search)
    && (filters.managerId === null || row.managerId === filters.managerId)
    && (filters.team === null || (row.team ?? "") === filters.team)
    && (filters.mineUserId === null || row.managerId === filters.mineUserId || row.leadEngineerId === filters.mineUserId)
    && (filters.status === null || row.status === filters.status));
}

export type PortfolioView<T extends PortfolioRow> = {
  /** The rows the table shows, before sorting. */
  rows: T[];
  /** Health counts over the filtered rows, ignoring the health filter itself. */
  healthCounts: Record<PortfolioHealth, number>;
  /** Chip counts over the filtered rows, ignoring the chip filter itself. */
  chipCounts: Record<PortfolioChip, number>;
  /** How many rows the health bar describes. */
  barTotal: number;
};

export function portfolioView<T extends PortfolioRow>(rows: readonly T[], filters: PortfolioFilters, nowMs: number): PortfolioView<T> {
  const scoped = scopePortfolio(rows, filters);
  const byHealth = (row: T) => filters.health === null || (row.health ?? "No plan") === filters.health;
  const byChip = (row: T) => filters.chip === null || matchesPortfolioChip(row, filters.chip, nowMs);
  const forBar = scoped.filter(byChip), forChips = scoped.filter(byHealth);
  const healthCounts = Object.fromEntries(PORTFOLIO_HEALTH_ORDER.map((health) => [health, 0])) as Record<PortfolioHealth, number>;
  for (const row of forBar) healthCounts[row.health ?? "No plan"] += 1;
  const chipCounts = Object.fromEntries(PORTFOLIO_CHIPS.map((chip) => [chip, forChips.filter((row) => matchesPortfolioChip(row, chip, nowMs)).length])) as Record<PortfolioChip, number>;
  return { rows: forBar.filter(byHealth), healthCounts, chipCounts, barTotal: forBar.length };
}

/** "+9" late, "0" on time, "-3" early; null when there is no forecast or no target. */
export function formatSlip(slipDays: number | null): string | null {
  if (slipDays === null || !Number.isFinite(slipDays)) return null;
  return slipDays > 0 ? `+${slipDays}` : String(slipDays);
}

/**
 * The value a select filter really applies: the chosen option while the option list still offers
 * it, otherwise "all" (null). The list is rebuilt from the loaded rows, so a PM or team can vanish
 * after a reload; the control and the filter must then agree instead of hiding an active filter.
 */
export function effectiveOption<T>(value: T | null, options: readonly T[]): T | null {
  return value !== null && options.includes(value) ? value : null;
}

/** The status filter in force: none for "All status", and none for Closed while closed projects are not loaded. */
export function effectiveStatusFilter(status: string, includeClosed: boolean): string | null {
  if (status === "All status") return null;
  return status === "Closed" && !includeClosed ? null : status;
}

export type MenuPlacement = { top: number | null; bottom: number | null; right: number; maxHeight: number | null };

/**
 * Where a row's fixed-position menu goes: under its trigger when it fits, above it when only the
 * space above does, otherwise on the roomier side with a scrolling cap. Fixed positioning keeps the
 * table's own scroll box from clipping the menu.
 */
export function rowMenuPlacement(
  anchor: { top: number; bottom: number; right: number },
  viewport: { width: number; height: number },
  menuHeight: number,
  gap = 4,
  margin = 8,
): MenuPlacement {
  const below = viewport.height - anchor.bottom - gap - margin;
  const above = anchor.top - gap - margin;
  const right = Math.max(margin, viewport.width - anchor.right);
  if (menuHeight <= below || (menuHeight > above && below >= above)) {
    return { top: anchor.bottom + gap, bottom: null, right, maxHeight: menuHeight <= below ? null : Math.max(0, below) };
  }
  return { top: null, bottom: viewport.height - anchor.top + gap, right, maxHeight: menuHeight <= above ? null : Math.max(0, above) };
}
