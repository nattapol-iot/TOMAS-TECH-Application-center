/*
 * Whether a project is keeping to its plan, read from the schedule rather than typed in.
 * Nobody has to remember to change it, and it cannot say "On Track" while a task is late.
 *
 * Only leaf rows with a start date count (a roll-up takes its dates from its children;
 * a row linked to a predecessor has no stored start, so it is left out).
 * summarizeProjectSchedule() below works on resolved leaves instead, so linked rows count there.
 */

import { MASTER_PLAN_PHASE } from "./schedule-phases.js";
import type { resolveTasks, TaskRow } from "./schedule-service.js";

export type ProjectHealth = "On Track" | "At Risk" | "Delayed" | "No plan" | "On Hold" | "Completed";

export type HealthTask = {
  planStart: string; planDays: number; status: string; percentComplete: number; forecastFinish: string | null;
};

/** Days before a planned finish when a task under half done starts to count as a risk. */
export const RISK_WINDOW_DAYS = 7;

const addDays = (iso: string, days: number) => {
  const date = new Date(`${iso}T00:00:00Z`); date.setUTCDate(date.getUTCDate() + days); return date.toISOString().slice(0, 10);
};

type DatedTask = { planStart: string; planFinish: string; status: string; percentComplete: number; forecastFinish: string | null };

/** The health rules themselves, over tasks whose start and finish are already known. */
function healthOf(project: { status: string; targetDelivery: string | null }, tasks: DatedTask[], today: string): ProjectHealth {
  if (project.status === "Closed") return "Completed";
  if (project.status === "On Hold") return "On Hold";
  if (!tasks.length) return "No plan";
  const open = tasks.filter((task) => task.status !== "Done");
  const delayed = (project.targetDelivery !== null && project.targetDelivery < today && open.length > 0)
    || open.some((task) => task.planFinish < today)
    || (project.targetDelivery !== null && open.some((task) => task.forecastFinish !== null && task.forecastFinish > project.targetDelivery!));
  if (delayed) return "Delayed";
  const soon = addDays(today, RISK_WINDOW_DAYS);
  const atRisk = open.some((task) => task.status === "Blocked"
    || (task.forecastFinish !== null && task.forecastFinish > task.planFinish)
    || (task.status === "Not Started" && task.planStart < today)
    || (task.planFinish <= soon && task.percentComplete < 50));
  return atRisk ? "At Risk" : "On Track";
}

export function projectHealth(project: { status: string; targetDelivery: string | null }, tasks: HealthTask[], today: string): ProjectHealth {
  return healthOf(project, tasks.map((task) => ({ ...task, planFinish: addDays(task.planStart, Math.max(1, task.planDays) - 1) })), today);
}

/*
 * One schedule summary for every screen that shows a project's progress or health (Project Schedule,
 * Projects portfolio, Executive). Progress is weighted by work days, max(1, workDays) per leaf, the same
 * weight the schedule roll-ups use. Rows under the Master Plan phase are the customer timeline frame,
 * so they are left out of progress, health and the counts unless the project has nothing else.
 */

/** A schedule row with no active children, with the dates the calculation resolved for it. */
export type ScheduleLeaf = {
  id: number; name: string; planStart: string | null; planFinish: string | null; workDays: number;
  status: string; percentComplete: number; forecastFinish: string | null; actualFinish: string | null;
  baselineFinish: string | null; isMilestone: boolean; inMasterPlan: boolean;
};

export type ProjectScheduleSummary = {
  // 0-100, 2 decimals; null when no counted leaves. A Closed project reads progress 100 and plannedProgress null.
  health: ProjectHealth; progress: number | null; plannedProgress: number | null;
  planStart: string | null; planFinish: string | null; forecastFinish: string | null; slipDays: number | null;
  taskCount: number; doneCount: number; overdueCount: number; blockedCount: number; slippedCount: number;
  nextMilestone: { name: string; date: string } | null;
};

const compareText = (left: string, right: string) => (left < right ? -1 : left > right ? 1 : 0);
const round2 = (value: number) => Math.round(value * 100) / 100;
const dayNumber = (iso: string) => Date.parse(`${iso}T00:00:00Z`) / 86_400_000;
const weightOf = (leaf: ScheduleLeaf) => Math.max(1, leaf.workDays);
const endOf = (leaf: ScheduleLeaf) => leaf.actualFinish ?? leaf.forecastFinish ?? leaf.planFinish;
const earliest = (values: Array<string | null>) => values.filter((value): value is string => value !== null).sort()[0] ?? null;
const latest = (values: Array<string | null>) => values.filter((value): value is string => value !== null).sort().at(-1) ?? null;

/** Leaves that count: every non-Master-Plan leaf; Master Plan leaves only when nothing else exists. */
export function countedLeaves(leaves: ScheduleLeaf[]): ScheduleLeaf[] {
  const work = leaves.filter((leaf) => !leaf.inMasterPlan);
  return work.length ? work : leaves;
}

/** Build leaves from a resolveTasks() result + the TaskRow list (phase rows excluded, roll-ups excluded). */
export function scheduleLeaves(tasks: TaskRow[], calculation: ReturnType<typeof resolveTasks>): ScheduleLeaf[] {
  const byId = new Map(tasks.map((task) => [task.id, task]));
  const topOf = (task: TaskRow): TaskRow => {
    const seen = new Set<number>([task.id]); let current = task;
    while (current.parentId !== null) {
      const parent = byId.get(current.parentId);
      if (!parent || seen.has(parent.id)) break;
      seen.add(parent.id); current = parent;
    }
    return current;
  };
  const leaves: ScheduleLeaf[] = [];
  for (const task of tasks) {
    const resolved = calculation.byId.get(task.id);
    if (!resolved || task.kind === "phase" || resolved.children.length) continue;
    const top = topOf(task);
    leaves.push({ id: task.id, name: task.name, planStart: resolved.planStart, planFinish: resolved.planFinish, workDays: resolved.workDays,
      status: resolved.status, percentComplete: resolved.percentComplete, forecastFinish: resolved.forecastFinish, actualFinish: resolved.actualFinish,
      baselineFinish: task.baselineFinish, isMilestone: task.isMilestone, inMasterPlan: top.kind === "phase" && top.name === MASTER_PLAN_PHASE });
  }
  return leaves;
}

export function summarizeProjectSchedule(
  project: { status: string; targetDelivery: string | null }, leaves: ScheduleLeaf[], today: string,
): ProjectScheduleSummary {
  const counted = countedLeaves(leaves);
  const totalWeight = counted.reduce((sum, leaf) => sum + weightOf(leaf), 0);
  // Closing a project sets its progress to 100 (progressForStatus) without touching the schedule, and a closed
  // schedule can no longer be updated, so a Closed project reads 100 with no plan comparison on every screen.
  const closed = project.status === "Closed";
  const progress = !counted.length ? null : closed ? 100 : round2(counted.reduce((sum, leaf) => sum + leaf.percentComplete * weightOf(leaf), 0) / totalWeight);
  const plannedShare = (leaf: ScheduleLeaf) => {
    const start = dayNumber(leaf.planStart!), span = dayNumber(leaf.planFinish!) - start + 1;
    return span > 0 ? Math.min(1, Math.max(0, (dayNumber(today) - start + 1) / span)) : today >= leaf.planStart! ? 1 : 0;
  };
  const plannedProgress = !closed && counted.length && counted.every((leaf) => leaf.planStart !== null && leaf.planFinish !== null)
    ? round2(counted.reduce((sum, leaf) => sum + plannedShare(leaf) * 100 * weightOf(leaf), 0) / totalWeight) : null;
  const dated = counted.filter((leaf): leaf is ScheduleLeaf & { planStart: string; planFinish: string } => leaf.planStart !== null && leaf.planFinish !== null);
  // A leaf without a resolved start (linked to an undated row) cannot be judged, as in projectHealth().
  const health = healthOf(project, dated, today);
  const forecastFinish = latest(counted.map(endOf));
  const milestone = leaves
    .filter((leaf) => leaf.status !== "Done" && (leaf.isMilestone || leaf.inMasterPlan) && leaf.planFinish !== null && leaf.planFinish >= today)
    .sort((left, right) => compareText(left.planFinish!, right.planFinish!) || compareText(left.name, right.name))[0];
  return {
    health, progress, plannedProgress,
    planStart: earliest(counted.map((leaf) => leaf.planStart)), planFinish: latest(counted.map((leaf) => leaf.planFinish)), forecastFinish,
    slipDays: forecastFinish !== null && project.targetDelivery !== null ? Math.round(dayNumber(forecastFinish) - dayNumber(project.targetDelivery)) : null,
    taskCount: counted.length, doneCount: counted.filter((leaf) => leaf.status === "Done").length,
    overdueCount: counted.filter((leaf) => leaf.status !== "Done" && leaf.planFinish !== null && leaf.planFinish < today).length,
    blockedCount: counted.filter((leaf) => leaf.status === "Blocked").length,
    slippedCount: counted.filter((leaf) => { const end = endOf(leaf); return leaf.baselineFinish !== null && end !== null && end > leaf.baselineFinish; }).length,
    nextMilestone: milestone ? { name: milestone.name, date: milestone.planFinish! } : null,
  };
}
