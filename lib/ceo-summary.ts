/*
 * The CEO cost summary (task doc 6.3): what to know about a project, written from its figures, and the order the
 * projects are read in (most at risk on its budget first). Nothing is sent anywhere: the CEO reads it in the app.
 * Money appears only in figures the cost overview already gave the viewer (Leaders and above see all of them).
 */
import { budgetState, projectBudgetStates, type BudgetState, type ProjectCostItem } from "../backend-node/src/project-cost-model";

/** A sentence to show: its copy key, its colour, and the values it names. */
export type CeoFact = { key: string; tone: "red" | "amber" | "green" | "muted"; params: Record<string, string | number> };
/** What the summary reads from the project list (project-overview-client.ts); all optional for an older API. */
export type CeoScheduleFacts = { status?: string; slipDays?: number | null; followUps?: number; health?: string; nextMilestone?: { name: string; date: string } | null };

const percent = (used: number, budget: number) => Math.round((used / budget) * 100);
const RISK: Record<BudgetState, number> = { over: 0, near: 1, within: 2, none: 3 };

export function thingsToKnow(cost: Pick<ProjectCostItem, "hardware" | "outsource" | "labor">, schedule: CeoScheduleFacts = {}): CeoFact[] {
  const facts: CeoFact[] = [];
  const open = schedule.status !== "Closed";
  if (open && (schedule.slipDays ?? 0) > 0) facts.push({ key: "CEO.late", tone: "red", params: { days: schedule.slipDays! } });
  else if (open && schedule.health === "On Track") facts.push({ key: "CEO.onTrack", tone: "green", params: {} });
  if (open && (schedule.followUps ?? 0) > 0) facts.push({ key: "CEO.follow", tone: "amber", params: { count: schedule.followUps! } });
  for (const [group, figures] of [
    ["hardware", cost.hardware],
    ["outsource", cost.outsource],
  ] as const) {
    const state = budgetState(figures.budget, figures.requested);
    if ((state === "over" || state === "near") && figures.budget && figures.requested !== null)
      facts.push({ key: `CEO.${group}.${state}`, tone: state === "over" ? "red" : "amber", params: { percent: percent(figures.requested, figures.budget) } });
  }
  const labor = cost.labor;
  // The plan or the forecast, whichever is more: the same two figures the budget state weighs (project-cost-model.ts laborState).
  const forecast = Math.max(labor.plannedManDays, labor.forecastManDays ?? 0);
  if (labor.budgetManDays === null || labor.budgetManDays <= 0) {
    if (labor.plannedManDays > 0 || labor.actualManDays > 0) facts.push({ key: "CEO.people.noBudget", tone: "muted", params: { planned: Math.round(labor.plannedManDays) } });
  } else {
    const state = budgetState(labor.budgetManDays, forecast);
    if (state === "over")
      facts.push({ key: "CEO.people.over", tone: "red", params: { days: Math.round((forecast - labor.budgetManDays) * 10) / 10, percent: percent(forecast, labor.budgetManDays) } });
    else if (state === "near") facts.push({ key: "CEO.people.near", tone: "amber", params: { percent: percent(forecast, labor.budgetManDays) } });
  }
  if (open && schedule.nextMilestone) facts.push({ key: "CEO.milestone", tone: "muted", params: { name: schedule.nextMilestone.name, date: schedule.nextMilestone.date } });
  return facts;
}

/** Most at risk on its budget first, then the latest against its delivery date, then by number. */
export function byBudgetRisk<T extends Pick<ProjectCostItem, "hardware" | "outsource" | "labor" | "number">>(items: readonly T[], slip: (item: T) => number | null | undefined = () => null): T[] {
  return [...items].sort(
    (left, right) =>
      RISK[projectBudgetStates(left).worst] - RISK[projectBudgetStates(right).worst] ||
      (slip(right) ?? -Infinity) - (slip(left) ?? -Infinity) ||
      left.number.localeCompare(right.number, "en", { numeric: true }),
  );
}

/** A fact's sentence: its copy with each {name} filled in. */
export const factText = (fact: CeoFact, t: (key: string) => string) => Object.entries(fact.params).reduce((text, [name, value]) => text.split(`{${name}}`).join(String(value)), t(fact.key));
