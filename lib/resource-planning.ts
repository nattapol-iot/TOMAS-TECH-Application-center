/** Production-only planning math: no demo dates, users, or seeded effort. */
export type Commitment = {
  key: string;
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
};
const DAY = 86400000;
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
  const activeItems = items.filter(item => item.progress < 100 && !["Closed", "Cancelled", "Approved", "Locked", "Done", "Completed", "Rejected"].includes(item.status));
  const entries = activeItems.map((item) => ({
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
  const open = items.filter(
    (i) =>
      i.progress < 100 &&
      ![
        "Closed",
        "Cancelled",
        "Approved",
        "Locked",
        "Done",
        "Completed",
      ].includes(i.status),
  );
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
export function planningBar(
  item: Commitment,
  weeks: ReturnType<typeof planningWeeks>,
) {
  if (!item.start || !item.end || !weeks.length) return null;
  const first = dayNumber(weeks[0].start),
    last = dayNumber(weeks.at(-1)!.end) + 1;
  const start = Math.max(dayNumber(item.start), first),
    end = Math.min(dayNumber(item.end) + 1, last);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start)
    return null;
  return {
    left: ((start - first) / (last - first)) * 100,
    width: ((end - start) / (last - first)) * 100,
  };
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
