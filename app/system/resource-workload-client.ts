import { apiRequest } from "./api-client";
import type { Commitment } from "../../lib/resource-planning";

/** Saved effort for a whole inquiry or estimate (PUT /api/v1/resource-planning/:kind/:id). */
export type WorkloadEffort = { entityType: string; entityId: number; start: string; end: string; manDays: number; rowVersion: string };
/** A person's saved working days a week; anyone without one works the default (lib/resource-planning.ts). */
export type WorkloadCapacity = { userId: number; daysPerWeek: number; rowVersion: string };

/**
 * GET /api/v1/resource-planning/workload (backend-node/src/resource-workload.ts): every open piece of work in the
 * caller's scope, with its person, dates and effort, plus the capacities, effort and holidays it is planned against.
 */
export type Workload = {
  items: Commitment[];
  efforts: WorkloadEffort[];
  capacities: WorkloadCapacity[];
  holidays: string[];
  /** Projects whose schedule could not be resolved; their tasks are missing from items. */
  warnings: string[];
  /** Each person's own order of work, as work keys, kept to the open work in items. */
  priorities: WorkOrder[];
};
export type WorkOrder = { userId: number; keys: string[] };

/** The whole team's workload, or with `mine` only the caller's own work (My Work). */
export const loadWorkload = (options: { mine?: boolean } = {}) =>
  apiRequest<Workload>(`/api/v1/resource-planning/workload${options.mine ? "?mine=1" : ""}`);

/** Saves a person's order of work; the person themself or an Admin / Engineering Manager / Project Manager. */
export const saveWorkOrder = (userId: number, keys: string[]) =>
  apiRequest<WorkOrder>(`/api/v1/resource-planning/work-order/${userId}`, { method: "PUT", body: JSON.stringify({ keys }) });

export type TeamTaskKind = "Appointment" | "Task" | "Away";
/** A whole day, a morning (08:30–12:00), an afternoon (13:00–17:30), or its own time range. */
export type TeamTaskSlot = "Day" | "AM" | "PM" | "Time";
export type TeamTaskStatus = "Planned" | "Done" | "Cancelled";
/** Work added on the team board (dbo.team_tasks, backend-node/src/routes/team-board.ts). */
export type TeamTask = {
  id: number;
  kind: TeamTaskKind;
  title: string;
  customerId: number | null;
  customer: string;
  /** Everyone it is for, in the order chosen; empty: nobody yet, on the board's unassigned row. Each spends the man-days. */
  assigneeIds: number[];
  startDate: string;
  endDate: string;
  slot: TeamTaskSlot;
  /** Only for the Time slot: from startTime on the first day until endTime on the last. */
  startTime: string | null;
  endTime: string | null;
  manDays: number;
  status: TeamTaskStatus;
  inquiryId: number | null;
  /** Empty for someone without inquiry.read. */
  inquiryNo: string;
  projectId: number | null;
  /** Empty for someone without project.read. */
  projectNo: string;
  note: string;
  createdBy: number;
  createdByName: string;
  createdAt: string;
  rowVersion: string;
};
/** What a save sends; the server works out the man-days when they are left empty. */
export type TeamTaskInput = Omit<TeamTask, "id" | "customer" | "inquiryNo" | "projectNo" | "createdBy" | "createdByName" | "createdAt" | "rowVersion" | "manDays"> & { manDays: number | null };
/** A site visit on the board, once per visit with every engineer on it; number and customer are empty without visit.read. */
export type BoardVisit = { id: number; number: string; status: string; customer: string; start: string | null; end: string | null; time: string | null; engineerIds: number[] };
/** Leave or another absence recorded for Site Visit planning (dbo.engineer_availability). */
export type BoardAway = { id: number; userId: number; kind: string; start: string | null; end: string | null };
/**
 * GET /api/v1/team-board: everyone's work (details only of what the reader may open), the team tasks, site visits and
 * days away in the window, and the capacities and holidays the load is worked out against.
 */
export type TeamBoardData = {
  capacities: { userId: number; daysPerWeek: number }[];
  holidays: string[];
  items: Commitment[];
  warnings: string[];
  tasks: TeamTask[];
  visits: BoardVisit[];
  away: BoardAway[];
  /** Admin, Engineering and Project Managers may change anyone's team task. */
  canChangeAll: boolean;
};
export type TeamTaskChange = { action: string; actor: string; at: string; before: Record<string, unknown> | null; after: Record<string, unknown> | null };

/** What the person's Outlook got from a save (an invitation, an update or a cancellation); "none" when nothing was due. */
export type CalendarDelivery = "none" | "sent" | "disabled" | "failed";
export const loadTeamBoard = (from: string, to: string) =>
  apiRequest<TeamBoardData>(`/api/v1/team-board?from=${from}&to=${to}`);
export const createTeamTask = (task: TeamTaskInput) =>
  apiRequest<{ id: number; rowVersion: string; manDays: number; calendar: CalendarDelivery }>("/api/v1/team-tasks", { method: "POST", body: JSON.stringify(task) });
export const updateTeamTask = (id: number, task: TeamTaskInput, rowVersion: string) =>
  apiRequest<{ id: number; rowVersion: string; manDays: number; calendar: CalendarDelivery }>(`/api/v1/team-tasks/${id}`, { method: "PUT", body: JSON.stringify({ ...task, rowVersion }) });
export const deleteTeamTask = (id: number, rowVersion: string) =>
  apiRequest<{ id: number; deleted: true; calendar: CalendarDelivery }>(`/api/v1/team-tasks/${id}?rowVersion=${encodeURIComponent(rowVersion)}`, { method: "DELETE" });
export const loadTeamTaskHistory = (id: number) => apiRequest<TeamTaskChange[]>(`/api/v1/team-tasks/${id}/history`);
/** A saved task back into the shape a save sends. */
export const teamTaskInput = (task: TeamTask): TeamTaskInput => ({
  kind: task.kind, title: task.title, customerId: task.customerId, assigneeIds: [...task.assigneeIds], startDate: task.startDate, endDate: task.endDate,
  slot: task.slot, startTime: task.startTime, endTime: task.endTime, manDays: task.manDays, status: task.status, inquiryId: task.inquiryId, projectId: task.projectId, note: task.note,
});
