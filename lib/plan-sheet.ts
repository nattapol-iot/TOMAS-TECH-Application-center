/* Projects > Plan, the Sheet view (V2, owner 2026-11-23/24): the plan typed like the team's Excel Gantt. These are
   the pure rules behind it, so they can be tested without a screen: how a typed date, a link and a percentage read,
   and how a row's dates follow from what was typed. Plan days are calendar days from start to finish, as the API
   counts them (backend-node/src/schedule-calculator.ts). */

import { planDatesLoop } from "./gantt";

const DAY_MS = 86_400_000;
const dayNumber = (iso: string) => Math.round(Date.parse(`${iso}T00:00:00Z`) / DAY_MS);
const isoOf = (day: number) => new Date(day * DAY_MS).toISOString().slice(0, 10);
const pad = (value: number) => String(value).padStart(2, "0");

/** The date `days` after `iso` (before, when negative). */
export const shiftDay = (iso: string, days: number) => isoOf(dayNumber(iso) + days);
/** Calendar days from start to finish, both counted, as the plan stores them. */
export const spanDays = (start: string, finish: string) => dayNumber(finish) - dayNumber(start) + 1;

function made(year: number, month: number, day: number): string | null {
  if (!(month >= 1 && month <= 12 && day >= 1 && day <= 31 && year > 1900 && year < 2200)) return null;
  const iso = `${year}-${pad(month)}-${pad(day)}`;
  return isoOf(dayNumber(iso)) === iso ? iso : null;
}

/**
 * A date as people type it in a cell: 19/11/26, 19/11/2026, 19/11 (the year nearest `reference`), 2026-11-19, a
 * Buddhist-era year (19/11/69 or 19/11/2569), an Excel day number (46345), or +N for N days after `after`. Returns ""
 * for an empty cell and null for text that is not a date.
 */
export function parseSheetDate(text: string, reference: string, after?: string | null): string | null {
  let value = String(text).trim();
  if (!value) return "";
  const plus = value.match(/^\+\s*(\d{1,3})$/);
  if (plus) return after ? shiftDay(after, Number(plus[1])) : null;
  value = value.replace(/^[^\d+]+/, "");
  if (/^\d{5}(\.\d+)?$/.test(value)) return isoOf(Math.floor(Number(value)) - 25_569);
  let match = value.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (match) return made(Number(match[1]), Number(match[2]), Number(match[3]));
  match = value.match(/^(\d{1,2})[/.-](\d{1,2})(?:[/.-](\d{2,4}))?$/);
  if (!match) return null;
  let day = Number(match[1]),
    month = Number(match[2]);
  if (month > 12 && day <= 12) [day, month] = [month, day];
  let year: number;
  if (match[3]) {
    year = Number(match[3]);
    // Two digits: 26 is 2026; 69 reads as the Buddhist era (2569 = 2026). Four digits over 2400 are Buddhist era too.
    if (match[3].length <= 2) year = year < 60 ? 2000 + year : 2500 + year - 543;
    else if (year > 2400) year -= 543;
  } else {
    year = Number(reference.slice(0, 4));
    const referenceMonth = Number(reference.slice(5, 7));
    if (month < referenceMonth - 6) year += 1;
    else if (month > referenceMonth + 6) year -= 1;
  }
  return made(year, month, day);
}

/** A percentage typed in the % DONE cell: 0 to 100, "50%" or "50 %"; null when it is not one. */
export function parsePercent(text: string): number | null {
  const match = String(text)
    .trim()
    .match(/^(\d{1,3}(?:\.\d+)?)\s*%?$/);
  if (!match) return null;
  const value = Number(match[1]);
  return value >= 0 && value <= 100 ? Math.round(value) : null;
}

/** A whole number of days typed in the DAYS cell, 1 to 3650; null when it is not one. */
export function parseDays(text: string): number | null {
  const value = Number(String(text).trim());
  return Number.isInteger(value) && value >= 1 && value <= 3650 ? value : null;
}

export type SheetLinkRow = { id: number; parentId: number | null; wbs: string; kind: string; predecessorId: number | null; startMode: string };
export type SheetLink = { predecessorId: number | null; lagDays: number };

const isWorkDay = (iso: string, holidays: ReadonlySet<string>) => {
  const weekday = new Date(`${iso}T00:00:00Z`).getUTCDay();
  return weekday !== 0 && weekday !== 6 && !holidays.has(iso);
};

/**
 * A gap typed in working days (owner 2026-11-24: +N skips weekends and company holidays) as the calendar days the plan
 * stores. The API starts a linked row on the first work day on or after predecessor finish + 1 + lag, so the row
 * starts on the (N+1)th work day after its predecessor finishes. No gap stays 0, which is the next work day wherever
 * the predecessor moves; a negative gap stays calendar days. A gap of N > 0 is worked out against the predecessor's
 * finish today, so it can be a day or two off after that finish moves across a weekend (phase 0.2: count it on the server).
 */
export function workingLagToCalendar(predecessorFinish: string, workingLag: number, holidays: ReadonlySet<string>): number {
  if (workingLag <= 0) return workingLag;
  let day = predecessorFinish,
    counted = 0;
  while (counted < workingLag + 1) {
    day = shiftDay(day, 1);
    if (isWorkDay(day, holidays)) counted += 1;
  }
  return dayNumber(day) - dayNumber(predecessorFinish) - 1;
}

/** The stored calendar gap read back as work days between the predecessor's finish and the row's start. */
export function calendarLagToWorking(predecessorFinish: string, calendarLag: number, holidays: ReadonlySet<string>): number {
  if (calendarLag <= 0) return calendarLag;
  let counted = 0;
  for (let day = shiftDay(predecessorFinish, 1), stop = shiftDay(predecessorFinish, calendarLag); day <= stop; day = shiftDay(day, 1)) if (isWorkDay(day, holidays)) counted += 1;
  return counted;
}

/** What the "after" cell shows: the WBS of the task the row waits for, and +N for a gap of N work days. */
export function linkText(row: { startMode: string; predecessorId: number | null }, rows: readonly SheetLinkRow[], gap: number): string {
  if (row.startMode !== "linked" || row.predecessorId === null) return "";
  const before = rows.find((candidate) => candidate.id === row.predecessorId);
  if (!before) return "";
  return before.wbs + (gap > 0 ? `+${gap}` : gap < 0 ? String(gap) : "");
}

/**
 * The "after" cell read back: a WBS, optionally +N or -N days, finish to start. Empty clears the link. Refused with a
 * reason (an i18n key and the WBS it names) for a row that does not exist, the row itself, a heading, one of its own
 * headings or rows, and a link that would go round in a circle.
 */
export function parseLink(text: string, self: SheetLinkRow, rows: readonly SheetLinkRow[]): SheetLink | { error: string; wbs?: string } {
  const value = String(text).trim();
  if (!value) return { predecessorId: null, lagDays: 0 };
  const match = value.match(/^(\d+(?:\.\d+)*)\s*(?:([+-])\s*(\d{1,3}))?$/);
  if (!match) return { error: "Sheet.linkUnreadable" };
  const wbs = match[1]!;
  const lagDays = match[2] ? Number(match[3]) * (match[2] === "-" ? -1 : 1) : 0;
  const before = rows.find((row) => row.wbs === wbs);
  if (!before) return { error: "Sheet.linkMissing", wbs };
  if (before.id === self.id) return { error: "Sheet.linkSelf", wbs };
  if (before.kind === "phase") return { error: "Sheet.linkHeading", wbs };
  const byId = new Map(rows.map((row) => [row.id, row]));
  const isAncestor = (ancestorId: number, of: SheetLinkRow) => {
    for (let at = of.parentId === null ? undefined : byId.get(of.parentId); at; at = at.parentId === null ? undefined : byId.get(at.parentId)) if (at.id === ancestorId) return true;
    return false;
  };
  if (isAncestor(before.id, self) || isAncestor(self.id, before)) return { error: "Sheet.linkFamily", wbs };
  const graph = rows.map((row) => (row.id === self.id ? { ...row, predecessorId: before.id, startMode: "linked" } : row));
  if (planDatesLoop(graph)) return { error: "Sheet.linkLoop", wbs };
  return { predecessorId: before.id, lagDays };
}

/** The rows of a plan tree in reading order, heading first, then what sits under it. */
export function sheetOrder<T extends { children: T[] }>(tasks: readonly T[]): T[] {
  return tasks.flatMap((task) => [task, ...sheetOrder(task.children)]);
}

/** The Monday on or before a date: where a week column of the sheet's Gantt starts. */
export const mondayOn = (iso: string) => shiftDay(iso, -((new Date(`${iso}T00:00:00Z`).getUTCDay() + 6) % 7));
