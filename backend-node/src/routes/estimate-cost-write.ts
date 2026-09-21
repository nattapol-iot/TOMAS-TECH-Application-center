import { parseModuleDescriptionRows, scaleModuleQuantities } from "../estimate-module-details.js";
import type { FastifyInstance, FastifyRequest } from "fastify";
import sql from "mssql";
import type { Transaction as TransactionType } from "mssql";
import { insertAudit } from "../audit.js";
import type { Database } from "../db.js";
import { ApiError } from "../errors.js";
import { hasRole } from "../user-roles.js";
import { assertEstimateTotals } from "../estimate-total-guard.js";
import { bodyObject, optionalBodyText, parseDateOnly, parseRowVersion, positiveLong, requiredInteger, requiredText } from "../http.js";
import type { CurrentUser } from "../types.js";
import type { CurrentUserService } from "../users.js";

const editableStatuses = ["Draft", "Engineering Input", "Revision Required"];
const categoryNames: Record<string, string> = {
  "01": "Hardware", "02": "Software", "03": "Electrical", "04": "Mechanical", "05": "Robot",
  "06": "Engineering", "07": "Outsource", "08": "Transportation", "09": "Accommodation", "10": "Other Cost",
};
const allowedPriceSources = [
  "Supplier Quotation", "Price Library", "Previous Project", "Budgetary", "Previous Estimate",
  "Previous Project Cost", "Purchase Price", "Master Price", "Manual Estimate", "Budgetary Price",
  "Master Template",
];

export type EditableEstimate = { estimate_no: string; revision: number; owner_id: number | string; due_date: Date | string };
/** User ids that own or support any discipline section of the estimate's current revision. */
export type EstimateAssignees = Set<number>;
type CostInput = {
  estimateRowVersion: Buffer; lineRowVersion: Buffer | null; categoryCode: string; subcategory: string;
  module: string; itemCode: string; description: string; brand: string; model: string; specification: string | null;
  supplierId: number | null; quantity: number; unit: string; unitCost: number; priceSource: string;
  referenceNumber: string | null; referenceProject: string | null; priceDate: string | null; remark: string | null; ownerId: number;
};

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

function parseCostInput(request: FastifyRequest, requireLineVersion: boolean): CostInput {
  const body = bodyObject(request.body);
  const categoryCode = requiredText(body.categoryCode, 2, "Category code").toUpperCase();
  if (!categoryNames[categoryCode]) throw new ApiError(400, "validation_failed", "Category code is not allowed.");
  const priceSource = requiredText(body.priceSource, 100, "Price source");
  if (!allowedPriceSources.includes(priceSource)) throw new ApiError(400, "validation_failed", "Price source is not allowed.");
  const quantity = requiredInteger(body.quantity, "Quantity", 1, 1_000_000_000);
  const unitCost = decimal(body.unitCost, 0, 1_000_000_000, 4, "Unit cost");
  if (quantity * unitCost > 999_999_999_999_999) {
    throw new ApiError(400, "validation_failed", "Line total exceeds the supported monetary range.");
  }
  let supplierId: number | null = null;
  if (body.supplierId !== null && body.supplierId !== undefined) supplierId = requiredInteger(body.supplierId, "Supplier", 1);
  const lineRowVersion = body.lineRowVersion === undefined || body.lineRowVersion === null || body.lineRowVersion === ""
    ? null : parseRowVersion(body.lineRowVersion);
  if (requireLineVersion && !lineRowVersion) throw new ApiError(400, "invalid_row_version", "The cost line row version is required.");
  return {
    estimateRowVersion: parseRowVersion(body.estimateRowVersion), lineRowVersion, categoryCode,
    subcategory: optionalBodyText(body.subcategory, 100, "Subcategory") ?? "",
    module: optionalBodyText(body.module, 200, "Module") ?? "", itemCode: requiredText(body.itemCode, 100, "Item code"),
    description: requiredText(body.description, 500, "Description"), brand: optionalBodyText(body.brand, 100, "Brand") ?? "",
    model: optionalBodyText(body.model, 200, "Model") ?? "", specification: optionalBodyText(body.specification, 20_000, "Specification"),
    supplierId, quantity, unit: requiredText(body.unit, 50, "Unit"), unitCost, priceSource,
    referenceNumber: optionalBodyText(body.referenceNumber, 200, "Reference number"),
    referenceProject: optionalBodyText(body.referenceProject, 200, "Reference project"),
    priceDate: parseDateOnly(body.priceDate, "Price date", true), remark: optionalBodyText(body.remark, 20_000, "Remark"),
    ownerId: requiredInteger(body.ownerId, "Owner", 1),
  };
}

export async function lockEditableEstimate(transaction: TransactionType, id: number, expected: Buffer): Promise<EditableEstimate> {
  const request = new sql.Request(transaction); request.input("id", sql.BigInt, id);
  const row = (await request.query<EditableEstimate & { status: string; row_version: Buffer }>(`
    SELECT estimate_no,revision,status,row_version,owner_id,due_date FROM dbo.estimates WITH (UPDLOCK,HOLDLOCK)
    WHERE id=@id AND deleted_at IS NULL;
  `)).recordset[0];
  if (!row) throw new ApiError(404, "estimate_not_found", "Estimate not found.");
  if (!row.row_version.equals(expected)) throw new ApiError(409, "concurrency_conflict", "This estimate changed. Reload and try again.");
  if (!editableStatuses.some((status) => status.toLowerCase() === row.status.toLowerCase())) {
    throw new ApiError(409, "estimate_locked", `Cost lines cannot be changed while the estimate is '${row.status}'.`);
  }
  return row;
}

export async function validateReferences(transaction: TransactionType, ownerId: number, supplierId: number | null): Promise<void> {
  const request = new sql.Request(transaction); request.input("owner_id", sql.BigInt, ownerId); request.input("supplier_id", sql.BigInt, supplierId);
  const row = (await request.query<{ owner_valid: boolean; supplier_valid: boolean }>(`
    SELECT CASE WHEN EXISTS(SELECT 1 FROM dbo.users u INNER JOIN dbo.roles r ON r.id=u.role_id
      WHERE u.id=@owner_id AND u.is_active=1 AND u.deleted_at IS NULL AND r.code IN(N'Engineer',N'Engineering Manager',N'Admin'))
      THEN CAST(1 AS bit) ELSE CAST(0 AS bit) END owner_valid,
      CASE WHEN @supplier_id IS NULL OR EXISTS(SELECT 1 FROM dbo.suppliers WHERE id=@supplier_id AND is_active=1 AND deleted_at IS NULL)
      THEN CAST(1 AS bit) ELSE CAST(0 AS bit) END supplier_valid;
  `)).recordset[0]!;
  if (!row.owner_valid) throw new ApiError(400, "validation_failed", "The selected cost owner must be an active engineer, engineering manager or administrator.");
  if (!row.supplier_valid) throw new ApiError(400, "validation_failed", "The selected supplier is inactive or does not exist.");
}

/* Assignments are per discipline (Electrical / Mechanical / Software), so the permission
   question is simply "does this person own or support any section of the estimate?".
   The rows are locked for the transaction so an assignment cannot be moved away mid-write. */
export async function estimateAssignees(transaction: TransactionType, estimateId: number, revision: number): Promise<EstimateAssignees> {
  const request = new sql.Request(transaction); request.input("estimate_id", sql.BigInt, estimateId); request.input("revision", sql.Int, revision);
  const rows = (await request.query<{ owner_id: number | string; support_id: number | string | null }>(`
    SELECT a.owner_id,a.support_id FROM dbo.estimate_assignments a WITH (UPDLOCK,HOLDLOCK)
    INNER JOIN dbo.estimates e WITH (UPDLOCK,HOLDLOCK) ON e.id=a.estimate_id AND e.revision=@revision AND e.deleted_at IS NULL
    WHERE a.estimate_id=@estimate_id;
  `)).recordset;
  const assignees: EstimateAssignees = new Set();
  for (const row of rows) { assignees.add(Number(row.owner_id)); if (row.support_id !== null) assignees.add(Number(row.support_id)); }
  return assignees;
}

export function elevated(actor: CurrentUser, estimate: EditableEstimate): boolean {
  return actor.id === Number(estimate.owner_id) || hasRole(actor, "Engineering Manager", "Admin");
}
export function assigned(actor: CurrentUser, assignees: EstimateAssignees): boolean {
  return assignees.has(actor.id);
}

async function costSnapshot(transaction: TransactionType, estimateId: number, revision: number, lineId: number, expected: Buffer, includeDeleted: boolean): Promise<Record<string, unknown>> {
  const request = new sql.Request(transaction); request.input("line_id", sql.BigInt, lineId); request.input("estimate_id", sql.BigInt, estimateId);
  request.input("revision", sql.Int, revision); request.input("include_deleted", sql.Bit, includeDeleted);
  const row = (await request.query<Record<string, unknown> & { row_version: Buffer }>(`
    SELECT id,category_code,category,subcategory,module,item_code,description,brand,model,specification,supplier_id,qty,unit,price_set_key,is_price_set,qty_per_set,
      unit_cost,price_source,reference_no,reference_project,price_date,remark,owner_id,status,deleted_at,row_version
    FROM dbo.cost_items WITH (UPDLOCK,HOLDLOCK) WHERE id=@line_id AND estimate_id=@estimate_id AND revision=@revision
      AND (@include_deleted=1 OR deleted_at IS NULL);
  `)).recordset[0];
  if (!row || !row.row_version.equals(expected)) throw new ApiError(409, "concurrency_conflict", "This cost line was changed or removed. Reload and try again.");
  const { row_version, ...values } = row;
  return { ...values, rowVersion: row_version.toString("base64") };
}

function bindCost(request: InstanceType<typeof sql.Request>, estimateId: number, revision: number, input: CostInput, actorId: number): void {
  request.input("estimate_id", sql.BigInt, estimateId); request.input("revision", sql.Int, revision);
  request.input("category_code", sql.Char(2), input.categoryCode); request.input("category", sql.NVarChar(100), categoryNames[input.categoryCode]);
  request.input("subcategory", sql.NVarChar(100), input.subcategory); request.input("module", sql.NVarChar(200), input.module);
  request.input("item_code", sql.NVarChar(100), input.itemCode); request.input("description", sql.NVarChar(500), input.description);
  request.input("brand", sql.NVarChar(100), input.brand); request.input("model", sql.NVarChar(200), input.model);
  request.input("specification", sql.NVarChar(sql.MAX), input.specification); request.input("supplier_id", sql.BigInt, input.supplierId);
  request.input("qty", sql.Decimal(19, 4), input.quantity); request.input("unit", sql.NVarChar(50), input.unit);
  request.input("unit_cost", sql.Decimal(19, 4), input.unitCost); request.input("price_source", sql.NVarChar(100), input.priceSource);
  request.input("reference_no", sql.NVarChar(200), input.referenceNumber); request.input("reference_project", sql.NVarChar(200), input.referenceProject);
  request.input("price_date", sql.Date, input.priceDate); request.input("remark", sql.NVarChar(sql.MAX), input.remark);
  request.input("owner_id", sql.BigInt, input.ownerId); request.input("actor", sql.BigInt, actorId);
}

export async function touchEstimate(transaction: TransactionType, id: number, actorId: number): Promise<Buffer> {
  await assertEstimateTotals(transaction, id);
  const request = new sql.Request(transaction); request.input("actor", sql.BigInt, actorId); request.input("id", sql.BigInt, id);
  const row = (await request.query<{ row_version: Buffer }>(`UPDATE dbo.estimates SET updated_by=@actor,updated_at=SYSUTCDATETIME(),
    progress=CASE WHEN progress<10 THEN 10 ELSE progress END OUTPUT inserted.row_version WHERE id=@id;`)).recordset[0];
  if (!row) throw new ApiError(409, "concurrency_conflict", "The estimate could not be updated.");
  return row.row_version;
}

export function registerEstimateCostWriteRoutes(app: FastifyInstance, database: Database, users: CurrentUserService): void {
  app.get("/api/v1/estimates/:id/module-details", async request => {
    await users.demandPermission(request, "estimate.read");
    const id = positiveLong((request.params as { id?: string }).id, "Estimate id");
    const result = await database.query<{ moduleKey: string; title: string; remark: string | null; descriptionRows: string }>(`
      SELECT d.module_key moduleKey,d.title,d.remark,d.quantity,d.unit,d.description_rows descriptionRows FROM dbo.estimate_module_details d
      INNER JOIN dbo.estimates e ON e.id=d.estimate_id AND e.revision=d.revision
      WHERE e.id=@id AND e.deleted_at IS NULL;`, query => { query.input("id", sql.BigInt, id); });
    return result.recordset.map(row => ({ ...row, descriptionRows: JSON.parse(row.descriptionRows) as string[] }));
  });
  app.put("/api/v1/estimates/:id/module-details", async request => {
    await users.demandPermission(request, "estimate.write");
    const actor = await users.required(request);
    const id = positiveLong((request.params as { id?: string }).id, "Estimate id");
    const body = bodyObject(request.body);
    const moduleKey = requiredText(body.moduleKey, 250, "Module key");
    const title = requiredText(body.title, 200, "Module name");
    const remark = optionalBodyText(body.remark, 2000, "Remark");
    const descriptionRows = parseModuleDescriptionRows(body.descriptionRows);
    const moduleQuantity = body.quantity === undefined ? undefined : Number(body.quantity);
    if (moduleQuantity !== undefined && (!Number.isFinite(moduleQuantity) || !Number.isInteger(moduleQuantity) || moduleQuantity <= 0 || moduleQuantity > 1000000 || Math.abs(moduleQuantity*10000-Math.round(moduleQuantity*10000))>0.00001))
      throw new ApiError(400, "validation_failed", "Module quantity must be positive with at most four decimal places.");
    const moduleUnit = body.unit === undefined ? undefined : requiredText(body.unit, 30, "Module unit");
    const workPackage = /^package:(Engineering|Installation):(.+)$/.exec(moduleKey);
    const cost = /^category:(\d{2}):(.+)$/.exec(moduleKey);
    /* Quantity and unit are how a module is written on the ERP sheet. On a cost
       module they also rescale its items; on a labour or ledger module the amount
       comes from its own lines, so they only change how that amount is expressed. */
    const ledger = /^(expenses|other):(.+)$/.exec(moduleKey);
    if (!cost && !workPackage && !ledger && moduleKey !== "summary" && !["labor:Software", "labor:Service", "labor:Installation"].includes(moduleKey))
      throw new ApiError(400, "invalid_module", "Choose an existing main module.");
    if ((moduleQuantity !== undefined || moduleUnit !== undefined) && moduleKey === "summary")
      throw new ApiError(400, "invalid_module", "The summary remark has no quantity.");
    return database.transaction(async transaction => {
      const estimate = await lockEditableEstimate(transaction, id, parseRowVersion(body.estimateRowVersion));
      // An assignee edits the modules of the sections they work in; the rest is owner or admin.
      const assigneeEditable = Boolean(cost || workPackage || ledger?.[1] === "expenses");
      if (!elevated(actor, estimate) && (!assigneeEditable || !assigned(actor, await estimateAssignees(transaction, id, estimate.revision))))
        throw new ApiError(403, "module_forbidden", "You cannot edit this module.");
      const query = new sql.Request(transaction);
      query.input("id", sql.BigInt, id); query.input("revision", sql.Int, estimate.revision);
      query.input("key", sql.NVarChar(250), moduleKey); query.input("title", sql.NVarChar(200), title);
      query.input("description_rows", sql.NVarChar(sql.MAX), descriptionRows === undefined ? null : JSON.stringify(descriptionRows));
      query.input("remark", sql.NVarChar(2000), remark); query.input("actor", sql.BigInt, actor.id);
      const before = (await query.query(`SELECT module_key,title,remark,description_rows,quantity,unit FROM dbo.estimate_module_details WITH(UPDLOCK,HOLDLOCK)
        WHERE estimate_id=@id AND revision=@revision AND module_key=@key;`)).recordset[0] ?? null;
      let savedKey = moduleKey;
      const oldQuantity = Number(before?.quantity ?? 1);
      const nextQuantity = moduleQuantity ?? oldQuantity;
      query.input("module_quantity", sql.Decimal(19,4), nextQuantity);
      query.input("module_unit", sql.NVarChar(30), moduleUnit ?? before?.unit ?? "Set");
      let quantityBefore: { id: number; qty: number | string }[] = [];
      let quantityAfter: unknown[] = [];
      if (cost) {
        query.input("category", sql.Char(2), cost[1]); query.input("module", sql.NVarChar(200), cost[2]);
        const current = (await query.query<{ id: number }>(`SELECT id FROM dbo.cost_items WITH(UPDLOCK,HOLDLOCK)
          WHERE estimate_id=@id AND revision=@revision AND deleted_at IS NULL AND category_code=@category
          AND LTRIM(RTRIM(module)) COLLATE Latin1_General_100_BIN2=@module;`)).recordset;
        if (!current.length) throw new ApiError(409, "module_changed", "This module changed. Reload and try again.");
        if (nextQuantity !== oldQuantity) {
          query.input("old_quantity", sql.Decimal(19,4), oldQuantity);
          quantityBefore = (await query.query(`SELECT id,qty,unit,unit_cost,price_set_key,is_price_set,qty_per_set FROM dbo.cost_items
            WHERE estimate_id=@id AND revision=@revision AND deleted_at IS NULL AND category_code=@category
            AND LTRIM(RTRIM(module)) COLLATE Latin1_General_100_BIN2=@module;`)).recordset;
          for (const row of scaleModuleQuantities(quantityBefore, oldQuantity, nextQuantity)) {
            const update = new sql.Request(transaction);
            update.input("id", sql.BigInt, row.id); update.input("estimate", sql.BigInt, id);
            update.input("revision", sql.Int, estimate.revision); update.input("actor", sql.BigInt, actor.id);
            update.input("quantity", sql.Decimal(19,4), row.quantity);
            await update.query(`UPDATE dbo.cost_items SET qty=@quantity,updated_by=@actor,updated_at=SYSUTCDATETIME()
              WHERE id=@id AND estimate_id=@estimate AND revision=@revision AND deleted_at IS NULL;`);
          }
          quantityAfter = (await query.query(`SELECT id,qty,unit,unit_cost,price_set_key,is_price_set,qty_per_set FROM dbo.cost_items
            WHERE estimate_id=@id AND revision=@revision AND deleted_at IS NULL AND category_code=@category
            AND LTRIM(RTRIM(module)) COLLATE Latin1_General_100_BIN2=@module;`)).recordset;
        }
        if (title !== cost[2]) {
          const collision = (await query.query(`SELECT TOP(1) id FROM dbo.cost_items WHERE estimate_id=@id AND revision=@revision
            AND deleted_at IS NULL AND category_code=@category AND LTRIM(RTRIM(module)) COLLATE Latin1_General_100_BIN2=@title;`)).recordset[0];
          if (collision) throw new ApiError(409, "module_name_exists", "Another module already uses this name.");
          await query.query(`UPDATE dbo.cost_items SET module=@title,updated_by=@actor,updated_at=SYSUTCDATETIME()
            WHERE estimate_id=@id AND revision=@revision AND deleted_at IS NULL AND category_code=@category
              AND LTRIM(RTRIM(module)) COLLATE Latin1_General_100_BIN2=@module;`);
          savedKey = "category:" + cost[1] + ":" + title;
        }
      }
      if (workPackage) {
        query.input("cost_type", sql.NVarChar(30), workPackage[1]); query.input("package", sql.NVarChar(200), workPackage[2]);
        const members = (await query.query<{ id: number; owner_id: number }>(`SELECT id,owner_id FROM dbo.manhour_lines WITH(UPDLOCK,HOLDLOCK)
          WHERE estimate_id=@id AND revision=@revision AND deleted_at IS NULL AND cost_type=@cost_type
            AND package COLLATE Latin1_General_100_BIN2=@package
          UNION ALL SELECT id,owner_id FROM dbo.expense_lines WITH(UPDLOCK,HOLDLOCK)
          WHERE estimate_id=@id AND revision=@revision AND deleted_at IS NULL AND cost_type=@cost_type
            AND package COLLATE Latin1_General_100_BIN2=@package;`)).recordset;
        if (!members.length) throw new ApiError(409, "module_changed", "This work package changed. Reload and try again.");
        if (!elevated(actor, estimate) && members.some(line => Number(line.owner_id) !== actor.id))
          throw new ApiError(403, "module_forbidden", "You may rename a work package only when all its lines are editable by you.");
        if (title !== workPackage[2]) {
          const collision = (await query.query(`SELECT TOP(1) id FROM (
            SELECT id FROM dbo.manhour_lines WHERE estimate_id=@id AND revision=@revision AND deleted_at IS NULL AND cost_type=@cost_type AND package COLLATE Latin1_General_100_BIN2=@title
            UNION ALL SELECT id FROM dbo.expense_lines WHERE estimate_id=@id AND revision=@revision AND deleted_at IS NULL AND cost_type=@cost_type AND package COLLATE Latin1_General_100_BIN2=@title
          ) members;`)).recordset[0];
          if (collision) throw new ApiError(409, "module_name_exists", "Another work package already uses this name.");
          await query.query(`UPDATE dbo.manhour_lines SET package=@title,updated_by=@actor,updated_at=SYSUTCDATETIME()
            WHERE estimate_id=@id AND revision=@revision AND deleted_at IS NULL AND cost_type=@cost_type AND package COLLATE Latin1_General_100_BIN2=@package;
            UPDATE dbo.expense_lines SET package=@title,updated_by=@actor,updated_at=SYSUTCDATETIME()
            WHERE estimate_id=@id AND revision=@revision AND deleted_at IS NULL AND cost_type=@cost_type AND package COLLATE Latin1_General_100_BIN2=@package;`);
          savedKey = "package:" + workPackage[1] + ":" + title;
        }
      }
      query.input("saved_key", sql.NVarChar(250), savedKey);
      // Audit retains the old identity; move its metadata to the current module name.
      await query.query(`UPDATE dbo.estimate_module_details SET quantity=@module_quantity,unit=@module_unit,title=@title,remark=CASE WHEN @key=N'summary' THEN @remark ELSE remark END,description_rows=COALESCE(@description_rows,description_rows),updated_by=@actor,updated_at=SYSUTCDATETIME()
        WHERE estimate_id=@id AND revision=@revision AND module_key=@saved_key;
        IF @@ROWCOUNT=0 INSERT dbo.estimate_module_details(estimate_id,revision,module_key,title,remark,updated_by,description_rows,quantity,unit)
          VALUES(@id,@revision,@saved_key,@title,CASE WHEN @key=N'summary' THEN @remark END,@actor,COALESCE(@description_rows,N'[]'),@module_quantity,@module_unit);
        DELETE dbo.estimate_module_details WHERE estimate_id=@id AND revision=@revision AND module_key=@key AND @key<>@saved_key;`);
      await insertAudit(transaction, actor.id, "Estimate", id, estimate.estimate_no, "Module details updated", { moduleKey, details: before, lines: quantityBefore }, { moduleKey: savedKey, title, quantity: nextQuantity, unit: moduleUnit ?? before?.unit ?? "Set", lines: quantityAfter, ...(moduleKey === "summary" ? { remark } : {}), descriptionRows });
      const version = await touchEstimate(transaction, id, actor.id);
      return { estimateRowVersion: version.toString("base64") };
    });
  });

  app.post("/api/v1/estimates/:id/cost-items", async (request, reply) => {
    await users.demandPermission(request, "estimate.write"); const actor = await users.required(request);
    const id = positiveLong((request.params as { id?: string }).id, "Estimate id"); const input = parseCostInput(request, false);
    const created = await database.transaction(async (transaction) => {
      const estimate = await lockEditableEstimate(transaction, id, input.estimateRowVersion); await validateReferences(transaction, input.ownerId, input.supplierId);
      if (!elevated(actor, estimate)) {
        const assignees = await estimateAssignees(transaction, id, estimate.revision);
        if (!assigned(actor, assignees)) throw new ApiError(403, "estimate_section_forbidden", "You may add cost lines only to an estimate that has a section assigned to you.");
        if (!assignees.has(input.ownerId)) {
          throw new ApiError(403, "cost_owner_forbidden", "You cannot assign a cost line to a user who is not assigned to this estimate.");
        }
      }
      const insert = new sql.Request(transaction); bindCost(insert, id, estimate.revision, input, actor.id);
      const row = (await insert.query<{ id: number | string; row_version: Buffer }>(`DECLARE @created TABLE(id bigint,row_version binary(8));
        INSERT INTO dbo.cost_items(estimate_id,revision,category_code,category,
        subcategory,module,item_code,description,brand,model,specification,supplier_id,qty,unit,unit_cost,price_source,reference_no,
        reference_project,price_date,remark,owner_id,status,created_by,updated_by) OUTPUT inserted.id,inserted.row_version INTO @created(id,row_version)
        VALUES(@estimate_id,@revision,@category_code,@category,@subcategory,@module,@item_code,@description,@brand,@model,@specification,
        @supplier_id,@qty,@unit,@unit_cost,@price_source,@reference_no,@reference_project,@price_date,@remark,@owner_id,N'Active',@actor,@actor);
        SELECT id,row_version FROM @created;`)).recordset[0]!;
      const lineId = Number(row.id); const estimateVersion = await touchEstimate(transaction, id, actor.id);
      const after = await costSnapshot(transaction, id, estimate.revision, lineId, row.row_version, false);
      await insertAudit(transaction, actor.id, "CostItem", lineId, estimate.estimate_no, "Created", null, after);
      return { id: lineId, rowVersion: row.row_version.toString("base64"), estimateRowVersion: estimateVersion.toString("base64") };
    });
    return reply.status(201).header("Location", `/api/v1/estimates/${id}/cost-items/${created.id}`).send(created);
  });

  app.put("/api/v1/estimates/:id/cost-items/:lineId", async (request) => {
    await users.demandPermission(request, "estimate.write"); const actor = await users.required(request);
    const params = request.params as { id?: string; lineId?: string }; const id = positiveLong(params.id, "Estimate id");
    const lineId = positiveLong(params.lineId, "Cost line id"); const input = parseCostInput(request, true);
    return database.transaction(async (transaction) => {
      const estimate = await lockEditableEstimate(transaction, id, input.estimateRowVersion); await validateReferences(transaction, input.ownerId, input.supplierId);
      const before = await costSnapshot(transaction, id, estimate.revision, lineId, input.lineRowVersion!, false);
      if (before.price_set_key) throw new ApiError(409, "price_set_member", "Edit the price set or remove this component from its set before changing it.");
      if (!elevated(actor, estimate)) {
        if (!assigned(actor, await estimateAssignees(transaction, id, estimate.revision))) throw new ApiError(403, "cost_line_forbidden", "You may update a cost line only while a section of this estimate is assigned to you.");
        if (input.ownerId !== Number(before.owner_id)) throw new ApiError(403, "cost_owner_forbidden", "Only the estimate owner, an engineering manager or an administrator can reassign a cost line.");
      }
      const update = new sql.Request(transaction); bindCost(update, id, estimate.revision, input, actor.id); update.input("line_id", sql.BigInt, lineId);
      update.input("line_version", sql.VarBinary(8), input.lineRowVersion);
      const row = (await update.query<{ row_version: Buffer }>(`DECLARE @updated TABLE(row_version binary(8));
        UPDATE dbo.cost_items SET category_code=@category_code,category=@category,subcategory=@subcategory,
        module=@module,item_code=@item_code,description=@description,brand=@brand,model=@model,specification=@specification,supplier_id=@supplier_id,
        qty=@qty,unit=@unit,unit_cost=@unit_cost,price_source=@price_source,reference_no=@reference_no,reference_project=@reference_project,
        price_date=@price_date,remark=@remark,owner_id=@owner_id,updated_by=@actor,updated_at=SYSUTCDATETIME() OUTPUT inserted.row_version INTO @updated(row_version)
        WHERE id=@line_id AND estimate_id=@estimate_id AND revision=@revision AND deleted_at IS NULL AND row_version=@line_version;
        SELECT row_version FROM @updated;`)).recordset[0];
      if (!row) throw new ApiError(409, "concurrency_conflict", "This cost line was changed or removed. Reload and try again.");
      const estimateVersion = await touchEstimate(transaction, id, actor.id); const after = await costSnapshot(transaction, id, estimate.revision, lineId, row.row_version, false);
      await insertAudit(transaction, actor.id, "CostItem", lineId, estimate.estimate_no, "Updated", before, after);
      return { id: lineId, rowVersion: row.row_version.toString("base64"), estimateRowVersion: estimateVersion.toString("base64") };
    });
  });

  app.post("/api/v1/estimates/:id/cost-items/:lineId/remove", async (request) => {
    await users.demandPermission(request, "estimate.write"); const actor = await users.required(request);
    const params = request.params as { id?: string; lineId?: string }; const id = positiveLong(params.id, "Estimate id");
    const lineId = positiveLong(params.lineId, "Cost line id"); const body = bodyObject(request.body);
    const estimateRowVersion = parseRowVersion(body.estimateRowVersion); const lineRowVersion = parseRowVersion(body.lineRowVersion);
    const reason = optionalBodyText(body.reason, 20_000, "Removal reason");
    return database.transaction(async (transaction) => {
      const estimate = await lockEditableEstimate(transaction, id, estimateRowVersion);
      const before = await costSnapshot(transaction, id, estimate.revision, lineId, lineRowVersion, false);
      if (before.price_set_key) throw new ApiError(409, "price_set_member", "Edit the price set or remove this component from its set before changing it.");
      if (!elevated(actor, estimate) && !assigned(actor, await estimateAssignees(transaction, id, estimate.revision))) {
        throw new ApiError(403, "cost_line_forbidden", "You may remove a cost line only while a section of this estimate is assigned to you.");
      }
      const update = new sql.Request(transaction); update.input("actor", sql.BigInt, actor.id); update.input("line_id", sql.BigInt, lineId);
      update.input("estimate_id", sql.BigInt, id); update.input("revision", sql.Int, estimate.revision); update.input("line_version", sql.VarBinary(8), lineRowVersion);
      const row = (await update.query<{ row_version: Buffer }>(`DECLARE @removed TABLE(row_version binary(8));
        UPDATE dbo.cost_items SET deleted_at=SYSUTCDATETIME(),updated_by=@actor,
        updated_at=SYSUTCDATETIME() OUTPUT inserted.row_version INTO @removed(row_version) WHERE id=@line_id AND estimate_id=@estimate_id AND revision=@revision
        AND deleted_at IS NULL AND row_version=@line_version;
        SELECT row_version FROM @removed;`)).recordset[0];
      if (!row) throw new ApiError(409, "concurrency_conflict", "This cost line was changed or removed. Reload and try again.");
      const estimateVersion = await touchEstimate(transaction, id, actor.id); const after = await costSnapshot(transaction, id, estimate.revision, lineId, row.row_version, true);
      await insertAudit(transaction, actor.id, "CostItem", lineId, estimate.estimate_no, "Removed", { line: before }, { line: after, removalReason: reason });
      return { id: lineId, estimateRowVersion: estimateVersion.toString("base64") };
    });
  });

  app.post("/api/v1/estimates/:id/cost-modules/remove", async (request) => {
    await users.demandPermission(request, "estimate.write");
    const actor = await users.required(request);
    const id = positiveLong((request.params as { id?: string }).id, "Estimate id");
    const body = bodyObject(request.body);
    const categoryCode = requiredText(body.categoryCode, 2, "Category code");
    const moduleName = requiredText(body.module, 200, "Module");
    const expected = parseRowVersion(body.estimateRowVersion);
    return database.transaction(async transaction => {
      const estimate = await lockEditableEstimate(transaction, id, expected);
      if (!elevated(actor, estimate) && !assigned(actor, await estimateAssignees(transaction, id, estimate.revision))) throw new ApiError(403, "cost_line_forbidden", "You cannot remove this module.");
      const query = new sql.Request(transaction);
      query.input("id", sql.BigInt, id); query.input("revision", sql.Int, estimate.revision);
      query.input("category", sql.Char(2), categoryCode); query.input("module", sql.NVarChar(200), moduleName);
      query.input("actor", sql.BigInt, actor.id);
      const lines = (await query.query<{ id: number; row_version: Buffer }>(`SELECT id,row_version FROM dbo.cost_items WITH(UPDLOCK,HOLDLOCK)
        WHERE estimate_id=@id AND revision=@revision AND deleted_at IS NULL AND category_code=@category
        AND LTRIM(RTRIM(module)) COLLATE Latin1_General_100_BIN2=@module COLLATE Latin1_General_100_BIN2;`)).recordset;
      if (!lines.length) throw new ApiError(409, "concurrency_conflict", "This module was changed or removed. Reload and try again.");
      const before = new Map<number, Record<string, unknown>>();
      for (const line of lines) before.set(Number(line.id), await costSnapshot(transaction, id, estimate.revision, Number(line.id), line.row_version, false));
      const removed = (await query.query<{ id: number; row_version: Buffer }>(`DECLARE @removed TABLE(id bigint,row_version binary(8));
        UPDATE dbo.cost_items SET deleted_at=SYSUTCDATETIME(),updated_by=@actor,updated_at=SYSUTCDATETIME()
        OUTPUT inserted.id,inserted.row_version INTO @removed
        WHERE estimate_id=@id AND revision=@revision AND deleted_at IS NULL AND category_code=@category
        AND LTRIM(RTRIM(module)) COLLATE Latin1_General_100_BIN2=@module COLLATE Latin1_General_100_BIN2;
        SELECT id,row_version FROM @removed;`)).recordset;
      if (removed.length !== lines.length) throw new ApiError(409, "concurrency_conflict", "Module membership changed. Reload and try again.");
      for (const line of removed) {
        const after = await costSnapshot(transaction, id, estimate.revision, Number(line.id), line.row_version, true);
        await insertAudit(transaction, actor.id, "CostItem", Number(line.id), estimate.estimate_no, "Removed", { line: before.get(Number(line.id)) }, { line: after, removalReason: "Main module removed", module: moduleName, categoryCode });
      }
      const version = await touchEstimate(transaction, id, actor.id);
      return { removed: removed.length, estimateRowVersion: version.toString("base64") };
    });
  });

  /* Applying a template is a bulk cost-line create, so it runs the same locks and the
     same section checks as one — a template can never write a line the engineer could
     not have typed. The whole module lands in one transaction, or none of it does. */
  app.post("/api/v1/estimates/:id/apply-template", async (request, reply) => {
    await users.demandPermission(request, "estimate.write"); const actor = await users.required(request);
    const id = positiveLong((request.params as { id?: string }).id, "Estimate id");
    const body = bodyObject(request.body);
    const estimateRowVersion = parseRowVersion(body.estimateRowVersion);
    const templateId = requiredInteger(body.templateId, "Template id", 1);
    const moduleName = requiredText(body.module, 200, "Module");
    const modules = requiredInteger(body.modules, "Module count", 1);
    if (modules > 500) throw new ApiError(400, "validation_failed", "A single apply cannot exceed 500 modules.");
    const keepPrices = body.keepReferencePrices !== false;
    const ownerId = requiredInteger(body.ownerId, "Owner", 1);
    const applied = await database.transaction(async (transaction) => {
      const estimate = await lockEditableEstimate(transaction, id, estimateRowVersion);
      const templateRequest = new sql.Request(transaction); templateRequest.input("template_id", sql.BigInt, templateId);
      const template = (await templateRequest.query<{ code: string; name: string; revision: number; status: string }>(`
        SELECT code,name,revision,status FROM dbo.module_templates WITH(UPDLOCK,HOLDLOCK) WHERE id=@template_id;`)).recordset[0];
      if (!template) throw new ApiError(404, "module_template_not_found", "Module template not found.");
      if (template.status !== "Active") throw new ApiError(409, "module_template_not_published", "Only published templates can be applied. Ask the template maintainer to publish this draft.");
      const linesRequest = new sql.Request(transaction); linesRequest.input("template_id", sql.BigInt, templateId);
      const lines = (await linesRequest.query<{
        category_code: string; subcategory: string; item_code: string; description: string; brand: string; model: string;
        specification: string | null; supplier_id: number | string | null; qty_per_module: number | string; unit: string;
        ref_unit_cost: number | string; ref_price_date: Date | string | null; remark: string | null;
      }>(`SELECT category_code,subcategory,item_code,description,brand,model,specification,supplier_id,qty_per_module,unit,
        ref_unit_cost,ref_price_date,remark FROM dbo.module_template_lines WHERE template_id=@template_id AND deleted_at IS NULL
        ORDER BY sort_order,id;`)).recordset;
      if (!lines.length) throw new ApiError(409, "module_template_empty", "This template has no lines to apply.");
      const reference = `${template.code} R${String(template.revision).padStart(2, "0")}`;
      const disciplines = [...new Set(lines.map((line) => line.category_code))];
      if (!elevated(actor, estimate)) {
        const assignees = await estimateAssignees(transaction, id, estimate.revision);
        if (!assigned(actor, assignees)) {
          throw new ApiError(403, "estimate_section_forbidden", `You may add cost lines (${disciplines.join(", ")}) only to an estimate that has a section assigned to you.`);
        }
        if (!assignees.has(ownerId)) {
          throw new ApiError(403, "cost_owner_forbidden", "You cannot assign a cost line to a user who is not assigned to this estimate.");
        }
      }
      let created = 0;
      const renamedItemCodes: Array<{ original: string; applied: string }> = [];
      for (const line of lines) {
        const supplierId = line.supplier_id === null ? null : Number(line.supplier_id);
        await validateReferences(transaction, ownerId, supplierId);
        const quantity = Number(line.qty_per_module) * modules;
        const unitCost = keepPrices ? Number(line.ref_unit_cost) : 0;
        if (quantity * unitCost > 999_999_999_999_999) {
          throw new ApiError(400, "validation_failed", `Line ${line.item_code} exceeds the supported monetary range at ${modules} modules.`);
        }
        // Product codes may repeat; the cost line id identifies each occurrence.
        const itemCode = line.item_code;
        const insert = new sql.Request(transaction);
        bindCost(insert, id, estimate.revision, {
          estimateRowVersion, lineRowVersion: null, categoryCode: line.category_code, subcategory: line.subcategory,
          module: moduleName, itemCode, description: line.description, brand: line.brand, model: line.model,
          specification: line.specification, supplierId, quantity, unit: line.unit, unitCost,
          priceSource: "Master Template", referenceNumber: reference, referenceProject: template.name,
          priceDate: keepPrices && line.ref_price_date
            ? (typeof line.ref_price_date === "string" ? line.ref_price_date.slice(0, 10) : line.ref_price_date.toISOString().slice(0, 10))
            : null,
          remark: line.remark, ownerId,
        }, actor.id);
        await insert.query(`INSERT INTO dbo.cost_items(estimate_id,revision,category_code,category,subcategory,module,item_code,
          description,brand,model,specification,supplier_id,qty,unit,unit_cost,price_source,reference_no,reference_project,
          price_date,remark,owner_id,status,created_by,updated_by)
          VALUES(@estimate_id,@revision,@category_code,@category,@subcategory,@module,@item_code,@description,@brand,@model,
          @specification,@supplier_id,@qty,@unit,@unit_cost,@price_source,@reference_no,@reference_project,@price_date,@remark,
          @owner_id,N'Active',@actor,@actor);`);
        created += 1;
      }
      const estimateVersion = await touchEstimate(transaction, id, actor.id);
      await insertAudit(transaction, actor.id, "Estimate", id, estimate.estimate_no, "Module template applied", null, {
        template: reference, templateName: template.name, module: moduleName, modules, lines: created, keepReferencePrices: keepPrices, renamedItemCodes,
      });
      return { lines: created, module: moduleName, reference, estimateRowVersion: estimateVersion.toString("base64") };
    });
    return reply.status(201).send(applied);
  });
}
