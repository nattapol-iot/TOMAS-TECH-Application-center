import { ApiError } from "./errors.js";

/**
 * The discipline a labor or site-expense line belongs to: dbo.manhour_lines.discipline and
 * dbo.expense_lines.discipline (migration 070). Keep in sync with lib/estimate-disciplines.ts on
 * the front end (a test compares them).
 *
 * Installation is the discipline of exactly the Installation cost type, and the other three are
 * Engineering work; CK_manhour_lines_discipline and CK_expense_lines_discipline hold the database
 * to the same rule.
 */
export const ESTIMATE_DISCIPLINES = ["Electrical", "Mechanical", "Software", "Installation"] as const;

export type EstimateDiscipline = (typeof ESTIMATE_DISCIPLINES)[number];

export const isEstimateDiscipline = (value: unknown): value is EstimateDiscipline =>
  typeof value === "string" && (ESTIMATE_DISCIPLINES as readonly string[]).includes(value);

export const costTypeOfDiscipline = (discipline: EstimateDiscipline): "Engineering" | "Installation" =>
  discipline === "Installation" ? "Installation" : "Engineering";

/** What a line reads as when nobody chose: the rule migration 070 backfilled with. */
export function inferredDiscipline(costType: string, department: string | null | undefined): EstimateDiscipline | null {
  if (costType === "Installation") return "Installation";
  switch ((department ?? "").trim().toLowerCase()) {
    case "electrical": return "Electrical";
    case "mechanical": return "Mechanical";
    case "software": return "Software";
    default: return null;
  }
}

/**
 * The discipline a write stores. A client that sends none (an older screen, an import) gets the
 * inferred one; a client that sends one must send a discipline its cost type allows.
 */
export function lineDiscipline(value: unknown, costType: string, department?: string | null): EstimateDiscipline | null {
  if (value === undefined || value === null || value === "") return inferredDiscipline(costType, department);
  if (!isEstimateDiscipline(value)) {
    throw new ApiError(400, "validation_failed", `Discipline must be one of ${ESTIMATE_DISCIPLINES.join(", ")}.`);
  }
  if (costTypeOfDiscipline(value) !== costType) {
    throw new ApiError(400, "validation_failed", value === "Installation"
      ? "Installation lines use the Installation cost type."
      : `${value} lines use the Engineering cost type.`);
  }
  return value;
}
