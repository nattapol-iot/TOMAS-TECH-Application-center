/** Anything that carries at least a primary role code: a signed-in user, a team member on the screen, a stored actor. */
export type RoleBearer = { role: string; roles?: readonly string[] };

/**
 * Every role the value holds, primary first.
 *
 * `CurrentUserService` always fills `roles` from dbo.user_effective_roles, and so does the bootstrap for the screen's
 * user and team. Actors rebuilt from a stored row — a queued report job, a test double — may carry only the primary
 * role, and those must degrade to that one role rather than throw.
 */
export function rolesOf(user: RoleBearer): string[] {
  if (user.roles?.length) return [...user.roles];
  return user.role ? [user.role] : [];
}

/**
 * True when the user holds any of the given roles, primary or additional.
 *
 * Every role-gated decision goes through here rather than comparing `user.role`,
 * because since migration 051 an additional role carries its full permission set.
 * `user.role` remains the primary role and is still the right value to stamp into
 * an audit row or to route a workflow step by.
 */
export function hasRole(user: RoleBearer, ...codes: string[]): boolean {
  const held = rolesOf(user);
  return codes.some((code) => held.includes(code));
}

/** Who may own an estimate or an inquiry. The routes' SQL names the same roles; the screens pick owners with it. */
export const ESTIMATE_OWNER_ROLES = ["Engineer", "Leader", "Engineering Manager", "Admin"] as const;
