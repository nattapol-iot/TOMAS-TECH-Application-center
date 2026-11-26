import sql from "mssql";
import type { Transaction as TransactionType } from "mssql";
import type { Database } from "./db.js";
import { ApiError } from "./errors.js";
import { mayCreateWithoutEstimate } from "./project-create-access.js";
import { leaderTeamOf, leaderTeamProjectSql } from "./leader-scope.js";
import type { CurrentUser } from "./types.js";
import { rolesOf } from "./user-roles.js";

// A Leader stands as a Project Manager does (owner 2026-11-26, migration 138): sees every project and runs them.
const ELEVATED_ROLES = new Set(["Admin", "Engineering Manager", "Project Manager", "Leader", "Purchasing", "Warehouse", "Inventory Controller"]);
/**
 * Reveal the site credentials of every project. A Leader holds credential.reveal, which a Project Manager does not, so
 * their Project Manager standing does not reach other projects' secrets: they reveal those of the projects they work on.
 */
const CREDENTIAL_ELEVATED_ROLES = new Set([...ELEVATED_ROLES].filter((role) => role !== "Leader"));
const MY_WORK_ELEVATED_ROLES = new Set(["Admin", "Engineering Manager"]);
const PROJECT_MANAGER_ROLES = new Set(["Admin", "Engineering Manager", "Project Manager", "Leader"]);

export function isProjectElevated(user: CurrentUser): boolean {
  return rolesOf(user).some((role) => ELEVATED_ROLES.has(role));
}

/** Whether the reveal scope of site credentials covers every project (site-credentials.ts). */
export function isCredentialElevated(user: CurrentUser): boolean {
  return rolesOf(user).some((role) => CREDENTIAL_ELEVATED_ROLES.has(role));
}

/** Who may move any project's stage and reopen a closed one. Purchasing and stores see every project but do not run them. */
export function isProjectManagerRole(user: CurrentUser): boolean {
  return rolesOf(user).some((role) => PROJECT_MANAGER_ROLES.has(role));
}

/** Who may create a project without an estimate, project.write or not: see project-create-access.ts. */
export function canCreateWithoutEstimate(user: CurrentUser): boolean {
  return mayCreateWithoutEstimate(rolesOf(user), user.department);
}

export function isMyWorkElevated(user: CurrentUser): boolean {
  return rolesOf(user).some((role) => MY_WORK_ELEVATED_ROLES.has(role));
}

export async function demandProjectScope(database: Database, user: CurrentUser, projectId: number, transaction?: TransactionType, myWork = false): Promise<void> {
  const bind = (request: InstanceType<typeof sql.Request>): void => {
    request.input("project_id", sql.BigInt, projectId);
    request.input("actor", sql.BigInt, user.id);
    request.input("elevated", sql.Bit, myWork ? isMyWorkElevated(user) : isProjectElevated(user));
    // A Leader opens every project of the team they lead (leader-scope.ts), and every project since migration 138 gave
    // them a Project Manager's standing; My Work keeps its own narrower rule.
    request.input("leader_team", sql.NVarChar(40), myWork ? "" : leaderTeamOf(user));
  };
  const statement = `
        SELECT CASE WHEN @elevated=1 OR p.manager_id=@actor OR p.lead_engineer_id=@actor
          OR EXISTS(SELECT 1 FROM dbo.project_members m WHERE m.project_id=p.id AND m.user_id=@actor)
          OR ${leaderTeamProjectSql("p")}
          THEN CAST(1 AS bit) ELSE CAST(0 AS bit) END AS allowed
        FROM dbo.projects p WHERE p.id=@project_id AND p.deleted_at IS NULL;
  `;
  let row: { allowed: boolean } | undefined;
  if (transaction) {
    const request = new sql.Request(transaction);
    bind(request);
    row = (await request.query<{ allowed: boolean }>(statement)).recordset[0];
  } else {
    row = (await database.query<{ allowed: boolean }>(statement, bind)).recordset[0];
  }
  if (!row) throw new ApiError(404, "project_not_found", "Project not found.");
  if (!row.allowed) throw new ApiError(403, "project_scope_forbidden", "You are not assigned to this project.");
}
