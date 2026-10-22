import { dateFromDay, dayNumber, isOpenWork, workingDays, type Commitment } from "./resource-planning";

// The team board's day grid (app/system/production/TeamBoard.tsx): everyone's load per working day, worked out the way
// the weekly Workload works it out, and what falls on each day.

const DAY = 86400000;
export type BoardDay = { date: string; holiday: boolean; today: boolean; /** The first day of its week, so the grid can rule weeks apart. */ weekStart: boolean };

/** Monday to Friday of `weeks` weeks from the Monday of `start`, with company holidays and today marked. */
export function boardDays(start: string, weeks: number, holidays: readonly string[], today: string): BoardDay[] {
  const first = dayNumber(start), monday = first - ((new Date(first * DAY).getUTCDay() + 6) % 7);
  const closed = new Set(holidays);
  const days: BoardDay[] = [];
  for (let week = 0; week < weeks; week++)
    for (let weekday = 0; weekday < 5; weekday++) {
      const date = dateFromDay(monday + week * 7 + weekday);
      days.push({ date, holiday: closed.has(date), today: date === today, weekStart: weekday === 0 });
    }
  return days;
}

export type DayLoad = { date: string; manDays: number; available: number; /** Null on a holiday with nothing planned. */ utilisation: number | null };

/**
 * A person's planned man-days on each day: every open item's effort spread evenly over its working days, as
 * planningLoad spreads it over weeks. A working day offers capacity / 5 man-days; a holiday offers none. Leave is not
 * deducted (owner decision 2026-10-21): the board only shows it.
 */
export function dailyLoad(items: Commitment[], days: BoardDay[], capacity: number, holidays: readonly string[] = []): DayLoad[] {
  const spread = new Map<string, number>();
  for (const item of items) {
    if (!isOpenWork(item) || item.manDays === null || !item.manDays || !item.start || !item.end) continue;
    const span = workingDays(item.start, item.end, holidays);
    if (!span.length) continue;
    const share = item.manDays / span.length;
    for (const date of span) spread.set(date, (spread.get(date) ?? 0) + share);
  }
  const daily = capacity / 5;
  return days.map(({ date, holiday }) => {
    const manDays = spread.get(date) ?? 0, available = holiday ? 0 : daily;
    const utilisation = available > 0 ? (manDays / available) * 100 : manDays > 0 ? Infinity : null;
    return { date, manDays, available, utilisation };
  });
}

/** The same bands as the weekly Workload: under 85% has room, up to 100% is full, above is over. */
export const loadBand = (utilisation: number | null): "none" | "ok" | "full" | "over" =>
  utilisation === null ? "none" : utilisation > 100 ? "over" : utilisation >= 85 ? "full" : "ok";

/** The share of a week's capacity a person has planned over the given days, for "x / y MD" beside their name. */
export function weekTotals(load: DayLoad[], from: string, to: string) {
  let manDays = 0, available = 0;
  for (const day of load) if (day.date >= from && day.date <= to) { manDays += day.manDays; available += day.available; }
  return { manDays, available, utilisation: available > 0 ? (manDays / available) * 100 : manDays > 0 ? Infinity : null };
}

/** Whether a dated span covers a day. */
export const covers = (start: string | null, end: string | null, date: string) => Boolean(start) && start! <= date && (end ?? start)! >= date;

/**
 * Who to offer when the chosen person is full: people with room that day (under 85%, at work, not away), the
 * preferred ones (their own team) first, then the most room; ties go to the lighter fortnight.
 */
export function freestOn<T extends { userId: number; load: DayLoad[]; away: (date: string) => boolean }>(
  people: T[], date: string, limit = 3, preferred: (person: T) => boolean = () => false,
) {
  return people
    .map((person) => ({ person, day: person.load.find((entry) => entry.date === date) }))
    .filter(({ person, day }) => day && day.available > 0 && (day.utilisation ?? 0) < 85 && !person.away(date))
    .sort((a, b) => Number(preferred(b.person)) - Number(preferred(a.person))
      || (a.day!.utilisation ?? 0) - (b.day!.utilisation ?? 0)
      || a.person.load.reduce((sum, d) => sum + d.manDays, 0) - b.person.load.reduce((sum, d) => sum + d.manDays, 0))
    .slice(0, limit)
    .map(({ person, day }) => ({ person, utilisation: day!.utilisation ?? 0 }));
}

/** The load a person's day would have with `extra` more man-days on it. */
export const withExtra = (day: DayLoad | undefined, extra: number) =>
  !day ? null : day.available > 0 ? ((day.manDays + extra) / day.available) * 100 : day.manDays + extra > 0 ? Infinity : null;

const minutesOf = (time: string) => Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5));
/**
 * Effort a new task takes by default: each working day, whole or half (a day off counts as a day). A one-day time
 * range counts its hours against an 8-hour day, lunch (12:00–13:00) left out, to the nearest quarter and at least
 * one quarter; backend-node/src/routes/team-board.ts works it out the same way.
 */
export function defaultTaskManDays(start: string, end: string, slot: "Day" | "AM" | "PM" | "Time", holidays: readonly string[] = [], startTime = "", endTime = "") {
  if (!start || !end || end < start) return 0;
  if (slot === "Time" && start === end && startTime && endTime) {
    const from = minutesOf(startTime), until = minutesOf(endTime);
    if (until <= from) return 0;
    const lunch = Math.max(0, Math.min(until, 13 * 60) - Math.max(from, 12 * 60));
    return Math.max(0.25, Math.round(((until - from - lunch) / 480) * 4) / 4);
  }
  const days = workingDays(start, end, holidays).length || dayNumber(end) - dayNumber(start) + 1;
  return days * (slot === "AM" || slot === "PM" ? 0.5 : 1);
}

/** A task's time as the board shows it: its own range, or nothing for a whole day, a morning or an afternoon. */
export const timeRange = (task: { slot: string; startTime: string | null; endTime: string | null }) =>
  task.slot === "Time" && task.startTime ? `${task.startTime}–${task.endTime ?? ""}` : "";

/** How the list groups work by its due date: past it, this week, next week, later, no date. */
export function dueGroup(end: string | null, today: string): "late" | "thisWeek" | "nextWeek" | "later" | "none" {
  if (!end) return "none";
  if (end < today) return "late";
  const day = dayNumber(today), monday = day - ((new Date(day * DAY).getUTCDay() + 6) % 7);
  const endDay = dayNumber(end);
  if (endDay <= monday + 6) return "thisWeek";
  if (endDay <= monday + 13) return "nextWeek";
  return "later";
}
