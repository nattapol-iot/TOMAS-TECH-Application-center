/*
 * Planning people who work on several projects at once (owner decisions 2026-11-25):
 * - the Master Plan's headings hold the customer's dates; a Team Plan task holds its member, its hours of work and the
 *   window it may be done in, inside its heading;
 * - the hours are spread evenly over the window's working days (a leader may adjust them week by week: the row's
 *   per-day shares, byDay), shown as hours a day and a share of the day, not as whole days;
 * - a row with no hours takes nobody's time: it is listed To follow up, not counted;
 * - when the member's free time in the window is short, the plan says by how much and when the work would finish; the
 *   PM or the leader picks the fix, nothing moves by itself;
 * - hours confirmed in My Work come off the task's hours, and what is left is spread over the days left.
 *
 * A person's other work is everything else on their board (lib/team-board.ts items, every project): each item's
 * man-days spread over its working days, or its typed days. Their time is 8 hours a working day at their weekly
 * capacity, less time away.
 */
import { DEFAULT_WEEKLY_CAPACITY, awayByDate, dateFromDay, dayNumber, isOpenWork, workingDays, type AwaySpan, type Commitment } from "./resource-planning";

export const HOURS_PER_DAY = 8;
/** How far past its window the forecast looks for free time before it gives up (the board reads at most 400 days). */
export const FORECAST_HORIZON_DAYS = 365;

const round2 = (value: number) => Math.round(value * 100) / 100;

/** An item's man-days on a date: its typed share, else its man-days over its working days; none without man-days. */
export function itemManDays(item: Pick<Commitment, "start" | "end" | "manDays" | "byDay">, date: string, holidays: readonly string[] = []): number {
  if (item.byDay) return item.byDay[date] ?? 0;
  if (!item.start || item.manDays === null || !(item.manDays > 0)) return 0;
  const end = item.end ?? item.start;
  if (date < item.start || date > end) return 0;
  const span = workingDays(item.start, end, holidays);
  return span.includes(date) ? item.manDays / span.length : 0;
}

/** One piece of someone's other work on a day. */
export type OtherWork = { key: string; reference: string; title: string; hours: number };

export type FitDay = {
  date: string;
  /** Hours the person has that day: capacity less time away. */
  capacity: number;
  away: number;
  /** Their other work, in hours, largest first. */
  other: OtherWork[];
  otherHours: number;
  /** What this task needs that day. */
  need: number;
  /** Capacity left after the other work. */
  free: number;
};

export type FitWeek = { start: string; end: string; workDays: number; need: number; other: number; away: number; free: number; short: number };

export type TaskFit = {
  userId: number;
  effortHours: number;
  doneHours: number;
  remainingHours: number;
  /** The working days the remaining hours are spread over: the window's, from today on. */
  workDays: number;
  /** Hours a working day this task takes, and that share of an 8-hour day (%). */
  perDayHours: number;
  percentOfDay: number;
  freeHours: number;
  shortHours: number;
  fits: boolean;
  /** The day the remaining hours are done if the person works on it in their free time; null past the horizon. */
  forecastFinish: string | null;
  /** The forecast is past the window's end. */
  late: boolean;
  days: FitDay[];
  weeks: FitWeek[];
};

export type FitInput = {
  /** The person's board items, every project (lib/team-board.ts); this task's own rows are told apart by isThisTask. */
  items: readonly Commitment[];
  isThisTask: (item: Commitment) => boolean;
  userId: number;
  start: string;
  end: string;
  /** This person's hours of the task, and the hours already confirmed on it. */
  effortHours: number;
  doneHours: number;
  /** Per-day hours a leader set week by week (the row's byDay shares × 8); absent, the hours are spread evenly. */
  byDayHours?: Readonly<Record<string, number>> | null;
  /** Working days a week (resource capacity); null for the default five. */
  daysPerWeek: number | null;
  /** The share of each working day the person is away (lib/resource-planning.ts awayByDate). */
  away: ReadonlyMap<string, number>;
  holidays: readonly string[];
  today: string;
};

function dayOf(input: FitInput, date: string): Omit<FitDay, "need"> {
  const capacityFactor = (input.daysPerWeek ?? DEFAULT_WEEKLY_CAPACITY) / 5;
  const awayShare = Math.min(1, input.away.get(date) ?? 0);
  const full = HOURS_PER_DAY * capacityFactor;
  const away = full * awayShare;
  const other: OtherWork[] = [];
  for (const item of input.items) {
    if (item.ownerId !== input.userId || input.isThisTask(item) || !isOpenWork(item)) continue;
    const hours = itemManDays(item, date, input.holidays) * HOURS_PER_DAY;
    if (hours > 0) other.push({ key: item.key, reference: item.hidden ? "" : item.reference, title: item.hidden ? "" : item.title, hours: round2(hours) });
  }
  other.sort((a, b) => b.hours - a.hours || a.key.localeCompare(b.key));
  const otherHours = round2(other.reduce((sum, row) => sum + row.hours, 0));
  const capacity = round2(full - away);
  return { date, capacity, away: round2(away), other, otherHours, free: round2(Math.max(0, capacity - otherHours)) };
}

const mondayOf = (date: string) => {
  const day = dayNumber(date);
  return dateFromDay(day - ((new Date(day * 86400000).getUTCDay() + 6) % 7));
};

/** Whether this person's remaining hours fit their free time in the window, and when they would finish. */
export function taskFit(input: FitInput): TaskFit {
  const from = input.today > input.start ? input.today : input.start;
  const window = workingDays(from, input.end, input.holidays);
  const remaining = round2(Math.max(0, input.effortHours - input.doneHours));
  const typed = input.byDayHours ? Object.entries(input.byDayHours).filter(([date, hours]) => date >= from && hours > 0) : null;
  const typedTotal = typed ? typed.reduce((sum, [, hours]) => sum + hours, 0) : 0;
  const needOn = (date: string) => {
    if (typed && typedTotal > 0) return ((input.byDayHours![date] ?? 0) * remaining) / typedTotal;
    return window.length && window.includes(date) ? remaining / window.length : 0;
  };
  const days: FitDay[] = window.map((date) => ({ ...dayOf(input, date), need: round2(needOn(date)) }));
  const freeHours = round2(days.reduce((sum, day) => sum + day.free, 0));
  const shortHours = round2(Math.max(0, remaining - freeHours));
  // Forecast: the remaining hours done in the person's free time, day by day, from the first day of the window left.
  let forecastFinish: string | null = null;
  if (remaining <= 0) forecastFinish = from <= input.end ? from : input.today;
  else {
    let left = remaining;
    const first = dayNumber(from);
    for (let offset = 0; offset <= FORECAST_HORIZON_DAYS && forecastFinish === null; offset += 1) {
      const date = dateFromDay(first + offset);
      if (!workingDays(date, date, input.holidays).length) continue;
      const free = window.includes(date) ? days[window.indexOf(date)]!.free : dayOf(input, date).free;
      left = round2(left - free);
      if (left <= 0) forecastFinish = date;
    }
  }
  const weeks = new Map<string, FitWeek>();
  for (const day of days) {
    const start = mondayOf(day.date);
    const week = weeks.get(start) ?? { start, end: dateFromDay(dayNumber(start) + 6), workDays: 0, need: 0, other: 0, away: 0, free: 0, short: 0 };
    week.workDays += 1;
    week.need = round2(week.need + day.need);
    week.other = round2(week.other + day.otherHours);
    week.away = round2(week.away + day.away);
    week.free = round2(week.free + day.free);
    week.short = round2(Math.max(0, week.need - week.free));
    weeks.set(start, week);
  }
  const perDayHours = window.length ? round2(remaining / window.length) : remaining;
  return {
    userId: input.userId,
    effortHours: round2(input.effortHours),
    doneHours: round2(input.doneHours),
    remainingHours: remaining,
    workDays: window.length,
    perDayHours,
    percentOfDay: Math.round((perDayHours / HOURS_PER_DAY) * 100),
    freeHours,
    shortHours,
    fits: shortHours <= 0,
    forecastFinish,
    late: forecastFinish === null || forecastFinish > input.end,
    days,
    weeks: [...weeks.values()],
  };
}

/** A heading is at risk when the latest forecast under it is past its end, the customer's date. */
export function headingRisk(headingEnd: string | null, forecasts: readonly (string | null)[]): { atRisk: boolean; forecast: string | null } {
  const known = forecasts.filter((value): value is string => value !== null);
  const unknown = forecasts.some((value) => value === null);
  const forecast = known.length ? known.reduce((a, b) => (a > b ? a : b)) : null;
  return { atRisk: unknown || (headingEnd !== null && forecast !== null && forecast > headingEnd), forecast };
}

/** What Team overview's board reads (GET /api/v1/team-board), as the plan needs it. */
export type BoardCapacity = {
  items: readonly Commitment[];
  capacities: ReadonlyArray<{ userId: number; daysPerWeek: number }>;
  holidays: readonly string[];
  /** Days away (engineer_availability) and Away team tasks, as lib/resource-planning.ts awayByDate reads them. */
  away: readonly AwaySpan[];
};

/** A plan row as the fit needs it. */
export type PlanTask = { id: number; start: string | null; end: string | null; picIds: readonly number[]; planHours: number; actualHours: number; outsourced: boolean };

/**
 * A row's verdict on the Sheet's "free time" column:
 * - fits / short: its member's free time in its window holds its hours, or does not;
 * - noHours: it has a member but no hours, so it takes nobody's time (listed To follow up);
 * - outsourced: a supplier does it, not the team;
 * - none: nothing to judge (no member, no dates).
 */
export type PlanFit = {
  taskId: number;
  status: "fits" | "short" | "noHours" | "outsourced" | "none";
  perDayHours: number;
  percentOfDay: number;
  shortHours: number;
  forecastFinish: string | null;
  late: boolean;
  people: TaskFit[];
};

export function planFit(task: PlanTask, board: BoardCapacity, today: string): PlanFit {
  const empty = (status: PlanFit["status"]): PlanFit => ({ taskId: task.id, status, perDayHours: 0, percentOfDay: 0, shortHours: 0, forecastFinish: null, late: false, people: [] });
  if (task.outsourced) return empty("outsourced");
  if (!task.picIds.length || !task.start) return empty("none");
  if (!(task.planHours > 0)) return empty("noHours");
  const workKey = `Project-${task.id}`;
  const isThisTask = (item: Commitment) => item.workKey === workKey || item.taskId === task.id;
  const share = task.picIds.length;
  const people = task.picIds.map((userId) => {
    const own = board.items.find((item) => isThisTask(item) && item.ownerId === userId);
    const byDayHours = own?.byDay ? Object.fromEntries(Object.entries(own.byDay).map(([date, manDays]) => [date, manDays * HOURS_PER_DAY])) : null;
    return taskFit({
      items: board.items,
      isThisTask,
      userId,
      start: task.start!,
      end: task.end ?? task.start!,
      effortHours: task.planHours / share,
      doneHours: task.actualHours / share,
      byDayHours,
      daysPerWeek: board.capacities.find((row) => row.userId === userId)?.daysPerWeek ?? null,
      away: awayByDate(board.away, userId, board.holidays),
      holidays: board.holidays,
      today,
    });
  });
  const shortHours = round2(people.reduce((sum, fit) => sum + fit.shortHours, 0));
  const forecasts = people.map((fit) => fit.forecastFinish);
  const forecastFinish = forecasts.includes(null) ? null : forecasts.reduce<string | null>((a, b) => (a === null || (b !== null && b > a) ? b : a), null);
  const perDayHours = round2(people.reduce((sum, fit) => sum + fit.perDayHours, 0) / people.length);
  return {
    taskId: task.id,
    status: shortHours > 0 ? "short" : "fits",
    perDayHours,
    percentOfDay: Math.round((perDayHours / HOURS_PER_DAY) * 100),
    shortHours,
    forecastFinish,
    late: people.some((fit) => fit.late),
    people,
  };
}
