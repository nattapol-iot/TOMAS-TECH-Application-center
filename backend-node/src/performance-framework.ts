export const ENGINEERING_AREA_CODES = ["DELIVERY", "QUALITY", "TECHNICAL", "TEAMWORK"] as const;
export const SALES_AREA_CODES = ["PIPELINE", "CUSTOMER", "FORECAST", "COMMERCIAL", "HANDOVER"] as const;
export const PERFORMANCE_ROLES = ["Engineer", "Project Manager", "Engineering Manager", "Sales Engineer", "Sales Manager"] as const;

export type PerformanceAreaCode = typeof ENGINEERING_AREA_CODES[number] | typeof SALES_AREA_CODES[number];
export type PerformanceFrameworkCode = "ENGINEERING" | "SALES";

export const isSalesRole = (role: string) => role === "Sales Engineer" || role === "Sales Manager";

export function frameworkForRole(role: string): { code: PerformanceFrameworkCode; areaCodes: readonly PerformanceAreaCode[] } {
  return isSalesRole(role)
    ? { code: "SALES", areaCodes: SALES_AREA_CODES }
    : { code: "ENGINEERING", areaCodes: ENGINEERING_AREA_CODES };
}

export function canManagePerformanceTarget(actorRole: string, targetRole: string): boolean {
  if (actorRole === "Admin") return true;
  if (actorRole === "Sales Manager") return isSalesRole(targetRole);
  return ["Engineering Manager", "Project Manager"].includes(actorRole) && !isSalesRole(targetRole);
}
