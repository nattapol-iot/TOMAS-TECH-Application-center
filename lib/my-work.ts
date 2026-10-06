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

/*
 * One late rule for My Work, the Dashboard, the My Work badge and the project health (overdue
 * against the current plan, backend-node/src/project-health.ts): an open task is late once its plan
 * finish has passed. A later forecast does not clear it, because only the PM moves dates; the
 * forecast tells the PM when it will land.
 */
type TimedTask = { status: string; planFinish: string | null; actualFinish?: string | null; forecastFinish?: string | null };

export const isLateAgainstPlan = (task: TimedTask, today: string): boolean =>
  task.status !== "Done" && Boolean(task.planFinish) && task.planFinish!.slice(0, 10) < today;

/** Late with no finish forecast yet: the assignee owes the PM a date. */
export const needsForecastDate = (task: TimedTask, today: string): boolean =>
  isLateAgainstPlan(task, today) && !task.actualFinish && !task.forecastFinish;

export const STALE_IN_PROGRESS_DAYS = 5;

/** In progress with no update for more than five days. */
export const isStaleInProgress = (task: { status: string; updatedAt: string }, nowMs: number): boolean =>
  task.status === "In Progress" && nowMs - Date.parse(task.updatedAt) > STALE_IN_PROGRESS_DAYS * 86_400_000;

type ProgressState = { status: string; percentComplete: number; actualStart: string | null; actualFinish: string | null; forecastFinish?: string | null };
export type ProgressPatch = { percentComplete?: number; status?: string; actualStart?: string | null; actualFinish?: string | null; forecastFinish?: string | null };

/** The server refuses a forecast before the actual start, so a newly stamped start clears an older forecast. */
const withStart = (task: ProgressState, start: string, patch: ProgressPatch): ProgressPatch =>
  task.forecastFinish && task.forecastFinish < start ? { ...patch, forecastFinish: null } : patch;

/**
 * What one click on the 0/25/50/75/100 strip saves. 100 finishes the task today; a value in between
 * starts a not-started task; any value above 0 stamps the actual start once, so work in progress
 * always has a start date. The strip sends nothing for the value already set.
 */
export function percentChangePatch(task: ProgressState, value: number, today: string): ProgressPatch | null {
  if (value === Number(task.percentComplete)) return null;
  const start = task.actualStart ?? today;
  if (value === 100) return withStart(task, start, { percentComplete: 100, status: "Done", actualStart: start, actualFinish: task.actualFinish ?? today });
  if (value === 0) return { percentComplete: 0 };
  return withStart(task, start, { percentComplete: value, ...(task.status === "Not Started" || task.status === "Done" ? { status: "In Progress", actualFinish: null } : {}), actualStart: start });
}

/** What choosing a status saves, with the dates and percent the server's progress rules require. */
export function statusChangePatch(task: ProgressState, status: string, today: string): ProgressPatch | null {
  if (status === task.status) return null;
  if (status === "Not Started") return { status, percentComplete: 0, actualStart: null, actualFinish: null };
  const start = task.actualStart ?? today;
  if (status === "Done") return withStart(task, start, { status, percentComplete: 100, actualStart: start, actualFinish: task.actualFinish ?? today });
  const percent = Number(task.percentComplete);
  return withStart(task, start, { status, actualStart: start, actualFinish: null, percentComplete: percent === 100 ? 99 : percent });
}

/** What the My Work badge and the "Needs update" filter count: late, blocked, owing a forecast, or quiet. */
export const myWorkNeedsAttention = (
  task: TimedTask & { canUpdate: boolean; updatedAt: string },
  today: string,
  nowMs: number,
): boolean => task.canUpdate && task.status !== "Done"
  && (isLateAgainstPlan(task, today) || task.status === "Blocked" || needsForecastDate(task, today) || isStaleInProgress(task, nowMs));

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
