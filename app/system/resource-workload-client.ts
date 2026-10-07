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
