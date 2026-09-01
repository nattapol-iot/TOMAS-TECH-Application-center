export declare const ENGINEERING_AREA_CODES: readonly ["DELIVERY", "QUALITY", "TECHNICAL", "TEAMWORK"];
export declare const SALES_AREA_CODES: readonly ["PIPELINE", "CUSTOMER", "FORECAST", "COMMERCIAL", "HANDOVER"];
export declare const PERFORMANCE_ROLES: readonly ["Engineer", "Project Manager", "Engineering Manager", "Sales Engineer", "Sales Manager"];
export type PerformanceAreaCode = typeof ENGINEERING_AREA_CODES[number] | typeof SALES_AREA_CODES[number];
export type PerformanceFrameworkCode = "ENGINEERING" | "SALES";
export declare const isSalesRole: (role: string) => role is "Sales Engineer" | "Sales Manager";
export declare function frameworkForRole(role: string): {
    code: PerformanceFrameworkCode;
    areaCodes: readonly PerformanceAreaCode[];
};
export declare function canManagePerformanceTarget(actorRole: string, targetRole: string): boolean;
