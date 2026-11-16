/* The man-hour budget line on Projects > Plan: what is left of the estimated man-days once the plan's
   man-days are taken off. The API (backend-node/src/manhour-budget.ts) sends the two figures. */

export type BudgetFigures = { budgetManDays: number | null; plannedManDays: number };

const round = (value: number): number => Math.round(value * 100) / 100;

/** What is left of the budget, in man-days; negative when the plan holds more than was estimated. Null without a budget. */
export function remainingManDays(data: BudgetFigures): number | null {
  return data.budgetManDays === null ? null : round(data.budgetManDays - data.plannedManDays);
}

/** Left once a row being edited is saved: the row's own saved man-days go back into the pot before the typed figure comes off. */
export function remainingForRow(data: BudgetFigures, savedManDays: number, typedManDays: number): number | null {
  const left = remainingManDays(data);
  if (left === null) return null;
  const saved = Number.isFinite(savedManDays) && savedManDays > 0 ? savedManDays : 0;
  const typed = Number.isFinite(typedManDays) && typedManDays > 0 ? typedManDays : 0;
  return round(left + saved - typed);
}

/** How much of the bar the plan fills, 0 to 100; a plan over the budget fills it. */
export function plannedShare(data: BudgetFigures): number {
  return data.budgetManDays && data.budgetManDays > 0 ? Math.max(0, Math.min(100, (data.plannedManDays / data.budgetManDays) * 100)) : 0;
}
