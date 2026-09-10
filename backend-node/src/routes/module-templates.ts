import type { FastifyInstance, FastifyRequest } from "fastify";
import sql from "mssql";
import type { Transaction as TransactionType } from "mssql";
import { insertAudit } from "../audit.js";
import type { Database } from "../db.js";
import { ApiError } from "../errors.js";
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
import type { CurrentUserService } from "../users.js";

const categoryNames: Record<string, string> = {
  "01": "Hardware", "02": "Software", "03": "Electrical", "04": "Mechanical", "05": "Robot",
  "06": "Engineering", "07": "Outsource", "08": "Transportation", "09": "Accommodation", "10": "Other Cost",
};
const templateStatuses = ["Draft", "Active", "Retired"];
const MAXIMUM_LINES = 500;
const EXCLUSIVE_MAXIMUM_DECIMAL_19_SCALE_4 = 1_000_000_000;

type TemplateLineInput = {
  categoryCode: string; subcategory: string; itemCode: string; description: string;
  brand: string; model: string; specification: string | null; supplierId: number | null;
  quantityPerModule: number; unit: string; referenceUnitCost: number;
  referencePriceSource: string; referencePriceDate: string | null; remark: string | null;
};
type TemplateInput = {
  code: string; name: string; categoryCode: string; projectType: string; description: string;
  status: string; lines: TemplateLineInput[];
};

function validation(message: string): ApiError {
  return new ApiError(400, "validation_failed", message);
}

function templateCode(value: unknown): string {
  const code = requiredText(value, 40, "Template code").toUpperCase();
  if (!/^[A-Z0-9][A-Z0-9._/-]*$/.test(code)) {
    throw validation("Template code may contain only letters, numbers, hyphen, underscore, period and slash, and must start with a letter or number.");
  }
  return code;
}

function categoryCode(value: unknown, label: string): string {
  const code = requiredText(value, 2, label);
  if (!categoryNames[code]) throw validation(`${label} is not an allowed discipline.`);
  return code;
}

function decimal(value: unknown, minimum: number, maximum: number, label: string): number {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed) || parsed < minimum || parsed >= maximum) {
    throw validation(`${label} must be between ${minimum} and ${maximum}.`);
  }
  if (Math.round(parsed * 10_000) !== Number((parsed * 10_000).toFixed(0))) {
    throw validation(`${label} cannot have more than 4 decimal places.`);
  }
  return parsed;
}

function parseLine(value: unknown, index: number): TemplateLineInput {
  if (typeof value !== "object" || value === null) throw validation(`Line ${index + 1} is not an object.`);
  const line = value as Record<string, unknown>;
  return {
    categoryCode: categoryCode(line.categoryCode, `Line ${index + 1} discipline`),
    subcategory: optionalBodyText(line.subcategory, 100, "Subcategory") ?? "",
    itemCode: requiredText(line.itemCode, 100, `Line ${index + 1} item code`),
    description: requiredText(line.description, 500, `Line ${index + 1} description`),
    brand: optionalBodyText(line.brand, 100, "Brand") ?? "",
    model: optionalBodyText(line.model, 200, "Model") ?? "",
    specification: optionalBodyText(line.specification, 20_000, "Specification"),
    supplierId: line.supplierId === null || line.supplierId === undefined || line.supplierId === ""
      ? null
      : requiredInteger(line.supplierId, `Line ${index + 1} supplier`, 1),
    quantityPerModule: decimal(line.quantityPerModule, 0.0001, EXCLUSIVE_MAXIMUM_DECIMAL_19_SCALE_4, `Line ${index + 1} quantity`),
    unit: requiredText(line.unit, 50, `Line ${index + 1} unit`),
    referenceUnitCost: decimal(line.referenceUnitCost ?? 0, 0, EXCLUSIVE_MAXIMUM_DECIMAL_19_SCALE_4, `Line ${index + 1} reference cost`),
    referencePriceSource: optionalBodyText(line.referencePriceSource, 100, "Reference price source") ?? "",
    referencePriceDate: parseDateOnly(line.referencePriceDate, "Reference price date", true),
    remark: optionalBodyText(line.remark, 20_000, "Remark"),
  };
}

function parseTemplate(request: FastifyRequest): TemplateInput {
  const body = bodyObject(request.body);
  const rawLines = body.lines;
  if (!Array.isArray(rawLines) || rawLines.length === 0) throw validation("A template needs at least one line.");
  if (rawLines.length > MAXIMUM_LINES) throw validation(`A template cannot hold more than ${MAXIMUM_LINES} lines.`);
  const status = optionalBodyText(body.status, 20, "Status") ?? "Draft";
  if (!templateStatuses.includes(status)) throw validation("Status is not allowed.");
  if (status === "Retired") throw validation("Retire a template through the retire action, not by editing it.");
  return {
    code: templateCode(body.code),
    name: requiredText(body.name, 200, "Template name"),
    categoryCode: categoryCode(body.categoryCode, "Primary discipline"),
    projectType: optionalBodyText(body.projectType, 50, "Project type") ?? "",
    description: optionalBodyText(body.description, 1000, "Description") ?? "",
    status,
    lines: rawLines.map(parseLine),
  };
}

async function assertSuppliersUsable(transaction: TransactionType, lines: TemplateLineInput[]): Promise<void> {
  const supplierIds = [...new Set(lines.map((line) => line.supplierId).filter((id): id is number => id !== null))];
  if (!supplierIds.length) return;
  const request = new sql.Request(transaction);
  request.input("ids", sql.NVarChar(sql.MAX), supplierIds.join(","));
  const row = (await request.query<{ missing: number }>(`
    SELECT COUNT(*) AS missing FROM STRING_SPLIT(@ids, ',') s
    WHERE NOT EXISTS (SELECT 1 FROM dbo.suppliers p WHERE p.id = CONVERT(bigint, s.value) AND p.is_active = 1 AND p.deleted_at IS NULL);
  `)).recordset[0]!;
  if (Number(row.missing) > 0) throw validation("A supplier on one of the lines is inactive or does not exist.");
}

async function replaceLines(transaction: TransactionType, templateId: number, lines: TemplateLineInput[]): Promise<void> {
  const clear = new sql.Request(transaction);
  clear.input("template_id", sql.BigInt, templateId);
  await clear.query("UPDATE dbo.module_template_lines SET deleted_at = SYSUTCDATETIME() WHERE template_id = @template_id AND deleted_at IS NULL;");
  for (const [index, line] of lines.entries()) {
    const insert = new sql.Request(transaction);
    insert.input("template_id", sql.BigInt, templateId);
    insert.input("sort_order", sql.Int, index);
    insert.input("category_code", sql.Char(2), line.categoryCode);
    insert.input("subcategory", sql.NVarChar(100), line.subcategory);
    insert.input("item_code", sql.NVarChar(100), line.itemCode);
    insert.input("description", sql.NVarChar(500), line.description);
    insert.input("brand", sql.NVarChar(100), line.brand);
    insert.input("model", sql.NVarChar(200), line.model);
    insert.input("specification", sql.NVarChar(sql.MAX), line.specification);
    insert.input("supplier_id", sql.BigInt, line.supplierId);
    insert.input("qty_per_module", sql.Decimal(19, 4), line.quantityPerModule);
    insert.input("unit", sql.NVarChar(50), line.unit);
    insert.input("ref_unit_cost", sql.Decimal(19, 4), line.referenceUnitCost);
    insert.input("ref_price_source", sql.NVarChar(100), line.referencePriceSource);
    insert.input("ref_price_date", sql.Date, line.referencePriceDate);
    insert.input("remark", sql.NVarChar(sql.MAX), line.remark);
    await insert.query(`INSERT INTO dbo.module_template_lines(template_id,sort_order,category_code,subcategory,item_code,description,
      brand,model,specification,supplier_id,qty_per_module,unit,ref_unit_cost,ref_price_source,ref_price_date,remark)
      VALUES(@template_id,@sort_order,@category_code,@subcategory,@item_code,@description,@brand,@model,@specification,
      @supplier_id,@qty_per_module,@unit,@ref_unit_cost,@ref_price_source,@ref_price_date,@remark);`);
  }
}

type TemplateRow = {
  id: number | string; code: string; name: string; category_code: string; project_type: string;
  description: string; status: string; revision: number; created_by_name: string; updated_by_name: string;
  created_at: Date | string; updated_at: Date | string; row_version: Buffer;
  line_count: number; reference_total: number | string; oldest_price_date: Date | string | null;
  usage_count: number; total_count?: number | string;
};

function dateOnlyText(value: Date | string | null): string | null {
  if (value === null) return null;
  return typeof value === "string" ? value.slice(0, 10) : value.toISOString().slice(0, 10);
}

function mapTemplate(row: TemplateRow) {
  return {
    id: Number(row.id), code: row.code, name: row.name,
    categoryCode: row.category_code, category: categoryNames[row.category_code] ?? row.category_code,
    projectType: row.project_type, description: row.description, status: row.status, revision: row.revision,
    createdByName: row.created_by_name, updatedByName: row.updated_by_name,
    createdAt: row.created_at, updatedAt: row.updated_at,
    lineCount: Number(row.line_count), referenceTotal: Number(row.reference_total),
    oldestPriceDate: dateOnlyText(row.oldest_price_date), usageCount: Number(row.usage_count),
    rowVersion: row.row_version.toString("base64"),
  };
}

/* Reference totals, the oldest price on the template and how many estimates already
   used it are all derived. Nothing here is stored twice. */
const templateProjection = `
  SELECT t.id, t.code, t.name, t.category_code, t.project_type, t.description, t.status, t.revision,
         creator.name AS created_by_name, editor.name AS updated_by_name,
         t.created_at, t.updated_at, t.row_version,
         (SELECT COUNT(*) FROM dbo.module_template_lines l WHERE l.template_id = t.id AND l.deleted_at IS NULL) AS line_count,
         (SELECT COALESCE(SUM(l.qty_per_module * l.ref_unit_cost), 0) FROM dbo.module_template_lines l
            WHERE l.template_id = t.id AND l.deleted_at IS NULL) AS reference_total,
         (SELECT MIN(l.ref_price_date) FROM dbo.module_template_lines l
            WHERE l.template_id = t.id AND l.deleted_at IS NULL) AS oldest_price_date,
         (SELECT COUNT(DISTINCT c.estimate_id) FROM dbo.cost_items c
            WHERE c.deleted_at IS NULL AND c.price_source = N'Master Template' AND c.reference_no LIKE t.code + N'%') AS usage_count
  FROM dbo.module_templates t
  INNER JOIN dbo.users creator ON creator.id = t.created_by
  INNER JOIN dbo.users editor ON editor.id = t.updated_by`;

export function registerModuleTemplateRoutes(app: FastifyInstance, database: Database, users: CurrentUserService): void {
  app.get("/api/v1/module-templates", async (request) => {
    await users.demandPermission(request, "estimate.read");
    const query = request.query as Record<string, unknown>;
    const search = optionalText(query.search, 200, "Search") ?? "";
    const discipline = optionalText(query.categoryCode, 2, "Discipline") ?? "";
    const status = optionalText(query.status, 20, "Status") ?? "";
    if (status && !templateStatuses.includes(status)) throw validation("Status is not allowed.");
    const page = clampedInteger(query.page, 1, 1, Number.MAX_SAFE_INTEGER);
    const pageSize = clampedInteger(query.pageSize, 50, 1, 200);
    const filter = `WHERE (@status = N'' OR t.status = @status)
        AND (@discipline = N'' OR t.category_code = @discipline)
        AND (@search = N'' OR t.code LIKE N'%' + @search + N'%' OR t.name LIKE N'%' + @search + N'%'
             OR t.description LIKE N'%' + @search + N'%' OR t.project_type LIKE N'%' + @search + N'%'
             OR EXISTS (SELECT 1 FROM dbo.module_template_lines l WHERE l.template_id = t.id AND l.deleted_at IS NULL
                        AND (l.item_code LIKE N'%' + @search + N'%' OR l.description LIKE N'%' + @search + N'%'
                             OR l.brand LIKE N'%' + @search + N'%' OR l.model LIKE N'%' + @search + N'%')))`;
    const result = await database.query<TemplateRow>(`
      ${templateProjection}
      ${filter}
      ORDER BY CASE t.status WHEN N'Active' THEN 0 WHEN N'Draft' THEN 1 ELSE 2 END, t.category_code, t.code
      OFFSET @offset ROWS FETCH NEXT @page_size ROWS ONLY;
    `, (sqlRequest) => {
      sqlRequest.input("search", sql.NVarChar(200), search);
      sqlRequest.input("discipline", sql.NVarChar(2), discipline);
      sqlRequest.input("status", sql.NVarChar(20), status);
      sqlRequest.input("offset", sql.Int, (page - 1) * pageSize);
      sqlRequest.input("page_size", sql.Int, pageSize);
    });
    const totalResult = await database.query<{ total: number }>(`
      SELECT COUNT(*) AS total FROM dbo.module_templates t
      ${filter};
    `, (sqlRequest) => {
      sqlRequest.input("search", sql.NVarChar(200), search);
      sqlRequest.input("discipline", sql.NVarChar(2), discipline);
      sqlRequest.input("status", sql.NVarChar(20), status);
    });
    return {
      items: result.recordset.map(mapTemplate),
      page,
      pageSize,
      total: Number(totalResult.recordset[0]?.total ?? 0),
    };
  });

  app.get("/api/v1/module-templates/:id", async (request) => {
    await users.demandPermission(request, "estimate.read");
    const id = positiveLong((request.params as { id?: string }).id, "Template id");
    const header = await database.query<TemplateRow>(`${templateProjection} WHERE t.id = @id;`, (sqlRequest) => {
      sqlRequest.input("id", sql.BigInt, id);
    });
    const row = header.recordset[0];
    if (!row) throw new ApiError(404, "module_template_not_found", "Module template not found.");
    const lines = await database.query<{
      id: number | string; sort_order: number; category_code: string; subcategory: string; item_code: string;
      description: string; brand: string; model: string; specification: string | null;
      supplier_id: number | string | null; supplier_name: string | null; qty_per_module: number | string;
      unit: string; ref_unit_cost: number | string; ref_price_source: string; ref_price_date: Date | string | null;
      remark: string | null;
    }>(`
      SELECT l.id, l.sort_order, l.category_code, l.subcategory, l.item_code, l.description, l.brand, l.model,
             l.specification, l.supplier_id, s.name AS supplier_name, l.qty_per_module, l.unit,
             l.ref_unit_cost, l.ref_price_source, l.ref_price_date, l.remark
      FROM dbo.module_template_lines l
      LEFT JOIN dbo.suppliers s ON s.id = l.supplier_id
      WHERE l.template_id = @id AND l.deleted_at IS NULL
      ORDER BY l.sort_order, l.id;
    `, (sqlRequest) => { sqlRequest.input("id", sql.BigInt, id); });
    return {
      ...mapTemplate(row),
      lines: lines.recordset.map((line) => ({
        id: Number(line.id), sortOrder: line.sort_order, categoryCode: line.category_code,
        category: categoryNames[line.category_code] ?? line.category_code, subcategory: line.subcategory,
        itemCode: line.item_code, description: line.description, brand: line.brand, model: line.model,
        specification: line.specification,
        supplierId: line.supplier_id === null ? null : Number(line.supplier_id),
        supplierName: line.supplier_name,
        quantityPerModule: Number(line.qty_per_module), unit: line.unit,
        referenceUnitCost: Number(line.ref_unit_cost), referencePriceSource: line.ref_price_source,
        referencePriceDate: dateOnlyText(line.ref_price_date), remark: line.remark,
      })),
    };
  });

  app.post("/api/v1/module-templates", async (request, reply) => {
    await users.demandPermission(request, "estimate.write");
    const actor = await users.required(request);
    const input = parseTemplate(request);
    if (input.status === "Active") await users.demandPermission(request, "master.write");
    const created = await database.transaction(async (transaction) => {
      await assertSuppliersUsable(transaction, input.lines);
      const insert = new sql.Request(transaction);
      insert.input("code", sql.NVarChar(40), input.code);
      insert.input("name", sql.NVarChar(200), input.name);
      insert.input("category_code", sql.Char(2), input.categoryCode);
      insert.input("project_type", sql.NVarChar(50), input.projectType);
      insert.input("description", sql.NVarChar(1000), input.description);
      insert.input("status", sql.NVarChar(20), input.status);
      insert.input("actor", sql.BigInt, actor.id);
      const row = (await insert.query<{ id: number | string }>(`
        IF EXISTS (SELECT 1 FROM dbo.module_templates WHERE code = @code)
          THROW 51300, 'A module template with this code already exists.', 1;
        INSERT INTO dbo.module_templates(code,name,category_code,project_type,description,status,created_by,updated_by)
        OUTPUT inserted.id VALUES(@code,@name,@category_code,@project_type,@description,@status,@actor,@actor);
      `)).recordset[0]!;
      const templateId = Number(row.id);
      await replaceLines(transaction, templateId, input.lines);
      await insertAudit(transaction, actor.id, "ModuleTemplate", templateId, input.code, "Created", null, {
        name: input.name, categoryCode: input.categoryCode, status: input.status, lines: input.lines.length,
      });
      return { id: templateId, code: input.code };
    });
    return reply.status(201).header("Location", `/api/v1/module-templates/${created.id}`).send(created);
  });

  app.put("/api/v1/module-templates/:id", async (request) => {
    await users.demandPermission(request, "estimate.write");
    const actor = await users.required(request);
    const id = positiveLong((request.params as { id?: string }).id, "Template id");
    const expected = parseRowVersion(bodyObject(request.body).rowVersion);
    const input = parseTemplate(request);
    if (input.status === "Active") await users.demandPermission(request, "master.write");
    return database.transaction(async (transaction) => {
      const lock = new sql.Request(transaction);
      lock.input("id", sql.BigInt, id);
      const current = (await lock.query<{ code: string; name: string; status: string; revision: number; row_version: Buffer }>(`
        SELECT code,name,status,revision,row_version FROM dbo.module_templates WITH (UPDLOCK,HOLDLOCK) WHERE id=@id;
      `)).recordset[0];
      if (!current) throw new ApiError(404, "module_template_not_found", "Module template not found.");
      if (!current.row_version.equals(expected)) {
        throw new ApiError(409, "concurrency_conflict", "This template changed. Reload and try again.");
      }
      if (current.status === "Retired") throw new ApiError(409, "module_template_retired", "A retired template cannot be edited.");
      if (current.status === "Active") throw new ApiError(409, "published_template_locked", "Published templates cannot be overwritten. Copy this template to a new draft, then publish it.");
      await assertSuppliersUsable(transaction, input.lines);
      const update = new sql.Request(transaction);
      update.input("id", sql.BigInt, id);
      update.input("code", sql.NVarChar(40), input.code);
      update.input("name", sql.NVarChar(200), input.name);
      update.input("category_code", sql.Char(2), input.categoryCode);
      update.input("project_type", sql.NVarChar(50), input.projectType);
      update.input("description", sql.NVarChar(1000), input.description);
      update.input("status", sql.NVarChar(20), input.status);
      update.input("actor", sql.BigInt, actor.id);
      const updated = (await update.query<{ row_version: Buffer; revision: number }>(`
        IF EXISTS (SELECT 1 FROM dbo.module_templates WHERE code = @code AND id <> @id)
          THROW 51300, 'A module template with this code already exists.', 1;
        UPDATE dbo.module_templates SET code=@code,name=@name,category_code=@category_code,project_type=@project_type,
          description=@description,status=@status,revision=revision+1,updated_by=@actor,updated_at=SYSUTCDATETIME()
        OUTPUT inserted.row_version, inserted.revision WHERE id=@id;
      `)).recordset[0]!;
      await replaceLines(transaction, id, input.lines);
      await insertAudit(transaction, actor.id, "ModuleTemplate", id, input.code, "Updated",
        { name: current.name, status: current.status, revision: current.revision },
        { name: input.name, status: input.status, revision: updated.revision, lines: input.lines.length });
      return { id, revision: updated.revision, rowVersion: updated.row_version.toString("base64") };
    });
  });

  /* Retiring takes a template out of everyone's library, so it is a master-data act
     even though any engineer may create one. */
  app.post("/api/v1/module-templates/:id/retire", async (request) => {
    await users.demandPermission(request, "master.write");
    const actor = await users.required(request);
    const id = positiveLong((request.params as { id?: string }).id, "Template id");
    const expected = parseRowVersion(bodyObject(request.body).rowVersion);
    return database.transaction(async (transaction) => {
      const lock = new sql.Request(transaction);
      lock.input("id", sql.BigInt, id);
      const current = (await lock.query<{ code: string; status: string; row_version: Buffer }>(`
        SELECT code,status,row_version FROM dbo.module_templates WITH (UPDLOCK,HOLDLOCK) WHERE id=@id;
      `)).recordset[0];
      if (!current) throw new ApiError(404, "module_template_not_found", "Module template not found.");
      if (!current.row_version.equals(expected)) {
        throw new ApiError(409, "concurrency_conflict", "This template changed. Reload and try again.");
      }
      if (current.status === "Retired") return { id, status: "Retired" };
      const update = new sql.Request(transaction);
      update.input("id", sql.BigInt, id);
      update.input("actor", sql.BigInt, actor.id);
      await update.query(`UPDATE dbo.module_templates SET status=N'Retired',retired_at=SYSUTCDATETIME(),
        updated_by=@actor,updated_at=SYSUTCDATETIME() WHERE id=@id;`);
      await insertAudit(transaction, actor.id, "ModuleTemplate", id, current.code, "Retired",
        { status: current.status }, { status: "Retired" });
      return { id, status: "Retired" };
    });
  });

  /* The library fills itself: an engineer who has already built a good module in a
     real estimate lifts it into the library instead of typing it a second time. */
  app.post("/api/v1/module-templates/from-estimate", async (request, reply) => {
    await users.demandPermission(request, "estimate.write");
    const actor = await users.required(request);
    const body = bodyObject(request.body);
    const estimateId = requiredInteger(body.estimateId, "Estimate id", 1);
    const moduleName = requiredText(body.module, 200, "Module");
    const discipline = categoryCode(body.categoryCode, "Discipline");
    const code = templateCode(body.code);
    const name = requiredText(body.name, 200, "Template name");
    const description = optionalBodyText(body.description, 1000, "Description") ?? "";
    const projectType = optionalBodyText(body.projectType, 50, "Project type") ?? "";
    const created = await database.transaction(async (transaction) => {
      const read = new sql.Request(transaction);
      read.input("estimate_id", sql.BigInt, estimateId);
      read.input("module", sql.NVarChar(200), moduleName);
      read.input("category_code", sql.Char(2), discipline);
      const source = (await read.query<{
        category_code: string; subcategory: string; item_code: string; description: string; brand: string;
        model: string; specification: string | null; supplier_id: number | string | null; qty: number | string;
        unit: string; unit_cost: number | string; price_source: string; price_date: Date | string | null; remark: string | null;
      }>(`
        SELECT c.category_code, c.subcategory, c.item_code, c.description, c.brand, c.model, c.specification,
               c.supplier_id, c.qty, c.unit, c.unit_cost, c.price_source, c.price_date, c.remark
        FROM dbo.cost_items c
        INNER JOIN dbo.estimates e ON e.id = c.estimate_id AND e.revision = c.revision AND e.deleted_at IS NULL
        WHERE c.estimate_id = @estimate_id AND c.module = @module AND c.category_code = @category_code AND c.deleted_at IS NULL
        ORDER BY c.id;
      `)).recordset;
      if (!source.length) throw new ApiError(404, "module_not_found", "That module has no cost lines in the current revision.");
      if (source.length > MAXIMUM_LINES) throw validation(`A template cannot hold more than ${MAXIMUM_LINES} lines.`);
      const lines: TemplateLineInput[] = source.map((line) => ({
        categoryCode: line.category_code, subcategory: line.subcategory, itemCode: line.item_code,
        description: line.description, brand: line.brand, model: line.model, specification: line.specification,
        supplierId: line.supplier_id === null ? null : Number(line.supplier_id),
        quantityPerModule: Number(line.qty), unit: line.unit,
        referenceUnitCost: Number(line.unit_cost), referencePriceSource: line.price_source,
        referencePriceDate: dateOnlyText(line.price_date), remark: line.remark,
      }));
      const insert = new sql.Request(transaction);
      insert.input("code", sql.NVarChar(40), code);
      insert.input("name", sql.NVarChar(200), name);
      insert.input("category_code", sql.Char(2), discipline);
      insert.input("project_type", sql.NVarChar(50), projectType);
      insert.input("description", sql.NVarChar(1000), description);
      insert.input("actor", sql.BigInt, actor.id);
      const row = (await insert.query<{ id: number | string }>(`
        IF EXISTS (SELECT 1 FROM dbo.module_templates WHERE code = @code)
          THROW 51300, 'A module template with this code already exists.', 1;
        INSERT INTO dbo.module_templates(code,name,category_code,project_type,description,status,created_by,updated_by)
        OUTPUT inserted.id VALUES(@code,@name,@category_code,@project_type,@description,N'Draft',@actor,@actor);
      `)).recordset[0]!;
      const templateId = Number(row.id);
      await replaceLines(transaction, templateId, lines);
      await insertAudit(transaction, actor.id, "ModuleTemplate", templateId, code, "Created from estimate", null, {
        estimateId, module: moduleName, lines: lines.length,
      });
      return { id: templateId, code, lineCount: lines.length };
    });
    return reply.status(201).header("Location", `/api/v1/module-templates/${created.id}`).send(created);
  });
}
