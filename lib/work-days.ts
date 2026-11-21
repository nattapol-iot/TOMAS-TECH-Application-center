/* My Work > "My hours": the week strip and the day dialog (app/system/production/WorkDaysPanel.tsx). The API drafts each
   day from the person's planned work and stores what they confirm (backend-node/src/work-days.ts, migration 121); these
   helpers only arrange what it sends and check what the person types before it goes back. */

export type WorkRowKind = "Project" | "TeamTask" | "Issue" | "Inquiry" | "Estimate" | "Outlook" | "ProjectOther" | "Other";
export type WorkDayRow = {
  workKey: string | null; kind: WorkRowKind; projectId: number | null; projectNo: string | null;
  title: string; reference: string; hours: number; plannedHours: number | null;
};
export type WorkDay = {
  date: string; working: boolean; holiday: boolean; weekend: boolean; awayHours: number; editable: boolean; future: boolean;
  confirmed: { at: string; times: number; hours: number } | null;
  /** What the day shows: the confirmed lines, or the draft while it is not confirmed. */
  rows: WorkDayRow[];
  draft: WorkDayRow[];
  draftHours: number;
};
export type WorkChoice = { workKey: string; kind: WorkRowKind; projectId: number | null; projectNo: string | null; title: string; reference: string };
export type WorkDaysData = {
  today: string; editableFrom: string; hoursPerDay: number; days: WorkDay[];
  choices: WorkChoice[]; projects: { id: number; projectNo: string; name: string }[];
};

/** A line in the day dialog. hours is the text typed; a line added by hand carries its note. */
export type DayLine = { key: string; workKey: string | null; kind: WorkRowKind; projectId: number | null; projectNo: string | null; title: string; reference: string; hours: string; plannedHours: number | null };

const DAY = 86_400_000;
const dayNumber = (date: string) => Date.parse(`${date}T00:00:00Z`) / DAY;
export const addDays = (date: string, days: number) => new Date((dayNumber(date) + days) * DAY).toISOString().slice(0, 10);
/** The Monday of a date's week. */
export const mondayOf = (date: string) => addDays(date, -((new Date(`${date}T00:00:00Z`).getUTCDay() + 6) % 7));
/** Today in Bangkok, the company's day. */
export const bangkokToday = (now = new Date()) => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Bangkok", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);

export const MAX_DAY_HOURS = 24;
export const sumHours = (values: readonly number[]) => Math.round(values.reduce((sum, value) => sum + value, 0) * 100) / 100;

/**
 * Where a day stands: confirmed; a draft waiting for one press; a working day with nothing drafted, which needs the
 * person to say what they did; a weekend or holiday with nothing on it; a day still to come; or one too old to change.
 */
export type DayState = "confirmed" | "toConfirm" | "empty" | "off" | "future" | "closed";
export function dayState(day: Pick<WorkDay, "confirmed" | "future" | "editable" | "draft" | "awayHours" | "working">, hoursPerDay = 8): DayState {
  if (day.confirmed) return "confirmed";
  if (day.future) return day.working || day.draft.length ? "future" : "off";
  if (!day.editable) return "closed";
  if (day.draft.length || day.awayHours >= hoursPerDay) return "toConfirm";
  return day.working ? "empty" : "off";
}

/** A plan reference without the project number already shown beside it ("P-1 · 2.3" next to P-1 reads "2.3"). */
export function shortReference(reference: string, projectNo: string | null): string {
  if (!reference || reference === projectNo) return "";
  return projectNo && reference.startsWith(`${projectNo} · `) ? reference.slice(projectNo.length + 3) : reference;
}

/** Days one press confirms as drafted, today left out (it has its own button). */
export const pendingDates = (days: readonly WorkDay[], today: string, hoursPerDay = 8) =>
  days.filter((day) => day.date !== today && dayState(day, hoursPerDay) === "toConfirm").map((day) => day.date);

/** Hours as typed: a number of quarter hours, more than 0 and at most 24; null when it is not. */
export function parseHours(text: string): number | null {
  const value = Number(text.trim().replace(",", "."));
  if (!text.trim() || !Number.isFinite(value) || value <= 0 || value > MAX_DAY_HOURS) return null;
  return Math.abs(value * 4 - Math.round(value * 4)) < 1e-9 ? value : null;
}

const hoursText = (hours: number) => String(Math.round(hours * 100) / 100);
let lineCounter = 0;
const nextKey = () => `line-${++lineCounter}`;

export const linesFromRows = (rows: readonly WorkDayRow[]): DayLine[] =>
  rows.map((row) => ({ key: nextKey(), workKey: row.workKey, kind: row.kind, projectId: row.projectId, projectNo: row.projectNo, title: row.title, reference: row.reference, hours: hoursText(row.hours), plannedHours: row.plannedHours }));

/** A line for work picked from the list; a meeting or a team task starts at an hour, the rest empty. */
export const lineFromChoice = (choice: WorkChoice): DayLine =>
  ({ key: nextKey(), workKey: choice.workKey, kind: choice.kind, projectId: choice.projectId, projectNo: choice.projectNo, title: choice.title, reference: choice.reference, hours: "", plannedHours: null });

/** A line typed by hand, counting towards a project or towards no project. */
export const lineForNote = (project: { id: number; projectNo: string } | null): DayLine =>
  ({ key: nextKey(), workKey: null, kind: project ? "ProjectOther" : "Other", projectId: project?.id ?? null, projectNo: project?.projectNo ?? null, title: "", reference: "", hours: "", plannedHours: null });

/** What the person may still add on a day: work not already listed; a meeting only on the day it took place. */
export function choicesForDay(choices: readonly WorkChoice[], day: Pick<WorkDay, "draft">, lines: readonly DayLine[]): WorkChoice[] {
  const listed = new Set(lines.map((line) => line.workKey).filter(Boolean));
  const meetings = new Set(day.draft.filter((row) => row.kind === "Outlook").map((row) => row.workKey));
  return choices.filter((choice) => !listed.has(choice.workKey) && (choice.kind !== "Outlook" || meetings.has(choice.workKey)));
}

export type LineProblem = "hours" | "note" | "total";
/** What stops the day from being saved: a line without valid hours, a typed line without a note, or more than 24 hours. */
export function lineProblems(lines: readonly DayLine[]): { line: Map<string, LineProblem>; total: number; tooMany: boolean } {
  const line = new Map<string, LineProblem>();
  for (const entry of lines) {
    if (parseHours(entry.hours) === null) line.set(entry.key, "hours");
    else if (entry.workKey === null && !entry.title.trim()) line.set(entry.key, "note");
  }
  const total = sumHours(lines.map((entry) => parseHours(entry.hours) ?? 0));
  return { line, total, tooMany: total > MAX_DAY_HOURS };
}

/** The body of PUT /api/v1/me/work-days/:date. */
export const dayBody = (lines: readonly DayLine[]) => ({
  rows: lines.map((line) => line.workKey
    ? { workKey: line.workKey, hours: parseHours(line.hours) }
    : { projectId: line.projectId, note: line.title.trim(), hours: parseHours(line.hours) }),
});

/** Whether the lines still say what the draft said, so "Back to the plan" has nothing to undo. */
export function sameAsDraft(lines: readonly DayLine[], draft: readonly WorkDayRow[]): boolean {
  if (lines.length !== draft.length) return false;
  const planned = new Map(draft.map((row) => [row.workKey, row.hours]));
  return lines.every((line) => line.workKey !== null && planned.get(line.workKey) === parseHours(line.hours));
}
