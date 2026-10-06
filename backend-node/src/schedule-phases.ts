/*
 * Names of the phases a new project's plan is created with. Kept in a module with no imports so the
 * schedule summary (project-health.ts) can read them without pulling in the plan writer and its
 * dependency on schedule-service.ts, which would form an import cycle.
 */

/** The customer-facing milestone phase: a timeline frame, not work that counts towards progress. */
export const MASTER_PLAN_PHASE = "Master Plan";
