/*
 * The calendar date in the business time zone, as yyyy-mm-dd. A task due "today" turns overdue at the
 * office's midnight, not at UTC midnight, so every screen that compares plan dates with today uses this.
 */

export function businessToday(timeZone: string, now: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(now);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}
