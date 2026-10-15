import type { FastifyInstance, FastifyRequest } from "fastify";
import sql from "mssql";
import type { Transaction as TransactionType } from "mssql";
import { insertAudit } from "../audit.js";
import { businessToday } from "../business-date.js";
import type { AppConfig } from "../config.js";
import type { Database } from "../db.js";
import { ApiError } from "../errors.js";
import { bodyObject, clampedInteger, dateOnly, optionalPositiveLong, optionalText, parseRowVersion, positiveLong } from "../http.js";
import {
  ASSET_CATEGORIES, ASSET_STATUSES, MANUAL_EVENT_KINDS, assetChangeEvents, parseAssetInput, parseCabinetInput, warrantyState, type AssetInput,
  type CabinetInput,
} from "../installed-base.js";
import type { CurrentUserService } from "../users.js";

/**
 * Installed base HTTP API (asset.read / asset.manage).
 *
 *   GET    /api/v1/assets                 list with filters, paging and facet counts
 *   GET    /api/v1/assets/options         customers, cabinets, Site Monitor sites and programs to link
 *   POST   /api/v1/assets/cabinets        add a cabinet to a customer
 *   PUT    /api/v1/assets/cabinets/:id    edit a cabinet (rowVersion)
 *   DELETE /api/v1/assets/cabinets/:id    withdraw an empty cabinet
 *   GET    /api/v1/assets/:id             one asset with its names resolved and its timeline
 *   POST   /api/v1/assets                 register
 *   PUT    /api/v1/assets/:id             edit (rowVersion); the difference becomes timeline events
 *   POST   /api/v1/assets/:id/events      a note or a service visit
 *   DELETE /api/v1/assets/:id             withdraw (soft delete; the record and its history stay)
 */
const READ = "asset.read";
const MANAGE = "asset.manage";

type AssetRow = {
  id: number | string; asset_no: string; customer_id: number | string; customer_name: string; customer_code: string;
  customer_site_id: number | string | null; customer_site_name: string | null;
  cabinet_id: number | string | null; cabinet_name: string | null;
  project_id: number | string | null; project_no: string | null; project_name: string | null;
  monitor_site_id: number | string | null; monitor_site_name: string | null;
  monitor_program_id: number | string | null; monitor_program_name: string | null; monitor_program_running: boolean | null;
  monitor_agent_online: boolean | null;
  category: string; name: string; manufacturer: string; model: string; serial_no: string; location_detail: string;
  ip_address: string; firmware_version: string; repository: string; installed_on: Date | string | null;
  warranty_until: Date | string | null; status: string; replaced_by_id: number | string | null; replaced_by_no: string | null;
  notes: string; created_at: Date; updated_at: Date; updated_by_name: string; row_version: Buffer; total_count?: number | string;
};

const ASSET_SELECT = `
  a.id, a.asset_no, a.customer_id, c.name AS customer_name, c.code AS customer_code,
  a.customer_site_id, cs.name AS customer_site_name,
  a.cabinet_id, cab.name AS cabinet_name,
  a.project_id, p.project_no, p.name AS project_name,
  a.monitor_site_id, ms.name AS monitor_site_name,
  a.monitor_program_id, mp.name AS monitor_program_name, mp.is_running AS monitor_program_running, ma.is_online AS monitor_agent_online,
  a.category, a.name, a.manufacturer, a.model, a.serial_no, a.location_detail, a.ip_address, a.firmware_version, a.repository,
  a.installed_on, a.warranty_until, a.status, a.replaced_by_id, rb.asset_no AS replaced_by_no, a.notes,
  a.created_at, a.updated_at, uu.name AS updated_by_name, a.row_version`;

const ASSET_FROM = `
  FROM dbo.installed_assets a
  INNER JOIN dbo.customers c ON c.id = a.customer_id
  INNER JOIN dbo.users uu ON uu.id = a.updated_by
  LEFT JOIN dbo.customer_sites cs ON cs.id = a.customer_site_id
  LEFT JOIN dbo.installed_cabinets cab ON cab.id = a.cabinet_id
  LEFT JOIN dbo.projects p ON p.id = a.project_id
  LEFT JOIN dbo.monitor_sites ms ON ms.id = a.monitor_site_id
  LEFT JOIN dbo.monitor_programs mp ON mp.id = a.monitor_program_id AND mp.removed_at IS NULL
  LEFT JOIN dbo.monitor_agents ma ON ma.id = mp.agent_id
  LEFT JOIN dbo.installed_assets rb ON rb.id = a.replaced_by_id`;

const nullableId = (value: number | string | null) => (value === null || value === undefined ? null : Number(value));

function assetDto(row: AssetRow, today: string) {
  const warrantyUntil = dateOnly(row.warranty_until);
  return {
    id: Number(row.id),
    assetNo: row.asset_no,
    customer: { id: Number(row.customer_id), code: row.customer_code, name: row.customer_name },
    customerSite: row.customer_site_id === null ? null : { id: Number(row.customer_site_id), name: row.customer_site_name ?? "" },
    cabinet: row.cabinet_id === null ? null : { id: Number(row.cabinet_id), name: row.cabinet_name ?? "" },
    project: row.project_id === null ? null : { id: Number(row.project_id), projectNo: row.project_no ?? "", name: row.project_name ?? "" },
    monitorSite: row.monitor_site_id === null ? null : { id: Number(row.monitor_site_id), name: row.monitor_site_name ?? "" },
    monitorProgram: row.monitor_program_id === null ? null : {
      id: Number(row.monitor_program_id), name: row.monitor_program_name ?? "",
      isRunning: row.monitor_program_running === true, agentOnline: row.monitor_agent_online === true,
    },
    category: row.category,
    name: row.name,
    manufacturer: row.manufacturer,
    model: row.model,
    serialNo: row.serial_no,
    locationDetail: row.location_detail,
    ipAddress: row.ip_address,
    firmwareVersion: row.firmware_version,
    repository: row.repository,
    installedOn: dateOnly(row.installed_on),
    warrantyUntil,
    warranty: warrantyState(warrantyUntil, today),
    status: row.status,
    replacedBy: row.replaced_by_id === null ? null : { id: Number(row.replaced_by_id), assetNo: row.replaced_by_no ?? "" },
    notes: row.notes,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
    updatedBy: row.updated_by_name,
    rowVersion: row.row_version.toString("base64"),
  };
}

function inputFromRow(row: AssetRow): AssetInput {
  return {
    customerId: Number(row.customer_id), customerSiteId: nullableId(row.customer_site_id), cabinetId: nullableId(row.cabinet_id),
    projectId: nullableId(row.project_id),
    monitorSiteId: nullableId(row.monitor_site_id), monitorProgramId: nullableId(row.monitor_program_id),
    category: row.category as AssetInput["category"], name: row.name, manufacturer: row.manufacturer, model: row.model,
    serialNo: row.serial_no, locationDetail: row.location_detail, ipAddress: row.ip_address, firmwareVersion: row.firmware_version,
    repository: row.repository, installedOn: dateOnly(row.installed_on), warrantyUntil: dateOnly(row.warranty_until),
    status: row.status as AssetInput["status"], replacedById: nullableId(row.replaced_by_id), notes: row.notes,
  };
}

function isDuplicateKey(error: unknown): boolean {
  const number = (error as { number?: number; originalError?: { info?: { number?: number } } })?.number
    ?? (error as { originalError?: { info?: { number?: number } } })?.originalError?.info?.number;
  return number === 2601 || number === 2627;
}

/** A duplicate on one named unique index (SQL Server names the index in its message). */
function isDuplicateOn(error: unknown, index: string): boolean {
  return isDuplicateKey(error) && String((error as { message?: unknown })?.message ?? "").includes(index);
}

// The statements are constants so tests/installed-assets-sql.ps1 runs exactly this text on a real SQL Server.
export const REFERENCES_SQL = `
  SELECT
    (SELECT COUNT(*) FROM dbo.customers WHERE id = @customer AND deleted_at IS NULL) AS customer_ok,
    CASE WHEN @customer_site IS NULL THEN 1 ELSE
      (SELECT COUNT(*) FROM dbo.customer_sites WHERE id = @customer_site AND customer_id = @customer AND deleted_at IS NULL) END AS site_ok,
    CASE WHEN @cabinet IS NULL THEN 1 ELSE
      (SELECT COUNT(*) FROM dbo.installed_cabinets WHERE id = @cabinet AND customer_id = @customer AND deleted_at IS NULL
         AND (customer_site_id IS NULL OR @customer_site IS NULL OR customer_site_id = @customer_site)) END AS cabinet_ok,
    CASE WHEN @project IS NULL THEN 1 ELSE (SELECT COUNT(*) FROM dbo.projects WHERE id = @project AND deleted_at IS NULL) END AS project_ok,
    CASE WHEN @monitor_site IS NULL THEN 1 ELSE (SELECT COUNT(*) FROM dbo.monitor_sites WHERE id = @monitor_site) END AS monitor_site_ok,
    CASE WHEN @monitor_program IS NULL THEN 1 ELSE
      (SELECT COUNT(*) FROM dbo.monitor_programs mp INNER JOIN dbo.monitor_agents ma ON ma.id = mp.agent_id
       WHERE mp.id = @monitor_program AND ma.site_id = @monitor_site AND mp.removed_at IS NULL) END AS program_ok,
    CASE WHEN @replaced_by IS NULL THEN 1 ELSE
      (SELECT COUNT(*) FROM dbo.installed_assets WHERE id = @replaced_by AND deleted_at IS NULL AND (@asset IS NULL OR id <> @asset)) END AS replaced_ok;`;

/**
 * The next number is the highest one still in use + 1, so deleting the newest asset frees its number.
 * UPDLOCK + HOLDLOCK on the live-number index serialises concurrent registrations; the unique index
 * UQ_installed_assets_seq is the backstop, and the route retries on it.
 */
export const INSERT_SQL = `
  DECLARE @seq int = (SELECT ISNULL(MAX(asset_seq), 0) + 1 FROM dbo.installed_assets WITH (UPDLOCK, HOLDLOCK) WHERE deleted_at IS NULL);
  INSERT dbo.installed_assets (asset_seq, cabinet_id, customer_id, customer_site_id, project_id, monitor_site_id, monitor_program_id, category, name,
    manufacturer, model, serial_no, location_detail, ip_address, firmware_version, repository, installed_on, warranty_until,
    status, replaced_by_id, notes, created_by, updated_by)
  OUTPUT inserted.id, inserted.asset_no
  VALUES (@seq, @cabinet, @customer, @customer_site, @project, @monitor_site, @monitor_program, @category, @name, @manufacturer, @model, @serial,
    @location, @ip, @firmware, @repository, @installed_on, @warranty_until, @status, @replaced_by, @notes, @actor, @actor);`;

export const UPDATE_SQL = `
  UPDATE dbo.installed_assets SET customer_id = @customer, customer_site_id = @customer_site, cabinet_id = @cabinet, project_id = @project,
    monitor_site_id = @monitor_site, monitor_program_id = @monitor_program, category = @category, name = @name,
    manufacturer = @manufacturer, model = @model, serial_no = @serial, location_detail = @location, ip_address = @ip,
    firmware_version = @firmware, repository = @repository, installed_on = @installed_on, warranty_until = @warranty_until,
    status = @status, replaced_by_id = @replaced_by, notes = @notes, updated_by = @actor, updated_at = SYSUTCDATETIME()
  WHERE id = @id;`;

export const EVENT_INSERT_SQL = `INSERT dbo.installed_asset_events (asset_id, kind, summary, details, actor_id) VALUES (@asset, @kind, @summary, @details, @actor);`;

const LIST_FILTERS = `
  a.deleted_at IS NULL
  AND (@customer IS NULL OR a.customer_id = @customer)
  AND (@customer_site IS NULL OR a.customer_site_id = @customer_site)
  AND (@cabinet IS NULL OR a.cabinet_id = @cabinet)
  AND (@project IS NULL OR a.project_id = @project)
  AND (@monitor_site IS NULL OR a.monitor_site_id = @monitor_site)
  AND (@monitor_program IS NULL OR a.monitor_program_id = @monitor_program)
  AND (@search IS NULL OR a.asset_no LIKE N'%' + @search + N'%' OR a.name LIKE N'%' + @search + N'%'
    OR a.serial_no LIKE N'%' + @search + N'%' OR a.model LIKE N'%' + @search + N'%' OR a.manufacturer LIKE N'%' + @search + N'%'
    OR a.ip_address LIKE N'%' + @search + N'%' OR a.location_detail LIKE N'%' + @search + N'%' OR c.name LIKE N'%' + @search + N'%'
    OR cab.name LIKE N'%' + @search + N'%')
  AND (@warranty IS NULL
    OR (@warranty = N'none' AND a.warranty_until IS NULL)
    OR (@warranty = N'expired' AND a.warranty_until < @today)
    OR (@warranty = N'expiring' AND a.warranty_until >= @today AND a.warranty_until <= DATEADD(day, 60, @today))
    OR (@warranty = N'covered' AND a.warranty_until > DATEADD(day, 60, @today)))`;

/**
 * The page, then facet counts; each facet ignores its own filter, so a chip shows what choosing it gives.
 * @sort = 'location' orders customer -> cabinet (assets outside a cabinet last) -> asset number, which is
 * what the grouped view draws; otherwise the most recently changed come first.
 */
export const LIST_SQL = `
  SELECT ${ASSET_SELECT}, COUNT_BIG(*) OVER() AS total_count
  ${ASSET_FROM}
  WHERE ${LIST_FILTERS} AND (@category IS NULL OR a.category = @category) AND (@status IS NULL OR a.status = @status)
  ORDER BY
    CASE WHEN @sort = N'location' THEN c.name END,
    CASE WHEN @sort = N'location' THEN c.id END,
    CASE WHEN @sort = N'location' THEN IIF(a.cabinet_id IS NULL, 1, 0) END,
    CASE WHEN @sort = N'location' THEN cab.name END,
    CASE WHEN @sort = N'location' THEN a.asset_seq END,
    a.updated_at DESC, a.id DESC
  OFFSET @offset ROWS FETCH NEXT @page_size ROWS ONLY;
  SELECT a.status AS value, COUNT_BIG(*) AS count ${ASSET_FROM} WHERE ${LIST_FILTERS} AND (@category IS NULL OR a.category = @category) GROUP BY a.status;
  SELECT a.category AS value, COUNT_BIG(*) AS count ${ASSET_FROM} WHERE ${LIST_FILTERS} AND (@status IS NULL OR a.status = @status) GROUP BY a.category;`;

export const DETAIL_SQL = `SELECT ${ASSET_SELECT} ${ASSET_FROM} WHERE a.id = @id AND a.deleted_at IS NULL;`;
export const DETAIL_FOR_UPDATE_SQL = `SELECT ${ASSET_SELECT} ${ASSET_FROM.replace("FROM dbo.installed_assets a", "FROM dbo.installed_assets a WITH (UPDLOCK)")}
  WHERE a.id = @id AND a.deleted_at IS NULL;`;
export const EVENTS_SQL = `
  SELECT TOP (200) e.id, e.kind, e.summary, e.details, e.occurred_at, u.name AS actor_name
  FROM dbo.installed_asset_events e LEFT JOIN dbo.users u ON u.id = e.actor_id
  WHERE e.asset_id = @id ORDER BY e.occurred_at DESC, e.id DESC;`;

/** Live cabinets with how many live assets each holds; the grouped view also draws the empty ones. */
export const CABINETS_SQL = `
  SELECT cab.id, cab.customer_id, cab.customer_site_id, cs.name AS customer_site_name, cab.name, cab.location_detail, cab.notes,
    (SELECT COUNT_BIG(*) FROM dbo.installed_assets a WHERE a.cabinet_id = cab.id AND a.deleted_at IS NULL) AS asset_count,
    cab.row_version
  FROM dbo.installed_cabinets cab
  LEFT JOIN dbo.customer_sites cs ON cs.id = cab.customer_site_id
  WHERE cab.deleted_at IS NULL AND (@cabinet IS NULL OR cab.id = @cabinet)
  ORDER BY cab.name, cab.id;`;

export const CABINET_REFERENCES_SQL = `
  SELECT
    (SELECT COUNT(*) FROM dbo.customers WHERE id = @customer AND deleted_at IS NULL) AS customer_ok,
    CASE WHEN @customer_site IS NULL THEN 1 ELSE
      (SELECT COUNT(*) FROM dbo.customer_sites WHERE id = @customer_site AND customer_id = @customer AND deleted_at IS NULL) END AS site_ok;`;

export const CABINET_INSERT_SQL = `
  INSERT dbo.installed_cabinets (customer_id, customer_site_id, name, location_detail, notes, created_by, updated_by)
  OUTPUT inserted.id
  VALUES (@customer, @customer_site, @name, @location, @notes, @actor, @actor);`;

/** The cabinet, locked, with what its live assets would contradict: another customer or another site. */
export const CABINET_FOR_UPDATE_SQL = `
  SELECT cab.customer_id, cab.customer_site_id, cab.name, cab.row_version,
    (SELECT COUNT_BIG(*) FROM dbo.installed_assets a WHERE a.cabinet_id = cab.id AND a.deleted_at IS NULL) AS asset_count,
    (SELECT COUNT_BIG(*) FROM dbo.installed_assets a WHERE a.cabinet_id = cab.id AND a.deleted_at IS NULL
       AND a.customer_site_id IS NOT NULL AND (@customer_site IS NULL OR a.customer_site_id <> @customer_site)) AS other_site_count
  FROM dbo.installed_cabinets cab WITH (UPDLOCK)
  WHERE cab.id = @id AND cab.deleted_at IS NULL;`;

export const CABINET_UPDATE_SQL = `
  UPDATE dbo.installed_cabinets SET customer_id = @customer, customer_site_id = @customer_site, name = @name,
    location_detail = @location, notes = @notes, updated_by = @actor, updated_at = SYSUTCDATETIME()
  WHERE id = @id;`;

export const CABINET_DELETE_SQL = `
  UPDATE dbo.installed_cabinets SET deleted_at = SYSUTCDATETIME(), updated_by = @actor, updated_at = SYSUTCDATETIME() WHERE id = @id;`;

type CabinetRow = {
  id: number | string; customer_id: number | string; customer_site_id: number | string | null; customer_site_name: string | null;
  name: string; location_detail: string; notes: string; asset_count: number | string; row_version: Buffer;
};

function cabinetDto(row: CabinetRow) {
  return {
    id: Number(row.id),
    customerId: Number(row.customer_id),
    customerSite: row.customer_site_id === null ? null : { id: Number(row.customer_site_id), name: row.customer_site_name ?? "" },
    name: row.name,
    locationDetail: row.location_detail,
    notes: row.notes,
    assetCount: Number(row.asset_count),
    rowVersion: row.row_version.toString("base64"),
  };
}

/** Every reference must exist and fit together, checked in the transaction that writes. */
async function checkReferences(transaction: TransactionType, input: AssetInput, assetId: number | null): Promise<void> {
  const result = await new sql.Request(transaction)
    .input("customer", sql.BigInt, input.customerId)
    .input("customer_site", sql.BigInt, input.customerSiteId)
    .input("cabinet", sql.BigInt, input.cabinetId)
    .input("project", sql.BigInt, input.projectId)
    .input("monitor_site", sql.BigInt, input.monitorSiteId)
    .input("monitor_program", sql.BigInt, input.monitorProgramId)
    .input("replaced_by", sql.BigInt, input.replacedById)
    .input("asset", sql.BigInt, assetId)
    .query<Record<string, number>>(REFERENCES_SQL);
  const row = result.recordset[0]!;
  if (!row.customer_ok) throw new ApiError(422, "asset_customer_unavailable", "The customer does not exist.");
  if (!row.site_ok) throw new ApiError(422, "asset_site_unavailable", "The customer site does not belong to this customer.");
  if (!row.cabinet_ok) throw new ApiError(422, "asset_cabinet_unavailable", "The cabinet does not belong to this customer and site.");
  if (!row.project_ok) throw new ApiError(422, "asset_project_unavailable", "The project does not exist.");
  if (!row.monitor_site_ok) throw new ApiError(422, "asset_monitor_site_unavailable", "The Site Monitor site does not exist.");
  if (!row.program_ok) throw new ApiError(422, "asset_program_unavailable", "The monitored program is not reported by this Site Monitor site.");
  if (!row.replaced_ok) throw new ApiError(422, "asset_replacement_unavailable", "The replacement must be another registered asset.");
}

async function insertEvent(
  transaction: TransactionType, assetId: number, kind: string, summary: string, details: unknown, actorId: number | null,
): Promise<void> {
  await new sql.Request(transaction)
    .input("asset", sql.BigInt, assetId)
    .input("kind", sql.NVarChar(20), kind)
    .input("summary", sql.NVarChar(500), summary.slice(0, 500))
    .input("details", sql.NVarChar(sql.MAX), details === null || details === undefined ? null : JSON.stringify(details))
    .input("actor", sql.BigInt, actorId)
    .query(EVENT_INSERT_SQL);
}

async function checkCabinetReferences(transaction: TransactionType, customerId: number, customerSiteId: number | null): Promise<void> {
  const result = await new sql.Request(transaction)
    .input("customer", sql.BigInt, customerId)
    .input("customer_site", sql.BigInt, customerSiteId)
    .query<Record<string, number>>(CABINET_REFERENCES_SQL);
  const row = result.recordset[0]!;
  if (!row.customer_ok) throw new ApiError(422, "asset_customer_unavailable", "The customer does not exist.");
  if (!row.site_ok) throw new ApiError(422, "asset_site_unavailable", "The customer site does not belong to this customer.");
}

function bindCabinet(request: sql.Request, input: CabinetInput): sql.Request {
  return request
    .input("customer", sql.BigInt, input.customerId)
    .input("customer_site", sql.BigInt, input.customerSiteId)
    .input("name", sql.NVarChar(200), input.name)
    .input("location", sql.NVarChar(300), input.locationDetail)
    .input("notes", sql.NVarChar(1000), input.notes);
}

function bindInput(request: sql.Request, input: AssetInput): sql.Request {
  return request
    .input("customer", sql.BigInt, input.customerId)
    .input("customer_site", sql.BigInt, input.customerSiteId)
    .input("cabinet", sql.BigInt, input.cabinetId)
    .input("project", sql.BigInt, input.projectId)
    .input("monitor_site", sql.BigInt, input.monitorSiteId)
    .input("monitor_program", sql.BigInt, input.monitorProgramId)
    .input("category", sql.NVarChar(20), input.category)
    .input("name", sql.NVarChar(200), input.name)
    .input("manufacturer", sql.NVarChar(150), input.manufacturer)
    .input("model", sql.NVarChar(150), input.model)
    .input("serial", sql.NVarChar(150), input.serialNo)
    .input("location", sql.NVarChar(300), input.locationDetail)
    .input("ip", sql.NVarChar(100), input.ipAddress)
    .input("firmware", sql.NVarChar(100), input.firmwareVersion)
    .input("repository", sql.NVarChar(100), input.repository)
    .input("installed_on", sql.Date, input.installedOn)
    .input("warranty_until", sql.Date, input.warrantyUntil)
    .input("status", sql.NVarChar(20), input.status)
    .input("replaced_by", sql.BigInt, input.replacedById)
    .input("notes", sql.NVarChar(2000), input.notes);
}

export function registerInstalledAssetRoutes(app: FastifyInstance, config: AppConfig, database: Database, users: CurrentUserService): void {
  const today = () => businessToday(config.businessTimeZone);
  const assetId = (request: FastifyRequest) => positiveLong((request.params as Record<string, unknown>).id, "Asset");

  const readAsset = async (id: number): Promise<AssetRow> => {
    const result = await database.query<AssetRow>(DETAIL_SQL, (request) => request.input("id", sql.BigInt, id));
    const row = result.recordset[0];
    if (!row) throw new ApiError(404, "asset_not_found", "The asset was not found.");
    return row;
  };

  app.get("/api/v1/assets", async (request) => {
    await users.demandPermission(request, READ);
    const query = request.query as Record<string, unknown>;
    const page = clampedInteger(query.page, 1, 1, Number.MAX_SAFE_INTEGER);
    const pageSize = clampedInteger(query.pageSize, 50, 1, 200);
    const search = optionalText(query.search, 200, "Search");
    const category = optionalText(query.category, 20, "Category");
    const status = optionalText(query.status, 20, "Status");
    const warranty = optionalText(query.warranty, 20, "Warranty");
    if (category && !(ASSET_CATEGORIES as readonly string[]).includes(category)) throw new ApiError(400, "validation_failed", "Unknown category.");
    if (status && !(ASSET_STATUSES as readonly string[]).includes(status)) throw new ApiError(400, "validation_failed", "Unknown status.");
    if (warranty && !["expired", "expiring", "covered", "none"].includes(warranty)) throw new ApiError(400, "validation_failed", "Unknown warranty filter.");
    const sort = optionalText(query.sort, 20, "Sort");
    if (sort && sort !== "location" && sort !== "updated") throw new ApiError(400, "validation_failed", "Unknown sort.");
    const businessDate = today();
    const bind = (request: sql.Request) => request
      .input("customer", sql.BigInt, optionalPositiveLong(query.customerId, "Customer"))
      .input("customer_site", sql.BigInt, optionalPositiveLong(query.customerSiteId, "Customer site"))
      .input("cabinet", sql.BigInt, optionalPositiveLong(query.cabinetId, "Cabinet"))
      .input("sort", sql.NVarChar(20), sort)
      .input("project", sql.BigInt, optionalPositiveLong(query.projectId, "Project"))
      .input("monitor_site", sql.BigInt, optionalPositiveLong(query.monitorSiteId, "Monitor site"))
      .input("monitor_program", sql.BigInt, optionalPositiveLong(query.monitorProgramId, "Monitored program"))
      .input("search", sql.NVarChar(200), search)
      .input("warranty", sql.NVarChar(20), warranty)
      .input("today", sql.Date, businessDate)
      .input("category", sql.NVarChar(20), category)
      .input("status", sql.NVarChar(20), status)
      .input("offset", sql.Int, (page - 1) * pageSize)
      .input("page_size", sql.Int, pageSize);
    const result = await database.query<AssetRow>(LIST_SQL, bind);
    const recordsets = result.recordsets as unknown as [AssetRow[], Array<{ value: string; count: number | string }>, Array<{ value: string; count: number | string }>];
    const facet = (rows: Array<{ value: string; count: number | string }>) => Object.fromEntries(rows.map((row) => [row.value, Number(row.count)]));
    return {
      items: recordsets[0].map((row) => assetDto(row, businessDate)),
      page, pageSize, total: Number(recordsets[0][0]?.total_count ?? 0),
      facets: { status: facet(recordsets[1]), category: facet(recordsets[2]) },
    };
  });

  app.get("/api/v1/assets/options", async (request) => {
    await users.demandPermission(request, READ);
    const query = request.query as Record<string, unknown>;
    const customerId = optionalPositiveLong(query.customerId, "Customer");
    const result = await database.query(`
      SELECT id, code, name FROM dbo.customers WHERE deleted_at IS NULL ORDER BY name;
      SELECT id, customer_id AS customerId, code, name FROM dbo.customer_sites
        WHERE deleted_at IS NULL AND is_active = 1 AND (@customer IS NULL OR customer_id = @customer) ORDER BY name;
      SELECT id, name FROM dbo.monitor_sites WHERE is_active = 1 ORDER BY name;
      SELECT mp.id, ma.site_id AS siteId, mp.name, ma.name AS agentName
        FROM dbo.monitor_programs mp INNER JOIN dbo.monitor_agents ma ON ma.id = mp.agent_id
        WHERE mp.removed_at IS NULL AND ma.revoked_at IS NULL ORDER BY mp.name;
    `, (request) => request.input("customer", sql.BigInt, customerId));
    const [customers, sites, monitorSites, programs] = result.recordsets as unknown as Array<Array<Record<string, unknown>>>;
    const cabinets = await database.query<CabinetRow>(CABINETS_SQL, (request) => request.input("cabinet", sql.BigInt, null));
    const ids = (rows: Array<Record<string, unknown>> | undefined) => (rows ?? []).map((row) => ({
      ...row, id: Number(row.id), ...(row.customerId !== undefined ? { customerId: Number(row.customerId) } : {}),
      ...(row.siteId !== undefined ? { siteId: Number(row.siteId) } : {}),
    }));
    return {
      categories: ASSET_CATEGORIES, statuses: ASSET_STATUSES,
      customers: ids(customers), customerSites: ids(sites), monitorSites: ids(monitorSites), monitorPrograms: ids(programs),
      cabinets: cabinets.recordset.map(cabinetDto),
    };
  });

  const cabinetId = (request: FastifyRequest) => positiveLong((request.params as Record<string, unknown>).id, "Cabinet");
  const readCabinet = async (id: number) => {
    const result = await database.query<CabinetRow>(CABINETS_SQL, (request) => request.input("cabinet", sql.BigInt, id));
    const row = result.recordset[0];
    if (!row) throw new ApiError(404, "cabinet_not_found", "The cabinet was not found.");
    return cabinetDto(row);
  };
  const cabinetNameTaken = () => new ApiError(409, "cabinet_name_taken", "This customer already has a cabinet with that name.");

  app.post("/api/v1/assets/cabinets", async (request, reply) => {
    await users.demandPermission(request, MANAGE);
    const actor = await users.required(request);
    const input = parseCabinetInput(bodyObject(request.body));
    try {
      const id = await database.transaction(async (transaction) => {
        await checkCabinetReferences(transaction, input.customerId, input.customerSiteId);
        const inserted = await bindCabinet(new sql.Request(transaction), input).input("actor", sql.BigInt, actor.id)
          .query<{ id: number | string }>(CABINET_INSERT_SQL);
        const newId = Number(inserted.recordset[0]!.id);
        await insertAudit(transaction, actor.id, "InstalledCabinet", newId, input.name, "Created", null, input);
        return newId;
      });
      return reply.code(201).send(await readCabinet(id));
    } catch (error) {
      if (isDuplicateOn(error, "UQ_installed_cabinets_name")) throw cabinetNameTaken();
      throw error;
    }
  });

  app.put("/api/v1/assets/cabinets/:id", async (request) => {
    await users.demandPermission(request, MANAGE);
    const actor = await users.required(request);
    const id = cabinetId(request);
    const raw = bodyObject(request.body);
    const rowVersion = parseRowVersion(raw.rowVersion);
    const input = parseCabinetInput(raw);
    try {
      await database.transaction(async (transaction) => {
        const current = await new sql.Request(transaction).input("id", sql.BigInt, id).input("customer_site", sql.BigInt, input.customerSiteId)
          .query<{ customer_id: number | string; customer_site_id: number | string | null; name: string; row_version: Buffer; asset_count: number | string; other_site_count: number | string }>(
            CABINET_FOR_UPDATE_SQL);
        const before = current.recordset[0];
        if (!before) throw new ApiError(404, "cabinet_not_found", "The cabinet was not found.");
        if (!before.row_version.equals(rowVersion)) throw new ApiError(409, "concurrency_conflict", "The cabinet was changed by someone else. Reload it and try again.");
        // Its equipment belongs to the cabinet's customer and site; moving the cabinet must not contradict them.
        if (Number(before.customer_id) !== input.customerId && Number(before.asset_count) > 0) {
          throw new ApiError(409, "cabinet_has_assets", "Move the equipment out of this cabinet before giving it to another customer.");
        }
        if (input.customerSiteId !== null && Number(before.other_site_count) > 0) {
          throw new ApiError(409, "cabinet_site_conflict", "Equipment in this cabinet is registered at another site.");
        }
        await checkCabinetReferences(transaction, input.customerId, input.customerSiteId);
        await bindCabinet(new sql.Request(transaction), input).input("id", sql.BigInt, id).input("actor", sql.BigInt, actor.id)
          .query(CABINET_UPDATE_SQL);
        await insertAudit(transaction, actor.id, "InstalledCabinet", id, input.name, "Updated",
          { customerId: Number(before.customer_id), customerSiteId: nullableId(before.customer_site_id), name: before.name }, input);
      });
    } catch (error) {
      if (isDuplicateOn(error, "UQ_installed_cabinets_name")) throw cabinetNameTaken();
      throw error;
    }
    return readCabinet(id);
  });

  app.delete("/api/v1/assets/cabinets/:id", async (request, reply) => {
    await users.demandPermission(request, MANAGE);
    const actor = await users.required(request);
    const id = cabinetId(request);
    await database.transaction(async (transaction) => {
      const current = await new sql.Request(transaction).input("id", sql.BigInt, id).input("customer_site", sql.BigInt, null)
        .query<{ name: string; asset_count: number | string }>(CABINET_FOR_UPDATE_SQL);
      const row = current.recordset[0];
      if (!row) throw new ApiError(404, "cabinet_not_found", "The cabinet was not found.");
      if (Number(row.asset_count) > 0) throw new ApiError(409, "cabinet_not_empty", "Move or remove the equipment in this cabinet first.");
      await new sql.Request(transaction).input("id", sql.BigInt, id).input("actor", sql.BigInt, actor.id).query(CABINET_DELETE_SQL);
      await insertAudit(transaction, actor.id, "InstalledCabinet", id, row.name, "Deleted", { name: row.name }, null);
    });
    return reply.code(204).send();
  });

  app.get("/api/v1/assets/:id", async (request) => {
    await users.demandPermission(request, READ);
    const id = assetId(request);
    const row = await readAsset(id);
    const events = await database.query<{ id: number | string; kind: string; summary: string; details: string | null; occurred_at: Date; actor_name: string | null }>(
      EVENTS_SQL, (request) => request.input("id", sql.BigInt, id));
    const canManage = await users.demandPermission(request, MANAGE).then(() => true, () => false);
    return {
      ...assetDto(row, today()),
      canManage,
      events: events.recordset.map((event) => ({
        id: Number(event.id), kind: event.kind, summary: event.summary,
        details: event.details ? JSON.parse(event.details) as unknown : null,
        occurredAt: event.occurred_at.toISOString(), actor: event.actor_name,
      })),
    };
  });

  app.post("/api/v1/assets", async (request, reply) => {
    await users.demandPermission(request, MANAGE);
    const actor = await users.required(request);
    const input = parseAssetInput(bodyObject(request.body));
    const register = () => database.transaction(async (transaction) => {
      await checkReferences(transaction, input, null);
      const inserted = await bindInput(new sql.Request(transaction), input)
        .input("actor", sql.BigInt, actor.id)
        .query<{ id: number | string; asset_no: string }>(INSERT_SQL);
      const created = inserted.recordset[0]!;
      const newId = Number(created.id);
      await insertEvent(transaction, newId, "Installed",
        [input.name, input.locationDetail].filter(Boolean).join(" · "), { installedOn: input.installedOn, status: input.status }, actor.id);
      await insertAudit(transaction, actor.id, "InstalledAsset", newId, created.asset_no, "Created", null, input);
      return newId;
    });
    for (let attempt = 1; ; attempt += 1) {
      try {
        const id = await register();
        return reply.code(201).send(assetDto(await readAsset(id), today()));
      } catch (error) {
        // Two registrations that read the same highest number: the later one takes the next number.
        if (isDuplicateOn(error, "UQ_installed_assets_seq") && attempt < 3) continue;
        if (isDuplicateOn(error, "UQ_installed_assets_serial")) {
          throw new ApiError(409, "asset_serial_taken", "Another asset from this manufacturer already has this serial number.");
        }
        throw error;
      }
    }
  });

  app.put("/api/v1/assets/:id", async (request) => {
    await users.demandPermission(request, MANAGE);
    const actor = await users.required(request);
    const id = assetId(request);
    const raw = bodyObject(request.body);
    const rowVersion = parseRowVersion(raw.rowVersion);
    const input = parseAssetInput(raw);
    if (input.replacedById === id) throw new ApiError(400, "validation_failed", "An asset cannot replace itself.");
    try {
      await database.transaction(async (transaction) => {
        const current = await new sql.Request(transaction).input("id", sql.BigInt, id)
          .query<AssetRow>(DETAIL_FOR_UPDATE_SQL);
        const before = current.recordset[0];
        if (!before) throw new ApiError(404, "asset_not_found", "The asset was not found.");
        if (!before.row_version.equals(rowVersion)) throw new ApiError(409, "concurrency_conflict", "The asset was changed by someone else. Reload it and try again.");
        await checkReferences(transaction, input, id);
        await bindInput(new sql.Request(transaction), input)
          .input("id", sql.BigInt, id)
          .input("actor", sql.BigInt, actor.id)
          .query(UPDATE_SQL);
        const previous = inputFromRow(before);
        for (const event of assetChangeEvents(previous, input)) {
          await insertEvent(transaction, id, event.kind, event.summary, event.details, actor.id);
        }
        await insertAudit(transaction, actor.id, "InstalledAsset", id, before.asset_no, "Updated", previous, input);
      });
    } catch (error) {
      if (isDuplicateKey(error)) throw new ApiError(409, "asset_serial_taken", "Another asset from this manufacturer already has this serial number.");
      throw error;
    }
    return assetDto(await readAsset(id), today());
  });

  app.post("/api/v1/assets/:id/events", async (request, reply) => {
    await users.demandPermission(request, MANAGE);
    const actor = await users.required(request);
    const id = assetId(request);
    const raw = bodyObject(request.body);
    const kind = typeof raw.kind === "string" ? raw.kind : "";
    if (!(MANUAL_EVENT_KINDS as readonly string[]).includes(kind)) {
      throw new ApiError(400, "validation_failed", `Kind must be one of: ${MANUAL_EVENT_KINDS.join(", ")}.`);
    }
    const summary = typeof raw.summary === "string" ? raw.summary.trim() : "";
    if (!summary) throw new ApiError(400, "validation_failed", "Write what happened.");
    if (summary.length > 500) throw new ApiError(400, "validation_failed", "The note cannot exceed 500 characters.");
    await readAsset(id);
    await database.transaction(async (transaction) => {
      await insertEvent(transaction, id, kind, summary, null, actor.id);
      await new sql.Request(transaction).input("id", sql.BigInt, id).input("actor", sql.BigInt, actor.id)
        .query(`UPDATE dbo.installed_assets SET updated_at = SYSUTCDATETIME(), updated_by = @actor WHERE id = @id;`);
    });
    return reply.code(201).send({ ok: true });
  });

  app.delete("/api/v1/assets/:id", async (request, reply) => {
    await users.demandPermission(request, MANAGE);
    const actor = await users.required(request);
    const id = assetId(request);
    await database.transaction(async (transaction) => {
      const current = await new sql.Request(transaction).input("id", sql.BigInt, id)
        .query<{ asset_no: string; name: string }>(`SELECT asset_no, name FROM dbo.installed_assets WITH (UPDLOCK) WHERE id = @id AND deleted_at IS NULL;`);
      const row = current.recordset[0];
      if (!row) throw new ApiError(404, "asset_not_found", "The asset was not found.");
      await new sql.Request(transaction).input("id", sql.BigInt, id).input("actor", sql.BigInt, actor.id)
        .query(`UPDATE dbo.installed_assets SET deleted_at = SYSUTCDATETIME(), updated_by = @actor, updated_at = SYSUTCDATETIME() WHERE id = @id;`);
      await insertEvent(transaction, id, "Deleted", "Removed from the installed base", null, actor.id);
      await insertAudit(transaction, actor.id, "InstalledAsset", id, row.asset_no, "Deleted", { name: row.name }, null);
    });
    return reply.code(204).send();
  });
}
