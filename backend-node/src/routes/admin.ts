import type { FastifyInstance } from "fastify";
import sql from "mssql/msnodesqlv8.js";
import { insertAudit } from "../audit.js";
import type { Database } from "../db.js";
import { ApiError } from "../errors.js";
import { bodyObject, booleanQuery, clampedInteger, dateOnly, optionalText, parseRowVersion, positiveLong, requiredText } from "../http.js";
import type { CurrentUserService } from "../users.js";

type EngineeringRateRow = {
  id: number | string;
  level: string;
  department: string;
  engineering_hourly: number | string;
  engineering_daily: number | string;
  installation_hourly: number | string;
  installation_daily: number | string;
  effective_from: Date | string;
  effective_to: Date | string | null;
  is_active: boolean | number;
  created_by_name: string;
  created_at: Date | string;
  row_version: Buffer;
  total_count: number | string;
};

type AuditRow = {
  source: string;
  id: number | string;
  actor_id: number | string;
  actor_name: string;
  actor_role: string;
  action: string;
  entity_type: string;
  entity_id: number | string;
  entity_no: string;
  quantity: number | string | null;
  project_id: number | string | null;
  reason: string | null;
  before_json: string | null;
  after_json: string | null;
  occurred_at: Date | string;
  total_count: number | string;
};

type AccessRoleRow = { id: number | string; code: string; name: string; description: string };
type UserRoleRow = { id: number | string; name: string; email: string; role: string; row_version: Buffer };

export function registerAdminRoutes(app: FastifyInstance, database: Database, users: CurrentUserService): void {
  app.get("/api/v1/admin/roles", async (request) => {
    await users.demandPermission(request, "admin.manage_roles");
    const result = await database.query<AccessRoleRow>(`
      SELECT id,code,name,description
      FROM dbo.roles
      WHERE is_active=1
      ORDER BY CASE WHEN code=N'Admin' THEN 0 ELSE 1 END,name,code;
    `);
    return { items: result.recordset.map((row) => ({ id: Number(row.id), code: row.code, name: row.name, description: row.description })) };
  });

  app.put("/api/v1/admin/users/:id/role", async (request) => {
    await users.demandPermission(request, "admin.manage_roles");
    const actor = await users.required(request);
    const id = positiveLong((request.params as { id?: string }).id, "User id");
    const body = bodyObject(request.body);
    const roleCode = requiredText(body.roleCode, 50, "Role");
    const rowVersion = parseRowVersion(body.rowVersion);
    return database.transaction(async (transaction) => {
      const currentRequest = new sql.Request(transaction);
      currentRequest.input("id", sql.BigInt, id);
      const current = (await currentRequest.query<UserRoleRow>(`
        SELECT app_user.id,app_user.name,app_user.email,role.code AS role,app_user.row_version
        FROM dbo.users app_user WITH (UPDLOCK,HOLDLOCK)
        INNER JOIN dbo.roles role ON role.id=app_user.role_id
        WHERE app_user.id=@id AND app_user.is_active=1 AND app_user.deleted_at IS NULL;
      `)).recordset[0];
      if (!current) throw new ApiError(404, "user_not_found", "The active user account was not found.");

      const roleRequest = new sql.Request(transaction);
      roleRequest.input("role", sql.NVarChar(50), roleCode);
      const nextRole = (await roleRequest.query<AccessRoleRow>(`
        SELECT id,code,name,description FROM dbo.roles WITH (UPDLOCK,HOLDLOCK)
        WHERE code=@role AND is_active=1;
      `)).recordset[0];
      if (!nextRole) throw new ApiError(422, "invalid_role", "Select an active application role.");
      if (!current.row_version.equals(rowVersion)) throw new ApiError(409, "concurrency_conflict", "This user account changed. Refresh and try again.");
      if (current.role === nextRole.code) return { id, role: current.role, rowVersion: current.row_version.toString("base64") };

      if (current.role === "Admin" && nextRole.code !== "Admin") {
        const adminCount = (await new sql.Request(transaction).query<{ count: number | string }>(`
          SELECT COUNT_BIG(*) AS count
          FROM dbo.users app_user WITH (UPDLOCK,HOLDLOCK)
          INNER JOIN dbo.roles role ON role.id=app_user.role_id
          WHERE role.code=N'Admin' AND app_user.is_active=1 AND app_user.deleted_at IS NULL;
        `)).recordset[0]?.count ?? 0;
        if (Number(adminCount) <= 1) throw new ApiError(409, "last_admin_required", "Assign another active Admin before changing the last Admin account.");
      }

      const update = new sql.Request(transaction);
      update.input("id", sql.BigInt, id);
      update.input("role_id", sql.BigInt, Number(nextRole.id));
      update.input("row_version", sql.VarBinary(8), rowVersion);
      const saved = (await update.query<{ row_version: Buffer }>(`
        UPDATE dbo.users SET role_id=@role_id,updated_at=SYSUTCDATETIME()
        OUTPUT inserted.row_version
        WHERE id=@id AND is_active=1 AND deleted_at IS NULL AND row_version=@row_version;
      `)).recordset[0];
      if (!saved) throw new ApiError(409, "concurrency_conflict", "This user account changed. Refresh and try again.");
      await insertAudit(transaction, actor.id, "UserAccount", id, String(id), "Primary role changed",
        { name: current.name, email: current.email, role: current.role },
        { name: current.name, email: current.email, role: nextRole.code });
      return { id, role: nextRole.code, rowVersion: saved.row_version.toString("base64") };
    });
  });

  app.get("/api/v1/admin/engineering-rates", async (request) => {
    await users.demandPermission(request, "master.read");
    const query = request.query as Record<string, unknown>;
    const page = clampedInteger(query.page, 1, 1, 1_000_000);
    const pageSize = clampedInteger(query.pageSize, 25, 1, 100);
    const search = optionalText(query.search, 200, "Search");
    const activeOnly = booleanQuery(query.activeOnly);
    const result = await database.query<EngineeringRateRow>(`
      SELECT
        rate.id, rate.level, rate.department,
        rate.engineering_hourly, rate.engineering_daily,
        rate.installation_hourly, rate.installation_daily,
        rate.effective_from, rate.effective_to, rate.is_active,
        creator.name AS created_by_name, rate.created_at, rate.row_version,
        COUNT_BIG(*) OVER() AS total_count
      FROM dbo.engineering_rates rate
      INNER JOIN dbo.users creator ON creator.id = rate.created_by
      WHERE (@active_only = 0 OR rate.is_active = 1)
        AND (@search IS NULL
             OR rate.level LIKE N'%' + @search + N'%'
             OR rate.department LIKE N'%' + @search + N'%'
             OR creator.name LIKE N'%' + @search + N'%')
      ORDER BY rate.effective_from DESC, rate.id DESC
      OFFSET @offset ROWS FETCH NEXT @page_size ROWS ONLY;
    `, (sqlRequest) => {
      sqlRequest.input("active_only", sql.Bit, activeOnly);
      sqlRequest.input("search", sql.NVarChar(200), search);
      sqlRequest.input("offset", sql.BigInt, (page - 1) * pageSize);
      sqlRequest.input("page_size", sql.Int, pageSize);
    });
    const rows = result.recordset;
    return {
      items: rows.map((row) => ({
        id: Number(row.id), level: row.level, department: row.department,
        engineeringHourly: Number(row.engineering_hourly), engineeringDaily: Number(row.engineering_daily),
        installationHourly: Number(row.installation_hourly), installationDaily: Number(row.installation_daily),
        effectiveFrom: dateOnly(row.effective_from), effectiveTo: dateOnly(row.effective_to),
        isActive: Boolean(row.is_active), createdByName: row.created_by_name, createdAt: row.created_at,
        rowVersion: row.row_version.toString("base64"),
      })),
      page,
      pageSize,
      total: Number(rows[0]?.total_count ?? 0),
    };
  });

  app.get("/api/v1/admin/audit", async (request) => {
    await users.demandPermission(request, "audit.read");
    const query = request.query as Record<string, unknown>;
    const page = clampedInteger(query.page, 1, 1, 1_000_000);
    const pageSize = clampedInteger(query.pageSize, 50, 1, 100);
    const search = optionalText(query.search, 200, "Search");
    const source = optionalText(query.source, 20, "Audit source");
    const entityType = optionalText(query.entityType, 50, "Entity type");
    if (source !== null && source !== "Core" && source !== "Material") {
      throw new ApiError(400, "validation_failed", "Audit source must be Core or Material.");
    }
    const result = await database.query<AuditRow>(`
      WITH combined_audit AS (
        SELECT
          CAST(N'Core' AS nvarchar(20)) AS source,
          audit.id, audit.actor_id, actor.name AS actor_name,
          CAST(N'Current role: ' + role.code AS nvarchar(100)) AS actor_role,
          audit.action, audit.entity_type, audit.entity_id, audit.entity_no,
          CAST(NULL AS decimal(19,4)) AS quantity,
          CAST(NULL AS bigint) AS project_id,
          audit.reason, audit.before_json, audit.after_json, audit.occurred_at
        FROM dbo.audit_log audit
        INNER JOIN dbo.users actor ON actor.id = audit.actor_id
        INNER JOIN dbo.roles role ON role.id = actor.role_id

        UNION ALL

        SELECT
          CAST(N'Material' AS nvarchar(20)) AS source,
          audit.id, audit.actor_id, actor.name AS actor_name, audit.actor_role,
          audit.action, audit.entity_type, audit.entity_id, audit.entity_no,
          audit.qty, audit.project_id,
          audit.reason, audit.before_json, audit.after_json, audit.occurred_at
        FROM dbo.mat_audit audit
        INNER JOIN dbo.users actor ON actor.id = audit.actor_id
      )
      SELECT
        source, id, actor_id, actor_name, actor_role,
        action, entity_type, entity_id, entity_no,
        quantity, project_id, reason, before_json, after_json, occurred_at,
        COUNT_BIG(*) OVER() AS total_count
      FROM combined_audit
      WHERE (@source IS NULL OR source = @source)
        AND (@entity_type IS NULL OR entity_type = @entity_type)
        AND (@search IS NULL
             OR entity_no LIKE N'%' + @search + N'%'
             OR entity_type LIKE N'%' + @search + N'%'
             OR action LIKE N'%' + @search + N'%'
             OR actor_name LIKE N'%' + @search + N'%'
             OR reason LIKE N'%' + @search + N'%')
      ORDER BY occurred_at DESC, source, id DESC
      OFFSET @offset ROWS FETCH NEXT @page_size ROWS ONLY;
    `, (sqlRequest) => {
      sqlRequest.input("source", sql.NVarChar(20), source);
      sqlRequest.input("entity_type", sql.NVarChar(50), entityType);
      sqlRequest.input("search", sql.NVarChar(200), search);
      sqlRequest.input("offset", sql.BigInt, (page - 1) * pageSize);
      sqlRequest.input("page_size", sql.Int, pageSize);
    });
    const rows = result.recordset;
    return {
      items: rows.map((row) => ({
        source: row.source, id: Number(row.id), actorId: Number(row.actor_id), actorName: row.actor_name,
        actorRole: row.actor_role, action: row.action, entityType: row.entity_type,
        entityId: Number(row.entity_id), entityNumber: row.entity_no,
        quantity: row.quantity === null ? null : Number(row.quantity),
        projectId: row.project_id === null ? null : Number(row.project_id), reason: row.reason,
        beforeJson: row.before_json, afterJson: row.after_json, occurredAt: row.occurred_at,
      })),
      page,
      pageSize,
      total: Number(rows[0]?.total_count ?? 0),
    };
  });
}
