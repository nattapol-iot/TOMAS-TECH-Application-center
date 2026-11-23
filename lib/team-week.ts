/* Team overview > Team planner (owner decision 2026-11-23): the daily grid and Team week in one table, in hours. The
   API counts each day of what people booked (backend-node/src/team-week.ts); the grid's plan load comes from the team
   board (lib/team-board.ts). These helpers pick the one figure a cell shows and sum a person's days. */

export type TeamWeekChip = { label: string; kind: "project" | "work" | "other" | "meeting" | "task" | "away"; hours: number };
export type TeamWeekDay = {
  date: string;
  working: boolean;
  booked: number;
  meetings: number;
  tasks: number;
  away: number;
  total: number;
  free: number;
  confirmed: number | null;
  chips: TeamWeekChip[];
};
export type TeamWeekRow = { userId: number; days: TeamWeekDay[]; total: number; away: number; capacity: number; confirmed: number; unconfirmedDays: number };
export type TeamWeekData = { from: string; to: string; today: string; hoursPerDay: number; rows: TeamWeekRow[] };

const round2 = (value: number) => Math.round(value * 100) / 100;

/** Where a cell's figure comes from: the hours confirmed, what was booked on My week, or the plan. */
export type PlannerSource = "confirmed" | "booked" | "plan";
export type PlannerDay = { hours: number; capacity: number; away: number; source: PlannerSource; over: boolean; pending: boolean };

/**
 * One person's day on Team planner (owner decision 2026-11-23): one figure in hours from the newest source there is,
 * never two added together. The hours they confirmed; else what they booked on My week (its blocks, Outlook meetings
 * and team tasks, as Team week counted them); else the plan (planned man-days × 8, Outlook and team tasks included).
 * Time away comes off the day's capacity; a working day with more than its capacity is over.
 */
export function plannerDay(input: {
  date: string;
  today: string;
  /** The board's planned man-days that day, and what the day offers the person (0 on a weekend or a holiday). */
  planManDays: number;
  availableManDays: number;
  /** Away the whole day on the board's reading, for when Team week could not be read. */
  awayAllDay: boolean;
  week: TeamWeekDay | null;
  hoursPerDay?: number;
}): PlannerDay {
  const perDay = input.hoursPerDay ?? 8;
  const week = input.week;
  const working = input.availableManDays > 0;
  const away = week ? week.away : working && input.awayAllDay ? perDay : 0;
  const capacity = round2(Math.max(0, input.availableManDays * perDay - away));
  const source: PlannerSource = week && week.confirmed !== null ? "confirmed" : week && week.booked > 0 ? "booked" : "plan";
  const hours = round2(source === "confirmed" ? week!.confirmed! : source === "booked" ? week!.total : input.planManDays * perDay);
  return {
    hours,
    capacity,
    away,
    source,
    over: working && hours > capacity,
    // As My week asks: a working day up to today, not confirmed, and not a whole day away.
    pending: Boolean(week && week.working && input.date <= input.today && week.confirmed === null && week.away < perDay),
  };
}

/** What Team planner can filter people by (its summary bar). */
export type PlannerFlags = { over: boolean; free: boolean; pending: boolean; leave: boolean };

/** A person's days on show: their hours against what they can give, and which filters they fall under. */
export function plannerTotals(days: readonly PlannerDay[], hoursPerDay = 8) {
  const total = round2(days.reduce((sum, day) => sum + day.hours, 0));
  const capacity = round2(days.reduce((sum, day) => sum + day.capacity, 0));
  const pendingDays = days.filter((day) => day.pending).length;
  const flags: PlannerFlags = {
    over: total > capacity || days.some((day) => day.over),
    free: capacity - total >= hoursPerDay,
    pending: pendingDays > 0,
    leave: days.some((day) => day.away > 0),
  };
  return { total, capacity, pendingDays, flags };
}

/** The chip words the API sends for work the reader may not name, and their copy keys. */
export const CHIP_LABEL: Record<string, string> = {
  Meetings: "TeamWeek.meetings",
  Other: "TeamWeek.other",
  Work: "TeamWeek.work",
  Estimate: "TeamWeek.estimate",
  Inquiry: "TeamWeek.inquiry",
  Issue: "TeamWeek.issue",
  "Team task": "TeamWeek.teamTask",
  Away: "TeamWeek.away",
};
