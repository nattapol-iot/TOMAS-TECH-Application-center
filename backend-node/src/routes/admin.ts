import { randomUUID } from "node:crypto";
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import type { FastifyInstance } from "fastify";
import sql from "mssql";
import type { AppConfig } from "../config.js";
import type { Database } from "../db.js";
import { ApiError } from "../errors.js";
import { booleanQuery, clampedInteger, dateOnly, optionalText } from "../http.js";
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

export function registerAdminRoutes(app: FastifyInstance, config: AppConfig, database: Database, users: CurrentUserService): void {
  // Storage health: write a temp file, read it back, delete it — proves end-to-end write access.
  app.get("/api/v1/admin/storage-check", async (request) => {
    await users.demandPermission(request, "master.read");
    const storage = config.documentStorage;
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
