/**
 * Estimate work is assigned per engineering discipline, not per cost category.
 * Keep in sync with backend-node/src/estimate-sections.ts (a test compares them).
 *
 * The two-character code is what dbo.estimate_assignments.section starts with
 * ("03 Electrical"); it reuses the matching cost-category code so existing rows
 * stay valid and the My Work queue keeps resolving the discipline name.
 */
export const ESTIMATE_ASSIGNMENT_SECTIONS = [
  ["03", "Electrical"],
  ["04", "Mechanical"],
  ["02", "Software"],
] as const;

export type EstimateAssignmentSectionCode = (typeof ESTIMATE_ASSIGNMENT_SECTIONS)[number][0];

export const ESTIMATE_ASSIGNMENT_SECTION_CODES: readonly EstimateAssignmentSectionCode[] = ESTIMATE_ASSIGNMENT_SECTIONS.map(([code]) => code);
