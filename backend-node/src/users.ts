import type { FastifyRequest } from "fastify";
import sql from "mssql";
import type { Database } from "./db.js";
import { ApiError } from "./errors.js";
import type { CurrentUser } from "./types.js";

type UserRow = {
  id: number;
  entra_object_id: string | null;
  email: string;
  name: string;
  role: string;
  roles: string | null;
  department: string;
  is_active: boolean;
};

// Role codes are administrator-defined names such as 'Engineering Manager'; none of
// them contains a pipe, so one round trip can carry the whole set.
const ROLE_SEPARATOR = "|";

export class CurrentUserService {
  constructor(private readonly database: Database) {}

  async required(request: FastifyRequest): Promise<CurrentUser> {
    if (request.currentUser) return request.currentUser;
    const identity = request.identity;
    if (!identity) throw new ApiError(401, "unauthenticated", "Authentication is required.");

    const useEmail = identity.mode === "TeamTest";
    const predicate = useEmail ? "u.email = @identity" : "u.entra_object_id = @identity";
    const result = await this.database.query<UserRow>(`
      SELECT TOP (1)
        u.id, u.entra_object_id, u.email, u.name, r.code AS role, u.department, u.is_active,
        (SELECT STRING_AGG(CONVERT(nvarchar(max), er.code), N'|')
         FROM dbo.user_effective_roles er WHERE er.user_id = u.id) AS roles
      FROM dbo.users u
      INNER JOIN dbo.roles r ON r.id = u.role_id
      WHERE ${predicate} AND u.deleted_at IS NULL;
    `, (sqlRequest) => sqlRequest.input("identity", sql.NVarChar(useEmail ? 256 : 64), identity.value));
    const row = result.recordset[0];
    if (!row) throw new ApiError(403, "user_not_registered", "Your account is not registered for IoT Team Center.");

    const user: CurrentUser = {
      id: Number(row.id),
      entraObjectId: row.entra_object_id ?? "",
      email: row.email,
      name: row.name,
      role: row.role,
      // The view excludes disabled accounts, so a disabled user reads back no roles at
      // all. Seeding with the primary role keeps the shape honest for the 403 below.
      roles: [...new Set([row.role, ...(row.roles ?? "").split(ROLE_SEPARATOR).filter(Boolean)])],
      department: row.department,
      isActive: Boolean(row.is_active),
    };
    if (!user.isActive) throw new ApiError(403, "user_disabled", "Your IoT Team Center account is disabled.");
    request.currentUser = user;
    return user;
  }

  async demandPermission(request: FastifyRequest, permission: string): Promise<void> {
    const user = await this.required(request);
    const result = await this.database.query<{ allowed: boolean }>(`
      SELECT CASE WHEN EXISTS (
        SELECT 1 FROM dbo.user_effective_permissions WHERE user_id=@user_id AND code=@permission
      ) THEN CAST(1 AS bit) ELSE CAST(0 AS bit) END AS allowed;
    `, (sqlRequest) => {
      sqlRequest.input("user_id", sql.BigInt, user.id);
      sqlRequest.input("permission", sql.NVarChar(100), permission);
    });
    if (!result.recordset[0]?.allowed) throw new ApiError(403, "permission_denied", `Permission '${permission}' is required.`);
  }
}
