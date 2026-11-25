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
export function canManagePerformanceTarget(actorRole: string, targetRole: string, actorTeam: string, targetTeam: string): boolean {
  if (actorRole === "Admin") return true;
  if (actorRole === "Sales Manager") return isSalesRole(targetRole);
  return ["Engineering Manager", "Project Manager"].includes(actorRole) && !isSalesRole(targetRole) && sameTeam(actorTeam, targetTeam);
}
