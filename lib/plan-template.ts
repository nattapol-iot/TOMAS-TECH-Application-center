/*
 * Master schedules on the plan Sheet (task doc 4.1-4.3, owner 2026-11-23/24): a plan saved as a template keeps its rows
 * at every level with the party, the discipline, the working day each starts on (1 = the plan's first working day), its
 * working days and its starting hours, but no people, dates or progress. Applied to a project from a start date, the
 * working days become dates that skip weekends and company holidays (lib/gantt.ts). Templates saved before migration
 * 129 have main headings only, counted in calendar days from the start; they still apply.
 */
import { nextWorkDay, shiftWorkDays } from "./gantt";

export type TemplatePlanRow = { level: number; name: string; party: string; discipline: string | null; startWorkDay: number | null; workDays: number | null; planHours: number };
export type TemplateFlatRow = { name: string; startOffsetDays: number | null; durationDays: number | null };
export type TemplateSource = { rows: readonly TemplateFlatRow[]; plan?: readonly TemplatePlanRow[] | null };
/** A plan row as the Sheet has it, for saving. */
export type PlanRowForTemplate = {
  level: number;
  name: string;
  party: string;
  discipline: string | null;
  start: string | null;
  end: string | null;
  workDays: number | null;
  /** Its own hours; 0 for a heading or a row whose rows carry the hours. */
  planHours: number;
};
/** A row the plan gets from a template. */
export type RowFromTemplate = { level: number; name: string; party: string; discipline: string | null; start: string; end: string; planManDays: number };

const DAY_MS = 86_400_000;
const shiftDay = (iso: string, days: number) => new Date(Date.parse(`${iso}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10);
const spanDays = (start: string, end: string) => Math.round((Date.parse(`${end}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) / DAY_MS) + 1;
const isWorkDay = (iso: string, holidays: ReadonlySet<string>) => nextWorkDay(iso, holidays) === iso;
/** Working days from first to day, both counted: 1 when they are the same working day. */
function workDayNumber(first: string, day: string, holidays: ReadonlySet<string>): number {
  let count = 0;
  for (let at = first; at <= day; at = shiftDay(at, 1)) if (isWorkDay(at, holidays)) count += 1;
  return Math.max(1, count);
}

/** The template a plan makes: the whole plan, and its main headings for the screens that know only those. */
export function templateFromPlan(rows: readonly PlanRowForTemplate[], holidays: ReadonlySet<string>): { plan: TemplatePlanRow[]; rows: TemplateFlatRow[] } {
  const starts = rows.map((row) => row.start).filter((start): start is string => Boolean(start));
  const first = starts.length ? nextWorkDay([...starts].sort()[0]!, holidays) : null;
  const plan = rows.map((row): TemplatePlanRow => ({
    level: row.level,
    name: row.name,
    party: row.party,
    discipline: row.discipline,
    startWorkDay: first && row.start ? workDayNumber(first, nextWorkDay(row.start, holidays), holidays) : null,
    workDays: row.workDays && row.workDays > 0 ? row.workDays : row.start && row.end ? Math.max(1, workDayNumber(row.start, row.end, holidays)) : null,
    planHours: Math.round(row.planHours * 10) / 10,
  }));
  const flat = rows
    .filter((row) => row.level === 1)
    .slice(0, 50)
    .map((row): TemplateFlatRow => ({
      name: row.name,
      startOffsetDays: first && row.start && row.end ? Math.max(0, spanDays(first, row.start) - 1) : null,
      durationDays: row.start && row.end ? spanDays(row.start, row.end) : null,
    }));
  return { plan, rows: flat.length ? flat : [{ name: rows[0]?.name ?? "Plan", startOffsetDays: null, durationDays: null }] };
}

/** The rows a template gives a plan that starts on start: dates from working days, or calendar days for an old one. */
export function planFromTemplate(template: TemplateSource, start: string, holidays: ReadonlySet<string>): RowFromTemplate[] {
  const first = nextWorkDay(start, holidays);
  if (template.plan?.length) {
    const rows = template.plan.map((row) => {
      const rowStart = shiftWorkDays(first, Math.max(0, (row.startWorkDay ?? 1) - 1), holidays);
      const rowEnd = shiftWorkDays(rowStart, Math.max(0, (row.workDays ?? 1) - 1), holidays);
      return { level: row.level, name: row.name, party: row.party, discipline: row.discipline, start: rowStart, end: rowEnd, planManDays: Math.round((row.planHours / 8) * 100) / 100 };
    });
    // A row with rows under it spans them, as the plan rolls dates up; bottom-up, so a heading spans its rows' spans.
    [...rows.keys()].reverse().forEach((index) => {
      const row = rows[index]!;
      const under: RowFromTemplate[] = [];
      for (let next = index + 1; next < rows.length && rows[next]!.level > row.level; next++) under.push(rows[next]!);
      if (!under.length) return;
      row.start = under.reduce((earliest, item) => (item.start < earliest ? item.start : earliest), under[0]!.start);
      row.end = under.reduce((latest, item) => (item.end > latest ? item.end : latest), under[0]!.end);
    });
    return rows;
  }
  return template.rows.map((row) => {
    const rowStart = shiftDay(start, row.startOffsetDays ?? 0);
    return { level: 1, name: row.name, party: "", discipline: null, start: rowStart, end: shiftDay(rowStart, Math.max(0, (row.durationDays ?? 1) - 1)), planManDays: 0 };
  });
}
