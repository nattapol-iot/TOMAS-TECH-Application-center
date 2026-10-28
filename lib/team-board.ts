import { dateFromDay, dayNumber, isOpenWork, workingDays, type Commitment } from "./resource-planning";

// The team board's day grid (app/system/production/TeamBoard.tsx): everyone's load per working day, worked out the way
// the weekly Workload works it out, and what falls on each day.

const DAY = 86400000;
export type BoardDay = {
  date: string; holiday: boolean; today: boolean;
  /** The first day of its week, so the grid can rule weeks apart. */ weekStart: boolean;
  /** Saturday or Sunday: shown, so weekend appointments can be seen and added, but not a working day. */ weekend: boolean;
};

/** Monday to Sunday of `weeks` weeks from the Monday of `start`, with company holidays, weekends and today marked. */
export function boardDays(start: string, weeks: number, holidays: readonly string[], today: string): BoardDay[] {
  const first = dayNumber(start), monday = first - ((new Date(first * DAY).getUTCDay() + 6) % 7);
  const closed = new Set(holidays);
  const days: BoardDay[] = [];
  for (let week = 0; week < weeks; week++)
    for (let weekday = 0; weekday < 7; weekday++) {
      const date = dateFromDay(monday + week * 7 + weekday);
      days.push({ date, holiday: closed.has(date), today: date === today, weekStart: weekday === 0, weekend: weekday >= 5 });
    }
  return days;
}

export type DayLoad = { date: string; manDays: number; available: number; /** Null on a holiday with nothing planned. */ utilisation: number | null };

/**
 * A person's planned man-days on each day: every open item's effort spread evenly over its working days, as
 * planningLoad spreads it over weeks. A working day offers capacity / 5 man-days; a holiday or a weekend offers none. Leave is not
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
  return days.map(({ date, holiday, weekend }) => {
    const manDays = spread.get(date) ?? 0, available = holiday || weekend ? 0 : daily;
    const utilisation = available > 0 ? (manDays / available) * 100 : manDays > 0 ? Infinity : null;
    return { date, manDays, available, utilisation };
  });
}

/** An Outlook event as the board needs it: Bangkok local start and end ("YYYY-MM-DDTHH:MM:SS"); an all-day one ends at midnight after its last day. */
export type OutlookSpan = { userId: number; start: string; end: string; allDay: boolean };

const minutesOfDay = (stamp: string) => Number(stamp.slice(11, 13)) * 60 + Number(stamp.slice(14, 16));

/** The days an Outlook event falls on. */
export function outlookDates(event: OutlookSpan): string[] {
  const first = event.start.slice(0, 10);
  // An all-day event, or one that ends exactly at midnight, stops the day before its end.
  const last = event.allDay || event.end.slice(11, 16) === "00:00" ? dateFromDay(Math.max(dayNumber(first), dayNumber(event.end.slice(0, 10)) - 1)) : event.end.slice(0, 10);
  const dates: string[] = [];
  for (let day = dayNumber(first); day <= dayNumber(last) && dates.length < 400; day++) dates.push(dateFromDay(day));
  return dates;
}

/**
 * Man-days an Outlook event takes on one day (owner decision 2026-10-28: counted by its hours). An all-day event is a
 * whole day; a timed one is its minutes on that day less any lunch hour (12:00–13:00) over an 8-hour day.
 */
export function outlookManDays(event: OutlookSpan, date: string): number {
  const dates = outlookDates(event);
  if (!dates.includes(date)) return 0;
  if (event.allDay) return 1;
  const from = event.start.slice(0, 10) === date ? minutesOfDay(event.start) : 0;
  const until = event.end.slice(0, 10) === date ? minutesOfDay(event.end) : 24 * 60;
  const lunch = Math.max(0, Math.min(until, 13 * 60) - Math.max(from, 12 * 60));
  return Math.max(0, until - from - lunch) / 480;
}

/** Each person's Outlook man-days per day, keyed "userId|date"; a day holds at most one man-day of meetings. */
export function outlookLoad(events: readonly OutlookSpan[]): Map<string, number> {
  const load = new Map<string, number>();
  for (const event of events) for (const date of outlookDates(event)) {
    const key = `${event.userId}|${date}`;
    load.set(key, Math.min(1, (load.get(key) ?? 0) + outlookManDays(event, date)));
  }
  return load;
}

/** A day's load with Outlook's man-days added. */
export function withOutlook(load: DayLoad[], extra: (date: string) => number): DayLoad[] {
  return load.map((day) => {
    const added = extra(day.date);
    if (!added) return day;
    const manDays = day.manDays + added;
    return { ...day, manDays, utilisation: day.available > 0 ? (manDays / day.available) * 100 : manDays > 0 ? Infinity : null };
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

/**
 * One cell of a copied table: tabs and line breaks become spaces, and text a spreadsheet would run as a formula
 * (starting with =, + or @) is kept as text.
 */
const cellText = (value: unknown) => {
  const text = String(value ?? "").replace(/[\t\r\n]+/g, " ").trim();
  return /^[=+@]/.test(text) ? `'${text}` : text;
};
const escapeHtml = (value: string) => value.replace(/[&<>"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[character]!);
/** Rows as tab-separated text: Excel pastes it into columns, a chat shows it as lines. The first row is the heading. */
export const tableTsv = (rows: unknown[][]) => rows.map((row) => row.map(cellText).join("\t")).join("\r\n");
/** The same rows as an HTML table, for Outlook, Teams or Word, which paste it as a table. */
export const tableHtml = (rows: unknown[][]) =>
  `<table border="1" cellspacing="0" cellpadding="4">${rows.map((row, index) =>
    `<tr>${row.map((cell) => (index ? `<td>${escapeHtml(cellText(cell))}</td>` : `<th>${escapeHtml(cellText(cell))}</th>`)).join("")}</tr>`).join("")}</table>`;

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
