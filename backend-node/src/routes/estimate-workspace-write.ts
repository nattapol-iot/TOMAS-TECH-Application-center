import type { FastifyInstance, FastifyRequest } from "fastify";
import sql from "mssql/msnodesqlv8.js";
import type { Transaction as TransactionType } from "mssql";
import { insertAudit } from "../audit.js";
import type { AppConfig } from "../config.js";
import type { Database } from "../db.js";
import type { EmailRecipient, EmailService, EstimateAssignmentEmail } from "../email.js";
import { ApiError } from "../errors.js";
import { bodyObject, dateOnly, oneOf, optionalBodyText, parseDateOnly, parseRowVersion, positiveLong, requiredInteger, requiredText } from "../http.js";
import type { CurrentUser } from "../types.js";
import type { CurrentUserService } from "../users.js";

const editableStatuses = ["Draft", "Engineering Input", "Revision Required"];
const assignmentStatuses = ["Not Started", "In Progress", "Waiting Information", "Waiting Supplier", "Completed", "Reviewed"];
const expenseTypes = ["Travel", "Accommodation", "Per Diem", "Transportation", "Equipment Rental", "Other"];
const otherCategories = ["Outsource", "Transportation", "Accommodation", "Other Cost"];
const estimateSections = [
  ["01", "Hardware"], ["02", "Software"], ["03", "Electrical"], ["04", "Mechanical"], ["05", "Robot"],
  ["06", "Engineering"], ["07", "Outsource"], ["08", "Transportation"], ["09", "Accommodation"], ["10", "Other Cost"],
] as const;
const estimateSectionCodes = estimateSections.map(([code]) => code);

type EstimateContext = { estimate_no: string; project_name: string; revision: number; status: string; owner_id: number | string; due_date: Date | string };

function businessToday(timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function decimal(value: unknown, minimum: number, maximum: number, scale: number, label: string): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < minimum || value > maximum) {
    throw new ApiError(400, "validation_failed", `${label} must be between ${minimum} and ${maximum}.`);
  }
  const normalized = value.toString().toLowerCase();
  if (!normalized.includes("e") && (normalized.split(".")[1]?.length ?? 0) > scale) {
    throw new ApiError(400, "validation_failed", `${label} cannot have more than ${scale} decimal places.`);
  }
  return value;
}

function optionalId(value: unknown, label: string): number | null {
  return value === null || value === undefined ? null : requiredInteger(value, label, 1);
}

function optionalLineVersion(value: unknown, required: boolean): Buffer | null {
  const parsed = value === null || value === undefined || value === "" ? null : parseRowVersion(value);
  if (required && !parsed) throw new ApiError(400, "invalid_row_version", "The line row version is required.");
  return parsed;
}

async function lockEstimate(transaction: TransactionType, id: number, expected: Buffer): Promise<EstimateContext> {
  const request = new sql.Request(transaction); request.input("id", sql.BigInt, id);
  const row = (await request.query<EstimateContext & { row_version: Buffer }>(`SELECT estimate_no,project_name,revision,status,row_version,owner_id,due_date
    FROM dbo.estimates WITH (UPDLOCK,HOLDLOCK) WHERE id=@id AND deleted_at IS NULL;`)).recordset[0];
  if (!row) throw new ApiError(404, "estimate_not_found", "Estimate not found.");
  if (!row.row_version.equals(expected)) throw new ApiError(409, "concurrency_conflict", "This estimate changed. Reload and try again.");
  if (!editableStatuses.some((status) => status.toLowerCase() === row.status.toLowerCase())) {
    throw new ApiError(409, "estimate_locked", `Estimate lines cannot be changed while the estimate is '${row.status}'.`);
  }
  return row;
}

function elevated(actor: CurrentUser, estimate: EstimateContext): boolean {
  return actor.id === Number(estimate.owner_id) || actor.role === "Engineering Manager" || actor.role === "Admin";
}

async function hasSection(transaction: TransactionType, estimateId: number, revision: number, section: string, actorId: number): Promise<boolean> {
  const request = new sql.Request(transaction); request.input("estimate_id", sql.BigInt, estimateId); request.input("revision", sql.Int, revision);
  request.input("section", sql.NVarChar(2), section); request.input("actor", sql.BigInt, actorId);
  return Boolean((await request.query<{ allowed: boolean }>(`SELECT CASE WHEN EXISTS(SELECT 1 FROM dbo.estimate_assignments a WITH (UPDLOCK,HOLDLOCK)
    INNER JOIN dbo.estimates e WITH (UPDLOCK,HOLDLOCK) ON e.id=a.estimate_id AND e.revision=@revision AND e.deleted_at IS NULL
    WHERE a.estimate_id=@estimate_id AND (a.section=@section OR (LEFT(a.section,2)=@section AND SUBSTRING(a.section,3,1)=N' '))
      AND (a.owner_id=@actor OR a.support_id=@actor)) THEN CAST(1 AS bit) ELSE CAST(0 AS bit) END allowed;`)).recordset[0]?.allowed);
}

async function demandNewSection(transaction: TransactionType, estimateId: number, estimate: EstimateContext, actor: CurrentUser, section: string, ownerId: number): Promise<void> {
  if (elevated(actor, estimate)) return;
  if (ownerId !== actor.id || !await hasSection(transaction, estimateId, estimate.revision, section, actor.id)) {
    throw new ApiError(403, "estimate_section_forbidden", `You may add this estimate line only when section ${section} is assigned to you, and the new line must remain assigned to you.`);
  }
}

async function demandExistingSection(transaction: TransactionType, estimateId: number, estimate: EstimateContext, actor: CurrentUser,
  existingSection: string, targetSection: string, existingOwnerId: number, targetOwnerId: number): Promise<void> {
  if (elevated(actor, estimate)) return;
  const assignedExisting = await hasSection(transaction, estimateId, estimate.revision, existingSection, actor.id);
  const assignedTarget = existingSection === targetSection || await hasSection(transaction, estimateId, estimate.revision, targetSection, actor.id);
  if (existingOwnerId !== actor.id || targetOwnerId !== existingOwnerId || !assignedExisting || !assignedTarget) {
    throw new ApiError(403, "estimate_line_forbidden", "You may update or remove only your own line while its controlled estimate section is assigned to you.");
  }
}

async function validateOwnerSupplier(transaction: TransactionType, ownerId: number, supplierId: number | null): Promise<void> {
  const request = new sql.Request(transaction); request.input("owner", sql.BigInt, ownerId); request.input("supplier", sql.BigInt, supplierId);
  const row = (await request.query<{ owner_valid: boolean; supplier_valid: boolean }>(`SELECT
    CASE WHEN EXISTS(SELECT 1 FROM dbo.users u INNER JOIN dbo.roles r ON r.id=u.role_id WHERE u.id=@owner AND u.is_active=1
      AND u.deleted_at IS NULL AND r.code IN(N'Engineer',N'Engineering Manager',N'Admin')) THEN CAST(1 AS bit) ELSE CAST(0 AS bit) END owner_valid,
    CASE WHEN @supplier IS NULL OR EXISTS(SELECT 1 FROM dbo.suppliers WHERE id=@supplier AND is_active=1 AND deleted_at IS NULL)
      THEN CAST(1 AS bit) ELSE CAST(0 AS bit) END supplier_valid;`)).recordset[0]!;
  if (!row.owner_valid) throw new ApiError(400, "validation_failed", "The selected line owner must be an active engineer, engineering manager or administrator.");
  if (!row.supplier_valid) throw new ApiError(400, "validation_failed", "The selected supplier is inactive or does not exist.");
}

async function assignmentRecipients(transaction: TransactionType, userIds: number[]): Promise<EmailRecipient[]> {
  const uniqueIds = [...new Set(userIds.filter((id) => Number.isSafeInteger(id) && id > 0))];
  if (uniqueIds.length === 0) return [];
  const request = new sql.Request(transaction);
  const placeholders = uniqueIds.map((id, index) => {
    const name = `user_${index}`;
    request.input(name, sql.BigInt, id);
    return `@${name}`;
  });
  return (await request.query<{ name: string; email: string }>(`SELECT name,email FROM dbo.users
    WHERE id IN(${placeholders.join(",")}) AND is_active=1 AND deleted_at IS NULL;`)).recordset;
}

async function deliverAssignmentEmail(email: EmailService, message: EstimateAssignmentEmail | null) {
  return message
    ? email.sendEstimateAssignment(message)
    : { status: "not_required" as const, recipients: [] as string[] };
}

async function touchEstimate(transaction: TransactionType, id: number, actorId: number): Promise<Buffer> {
  const request = new sql.Request(transaction); request.input("id", sql.BigInt, id); request.input("actor", sql.BigInt, actorId);
  const row = (await request.query<{ row_version: Buffer }>(`UPDATE dbo.estimates SET updated_by=@actor,updated_at=SYSUTCDATETIME(),
    progress=CASE WHEN progress<10 THEN 10 ELSE progress END OUTPUT inserted.row_version WHERE id=@id;`)).recordset[0];
  if (!row) throw new ApiError(409, "concurrency_conflict", "The estimate could not be updated.");
  return row.row_version;
}

async function snapshot(transaction: TransactionType, table: string, columns: string, estimateId: number, revision: number,
  lineId: number, expected: Buffer, includeDeleted: boolean, message: string): Promise<Record<string, unknown>> {
  const allowed = new Set(["dbo.manhour_lines", "dbo.expense_lines", "dbo.other_cost_lines"]);
  if (!allowed.has(table)) throw new Error("Unsupported estimate line table.");
  const request = new sql.Request(transaction); request.input("line", sql.BigInt, lineId); request.input("estimate", sql.BigInt, estimateId);
  request.input("revision", sql.Int, revision); request.input("include_deleted", sql.Bit, includeDeleted);
  const row = (await request.query<Record<string, unknown> & { row_version: Buffer }>(`SELECT ${columns},row_version FROM ${table} WITH (UPDLOCK,HOLDLOCK)
    WHERE id=@line AND estimate_id=@estimate AND revision=@revision AND (@include_deleted=1 OR deleted_at IS NULL);`)).recordset[0];
  if (!row || !row.row_version.equals(expected)) throw new ApiError(409, "concurrency_conflict", message);
  const { row_version, ...values } = row; return { ...values, rowVersion: row_version.toString("base64") };
}

async function softDelete(transaction: TransactionType, table: string, estimateId: number, revision: number, lineId: number, expected: Buffer, actorId: number): Promise<Buffer> {
  const timestamps = table === "dbo.other_cost_lines" ? "" : ",updated_at=SYSUTCDATETIME()";
  if (!["dbo.manhour_lines", "dbo.expense_lines", "dbo.other_cost_lines"].includes(table)) throw new Error("Unsupported estimate line table.");
  const request = new sql.Request(transaction); request.input("actor", sql.BigInt, actorId); request.input("line", sql.BigInt, lineId);
  request.input("estimate", sql.BigInt, estimateId); request.input("revision", sql.Int, revision); request.input("version", sql.VarBinary(8), expected);
  const row = (await request.query<{ row_version: Buffer }>(`DECLARE @removed TABLE(row_version binary(8)); UPDATE ${table} SET deleted_at=SYSUTCDATETIME(),updated_by=@actor${timestamps}
    OUTPUT inserted.row_version INTO @removed WHERE id=@line AND estimate_id=@estimate AND revision=@revision AND deleted_at IS NULL AND row_version=@version; SELECT row_version FROM @removed;`)).recordset[0];
  if (!row) throw new ApiError(409, "concurrency_conflict", "This estimate line changed or was removed. Reload and try again.");
  return row.row_version;
}

function removeBody(request: FastifyRequest): { estimateVersion: Buffer; lineVersion: Buffer; reason: string | null } {
  const body = bodyObject(request.body); return { estimateVersion: parseRowVersion(body.estimateRowVersion), lineVersion: parseRowVersion(body.lineRowVersion),
    reason: optionalBodyText(body.reason, 20_000, "Removal reason") };
}

type ManhourInput = { estimateVersion: Buffer; lineVersion: Buffer | null; packageName: string; activity: string; department: string; level: string;
  costType: string; provider: string; supplierId: number | null; quotationNumber: string | null; priceDate: string | null;
  engineers: number; manDays: number; hoursPerDay: number; dailyRate: number; ownerId: number; remark: string | null };

function parseManhour(request: FastifyRequest, requireLine: boolean): ManhourInput {
  const body = bodyObject(request.body); const provider = oneOf(requiredText(body.provider, 30, "Provider"), "Provider", ["Internal", "Supplier"]);
  const supplierId = optionalId(body.supplierId, "Supplier"); const quotationNumber = optionalBodyText(body.quotationNumber, 100, "Quotation number");
  const priceDate = parseDateOnly(body.priceDate, "Price date", true);
  if (provider === "Supplier" && (!supplierId || !quotationNumber || !priceDate)) throw new ApiError(400, "validation_failed", "Supplier man-hour requires supplier, quotation number and price date.");
  if (provider === "Internal" && (supplierId !== null || quotationNumber !== null)) throw new ApiError(400, "validation_failed", "Internal man-hour cannot contain supplier quotation fields.");
  const engineers = decimal(body.engineers, 0.01, 1_000_000, 2, "Engineers"); const manDays = decimal(body.manDays, 0.01, 1_000_000, 2, "Man-days");
  const dailyRate = decimal(body.dailyRate, 0, 1_000_000_000, 4, "Daily rate");
  if (engineers * manDays * dailyRate > 999_999_999_999_999) throw new ApiError(400, "validation_failed", "Man-hour line cost exceeds the maximum amount supported by the estimate ledger.");
  return { estimateVersion: parseRowVersion(body.estimateRowVersion), lineVersion: optionalLineVersion(body.lineRowVersion, requireLine),
    packageName: requiredText(body.package, 200, "Work package"), activity: requiredText(body.activity, 300, "Activity"),
    department: requiredText(body.department, 100, "Department"), level: requiredText(body.level, 100, "Engineer level"),
    costType: oneOf(requiredText(body.costType, 30, "Cost type"), "Cost type", ["Engineering", "Installation"]), provider, supplierId,
    quotationNumber, priceDate, engineers, manDays, hoursPerDay: decimal(body.hoursPerDay, 0.01, 24, 2, "Hours per day"), dailyRate,
    ownerId: requiredInteger(body.ownerId, "Owner", 1), remark: optionalBodyText(body.remark, 20_000, "Remark") };
}

async function resolveRate(transaction: TransactionType, input: ManhourInput, today: string): Promise<number> {
  if (input.provider === "Supplier") return input.dailyRate;
  const request = new sql.Request(transaction); request.input("cost_type", sql.NVarChar(30), input.costType); request.input("level", sql.NVarChar(100), input.level);
  request.input("department", sql.NVarChar(100), input.department); request.input("today", sql.Date, today);
  const row = (await request.query<{ rate: number | string }>(`SELECT TOP(1) CASE WHEN @cost_type=N'Installation' THEN installation_daily ELSE engineering_daily END rate
    FROM dbo.engineering_rates WHERE level=@level AND department=@department AND is_active=1 AND effective_from<=@today
      AND (effective_to IS NULL OR effective_to>=@today) ORDER BY effective_from DESC,id DESC;`)).recordset[0];
  if (!row) throw new ApiError(422, "engineering_rate_missing", "No active engineering rate matches the selected level, department and cost type.");
  return Number(row.rate);
}

function bindManhour(request: InstanceType<typeof sql.Request>, id: number, revision: number, input: ManhourInput, rate: number, today: string, actor: number): void {
  request.input("estimate", sql.BigInt, id); request.input("revision", sql.Int, revision); request.input("package", sql.NVarChar(200), input.packageName);
  request.input("activity", sql.NVarChar(300), input.activity); request.input("department", sql.NVarChar(100), input.department); request.input("level", sql.NVarChar(100), input.level);
  request.input("cost_type", sql.NVarChar(30), input.costType); request.input("provider", sql.NVarChar(30), input.provider);
  request.input("supplier", sql.BigInt, input.provider === "Supplier" ? input.supplierId : null);
  request.input("quotation", sql.NVarChar(100), input.provider === "Supplier" ? input.quotationNumber : null);
  request.input("price_date", sql.Date, input.provider === "Supplier" ? input.priceDate : today); request.input("engineers", sql.Decimal(9, 2), input.engineers);
  request.input("man_days", sql.Decimal(9, 2), input.manDays); request.input("hours", sql.Decimal(9, 2), input.hoursPerDay);
  request.input("rate", sql.Decimal(19, 4), rate); request.input("owner", sql.BigInt, input.ownerId); request.input("remark", sql.NVarChar(sql.MAX), input.remark);
  request.input("actor", sql.BigInt, actor);
}

type ExpenseInput = { estimateVersion: Buffer; lineVersion: Buffer | null; packageName: string; expenseType: string; description: string;
  costType: string; supplierId: number | null; referenceNumber: string | null; quantity: number; unit: string; unitCost: number; ownerId: number; remark: string | null };

function parseExpense(request: FastifyRequest, requireLine: boolean): ExpenseInput {
  const body = bodyObject(request.body); const quantity = decimal(body.quantity, 0.0001, 1_000_000_000, 4, "Quantity");
  const unitCost = decimal(body.unitCost, 0, 1_000_000_000, 4, "Unit cost");
  if (quantity * unitCost > 999_999_999_999_999) throw new ApiError(400, "validation_failed", "Line total exceeds the supported monetary range.");
  return { estimateVersion: parseRowVersion(body.estimateRowVersion), lineVersion: optionalLineVersion(body.lineRowVersion, requireLine),
    packageName: requiredText(body.package, 200, "Work package"), expenseType: oneOf(requiredText(body.expenseType, 100, "Expense type"), "Expense type", expenseTypes),
    description: requiredText(body.description, 500, "Description"), costType: oneOf(requiredText(body.costType, 30, "Cost type"), "Cost type", ["Engineering", "Installation"]),
    supplierId: optionalId(body.supplierId, "Supplier"), referenceNumber: optionalBodyText(body.referenceNumber, 200, "Reference number"), quantity,
    unit: requiredText(body.unit, 50, "Unit"), unitCost, ownerId: requiredInteger(body.ownerId, "Owner", 1), remark: optionalBodyText(body.remark, 20_000, "Remark") };
}

function expenseSection(type: string): string {
  if (type === "Travel" || type === "Transportation") return "08"; if (type === "Accommodation" || type === "Per Diem") return "09";
  if (type === "Equipment Rental" || type === "Other") return "10"; throw new ApiError(400, "validation_failed", "Expense type does not map to a controlled estimate section.");
}

function bindExpense(request: InstanceType<typeof sql.Request>, id: number, revision: number, input: ExpenseInput, actor: number): void {
  request.input("estimate", sql.BigInt, id); request.input("revision", sql.Int, revision); request.input("package", sql.NVarChar(200), input.packageName);
  request.input("expense_type", sql.NVarChar(100), input.expenseType); request.input("description", sql.NVarChar(500), input.description);
  request.input("cost_type", sql.NVarChar(30), input.costType); request.input("supplier", sql.BigInt, input.supplierId);
  request.input("reference", sql.NVarChar(200), input.referenceNumber); request.input("qty", sql.Decimal(19, 4), input.quantity);
  request.input("unit", sql.NVarChar(50), input.unit); request.input("unit_cost", sql.Decimal(19, 4), input.unitCost);
  request.input("owner", sql.BigInt, input.ownerId); request.input("remark", sql.NVarChar(sql.MAX), input.remark); request.input("actor", sql.BigInt, actor);
}

type OtherInput = { estimateVersion: Buffer; lineVersion: Buffer | null; category: string; description: string; quantity: number; unit: string; unitCost: number; remark: string | null };
function parseOther(request: FastifyRequest, requireLine: boolean): OtherInput {
  const body = bodyObject(request.body); const quantity = decimal(body.quantity, 0.0001, 1_000_000_000, 4, "Quantity");
  const unitCost = decimal(body.unitCost, 0, 1_000_000_000, 4, "Unit cost"); if (quantity * unitCost > 999_999_999_999_999) throw new ApiError(400, "validation_failed", "Line total exceeds the supported monetary range.");
  return { estimateVersion: parseRowVersion(body.estimateRowVersion), lineVersion: optionalLineVersion(body.lineRowVersion, requireLine),
    category: oneOf(requiredText(body.category, 100, "Other-cost category"), "Other-cost category", otherCategories),
    description: requiredText(body.description, 500, "Description"), quantity, unit: requiredText(body.unit, 50, "Unit"), unitCost,
    remark: optionalBodyText(body.remark, 20_000, "Remark") };
}
function bindOther(request: InstanceType<typeof sql.Request>, id: number, revision: number, input: OtherInput, actor: number): void {
  request.input("estimate", sql.BigInt, id); request.input("revision", sql.Int, revision); request.input("category", sql.NVarChar(100), input.category);
  request.input("description", sql.NVarChar(500), input.description); request.input("qty", sql.Decimal(19, 4), input.quantity);
  request.input("unit", sql.NVarChar(50), input.unit); request.input("unit_cost", sql.Decimal(19, 4), input.unitCost);
  request.input("remark", sql.NVarChar(sql.MAX), input.remark); request.input("actor", sql.BigInt, actor);
}

export function registerEstimateWorkspaceWriteRoutes(app: FastifyInstance, config: AppConfig, database: Database, users: CurrentUserService, email: EmailService): void {
  const manhourColumns = "id,package,activity,department,level,cost_type,provider,supplier_id,quotation_no,price_date,engineers,man_days,hours_per_day,daily_rate,owner_id,remark,deleted_at";
  const expenseColumns = "id,package,expense_type,description,cost_type,supplier_id,reference_no,qty,unit,unit_cost,owner_id,remark,deleted_at";
  const otherColumns = "id,category,description,qty,unit,unit_cost,remark,deleted_at";
  const parseIds = (request: FastifyRequest) => { const p = request.params as { id?: string; lineId?: string }; return { id: positiveLong(p.id, "Estimate id"), lineId: positiveLong(p.lineId, "Estimate line id") }; };

  app.post("/api/v1/estimates/:id/manhour-lines", async (request, reply) => {
    await users.demandPermission(request, "estimate.write"); const actor = await users.required(request); const id = positiveLong((request.params as { id?: string }).id, "Estimate id");
    const input = parseManhour(request, false); const today = businessToday(config.businessTimeZone);
    const created = await database.transaction(async (transaction) => { const estimate = await lockEstimate(transaction, id, input.estimateVersion);
      await demandNewSection(transaction, id, estimate, actor, "06", input.ownerId); await validateOwnerSupplier(transaction, input.ownerId, input.supplierId);
      const rate = await resolveRate(transaction, input, today); const insert = new sql.Request(transaction); bindManhour(insert, id, estimate.revision, input, rate, today, actor.id);
      const row = (await insert.query<{ id: number | string; row_version: Buffer }>(`INSERT INTO dbo.manhour_lines(estimate_id,revision,package,activity,department,level,cost_type,provider,
        supplier_id,quotation_no,price_date,engineers,man_days,hours_per_day,daily_rate,owner_id,remark,created_by,updated_by) OUTPUT inserted.id,inserted.row_version
        VALUES(@estimate,@revision,@package,@activity,@department,@level,@cost_type,@provider,@supplier,@quotation,@price_date,@engineers,@man_days,@hours,@rate,@owner,@remark,@actor,@actor);`)).recordset[0]!;
      const lineId = Number(row.id); const estimateVersion = await touchEstimate(transaction, id, actor.id); const after = await snapshot(transaction, "dbo.manhour_lines", manhourColumns, id, estimate.revision, lineId, row.row_version, false, "This man-hour line changed or was removed. Reload and try again.");
      await insertAudit(transaction, actor.id, "ManhourLine", lineId, estimate.estimate_no, "Created", null, after);
      return { id: lineId, rowVersion: row.row_version.toString("base64"), estimateRowVersion: estimateVersion.toString("base64") }; });
    return reply.status(201).header("Location", `/api/v1/estimates/${id}/manhour-lines/${created.id}`).send(created);
  });

  app.put("/api/v1/estimates/:id/manhour-lines/:lineId", async (request) => { await users.demandPermission(request, "estimate.write"); const actor = await users.required(request);
    const { id, lineId } = parseIds(request); const input = parseManhour(request, true); const today = businessToday(config.businessTimeZone);
    return database.transaction(async (transaction) => { const estimate = await lockEstimate(transaction, id, input.estimateVersion);
      const before = await snapshot(transaction, "dbo.manhour_lines", manhourColumns, id, estimate.revision, lineId, input.lineVersion!, false, "This man-hour line changed or was removed. Reload and try again.");
      await demandExistingSection(transaction, id, estimate, actor, "06", "06", Number(before.owner_id), input.ownerId); await validateOwnerSupplier(transaction, input.ownerId, input.supplierId);
      const preserveImported = before.level === "Imported Excel rate" && input.level === before.level && input.department === before.department && input.costType === before.cost_type && before.provider === "Internal" && input.provider === "Internal";
      const rate = preserveImported ? Number(before.daily_rate) : await resolveRate(transaction, input, today);
      const rateDate = preserveImported && before.price_date ? new Date(before.price_date as string).toISOString().slice(0, 10) : today;
      const update = new sql.Request(transaction); bindManhour(update, id, estimate.revision, input, rate, rateDate, actor.id);
      update.input("line", sql.BigInt, lineId); update.input("version", sql.VarBinary(8), input.lineVersion);
      const row = (await update.query<{ row_version: Buffer }>(`DECLARE @updated TABLE(row_version binary(8)); UPDATE dbo.manhour_lines SET package=@package,activity=@activity,department=@department,level=@level,
        cost_type=@cost_type,provider=@provider,supplier_id=@supplier,quotation_no=@quotation,price_date=@price_date,engineers=@engineers,man_days=@man_days,
        hours_per_day=@hours,daily_rate=@rate,owner_id=@owner,remark=@remark,updated_by=@actor,updated_at=SYSUTCDATETIME() OUTPUT inserted.row_version INTO @updated
        WHERE id=@line AND estimate_id=@estimate AND revision=@revision AND deleted_at IS NULL AND row_version=@version; SELECT row_version FROM @updated;`)).recordset[0];
      if (!row) throw new ApiError(409, "concurrency_conflict", "This man-hour line changed or was removed. Reload and try again.");
      const estimateVersion = await touchEstimate(transaction, id, actor.id); const after = await snapshot(transaction, "dbo.manhour_lines", manhourColumns, id, estimate.revision, lineId, row.row_version, false, "This man-hour line changed or was removed. Reload and try again.");
      await insertAudit(transaction, actor.id, "ManhourLine", lineId, estimate.estimate_no, "Updated", before, after); return { id: lineId, rowVersion: row.row_version.toString("base64"), estimateRowVersion: estimateVersion.toString("base64") }; });
  });

  app.post("/api/v1/estimates/:id/manhour-lines/:lineId/remove", async (request) => { await users.demandPermission(request, "estimate.write"); const actor = await users.required(request);
    const { id, lineId } = parseIds(request); const body = removeBody(request); return database.transaction(async (transaction) => { const estimate = await lockEstimate(transaction, id, body.estimateVersion);
      const before = await snapshot(transaction, "dbo.manhour_lines", manhourColumns, id, estimate.revision, lineId, body.lineVersion, false, "This man-hour line changed or was removed. Reload and try again.");
      await demandExistingSection(transaction, id, estimate, actor, "06", "06", Number(before.owner_id), Number(before.owner_id));
      const removed = await softDelete(transaction, "dbo.manhour_lines", id, estimate.revision, lineId, body.lineVersion, actor.id); const estimateVersion = await touchEstimate(transaction, id, actor.id);
      const after = await snapshot(transaction, "dbo.manhour_lines", manhourColumns, id, estimate.revision, lineId, removed, true, "This man-hour line changed or was removed. Reload and try again.");
      await insertAudit(transaction, actor.id, "ManhourLine", lineId, estimate.estimate_no, "Removed", { line: before }, { line: after, removalReason: body.reason }); return { id: lineId, estimateRowVersion: estimateVersion.toString("base64") }; });
  });

  app.post("/api/v1/estimates/:id/expense-lines", async (request, reply) => { await users.demandPermission(request, "estimate.write"); const actor = await users.required(request);
    const id = positiveLong((request.params as { id?: string }).id, "Estimate id"); const input = parseExpense(request, false);
    const created = await database.transaction(async (transaction) => { const estimate = await lockEstimate(transaction, id, input.estimateVersion);
      await demandNewSection(transaction, id, estimate, actor, expenseSection(input.expenseType), input.ownerId); await validateOwnerSupplier(transaction, input.ownerId, input.supplierId);
      const insert = new sql.Request(transaction); bindExpense(insert, id, estimate.revision, input, actor.id);
      const row = (await insert.query<{ id: number | string; row_version: Buffer }>(`INSERT INTO dbo.expense_lines(estimate_id,revision,package,expense_type,description,cost_type,supplier_id,reference_no,qty,unit,unit_cost,owner_id,remark,created_by,updated_by)
        OUTPUT inserted.id,inserted.row_version VALUES(@estimate,@revision,@package,@expense_type,@description,@cost_type,@supplier,@reference,@qty,@unit,@unit_cost,@owner,@remark,@actor,@actor);`)).recordset[0]!;
      const lineId = Number(row.id); const estimateVersion = await touchEstimate(transaction, id, actor.id); const after = await snapshot(transaction, "dbo.expense_lines", expenseColumns, id, estimate.revision, lineId, row.row_version, false, "This expense line changed or was removed. Reload and try again.");
      await insertAudit(transaction, actor.id, "ExpenseLine", lineId, estimate.estimate_no, "Created", null, after); return { id: lineId, rowVersion: row.row_version.toString("base64"), estimateRowVersion: estimateVersion.toString("base64") }; });
    return reply.status(201).header("Location", `/api/v1/estimates/${id}/expense-lines/${created.id}`).send(created);
  });

  app.put("/api/v1/estimates/:id/expense-lines/:lineId", async (request) => { await users.demandPermission(request, "estimate.write"); const actor = await users.required(request);
    const { id, lineId } = parseIds(request); const input = parseExpense(request, true); return database.transaction(async (transaction) => { const estimate = await lockEstimate(transaction, id, input.estimateVersion);
      const before = await snapshot(transaction, "dbo.expense_lines", expenseColumns, id, estimate.revision, lineId, input.lineVersion!, false, "This expense line changed or was removed. Reload and try again.");
      await demandExistingSection(transaction, id, estimate, actor, expenseSection(String(before.expense_type)), expenseSection(input.expenseType), Number(before.owner_id), input.ownerId);
      await validateOwnerSupplier(transaction, input.ownerId, input.supplierId); const update = new sql.Request(transaction); bindExpense(update, id, estimate.revision, input, actor.id);
      update.input("line", sql.BigInt, lineId); update.input("version", sql.VarBinary(8), input.lineVersion);
      const row = (await update.query<{ row_version: Buffer }>(`UPDATE dbo.expense_lines SET package=@package,expense_type=@expense_type,description=@description,cost_type=@cost_type,
        supplier_id=@supplier,reference_no=@reference,qty=@qty,unit=@unit,unit_cost=@unit_cost,owner_id=@owner,remark=@remark,updated_by=@actor,updated_at=SYSUTCDATETIME()
        OUTPUT inserted.row_version WHERE id=@line AND estimate_id=@estimate AND revision=@revision AND deleted_at IS NULL AND row_version=@version;`)).recordset[0];
      if (!row) throw new ApiError(409, "concurrency_conflict", "This expense line changed or was removed. Reload and try again."); const estimateVersion = await touchEstimate(transaction, id, actor.id);
      const after = await snapshot(transaction, "dbo.expense_lines", expenseColumns, id, estimate.revision, lineId, row.row_version, false, "This expense line changed or was removed. Reload and try again.");
      await insertAudit(transaction, actor.id, "ExpenseLine", lineId, estimate.estimate_no, "Updated", before, after); return { id: lineId, rowVersion: row.row_version.toString("base64"), estimateRowVersion: estimateVersion.toString("base64") }; });
  });

  app.post("/api/v1/estimates/:id/expense-lines/:lineId/remove", async (request) => { await users.demandPermission(request, "estimate.write"); const actor = await users.required(request);
    const { id, lineId } = parseIds(request); const body = removeBody(request); return database.transaction(async (transaction) => { const estimate = await lockEstimate(transaction, id, body.estimateVersion);
      const before = await snapshot(transaction, "dbo.expense_lines", expenseColumns, id, estimate.revision, lineId, body.lineVersion, false, "This expense line changed or was removed. Reload and try again."); const section = expenseSection(String(before.expense_type));
      await demandExistingSection(transaction, id, estimate, actor, section, section, Number(before.owner_id), Number(before.owner_id)); const removed = await softDelete(transaction, "dbo.expense_lines", id, estimate.revision, lineId, body.lineVersion, actor.id);
      const estimateVersion = await touchEstimate(transaction, id, actor.id); const after = await snapshot(transaction, "dbo.expense_lines", expenseColumns, id, estimate.revision, lineId, removed, true, "This expense line changed or was removed. Reload and try again.");
      await insertAudit(transaction, actor.id, "ExpenseLine", lineId, estimate.estimate_no, "Removed", { line: before }, { line: after, removalReason: body.reason }); return { id: lineId, estimateRowVersion: estimateVersion.toString("base64") }; });
  });

  app.post("/api/v1/estimates/:id/other-cost-lines", async (request, reply) => { await users.demandPermission(request, "estimate.write"); const actor = await users.required(request);
    const id = positiveLong((request.params as { id?: string }).id, "Estimate id"); const input = parseOther(request, false);
    const created = await database.transaction(async (transaction) => { const estimate = await lockEstimate(transaction, id, input.estimateVersion);
      if (!elevated(actor, estimate)) throw new ApiError(403, "estimate_owner_required", "Only the estimate owner, an engineering manager or an administrator can add other project costs.");
      const insert = new sql.Request(transaction); bindOther(insert, id, estimate.revision, input, actor.id); const row = (await insert.query<{ id: number | string; row_version: Buffer }>(`INSERT INTO dbo.other_cost_lines(estimate_id,revision,category,description,qty,unit,unit_cost,remark,created_by,updated_by)
        OUTPUT inserted.id,inserted.row_version VALUES(@estimate,@revision,@category,@description,@qty,@unit,@unit_cost,@remark,@actor,@actor);`)).recordset[0]!;
      const lineId = Number(row.id); const estimateVersion = await touchEstimate(transaction, id, actor.id); const after = await snapshot(transaction, "dbo.other_cost_lines", otherColumns, id, estimate.revision, lineId, row.row_version, false, "This other-cost line changed or was removed. Reload and try again.");
      await insertAudit(transaction, actor.id, "OtherCostLine", lineId, estimate.estimate_no, "Created", null, after); return { id: lineId, rowVersion: row.row_version.toString("base64"), estimateRowVersion: estimateVersion.toString("base64") }; });
    return reply.status(201).header("Location", `/api/v1/estimates/${id}/other-cost-lines/${created.id}`).send(created);
  });

  app.put("/api/v1/estimates/:id/other-cost-lines/:lineId", async (request) => { await users.demandPermission(request, "estimate.write"); const actor = await users.required(request);
    const { id, lineId } = parseIds(request); const input = parseOther(request, true); return database.transaction(async (transaction) => { const estimate = await lockEstimate(transaction, id, input.estimateVersion);
      if (!elevated(actor, estimate)) throw new ApiError(403, "estimate_owner_required", "Only the estimate owner, an engineering manager or an administrator can update other project costs.");
      const before = await snapshot(transaction, "dbo.other_cost_lines", otherColumns, id, estimate.revision, lineId, input.lineVersion!, false, "This other-cost line changed or was removed. Reload and try again.");
      const update = new sql.Request(transaction); bindOther(update, id, estimate.revision, input, actor.id); update.input("line", sql.BigInt, lineId); update.input("version", sql.VarBinary(8), input.lineVersion);
      const row = (await update.query<{ row_version: Buffer }>(`UPDATE dbo.other_cost_lines SET category=@category,description=@description,qty=@qty,unit=@unit,unit_cost=@unit_cost,remark=@remark,updated_by=@actor
        OUTPUT inserted.row_version WHERE id=@line AND estimate_id=@estimate AND revision=@revision AND deleted_at IS NULL AND row_version=@version;`)).recordset[0];
      if (!row) throw new ApiError(409, "concurrency_conflict", "This other-cost line changed or was removed. Reload and try again."); const estimateVersion = await touchEstimate(transaction, id, actor.id);
      const after = await snapshot(transaction, "dbo.other_cost_lines", otherColumns, id, estimate.revision, lineId, row.row_version, false, "This other-cost line changed or was removed. Reload and try again.");
      await insertAudit(transaction, actor.id, "OtherCostLine", lineId, estimate.estimate_no, "Updated", before, after); return { id: lineId, rowVersion: row.row_version.toString("base64"), estimateRowVersion: estimateVersion.toString("base64") }; });
  });

  app.post("/api/v1/estimates/:id/other-cost-lines/:lineId/remove", async (request) => { await users.demandPermission(request, "estimate.write"); const actor = await users.required(request);
    const { id, lineId } = parseIds(request); const body = removeBody(request); return database.transaction(async (transaction) => { const estimate = await lockEstimate(transaction, id, body.estimateVersion);
      if (!elevated(actor, estimate)) throw new ApiError(403, "estimate_owner_required", "Only the estimate owner, an engineering manager or an administrator can remove other project costs.");
      const before = await snapshot(transaction, "dbo.other_cost_lines", otherColumns, id, estimate.revision, lineId, body.lineVersion, false, "This other-cost line changed or was removed. Reload and try again.");
      const removed = await softDelete(transaction, "dbo.other_cost_lines", id, estimate.revision, lineId, body.lineVersion, actor.id); const estimateVersion = await touchEstimate(transaction, id, actor.id);
      const after = await snapshot(transaction, "dbo.other_cost_lines", otherColumns, id, estimate.revision, lineId, removed, true, "This other-cost line changed or was removed. Reload and try again.");
      await insertAudit(transaction, actor.id, "OtherCostLine", lineId, estimate.estimate_no, "Removed", { line: before }, { line: after, removalReason: body.reason }); return { id: lineId, estimateRowVersion: estimateVersion.toString("base64") }; });
  });

  app.post("/api/v1/estimates/:id/assignments", async (request, reply) => {
    await users.demandPermission(request, "estimate.write"); const actor = await users.required(request);
    const id = positiveLong((request.params as { id?: string }).id, "Estimate id"); const body = bodyObject(request.body);
    const estimateVersion = parseRowVersion(body.estimateRowVersion);
    const section = oneOf(requiredText(body.section, 2, "Section"), "Section", estimateSectionCodes);
    const ownerId = requiredInteger(body.ownerId, "Owner", 1); const supportId = optionalId(body.supportId, "Support");
    if (supportId === ownerId) throw new ApiError(400, "validation_failed", "Assignment owner and support engineer must be different users.");
    const dueDate = parseDateOnly(body.dueDate, "Due date")!; const comment = optionalBodyText(body.comment, 20_000, "Comment");
    const created = await database.transaction(async (transaction) => {
      const estimate = await lockEstimate(transaction, id, estimateVersion);
      if (!elevated(actor, estimate)) throw new ApiError(403, "estimate_owner_required", "Only the estimate owner, an engineering manager or an administrator can assign a section.");
      if (dueDate > dateOnly(estimate.due_date)!) throw new ApiError(400, "validation_failed", "Assignment due date cannot be later than the estimate due date.");
      await validateOwnerSupplier(transaction, ownerId, null); if (supportId !== null) await validateOwnerSupplier(transaction, supportId, null);
      const duplicate = new sql.Request(transaction); duplicate.input("estimate", sql.BigInt, id); duplicate.input("section", sql.NVarChar(2), section);
      const exists = (await duplicate.query<{ found: boolean }>(`SELECT CONVERT(bit,CASE WHEN EXISTS(SELECT 1 FROM dbo.estimate_assignments WITH(UPDLOCK,HOLDLOCK)
        WHERE estimate_id=@estimate AND (section=@section OR (LEFT(section,2)=@section AND SUBSTRING(section,3,1)=N' '))) THEN 1 ELSE 0 END) found;`)).recordset[0]?.found;
      if (exists) throw new ApiError(409, "estimate_assignment_exists", `Section ${section} is already assigned.`);
      const insert = new sql.Request(transaction); insert.input("estimate", sql.BigInt, id); insert.input("section", sql.NVarChar(100), section);
      insert.input("owner", sql.BigInt, ownerId); insert.input("support", sql.BigInt, supportId); insert.input("due", sql.Date, dueDate);
      insert.input("comment", sql.NVarChar(sql.MAX), comment);
      const row = (await insert.query<{ id: number | string; row_version: Buffer }>(`INSERT dbo.estimate_assignments(estimate_id,section,owner_id,support_id,due_date,status,progress,comment)
        OUTPUT inserted.id,inserted.row_version VALUES(@estimate,@section,@owner,@support,@due,N'Not Started',0,@comment);`)).recordset[0]!;
      const assignmentId = Number(row.id); const newEstimateVersion = await touchEstimate(transaction, id, actor.id);
      const recipients = await assignmentRecipients(transaction, [ownerId, ...(supportId === null ? [] : [supportId])]);
      const sectionName = estimateSections.find(([code]) => code === section)?.[1] ?? section;
      await insertAudit(transaction, actor.id, "EstimateAssignment", assignmentId, estimate.estimate_no, "Assigned", null,
        { section, ownerId, supportId, dueDate, status: "Not Started", progress: 0, comment });
      return {
        payload: { id: assignmentId, rowVersion: row.row_version.toString("base64"), estimateRowVersion: newEstimateVersion.toString("base64") },
        emailMessage: { estimateId: id, estimateNumber: estimate.estimate_no, projectName: estimate.project_name, section: `${section} ${sectionName}`,
          dueDate, assignedBy: actor.name, recipients } satisfies EstimateAssignmentEmail,
      };
    });
    const notification = await deliverAssignmentEmail(email, created.emailMessage);
    return reply.status(201).header("Location", `/api/v1/estimates/${id}/assignments/${created.payload.id}`).send({ ...created.payload, notification });
  });

  app.put("/api/v1/estimates/:id/assignments/:assignmentId", async (request) => { await users.demandPermission(request, "estimate.write"); const actor = await users.required(request);
    const p = request.params as { id?: string; assignmentId?: string }; const id = positiveLong(p.id, "Estimate id"); const assignmentId = positiveLong(p.assignmentId, "Assignment id"); const body = bodyObject(request.body);
    const estimateVersion = parseRowVersion(body.estimateRowVersion); const lineVersion = parseRowVersion(body.lineRowVersion); const ownerId = requiredInteger(body.ownerId, "Owner", 1); const supportId = optionalId(body.supportId, "Support");
    if (supportId === ownerId) throw new ApiError(400, "validation_failed", "Assignment owner must be valid and support must be a different user.");
    const dueDate = parseDateOnly(body.dueDate, "Due date")!; const status = oneOf(requiredText(body.status, 50, "Assignment status"), "Assignment status", assignmentStatuses);
    const progress = decimal(body.progress, 0, 100, 2, "Progress"); const comment = optionalBodyText(body.comment, 20_000, "Comment");
    if (status === "Not Started" && progress !== 0) throw new ApiError(400, "validation_failed", "A not-started assignment must have zero progress.");
    if ((status === "Completed" || status === "Reviewed") && progress !== 100) throw new ApiError(400, "validation_failed", "A completed or reviewed assignment must have 100 percent progress.");
    const updated = await database.transaction(async (transaction) => { const estimate = await lockEstimate(transaction, id, estimateVersion); const lookup = new sql.Request(transaction);
      lookup.input("assignment", sql.BigInt, assignmentId); lookup.input("estimate", sql.BigInt, id); const beforeRow = (await lookup.query<Record<string, unknown> & { row_version: Buffer }>(`SELECT id,section,owner_id,support_id,due_date,status,progress,comment,row_version FROM dbo.estimate_assignments WITH (UPDLOCK,HOLDLOCK) WHERE id=@assignment AND estimate_id=@estimate;`)).recordset[0];
      if (!beforeRow) throw new ApiError(404, "estimate_assignment_not_found", "Estimate assignment not found."); if (!beforeRow.row_version.equals(lineVersion)) throw new ApiError(409, "concurrency_conflict", "This estimate assignment changed. Reload and try again.");
      const before = { ...beforeRow, row_version: undefined, rowVersion: beforeRow.row_version.toString("base64") }; const canElevate = elevated(actor, estimate);
      if (!canElevate && Number(beforeRow.owner_id) !== actor.id && Number(beforeRow.support_id) !== actor.id) throw new ApiError(403, "estimate_assignment_forbidden", "Only the estimate owner, manager, assignment owner or support engineer can update this section.");
      if (!canElevate && (ownerId !== Number(beforeRow.owner_id) || supportId !== (beforeRow.support_id === null ? null : Number(beforeRow.support_id)) || dueDate !== dateOnly(beforeRow.due_date as Date | string))) {
        throw new ApiError(403, "estimate_assignment_reassign_forbidden", "Only the estimate owner, an engineering manager or an administrator can reassign a section or change its due date.");
      }
      if (dueDate > dateOnly(estimate.due_date)!) throw new ApiError(400, "validation_failed", "Assignment due date cannot be later than the estimate due date.");
      await validateOwnerSupplier(transaction, ownerId, null); if (supportId !== null) await validateOwnerSupplier(transaction, supportId, null);
      const update = new sql.Request(transaction); update.input("owner", sql.BigInt, ownerId); update.input("support", sql.BigInt, supportId); update.input("due", sql.Date, dueDate);
      update.input("status", sql.NVarChar(50), status); update.input("progress", sql.Decimal(5, 2), progress); update.input("comment", sql.NVarChar(sql.MAX), comment);
      update.input("assignment", sql.BigInt, assignmentId); update.input("estimate", sql.BigInt, id); update.input("version", sql.VarBinary(8), lineVersion);
      const row = (await update.query<{ row_version: Buffer }>(`UPDATE dbo.estimate_assignments SET owner_id=@owner,support_id=@support,due_date=@due,status=@status,progress=@progress,comment=@comment
        OUTPUT inserted.row_version WHERE id=@assignment AND estimate_id=@estimate AND row_version=@version;`)).recordset[0];
      if (!row) throw new ApiError(409, "concurrency_conflict", "This estimate assignment changed. Reload and try again."); const newEstimateVersion = await touchEstimate(transaction, id, actor.id);
      const afterRequest = new sql.Request(transaction); afterRequest.input("assignment", sql.BigInt, assignmentId); const after = (await afterRequest.query<Record<string, unknown>>(`SELECT id,section,owner_id,support_id,due_date,status,progress,comment FROM dbo.estimate_assignments WHERE id=@assignment;`)).recordset[0];
      await insertAudit(transaction, actor.id, "EstimateAssignment", assignmentId, estimate.estimate_no, "Updated", before, { ...after, rowVersion: row.row_version.toString("base64") });
      const priorIds = [Number(beforeRow.owner_id), ...(beforeRow.support_id === null ? [] : [Number(beforeRow.support_id)])];
      const newRecipientIds = [ownerId, ...(supportId === null ? [] : [supportId])].filter((userId) => !priorIds.includes(userId));
      const recipients = await assignmentRecipients(transaction, newRecipientIds);
      return {
        payload: { id: assignmentId, rowVersion: row.row_version.toString("base64"), estimateRowVersion: newEstimateVersion.toString("base64") },
        emailMessage: recipients.length ? { estimateId: id, estimateNumber: estimate.estimate_no, projectName: estimate.project_name,
          section: String(beforeRow.section), dueDate, assignedBy: actor.name, recipients } satisfies EstimateAssignmentEmail : null,
      };
    });
    const notification = await deliverAssignmentEmail(email, updated.emailMessage);
    return { ...updated.payload, notification };
  });

  app.put("/api/v1/estimates/:id/contingency", async (request) => { await users.demandPermission(request, "estimate.write"); const actor = await users.required(request);
    const id = positiveLong((request.params as { id?: string }).id, "Estimate id"); const body = bodyObject(request.body); const rowVersion = parseRowVersion(body.rowVersion);
    const rate = decimal(body.contingencyRate, 0, 100, 4, "Contingency rate"); return database.transaction(async (transaction) => { const estimate = await lockEstimate(transaction, id, rowVersion);
      if (!elevated(actor, estimate)) throw new ApiError(403, "estimate_owner_required", "Only the estimate owner, an engineering manager or an administrator can update contingency.");
      const previousRequest = new sql.Request(transaction); previousRequest.input("id", sql.BigInt, id); const previous = Number((await previousRequest.query<{ rate: number | string }>(`SELECT contingency_rate rate FROM dbo.estimates WITH (UPDLOCK,HOLDLOCK) WHERE id=@id AND deleted_at IS NULL;`)).recordset[0]!.rate);
      const update = new sql.Request(transaction); update.input("rate", sql.Decimal(9, 4), rate); update.input("actor", sql.BigInt, actor.id); update.input("id", sql.BigInt, id); update.input("revision", sql.Int, estimate.revision); update.input("version", sql.VarBinary(8), rowVersion);
      const row = (await update.query<{ row_version: Buffer }>(`UPDATE dbo.estimates SET contingency_rate=@rate,updated_by=@actor,updated_at=SYSUTCDATETIME(),progress=CASE WHEN progress<10 THEN 10 ELSE progress END
        OUTPUT inserted.row_version WHERE id=@id AND revision=@revision AND row_version=@version;`)).recordset[0]; if (!row) throw new ApiError(409, "concurrency_conflict", "This estimate changed. Reload and try again.");
      await insertAudit(transaction, actor.id, "Estimate", id, estimate.estimate_no, "Contingency updated", { contingencyRate: previous }, { contingencyRate: rate });
      return { id, contingencyRate: rate, rowVersion: row.row_version.toString("base64") }; });
  });
}
