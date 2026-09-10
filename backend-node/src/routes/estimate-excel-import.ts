import type { FastifyInstance } from "fastify";
import { createHash } from "node:crypto";
import sql from "mssql/msnodesqlv8.js";
import { insertAudit } from "../audit.js";
import { DatabaseCommitOutcomeUnknownError, type Database } from "../db.js";
import type { AppConfig } from "../config.js";
import { readMultipartUpload, multipartText, uploadedFileName, storageKey, writeStoredFile, deleteStoredFile, sendStoredFile } from "../document-storage.js";
import type { CurrentUserService } from "../users.js";
import { ApiError } from "../errors.js";
import { bodyObject, requiredText, optionalBodyText, positiveLong, parseRowVersion, parseDateOnly } from "../http.js";

const categories: Record<string, string> = { "01": "Hardware", "02": "Software", "03": "Electrical", "04": "Mechanical", "05": "Robot", "06": "Engineering", "07": "Outsource", "08": "Transportation", "09": "Accommodation", "10": "Other Cost" };
function decimal(v: unknown, minimum: number, maximum: number, scale = 4): number {
  if (typeof v !== "number" || !Number.isFinite(v) || v < minimum || v > maximum || Math.abs(v * 10 ** scale - Math.round(v * 10 ** scale)) > .001) throw new ApiError(400, "invalid_import_number", "Invalid quantity, rate or total in import.");
  return v;
}
export function parseExcelImport(body: Record<string, unknown>) {
  const sourceName = requiredText(body.sourceName, 500, "Source file");
  const sourceTotal = decimal(body.sourceTotal, 0, 999999999999, 2);
  const hoursPerDay = decimal(body.hoursPerDay, .01, 24, 2);
  const sourceDate = parseDateOnly(body.sourceDate, "Source date", false)!;
  if (!Array.isArray(body.lines) || !body.lines.length || body.lines.length > 1000) throw new ApiError(400, "invalid_import_lines", "Import requires 1–1000 rows.");
  const keys = new Set<string>();
  const lines = body.lines.map((raw) => {
    const row = bodyObject(raw); const kind = requiredText(row.kind, 20, "Line kind");
    if (!["cost", "manhour", "reference"].includes(kind)) throw new ApiError(400, "invalid_import_kind", "Invalid import kind.");
    const categoryCode = requiredText(row.categoryCode, 2, "Category");
    if (!categories[categoryCode]) throw new ApiError(400, "invalid_category", "Invalid category.");
    const itemCode = requiredText(row.itemCode, 100, "Item code");
    const module = requiredText(row.module, 200, "Module");
    const key = `${module.toLowerCase()}|${itemCode.toLowerCase()}`;
    if (keys.has(key)) throw new ApiError(400, "duplicate_import_line", "Duplicate item in the same module."); keys.add(key);
    const quantity = decimal(row.quantity, .0001, kind === "manhour" ? 999999 : 1000000000, kind === "manhour" ? 2 : 4);
    const unitCost = decimal(row.unitCost, kind === "reference" ? 0 : .0001, 1000000000);
    if (kind === "reference" && unitCost !== 0) throw new ApiError(400, "invalid_reference_cost", "Customer supplied reference must have zero cost.");
    const supplierId = row.supplierId == null ? null : positiveLong(String(row.supplierId), "Supplier");
    const costType = row.costType === "Installation" ? "Installation" : "Engineering";
    return { kind, categoryCode, itemCode, module, quantity, unitCost, supplierId, costType,
      description: requiredText(row.description, kind === "manhour" ? 300 : 500, "Description"),
      unit: requiredText(row.unit, 50, "Unit"), source: requiredText(row.source, 300, "Source cell"),
      department: optionalBodyText(row.department, 100, "Department") ?? "Imported",
      brand: optionalBodyText(row.brand, 100, "Brand") ?? "", model: optionalBodyText(row.model, 200, "Model") ?? "",
      supplierName: optionalBodyText(row.supplierName, 200, "Supplier name") ?? "", remark: optionalBodyText(row.remark, 10000, "Remark") ?? "" };
  });
  const total = lines.reduce((sum, l) => sum + l.quantity * l.unitCost, 0);
  if (Math.abs(total - sourceTotal) > .011) throw new ApiError(400, "import_total_mismatch", "Import total does not match source total.");
  const sourceHash = createHash("sha256").update(JSON.stringify({ sourceDate, sourceTotal, hoursPerDay, lines })).digest("hex");
  return { sourceName, sourceHash, sourceDate, sourceTotal, hoursPerDay, lines,
    sourceRevision: optionalBodyText(body.sourceRevision, 50, "Source revision") ?? "" };
}

export function registerEstimateExcelImportRoutes(app: FastifyInstance, database: Database, users: CurrentUserService, config?: AppConfig) {
  const publicReceipt = (receipt: Record<string, unknown>) => {
    const { sourceFile, ...rest } = receipt;
    const file = sourceFile as { sizeBytes: number; sha256: string } | undefined;
    return { ...rest, originalAvailable: Boolean(file), originalSizeBytes: file?.sizeBytes, originalSha256: file?.sha256 };
  };
  app.get("/api/v1/estimates/:id/excel-imports", async request => {
    await users.demandPermission(request, "estimate.read");
    const id = positiveLong((request.params as { id: string }).id, "Estimate");
    const result = await database.query<{ after_json: string }>(`SELECT TOP(20) after_json FROM dbo.audit_log WHERE entity_type=N'Estimate' AND entity_id=@id AND action=N'Excel imported' ORDER BY id DESC;`, r => r.input("id", sql.BigInt, id));
    return result.recordset.map(r => publicReceipt(JSON.parse(r.after_json)));
  });
  app.get("/api/v1/estimates/:id/excel-imports/:revision/:hash/content", async (request, reply) => {
    await users.demandPermission(request, "estimate.read");
    if (!config) throw new ApiError(503, "storage_unavailable", "Document storage is unavailable.");
    const params = request.params as { id: string; revision: string; hash: string };
    const id = positiveLong(params.id, "Estimate");
    if (!/^\d{1,8}$/.test(params.revision) || !/^[a-f0-9]{64}$/.test(params.hash)) throw new ApiError(400, "invalid_reference", "Invalid original file reference.");
    const result = await database.query<{ after_json: string }>(`SELECT TOP(1) a.after_json FROM dbo.audit_log a JOIN dbo.estimates e ON e.id=a.entity_id AND e.deleted_at IS NULL WHERE a.entity_type=N'Estimate' AND a.entity_id=@id AND a.action=N'Excel imported' AND JSON_VALUE(a.after_json,'$.sourceHash')=@hash AND TRY_CONVERT(int,JSON_VALUE(a.after_json,'$.revision'))=@revision ORDER BY a.id DESC;`, r => { r.input("id", sql.BigInt, id); r.input("hash", sql.NVarChar(64), params.hash); r.input("revision", sql.Int, Number(params.revision)); });
    const receipt = result.recordset[0] ? JSON.parse(result.recordset[0].after_json) : null;
    if (!receipt?.sourceFile) throw new ApiError(404, "original_not_stored", "This historical import has no stored original file.");
    return sendStoredFile(request, reply, config.documentStorage, { ...receipt.sourceFile, fileName: receipt.sourceName, contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  });
  app.post("/api/v1/estimates/:id/excel-import", async (request, reply) => {
    await users.demandPermission(request, "estimate.write"); const actor = await users.required(request);
    const id = positiveLong((request.params as { id: string }).id, "Estimate");
    const upload = request.isMultipart() && config ? await readMultipartUpload(request, config.documentStorage.maxFileSizeBytes) : null;
    let body: Record<string, unknown>;
    try { body = upload ? bodyObject(JSON.parse(multipartText(upload.values, "payload", 1_048_576, true)!)) : bodyObject(request.body); }
    catch { throw new ApiError(400, "invalid_import_payload", "Invalid Excel import payload."); }
    const input = parseExcelImport(body); const version = parseRowVersion(body.estimateRowVersion);
    if (upload && (uploadedFileName(upload.file.filename) !== input.sourceName || !/\.xlsx$/i.test(input.sourceName))) throw new ApiError(400, "invalid_original_file", "The original workbook name must match the preview.");
    let writtenKey: string | undefined;
    let sourceFile: { storageKey: string; sizeBytes: number; sha256: string } | undefined;
    if (upload && config) {
      const preflight = (await database.query<{ owner_id: number; revision: number; status: string }>("SELECT owner_id,revision,status FROM dbo.estimates WHERE id=@id AND deleted_at IS NULL;", r => r.input("id", sql.BigInt, id))).recordset[0];
      if (!preflight) throw new ApiError(404, "estimate_not_found", "Estimate not found.");
      if (Number(preflight.owner_id) !== actor.id && !["Admin", "Engineering Manager"].includes(actor.role)) throw new ApiError(403, "import_forbidden", "Only the estimate owner or engineering manager can import a complete workbook.");
      writtenKey = storageKey(`estimates/${id}/R${preflight.revision}/originals`, ".xlsx");
      const stored = await writeStoredFile(config.documentStorage, writtenKey, upload.file.filepath);
      sourceFile = { storageKey: writtenKey, ...stored };
    }
    let result;
    try { result = await database.transaction(async transaction => {
      const query = () => new sql.Request(transaction);
      const lock = query(); lock.input("id", sql.BigInt, id);
      const e = (await lock.query<{ estimate_no: string; owner_id: number; revision: number; status: string; row_version: Buffer; due_date: Date }>(`SELECT estimate_no,owner_id,revision,status,row_version,due_date FROM dbo.estimates WITH(UPDLOCK,HOLDLOCK) WHERE id=@id AND deleted_at IS NULL;`)).recordset[0];
      if (!e) throw new ApiError(404, "estimate_not_found", "Estimate not found.");
      if (Number(e.owner_id) !== actor.id && !["Admin", "Engineering Manager"].includes(actor.role)) throw new ApiError(403, "import_forbidden", "Only the estimate owner or engineering manager can import a complete workbook.");
      const old = query(); old.input("id", sql.BigInt, id); old.input("revision", sql.Int, e.revision); old.input("hash", sql.NVarChar(64), input.sourceHash);
      const imported = (await old.query<{ after_json: string }>(`SELECT TOP(1) after_json FROM dbo.audit_log WHERE entity_type=N'Estimate' AND entity_id=@id AND action=N'Excel imported' AND JSON_VALUE(after_json,'$.sourceHash')=@hash AND TRY_CONVERT(int,JSON_VALUE(after_json,'$.revision'))=@revision;`)).recordset[0];
      if (imported) return { ...JSON.parse(imported.after_json), alreadyImported: true };
      if (!e.row_version.equals(version)) throw new ApiError(409, "concurrency_conflict", "Estimate changed. Refresh the preview and retry.");
      if (!["Draft", "Engineering Input", "Revision Required"].includes(e.status)) throw new ApiError(409, "estimate_locked", "Create a revision before importing into a locked estimate.");
      if (!(await query().query(`SELECT version FROM dbo.schema_versions WHERE version=32;`)).recordset.length) throw new ApiError(503, "import_not_ready", "Excel import database update is not installed yet.");
      const owner = query(); owner.input("owner", sql.BigInt, e.owner_id);
      if (!(await owner.query(`SELECT u.id FROM dbo.users u JOIN dbo.roles r ON r.id=u.role_id WHERE u.id=@owner AND u.is_active=1 AND u.deleted_at IS NULL AND r.code IN(N'Engineer',N'Engineering Manager',N'Admin');`)).recordset.length) throw new ApiError(400, "invalid_owner", "Estimate owner must be an active engineer or manager.");
      const created: { kind: string; id: number; source: string }[] = [];
      for (const l of input.lines) {
        if (l.kind === "reference") continue;
        const cmd = query(); cmd.input("estimate", sql.BigInt, id); cmd.input("revision", sql.Int, e.revision);
        cmd.input("actor", sql.BigInt, actor.id); cmd.input("owner", sql.BigInt, e.owner_id);
        cmd.input("module", sql.NVarChar(200), l.module); cmd.input("code", sql.NVarChar(100), l.itemCode);
        cmd.input("description", sql.NVarChar(500), l.description); cmd.input("qty", sql.Decimal(19, 4), l.quantity);
        cmd.input("unit", sql.NVarChar(50), l.unit); cmd.input("rate", sql.Decimal(19, 4), l.unitCost);
        cmd.input("date", sql.Date, input.sourceDate); cmd.input("supplier", sql.BigInt, l.supplierId);
        const provenance = `Excel: ${input.sourceName}; ${l.source}; source revision ${input.sourceRevision}; original supplier: ${l.supplierName || "not stated"}; ${l.remark}`;
        cmd.input("remark", sql.NVarChar(sql.MAX), provenance);
        cmd.input("category", sql.NVarChar(100), categories[l.categoryCode]); cmd.input("category_code", sql.Char(2), l.categoryCode);
        cmd.input("brand", sql.NVarChar(100), l.brand); cmd.input("model", sql.NVarChar(200), l.model);
        cmd.input("reference", sql.NVarChar(200), input.sourceName.slice(0, 200));
        cmd.input("hours", sql.Decimal(9, 2), input.hoursPerDay); cmd.input("department", sql.NVarChar(100), l.department); cmd.input("cost_type", sql.NVarChar(30), l.costType);
        const valid = (await cmd.query(`SELECT CASE WHEN @supplier IS NULL OR EXISTS(SELECT 1 FROM dbo.suppliers WHERE id=@supplier AND is_active=1 AND deleted_at IS NULL) THEN 1 ELSE 0 END valid;`)).recordset[0].valid;
        if (!valid) throw new ApiError(400, "invalid_supplier", "Selected supplier is no longer active.");
        const duplicates = (await cmd.query(`SELECT id FROM dbo.cost_items WHERE estimate_id=@estimate AND revision=@revision AND deleted_at IS NULL AND (item_code=@code OR (module=@module AND description=@description AND model=@model AND brand=@brand));`)).recordset;
        if (duplicates.length) throw new ApiError(409, "duplicate_import_line", `Existing item: ${l.itemCode}. Import into an empty revision or remove duplicates first.`);
        let row;
        if (l.kind === "manhour") {
          if ((await cmd.query(`SELECT id FROM dbo.manhour_lines WHERE estimate_id=@estimate AND revision=@revision AND deleted_at IS NULL AND package=@module AND activity=@description;`)).recordset.length) throw new ApiError(409, "duplicate_import_line", `Existing activity: ${l.description}.`);
          row = (await cmd.query(`DECLARE @created TABLE(id bigint); INSERT dbo.manhour_lines(estimate_id,revision,package,activity,department,level,cost_type,provider,price_date,engineers,man_days,hours_per_day,daily_rate,owner_id,remark,created_by,updated_by) OUTPUT inserted.id INTO @created VALUES(@estimate,@revision,@module,@description,@department,N'Imported Excel rate',@cost_type,N'Internal',@date,1,@qty,@hours,@rate,@owner,@remark,@actor,@actor); SELECT id FROM @created;`)).recordset[0];
        } else row = (await cmd.query(`DECLARE @created TABLE(id bigint); INSERT dbo.cost_items(estimate_id,revision,category_code,category,subcategory,module,item_code,description,brand,model,supplier_id,qty,unit,unit_cost,price_source,reference_no,reference_project,price_date,remark,owner_id,status,created_by,updated_by) OUTPUT inserted.id INTO @created VALUES(@estimate,@revision,@category_code,@category,N'',@module,@code,@description,@brand,@model,@supplier,@qty,@unit,@rate,N'Previous Estimate',@reference,N'Excel import',@date,@remark,@owner,N'Active',@actor,@actor); SELECT id FROM @created;`)).recordset[0];
        created.push({ kind: l.kind, id: Number(row.id), source: l.source });
        await insertAudit(transaction, actor.id, l.kind === "manhour" ? "ManhourLine" : "CostItem", Number(row.id), e.estimate_no, "Created", null, { ...l, sourceDate: input.sourceDate, sourceFile: input.sourceName, sourceHash: input.sourceHash });
      }
      for (const section of new Set(input.lines.filter(l => l.kind !== "reference").map(l => l.kind === "manhour" ? "06" : l.categoryCode))) {
        const a = query(); a.input("id", sql.BigInt, id); a.input("section", sql.NVarChar(100), section); a.input("owner", sql.BigInt, e.owner_id); a.input("due", sql.Date, e.due_date);
        await a.query(`IF NOT EXISTS(SELECT 1 FROM dbo.estimate_assignments WHERE estimate_id=@id AND section=@section) INSERT dbo.estimate_assignments(estimate_id,section,owner_id,due_date,status,progress) VALUES(@id,@section,@owner,@due,N'In Progress',0);`);
      }
      const update = query(); update.input("id", sql.BigInt, id); update.input("actor", sql.BigInt, actor.id);
      await update.query(`UPDATE dbo.estimates SET updated_by=@actor,updated_at=SYSUTCDATETIME(),progress=CASE WHEN progress<10 THEN 10 ELSE progress END WHERE id=@id;`);
      const after = { sourceName: input.sourceName, sourceHash: input.sourceHash, sourceRevision: input.sourceRevision, sourceDate: input.sourceDate, revision: e.revision, sourceTotal: input.sourceTotal, importedAt: new Date().toISOString(), hoursPerDay: input.hoursPerDay, sourceFile, created, references: input.lines.filter(l => l.kind === "reference") };
      await insertAudit(transaction, actor.id, "Estimate", id, e.estimate_no, "Excel imported", null, after);
      return { ...after, alreadyImported: false };
    }); } catch (error) {
      if (writtenKey && config && !(error instanceof DatabaseCommitOutcomeUnknownError)) await deleteStoredFile(config.documentStorage, writtenKey);
      throw error;
    }
    if (result.alreadyImported && writtenKey && config) await deleteStoredFile(config.documentStorage, writtenKey);
    return reply.status(result.alreadyImported ? 200 : 201).send(publicReceipt(result));
  });
}
