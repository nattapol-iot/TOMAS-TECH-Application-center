/* The one Gantt the Projects screens draw: the portfolio timeline and a project's plan share these
   window, bar and marker rules, so a project's bar and its tasks' bars line up the same way on both.
   Dates are ISO yyyy-mm-dd strings in the business calendar; positions are percentages of the window,
   so the chart fits its container instead of scrolling sideways. */

const DAY = 86_400_000;
/** Days since the epoch for an ISO date (the same arithmetic as lib/resource-planning.ts). */
export const dayNumber = (value: string) => Date.parse(`${value.slice(0, 10)}T00:00:00Z`) / DAY;
export const dateFromDay = (value: number) => new Date(value * DAY).toISOString().slice(0, 10);

export const GANTT_ZOOMS = ["month", "quarter", "half", "year"] as const;
export type GanttZoom = (typeof GANTT_ZOOMS)[number];

export type GanttColumn = { start: string; end: string; kind: "week" | "month" };
export type GanttWindow = { start: string; end: string; days: number; columns: GanttColumn[] };

const mondayOf = (day: number) => day - ((new Date(day * DAY).getUTCDay() + 6) % 7);
const monthStart = (iso: string) => `${iso.slice(0, 7)}-01`;
const addMonths = (iso: string, months: number) => {
  const date = new Date(`${monthStart(iso)}T00:00:00Z`);
  date.setUTCMonth(date.getUTCMonth() + months);
  return date.toISOString().slice(0, 10);
};

function weekWindow(firstMonday: number, weeks: number): GanttWindow {
  const columns = Array.from({ length: weeks }, (_, index): GanttColumn => ({
    start: dateFromDay(firstMonday + index * 7), end: dateFromDay(firstMonday + index * 7 + 6), kind: "week",
  }));
  return { start: columns[0]!.start, end: columns.at(-1)!.end, days: weeks * 7, columns };
}

function monthWindow(firstMonth: string, months: number): GanttWindow {
  const columns = Array.from({ length: months }, (_, index): GanttColumn => {
    const start = addMonths(firstMonth, index);
    return { start, end: dateFromDay(dayNumber(addMonths(start, 1)) - 1), kind: "month" };
  });
  const start = columns[0]!.start, end = columns.at(-1)!.end;
  return { start, end, days: dayNumber(end) - dayNumber(start) + 1, columns };
}

/**
 * The window a zoom preset shows around `anchor` (usually today): a little history on the left so a
 * late bar is still visible, most of the room ahead. Month = 6 weeks, quarter = 13 weeks, half-year
 * = 6 months, year = 12 months.
 */
export function ganttWindow(zoom: GanttZoom, anchor: string): GanttWindow {
  const day = dayNumber(anchor);
  if (zoom === "month") return weekWindow(mondayOf(day) - 7, 6);
  if (zoom === "quarter") return weekWindow(mondayOf(day) - 14, 13);
  if (zoom === "half") return monthWindow(addMonths(anchor, -1), 6);
  return monthWindow(addMonths(anchor, -2), 12);
}

/** Moves the anchor by most of one window, so the next view overlaps the last one a little. */
export function shiftGanttAnchor(zoom: GanttZoom, anchor: string, direction: -1 | 1): string {
  if (zoom === "month") return dateFromDay(dayNumber(anchor) + direction * 28);
  if (zoom === "quarter") return dateFromDay(dayNumber(anchor) + direction * 77);
  // Month windows start on the 1st, so the anchor's day of the month does not matter.
  return addMonths(anchor, direction * (zoom === "half" ? 5 : 10));
}

/**
 * The window that shows every date given (a project's whole plan), padded by a week each side.
 * Spans up to four months use week columns, longer spans month columns. With no dates it falls
 * back to the quarter around `fallbackAnchor`.
 */
export function ganttFitWindow(dates: readonly (string | null | undefined)[], fallbackAnchor: string): GanttWindow {
  const known = dates.filter((value): value is string => typeof value === "string" && Number.isFinite(dayNumber(value)));
  if (!known.length) return ganttWindow("quarter", fallbackAnchor);
  const days = known.map(dayNumber);
  const first = Math.min(...days) - 7, last = Math.max(...days) + 7;
  if (last - first <= 120) {
    const monday = mondayOf(first);
    return weekWindow(monday, Math.max(4, Math.ceil((last - monday + 1) / 7)));
  }
  const firstMonth = monthStart(dateFromDay(first));
  const lastMonth = monthStart(dateFromDay(last));
  const months = (Number(lastMonth.slice(0, 4)) - Number(firstMonth.slice(0, 4))) * 12 + Number(lastMonth.slice(5, 7)) - Number(firstMonth.slice(5, 7)) + 1;
  return monthWindow(firstMonth, Math.min(Math.max(months, 3), 60));
}

export type GanttSpan = { left: number; width: number; clippedStart: boolean; clippedEnd: boolean };

/** Where a start–finish span sits in the window, as percentages; null when it is undated or outside. */
export function ganttSpan(start: string | null | undefined, finish: string | null | undefined, window: GanttWindow): GanttSpan | null {
  if (!start || !finish) return null;
  const windowStart = dayNumber(window.start), windowEnd = dayNumber(window.end) + 1;
  const spanStart = dayNumber(start), spanEnd = dayNumber(finish) + 1;
  if (!Number.isFinite(spanStart) || !Number.isFinite(spanEnd) || spanEnd <= spanStart) return null;
  const from = Math.max(spanStart, windowStart), to = Math.min(spanEnd, windowEnd);
  if (to <= from) return null;
  const size = windowEnd - windowStart;
  return { left: ((from - windowStart) / size) * 100, width: ((to - from) / size) * 100, clippedStart: spanStart < windowStart, clippedEnd: spanEnd > windowEnd };
}

/** The left edge of one day in the window, as a percentage; null outside it. Used for today and targets. */
export function ganttPoint(date: string | null | undefined, window: GanttWindow): number | null {
  if (!date) return null;
  const windowStart = dayNumber(window.start), windowEnd = dayNumber(window.end) + 1, day = dayNumber(date);
  if (!Number.isFinite(day) || day < windowStart || day >= windowEnd) return null;
  return ((day - windowStart) / (windowEnd - windowStart)) * 100;
}

/** The forecast tail: from the day after the plan finish to the forecast, only when the forecast is later. */
export function ganttSlip(planFinish: string | null | undefined, forecastFinish: string | null | undefined, window: GanttWindow): GanttSpan | null {
  if (!planFinish || !forecastFinish || forecastFinish <= planFinish) return null;
  return ganttSpan(dateFromDay(dayNumber(planFinish) + 1), forecastFinish, window);
}

/** Whole days a sideways drag of `pixels` moves, on a track `width` pixels wide that shows `days` days. */
export function ganttDragDays(pixels: number, width: number, days: number): number {
  if (!(width > 0) || !(days > 0) || !Number.isFinite(pixels)) return 0;
  return Math.round((pixels / width) * days) || 0;
}

/** An ISO date moved by whole days. */
export const ganttShift = (date: string, days: number) => dateFromDay(dayNumber(date) + days);

/** The first working day on or after `date`: not a Saturday, a Sunday or a company holiday (schedule-calculator.ts). */
export function nextWorkDay(date: string, holidays: ReadonlySet<string>): string {
  let day = dayNumber(date);
  for (let guard = 0; guard < 400; guard++, day++) {
    const weekday = new Date(day * DAY).getUTCDay(), candidate = dateFromDay(day);
    if (weekday !== 0 && weekday !== 6 && !holidays.has(candidate)) return candidate;
  }
  return dateFromDay(day);
}

/**
 * Where a row linked to a predecessor starts: the first working day after the predecessor's finish plus `lagDays`
 * calendar days, as backend-node/src/schedule-calculator.ts places it. Null while the predecessor has no dates.
 */
export function linkedStart(predecessorFinish: string | null, lagDays: number, holidays: ReadonlySet<string>): string | null {
  return predecessorFinish ? nextWorkDay(ganttShift(predecessorFinish, 1 + lagDays), holidays) : null;
}

/**
 * The plan a dragged bar asks for. Plan days are calendar days from start to finish (schedule-calculator.ts) and a
 * milestone stays one day. A linked row keeps its link: a new start becomes the lag after its predecessor's finish,
 * and a stretch alone leaves the lag as it was.
 */
export function draggedPlan(
  row: { startMode: string; isMilestone: boolean; storedPlanStart?: string | null; planStart: string | null; lagDays: number },
  start: string, finish: string, predecessorFinish: string | null,
): { planStart: string | null; planDays: number; lagDays: number } {
  const planDays = row.isMilestone ? 1 : Math.max(1, dayNumber(finish) - dayNumber(start) + 1);
  if (row.startMode !== "linked" || !predecessorFinish) return { planStart: start, planDays, lagDays: row.lagDays };
  const lagDays = start === row.planStart ? row.lagDays : dayNumber(start) - dayNumber(predecessorFinish) - 1;
  return { planStart: row.storedPlanStart ?? null, planDays, lagDays };
}

/**
 * Whether a plan's dates would go round in a circle (the API refuses it as schedule_cycle): a row with children takes
 * its dates from them, and a linked row without children from its predecessor. Used to leave such rows out of a
 * predecessor list, e.g. a task's own phase.
 */
export function planDatesLoop(rows: readonly { id: number; parentId: number | null; predecessorId: number | null; startMode: string }[]): boolean {
  const byId = new Map(rows.map((row) => [row.id, row]));
  const children = new Map<number, number[]>();
  for (const row of rows) if (row.parentId !== null) children.set(row.parentId, [...(children.get(row.parentId) ?? []), row.id]);
  const visiting = new Set<number>(), done = new Set<number>();
  const loops = (id: number): boolean => {
    if (done.has(id)) return false;
    if (visiting.has(id)) return true;
    visiting.add(id);
    const row = byId.get(id), own = children.get(id);
    const waitsOn = own?.length ? own : row && row.startMode === "linked" && row.predecessorId !== null && byId.has(row.predecessorId) ? [row.predecessorId] : [];
    if (waitsOn.some(loops)) return true;
    visiting.delete(id); done.add(id);
    return false;
  };
  return rows.some((row) => loops(row.id));
}

export type GanttXY = { x: number; y: number };
const px = (value: number) => Math.round(value * 10) / 10;
/**
 * The elbow a finish-to-start link draws, as an SVG path in pixels: out of the predecessor's end, down to the
 * successor's row and into its start. When the successor starts too close to that end, the line first steps back
 * along the boundary `rowGap` below (or above) the predecessor's row.
 */
export function ganttLinkPath(from: GanttXY, to: GanttXY, rowGap: number, stub = 6): string {
  const out = from.x + stub;
  if (to.x - out >= stub) return `M${px(from.x)} ${px(from.y)}H${px(out)}V${px(to.y)}H${px(to.x)}`;
  const between = from.y + (to.y >= from.y ? rowGap : -rowGap);
  return `M${px(from.x)} ${px(from.y)}H${px(out)}V${px(between)}H${px(to.x - stub)}V${px(to.y)}H${px(to.x)}`;
}

/**
 * Stacks spans that overlap into lanes, so several pieces of work can share one row: each span takes the first
 * lane that is free on its start day, by start date. Past `max` lanes a span shares the lane that frees up first.
 * Returns each span's lane, in the order given, and how many lanes there are.
 */
export function ganttLanes(spans: readonly { start: string; finish: string }[], max = 4): { lanes: number[]; count: number } {
  const lanes = spans.map(() => 0);
  const laneEnds: string[] = [];
  const order = spans.map((_, index) => index).sort((a, b) => spans[a]!.start.localeCompare(spans[b]!.start) || spans[a]!.finish.localeCompare(spans[b]!.finish));
  for (const index of order) {
    const { start, finish } = spans[index]!;
    let lane = laneEnds.findIndex((end) => end < start);
    if (lane < 0 && laneEnds.length < max) lane = laneEnds.length;
    if (lane < 0) lane = laneEnds.reduce((first, end, at) => (end < laneEnds[first]! ? at : first), 0);
    laneEnds[lane] = laneEnds[lane] && laneEnds[lane]! > finish ? laneEnds[lane]! : finish;
    lanes[index] = lane;
  }
  return { lanes, count: Math.max(1, laneEnds.length) };
}
