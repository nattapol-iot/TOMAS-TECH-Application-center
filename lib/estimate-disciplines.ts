/**
 * The discipline a labor or site-expense line belongs to. Keep in sync with
 * backend-node/src/estimate-disciplines.ts (a test compares them).
 *
 * The labor sheet is one section per discipline, in this order; each section holds its own
 * man-hour and its own travel, hotel and per diem. Installation is installation and service
 * work, and is the only discipline with the Installation cost type.
 */
export const ESTIMATE_DISCIPLINES = ["Electrical", "Mechanical", "Software", "Installation"] as const;

export type EstimateDiscipline = (typeof ESTIMATE_DISCIPLINES)[number];

export const isEstimateDiscipline = (value: unknown): value is EstimateDiscipline =>
  typeof value === "string" && (ESTIMATE_DISCIPLINES as readonly string[]).includes(value);

export const costTypeOfDiscipline = (discipline: EstimateDiscipline): "Engineering" | "Installation" =>
  discipline === "Installation" ? "Installation" : "Engineering";

/**
 * Rate-master rows offered inside a discipline's section. A department named after the discipline
 * narrows the list; when the master uses other department names, every row stays available rather
 * than leaving the section with nothing to choose from. Installation work may be done by any
 * department, so it is never narrowed.
 */
export function ratesForDiscipline<T extends { department: string }>(rates: readonly T[], discipline: EstimateDiscipline): T[] {
  if (discipline === "Installation") return [...rates];
  const own = rates.filter((rate) => rate.department.trim().toLowerCase() === discipline.toLowerCase());
  return own.length ? own : [...rates];
}
