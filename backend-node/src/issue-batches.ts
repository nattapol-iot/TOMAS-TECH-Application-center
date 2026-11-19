import { ApiError } from "./errors.js";
import { parseDateOnly } from "./http.js";
import type { CurrentUser } from "./types.js";
import { rolesOf } from "./user-roles.js";

/*
 * Customer issue batches (Projects > Punchlist, migration 107): the rules the routes apply, kept apart from SQL so
 * they can be tested on their own.
 *
 * One batch is one customer report; its issues are typed in a grid. A Problem starts at once. A Requirement waits
 * for a PM / Lead (state Approval) only when someone who cannot approve typed it. An issue is planned in hours and
 * closed with the hours it took and what was done; 8 hours are one man-day wherever load is added up. The batch
 * closes itself when every issue in it is Done, Cancelled or Rejected.
 */

export const ISSUE_CATEGORIES = ["Problem", "Requirement"] as const;
export type IssueCategory = (typeof ISSUE_CATEGORIES)[number];
export const ISSUE_STATES = ["Approval", "Open", "Doing", "Done", "Cancelled", "Rejected"] as const;
export type IssueState = (typeof ISSUE_STATES)[number];
/** States that still need someone: they keep a batch open. */
export const OPEN_ISSUE_STATES: readonly IssueState[] = ["Approval", "Open", "Doing"];
/** States that take someone's time on the team's load: approved and not finished. */
export const WORKING_ISSUE_STATES: readonly IssueState[] = ["Open", "Doing"];
export const ISSUE_ACTIONS = ["approve", "reject", "start", "close", "cancel", "reopen"] as const;
export type IssueAction = (typeof ISSUE_ACTIONS)[number];

export const HOURS_PER_MAN_DAY = 8;
export const MAX_ISSUE_HOURS = 9999;
/** A batch holds at most this many issues, typed at once or added later. */
export const MAX_BATCH_ITEMS = 200;

export type IssueItemInput = {
  category: IssueCategory;
  functionName: string;
  description: string;
  assigneeId: number | null;
  planStart: string | null;
  planEnd: string | null;
  planHours: number | null;
};

export type IssueBatchInput = {
  projectId: number | null;
  externalProject: string;
  customerName: string;
  reportedOn: string;
  reportedBy: string;
  note: string;
};

/** A field the person has to fix, with the line it is on (1-based) when it belongs to an issue. */
export function issueFieldError(field: string, message: string, line?: number): ApiError {
  return new ApiError(400, "validation_failed", line ? `Issue ${line}: ${message}` : message, { field, ...(line ? { line } : {}) });
}

const text = (value: unknown, max: number, field: string, line?: number) => {
  if (value === undefined || value === null) return "";
  if (typeof value !== "string") throw issueFieldError(field, `${field} must be text.`, line);
  const trimmed = value.trim();
  if (trimmed.length > max) throw issueFieldError(field, `${field} cannot exceed ${max} characters.`, line);
  return trimmed;
};

const date = (value: unknown, field: string, line?: number) => {
  try {
    return parseDateOnly(value, field, true);
  } catch {
    throw issueFieldError(field, `${field} must be a date (YYYY-MM-DD).`, line);
  }
};

/** Hours to two decimals, or null when left empty. */
export function hoursInput(value: unknown, field: string, line?: number, required = false): number | null {
  if (value === undefined || value === null || value === "") {
    if (required) throw issueFieldError(field, `${field} is required.`, line);
    return null;
  }
  const hours = typeof value === "number" ? value : typeof value === "string" && value.trim() !== "" ? Number(value) : Number.NaN;
  if (!Number.isFinite(hours) || hours < 0 || hours > MAX_ISSUE_HOURS) throw issueFieldError(field, `${field} must be between 0 and ${MAX_ISSUE_HOURS} hours.`, line);
  return Math.round(hours * 100) / 100;
}

/** One issue as typed in the grid. A plan end without a start is refused; a start without an end is a one-day plan. */
export function issueItemInput(value: unknown, line?: number): IssueItemInput {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw issueFieldError("item", "Each issue must be an object.", line);
  const body = value as Record<string, unknown>;
  const category = body.category;
  if (category !== "Problem" && category !== "Requirement") throw issueFieldError("category", "Category must be Problem or Requirement.", line);
  const description = text(body.description, 4000, "description", line);
  if (!description) throw issueFieldError("description", "Description is required.", line);
  const assignee = body.assigneeId;
  if (assignee !== undefined && assignee !== null && (!Number.isSafeInteger(assignee) || (assignee as number) <= 0)) throw issueFieldError("assigneeId", "PIC is invalid.", line);
  const planStart = date(body.planStart, "planStart", line);
  let planEnd = date(body.planEnd, "planEnd", line);
  if (planEnd && !planStart) throw issueFieldError("planStart", "Plan start is required when there is a plan end.", line);
  if (planStart && !planEnd) planEnd = planStart;
  if (planStart && planEnd && planEnd < planStart) throw issueFieldError("planEnd", "Plan end cannot be before plan start.", line);
  return {
    category, description, functionName: text(body.functionName, 200, "functionName", line),
    assigneeId: (assignee as number | null | undefined) ?? null, planStart, planEnd,
    planHours: hoursInput(body.planHours, "planHours", line),
  };
}

/** The issues of a new batch or of lines added to one: at least one, at most MAX_BATCH_ITEMS. */
export function issueItemsInput(value: unknown, already = 0): IssueItemInput[] {
  if (!Array.isArray(value) || value.length === 0) throw issueFieldError("items", "Add at least one issue.");
  if (value.length + already > MAX_BATCH_ITEMS) throw issueFieldError("items", `A batch holds at most ${MAX_BATCH_ITEMS} issues.`);
  return value.map((item, index) => issueItemInput(item, index + 1));
}

/** The batch header: a project of this system, or the name of one it does not have (closed long ago, or never here). */
export function issueBatchInput(value: Record<string, unknown>): IssueBatchInput {
  const project = value.projectId;
  if (project !== undefined && project !== null && (!Number.isSafeInteger(project) || (project as number) <= 0)) throw issueFieldError("projectId", "Project is invalid.");
  const projectId = (project as number | null | undefined) ?? null;
  const externalProject = projectId ? "" : text(value.externalProject, 200, "externalProject");
  if (!projectId && !externalProject) throw issueFieldError("projectId", "Choose a project or type the project's name.");
  const reportedOn = date(value.reportedOn, "reportedOn");
  if (!reportedOn) throw issueFieldError("reportedOn", "Reported date is required.");
  return {
    projectId, externalProject, reportedOn,
    customerName: text(value.customerName, 200, "customerName"),
    reportedBy: text(value.reportedBy, 200, "reportedBy"),
    note: text(value.note, 2000, "note"),
  };
}

/** Roles that approve Requirements anywhere: Admin, a Leader, any manager (as on the team board). */
export const approverByRole = (actor: Pick<CurrentUser, "role" | "roles">) =>
  rolesOf(actor).some((role) => role === "Admin" || role === "Leader" || /manager$/i.test(role));

/** Who approves the Requirements of a batch: an approver by role, or the batch project's manager or lead engineer. */
export const canApproveIssues = (actor: Pick<CurrentUser, "id" | "role" | "roles">, project: { managerId: number | null; leadId: number | null } | null) =>
  approverByRole(actor) || (project !== null && (project.managerId === actor.id || project.leadId === actor.id));

/** Where a new issue starts: a Problem, or anything an approver typed, is open at once. */
export const startingState = (category: IssueCategory, approver: boolean): IssueState =>
  category === "Requirement" && !approver ? "Approval" : "Open";

/**
 * Where an action takes an issue from its state, or null when it does not apply there. Reopen goes back to where a new
 * issue of its category would start for the person reopening it.
 */
export function nextIssueState(action: IssueAction, state: IssueState, category: IssueCategory, approver: boolean): IssueState | null {
  switch (action) {
    case "approve": return state === "Approval" ? "Open" : null;
    case "reject": return state === "Approval" ? "Rejected" : null;
    case "start": return state === "Open" ? "Doing" : null;
    case "close": return state === "Open" || state === "Doing" ? "Done" : null;
    case "cancel": return OPEN_ISSUE_STATES.includes(state) ? "Cancelled" : null;
    case "reopen": return OPEN_ISSUE_STATES.includes(state) ? null : startingState(category, approver);
  }
}

export type IssueActor = { isApprover: boolean; isAssignee: boolean; isCreator: boolean; canWrite: boolean };

/** Whether this person may take the action at all (the state is checked by nextIssueState). */
export function mayTakeIssueAction(action: IssueAction, who: IssueActor): boolean {
  if (!who.canWrite) return false;
  switch (action) {
    case "approve": case "reject": return who.isApprover;
    case "start": case "close": return who.isApprover || who.isAssignee;
    case "cancel": case "reopen": return who.isApprover || who.isAssignee || who.isCreator;
  }
}

/** Every action this person may take on an issue in its state now, for the screen's buttons. */
export function issueActions(state: IssueState, category: IssueCategory, who: IssueActor): IssueAction[] {
  return ISSUE_ACTIONS.filter((action) => mayTakeIssueAction(action, who) && nextIssueState(action, state, category, who.isApprover) !== null);
}

/** Whether the issue can still be edited (plan, PIC, text) by this person. */
export const mayEditIssue = (state: IssueState, who: IssueActor) =>
  who.canWrite && OPEN_ISSUE_STATES.includes(state) && (who.isApprover || who.isAssignee || who.isCreator);

/**
 * The state after an edit: a Problem turned into a Requirement by someone who cannot approve goes back to waiting for
 * approval; any other edit keeps the state.
 */
export const stateAfterEdit = (state: IssueState, from: IssueCategory, to: IssueCategory, approver: boolean): IssueState =>
  from === "Problem" && to === "Requirement" && !approver && (state === "Open" || state === "Doing") ? "Approval" : state;

/** A batch is closed when it has issues and none of them still needs anyone. */
export const batchIsClosed = (states: readonly string[]) => states.length > 0 && states.every((state) => !OPEN_ISSUE_STATES.includes(state as IssueState));

/** IS-YYYYMM-NNNN: the month's next number after the highest one taken. */
export function nextBatchNumber(month: string, highest: string | null): string {
  if (!/^\d{6}$/.test(month)) throw new Error(`Invalid batch month ${month}`);
  const prefix = `IS-${month}-`;
  const last = highest && highest.startsWith(prefix) ? Number(highest.slice(prefix.length)) : 0;
  return `${prefix}${String((Number.isSafeInteger(last) ? last : 0) + 1).padStart(4, "0")}`;
}

/** Hours as man-days (8 h = 1 MD), to two decimals; null stays null. */
export const hoursToManDays = (hours: number | null) => (hours === null ? null : Math.round((hours / HOURS_PER_MAN_DAY) * 100) / 100);

/** The day in Bangkok, YYYY-MM-DD. */
export const bangkokToday = (now = new Date()) => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Bangkok", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
