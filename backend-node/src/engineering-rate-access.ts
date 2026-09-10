import { DASHBOARD_ROLES } from "./executive-dashboard-model.js";

/** Roles treated as management-level for viewing confidential rate masters. */
export const ENGINEERING_RATE_VIEW_ROLES = DASHBOARD_ROLES;

/** Rate changes remain limited to the accountable engineering administrators. */
export const ENGINEERING_RATE_MANAGE_ROLES = ["Admin", "Engineering Manager"] as const;

export function canViewEngineeringRates(role: string): boolean {
  return ENGINEERING_RATE_VIEW_ROLES.includes(role);
}

export function canManageEngineeringRates(role: string): boolean {
  return ENGINEERING_RATE_MANAGE_ROLES.some((allowedRole) => allowedRole === role);
}
