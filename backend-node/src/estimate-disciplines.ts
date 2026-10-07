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

/* Words that name a discipline in a work package or activity, in English and Thai. The standard
   labor library names its packages this way ("Electrical design & in-house wiring",
   "Mechanical design & in-house test", "Software development — in-house"), and so did the
   estimates written before disciplines existed. */
const DISCIPLINE_WORDS: readonly [Exclude<EstimateDiscipline, "Installation">, RegExp][] = [
  ["Electrical", /electric|ไฟฟ้า/i],
  ["Mechanical", /mechanic|เครื่องกล/i],
  ["Software", /software|ซอฟต์แวร์|ซอฟท์แวร์|โปรแกรม/i],
];

/** The one discipline a name speaks of; null when it names none, or more than one. */
export function disciplineNamedIn(text: string | null | undefined): EstimateDiscipline | null {
  const named = DISCIPLINE_WORDS.filter(([, words]) => words.test(text ?? "")).map(([discipline]) => discipline);
  return named.length === 1 ? named[0]! : null;
}

/**
 * What a line reads as when nobody chose: Installation work; an internal rate whose department is
 * the discipline itself; otherwise the discipline its work package names, then its activity.
 */
export function inferredDiscipline(costType: string, department: string | null | undefined, ...names: (string | null | undefined)[]): EstimateDiscipline | null {
  if (costType === "Installation") return "Installation";
  switch ((department ?? "").trim().toLowerCase()) {
    case "electrical": return "Electrical";
    case "mechanical": return "Mechanical";
    case "software": return "Software";
  }
  for (const name of names) {
    const named = disciplineNamedIn(name);
    if (named) return named;
  }
  return null;
}

/**
 * The discipline a write stores. A client that sends none (an older screen, an import) gets the
 * inferred one; a client that sends one must send a discipline its cost type allows.
 */
export function lineDiscipline(value: unknown, costType: string, department?: string | null, ...names: (string | null | undefined)[]): EstimateDiscipline | null {
  if (value === undefined || value === null || value === "") return inferredDiscipline(costType, department, ...names);
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
