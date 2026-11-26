import { sameTeam } from "./team-scope.js";

export const ENGINEERING_AREA_CODES = ["DELIVERY", "QUALITY", "TECHNICAL", "TEAMWORK"] as const;
export const SALES_AREA_CODES = ["PIPELINE", "CUSTOMER", "FORECAST", "COMMERCIAL", "HANDOVER"] as const;
export const PERFORMANCE_ROLES = ["Engineer", "Leader", "Project Manager", "Engineering Manager", "Sales Engineer", "Sales Manager"] as const;

export type PerformanceAreaCode = (typeof ENGINEERING_AREA_CODES)[number] | (typeof SALES_AREA_CODES)[number];
export type PerformanceFrameworkCode = "ENGINEERING" | "SALES";

export const isSalesRole = (role: string) => role === "Sales Engineer" || role === "Sales Manager";

export function frameworkForRole(role: string): { code: PerformanceFrameworkCode; areaCodes: readonly PerformanceAreaCode[] } {
  return isSalesRole(role) ? { code: "SALES", areaCodes: SALES_AREA_CODES } : { code: "ENGINEERING", areaCodes: ENGINEERING_AREA_CODES };
}

/** Roles that lead others: a Leader assesses only team members who hold none of them. */
export const LEAD_ROLES = ["Leader", "Project Manager", "Engineering Manager", "Sales Manager", "Management", "Admin"] as const;

/** SQL that is true when the user row aliased `user` holds a role that leads others, primary or additional. */
export const leadsOthersSql = (user: string): string =>
  `EXISTS(SELECT 1 FROM dbo.user_effective_roles lead_role WHERE lead_role.user_id=${user}.id AND lead_role.code IN(${LEAD_ROLES.map((role) => `N'${role}'`).join(",")}))`;

/**
 * The role a person is reviewed under, as SQL that binds `role.code` for the user row named `user` (2026-11-25): their
 * primary role when it has a KPI framework; otherwise the first additional role that has one, in name order (an additional
 * role carries its full meaning since migration 051); otherwise their primary role, which the KPI roster then leaves out.
 */
export function kpiRoleSql(user: string): string {
  const codes = PERFORMANCE_ROLES.map((role) => `N'${role}'`).join(",");
  return `CROSS APPLY (SELECT COALESCE(
        (SELECT TOP (1) held.code FROM dbo.user_effective_roles held WHERE held.user_id=${user}.id AND held.code IN(${codes})
          ORDER BY CASE WHEN held.role_id=${user}.role_id THEN 0 ELSE 1 END,held.code),
        (SELECT primary_role.code FROM dbo.roles primary_role WHERE primary_role.id=${user}.role_id)) code) role`;
}

// Engineering Managers and Project Managers review their own team only (see team-scope.ts), so
// the IoT, Application and Mechanical teams cannot read or score each other's people. Admin
// reviews everyone.
// targetLeads: the target holds a role that leads others (LEAD_ROLES), primary or additional.
export function canManagePerformanceTarget(actorRole: string, targetRole: string, actorTeam: string, targetTeam: string, targetLeads = false): boolean {
  if (actorRole === "Admin") return true;
  if (actorRole === "Sales Manager") return isSalesRole(targetRole);
  // A Leader assesses the Engineers of their own team (owner 2026-11-26), not other Leaders or managers - also when a
  // peer's Leader role is an additional one on top of Engineer.
  if (actorRole === "Leader") return targetRole === "Engineer" && !targetLeads && sameTeam(actorTeam, targetTeam);
  return ["Engineering Manager", "Project Manager"].includes(actorRole) && !isSalesRole(targetRole) && sameTeam(actorTeam, targetTeam);
}
