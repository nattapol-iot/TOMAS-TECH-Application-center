/*
 * Whether a project is keeping to its plan, read from the schedule rather than typed in.
 * Nobody has to remember to change it, and it cannot say "On Track" while a task is late.
 *
 * Only leaf rows with a start date count (a roll-up takes its dates from its children;
 * a row linked to a predecessor has no stored start, so it is left out).
 */

export type ProjectHealth = "On Track" | "At Risk" | "Delayed" | "No plan" | "On Hold" | "Completed";

export type HealthTask = {
  planStart: string; planDays: number; status: string; percentComplete: number; forecastFinish: string | null;
};

/** Days before a planned finish when a task under half done starts to count as a risk. */
export const RISK_WINDOW_DAYS = 7;

const addDays = (iso: string, days: number) => {
  const date = new Date(`${iso}T00:00:00Z`); date.setUTCDate(date.getUTCDate() + days); return date.toISOString().slice(0, 10);
};

export function projectHealth(project: { status: string; targetDelivery: string | null }, tasks: HealthTask[], today: string): ProjectHealth {
  if (project.status === "Closed") return "Completed";
  if (project.status === "On Hold") return "On Hold";
  if (!tasks.length) return "No plan";
  const open = tasks.filter((task) => task.status !== "Done").map((task) => ({ ...task, planFinish: addDays(task.planStart, Math.max(1, task.planDays) - 1) }));
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
