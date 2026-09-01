export const ENGINEERING_AREA_CODES = ["DELIVERY", "QUALITY", "TECHNICAL", "TEAMWORK"];
export const SALES_AREA_CODES = ["PIPELINE", "CUSTOMER", "FORECAST", "COMMERCIAL", "HANDOVER"];
export const PERFORMANCE_ROLES = ["Engineer", "Project Manager", "Engineering Manager", "Sales Engineer", "Sales Manager"];
export const isSalesRole = (role) => role === "Sales Engineer" || role === "Sales Manager";
export function frameworkForRole(role) {
    return isSalesRole(role)
        ? { code: "SALES", areaCodes: SALES_AREA_CODES }
        : { code: "ENGINEERING", areaCodes: ENGINEERING_AREA_CODES };
}
export function canManagePerformanceTarget(actorRole, targetRole) {
    if (actorRole === "Admin")
        return true;
    if (actorRole === "Sales Manager")
        return isSalesRole(targetRole);
    return ["Engineering Manager", "Project Manager"].includes(actorRole) && !isSalesRole(targetRole);
}
//# sourceMappingURL=performance-framework.js.map