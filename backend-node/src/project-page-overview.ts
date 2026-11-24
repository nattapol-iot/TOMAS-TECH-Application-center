/*
 * The Overview tab of a project's own page (task doc 5.3): what one project stands at, in one read. Progress by main
 * heading, hours by discipline, purchase requests by status (counts only, never money), the team and its hours this
 * week, the latest documents and the latest changes to the plan. The project's stage, health, dates, follow-ups and
 * payments come with the project row the page already has (GET /api/v1/projects/overview).
 */
import type { ScheduleLeaf } from "./project-health.js";
import type { TaskRow } from "./schedule-service.js";
import type { EstimateDisciplineFigures, PlanDisciplineFigures } from "./project-cost.js";

export type HeadingProgress = { id: number; name: string; planStart: string | null; planFinish: string | null; progress: number | null; plannedProgress: number | null; late: boolean; rows: number };
export type DisciplineHours = { discipline: string; budgetHours: number; planHours: number; actualHours: number };

const DAY_MS = 86_400_000;
const dayNumber = (iso: string) => Date.parse(`${iso}T00:00:00Z`) / DAY_MS;
const round1 = (value: number) => Math.round(value * 10) / 10;

/** The share of a row's span that lies before the end of today, 0 to 1. */
export function elapsedOf(start: string | null, finish: string | null, today: string): number {
  if (!start || !finish) return 0;
  const from = dayNumber(start),
    to = dayNumber(finish),
    now = dayNumber(today);
  if (now < from) return 0;
  if (now >= to) return 1;
  return (now - from + 1) / (to - from + 1);
}

/**
 * Each main heading with the rows under it: work-day weighted progress against where the plan says it should be today,
 * and late when a row under it has not finished by its end. A heading with no dated row under it shows no figure.
 */
export function headingProgress(tasks: readonly TaskRow[], leaves: readonly ScheduleLeaf[], today: string, closed = false): HeadingProgress[] {
  const parentOf = new Map(tasks.map((task) => [task.id, task.parentId] as const));
  const top = (id: number) => {
    let at = id;
    for (let guard = 0; guard < 50; guard++) {
      const parent = parentOf.get(at) ?? null;
      if (parent === null) return at;
      at = parent;
    }
    return at;
  };
  const byHeading = new Map<number, ScheduleLeaf[]>();
  for (const leaf of leaves) {
    if (leaf.rollup) continue;
    const heading = top(leaf.id);
    if (heading === leaf.id) continue;
    byHeading.set(heading, [...(byHeading.get(heading) ?? []), leaf]);
  }
  const resolved = new Map(leaves.map((leaf) => [leaf.id, leaf] as const));
  return tasks
    .filter((task) => task.parentId === null)
    .sort((left, right) => left.sortOrder - right.sortOrder || left.id - right.id)
    .map((task) => {
      const rows = byHeading.get(task.id) ?? [];
      const weighted = rows.filter((row) => row.planStart && row.planFinish);
      const weight = weighted.reduce((sum, row) => sum + Math.max(1, row.workDays), 0);
      const starts = weighted.map((row) => row.planStart!).sort();
      const finishes = weighted.map((row) => row.planFinish!).sort();
      const own = resolved.get(task.id);
      return {
        id: task.id,
        name: task.name,
        planStart: starts[0] ?? own?.planStart ?? null,
        planFinish: finishes.at(-1) ?? own?.planFinish ?? null,
        progress: weight ? round1(weighted.reduce((sum, row) => sum + Math.max(1, row.workDays) * row.percentComplete, 0) / weight) : null,
        // A closed project is finished as the rest of the app says (project-health.ts): nothing late, no "should be by now".
        plannedProgress: weight && !closed ? round1((weighted.reduce((sum, row) => sum + Math.max(1, row.workDays) * elapsedOf(row.planStart, row.planFinish, today), 0) / weight) * 100) : null,
        late: !closed && rows.some((row) => row.status !== "Done" && row.planFinish !== null && row.planFinish < today),
        rows: rows.length,
      };
    });
}

/**
 * Hours by labor discipline, the Cost tab's split (project-cost.ts rowDisciplines, actualDiscipline): the Estimate's
 * internal man-days, what the plan plans and what people confirmed, as hours. Only the man-days are read, never money.
 */
export function disciplineHours(
  estimate: readonly Pick<EstimateDisciplineFigures, "discipline" | "manDays">[],
  plan: readonly Pick<PlanDisciplineFigures, "discipline" | "plannedManDays" | "actualManDays">[],
  hoursPerManDay: number,
): DisciplineHours[] {
  const rows = new Map<string, DisciplineHours>();
  const at = (discipline: string) => {
    const found = rows.get(discipline);
    if (found) return found;
    const fresh = { discipline, budgetHours: 0, planHours: 0, actualHours: 0 };
    rows.set(discipline, fresh);
    return fresh;
  };
  for (const line of estimate) at(line.discipline).budgetHours += line.manDays * hoursPerManDay;
  for (const line of plan) {
    at(line.discipline).planHours += line.plannedManDays * hoursPerManDay;
    at(line.discipline).actualHours += line.actualManDays * hoursPerManDay;
  }
  return [...rows.values()]
    .map((row) => ({ ...row, budgetHours: round1(row.budgetHours), planHours: round1(row.planHours), actualHours: round1(row.actualHours) }))
    .filter((row) => row.budgetHours || row.planHours || row.actualHours);
}
