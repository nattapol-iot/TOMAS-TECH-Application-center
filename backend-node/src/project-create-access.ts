/*
 * Who may create a project. No server code is imported here, so the Projects screen reads the same rule as the API.
 *
 * Owner decision 2026-10-14: a project may be created without an estimate by the Application team, who do not make an
 * Estimate Cost, by Project Managers and by Admins. The team is read from the department, whose names vary ("Application
 * Engineer Dept.", group suffixes such as 1G / 2G), so any department naming Application counts.
 *
 * Owner decision 2026-11-25: the Application team needs no project.write for that; their accounts are mostly Engineers, who
 * do not hold it, so the button never showed. A project from an approved estimate still needs project.write.
 */

/** A department of the Application team, however it is spelled. */
export const isApplicationTeam = (department: string | null | undefined): boolean => /application/i.test(department ?? "");

/**
 * Creates a project without an estimate: a Project Manager, a Leader (a Project Manager's rights since migration 138) or
 * an Admin (any held role), or a member of the Application team.
 * A Viewer stays read-only there too.
 */
export const mayCreateWithoutEstimate = (roles: readonly string[], department: string | null | undefined): boolean =>
  roles.some((role) => role === "Project Manager" || role === "Leader" || role === "Admin") || (isApplicationTeam(department) && roles.some((role) => role !== "Viewer"));

/** Creates a project from an approved estimate. */
export const mayCreateFromEstimate = (permissions: readonly string[]): boolean => permissions.includes("project.write");

/** Sees Create project: allowed one way or the other. */
export const mayCreateProject = (permissions: readonly string[], roles: readonly string[], department: string | null | undefined): boolean =>
  mayCreateFromEstimate(permissions) || mayCreateWithoutEstimate(roles, department);
