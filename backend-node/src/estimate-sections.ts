/**
 * Estimate work is assigned per engineering discipline, not per cost category.
 * Keep in sync with lib/estimate-sections.ts on the front end (a test compares them).
 *
 * An engineer who owns or supports any of these sections may edit every cost
 * ledger of the estimate; the section only records who is responsible.
 */
export const ESTIMATE_ASSIGNMENT_SECTIONS = [
  ["03", "Electrical"],
  ["04", "Mechanical"],
  ["02", "Software"],
] as const;

export type EstimateAssignmentSectionCode = (typeof ESTIMATE_ASSIGNMENT_SECTIONS)[number][0];

export const ESTIMATE_ASSIGNMENT_SECTION_CODES: readonly EstimateAssignmentSectionCode[] = ESTIMATE_ASSIGNMENT_SECTIONS.map(([code]) => code);
