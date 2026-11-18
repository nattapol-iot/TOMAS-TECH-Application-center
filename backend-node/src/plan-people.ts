import { ApiError } from "./errors.js";

/**
 * People per day on a plan row: the People table of Projects > Plan (owner request 2026-11-18).
 *
 * A work row keeps how many people work on it each day, counted from its plan start
 * (dbo.schedule_tasks.people_by_day, a JSON array; 0 = nobody set for that day), and whether
 * they are our own staff or outsourced manpower (labor_source, labor_supplier; migration 106).
 * The figures move with the row when its start moves. A row that carries people has its plan
 * man-days from them: one person for one day is one man-day.
 */

export const LABOR_SOURCES = ["Own", "Outsourced"] as const;
export const MAXIMUM_PEOPLE_PER_DAY = 999;
const MAXIMUM_PLAN_DAYS = 3650, MAXIMUM_ROWS = 500, MAXIMUM_SUPPLIER_LENGTH = 200;

export type PeoplePlan = { planStart: string; planDays: number; people: number[] };
export type PeopleEdit = { taskId: number; laborSource?: string; laborSupplier?: string; plan?: PeoplePlan };
/** The part of a plan row the People table reads and writes. */
export type PeopleRow = {
  kind: string; isMilestone: boolean; planStart: string | null; planDays: number; startMode: string; predecessorId: number | null;
  lagDays: number; planManDays: number; laborSource?: string | undefined; laborSupplier?: string | undefined; peopleByDay?: number[] | undefined;
};
export type PeopleChange = {
  planStart: string | null; planDays: number; startMode: string; predecessorId: number | null; lagDays: number;
  planManDays: number; laborSource: string; laborSupplier: string; people: number[];
};

const invalid = (message: string): ApiError => new ApiError(400, "validation_failed", message);
const isCount = (value: unknown): value is number => typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= MAXIMUM_PEOPLE_PER_DAY;

/** People per day cut to the row's length, without the empty days at its end. */
export function fitPeople(people: readonly number[], planDays: number): number[] {
  const fitted = people.slice(0, Math.max(0, planDays));
  while (fitted.length && !fitted[fitted.length - 1]) fitted.pop();
  return fitted;
}

/** What the column holds, read leniently: anything that is not a list of whole numbers counts as nobody set. */
export function storedPeople(value: unknown): number[] {
  if (typeof value !== "string" || !value) return [];
  try {
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed) && parsed.every(isCount) ? fitPeople(parsed, MAXIMUM_PLAN_DAYS) : [];
  } catch { return []; }
}

export const peopleManDays = (people: readonly number[]): number => people.reduce((sum, count) => sum + count, 0);
/** The column value: NULL for a row with nobody set. */
export const peopleJson = (people: readonly number[]): string | null => (people.some((count) => count > 0) ? JSON.stringify(people) : null);

function isoDate(value: unknown): string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(Date.parse(`${value}T00:00:00Z`))
    || new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) !== value) throw invalid("Plan start must be a date (YYYY-MM-DD).");
  return value;
}

/** The rows of one save, checked: each names a task once and carries a labor source, a supplier, a plan, or several of them. */
export function peopleEdits(value: unknown): PeopleEdit[] {
  if (!Array.isArray(value) || !value.length || value.length > MAXIMUM_ROWS) throw invalid(`Rows must be a list of 1 to ${MAXIMUM_ROWS} plan rows.`);
  const seen = new Set<number>();
  return value.map((item: unknown) => {
    if (typeof item !== "object" || item === null || Array.isArray(item)) throw invalid("Each row must be an object.");
    const row = item as Record<string, unknown>, taskId = row.taskId;
    if (typeof taskId !== "number" || !Number.isSafeInteger(taskId) || taskId < 1) throw invalid("Each row needs its task id.");
    if (seen.has(taskId)) throw invalid("A task may appear once in a save.");
    seen.add(taskId);
    const edit: PeopleEdit = { taskId };
    if (row.laborSource !== undefined) {
      if (typeof row.laborSource !== "string" || !(LABOR_SOURCES as readonly string[]).includes(row.laborSource)) throw invalid("Labor source must be Own or Outsourced.");
      edit.laborSource = row.laborSource;
    }
    if (row.laborSupplier !== undefined) {
      if (typeof row.laborSupplier !== "string" || row.laborSupplier.trim().length > MAXIMUM_SUPPLIER_LENGTH) throw invalid(`Supplier name must be text of at most ${MAXIMUM_SUPPLIER_LENGTH} characters.`);
      edit.laborSupplier = row.laborSupplier.trim();
    }
    if (row.planStart !== undefined || row.planDays !== undefined || row.people !== undefined) {
      const planStart = isoDate(row.planStart), planDays = row.planDays, people = row.people;
      if (typeof planDays !== "number" || !Number.isInteger(planDays) || planDays < 1 || planDays > MAXIMUM_PLAN_DAYS) throw invalid(`Plan days must be a whole number from 1 to ${MAXIMUM_PLAN_DAYS}.`);
      if (!Array.isArray(people) || people.length > planDays || !people.every(isCount)) throw invalid(`People per day must be whole numbers from 0 to ${MAXIMUM_PEOPLE_PER_DAY}, one for each plan day at most.`);
      edit.plan = { planStart, planDays, people: fitPeople(people, planDays) };
    }
    if (edit.laborSource === undefined && edit.laborSupplier === undefined && !edit.plan) throw invalid("A row needs something to change.");
    return edit;
  });
}

/**
 * The row as one edit leaves it. People and dates go only on a work row with no rows under it that Resource Plan does
 * not manage; the labor source goes on any row that is not a heading. A new first day on a row that starts after
 * another one unlinks it: the day was typed, so it is the day.
 */
export function peopleChange(row: PeopleRow, resolvedStart: string | null, edit: PeopleEdit, state: { hasChildren: boolean; managed: boolean }): PeopleChange {
  if (row.kind === "phase") throw new ApiError(422, "schedule_people_heading", "A heading has no people of its own; set them on the rows under it.");
  const laborSource = edit.laborSource ?? row.laborSource ?? "Own";
  const laborSupplier = laborSource === "Outsourced" ? edit.laborSupplier ?? row.laborSupplier ?? "" : "";
  const kept = fitPeople(row.peopleByDay ?? [], row.planDays);
  const change: PeopleChange = { planStart: row.planStart, planDays: row.planDays, startMode: row.startMode, predecessorId: row.predecessorId,
    lagDays: row.lagDays, planManDays: row.planManDays, laborSource, laborSupplier, people: kept };
  if (!edit.plan) return change;
  if (state.hasChildren) throw new ApiError(422, "schedule_rollup_plan_derived", "A roll-up row's dates and people are calculated from the rows under it.");
  if (row.isMilestone) throw new ApiError(422, "schedule_people_milestone", "A milestone is a date, not work; it takes no people.");
  if (state.managed) throw new ApiError(409, "schedule_people_managed", "Resource Plan manages this row; change it there.");
  const people = fitPeople(edit.plan.people, edit.plan.planDays), total = peopleManDays(people);
  const moved = edit.plan.planStart !== resolvedStart;
  return { ...change, planDays: edit.plan.planDays, people,
    ...(moved ? { planStart: edit.plan.planStart, startMode: "manual", predecessorId: null, lagDays: 0 } : {}),
    planManDays: total > 0 ? total : peopleManDays(kept) > 0 ? 0 : row.planManDays };
}
