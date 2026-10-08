/** Production-only planning math: no demo dates, users, or seeded effort. */
export type Commitment = {
  /** One row per person: the work and whose share it is. */
  key: string;
  /** The work itself, whoever does it (backend-node/src/resource-workload.ts); a person's work order names these. */
  workKey: string;
  type: "Inquiry" | "Estimate" | "Project";
  entityId: number;
  ownerId: number | null;
  reference: string;
  title: string;
  customer: string;
  start: string | null;
  end: string | null;
  manDays: number | null;
  progress: number;
  status: string;
  /** Where its effort is planned on the Workload screen; absent when the work's own plan holds it. */
  effort?: { kind: "Inquiry" | "Estimate" | "EstimateSection"; id: number };
  /** A Resource Plan task awaiting approval, counted at its proposed plan. */
  tentative?: boolean;
};
const DAY = 86400000;
/** Working days a week for anyone without a saved capacity: Monday to Friday. backend-node/src/resource-workload.ts holds the same default. */
export const DEFAULT_WEEKLY_CAPACITY = 5;
/** A saved capacity, or the default when nobody saved one. */
export const weeklyCapacity = (saved: number | null | undefined) => saved ?? DEFAULT_WEEKLY_CAPACITY;
/** Work in these statuses, or at 100%, no longer takes anyone's time; the server filters with the same list. */
export const FINISHED_WORK_STATUSES = ["Closed", "Cancelled", "Approved", "Locked", "Done", "Completed", "Reviewed", "Rejected"];
export const isOpenWork = (item: Pick<Commitment, "progress" | "status">) =>
  item.progress < 100 && !FINISHED_WORK_STATUSES.includes(item.status);
export const dayNumber = (value: string) =>
  Date.parse(value.slice(0, 10) + "T00:00:00Z") / DAY;
export const dateFromDay = (value: number) =>
  new Date(value * DAY).toISOString().slice(0, 10);
export function planningWeeks(start: string, count: number) {
  const day = dayNumber(start),
    monday = day - ((new Date(day * DAY).getUTCDay() + 6) % 7);
  return Array.from({ length: count }, (_, i) => ({
    start: dateFromDay(monday + i * 7),
    end: dateFromDay(monday + i * 7 + 6),
  }));
}
export function workingDays(
  start: string,
  end: string,
  holidays: readonly string[] = [],
) {
  const from = dayNumber(start),
    to = dayNumber(end),
    closed = new Set(holidays);
  if (
    !Number.isFinite(from) ||
    !Number.isFinite(to) ||
    to < from ||
    to - from > 3650
  )
    return [];
  const result: string[] = [];
  for (let d = from; d <= to; d++) {
    const weekday = new Date(d * DAY).getUTCDay(),
      iso = dateFromDay(d);
    if (weekday !== 0 && weekday !== 6 && !closed.has(iso)) result.push(iso);
  }
  return result;
}
export function planningLoad(
  items: Commitment[],
  weeks: ReturnType<typeof planningWeeks>,
  capacity: number | null,
  today: string,
  holidays: readonly string[] = [],
) {
  const open = items.filter(isOpenWork);
  const entries = open.map((item) => ({
    item,
    days:
      item.start && item.end ? workingDays(item.start, item.end, holidays) : [],
  }));
  const weekly = weeks.map((week) => {
    let manDays = 0;
    for (const { item, days } of entries)
      if (days.length && item.manDays !== null)
        manDays +=
          (item.manDays *
            days.filter((d) => d >= week.start && d <= week.end).length) /
          days.length;
    const available =
      capacity === null
        ? null
        : (capacity * workingDays(week.start, week.end, holidays).length) / 5;
    const utilisation =
      available === null
        ? null
        : available === 0
          ? manDays > 0
            ? Infinity
            : 0
          : (manDays / available) * 100;
    return { week, manDays, available, utilisation };
  });
  const known = weekly.filter((w) => w.utilisation !== null);
  const committed = weekly.reduce((s, w) => s + w.manDays, 0),
    available = weekly.reduce((s, w) => s + (w.available ?? 0), 0);
  return {
    weekly,
    committed,
    peak: known.length ? Math.max(...known.map((w) => w.utilisation!)) : null,
    average:
      capacity === null
        ? null
        : available
          ? (committed / available) * 100
          : committed
            ? Infinity
            : 0,
    open: open.length,
    overdue: open.filter((i) => i.end && i.end < today).length,
    nextDue: open
      .filter((i) => i.end)
      .sort((a, b) => a.end!.localeCompare(b.end!))[0],
    unknown: entries.filter((e) => e.item.manDays === null || !e.days.length)
      .length,
  };
}
const byDueDate = (a: Commitment, b: Commitment) =>
  (a.end ?? "9999-12-31").localeCompare(b.end ?? "9999-12-31") || a.reference.localeCompare(b.reference);
/** A person's open work in their order: what they ranked first, as ranked, then the rest soonest due first. */
export function orderWork(items: Commitment[], order: readonly string[]) {
  const rank = new Map(order.map((key, index) => [key, index]));
  return items
    .filter(isOpenWork)
    .sort((a, b) => (rank.get(a.workKey) ?? Infinity) - (rank.get(b.workKey) ?? Infinity) || byDueDate(a, b));
}
export type Projection = {
  /** The first and last working day the work is projected on; null when it cannot be projected. */
  start: string | null;
  finish: string | null;
  /** Working days past the planned finish (0 when on time or with no planned finish); null when unknown. */
  lateDays: number | null;
  /** Why there is no finish: no effort on the item, no capacity, or not done within the horizon. */
  reason?: "effort" | "capacity" | "horizon";
};
const EPSILON = 1e-6;
/**
 * When each item would be done if this person worked through it in this order from today. Every working day gives
 * capacity / 5 man-days to the first item that may start (not before its planned start) and still has work left, and
 * what is left of the day to the next. Remaining work is the effort not yet reported done. Work without effort, or a
 * person with no capacity, is not projected, and nothing past the horizon is guessed. Plan dates are not changed.
 */
export function projectWork(
  ordered: Commitment[],
  capacity: number,
  today: string,
  holidays: readonly string[] = [],
  horizonDays = 365,
) {
  const result = new Map<string, Projection>();
  const remaining = new Map<string, number>();
  for (const item of ordered) {
    if (!item.manDays) result.set(item.key, { start: null, finish: null, lateDays: null, reason: "effort" });
    else if (capacity <= 0) result.set(item.key, { start: null, finish: null, lateDays: null, reason: "capacity" });
    else remaining.set(item.key, (item.manDays * Math.max(0, 100 - item.progress)) / 100);
  }
  const daily = capacity / 5;
  const started = new Map<string, string>();
  for (const day of workingDays(today, dateFromDay(dayNumber(today) + horizonDays), holidays)) {
    if (![...remaining.values()].some((left) => left > EPSILON)) break;
    let budget = daily;
    for (const item of ordered) {
      const left = remaining.get(item.key);
      if (left === undefined || left <= EPSILON || (item.start !== null && item.start > day)) continue;
      if (!started.has(item.key)) started.set(item.key, day);
      const used = Math.min(budget, left);
      remaining.set(item.key, left - used);
      budget -= used;
      if (left - used <= EPSILON) {
        const lateDays = item.end && day > item.end ? workingDays(dateFromDay(dayNumber(item.end) + 1), day, holidays).length : 0;
        result.set(item.key, { start: started.get(item.key)!, finish: day, lateDays });
      }
      if (budget <= EPSILON) break;
    }
  }
  for (const [key, left] of remaining)
    if (!result.has(key))
      result.set(key, left > EPSILON
        ? { start: started.get(key) ?? null, finish: null, lateDays: null, reason: "horizon" }
        : { start: today, finish: today, lateDays: 0 });
  return result;
}
/** Protect exported spreadsheet cells from formula injection. */
export function resourceCsv(rows: unknown[][]) {
  return (
    "\uFEFF" +
    rows
      .map((row) =>
        row
          .map((value) => {
            let text = String(value ?? "");
            if (/^[\s]*[=+@-]/.test(text)) text = "'" + text;
            return '"' + text.replaceAll('"', '""') + '"';
          })
          .join(","),
      )
      .join("\r\n")
  );
}
