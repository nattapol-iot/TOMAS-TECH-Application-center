/* The People table of Projects > Plan (owner request 2026-11-18): how many people work on a plan row each day,
   typed like a spreadsheet. A row is a span of days (its plan start and length) with a figure per day; 0 means
   nobody is set for that day. A figure is labor for the day, to one decimal place: one person doing two tasks on
   a day is 0.5 on each. The API side and the stored shape are in backend-node/src/plan-people.ts. */

export type PeopleSpan = { start: string; days: number; people: number[] };

export const MAXIMUM_PEOPLE_PER_DAY = 999;
const MAXIMUM_SPAN_DAYS = 3650, DAY = 86_400_000;
export const tenth = (value: number): number => Math.round(value * 10) / 10;

const stamp = (iso: string): number => Date.parse(`${iso}T00:00:00Z`);
export const addDays = (iso: string, count: number): string => new Date(stamp(iso) + count * DAY).toISOString().slice(0, 10);
export const dayDiff = (from: string, to: string): number => Math.round((stamp(to) - stamp(from)) / DAY);
export const weekDay = (iso: string): number => new Date(stamp(iso)).getUTCDay();
/** The Monday of the week a day is in. */
export const mondayOf = (iso: string): string => addDays(iso, -((weekDay(iso) + 6) % 7));
export const isWorkDay = (iso: string, holidays: ReadonlySet<string>): boolean => weekDay(iso) !== 0 && weekDay(iso) !== 6 && !holidays.has(iso);

/** People on a day: null outside the row's span, 0 inside it with nobody set. */
export function peopleOn(span: PeopleSpan | null, iso: string): number | null {
  if (!span) return null;
  const offset = dayDiff(span.start, iso);
  return offset < 0 || offset >= span.days ? null : span.people[offset] ?? 0;
}

export const peopleManDays = (people: readonly number[]): number => tenth(people.reduce((sum, count) => sum + (count > 0 ? count : 0), 0));

/** The figure most days of the row carry, for its People/day box; null when no day has one. */
export function usualPeople(people: readonly number[]): number | null {
  const counts = new Map<number, number>();
  for (const value of people) if (value > 0) counts.set(value, (counts.get(value) ?? 0) + 1);
  let best: number | null = null;
  for (const [value, count] of counts) if (best === null || count > (counts.get(best) ?? 0)) best = value;
  return best;
}

const trimmed = (people: number[]): number[] => { const kept = [...people]; while (kept.length && !kept[kept.length - 1]) kept.pop(); return kept; };

/**
 * The row after typing: each edit is a day and its figure, 0 to clear it. A figure outside the span stretches the
 * span to that day. Clearing the first or last days of the span takes them off it (the row no longer runs on them);
 * clearing a day in the middle only empties it. The span keeps at least one day, and a row with no dates takes them
 * from the first figure typed.
 */
export function applyPeople(span: PeopleSpan | null, edits: ReadonlyMap<string, number>): PeopleSpan | null {
  let start = span?.start ?? null, end = span ? addDays(span.start, span.days - 1) : null;
  for (const [day, count] of edits) {
    if (count <= 0) continue;
    if (start === null || day < start) start = day;
    if (end === null || day > end) end = day;
  }
  if (start === null || end === null || dayDiff(start, end) >= MAXIMUM_SPAN_DAYS) return span;
  const value = (day: string): number => {
    const typed = edits.get(day);
    return typed !== undefined ? Math.max(0, Math.min(MAXIMUM_PEOPLE_PER_DAY, tenth(typed))) : peopleOn(span, day) ?? 0;
  };
  const cleared = (day: string): boolean => (edits.get(day) ?? 1) <= 0;
  while (start < end && cleared(start)) start = addDays(start, 1);
  while (end > start && cleared(end)) end = addDays(end, -1);
  const from = start, days = dayDiff(start, end) + 1;
  return { start: from, days, people: trimmed(Array.from({ length: days }, (_, offset) => value(addDays(from, offset)))) };
}

/** The People/day box: that many people on every work day of the row, and on any other day that already has people. */
export function fillPeople(span: PeopleSpan, count: number, holidays: ReadonlySet<string>): PeopleSpan {
  const people = Array.from({ length: span.days }, (_, offset) => ((span.people[offset] ?? 0) > 0 || isWorkDay(addDays(span.start, offset), holidays) ? count : 0));
  return { ...span, people: trimmed(people) };
}

export const sameSpan = (left: PeopleSpan | null, right: PeopleSpan | null): boolean =>
  left === right || (left !== null && right !== null && left.start === right.start && left.days === right.days
    && trimmed(left.people).join() === trimmed(right.people).join());

/** What may be typed in a day: up to three digits and one decimal place; a comma counts as the decimal point. */
export function figureText(text: string): string {
  return /^\d{0,3}(?:\.\d?)?/.exec(text.replace(/,/g, ".").replace(/[^\d.]/g, ""))?.[0] ?? "";
}

/**
 * A PIC's share of a row's day: the day's figure over the row's PICs, one at most (a PIC leading a crew of three is
 * one of them). backend-node/src/plan-people.ts holds the same rule for the team load.
 */
export const personShare = (figure: number, owners: number): number => Math.round(Math.min(1, figure / Math.max(1, owners)) * 100) / 100;

/** What a row's people mean for one of its PICs, by date: the team load reads this instead of spreading the row's man-days evenly. */
export function peopleShares(planStart: string, people: readonly number[], owners: number): Record<string, number> {
  const shares: Record<string, number> = {};
  people.forEach((figure, offset) => { if (figure > 0) shares[addDays(planStart, offset)] = personShare(figure, owners); });
  return shares;
}
export const sharesTotal = (shares: Record<string, number>): number => Math.round(Object.values(shares).reduce((sum, share) => sum + share, 0) * 100) / 100;

/** What else a person has on a day, and what they can give: from the team board, over every project. */
export type DayLimits = {
  /** Man-days the person already has that day outside these rows (other projects, estimates, team tasks, meetings). */
  other: (personId: number, day: number) => number;
  /** Man-days the person can give on a day: their weekly capacity over five. */
  available: (personId: number, day: number) => number;
};
export type Overbooked = { name: string; total: number; here: number; other: number; available: number };

/**
 * The days a person is given more than they have: their shares of these rows (personShare), plus what they have
 * elsewhere that day, against what they can give. Without limits it looks at these rows only, against one man-day.
 * Returns, by row index, the days that are over with the person and the sums, so the screen can point at them.
 */
export function overbookedDays(rows: readonly { people: readonly { id: number; name: string }[]; cells: readonly (number | null)[] }[], limits?: DayLimits): Map<number, Map<number, Overbooked>> {
  const byPerson = new Map<number, { name: string; totals: number[]; shares: { row: number; share: number[] }[] }>();
  rows.forEach((row, index) => {
    if (!row.people.length) return;
    const share = row.cells.map((value) => (value ? personShare(value, row.people.length) : 0));
    for (const one of row.people) {
      const person = byPerson.get(one.id) ?? { name: one.name, totals: [], shares: [] };
      share.forEach((value, day) => { person.totals[day] = (person.totals[day] ?? 0) + value; });
      person.shares.push({ row: index, share }); byPerson.set(one.id, person);
    }
  });
  const found = new Map<number, Map<number, Overbooked>>();
  for (const [id, person] of byPerson) person.totals.forEach((here, day) => {
    const other = limits?.other(id, day) ?? 0, available = limits?.available(id, day) ?? 1;
    if (!here || here + other <= available + 0.001) return;
    const over: Overbooked = { name: person.name, total: tenth(here + other), here: tenth(here), other: tenth(other), available: tenth(available) };
    for (const { row, share } of person.shares) if (share[day]) found.set(row, (found.get(row) ?? new Map<number, Overbooked>()).set(day, over));
  });
  return found;
}

/** A block copied from a spreadsheet: rows of tab-separated cells; a cell that is not a figure is left as it is (null). */
export function parsePastedBlock(text: string): (number | null)[][] {
  return text.replace(/\r/g, "").replace(/\n+$/, "").split("\n").map((line) => line.split("\t").map((cell) => {
    const value = cell.trim();
    return /^\d{1,3}(?:[.,]\d)?$/.test(value) ? Number(value.replace(",", ".")) : null;
  }));
}
