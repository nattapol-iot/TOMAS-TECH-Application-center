import { apiRequest, type ProjectHealth, type ProjectSummary } from "./api-client";
import type { ProjectStatus } from "../../backend-node/src/project-lifecycle";

/**
 * One row of GET /api/v1/projects/overview: the same fields as GET /api/v1/projects, so every
 * project dialog opens from it, plus the schedule summary (backend-node/src/project-health.ts).
 */
export interface ProjectOverviewItem extends ProjectSummary {
  health: ProjectHealth;
  /** Work-day weighted schedule progress, or the typed value while the project has no plan. */
  progress: number;
  progressSource: "schedule" | "manual";
  /** The value typed in Edit project. The edit form starts from this, never from the schedule figure above. */
  typedProgress: number;
  /** Where the plan says progress should be today; null when a counted task has no dates. */
  plannedProgress: number | null;
  planStart: string | null;
  planFinish: string | null;
  forecastFinish: string | null;
  /** Forecast finish minus target delivery in calendar days; positive is late. */
  slipDays: number | null;
  taskCount: number;
  doneCount: number;
  overdueCount: number;
  blockedCount: number;
  slippedCount: number;
  nextMilestone: { name: string; date: string } | null;
  /** The schedule could not be resolved, so the summary fell back to "no plan". */
  scheduleError: boolean;
  /** Day requests nobody has answered yet. */
  pendingRequests: number;
  lastProgressAt: string | null;
  /** The same rule PUT /api/v1/projects/:id applies to a status change. */
  canChangeStatus: boolean;
  /** The stages this project may move to next; never includes the current one. */
  allowedStatuses: ProjectStatus[];
}

export type ProjectOverview = { today: string; items: ProjectOverviewItem[] };

export const projectOverviewPath = (includeClosed = false) => `/api/v1/projects/overview${includeClosed ? "?includeClosed=1" : ""}`;

/** Every project in scope, unpaged: the portfolio sorts and filters in memory. Closed only on request. */
export const listProjectOverview = ({ includeClosed = false }: { includeClosed?: boolean } = {}) =>
  apiRequest<ProjectOverview>(projectOverviewPath(includeClosed));

/** Newest project number first: the order the project pickers list them in. */
export const newestProjectFirst = (a: { number: string }, b: { number: string }) => b.number.localeCompare(a.number, "en", { numeric: true, sensitivity: "base" });

/** Every project in scope, newest number first, for pickers that must not stop at the API page size of 100. */
export const listAllProjectsByNumber = async (includeClosed = true) =>
  [...(await listProjectOverview({ includeClosed })).items].sort(newestProjectFirst);

/** A day request waiting for the signed-in user's answer (GET /api/v1/schedule/day-requests/pending). */
export type PendingDayRequest = {
  id: number; projectId: number; projectNo: string; projectName: string; taskId: number; wbs: string | null; taskName: string;
  requestDays: number; comment: string | null; requestedBy: string; occurredAt: string;
};
export const listPendingDayRequests = () => apiRequest<PendingDayRequest[]>("/api/v1/schedule/day-requests/pending");

/** Open projects in scope that need attention (Delayed or At Risk), for the Projects menu badge. */
export const projectAttention = () => apiRequest<{ delayed: number; atRisk: number; attention: number }>("/api/v1/projects/attention");

/** Schedule rows whose task name, PIC or external PIC matches, across the projects in scope. */
export const searchScheduleTasks = (query: string, includeClosed = false) =>
  apiRequest<{ matches: { projectId: number; taskId: number }[]; truncated: boolean }>(`/api/v1/schedule/search?q=${encodeURIComponent(query)}${includeClosed ? "&includeClosed=1" : ""}`);
