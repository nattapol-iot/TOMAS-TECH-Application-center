import { ApiError } from "./errors.js";
import { parseDateOnly } from "./http.js";
import type { CalendarState } from "./team-calendar.js";

// Repeating team tasks (owner request 2026-11-09): work that comes back, such as a meeting every day to update the
// team. A repeat is every working day (Monday to Friday) or chosen weekdays, until a date at most a year on, and it
// skips company holidays. Each day it falls on is saved as an ordinary team task tied to its series
// (dbo.team_tasks.series_id, occurrence_date), so the board, the load and the day list need nothing new. The series
// (dbo.team_task_series) keeps the rule and what the days were made from; Outlook gets one recurring entry for it, less
// the days that were removed, cancelled or changed on their own (those get an entry of their own).

export const REPEAT_RULES = ["Weekdays", "Weekly"] as const;
export type RepeatRule = (typeof REPEAT_RULES)[number];
/** Weekdays are Monday 1 … Sunday 7; `until` is the last day it may fall on. */
export type TeamTaskRepeat = { rule: RepeatRule; weekdays: number[]; until: string };
export const WORKING_WEEK: readonly number[] = [1, 2, 3, 4, 5];
/** The longest a task repeats: a year from its first day. */
export const MAX_REPEAT_DAYS = 366;

const DAY = 86_400_000;
const dayNumber = (date: string) => Date.parse(`${date}T00:00:00Z`) / DAY;
const dateOf = (day: number) => new Date(day * DAY).toISOString().slice(0, 10);
/** Monday 1 … Sunday 7. */
export const isoWeekday = (date: string) => ((new Date(`${date}T00:00:00Z`).getUTCDay() + 6) % 7) + 1;
/** Weekdays as dbo.team_task_series.weekdays stores them: Monday 1, Tuesday 2, Wednesday 4 … Sunday 64. */
export const weekdayMask = (weekdays: readonly number[]) => weekdays.reduce((mask, day) => mask | (1 << (day - 1)), 0);
export const maskWeekdays = (mask: number) => [1, 2, 3, 4, 5, 6, 7].filter((day) => (mask & (1 << (day - 1))) !== 0);

/** The repeat a request asks for (null: none). Only a one-day task repeats. */
export function parseRepeat(value: unknown, startDate: string, endDate: string): TeamTaskRepeat | null {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "object" || Array.isArray(value)) throw new ApiError(400, "validation_failed", "Repeat must be an object.");
  const body = value as Record<string, unknown>;
  if (typeof body.rule !== "string" || !(REPEAT_RULES as readonly string[]).includes(body.rule))
    throw new ApiError(400, "validation_failed", `Repeat must be one of: ${REPEAT_RULES.join(", ")}.`);
  const rule = body.rule as RepeatRule;
  if (endDate !== startDate) throw new ApiError(400, "validation_failed", "Only a task of one day can repeat.");
  const until = parseDateOnly(body.until, "Repeat until")!;
  if (until < startDate) throw new ApiError(400, "validation_failed", "The repeat cannot end before its first day.");
  if (dayNumber(until) - dayNumber(startDate) > MAX_REPEAT_DAYS)
    throw new ApiError(400, "validation_failed", `A task can repeat for at most ${MAX_REPEAT_DAYS} days.`);
  const chosen = rule === "Weekdays" ? WORKING_WEEK : body.weekdays;
  if (!Array.isArray(chosen) || !chosen.length || chosen.some((day) => !Number.isInteger(day) || day < 1 || day > 7))
    throw new ApiError(400, "validation_failed", "Choose the weekdays it repeats on.");
  return { rule, weekdays: [...new Set(chosen as number[])].sort((a, b) => a - b), until };
}

/** Every day from `from` until `until` on the weekdays given, holidays included: the series as Outlook counts it. */
export function ruleDates(from: string, until: string, weekdays: readonly number[]): string[] {
  const days = new Set(weekdays), dates: string[] = [];
  for (let day = dayNumber(from); day <= dayNumber(until); day++) {
    const date = dateOf(day);
    if (days.has(isoWeekday(date))) dates.push(date);
  }
  return dates;
}

/** The days a repeat puts the task on: its weekdays from the first day until the last, company holidays left out. */
export const repeatDates = (startDate: string, repeat: TeamTaskRepeat, holidays: ReadonlySet<string>) =>
  ruleDates(startDate, repeat.until, repeat.weekdays).filter((date) => !holidays.has(date));

/** What a series' days were made from: everything but the day and the status (dbo.team_task_series.template_json). */
export type SeriesTemplate = {
  kind: "Appointment" | "Task" | "Away";
  title: string;
  customerId: number | null;
  assigneeIds: number[];
  slot: "Day" | "AM" | "PM" | "Time";
  startTime: string | null;
  endTime: string | null;
  manDays: number;
  inquiryId: number | null;
  projectId: number | null;
  note: string;
  meetingMode: "Online" | "Offline" | null;
  meetingPlace: string;
};
export const parseTemplate = (value: unknown): SeriesTemplate => {
  const template = JSON.parse(String(value)) as SeriesTemplate;
  return { ...template, assigneeIds: Array.isArray(template.assigneeIds) ? template.assigneeIds.map(Number) : [], meetingMode: template.meetingMode ?? null, meetingPlace: template.meetingPlace ?? "" };
};

/** A series as saved. */
export type SeriesRecord = { id: number; weekdays: number[]; firstDate: string; until: string; template: SeriesTemplate };
/** One of its days as the calendar sees it, with the day the rule put it on. */
export type Occurrence = CalendarState & { id: number; occurrenceDate: string };

/** The template on a day, as the calendar compares it. */
export const templateState = (template: SeriesTemplate, date: string): CalendarState => ({
  kind: template.kind, title: template.title, customer: template.customerId === null ? "" : String(template.customerId), note: template.note,
  startDate: date, endDate: date, slot: template.slot, startTime: template.startTime, endTime: template.endTime,
  meetingMode: template.meetingMode, meetingPlace: template.meetingPlace, assigneeIds: [...template.assigneeIds], status: "Planned",
});

const SAME_FIELDS = ["kind", "title", "customer", "note", "slot", "startTime", "endTime", "meetingMode", "meetingPlace"] as const;
const sorted = (ids: readonly number[]) => [...ids].sort((a, b) => a - b).join(",");
const blank = (value: unknown) => (value === undefined || value === "" ? null : value);

/** Whether the series' own Outlook entry covers this day: still on its day, not cancelled, and saying what the series says. */
export function coveredBySeries(template: SeriesTemplate, day: Occurrence) {
  const base = templateState(template, day.occurrenceDate);
  return day.status !== "Cancelled" && day.startDate === day.occurrenceDate && day.endDate === day.occurrenceDate
    && SAME_FIELDS.every((field) => blank(day[field]) === blank(base[field])) && sorted(day.assigneeIds) === sorted(template.assigneeIds);
}

/**
 * The series' one Outlook entry: its rule from its first day until its last, less every day it does not cover (a
 * holiday, a day removed, cancelled or changed on its own). With no day left to cover it is cancelled for everyone.
 */
export function seriesState(series: SeriesRecord, days: readonly Occurrence[]): CalendarState {
  const covered = new Set(days.filter((day) => coveredBySeries(series.template, day)).map((day) => day.occurrenceDate));
  return {
    ...templateState(series.template, series.firstDate),
    status: covered.size ? "Planned" : "Cancelled",
    repeat: { seriesId: series.id, weekdays: [...series.weekdays], until: series.until, exdates: ruleDates(series.firstDate, series.until, series.weekdays).filter((date) => !covered.has(date)) },
  };
}

/** A day's own Outlook entry: none while the series' entry covers it; otherwise the day as it is. */
export function ownState(template: SeriesTemplate | null, day: Occurrence): CalendarState | null {
  return template && coveredBySeries(template, day) ? null : day;
}
