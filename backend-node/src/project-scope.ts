import sql from "mssql/msnodesqlv8.js";
import type { Transaction as TransactionType } from "mssql";
import type { Database } from "./db.js";
import { ApiError } from "./errors.js";
import type { CurrentUser } from "./types.js";

const ELEVATED_ROLES = new Set(["Admin", "Engineering Manager", "Project Manager", "Purchasing", "Warehouse", "Inventory Controller"]);
const MY_WORK_ELEVATED_ROLES = new Set(["Admin", "Engineering Manager"]);

export function isProjectElevated(user: CurrentUser): boolean {
  return ELEVATED_ROLES.has(user.role);
}

export function isMyWorkElevated(user: CurrentUser): boolean {
  return MY_WORK_ELEVATED_ROLES.has(user.role);
}

export async function demandProjectScope(
  database: Database,
  user: CurrentUser,
  projectId: number,
  transaction?: TransactionType,
  myWork = false,
): Promise<void> {
  const bind = (request: InstanceType<typeof sql.Request>): void => {
      request.input("project_id", sql.BigInt, projectId);
      request.input("actor", sql.BigInt, user.id);
      request.input("elevated", sql.Bit, myWork ? isMyWorkElevated(user) : isProjectElevated(user));
  };
  const statement = `
        SELECT CASE WHEN @elevated=1 OR p.manager_id=@actor OR p.lead_engineer_id=@actor
          OR EXISTS(SELECT 1 FROM dbo.project_members m WHERE m.project_id=p.id AND m.user_id=@actor)
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
