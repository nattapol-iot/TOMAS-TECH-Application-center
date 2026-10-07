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
};

export const loadWorkload = () => apiRequest<Workload>("/api/v1/resource-planning/workload");
