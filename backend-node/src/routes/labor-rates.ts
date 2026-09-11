import type { FastifyInstance } from "fastify";
import sql from "mssql";
import { insertAudit } from "../audit.js";
import type { AppConfig } from "../config.js";
import type { Database } from "../db.js";
import { canManageEngineeringRates } from "../engineering-rate-access.js";
import { ApiError } from "../errors.js";
import {
  bodyObject,
  booleanQuery,
  clampedInteger,
  dateOnly,
  optionalBodyText,
  optionalText,
  parseDateOnly,
  parseRowVersion,
  positiveLong,
  requiredText,
} from "../http.js";
import {
  dailyRateFor,
  hourlyRateFor,
  laborRateStatus,
  parseDefaultErpCategory,
  parseLaborCostType,
  supersedeWindow,
  type LaborCostType,
} from "../labor-master.js";
import type { CurrentUserService } from "../users.js";

/* The labor rate master. dbo.engineering_rates is the master; migration 044 only
   adds the fields an estimator searches on and the version chain that makes a
   rate change auditable. Nothing here writes dbo.manhour_lines, so no estimate
   amount can move through this module. */

const EXCLUSIVE_MAXIMUM_DECIMAL_19_SCALE_4 = 1_000_000_000;
const SAMPLE_AFFECTED_ESTIMATES = 5;

function validation(message: string): ApiError {
  return new ApiError(400, "validation_failed", message);
}

function todayIn(timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function rateAmount(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) throw validation(`${label} is invalid.`);
  if (value < 0) throw validation(`${label} cannot be negative.`);
  if (value >= EXCLUSIVE_MAXIMUM_DECIMAL_19_SCALE_4) throw validation(`${label} exceeds the supported amount.`);
  const text = value.toString();
  if (!text.includes("e") && (text.split(".")[1]?.length ?? 0) > 4) {
    throw validation(`${label} cannot have more than four decimal places.`);
  }
  return value;
}

type RateRow = {
  id: number | string;
  code: string | null;
  level: string;
  department: string;
  role_activity: string | null;
  engineering_hourly: number | string;
  engineering_daily: number | string;
  installation_hourly: number | string;
  installation_daily: number | string;
  effective_from: Date | string;
  effective_to: Date | string | null;
  is_active: boolean;
  version: number | null;
  default_erp_category: string | null;
  superseded_by_rate_id: number | string | null;
  notes: string | null;
  created_by_name: string;
  total_count: number | string;
};

const EXTENDED_COLUMNS = `rate.code, rate.role_activity, rate.version, rate.default_erp_category,
         rate.superseded_by_rate_id, rate.notes`;
const LEGACY_COLUMNS = `CAST(NULL AS nvarchar(40)) AS code, CAST(NULL AS nvarchar(150)) AS role_activity,
         CAST(NULL AS int) AS version, CAST(NULL AS nvarchar(30)) AS default_erp_category,
         CAST(NULL AS bigint) AS superseded_by_rate_id, CAST(NULL AS nvarchar(1000)) AS notes`;

const EXTENDED_SEARCH = `OR rate.code LIKE N'%' + @search + N'%' OR rate.role_activity LIKE N'%' + @search + N'%'`;

function rateQuery(extended: boolean): string {
  return `
    SELECT rate.id, rate.level, rate.department,
           rate.engineering_hourly, rate.engineering_daily,
           rate.installation_hourly, rate.installation_daily,
           rate.effective_from, rate.effective_to, rate.is_active,
           creator.name AS created_by_name,
           ${extended ? EXTENDED_COLUMNS : LEGACY_COLUMNS},
           COUNT_BIG(*) OVER() AS total_count
    FROM dbo.engineering_rates rate
    INNER JOIN dbo.users creator ON creator.id = rate.created_by
    WHERE (@include_inactive = 1 OR rate.is_active = 1)
      AND (@department = N'' OR rate.department = @department)
      AND (@level = N'' OR rate.level = @level)
      AND (@effective_only = 0 OR (rate.is_active = 1 AND rate.effective_from <= @on
           AND (rate.effective_to IS NULL OR rate.effective_to >= @on)))
      AND (@search = N'' OR rate.level LIKE N'%' + @search + N'%'
           OR rate.department LIKE N'%' + @search + N'%'
           ${extended ? EXTENDED_SEARCH : ""})
    ORDER BY CASE WHEN rate.is_active = 1 AND rate.effective_from <= @on
                    AND (rate.effective_to IS NULL OR rate.effective_to >= @on) THEN 0 ELSE 1 END,
             rate.department, rate.level, rate.effective_from DESC, rate.id DESC
    OFFSET @offset ROWS FETCH NEXT @page_size ROWS ONLY;`;
}

export function registerLaborRateRoutes(
  app: FastifyInstance,
  config: AppConfig,
  database: Database,
  users: CurrentUserService,
): void {
  /* Migration 044 is reserved rather than required (see EC-07), so this code has
     to run against a schema-43 database too. One cheap probe, then the matching
     static statement — no dynamic SQL. The answer is only cached once it is
     true, because a database can gain the columns while the process lives but
     cannot lose them. */
  let extendedSchema = false;
  async function hasExtendedSchema(): Promise<boolean> {
    if (extendedSchema) return true;
    const row = (await database.query<{ present: number }>(
      `SELECT CASE WHEN COL_LENGTH('dbo.engineering_rates', 'version') IS NULL THEN 0 ELSE 1 END AS present;`,
    )).recordset[0];
    extendedSchema = Number(row?.present ?? 0) === 1;
    return extendedSchema;
  }

  async function demandExtendedSchema(): Promise<void> {
    if (await hasExtendedSchema()) return;
    throw new ApiError(503, "labor_rate_lifecycle_unavailable",
      "Rate versioning needs database migration 044. This database is still on the previous schema, so rates can only be created, not superseded.");
  }

  function mapRate(row: RateRow, on: string, costType: LaborCostType | null) {
    const values = {
      engineeringHourly: Number(row.engineering_hourly),
      engineeringDaily: Number(row.engineering_daily),
      installationHourly: Number(row.installation_hourly),
      installationDaily: Number(row.installation_daily),
    };
    const window = {
      effectiveFrom: dateOnly(row.effective_from)!,
      effectiveTo: dateOnly(row.effective_to),
      isActive: Boolean(row.is_active),
    };
    return {
      id: Number(row.id),
      code: row.code,
      level: row.level,
      department: row.department,
      roleActivity: row.role_activity ?? "",
      ...values,
      ...window,
      version: row.version === null ? 1 : Number(row.version),
      defaultErpCategory: row.default_erp_category,
      supersededByRateId: row.superseded_by_rate_id === null ? null : Number(row.superseded_by_rate_id),
      notes: row.notes,
      createdByName: row.created_by_name,
      status: laborRateStatus(window, on),
      /* What a man-hour line for this cost type would actually be priced at.
         The daily figure is the authority: dbo.manhour_lines stores daily_rate
         and fn_estimate_validation compares against these same columns. */
      costType,
      dailyRate: costType === null ? null : dailyRateFor(costType, values),
      hourlyRate: costType === null ? null : hourlyRateFor(costType, values),
    };
  }

  /* Entry-time picker. An estimator holding estimate.read may search the master,
     because the rate the server is about to apply is already visible on the line
     it writes; withholding it only forces guesswork. The management-only
     administration list at GET /api/v1/admin/engineering-rates is untouched. */
  app.get("/api/v1/labor-rates", async (request) => {
    await users.demandPermission(request, "estimate.read");
    const query = request.query as Record<string, unknown>;
    const on = parseDateOnly(query.on, "Effective date", true) ?? todayIn(config.businessTimeZone);
    const costType = query.costType === undefined || query.costType === null || query.costType === ""
      ? null
      : parseLaborCostType(query.costType);
    const search = optionalText(query.search, 200, "Search") ?? "";
    const department = optionalText(query.department, 100, "Department") ?? "";
    const level = optionalText(query.level, 100, "Engineer level") ?? "";
    const includeInactive = booleanQuery(query.includeInactive);
    const effectiveOnly = booleanQuery(query.effectiveOnly, true);
    const page = clampedInteger(query.page, 1, 1, 1_000_000);
    const pageSize = clampedInteger(query.pageSize, 50, 1, 200);
    const extended = await hasExtendedSchema();
    const result = await database.query<RateRow>(rateQuery(extended), (bind) => {
      bind.input("on", sql.Date, on);
      bind.input("search", sql.NVarChar(200), search);
      bind.input("department", sql.NVarChar(100), department);
      bind.input("level", sql.NVarChar(100), level);
      bind.input("include_inactive", sql.Bit, includeInactive);
      bind.input("effective_only", sql.Bit, effectiveOnly);
      bind.input("offset", sql.BigInt, (page - 1) * pageSize);
      bind.input("page_size", sql.Int, pageSize);
    });
    const rows = result.recordset;
    return {
      items: rows.map((row) => mapRate(row, on, costType)),
      page,
      pageSize,
      total: Number(rows[0]?.total_count ?? 0),
      on,
      costType,
      /* Tells the picker whether code, role and ERP default are real values or
         placeholders on this database. */
      masterFieldsAvailable: extended,
    };
  });

  /**
   * Supersede a rate instead of editing it.
   *
   * Editing the incumbent's amounts in place would leave every man-hour line
   * already priced from it holding a daily_rate that no longer matches any
   * active master row at the line's price_date. fn_estimate_validation would
   * then raise internal_rate_mismatch and estimate submission would start
   * failing on estimates nobody had touched. Closing the incumbent the day
   * before the successor starts keeps it active over its own history, so saved
   * lines keep both their amount and their validity.
   */
  app.post("/api/v1/master/engineering-rates/:id/supersede", async (request, reply) => {
    await users.demandPermission(request, "master.write");
    const actor = await users.required(request);
    if (!canManageEngineeringRates(actor.role)) {
      throw new ApiError(403, "engineering_rate_management_required",
        "Engineering Manager or Admin access is required to change engineering rates.");
    }
    await demandExtendedSchema();
    const id = positiveLong((request.params as { id?: string }).id, "Rate id");
    const body = bodyObject(request.body);
    const expected = parseRowVersion(body.rowVersion);
    const effectiveFrom = parseDateOnly(body.effectiveFrom, "Effective-from date")!;
    const effectiveTo = parseDateOnly(body.effectiveTo, "Effective-to date", true);
    if (effectiveTo && effectiveTo < effectiveFrom) {
      throw validation("Effective-to date cannot be earlier than effective-from date.");
    }
    const amounts = {
      engineeringHourly: rateAmount(body.engineeringHourly, "Engineering hourly rate"),
      engineeringDaily: rateAmount(body.engineeringDaily, "Engineering daily rate"),
      installationHourly: rateAmount(body.installationHourly, "Installation hourly rate"),
      installationDaily: rateAmount(body.installationDaily, "Installation daily rate"),
    };
    const reason = requiredText(body.reason, 1000, "Reason");

    return database.transaction(async (transaction) => {
      const lock = new sql.Request(transaction);
      lock.input("id", sql.BigInt, id);
      const incumbent = (await lock.query<{
        level: string; department: string; code: string | null; role_activity: string;
        default_erp_category: string | null; version: number; effective_from: Date | string;
        effective_to: Date | string | null; is_active: boolean; superseded_by_rate_id: number | string | null;
        engineering_hourly: number | string; engineering_daily: number | string;
        installation_hourly: number | string; installation_daily: number | string;
        row_version: Buffer;
      }>(`
        SELECT level, department, code, role_activity, default_erp_category, version,
               effective_from, effective_to, is_active, superseded_by_rate_id,
               engineering_hourly, engineering_daily, installation_hourly, installation_daily, row_version
        FROM dbo.engineering_rates WITH (UPDLOCK, HOLDLOCK) WHERE id = @id;
      `)).recordset[0];
      if (!incumbent) throw new ApiError(404, "labor_rate_not_found", "Engineering rate not found.");
      if (!incumbent.row_version.equals(expected)) {
        throw new ApiError(409, "concurrency_conflict", "This rate changed. Reload and try again.");
      }
      if (!incumbent.is_active) {
        throw new ApiError(409, "labor_rate_inactive", "An inactive rate cannot be superseded. Create a new rate instead.");
      }
      if (incumbent.superseded_by_rate_id !== null) {
        throw new ApiError(409, "labor_rate_already_superseded",
          "This rate has already been superseded. Supersede its successor instead.");
      }

      const window = supersedeWindow({
        effectiveFrom: dateOnly(incumbent.effective_from)!,
        effectiveTo: dateOnly(incumbent.effective_to),
        isActive: true,
      }, effectiveFrom);

      /* Close the incumbent before inserting the successor: the two windows must
         touch, never overlap, or tr_engineering_rates_no_overlap rejects the
         insert. */
      const close = new sql.Request(transaction);
      close.input("id", sql.BigInt, id);
      close.input("effective_to", sql.Date, window.incumbentEffectiveTo);
      close.input("actor", sql.BigInt, actor.id);
      await close.query(`
        UPDATE dbo.engineering_rates
        SET effective_to = @effective_to, updated_by = @actor, updated_at = SYSUTCDATETIME()
        WHERE id = @id;
      `);

      const code = optionalBodyText(body.code, 40, "Rate code") ?? incumbent.code;
      const roleActivity = optionalBodyText(body.roleActivity, 150, "Role or activity") ?? incumbent.role_activity;
      const erpCategory = body.defaultErpCategory === undefined
        ? incumbent.default_erp_category
        : parseDefaultErpCategory(body.defaultErpCategory);
      const notes = optionalBodyText(body.notes, 1000, "Notes");

      const insert = new sql.Request(transaction);
      insert.input("level", sql.NVarChar(100), incumbent.level);
      insert.input("department", sql.NVarChar(100), incumbent.department);
      insert.input("code", sql.NVarChar(40), code);
      insert.input("role_activity", sql.NVarChar(150), roleActivity);
      insert.input("erp_category", sql.NVarChar(30), erpCategory);
      insert.input("engineering_hourly", sql.Decimal(19, 4), amounts.engineeringHourly);
      insert.input("engineering_daily", sql.Decimal(19, 4), amounts.engineeringDaily);
      insert.input("installation_hourly", sql.Decimal(19, 4), amounts.installationHourly);
      insert.input("installation_daily", sql.Decimal(19, 4), amounts.installationDaily);
      insert.input("effective_from", sql.Date, window.successorEffectiveFrom);
      insert.input("effective_to", sql.Date, effectiveTo);
      insert.input("version", sql.Int, Number(incumbent.version) + 1);
      insert.input("notes", sql.NVarChar(1000), notes);
      insert.input("actor", sql.BigInt, actor.id);
      const successor = (await insert.query<{ id: number | string; row_version: Buffer }>(`
        DECLARE @created TABLE (id bigint NOT NULL, row_version binary(8) NOT NULL);
        INSERT INTO dbo.engineering_rates (level, department, code, role_activity, default_erp_category,
          engineering_hourly, engineering_daily, installation_hourly, installation_daily,
          effective_from, effective_to, version, notes, created_by, updated_by, updated_at)
        OUTPUT inserted.id, inserted.row_version INTO @created (id, row_version)
        VALUES (@level, @department, @code, @role_activity, @erp_category,
          @engineering_hourly, @engineering_daily, @installation_hourly, @installation_daily,
          @effective_from, @effective_to, @version, @notes, @actor, @actor, SYSUTCDATETIME());
        SELECT id, row_version FROM @created;
      `)).recordset[0]!;
      const successorId = Number(successor.id);

      const link = new sql.Request(transaction);
      link.input("id", sql.BigInt, id);
      link.input("successor", sql.BigInt, successorId);
      await link.query(`
        UPDATE dbo.engineering_rates
        SET superseded_by_rate_id = @successor, superseded_at = SYSUTCDATETIME()
        WHERE id = @id;
      `);

      await insertAudit(transaction, actor.id, "EngineeringRate", id, String(id), "Superseded", {
        effectiveFrom: dateOnly(incumbent.effective_from), effectiveTo: dateOnly(incumbent.effective_to),
        engineeringDaily: Number(incumbent.engineering_daily), installationDaily: Number(incumbent.installation_daily),
        version: Number(incumbent.version),
      }, {
        successorRateId: successorId, effectiveTo: window.incumbentEffectiveTo,
        successorEffectiveFrom: window.successorEffectiveFrom, version: Number(incumbent.version) + 1,
        engineeringDaily: amounts.engineeringDaily, installationDaily: amounts.installationDaily, reason,
      });

      return {
        supersededRateId: id,
        supersededEffectiveTo: window.incumbentEffectiveTo,
        rateId: successorId,
        level: incumbent.level,
        department: incumbent.department,
        version: Number(incumbent.version) + 1,
        effectiveFrom: window.successorEffectiveFrom,
        effectiveTo,
        rowVersion: successor.row_version.toString("base64"),
      };
    }).then((created) => reply
      .status(201)
      .header("Location", `/api/v1/master/engineering-rates/${created.rateId}`)
      .send(created));
  });

  /**
   * Close a rate for future use.
   *
   * Deliberately not a deactivation. Setting is_active = 0 would remove the row
   * fn_estimate_validation matches saved lines against, so every estimate
   * already priced from it would fail internal_rate_mismatch on its next
   * submit. Setting effective_to keeps the history intact, and the request is
   * refused outright when a live line was priced after the requested end date.
   */
  app.post("/api/v1/master/engineering-rates/:id/retire", async (request) => {
    await users.demandPermission(request, "master.write");
    const actor = await users.required(request);
    if (!canManageEngineeringRates(actor.role)) {
      throw new ApiError(403, "engineering_rate_management_required",
        "Engineering Manager or Admin access is required to change engineering rates.");
    }
    await demandExtendedSchema();
    const id = positiveLong((request.params as { id?: string }).id, "Rate id");
    const body = bodyObject(request.body);
    const expected = parseRowVersion(body.rowVersion);
    const effectiveTo = parseDateOnly(body.effectiveTo, "Effective-to date")!;
    const reason = requiredText(body.reason, 1000, "Reason");

    return database.transaction(async (transaction) => {
      const lock = new sql.Request(transaction);
      lock.input("id", sql.BigInt, id);
      const rate = (await lock.query<{
        level: string; department: string; effective_from: Date | string; effective_to: Date | string | null;
        is_active: boolean; engineering_daily: number | string; installation_daily: number | string;
        row_version: Buffer;
      }>(`
        SELECT level, department, effective_from, effective_to, is_active,
               engineering_daily, installation_daily, row_version
        FROM dbo.engineering_rates WITH (UPDLOCK, HOLDLOCK) WHERE id = @id;
      `)).recordset[0];
      if (!rate) throw new ApiError(404, "labor_rate_not_found", "Engineering rate not found.");
      if (!rate.row_version.equals(expected)) {
        throw new ApiError(409, "concurrency_conflict", "This rate changed. Reload and try again.");
      }
      if (!rate.is_active) return { id, effectiveTo: dateOnly(rate.effective_to), alreadyClosed: true };
      if (effectiveTo < dateOnly(rate.effective_from)!) {
        throw validation("A rate cannot be closed before the date it started.");
      }

      const usage = new sql.Request(transaction);
      usage.input("level", sql.NVarChar(100), rate.level);
      usage.input("department", sql.NVarChar(100), rate.department);
      usage.input("effective_to", sql.Date, effectiveTo);
      usage.input("engineering_daily", sql.Decimal(19, 4), Number(rate.engineering_daily));
      usage.input("installation_daily", sql.Decimal(19, 4), Number(rate.installation_daily));
      usage.input("sample", sql.Int, SAMPLE_AFFECTED_ESTIMATES);
      const affected = (await usage.query<{ estimate_no: string; affected_estimates: number | string }>(`
        WITH priced AS (
          SELECT DISTINCT e.estimate_no
          FROM dbo.manhour_lines line
          INNER JOIN dbo.estimates e ON e.id = line.estimate_id AND e.revision = line.revision AND e.deleted_at IS NULL
          WHERE line.deleted_at IS NULL AND line.provider = N'Internal'
            AND line.level = @level AND line.department = @department
            AND line.price_date > @effective_to
            AND line.daily_rate = CASE line.cost_type
                  WHEN N'Installation' THEN @installation_daily ELSE @engineering_daily END
        )
        SELECT estimate_no, COUNT_BIG(*) OVER() AS affected_estimates
        FROM priced ORDER BY estimate_no OFFSET 0 ROWS FETCH NEXT @sample ROWS ONLY;
      `)).recordset;
      if (affected.length) {
        throw new ApiError(409, "labor_rate_in_use",
          `This rate still prices man-hour lines dated after ${effectiveTo}. Closing it there would invalidate them. Choose a later end date, or supersede the rate instead.`,
          {
            affectedEstimates: Number(affected[0]!.affected_estimates),
            sample: affected.map((row) => row.estimate_no),
          });
      }

      const update = new sql.Request(transaction);
      update.input("id", sql.BigInt, id);
      update.input("effective_to", sql.Date, effectiveTo);
      update.input("actor", sql.BigInt, actor.id);
      const saved = (await update.query<{ row_version: Buffer }>(`
        DECLARE @closed TABLE (row_version binary(8) NOT NULL);
        UPDATE dbo.engineering_rates
        SET effective_to = @effective_to, updated_by = @actor, updated_at = SYSUTCDATETIME()
        OUTPUT inserted.row_version INTO @closed (row_version)
        WHERE id = @id;
        SELECT row_version FROM @closed;
      `)).recordset[0];
      if (!saved) throw new ApiError(409, "concurrency_conflict", "The rate could not be closed. Reload and try again.");

      await insertAudit(transaction, actor.id, "EngineeringRate", id, String(id), "Retired",
        { effectiveTo: dateOnly(rate.effective_to) }, { effectiveTo, reason });

      return { id, effectiveTo, alreadyClosed: false, rowVersion: saved.row_version.toString("base64") };
    });
  });
}
