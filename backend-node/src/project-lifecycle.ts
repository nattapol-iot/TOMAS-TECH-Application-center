// The eight project statuses come from CK_projects_status in migration 001. This module is the
// single place that says how a project may move between them, so the API and the screen agree.

export const PROJECT_STATUSES = [
  "Planning", "Design", "Development", "Installation", "Commissioning", "Handover", "Closed", "On Hold",
] as const;

export type ProjectStatus = (typeof PROJECT_STATUSES)[number];

// The stages a project passes through while work is happening, in order.
export const PROJECT_ACTIVE_FLOW: ProjectStatus[] = [
  "Planning", "Design", "Development", "Installation", "Commissioning", "Handover",
];

export const PROJECT_TERMINAL_STATUS: ProjectStatus = "Closed";
export const PROJECT_PAUSED_STATUS: ProjectStatus = "On Hold";

export function isProjectStatus(value: unknown): value is ProjectStatus {
  return typeof value === "string" && (PROJECT_STATUSES as readonly string[]).includes(value);
}

/**
 * The statuses a project may move to next.
 *
 * An open project moves to any other status. The stage is a label the team keeps, and making people
 * click through stages they skipped only teaches them to record stages that never happened. Closing
 * works from every open status: it still needs the actual delivery date (checkProjectTransition), and
 * the close dialog says how many tasks are unfinished instead of gating on Handover.
 *
 * `elevated` is the caller's Admin / Engineering Manager / Project Manager standing. It only ever
 * adds the reopen move, so a closed project cannot be quietly revived by whoever passes by.
 */
export function allowedProjectTransitions(current: ProjectStatus, elevated = false): ProjectStatus[] {
  if (current === PROJECT_TERMINAL_STATUS) {
    return elevated ? ["Handover", PROJECT_PAUSED_STATUS] : [];
  }
  return PROJECT_STATUSES.filter((status) => status !== current);
}

export type ProjectTransitionCheck = {
  current: ProjectStatus;
  next: ProjectStatus;
  elevated?: boolean;
  /** The actual delivery date the project will carry once this change is saved. */
  actualDelivery?: string | null;
};

export type ProjectTransitionResult =
  | { ok: true; changed: boolean }
  | { ok: false; reason: string };

/**
 * Decides whether one status change is allowed. Staying on the same status is always fine so a
 * caller can send the whole record back without having to strip the status out.
 */
export function checkProjectTransition(check: ProjectTransitionCheck): ProjectTransitionResult {
  const { current, next, elevated = false, actualDelivery = null } = check;
  if (current === next) return { ok: true, changed: false };
  if (current === PROJECT_TERMINAL_STATUS && !elevated) {
    return { ok: false, reason: "A closed project can only be reopened by a manager or an administrator." };
  }
  if (!allowedProjectTransitions(current, elevated).includes(next)) {
    return { ok: false, reason: `A project cannot move from ${current} to ${next}.` };
  }
  if (next === PROJECT_TERMINAL_STATUS && !actualDelivery) {
    return { ok: false, reason: "Record the actual delivery date before closing the project." };
  }
  return { ok: true, changed: true };
}

/**
 * Closing a project means the work is finished, so progress follows the status rather than leaving a
 * closed project sitting at some stale percentage. Every other status keeps whatever was asked for.
 */
export function progressForStatus(status: ProjectStatus, requested: number): number {
  return status === PROJECT_TERMINAL_STATUS ? 100 : requested;
}
