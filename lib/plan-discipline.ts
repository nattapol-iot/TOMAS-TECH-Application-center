/*
 * The discipline a plan row needs (migration 123, owner 2026-11-22). One head assigns people to every project: the PM adds
 * the row with its discipline and man-days and leaves the PIC empty, and the row waits in the head's queue on
 * Team overview > Allocation. The API checks the same four values (backend-node/src/schedule-service.ts PLAN_DISCIPLINES).
 */
export const PLAN_DISCIPLINES = ["Electrical", "Mechanical", "Software", "Installation"] as const;
export type PlanDiscipline = (typeof PLAN_DISCIPLINES)[number];

export const isPlanDiscipline = (value: unknown): value is PlanDiscipline => typeof value === "string" && (PLAN_DISCIPLINES as readonly string[]).includes(value);

/** The dictionary key (app/system/i18n.ts) of a discipline's name. */
export const disciplineLabel = (discipline: PlanDiscipline) => `Discipline.${discipline}`;

/** The in-place draft row's one select: a person's id, or "d:<discipline>" for a row waiting for the head to name its people. */
export const WAITING_PREFIX = "d:";
export function draftPick(value: string): { memberId: number | null; discipline: PlanDiscipline | null } {
  if (value.startsWith(WAITING_PREFIX)) {
    const discipline = value.slice(WAITING_PREFIX.length);
    return { memberId: null, discipline: isPlanDiscipline(discipline) ? discipline : null };
  }
  return { memberId: value ? Number(value) : null, discipline: null };
}
export const draftValue = (draft: { memberId: number | null; discipline?: PlanDiscipline | null }) =>
  draft.memberId !== null ? String(draft.memberId) : draft.discipline ? `${WAITING_PREFIX}${draft.discipline}` : "";
