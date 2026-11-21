import { HOLIDAY_NAME_MAX, WORKING_CALENDAR_BRANCH, WORKING_CALENDAR_HOLIDAY_TYPES } from "./constants.js";

export type CompanyHoliday = { date: string; name: string };

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const text = (value: unknown) => typeof value === "string" ? value.trim() : "";

/** The days off of the Bangkok office out of master's company calendar, one per date. */
export function workingCalendarHolidays(items: readonly unknown[]): CompanyHoliday[] {
  const byDate = new Map<string, CompanyHoliday & { branchSpecific: boolean }>();
  for (const item of items) {
    if (!item || typeof item !== "object") continue;
    const row = item as Record<string, unknown>;
    const date = text(row.holiday_date), branch = text(row.branch_code);
    if (!DATE.test(date) || !WORKING_CALENDAR_HOLIDAY_TYPES.includes(text(row.holiday_type))) continue;
    if ((row.division_id ?? null) !== null || (branch && branch !== WORKING_CALENDAR_BRANCH)) continue;
    const name = (text(row.holiday_name_th) || text(row.holiday_name) || date).slice(0, HOLIDAY_NAME_MAX);
    const held = byDate.get(date);
    if (!held || (branch && !held.branchSpecific)) byDate.set(date, { date, name, branchSpecific: Boolean(branch) });
  }
  return [...byDate.values()].map(({ date, name }) => ({ date, name })).sort((a, b) => a.date.localeCompare(b.date));
}
