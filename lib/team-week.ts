/* Team overview > Team week (owner decision 2026-11-23): everyone's week in hours. The API counts each day
   (backend-node/src/team-week.ts); these helpers sort the rows and say which filters each person falls under. */

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
export type TeamWeekFocus = "over" | "free" | "pending" | "leave";

const round2 = (value: number) => Math.round(value * 100) / 100;

/** The hours a person can still give this week: capacity less time away. */
export const available = (row: Pick<TeamWeekRow, "capacity" | "away">) => round2(Math.max(0, row.capacity - row.away));

/** Which filters a person's week falls under. */
export function rowFlags(row: TeamWeekRow, hoursPerDay = 8): Record<TeamWeekFocus, boolean> {
  return {
    over: row.total > available(row) || row.days.some((day) => day.total + day.away > hoursPerDay),
    free: available(row) - row.total >= hoursPerDay,
    pending: row.unconfirmedDays > 0,
    leave: row.away > 0,
  };
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

/** The busiest weeks first, so the decisions sit at the top; then by name. */
export const byLoad = <T extends { row: TeamWeekRow; name: string }>(left: T, right: T) =>
  right.row.total / Math.max(1, available(right.row)) - left.row.total / Math.max(1, available(left.row)) || left.name.localeCompare(right.name);
