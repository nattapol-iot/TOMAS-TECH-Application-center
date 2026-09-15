import { randomUUID } from "node:crypto";
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import { connect } from "node:net";
import { dirname, resolve } from "node:path";
import type { FastifyInstance } from "fastify";
import sql from "mssql";
import type { AppConfig } from "../config.js";
import { insertAudit } from "../audit.js";
import type { Database } from "../db.js";
import { canViewEngineeringRates } from "../engineering-rate-access.js";
import { rolesOf } from "../user-roles.js";
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

type EngineeringRateOptionRow = {
  id: number | string;
  level: string;
  department: string;
  engineering_daily: number | string;
  installation_daily: number | string;
  effective_from: Date | string;
  effective_to: Date | string | null;
  is_active: boolean | number;
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

type NasSettingsRow = {
  server_name: string;
  share_name: string;
  destination_path: string;
  username: string;
  updated_at: Date | string;
  updated_by_name: string;
  row_version: Buffer;
};

function nasInput(value: unknown): { server: string; share: string; destinationPath: string; username: string } {
  const body = bodyObject(value);
  const server = requiredText(body.server, 255, "NAS server");
  const share = requiredText(body.share, 255, "NAS share");
  const destinationPath = requiredText(body.destinationPath, 1000, "Destination path")
    .replaceAll("\\", "/").replace(/^\/+|\/+$/g, "");
  const username = requiredText(body.username, 255, "NAS username");
  if (!/^[A-Za-z0-9.-]+$/.test(server)) throw new ApiError(400, "validation_failed", "NAS server must be an IP address or hostname.");
  if ([...share].some((character) => character === "\\" || character === "/" || character.charCodeAt(0) <= 31)) throw new ApiError(400, "validation_failed", "NAS share cannot contain a slash or control character.");
  if (!destinationPath || destinationPath.split("/").some((part) => !part || part === "." || part === "..")) {
    throw new ApiError(400, "validation_failed", "Destination path must contain valid folder names.");
  }
  return { server, share, destinationPath, username };
}

async function tcpCheck(host: string, port: number, timeoutMs = 5000): Promise<number> {
  const started = Date.now();
  await new Promise<void>((resolvePromise, reject) => {
    const socket = connect({ host, port });
    const done = (error?: Error) => { socket.destroy(); if (error) reject(error); else resolvePromise(); };
    socket.setTimeout(timeoutMs, () => done(new Error("Connection timed out")));
    socket.once("connect", () => done());
    socket.once("error", done);
  });
  return Date.now() - started;
}

async function storageCheck(storage: AppConfig["documentStorage"]) {
  const testPath = resolve(storage.rootPath, `_health-check-${randomUUID()}.tmp`);
  const payload = `IoTTeamCenter storage check ${new Date().toISOString()}`;
  const start = Date.now();
  try {
    await mkdir(dirname(testPath), { recursive: true });
    await writeFile(testPath, payload, "utf8");
    const read = await readFile(testPath, "utf8");
    await unlink(testPath);
    if (read !== payload) throw new Error("Read-back content mismatch");
    return { ok: true, mode: storage.mode, rootPath: storage.rootPath, durationMs: Date.now() - start };
  } catch (err) {
    try { await unlink(testPath); } catch { /* ignore */ }
    return { ok: false, mode: storage.mode, rootPath: storage.rootPath, durationMs: Date.now() - start, error: String(err instanceof Error ? err.message : err) };
  }
}

type AccessRoleRow = { id: number | string; code: string; name: string; description: string };
type UserRoleRow = { id: number | string; name: string; email: string; role: string; row_version: Buffer };
type AdditionalRoleRow = {
  code: string; name: string; description: string; granted_at: Date | string;
  granted_by_name: string; reason: string;
};

export function registerAdminRoutes(app: FastifyInstance, config: AppConfig, database: Database, users: CurrentUserService): void;
export function registerAdminRoutes(app: FastifyInstance, database: Database, users: CurrentUserService): void;
export function registerAdminRoutes(
  app: FastifyInstance,
  configOrDatabase: AppConfig | Database,
  databaseOrUsers: Database | CurrentUserService,
  maybeUsers?: CurrentUserService,
): void {
  const config = maybeUsers ? configOrDatabase as AppConfig : undefined;
  const database = (maybeUsers ? databaseOrUsers : configOrDatabase) as Database;
  const users = (maybeUsers ?? databaseOrUsers) as CurrentUserService;
  // Storage health: write a temp file, read it back, delete it — proves end-to-end write access.
  app.get("/api/v1/admin/storage-check", async (request) => {
    await users.demandPermission(request, "master.read");
    if (!config) throw new ApiError(503, "storage_unavailable", "Document storage is unavailable.");
    return storageCheck(config.documentStorage);
  });

  app.get("/api/v1/admin/nas-settings", async (request) => {
    await users.demandPermission(request, "master.read");
    if (!config) throw new ApiError(503, "storage_unavailable", "Document storage is unavailable.");
    const result = await database.query<NasSettingsRow>(`
      SELECT setting.server_name, setting.share_name, setting.destination_path, setting.username,
             setting.updated_at, updater.name AS updated_by_name, setting.row_version
      FROM dbo.nas_storage_settings setting
      INNER JOIN dbo.users updater ON updater.id=setting.updated_by
      WHERE setting.id=1;
    `);
    const row = result.recordset[0];
    return {
      active: { mode: config.documentStorage.mode, rootPath: config.documentStorage.rootPath },
      draft: row ? {
        server: row.server_name, share: row.share_name, destinationPath: row.destination_path,
        username: row.username, updatedAt: row.updated_at, updatedByName: row.updated_by_name,
        rowVersion: row.row_version.toString("base64"),
      } : null,
    };
  });

  app.put("/api/v1/admin/nas-settings", async (request) => {
    await users.demandPermission(request, "master.write");
    if (!config) throw new ApiError(503, "storage_unavailable", "Document storage is unavailable.");
    const actor = await users.required(request);
    const input = nasInput(request.body);
    const result = await database.query<NasSettingsRow>(`
      MERGE dbo.nas_storage_settings WITH (HOLDLOCK) AS target
      USING (SELECT CAST(1 AS tinyint) AS id) AS source ON target.id=source.id
      WHEN MATCHED THEN UPDATE SET server_name=@server,share_name=@share,destination_path=@path,
        username=@username,updated_by=@actor,updated_at=SYSUTCDATETIME()
      WHEN NOT MATCHED THEN INSERT(id,server_name,share_name,destination_path,username,updated_by)
        VALUES(1,@server,@share,@path,@username,@actor)
      OUTPUT inserted.server_name,inserted.share_name,inserted.destination_path,inserted.username,
        inserted.updated_at,CAST(@actor_name AS nvarchar(300)) updated_by_name,inserted.row_version;
    `, (bind) => bind.input("server", sql.NVarChar(255), input.server)
      .input("share", sql.NVarChar(255), input.share)
      .input("path", sql.NVarChar(1000), input.destinationPath)
      .input("username", sql.NVarChar(255), input.username)
      .input("actor", sql.BigInt, actor.id)
      .input("actor_name", sql.NVarChar(300), actor.name));
    const row = result.recordset[0]!;
    return { server: row.server_name, share: row.share_name, destinationPath: row.destination_path,
      username: row.username, updatedAt: row.updated_at, updatedByName: row.updated_by_name,
      rowVersion: row.row_version.toString("base64") };
  });

  app.post("/api/v1/admin/nas-settings/test", async (request) => {
    await users.demandPermission(request, "master.read");
    const input = nasInput(request.body);
    try {
      const durationMs = await tcpCheck(input.server, 445);
      return { ok: true, durationMs, uncPath: `\\\\${input.server}\\${input.share}\\${input.destinationPath.replaceAll("/", "\\")}` };
    } catch (error) {
      return { ok: false, durationMs: 5000, error: String(error instanceof Error ? error.message : error) };
    }
  });
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

  app.get("/api/v1/admin/users/:id/roles", async (request) => {
    await users.demandPermission(request, "admin.manage_roles");
    const id = positiveLong((request.params as { id?: string }).id, "User id");
    const account = await database.query<{ role: string; row_version: Buffer }>(`
      SELECT role.code AS role, app_user.row_version
      FROM dbo.users app_user
      INNER JOIN dbo.roles role ON role.id=app_user.role_id
      WHERE app_user.id=@id AND app_user.is_active=1 AND app_user.deleted_at IS NULL;
    `, (sqlRequest) => sqlRequest.input("id", sql.BigInt, id));
    const row = account.recordset[0];
    if (!row) throw new ApiError(404, "user_not_found", "The active user account was not found.");
    const extra = await database.query<AdditionalRoleRow>(`
      SELECT role.code,role.name,role.description,grant_row.granted_at,granter.name AS granted_by_name,grant_row.reason
      FROM dbo.user_business_roles grant_row
      INNER JOIN dbo.roles role ON role.id=grant_row.role_id
      INNER JOIN dbo.users granter ON granter.id=grant_row.granted_by
      WHERE grant_row.user_id=@id AND grant_row.revoked_at IS NULL AND role.is_active=1
      ORDER BY role.name,role.code;
    `, (sqlRequest) => sqlRequest.input("id", sql.BigInt, id));
    return {
      primaryRole: row.role,
      rowVersion: row.row_version.toString("base64"),
      additional: extra.recordset.map((item) => ({
        code: item.code, name: item.name, description: item.description,
        grantedAt: item.granted_at, grantedByName: item.granted_by_name, reason: item.reason,
      })),
    };
  });

  app.post("/api/v1/admin/users/:id/roles", async (request, reply) => {
    await users.demandPermission(request, "admin.manage_roles");
    const actor = await users.required(request);
    const id = positiveLong((request.params as { id?: string }).id, "User id");
    const body = bodyObject(request.body);
    const roleCode = requiredText(body.roleCode, 50, "Role");
    const reason = requiredText(body.reason, 1000, "Reason");
    return database.transaction(async (transaction) => {
      const accountRequest = new sql.Request(transaction);
      accountRequest.input("id", sql.BigInt, id);
      const account = (await accountRequest.query<{ name: string; email: string; role: string }>(`
        SELECT app_user.name,app_user.email,role.code AS role
        FROM dbo.users app_user WITH (UPDLOCK,HOLDLOCK)
        INNER JOIN dbo.roles role ON role.id=app_user.role_id
        WHERE app_user.id=@id AND app_user.is_active=1 AND app_user.deleted_at IS NULL;
      `)).recordset[0];
      if (!account) throw new ApiError(404, "user_not_found", "The active user account was not found.");

      const roleRequest = new sql.Request(transaction);
      roleRequest.input("role", sql.NVarChar(50), roleCode);
      const role = (await roleRequest.query<AccessRoleRow>(`
        SELECT id,code,name,description FROM dbo.roles WITH (UPDLOCK,HOLDLOCK) WHERE code=@role AND is_active=1;
      `)).recordset[0];
      if (!role) throw new ApiError(422, "invalid_role", "Select an active application role.");
      if (account.role === role.code) throw new ApiError(422, "already_primary_role", "That is already this account's primary role.");

      const grant = new sql.Request(transaction);
      grant.input("id", sql.BigInt, id); grant.input("role_id", sql.BigInt, Number(role.id));
      grant.input("actor", sql.BigInt, actor.id); grant.input("reason", sql.NVarChar(1000), reason);
      const applied = await grant.query<{ applied: number }>(`
        DECLARE @revived int;
        UPDATE dbo.user_business_roles
        SET revoked_at=NULL,granted_by=@actor,granted_at=SYSUTCDATETIME(),reason=@reason
        WHERE user_id=@id AND role_id=@role_id AND revoked_at IS NOT NULL;
        SET @revived=@@ROWCOUNT;
        DECLARE @inserted int=0;
        IF @revived=0 AND NOT EXISTS(SELECT 1 FROM dbo.user_business_roles WHERE user_id=@id AND role_id=@role_id)
        BEGIN
          INSERT dbo.user_business_roles(user_id,role_id,granted_by,reason) VALUES(@id,@role_id,@actor,@reason);
          SET @inserted=@@ROWCOUNT;
        END;
        SELECT @revived+@inserted AS applied;
      `);
      if (Number(applied.recordset[0]?.applied ?? 0) === 0) {
        throw new ApiError(409, "role_already_granted", "This account already holds that additional role.");
      }
      await insertAudit(transaction, actor.id, "UserAccount", id, String(id), "Additional role granted",
        null, { name: account.name, email: account.email, roleCode: role.code, reason });
      return reply.status(201).send({ userId: id, roleCode: role.code });
    });
  });

  app.delete("/api/v1/admin/users/:id/roles/:roleCode", async (request, reply) => {
    await users.demandPermission(request, "admin.manage_roles");
    const actor = await users.required(request);
    const id = positiveLong((request.params as { id?: string }).id, "User id");
    const roleCode = requiredText((request.params as { roleCode?: string }).roleCode, 50, "Role");
    await database.transaction(async (transaction) => {
      const revoke = new sql.Request(transaction);
      revoke.input("id", sql.BigInt, id); revoke.input("role", sql.NVarChar(50), roleCode);
      revoke.input("actor", sql.BigInt, actor.id);
      const result = await revoke.query(`
        UPDATE grant_row SET revoked_at=SYSUTCDATETIME()
        FROM dbo.user_business_roles grant_row
        INNER JOIN dbo.roles role ON role.id=grant_row.role_id
        WHERE grant_row.user_id=@id AND role.code=@role AND grant_row.revoked_at IS NULL;
      `);
      if (result.rowsAffected[0] === 0) throw new ApiError(404, "role_not_granted", "This account does not hold that additional role.");
      await insertAudit(transaction, actor.id, "UserAccount", id, String(id), "Additional role revoked",
        { roleCode }, null);
    });
    return reply.status(204).send();
  });

  app.get("/api/v1/admin/engineering-rates", async (request) => {
    await users.demandPermission(request, "master.read");
    const actor = await users.required(request);
    if (!rolesOf(actor).some(canViewEngineeringRates)) {
      throw new ApiError(403, "engineering_rate_management_required", "Management-level access is required to view engineering rates.");
    }
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

  app.get("/api/v1/estimates/engineering-rate-options", async (request) => {
    await users.demandPermission(request, "estimate.write");
    const query = request.query as Record<string, unknown>;
    const page = clampedInteger(query.page, 1, 1, 1_000_000);
    const pageSize = clampedInteger(query.pageSize, 100, 1, 100);
    const result = await database.query<EngineeringRateOptionRow>(`
      SELECT
        rate.id, rate.level, rate.department,
        rate.engineering_daily, rate.installation_daily,
        rate.effective_from, rate.effective_to, rate.is_active,
        COUNT_BIG(*) OVER() AS total_count
      FROM dbo.engineering_rates rate
      WHERE rate.is_active = 1
      ORDER BY rate.department, rate.level, rate.effective_from DESC, rate.id DESC
      OFFSET @offset ROWS FETCH NEXT @page_size ROWS ONLY;
    `, (sqlRequest) => {
      sqlRequest.input("offset", sql.BigInt, (page - 1) * pageSize);
      sqlRequest.input("page_size", sql.Int, pageSize);
    });
    const rows = result.recordset;
    return {
      items: rows.map((row) => ({
        id: Number(row.id), level: row.level, department: row.department,
        engineeringDaily: Number(row.engineering_daily), installationDaily: Number(row.installation_daily),
        effectiveFrom: dateOnly(row.effective_from), effectiveTo: dateOnly(row.effective_to),
        isActive: Boolean(row.is_active),
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
