/*
 * Names the plan code looks for. Kept in a module with no imports so the schedule summary
 * (project-health.ts) can read them without pulling in the plan writer and its dependency on
 * schedule-service.ts, which would form an import cycle.
 */

/**
 * The heading rows wait under until the project manager files them under a real one: the Team plan
 * rows of a project planned before headings (migration 098), and rows Resource Plan adds.
 */
export const UNSORTED_HEADING = "ยังไม่จัดหัวข้อ";
