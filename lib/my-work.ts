export type MyWorkExpansion = Record<string, boolean>;

export function parseMyWorkExpansion(stored: string | null): MyWorkExpansion {
  if (!stored) return {};
  try {
    const parsed: unknown = JSON.parse(stored);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    return Object.fromEntries(Object.entries(parsed).filter((entry): entry is [string, boolean] => typeof entry[1] === "boolean"));
  } catch {
    return {};
  }
}

export const canFinishWork = (initialStatus: string): boolean => initialStatus !== "Blocked";

export const needsZeroProgressFinishConfirmation = (initialPercent: number, nextStatus: string): boolean =>
  initialPercent === 0 && nextStatus === "Done";

type DayRequestWork = {
  canUpdate: boolean;
  managedByResourcePlan?: boolean | undefined;
  canRequestDays?: boolean | undefined;
  pendingRequest: unknown;
};

/** A Resource Plan task owns the dates of a managed row, so My Work never offers a day request there. */
export const offersDayRequest = (item: DayRequestWork): boolean => item.canUpdate && !item.managedByResourcePlan;

/** The server's verdict when it sent one; otherwise the same rule worked out here. */
export const canRequestMoreDays = (item: DayRequestWork): boolean =>
  item.canRequestDays ?? (offersDayRequest(item) && !item.pendingRequest);

/** The server already refuses details under a managed row; the guard keeps an older response from offering one. */
export const offersPersonalTask = (item: { canAddDetail: boolean; managedByResourcePlan?: boolean | undefined }): boolean =>
  item.canAddDetail && !item.managedByResourcePlan;

type ScheduleRowRights = {
  kind: string;
  children: readonly unknown[];
  pics: readonly { id: number }[];
  canProgress?: boolean | undefined;
};

/** Use the per-row canProgress flag when the API sends it; an older API only allowed the assigned PIC on a leaf. */
export function canProgressScheduleRow(
  task: ScheduleRowRights,
  context: { scheduleAllowsProgress: boolean; hasProgressPermission: boolean; userId: number },
): boolean {
  if (typeof task.canProgress === "boolean") return task.canProgress;
  return context.scheduleAllowsProgress
    && context.hasProgressPermission
    && task.kind !== "phase"
    && task.children.length === 0
    && task.pics.some((pic) => pic.id === context.userId);
}

/**
 * Import Drawing follows the server's drawing rule (demandDrawingTask: an assigned PIC on a
 * non-phase leaf of an open project), not canProgress: the PM or an Admin may post progress on a
 * row without being its PIC, but the server refuses them a drawing there.
 */
export function canImportDrawingRow(
  task: ScheduleRowRights & { managedByResourcePlan?: boolean | undefined },
  context: { scheduleAllowsProgress: boolean; hasSigningRequest: boolean; userId: number },
): boolean {
  return context.scheduleAllowsProgress
    && context.hasSigningRequest
    && task.kind !== "phase"
    && task.children.length === 0
    && !task.managedByResourcePlan
    && task.pics.some((pic) => pic.id === context.userId);
}

/** The server's canAnswerRequests when it sent one; an older API let every plan owner answer. */
export const canAnswerDayRequests = (
  schedule: { canPlan: boolean; canAnswerRequests?: boolean | undefined },
  hasPlanPermission: boolean,
): boolean => hasPlanPermission && (schedule.canAnswerRequests ?? schedule.canPlan);

type SortMode = "priority" | "due" | "project";

type SortableWorkGroup = {
  urgency: number;
  nearestDue: string | null;
  updatedAt: string;
};

export function sortMyWorkGroups<T extends { group: SortableWorkGroup }>(
  groups: readonly T[],
  mode: SortMode,
  projectKey: (entry: T) => string,
): T[] {
  const result = [...groups];
  if (mode === "project") return result.sort((left, right) => projectKey(left).localeCompare(projectKey(right), undefined, { numeric: true }));
  if (mode === "due") return result.sort((left, right) => (left.group.nearestDue ?? "9999-12-31").localeCompare(right.group.nearestDue ?? "9999-12-31"));
  return result.sort((left, right) => left.group.urgency - right.group.urgency
    || (left.group.nearestDue ?? "9999-12-31").localeCompare(right.group.nearestDue ?? "9999-12-31")
    || Date.parse(left.group.updatedAt) - Date.parse(right.group.updatedAt));
}
