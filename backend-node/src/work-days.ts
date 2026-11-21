import { ApiError } from "./errors.js";
import { bodyObject } from "./http.js";
import type { WorkloadItem } from "./resource-workload.js";
import { timeRangeManDays } from "./routes/team-board.js";

/*
 * Daily work hours (migration 121). The CEO wants man-hours used per project and what each engineer does each day;
 * engineers must not get a new data-entry load (owner, 2026-11-10). So the app drafts each day from the work already
 * planned for the person and they confirm it: "confirm, don't enter". A day that went as planned takes one press;
 * only a day that went differently is changed.
 *
 * The draft follows the team board's own load rules (lib/team-board.ts dailyLoad / dayWork), so the board and the
 * draft never disagree about what a day holds:
 *   - a plan row's man-days spread evenly over its working days, split across its PICs; people typed per day
 *     (the People table) take exactly what was typed on that date;
 *   - plan work with no man-days counts as a full day for its piece of work (a task and its functions are one);
 *   - a team task takes its man-days over its days; one put on a weekend or a holiday shows there;
 *   - Outlook meetings take their hours (lunch 12:00-13:00 left out); time away is taken off the day first.
 * A day holds HOURS_PER_DAY hours of draft at most: when the plan holds more, every piece shrinks in proportion
 * (the person then moves hours between them). Hours are kept to the quarter hour.
 */

export const HOURS_PER_DAY = 8;
/** How far back a day may still be confirmed or changed. */
export const EDIT_DAYS_BACK = 30;
/** The longest window one read returns. */
export const MAX_WINDOW_DAYS = 14;
export const MAX_DAY_HOURS = 24;
export const MAX_ROWS = 30;
export const MAX_NOTE = 200;
export const WORK_KEY = /^(?:Project|TeamTask|Issue|InquiryTask|Inquiry|Estimate|EstimateSection|Outlook)-[1-9][0-9]{0,17}$/;

export type WorkKind = "Project" | "TeamTask" | "Issue" | "Inquiry" | "Estimate" | "Outlook";
/** A piece of work a day's hours can go to. */
export type WorkChoice = { workKey: string; kind: WorkKind; projectId: number | null; projectNo: string | null; title: string; reference: string };
export type DraftRow = WorkChoice & { hours: number };

export type TeamTaskDay = {
  id: number; kind: "Appointment" | "Task" | "Away"; title: string; projectId: number | null; projectNo: string | null;
  start: string; end: string; slot: string; startTime: string | null; endTime: string | null; manDays: number;
};
export type OutlookEventDay = { id: number; subject: string | null; allDay: boolean; start: string; end: string };
/** Time away on each day of a span, in hours. */
export type AwaySpan = { start: string; end: string; hours: number };
export type DayDraft = { date: string; working: boolean; awayHours: number; rows: DraftRow[] };

const DAY = 86_400_000;
export const dayNumber = (date: string) => Date.parse(`${date}T00:00:00Z`) / DAY;
export const dateFromDay = (day: number) => new Date(day * DAY).toISOString().slice(0, 10);
export const addDays = (date: string, days: number) => dateFromDay(dayNumber(date) + days);
export const isWeekend = (date: string) => { const weekday = new Date(`${date}T00:00:00Z`).getUTCDay(); return weekday === 0 || weekday === 6; };
export const isWorkingDay = (date: string, holidays: ReadonlySet<string>) => !isWeekend(date) && !holidays.has(date);
const round2 = (value: number) => Math.round(value * 100) / 100;

export function workingDayCount(start: string, end: string, holidays: ReadonlySet<string>): number {
  let count = 0;
  for (let day = dayNumber(start); day <= dayNumber(end); day++) if (isWorkingDay(dateFromDay(day), holidays)) count++;
  return count;
}

/** The dates from `from` to `to`, both included. */
export function datesBetween(from: string, to: string): string[] {
  const dates: string[] = [];
  for (let day = dayNumber(from); day <= dayNumber(to); day++) dates.push(dateFromDay(day));
  return dates;
}

/** The days that may still be confirmed or changed: the last EDIT_DAYS_BACK days and today, never a future day. */
export const editableFrom = (today: string) => addDays(today, -EDIT_DAYS_BACK);
export const isEditable = (date: string, today: string) => date >= editableFrom(today) && date <= today;

/**
 * Hours to the quarter, keeping their total: each figure is rounded down to a quarter and the quarters left over go
 * to the figures that lost most (largest remainder), so a day scaled to 8 hours still adds up to 8.
 */
export function quarterHours(values: readonly number[], total: number): number[] {
  const quarters = values.map((value) => Math.max(0, value) * 4), floors = quarters.map(Math.floor);
  let left = Math.round(total * 4) - floors.reduce((sum, value) => sum + value, 0);
  const order = quarters.map((value, index) => ({ index, remainder: value - floors[index]! })).sort((a, b) => b.remainder - a.remainder || a.index - b.index);
  for (const { index } of order) { if (left <= 0) break; floors[index]! += 1; left -= 1; }
  return floors.map((value) => value / 4);
}

/** The piece of work an item belongs to: a plan task with its functions is one (resource-workload.ts `group`). */
const pieceOf = (item: Pick<WorkloadItem, "group" | "workKey">) => item.group ?? item.workKey;

/**
 * What the person's plan work (everything but team tasks) takes on a date, in man-days, by item. Mirrors dayWork and
 * impliedEffort in lib/team-board.ts / lib/resource-planning.ts.
 */
export function planShares(items: readonly WorkloadItem[], date: string, holidays: ReadonlySet<string>): { item: WorkloadItem; manDays: number }[] {
  const working = isWorkingDay(date, holidays);
  const typed: { item: WorkloadItem; manDays: number }[] = [], implied: WorkloadItem[] = [];
  for (const item of items) {
    if (!item.start || item.type === "Task") continue;
    const end = item.end ?? item.start;
    if (date < item.start || date > end) continue;
    if (item.byDay) {
      const share = item.byDay[date] ?? 0;
      if (share > 0) typed.push({ item, manDays: share });
      continue;
    }
    if (!working) continue;
    if (item.manDays !== null && item.manDays > 0) {
      const span = workingDayCount(item.start, end, holidays);
      if (span > 0) typed.push({ item, manDays: item.manDays / span });
    } else if (item.type === "Project") implied.push(item);
  }
  // Plan work with no man-days: one day for its piece, shared by its rows, unless the piece has typed effort that day.
  const typedPieces = new Set(typed.map(({ item }) => pieceOf(item)));
  const byPiece = new Map<string, WorkloadItem[]>();
  for (const item of implied) if (!typedPieces.has(pieceOf(item))) byPiece.set(pieceOf(item), [...(byPiece.get(pieceOf(item)) ?? []), item]);
  const fullDays = [...byPiece.values()].flatMap((rows) => rows.map((item) => ({ item, manDays: 1 / rows.length })));
  return [...typed, ...fullDays];
}

/** A team task's man-days on a date: its effort over its working days, or on the weekend or holiday it was put on. */
export function teamTaskShare(task: TeamTaskDay, date: string, holidays: ReadonlySet<string>): number {
  if (task.kind === "Away" || date < task.start || date > task.end || !(task.manDays > 0)) return 0;
  const working = workingDayCount(task.start, task.end, holidays);
  if (!isWorkingDay(date, holidays)) return working > 0 ? 0 : task.manDays / (dayNumber(task.end) - dayNumber(task.start) + 1);
  return task.manDays / working;
}

/** Hours of time away on a date: a whole day, a half day (AM / PM) or a time range. */
export function awayHours(spans: readonly AwaySpan[], date: string): number {
  return Math.min(HOURS_PER_DAY, spans.reduce((sum, span) => sum + (date >= span.start && date <= span.end ? span.hours : 0), 0));
}

/** Hours an away team task takes off each of its days. */
export function awaySlotHours(task: Pick<TeamTaskDay, "slot" | "start" | "end" | "startTime" | "endTime">): number {
  if (task.slot === "AM" || task.slot === "PM") return HOURS_PER_DAY / 2;
  if (task.slot === "Time" && task.start === task.end && task.startTime && task.endTime) return Math.min(HOURS_PER_DAY, timeRangeManDays(task.startTime, task.endTime) * HOURS_PER_DAY);
  return HOURS_PER_DAY;
}

const minutesOfDay = (stamp: string) => Number(stamp.slice(11, 13)) * 60 + Number(stamp.slice(14, 16));

/** Hours an Outlook event takes on a date, as the board counts them (lib/team-board.ts outlookManDays). */
export function outlookHours(event: Pick<OutlookEventDay, "allDay" | "start" | "end">, date: string): number {
  const first = event.start.slice(0, 10);
  const last = event.allDay || event.end.slice(11, 16) === "00:00" ? dateFromDay(Math.max(dayNumber(first), dayNumber(event.end.slice(0, 10)) - 1)) : event.end.slice(0, 10);
  if (date < first || date > last) return 0;
  if (event.allDay) return HOURS_PER_DAY;
  const from = first === date ? minutesOfDay(event.start) : 0;
  const until = event.end.slice(0, 10) === date ? minutesOfDay(event.end) : 24 * 60;
  const lunch = Math.max(0, Math.min(until, 13 * 60) - Math.max(from, 12 * 60));
  return Math.min(HOURS_PER_DAY, Math.max(0, until - from - lunch) / 60);
}

const kindOf = (item: WorkloadItem): WorkKind =>
  item.type === "Project" ? "Project" : item.type === "Issue" ? "Issue" : item.type === "Estimate" ? "Estimate" : "Inquiry";

/** A workload item as a piece of work hours can go to. Issues take their batch's project from `issueProjects`. */
export function choiceFromItem(item: WorkloadItem, issueProjects: ReadonlyMap<number, { projectId: number | null; projectNo: string | null }>): WorkChoice {
  const kind = kindOf(item);
  const issue = kind === "Issue" ? issueProjects.get(Number(item.workKey.slice("Issue-".length))) : undefined;
  return {
    workKey: item.workKey, kind,
    projectId: kind === "Project" ? item.entityId : issue?.projectId ?? null,
    projectNo: kind === "Project" ? item.reference.split(" · ")[0] ?? null : issue?.projectNo ?? null,
    title: item.title || item.reference, reference: item.reference,
  };
}

export const choiceFromTeamTask = (task: TeamTaskDay): WorkChoice =>
  ({ workKey: `TeamTask-${task.id}`, kind: "TeamTask", projectId: task.projectId, projectNo: task.projectNo, title: task.title, reference: task.projectNo ?? "" });

export const choiceFromOutlook = (event: OutlookEventDay): WorkChoice =>
  ({ workKey: `Outlook-${event.id}`, kind: "Outlook", projectId: null, projectNo: null, title: event.subject?.trim() || "Outlook", reference: "" });

export type DraftInput = {
  today: string;
  holidays: ReadonlySet<string>;
  /** The person's own open workload items, team tasks left out (they come as teamTasks). */
  items: readonly WorkloadItem[];
  /**
   * Their finished items (a plan row marked done, for instance). They are drafted on past days only: work finished
   * since then still took those days, while today the board no longer counts it.
   */
  finishedItems: readonly WorkloadItem[];
  teamTasks: readonly TeamTaskDay[];
  outlook: readonly OutlookEventDay[];
  away: readonly AwaySpan[];
  issueProjects: ReadonlyMap<number, { projectId: number | null; projectNo: string | null }>;
};

/** The day the app offers the person to confirm. */
export function draftDay(date: string, input: DraftInput): DayDraft {
  const working = isWorkingDay(date, input.holidays);
  const away = awayHours(input.away, date);
  // Meetings first: they happened at a set time. Then the planned work shares what is left of the day.
  const meetings = input.outlook.map((event) => ({ choice: choiceFromOutlook(event), hours: outlookHours(event, date) })).filter((row) => row.hours > 0);
  const meetingRoom = Math.max(0, HOURS_PER_DAY - away);
  const meetingRaw = meetings.reduce((sum, row) => sum + row.hours, 0);
  const meetingTotal = Math.min(meetingRaw, meetingRoom);
  const meetingHours = quarterHours(meetings.map((row) => meetingRaw > 0 ? row.hours * (meetingTotal / meetingRaw) : 0), meetingTotal);

  const work = [
    ...planShares(date < input.today ? [...input.items, ...input.finishedItems] : input.items, date, input.holidays).map(({ item, manDays }) => ({ choice: choiceFromItem(item, input.issueProjects), hours: manDays * HOURS_PER_DAY })),
    ...input.teamTasks.map((task) => ({ choice: choiceFromTeamTask(task), hours: teamTaskShare(task, date, input.holidays) * HOURS_PER_DAY })),
  ].filter((row) => row.hours > 0);
  // One piece of work is one line: two shares of it on a day add up.
  const merged = new Map<string, { choice: WorkChoice; hours: number }>();
  for (const row of work) { const seen = merged.get(row.choice.workKey); if (seen) seen.hours += row.hours; else merged.set(row.choice.workKey, { ...row }); }
  const workRows = [...merged.values()];
  const workRoom = Math.max(0, HOURS_PER_DAY - away - meetingTotal);
  const workRaw = workRows.reduce((sum, row) => sum + row.hours, 0);
  const workTotal = Math.min(workRaw, workRoom);
  const workHours = quarterHours(workRows.map((row) => workRaw > 0 ? row.hours * (workTotal / workRaw) : 0), workTotal);

  const rows: DraftRow[] = [
    ...workRows.map((row, index) => ({ ...row.choice, hours: workHours[index]! })),
    ...meetings.map((row, index) => ({ ...row.choice, hours: meetingHours[index]! })),
  ].filter((row) => row.hours > 0);
  return { date, working, awayHours: away, rows };
}

/** A day's draft hours by work key, for planned_hours. */
export const draftHoursByKey = (draft: DayDraft) => new Map(draft.rows.map((row) => [row.workKey, row.hours]));

// ── A day sent for confirmation ─────────────────────────────────────────────

export type DayInputRow = { workKey: string | null; projectId: number | null; note: string | null; hours: number };
export type StoredRow = { workKey: string | null; projectId: number | null; title: string; hours: number; plannedHours: number | null };

const invalid = (message: string) => new ApiError(400, "validation_failed", message);

/** Hours as typed: more than 0, at most MAX_DAY_HOURS, in quarter hours. */
export function parseHours(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0 || value > MAX_DAY_HOURS) throw invalid(`Hours must be more than 0 and at most ${MAX_DAY_HOURS}.`);
  if (Math.abs(value * 4 - Math.round(value * 4)) > 1e-9) throw invalid("Hours are kept to the quarter hour (0.25).");
  return Math.round(value * 4) / 4;
}

/** The body of PUT /me/work-days/:date: { rows: [{ workKey } | { projectId?, note }, hours] }. An empty list is a day without work. */
export function parseDayRows(value: unknown): DayInputRow[] {
  const body = bodyObject(value);
  if (!Array.isArray(body.rows) || body.rows.length > MAX_ROWS) throw invalid(`Rows must be a list of at most ${MAX_ROWS} lines.`);
  const seen = new Set<string>();
  const rows = body.rows.map((entry: unknown): DayInputRow => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) throw invalid("Each line must be an object.");
    const row = entry as Record<string, unknown>;
    const hours = parseHours(row.hours);
    if (row.workKey !== undefined && row.workKey !== null) {
      if (typeof row.workKey !== "string" || !WORK_KEY.test(row.workKey)) throw invalid("A line's work is not one this page offers.");
      if (seen.has(row.workKey)) throw invalid("A piece of work may appear once in a day.");
      seen.add(row.workKey);
      return { workKey: row.workKey, projectId: null, note: null, hours };
    }
    const note = typeof row.note === "string" ? row.note.trim() : "";
    if (!note || note.length > MAX_NOTE) throw invalid(`Work added by hand needs a note of 1 to ${MAX_NOTE} characters.`);
    let projectId: number | null = null;
    if (row.projectId !== undefined && row.projectId !== null) {
      if (typeof row.projectId !== "number" || !Number.isSafeInteger(row.projectId) || row.projectId < 1) throw invalid("Project must be a project id.");
      projectId = row.projectId;
    }
    return { workKey: null, projectId, note, hours };
  });
  const total = rows.reduce((sum, row) => sum + row.hours, 0);
  if (total > MAX_DAY_HOURS) throw invalid(`A day holds at most ${MAX_DAY_HOURS} hours.`);
  return rows;
}

/**
 * The lines to store. Work named by key must be work this person has (`choices`); its title and project come from
 * the server, never from the browser. Work typed by hand may count towards one of the person's projects.
 */
export function resolveDayRows(
  rows: readonly DayInputRow[], choices: ReadonlyMap<string, WorkChoice>, projects: ReadonlyMap<number, { projectNo: string }>, planned: ReadonlyMap<string, number>,
): StoredRow[] {
  return rows.map((row) => {
    if (row.workKey !== null) {
      const choice = choices.get(row.workKey);
      if (!choice) throw new ApiError(422, "work_day_unknown_work", "A line names work that is not yours or no longer exists. Reload the day.");
      return { workKey: choice.workKey, projectId: choice.projectId, title: choice.title.slice(0, 300), hours: row.hours, plannedHours: planned.get(choice.workKey) ?? null };
    }
    if (row.projectId !== null && !projects.has(row.projectId)) throw new ApiError(422, "work_day_unknown_project", "Hours can count only towards a project you work on.");
    return { workKey: null, projectId: row.projectId, title: row.note!, hours: row.hours, plannedHours: null };
  });
}

export const totalHours = (rows: readonly { hours: number }[]) => round2(rows.reduce((sum, row) => sum + row.hours, 0));
