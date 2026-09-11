import type { FastifyInstance, FastifyRequest } from "fastify";
import sql from "mssql";
import type { Transaction as TransactionType } from "mssql";
import { insertAudit } from "../audit.js";
import type { AppConfig } from "../config.js";
import type { Database } from "../db.js";
import { ApiError } from "../errors.js";
import { assertEstimateTotals } from "../estimate-total-guard.js";
import {
  bodyObject,
  clampedInteger,
  optionalBodyText,
  optionalText,
  parseDateOnly,
  parseRowVersion,
  positiveLong,
  requiredInteger,
  requiredText,
} from "../http.js";
import {
  LABOR_PACKAGE_STATUSES,
  assertLaborLineCost,
  manDaysFromHours,
  parseDefaultErpCategory,
  parseLaborCostType,
  parseLaborProvider,
  parseLaborRateBasis,
  resolveLaborEffort,
  roundTo,
  type LaborCostType,
  type LaborProvider,
  type LaborRateBasis,
} from "../labor-master.js";
import type { CurrentUserService } from "../users.js";
import {
  demandNewSection,
  lockEstimate,
  resolveInternalDailyRate,
  touchEstimate,
  validateOwnerSupplier,
} from "./estimate-workspace-write.js";

/* Reusable labor work packages — the labor counterpart of dbo.module_templates.
   A package stores the activities, the engineer levels and the usual effort; it
   never stores a price an internal line will be charged at. Applying one runs
   the same estimate lock, the same section-06 authorisation, the same rate
   resolution and the same aggregate guard as typing each line by hand, so a
   package can only ever write lines the estimator was already allowed to write. */

const MAXIMUM_PACKAGE_LINES = 200;
const ENGINEERING_SECTION = "06";
const EXCLUSIVE_MAXIMUM_DECIMAL_19_SCALE_4 = 1_000_000_000;

function validation(message: string): ApiError {
  return new ApiError(400, "validation_failed", message);
}

function todayIn(timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function packageCode(value: unknown): string {
  const code = requiredText(value, 40, "Package code").toUpperCase();
  if (!/^[A-Z0-9][A-Z0-9._/-]*$/.test(code)) {
    throw validation("Package code may contain only letters, numbers, hyphen, underscore, period and slash, and must start with a letter or number.");
  }
  return code;
}

function decimal(value: unknown, minimum: number, maximum: number, scale: number, label: string): number {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed) || parsed < minimum || parsed >= maximum) {
    throw validation(`${label} must be at least ${minimum} and below ${maximum}.`);
  }
  const text = parsed.toString();
  if (!text.includes("e") && (text.split(".")[1]?.length ?? 0) > scale) {
    throw validation(`${label} cannot have more than ${scale} decimal places.`);
  }
  return parsed;
}

function optionalDecimal(value: unknown, minimum: number, maximum: number, scale: number, label: string): number | undefined {
  return value === null || value === undefined || value === "" ? undefined : decimal(value, minimum, maximum, scale, label);
}

type PackageLineInput = {
  activity: string;
  department: string;
  level: string;
  costType: LaborCostType;
  provider: LaborProvider;
  rateId: number | null;
  rateBasis: LaborRateBasis;
  defaultEngineers: number;
  defaultManDays: number;
  defaultHours: number | null;
  defaultHoursPerDay: number;
  referenceDailyRate: number;
  defaultErpCategory: string | null;
  remark: string | null;
};

type PackageInput = {
  code: string;
  name: string;
  costType: LaborCostType;
  department: string;
  projectType: string;
  description: string;
  status: string;
  lines: PackageLineInput[];
};

function parsePackageLine(value: unknown, index: number, packageCostType: LaborCostType): PackageLineInput {
  if (typeof value !== "object" || value === null) throw validation(`Line ${index + 1} is not an object.`);
  const line = value as Record<string, unknown>;
  const label = `Line ${index + 1}`;
  const costType = parseLaborCostType(line.costType ?? packageCostType);
  if (costType !== packageCostType) {
    throw validation(`${label} is ${costType} but the package is ${packageCostType}. A package holds one cost type so it lands in one work-package group.`);
  }
  const provider = parseLaborProvider(line.provider ?? "Internal");
  const rateBasis = parseLaborRateBasis(line.rateBasis ?? "Daily");
  const defaultHoursPerDay = decimal(line.defaultHoursPerDay ?? 8, 0.01, 24.01, 2, `${label} hours per day`);
  const defaultEngineers = decimal(line.defaultEngineers ?? 1, 0.01, 1_000_000, 2, `${label} engineers`);
  const referenceDailyRate = decimal(line.referenceDailyRate ?? 0, 0, EXCLUSIVE_MAXIMUM_DECIMAL_19_SCALE_4, 4, `${label} reference daily rate`);
  if (provider === "Supplier" && referenceDailyRate <= 0) {
    throw validation(`${label} is a supplier activity, so it needs a reference daily rate.`);
  }

  /* An hourly line stores both figures: the authored hours and the man-days the
     ledger will actually use. Deriving man-days here rather than at apply time
     means the stored package and the applied line can never disagree. */
  let defaultHours: number | null = null;
  let defaultManDays: number;
  if (rateBasis === "Hourly") {
    defaultHours = decimal(line.defaultHours, 0.01, 1_000_000, 2, `${label} hours`);
    defaultManDays = manDaysFromHours(defaultHours, defaultHoursPerDay);
  } else {
    defaultManDays = decimal(line.defaultManDays ?? 1, 0.01, 1_000_000, 2, `${label} man-days`);
  }

  return {
    activity: requiredText(line.activity, 300, `${label} activity`),
    department: requiredText(line.department, 100, `${label} department`),
    level: requiredText(line.level, 100, `${label} engineer level`),
    costType,
    provider,
    rateId: line.rateId === null || line.rateId === undefined || line.rateId === ""
      ? null
      : requiredInteger(line.rateId, `${label} rate master`, 1),
    rateBasis,
    defaultEngineers,
    defaultManDays,
    defaultHours,
    defaultHoursPerDay,
    referenceDailyRate,
    defaultErpCategory: parseDefaultErpCategory(line.defaultErpCategory),
    remark: optionalBodyText(line.remark, 20_000, `${label} remark`),
  };
}

function parsePackage(request: FastifyRequest): PackageInput {
  const body = bodyObject(request.body);
  const rawLines = body.lines;
  if (!Array.isArray(rawLines) || rawLines.length === 0) throw validation("A labor package needs at least one activity.");
  if (rawLines.length > MAXIMUM_PACKAGE_LINES) throw validation(`A labor package cannot hold more than ${MAXIMUM_PACKAGE_LINES} activities.`);
  const status = optionalBodyText(body.status, 20, "Status") ?? "Draft";
  if (!(LABOR_PACKAGE_STATUSES as readonly string[]).includes(status)) throw validation("Status is not allowed.");
  if (status === "Retired") throw validation("Retire a package through the retire action, not by editing it.");
  const costType = parseLaborCostType(body.costType);
  return {
    code: packageCode(body.code),
    name: requiredText(body.name, 200, "Package name"),
    costType,
    department: optionalBodyText(body.department, 100, "Department") ?? "",
    projectType: optionalBodyText(body.projectType, 50, "Project type") ?? "",
    description: optionalBodyText(body.description, 1000, "Description") ?? "",
    status,
    lines: rawLines.map((line, index) => parsePackageLine(line, index, costType)),
  };
}

type PackageRow = {
  id: number | string; code: string; name: string; cost_type: string; department: string;
  project_type: string; description: string; status: string; revision: number;
  created_by_name: string; updated_by_name: string; created_at: Date | string; updated_at: Date | string;
  row_version: Buffer; line_count: number | string; reference_total: number | string;
  reference_man_days: number | string; total_count?: number | string;
};

function mapPackage(row: PackageRow) {
  return {
    id: Number(row.id), code: row.code, name: row.name, costType: row.cost_type,
    department: row.department, projectType: row.project_type, description: row.description,
    status: row.status, revision: row.revision,
    createdByName: row.created_by_name, updatedByName: row.updated_by_name,
    createdAt: row.created_at, updatedAt: row.updated_at,
    lineCount: Number(row.line_count),
    /* Indicative only: the reference rates the author saw. An applied internal
       line is always re-priced from the live master. */
    referenceTotal: Number(row.reference_total),
    referenceManDays: Number(row.reference_man_days),
    rowVersion: row.row_version.toString("base64"),
  };
}

const packageProjection = `
  SELECT p.id, p.code, p.name, p.cost_type, p.department, p.project_type, p.description, p.status, p.revision,
         creator.name AS created_by_name, editor.name AS updated_by_name, p.created_at, p.updated_at, p.row_version,
         (SELECT COUNT(*) FROM dbo.labor_package_lines l WHERE l.package_id = p.id AND l.deleted_at IS NULL) AS line_count,
         (SELECT COALESCE(SUM(l.default_engineers * l.default_man_days * l.reference_daily_rate), 0)
            FROM dbo.labor_package_lines l WHERE l.package_id = p.id AND l.deleted_at IS NULL) AS reference_total,
         (SELECT COALESCE(SUM(l.default_engineers * l.default_man_days), 0)
            FROM dbo.labor_package_lines l WHERE l.package_id = p.id AND l.deleted_at IS NULL) AS reference_man_days
  FROM dbo.labor_packages p
  INNER JOIN dbo.users creator ON creator.id = p.created_by
  INNER JOIN dbo.users editor ON editor.id = p.updated_by`;

type PackageLineRow = {
  id: number | string; sort_order: number; activity: string; department: string; level: string;
  cost_type: string; provider: string; rate_id: number | string | null; rate_basis: string;
  default_engineers: number | string; default_man_days: number | string; default_hours: number | string | null;
  default_hours_per_day: number | string; reference_daily_rate: number | string;
  default_erp_category: string | null; remark: string | null;
  rate_code: string | null; rate_is_effective: boolean | null;
};

function mapPackageLine(row: PackageLineRow) {
  return {
    id: Number(row.id), sortOrder: row.sort_order, activity: row.activity, department: row.department,
    level: row.level, costType: row.cost_type, provider: row.provider,
    rateId: row.rate_id === null ? null : Number(row.rate_id),
    rateCode: row.rate_code,
    rateStillEffective: row.rate_is_effective === null ? null : Boolean(row.rate_is_effective),
    rateBasis: row.rate_basis,
    defaultEngineers: Number(row.default_engineers), defaultManDays: Number(row.default_man_days),
    defaultHours: row.default_hours === null ? null : Number(row.default_hours),
    defaultHoursPerDay: Number(row.default_hours_per_day),
    referenceDailyRate: Number(row.reference_daily_rate),
    defaultErpCategory: row.default_erp_category, remark: row.remark,
  };
}

async function replacePackageLines(transaction: TransactionType, packageId: number, lines: PackageLineInput[]): Promise<void> {
  const clear = new sql.Request(transaction);
  clear.input("package_id", sql.BigInt, packageId);
  await clear.query("UPDATE dbo.labor_package_lines SET deleted_at = SYSUTCDATETIME() WHERE package_id = @package_id AND deleted_at IS NULL;");
  for (const [index, line] of lines.entries()) {
    const insert = new sql.Request(transaction);
    insert.input("package_id", sql.BigInt, packageId);
    insert.input("sort_order", sql.Int, index);
    insert.input("activity", sql.NVarChar(300), line.activity);
    insert.input("department", sql.NVarChar(100), line.department);
    insert.input("level", sql.NVarChar(100), line.level);
    insert.input("cost_type", sql.NVarChar(30), line.costType);
    insert.input("provider", sql.NVarChar(30), line.provider);
    insert.input("rate_id", sql.BigInt, line.rateId);
    insert.input("rate_basis", sql.NVarChar(20), line.rateBasis);
    insert.input("engineers", sql.Decimal(9, 2), line.defaultEngineers);
    insert.input("man_days", sql.Decimal(9, 2), line.defaultManDays);
    insert.input("hours", sql.Decimal(9, 2), line.defaultHours);
    insert.input("hours_per_day", sql.Decimal(9, 2), line.defaultHoursPerDay);
    insert.input("reference_rate", sql.Decimal(19, 4), line.referenceDailyRate);
    insert.input("erp_category", sql.NVarChar(30), line.defaultErpCategory);
    insert.input("remark", sql.NVarChar(sql.MAX), line.remark);
    await insert.query(`INSERT INTO dbo.labor_package_lines(package_id,sort_order,activity,department,level,cost_type,
      provider,rate_id,rate_basis,default_engineers,default_man_days,default_hours,default_hours_per_day,
      reference_daily_rate,default_erp_category,remark)
      VALUES(@package_id,@sort_order,@activity,@department,@level,@cost_type,@provider,@rate_id,@rate_basis,
      @engineers,@man_days,@hours,@hours_per_day,@reference_rate,@erp_category,@remark);`);
  }
}

type ApplyOverride = {
  lineId: number;
  skip: boolean;
  activity?: string | undefined;
  engineers?: number | undefined;
  manDays?: number | undefined;
  hours?: number | undefined;
  hoursPerDay?: number | undefined;
  dailyRate?: number | undefined;
  supplierId?: number | undefined;
  quotationNumber?: string | undefined;
  priceDate?: string | undefined;
  remark?: string | null | undefined;
  erpCategory?: string | null | undefined;
  erpCategoryProvided: boolean;
};

function parseApplyOverride(value: unknown, index: number): ApplyOverride {
  if (typeof value !== "object" || value === null) throw validation(`Override ${index + 1} is not an object.`);
  const raw = value as Record<string, unknown>;
  const label = `Override ${index + 1}`;
  return {
    lineId: requiredInteger(raw.lineId, `${label} line`, 1),
    skip: raw.skip === true,
    activity: raw.activity === undefined || raw.activity === null ? undefined : requiredText(raw.activity, 300, `${label} activity`),
    engineers: optionalDecimal(raw.engineers, 0.01, 1_000_000, 2, `${label} engineers`),
    manDays: optionalDecimal(raw.manDays, 0.01, 1_000_000, 2, `${label} man-days`),
    hours: optionalDecimal(raw.hours, 0.01, 1_000_000, 2, `${label} hours`),
    hoursPerDay: optionalDecimal(raw.hoursPerDay, 0.01, 24.01, 2, `${label} hours per day`),
    dailyRate: optionalDecimal(raw.dailyRate, 0, EXCLUSIVE_MAXIMUM_DECIMAL_19_SCALE_4, 4, `${label} daily rate`),
    supplierId: raw.supplierId === undefined || raw.supplierId === null || raw.supplierId === ""
      ? undefined : requiredInteger(raw.supplierId, `${label} supplier`, 1),
    quotationNumber: optionalBodyText(raw.quotationNumber, 100, `${label} quotation number`) ?? undefined,
    priceDate: parseDateOnly(raw.priceDate, `${label} price date`, true) ?? undefined,
    remark: raw.remark === undefined ? undefined : optionalBodyText(raw.remark, 20_000, `${label} remark`),
    erpCategory: raw.erpCategory === undefined ? undefined : parseDefaultErpCategory(raw.erpCategory),
    erpCategoryProvided: raw.erpCategory !== undefined,
  };
}

export function registerLaborPackageRoutes(
  app: FastifyInstance,
  config: AppConfig,
  database: Database,
  users: CurrentUserService,
): void {
  /* Migration 044 is reserved rather than required (see EC-07). Without it the
     tables simply are not there, and a plain 503 is far more useful than a SQL
     error about an invalid object name. */
  let tablesPresent = false;
  async function demandTables(): Promise<void> {
    if (tablesPresent) return;
    const row = (await database.query<{ present: number }>(
      `SELECT CASE WHEN OBJECT_ID('dbo.labor_packages', 'U') IS NULL THEN 0 ELSE 1 END AS present;`,
    )).recordset[0];
    tablesPresent = Number(row?.present ?? 0) === 1;
    if (!tablesPresent) {
      throw new ApiError(503, "labor_packages_unavailable",
        "Reusable labor packages need database migration 044, which this database does not have yet. Man-hour lines can still be entered one at a time.");
    }
  }

  app.get("/api/v1/labor-packages", async (request) => {
    await users.demandPermission(request, "estimate.read");
    await demandTables();
    const query = request.query as Record<string, unknown>;
    const search = optionalText(query.search, 200, "Search") ?? "";
    const status = optionalText(query.status, 20, "Status") ?? "";
    if (status && !(LABOR_PACKAGE_STATUSES as readonly string[]).includes(status)) throw validation("Status is not allowed.");
    const costType = query.costType === undefined || query.costType === null || query.costType === ""
      ? "" : parseLaborCostType(query.costType);
    const department = optionalText(query.department, 100, "Department") ?? "";
    const page = clampedInteger(query.page, 1, 1, 1_000_000);
    const pageSize = clampedInteger(query.pageSize, 50, 1, 200);
    const filter = `WHERE (@status = N'' OR p.status = @status)
        AND (@cost_type = N'' OR p.cost_type = @cost_type)
        AND (@department = N'' OR p.department = @department)
        AND (@search = N'' OR p.code LIKE N'%' + @search + N'%' OR p.name LIKE N'%' + @search + N'%'
             OR p.description LIKE N'%' + @search + N'%' OR p.project_type LIKE N'%' + @search + N'%'
             OR EXISTS (SELECT 1 FROM dbo.labor_package_lines l WHERE l.package_id = p.id AND l.deleted_at IS NULL
                        AND (l.activity LIKE N'%' + @search + N'%' OR l.level LIKE N'%' + @search + N'%'
                             OR l.department LIKE N'%' + @search + N'%')))`;
    const bind = (sqlRequest: InstanceType<typeof sql.Request>) => {
      sqlRequest.input("search", sql.NVarChar(200), search);
      sqlRequest.input("status", sql.NVarChar(20), status);
      sqlRequest.input("cost_type", sql.NVarChar(30), costType);
      sqlRequest.input("department", sql.NVarChar(100), department);
    };
    const result = await database.query<PackageRow>(`
      ${packageProjection}
      ${filter}
      ORDER BY CASE p.status WHEN N'Active' THEN 0 WHEN N'Draft' THEN 1 ELSE 2 END, p.cost_type, p.code
      OFFSET @offset ROWS FETCH NEXT @page_size ROWS ONLY;
    `, (sqlRequest) => {
      bind(sqlRequest);
      sqlRequest.input("offset", sql.BigInt, (page - 1) * pageSize);
      sqlRequest.input("page_size", sql.Int, pageSize);
    });
    /* Same filter text for rows and total, so a search can never report a count
       it did not actually match. */
    const totalResult = await database.query<{ total: number | string }>(`
      SELECT COUNT(*) AS total FROM dbo.labor_packages p
      ${filter};
    `, bind);
    return {
      items: result.recordset.map(mapPackage),
      page,
      pageSize,
      total: Number(totalResult.recordset[0]?.total ?? 0),
    };
  });

  app.get("/api/v1/labor-packages/:id", async (request) => {
    await users.demandPermission(request, "estimate.read");
    await demandTables();
    const id = positiveLong((request.params as { id?: string }).id, "Package id");
    const today = todayIn(config.businessTimeZone);
    const header = await database.query<PackageRow>(`${packageProjection} WHERE p.id = @id;`, (bind) => {
      bind.input("id", sql.BigInt, id);
    });
    const row = header.recordset[0];
    if (!row) throw new ApiError(404, "labor_package_not_found", "Labor package not found.");
    const lines = await database.query<PackageLineRow>(`
      SELECT l.id, l.sort_order, l.activity, l.department, l.level, l.cost_type, l.provider, l.rate_id,
             l.rate_basis, l.default_engineers, l.default_man_days, l.default_hours, l.default_hours_per_day,
             l.reference_daily_rate, l.default_erp_category, l.remark,
             rate.code AS rate_code,
             CASE WHEN rate.id IS NULL THEN NULL
                  WHEN rate.is_active = 1 AND rate.effective_from <= @today
                       AND (rate.effective_to IS NULL OR rate.effective_to >= @today)
                  THEN CAST(1 AS bit) ELSE CAST(0 AS bit) END AS rate_is_effective
      FROM dbo.labor_package_lines l
      LEFT JOIN dbo.engineering_rates rate ON rate.id = l.rate_id
      WHERE l.package_id = @id AND l.deleted_at IS NULL
      ORDER BY l.sort_order, l.id;
    `, (bind) => { bind.input("id", sql.BigInt, id); bind.input("today", sql.Date, today); });
    return { ...mapPackage(row), lines: lines.recordset.map(mapPackageLine) };
  });

  app.post("/api/v1/labor-packages", async (request, reply) => {
    await users.demandPermission(request, "estimate.write");
    await demandTables();
    const actor = await users.required(request);
    const input = parsePackage(request);
    /* Drafting is ordinary estimating work; publishing puts a package in
       everyone's library, so it is a master-data act. Same split as
       dbo.module_templates. */
    if (input.status === "Active") await users.demandPermission(request, "master.write");
    const created = await database.transaction(async (transaction) => {
      const insert = new sql.Request(transaction);
      insert.input("code", sql.NVarChar(40), input.code);
      insert.input("name", sql.NVarChar(200), input.name);
      insert.input("cost_type", sql.NVarChar(30), input.costType);
      insert.input("department", sql.NVarChar(100), input.department);
      insert.input("project_type", sql.NVarChar(50), input.projectType);
      insert.input("description", sql.NVarChar(1000), input.description);
      insert.input("status", sql.NVarChar(20), input.status);
      insert.input("actor", sql.BigInt, actor.id);
      const row = (await insert.query<{ id: number | string }>(`
        IF EXISTS (SELECT 1 FROM dbo.labor_packages WHERE code = @code)
          THROW 51450, 'A labor package with this code already exists.', 1;
        DECLARE @created TABLE (id bigint NOT NULL);
        INSERT INTO dbo.labor_packages(code,name,cost_type,department,project_type,description,status,created_by,updated_by)
        OUTPUT inserted.id INTO @created (id)
        VALUES(@code,@name,@cost_type,@department,@project_type,@description,@status,@actor,@actor);
        SELECT id FROM @created;
      `)).recordset[0]!;
      const packageId = Number(row.id);
      await replacePackageLines(transaction, packageId, input.lines);
      await insertAudit(transaction, actor.id, "LaborPackage", packageId, input.code, "Created", null, {
        name: input.name, costType: input.costType, status: input.status, lines: input.lines.length,
      });
      return { id: packageId, code: input.code };
    });
    return reply.status(201).header("Location", `/api/v1/labor-packages/${created.id}`).send(created);
  });

  app.put("/api/v1/labor-packages/:id", async (request) => {
    await users.demandPermission(request, "estimate.write");
    await demandTables();
    const actor = await users.required(request);
    const id = positiveLong((request.params as { id?: string }).id, "Package id");
    const expected = parseRowVersion(bodyObject(request.body).rowVersion);
    const input = parsePackage(request);
    if (input.status === "Active") await users.demandPermission(request, "master.write");
    return database.transaction(async (transaction) => {
      const lock = new sql.Request(transaction);
      lock.input("id", sql.BigInt, id);
      const current = (await lock.query<{ code: string; name: string; status: string; revision: number; row_version: Buffer }>(`
        SELECT code,name,status,revision,row_version FROM dbo.labor_packages WITH (UPDLOCK,HOLDLOCK) WHERE id=@id;
      `)).recordset[0];
      if (!current) throw new ApiError(404, "labor_package_not_found", "Labor package not found.");
      if (!current.row_version.equals(expected)) {
        throw new ApiError(409, "concurrency_conflict", "This package changed. Reload and try again.");
      }
      if (current.status === "Retired") throw new ApiError(409, "labor_package_retired", "A retired package cannot be edited.");
      if (current.status === "Active") {
        throw new ApiError(409, "published_package_locked",
          "Published packages cannot be overwritten. Copy this package to a new draft, then publish it.");
      }
      const update = new sql.Request(transaction);
      update.input("id", sql.BigInt, id);
      update.input("code", sql.NVarChar(40), input.code);
      update.input("name", sql.NVarChar(200), input.name);
      update.input("cost_type", sql.NVarChar(30), input.costType);
      update.input("department", sql.NVarChar(100), input.department);
      update.input("project_type", sql.NVarChar(50), input.projectType);
      update.input("description", sql.NVarChar(1000), input.description);
      update.input("status", sql.NVarChar(20), input.status);
      update.input("actor", sql.BigInt, actor.id);
      const updated = (await update.query<{ row_version: Buffer; revision: number }>(`
        IF EXISTS (SELECT 1 FROM dbo.labor_packages WHERE code = @code AND id <> @id)
          THROW 51450, 'A labor package with this code already exists.', 1;
        DECLARE @updated TABLE (row_version binary(8) NOT NULL, revision int NOT NULL);
        UPDATE dbo.labor_packages SET code=@code,name=@name,cost_type=@cost_type,department=@department,
          project_type=@project_type,description=@description,status=@status,revision=revision+1,
          updated_by=@actor,updated_at=SYSUTCDATETIME()
        OUTPUT inserted.row_version, inserted.revision INTO @updated (row_version, revision)
        WHERE id=@id;
        SELECT row_version, revision FROM @updated;
      `)).recordset[0]!;
      await replacePackageLines(transaction, id, input.lines);
      await insertAudit(transaction, actor.id, "LaborPackage", id, input.code, "Updated",
        { name: current.name, status: current.status, revision: current.revision },
        { name: input.name, status: input.status, revision: updated.revision, lines: input.lines.length });
      return { id, revision: updated.revision, rowVersion: updated.row_version.toString("base64") };
    });
  });

  app.post("/api/v1/labor-packages/:id/retire", async (request) => {
    await users.demandPermission(request, "master.write");
    await demandTables();
    const actor = await users.required(request);
    const id = positiveLong((request.params as { id?: string }).id, "Package id");
    const expected = parseRowVersion(bodyObject(request.body).rowVersion);
    return database.transaction(async (transaction) => {
      const lock = new sql.Request(transaction);
      lock.input("id", sql.BigInt, id);
      const current = (await lock.query<{ code: string; status: string; row_version: Buffer }>(`
        SELECT code,status,row_version FROM dbo.labor_packages WITH (UPDLOCK,HOLDLOCK) WHERE id=@id;
      `)).recordset[0];
      if (!current) throw new ApiError(404, "labor_package_not_found", "Labor package not found.");
      if (!current.row_version.equals(expected)) {
        throw new ApiError(409, "concurrency_conflict", "This package changed. Reload and try again.");
      }
      if (current.status === "Retired") return { id, status: "Retired" };
      const update = new sql.Request(transaction);
      update.input("id", sql.BigInt, id);
      update.input("actor", sql.BigInt, actor.id);
      await update.query(`UPDATE dbo.labor_packages SET status=N'Retired',retired_at=SYSUTCDATETIME(),
        updated_by=@actor,updated_at=SYSUTCDATETIME() WHERE id=@id;`);
      await insertAudit(transaction, actor.id, "LaborPackage", id, current.code, "Retired",
        { status: current.status }, { status: "Retired" });
      /* Retiring never touches an estimate: lines already applied keep the rate
         and the amount they were saved with. */
      return { id, status: "Retired" };
    });
  });

  /* The library fills itself. An engineer who has already built a good work
     package inside a real estimate lifts it into the library instead of typing
     it a second time — including the ERP category they chose for each line. */
  app.post("/api/v1/labor-packages/from-estimate", async (request, reply) => {
    await users.demandPermission(request, "estimate.write");
    await demandTables();
    const actor = await users.required(request);
    const body = bodyObject(request.body);
    const estimateId = requiredInteger(body.estimateId, "Estimate id", 1);
    const sourcePackage = requiredText(body.package, 200, "Work package");
    const costType = parseLaborCostType(body.costType);
    const code = packageCode(body.code);
    const name = requiredText(body.name, 200, "Package name");
    const department = optionalBodyText(body.department, 100, "Department") ?? "";
    const projectType = optionalBodyText(body.projectType, 50, "Project type") ?? "";
    const description = optionalBodyText(body.description, 1000, "Description") ?? "";
    const created = await database.transaction(async (transaction) => {
      const read = new sql.Request(transaction);
      read.input("estimate_id", sql.BigInt, estimateId);
      read.input("package", sql.NVarChar(200), sourcePackage);
      read.input("cost_type", sql.NVarChar(30), costType);
      const source = (await read.query<{
        activity: string; department: string; level: string; cost_type: string; provider: string;
        engineers: number | string; man_days: number | string; hours_per_day: number | string;
        daily_rate: number | string; remark: string | null; rate_id: number | string | null;
        erp_category: string | null;
      }>(`
        SELECT line.activity, line.department, line.level, line.cost_type, line.provider,
               line.engineers, line.man_days, line.hours_per_day, line.daily_rate, line.remark,
               rate.id AS rate_id,
               NULLIF(mapping.erp_category, N'Unmapped') AS erp_category
        FROM dbo.manhour_lines line
        INNER JOIN dbo.estimates e ON e.id = line.estimate_id AND e.revision = line.revision AND e.deleted_at IS NULL
        OUTER APPLY (
          SELECT TOP(1) r.id FROM dbo.engineering_rates r
          WHERE line.provider = N'Internal' AND r.level = line.level AND r.department = line.department
            AND r.is_active = 1
            AND r.effective_from <= COALESCE(line.price_date, CONVERT(date, line.created_at))
            AND (r.effective_to IS NULL OR r.effective_to >= COALESCE(line.price_date, CONVERT(date, line.created_at)))
            AND line.daily_rate = CASE line.cost_type WHEN N'Installation' THEN r.installation_daily ELSE r.engineering_daily END
          ORDER BY r.effective_from DESC, r.id DESC
        ) rate
        LEFT JOIN dbo.estimate_erp_mappings mapping
          ON mapping.estimate_id = line.estimate_id AND mapping.revision = line.revision
         AND mapping.source_type = N'ManhourLine' AND mapping.source_id = line.id
        WHERE line.estimate_id = @estimate_id AND line.package = @package AND line.cost_type = @cost_type
          AND line.deleted_at IS NULL
        ORDER BY line.id;
      `)).recordset;
      if (!source.length) {
        throw new ApiError(404, "labor_package_source_empty",
          "That work package has no man-hour lines of this cost type in the current revision.");
      }
      if (source.length > MAXIMUM_PACKAGE_LINES) {
        throw validation(`A labor package cannot hold more than ${MAXIMUM_PACKAGE_LINES} activities.`);
      }
      const lines: PackageLineInput[] = source.map((line) => ({
        activity: line.activity, department: line.department, level: line.level,
        costType: line.cost_type as LaborCostType, provider: line.provider as LaborProvider,
        rateId: line.rate_id === null ? null : Number(line.rate_id),
        rateBasis: "Daily",
        defaultEngineers: roundTo(Number(line.engineers), 2),
        defaultManDays: roundTo(Number(line.man_days), 2),
        defaultHours: null,
        defaultHoursPerDay: roundTo(Number(line.hours_per_day), 2),
        referenceDailyRate: roundTo(Number(line.daily_rate), 4),
        defaultErpCategory: line.erp_category,
        remark: line.remark,
      }));
      const insert = new sql.Request(transaction);
      insert.input("code", sql.NVarChar(40), code);
      insert.input("name", sql.NVarChar(200), name);
      insert.input("cost_type", sql.NVarChar(30), costType);
      insert.input("department", sql.NVarChar(100), department);
      insert.input("project_type", sql.NVarChar(50), projectType);
      insert.input("description", sql.NVarChar(1000), description);
      insert.input("actor", sql.BigInt, actor.id);
      const row = (await insert.query<{ id: number | string }>(`
        IF EXISTS (SELECT 1 FROM dbo.labor_packages WHERE code = @code)
          THROW 51450, 'A labor package with this code already exists.', 1;
        DECLARE @created TABLE (id bigint NOT NULL);
        INSERT INTO dbo.labor_packages(code,name,cost_type,department,project_type,description,status,created_by,updated_by)
        OUTPUT inserted.id INTO @created (id)
        VALUES(@code,@name,@cost_type,@department,@project_type,@description,N'Draft',@actor,@actor);
        SELECT id FROM @created;
      `)).recordset[0]!;
      const packageId = Number(row.id);
      await replacePackageLines(transaction, packageId, lines);
      await insertAudit(transaction, actor.id, "LaborPackage", packageId, code, "Created from estimate", null, {
        estimateId, package: sourcePackage, costType, lines: lines.length,
      });
      return { id: packageId, code, lineCount: lines.length };
    });
    return reply.status(201).header("Location", `/api/v1/labor-packages/${created.id}`).send(created);
  });

  /**
   * Apply a published package to an estimate.
   *
   * Bulk create, nothing more: the same estimate lock, the same section-06
   * authorisation, the same owner and supplier validation, the same live rate
   * resolution and the same aggregate guard as the single man-hour endpoint.
   * Every stored default is overrideable through `lines`, and an internal rate
   * is never taken from the package or the caller — it is read from the master
   * at apply time and then frozen on the row exactly as it is today.
   */
  app.post("/api/v1/estimates/:id/apply-labor-package", async (request, reply) => {
    await users.demandPermission(request, "estimate.write");
    await demandTables();
    const actor = await users.required(request);
    const estimateId = positiveLong((request.params as { id?: string }).id, "Estimate id");
    const body = bodyObject(request.body);
    const estimateRowVersion = parseRowVersion(body.estimateRowVersion);
    const packageId = requiredInteger(body.packageId, "Package id", 1);
    const ownerId = requiredInteger(body.ownerId, "Owner", 1);
    const workPackageName = optionalBodyText(body.package, 200, "Work package");
    const rawOverrides = body.lines;
    if (rawOverrides !== undefined && rawOverrides !== null && !Array.isArray(rawOverrides)) {
      throw validation("Line overrides must be a list.");
    }
    const overrides = new Map<number, ApplyOverride>();
    for (const [index, value] of (Array.isArray(rawOverrides) ? rawOverrides : []).entries()) {
      const override = parseApplyOverride(value, index);
      if (overrides.has(override.lineId)) throw validation(`Line ${override.lineId} was overridden twice.`);
      overrides.set(override.lineId, override);
    }
    const today = todayIn(config.businessTimeZone);

    const applied = await database.transaction(async (transaction) => {
      const estimate = await lockEstimate(transaction, estimateId, estimateRowVersion);
      await demandNewSection(transaction, estimateId, estimate, actor, ENGINEERING_SECTION, ownerId);

      const header = new sql.Request(transaction);
      header.input("package_id", sql.BigInt, packageId);
      const pkg = (await header.query<{ code: string; name: string; cost_type: string; revision: number; status: string }>(`
        SELECT code,name,cost_type,revision,status FROM dbo.labor_packages WITH(UPDLOCK,HOLDLOCK) WHERE id=@package_id;
      `)).recordset[0];
      if (!pkg) throw new ApiError(404, "labor_package_not_found", "Labor package not found.");
      if (pkg.status !== "Active") {
        throw new ApiError(409, "labor_package_not_published",
          "Only published packages can be applied. Ask the package maintainer to publish this draft.");
      }
      const linesRequest = new sql.Request(transaction);
      linesRequest.input("package_id", sql.BigInt, packageId);
      const stored = (await linesRequest.query<{
        id: number | string; activity: string; department: string; level: string; cost_type: string;
        provider: string; rate_basis: string; default_engineers: number | string; default_man_days: number | string;
        default_hours: number | string | null; default_hours_per_day: number | string;
        reference_daily_rate: number | string; default_erp_category: string | null; remark: string | null;
      }>(`
        SELECT id,activity,department,level,cost_type,provider,rate_basis,default_engineers,default_man_days,
               default_hours,default_hours_per_day,reference_daily_rate,default_erp_category,remark
        FROM dbo.labor_package_lines WHERE package_id=@package_id AND deleted_at IS NULL ORDER BY sort_order,id;
      `)).recordset;
      if (!stored.length) throw new ApiError(409, "labor_package_empty", "This package has no activities to apply.");

      const knownIds = new Set(stored.map((line) => Number(line.id)));
      for (const lineId of overrides.keys()) {
        if (!knownIds.has(lineId)) throw validation(`Line ${lineId} does not belong to this package.`);
      }

      const reference = `${pkg.code} R${String(pkg.revision).padStart(2, "0")}`;
      const targetPackage = workPackageName ?? pkg.name;
      const written: Array<Record<string, unknown>> = [];

      for (const line of stored) {
        const lineId = Number(line.id);
        const override = overrides.get(lineId);
        if (override?.skip) continue;

        const effort = resolveLaborEffort({
          rateBasis: line.rate_basis as LaborRateBasis,
          defaultEngineers: Number(line.default_engineers),
          defaultManDays: Number(line.default_man_days),
          defaultHours: line.default_hours === null ? null : Number(line.default_hours),
          defaultHoursPerDay: Number(line.default_hours_per_day),
        }, {
          engineers: override?.engineers,
          manDays: override?.manDays,
          hours: override?.hours,
          hoursPerDay: override?.hoursPerDay,
        });

        const activity = override?.activity ?? line.activity;
        const provider = line.provider as LaborProvider;
        let supplierId: number | null = null;
        let quotationNumber: string | null = null;
        let priceDate = today;
        let dailyRate: number;

        if (provider === "Supplier") {
          /* A quotation belongs to this estimate, not to the library, so the
             apply has to carry it. Without it the line could not pass
             supplier_quote_required anyway. */
          if (override?.supplierId === undefined || override?.quotationNumber === undefined || override?.priceDate === undefined) {
            throw validation(`'${activity}' is a supplier activity, so applying it needs a supplier, quotation number and price date.`);
          }
          supplierId = override.supplierId;
          quotationNumber = override.quotationNumber;
          priceDate = override.priceDate;
          dailyRate = override.dailyRate ?? Number(line.reference_daily_rate);
        } else {
          if (override?.dailyRate !== undefined) {
            throw new ApiError(400, "internal_rate_not_editable",
              `'${activity}' is an internal activity, so its rate comes from the rate master and cannot be set on the line.`);
          }
          dailyRate = await resolveInternalDailyRate(transaction, line.cost_type, line.level, line.department, today, activity);
        }

        assertLaborLineCost(activity, effort.engineers, effort.manDays, dailyRate);
        await validateOwnerSupplier(transaction, ownerId, supplierId);

        const insert = new sql.Request(transaction);
        insert.input("estimate", sql.BigInt, estimateId);
        insert.input("revision", sql.Int, estimate.revision);
        insert.input("package", sql.NVarChar(200), targetPackage);
        insert.input("activity", sql.NVarChar(300), activity);
        insert.input("department", sql.NVarChar(100), line.department);
        insert.input("level", sql.NVarChar(100), line.level);
        insert.input("cost_type", sql.NVarChar(30), line.cost_type);
        insert.input("provider", sql.NVarChar(30), provider);
        insert.input("supplier", sql.BigInt, supplierId);
        insert.input("quotation", sql.NVarChar(100), quotationNumber);
        insert.input("price_date", sql.Date, priceDate);
        insert.input("engineers", sql.Decimal(9, 2), effort.engineers);
        insert.input("man_days", sql.Decimal(9, 2), effort.manDays);
        insert.input("hours", sql.Decimal(9, 2), effort.hoursPerDay);
        insert.input("rate", sql.Decimal(19, 4), dailyRate);
        insert.input("owner", sql.BigInt, ownerId);
        insert.input("remark", sql.NVarChar(sql.MAX), override?.remark !== undefined ? override.remark : line.remark);
        insert.input("actor", sql.BigInt, actor.id);
        const inserted = (await insert.query<{ id: number | string }>(`
          DECLARE @created TABLE(id bigint NOT NULL);
          INSERT INTO dbo.manhour_lines(estimate_id,revision,package,activity,department,level,cost_type,provider,
            supplier_id,quotation_no,price_date,engineers,man_days,hours_per_day,daily_rate,owner_id,remark,created_by,updated_by)
          OUTPUT inserted.id INTO @created(id)
          VALUES(@estimate,@revision,@package,@activity,@department,@level,@cost_type,@provider,@supplier,@quotation,
            @price_date,@engineers,@man_days,@hours,@rate,@owner,@remark,@actor,@actor);
          SELECT id FROM @created;
        `)).recordset[0]!;
        const manhourLineId = Number(inserted.id);

        /* EC-03. Seed the ERP classification while the estimator is still
           entering costs, instead of leaving it Unmapped until submit. Only
           where no mapping exists — a category somebody chose by hand is never
           overwritten. */
        const erpCategory = override?.erpCategoryProvided ? override.erpCategory : line.default_erp_category;
        let erpSeeded = false;
        if (erpCategory) {
          const mapping = new sql.Request(transaction);
          mapping.input("estimate", sql.BigInt, estimateId);
          mapping.input("revision", sql.Int, estimate.revision);
          mapping.input("line", sql.BigInt, manhourLineId);
          mapping.input("category", sql.NVarChar(30), erpCategory);
          mapping.input("actor", sql.BigInt, actor.id);
          const seeded = (await mapping.query<{ seeded: number | string }>(`
            INSERT INTO dbo.estimate_erp_mappings(estimate_id,revision,source_type,source_id,erp_category,created_by,updated_by)
            SELECT @estimate,@revision,N'ManhourLine',@line,@category,@actor,@actor
            WHERE NOT EXISTS(SELECT 1 FROM dbo.estimate_erp_mappings m WITH(UPDLOCK,HOLDLOCK)
              WHERE m.estimate_id=@estimate AND m.revision=@revision AND m.source_type=N'ManhourLine' AND m.source_id=@line);
            SELECT @@ROWCOUNT AS seeded;
          `)).recordset[0];
          erpSeeded = Number(seeded?.seeded ?? 0) > 0;
        }

        written.push({
          packageLineId: lineId, manhourLineId, activity, level: line.level, department: line.department,
          costType: line.cost_type, provider, engineers: effort.engineers, manDays: effort.manDays,
          hoursPerDay: effort.hoursPerDay, requestedHours: effort.requestedHours,
          effectiveHours: effort.effectiveHours, dailyRate, priceDate,
          rateSource: provider === "Supplier" ? "Supplier quotation" : "Engineering Rate Master",
          erpCategory: erpSeeded ? erpCategory : null,
        });
      }

      if (!written.length) throw validation("Every activity in this package was skipped, so there is nothing to add.");

      /* Every monetary write path calls the aggregate guard itself rather than
         trusting a helper to do it — see docs/planning/COST_TOTAL_GUARD.md and
         tests/estimate-total-guardrails.test.mjs. Running it here also means a
         package that would overflow the estimate ledger fails against the apply
         that caused it, before any ERP mapping is written. touchEstimate runs
         the same guard again before it touches the estimate row. */
      await assertEstimateTotals(transaction, estimateId);
      const estimateVersion = await touchEstimate(transaction, estimateId, actor.id);
      /* Provenance. dbo.manhour_lines has no reference column, so the package,
         its revision and the rate each line was frozen at are recorded here,
         the same way a module template apply records itself. */
      await insertAudit(transaction, actor.id, "Estimate", estimateId, estimate.estimate_no, "Labor package applied", null, {
        package: pkg.code, packageName: pkg.name, packageRevision: pkg.revision, reference,
        workPackage: targetPackage, costType: pkg.cost_type, ownerId, lines: written.length,
        skipped: stored.length - written.length, resolvedOn: today, appliedLines: written,
      });

      return {
        packageId, reference, workPackage: targetPackage, lines: written.length,
        skipped: stored.length - written.length, appliedLines: written,
        estimateRowVersion: estimateVersion.toString("base64"),
      };
    });
    return reply.status(201).send(applied);
  });
}
