import sql from "mssql";
import type { FastifyInstance } from "fastify";
import type { AppConfig } from "../config.js";
import { DatabaseCommitOutcomeUnknownError, type Database } from "../db.js";
import {
  contentTypeFor,
  deleteStoredFile,
  DOCUMENT_EXTENSIONS,
  multipartText,
  readMultipartUpload,
  sendStoredFile,
  storageKey,
  SUPPLIER_QUOTATION_EXTENSIONS,
  uploadedFileName,
  validateFileExtension,
  writeStoredFile,
} from "../document-storage.js";
import { issueDocumentNumber } from "../document-number.js";
import { ApiError } from "../errors.js";
import { bodyObject, clampedInteger, dateOnly, optionalPositiveLong, optionalText, parseDateOnly, positiveLong } from "../http.js";
import type { CurrentUserService } from "../users.js";

function todayIn(timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function multipartPositiveId(values: Record<string, unknown>, name: string, optional = false): number | null {
  const value = multipartText(values, name, 30, !optional);
  if (optional && !value) return null;
  if (!value || !/^\d+$/.test(value) || !Number.isSafeInteger(Number(value)) || Number(value) <= 0) {
    throw new ApiError(400, "validation_failed", `${name} is invalid.`);
  }
  return Number(value);
}

function quotation(row: Record<string, unknown> & { row_version: Buffer }) {
  return {
    id: Number(row.id), quotationNumber: row.quotation_no, supplierReference: row.supplier_reference,
    supplierId: Number(row.supplier_id), supplierName: row.supplier_name,
    receivedDate: dateOnly(row.received_date as Date | string), validUntil: dateOnly(row.valid_until as Date | string),
    inquiryId: row.inquiry_id === null ? null : Number(row.inquiry_id), inquiryNumber: row.inquiry_no,
    projectName: row.project_name, currency: row.currency, amount: Number(row.amount), status: row.display_status,
    fileName: row.file_name, contentType: row.content_type, sizeBytes: Number(row.size_bytes),
    uploadedByName: row.uploaded_by_name, uploadedAt: row.uploaded_at, rowVersion: row.row_version.toString("base64"),
  };
}

export function registerSupplierQuotationRoutes(
  app: FastifyInstance,
  config: AppConfig,
  database: Database,
  users: CurrentUserService,
): void {
  app.get("/api/v1/supplier-quotations", async (request) => {
    await users.demandPermission(request, "estimate.read");
    const query = request.query as Record<string, unknown>;
    const search = optionalText(query.search, 200, "Search") ?? "";
    const page = clampedInteger(query.page, 1, 1, Number.MAX_SAFE_INTEGER);
    const pageSize = clampedInteger(query.pageSize, 50, 1, 100);
    const supplierId = optionalPositiveLong(query.supplierId, "Supplier id");
    const status = optionalText(query.status, 30, "Quotation status") ?? "";
    if (status && !["Valid", "Expiring", "Expired", "Superseded"].includes(status)) {
      throw new ApiError(400, "validation_failed", "Quotation status is invalid.");
    }
    const result = await database.query<(Record<string, unknown> & { row_version: Buffer; total_count: number | string })>(`
      WITH quotation_rows AS (
        SELECT q.id,q.quotation_no,q.supplier_reference,q.supplier_id,s.name supplier_name,
               q.received_date,q.valid_until,q.inquiry_id,i.inquiry_no,i.project_name,q.currency,q.amount,
               CASE WHEN q.status=N'Superseded' THEN N'Superseded'
                    WHEN q.valid_until<@today THEN N'Expired'
                    WHEN q.valid_until<=DATEADD(day,30,@today) THEN N'Expiring' ELSE N'Valid' END display_status,
               q.file_name,q.content_type,q.size_bytes,u.name uploaded_by_name,q.uploaded_at,q.row_version
        FROM dbo.supplier_quotations q
        INNER JOIN dbo.suppliers s ON s.id=q.supplier_id
        INNER JOIN dbo.users u ON u.id=q.uploaded_by
        LEFT JOIN dbo.inquiries i ON i.id=q.inquiry_id
      )
      SELECT *,COUNT_BIG(*) OVER() total_count FROM quotation_rows
      WHERE (@supplier IS NULL OR supplier_id=@supplier) AND (@status=N'' OR display_status=@status)
        AND (@search=N'' OR quotation_no LIKE N'%'+@search+N'%' OR supplier_reference LIKE N'%'+@search+N'%'
          OR supplier_name LIKE N'%'+@search+N'%' OR COALESCE(inquiry_no,N'') LIKE N'%'+@search+N'%'
          OR COALESCE(project_name,N'') LIKE N'%'+@search+N'%' OR file_name LIKE N'%'+@search+N'%')
      ORDER BY received_date DESC,id DESC OFFSET @offset ROWS FETCH NEXT @page_size ROWS ONLY;
    `, (bind) => {
      bind.input("today", sql.Date, todayIn(config.businessTimeZone)); bind.input("supplier", sql.BigInt, supplierId);
      bind.input("status", sql.NVarChar(30), status); bind.input("search", sql.NVarChar(200), search);
      bind.input("offset", sql.Int, (page - 1) * pageSize); bind.input("page_size", sql.Int, pageSize);
    });
    return { items: result.recordset.map(quotation), page, pageSize, total: Number(result.recordset[0]?.total_count ?? 0) };
  });

  app.post("/api/v1/supplier-quotations", async (request, reply) => {
    await users.demandPermission(request, "estimate.write");
    const actor = await users.required(request);
    const upload = await readMultipartUpload(request, config.documentStorage.maxFileSizeBytes);
    const values = upload.values as Record<string, unknown>;
    const supplierId = multipartPositiveId(values, "supplierId")!;
    const supplierReference = multipartText(values, "supplierReference", 200) ?? "";
    const receivedDate = parseDateOnly(multipartText(values, "receivedDate", 10, true), "Received date")!;
    const validUntil = parseDateOnly(multipartText(values, "validUntil", 10, true), "Valid until")!;
    if (validUntil < receivedDate) throw new ApiError(400, "validation_failed", "Valid until cannot be before received date.");
    const currency = multipartText(values, "currency", 3, true)!.toUpperCase();
    if (!["THB", "JPY", "USD", "EUR"].includes(currency)) throw new ApiError(400, "validation_failed", "Currency is invalid.");
    const amountValue = multipartText(values, "amount", 30, true)!;
    if (!/^\d+(?:\.\d{1,4})?$/.test(amountValue) || Number(amountValue) <= 0 || Number(amountValue) > 999_999_999_999_999) {
      throw new ApiError(400, "validation_failed", "Amount must be greater than zero with at most four decimal places.");
    }
    const amount = Number(amountValue);
    const inquiryId = multipartPositiveId(values, "inquiryId", true);
    const fileName = uploadedFileName(upload.file.filename);
    const extension = validateFileExtension(fileName, new Set([...SUPPLIER_QUOTATION_EXTENSIONS].filter((value) => DOCUMENT_EXTENSIONS.has(value))));
    const contentType = contentTypeFor(fileName);

    const references = await database.query<{ supplier_name: string }>(`
      SELECT s.name supplier_name FROM dbo.suppliers s
      WHERE s.id=@supplier AND s.is_active=1 AND s.deleted_at IS NULL
        AND (@inquiry IS NULL OR EXISTS(SELECT 1 FROM dbo.inquiries i WHERE i.id=@inquiry AND i.deleted_at IS NULL));
    `, (bind) => { bind.input("supplier", sql.BigInt, supplierId); bind.input("inquiry", sql.BigInt, inquiryId); });
    if (!references.recordset[0]) throw new ApiError(422, "invalid_reference", "Supplier or inquiry was not found.");

    const key = storageKey("supplier-quotations", extension);
    const write = await writeStoredFile(config.documentStorage, key, upload.file.filepath);
    try {
      const created = await database.transaction(async (transaction) => {
        const validate = new sql.Request(transaction);
        validate.input("supplier", sql.BigInt, supplierId); validate.input("inquiry", sql.BigInt, inquiryId);
        const supplier = (await validate.query<{ supplier_name: string }>(`
          SELECT s.name supplier_name FROM dbo.suppliers s WITH (UPDLOCK,HOLDLOCK)
          WHERE s.id=@supplier AND s.is_active=1 AND s.deleted_at IS NULL
            AND (@inquiry IS NULL OR EXISTS(SELECT 1 FROM dbo.inquiries i WHERE i.id=@inquiry AND i.deleted_at IS NULL));
        `)).recordset[0];
        if (!supplier) throw new ApiError(422, "invalid_reference", "Supplier or inquiry was not found.");
        const number = await issueDocumentNumber(transaction, "SQ", receivedDate);
        const insert = new sql.Request(transaction);
        insert.input("number", sql.NVarChar(30), number); insert.input("reference", sql.NVarChar(200), supplierReference);
        insert.input("supplier", sql.BigInt, supplierId); insert.input("received", sql.Date, receivedDate); insert.input("valid", sql.Date, validUntil);
        insert.input("inquiry", sql.BigInt, inquiryId); insert.input("currency", sql.Char(3), currency); insert.input("amount", sql.Decimal(19, 4), amount);
        insert.input("file", sql.NVarChar(500), fileName); insert.input("content_type", sql.NVarChar(200), contentType);
        insert.input("size", sql.BigInt, write.sizeBytes); insert.input("key", sql.NVarChar(1000), key); insert.input("sha", sql.Char(64), write.sha256);
        insert.input("actor", sql.BigInt, actor.id);
        const row = (await insert.query<{ id: number | string; row_version: Buffer }>(`
          INSERT INTO dbo.supplier_quotations(quotation_no,supplier_reference,supplier_id,received_date,valid_until,inquiry_id,currency,amount,file_name,content_type,size_bytes,storage_key,sha256,uploaded_by)
          OUTPUT inserted.id,inserted.row_version VALUES(@number,@reference,@supplier,@received,@valid,@inquiry,@currency,@amount,@file,@content_type,@size,@key,@sha,@actor);
        `)).recordset[0]!;
        const audit = new sql.Request(transaction);
        audit.input("actor", sql.BigInt, actor.id); audit.input("id", sql.BigInt, Number(row.id)); audit.input("number", sql.NVarChar(50), number);
        audit.input("after", sql.NVarChar(sql.MAX), JSON.stringify({ supplierId, supplierName: supplier.supplier_name, amount, currency, fileName }));
        await audit.query(`INSERT INTO dbo.audit_log(actor_id,entity_type,entity_id,entity_no,action,after_json,reason)
          VALUES(@actor,N'SupplierQuotation',@id,@number,N'Uploaded',@after,N'Supplier quotation document uploaded');`);
        return { id: Number(row.id), quotationNumber: number, rowVersion: row.row_version.toString("base64") };
      }, sql.ISOLATION_LEVEL.READ_COMMITTED);
      return reply.status(201).header("Location", `/api/v1/supplier-quotations/${created.id}/content`).send(created);
    } catch (error) {
      if (error instanceof DatabaseCommitOutcomeUnknownError) {
        request.log.fatal({ err: error.originalError, storageKey: key }, "Supplier quotation commit outcome unknown; preserving storage file");
      } else {
        await deleteStoredFile(config.documentStorage, key);
      }
      throw error;
    }
  });

  app.get("/api/v1/supplier-quotations/:id/content", async (request, reply) => {
    await users.demandPermission(request, "estimate.read");
    const id = positiveLong((request.params as { id?: string }).id, "Supplier quotation id");
    const result = await database.query<Record<string, unknown>>(
      `SELECT file_name,content_type,storage_key,size_bytes,sha256 FROM dbo.supplier_quotations WHERE id=@id;`,
      (bind) => bind.input("id", sql.BigInt, id),
    );
    const row = result.recordset[0];
    if (!row) throw new ApiError(404, "quotation_not_found", "Supplier quotation not found.");
    return sendStoredFile(request, reply, config.documentStorage, {
      storageKey: String(row.storage_key), fileName: String(row.file_name), contentType: String(row.content_type),
      sizeBytes: Number(row.size_bytes), sha256: String(row.sha256),
    });
  });

  // ── Quotation line items (extracted from PDF) ───────────────────────────

  type LineInput = {
    lineNo: number; itemCode: string; description: string; brand: string;
    model: string; qty: number; unit: string; unitPrice: number; currency: string; remark: string;
  };

  function parseLines(body: Record<string, unknown>): LineInput[] {
    const raw = body.lines;
    if (!Array.isArray(raw)) throw new ApiError(400, "validation_failed", "lines must be an array.");
    if (raw.length > 200) throw new ApiError(400, "validation_failed", "Maximum 200 line items per quotation.");
    const validCurrencies = new Set(["THB", "JPY", "USD", "EUR"]);
    return raw.map((item: unknown, idx: number) => {
      if (typeof item !== "object" || item === null) throw new ApiError(400, "validation_failed", `Line ${idx + 1} must be an object.`);
      const it = item as Record<string, unknown>;
      const lineNo = Number(it.lineNo);
      if (!Number.isInteger(lineNo) || lineNo < 1) throw new ApiError(400, "validation_failed", `Line ${idx + 1}: lineNo must be a positive integer.`);
      const description = String(it.description ?? "").trim();
      if (!description) throw new ApiError(400, "validation_failed", `Line ${lineNo}: description is required.`);
      const qty = Number(it.qty ?? 1);
      const unitPrice = Number(it.unitPrice ?? 0);
      if (!Number.isFinite(qty) || qty <= 0) throw new ApiError(400, "validation_failed", `Line ${lineNo}: qty must be > 0.`);
      if (!Number.isFinite(unitPrice) || unitPrice < 0) throw new ApiError(400, "validation_failed", `Line ${lineNo}: unitPrice must be >= 0.`);
      const currency = String(it.currency ?? "THB").toUpperCase();
      if (!validCurrencies.has(currency)) throw new ApiError(400, "validation_failed", `Line ${lineNo}: currency must be THB/JPY/USD/EUR.`);
      return {
        lineNo, itemCode: String(it.itemCode ?? "").trim().slice(0, 200),
        description: description.slice(0, 500),
        brand: String(it.brand ?? "").trim().slice(0, 100), model: String(it.model ?? "").trim().slice(0, 200),
        qty, unit: String(it.unit ?? "EA").trim().slice(0, 50) || "EA", unitPrice, currency,
        remark: String(it.remark ?? "").trim().slice(0, 1000),
      };
    });
  }

  async function demandQuotationAccess(request: Parameters<typeof users.required>[0], id: number) {
    await users.demandPermission(request, "estimate.write");
    const check = await database.query<{ id: number }>(
      "SELECT id FROM dbo.supplier_quotations WHERE id=@id;",
      (bind) => bind.input("id", sql.BigInt, id),
    );
    if (!check.recordset[0]) throw new ApiError(404, "quotation_not_found", "Supplier quotation not found.");
  }

  // Replace all line items for a quotation (idempotent — safe to call again after corrections)
  app.put("/api/v1/supplier-quotations/:id/lines", async (request, reply) => {
    const id = positiveLong((request.params as { id?: string }).id, "Supplier quotation id");
    await demandQuotationAccess(request, id);
    const actor = await users.required(request);
    const body = bodyObject(request.body);
    const lines = parseLines(body);

    await database.transaction(async (transaction) => {
      await new sql.Request(transaction).input("id", sql.BigInt, id)
        .query("DELETE FROM dbo.supplier_quotation_lines WHERE quotation_id=@id;");
      for (const line of lines) {
        const ins = new sql.Request(transaction);
        ins.input("qid", sql.BigInt, id); ins.input("no", sql.Int, line.lineNo);
        ins.input("code", sql.NVarChar(200), line.itemCode); ins.input("desc", sql.NVarChar(500), line.description);
        ins.input("brand", sql.NVarChar(100), line.brand); ins.input("model", sql.NVarChar(200), line.model);
        ins.input("qty", sql.Decimal(19, 4), line.qty); ins.input("unit", sql.NVarChar(50), line.unit);
        ins.input("price", sql.Decimal(19, 4), line.unitPrice); ins.input("cur", sql.Char(3), line.currency);
        ins.input("remark", sql.NVarChar(sql.MAX), line.remark); ins.input("actor", sql.BigInt, actor.id);
        await ins.query(`INSERT INTO dbo.supplier_quotation_lines
          (quotation_id,line_no,item_code,description,brand,model,qty,unit,unit_price,currency,remark,created_by)
          VALUES(@qid,@no,@code,@desc,@brand,@model,@qty,@unit,@price,@cur,@remark,@actor);`);
      }
    }, sql.ISOLATION_LEVEL.READ_COMMITTED);

    return reply.status(204).send();
  });

  app.get("/api/v1/supplier-quotations/:id/lines", async (request) => {
    await users.demandPermission(request, "estimate.read");
    const id = positiveLong((request.params as { id?: string }).id, "Supplier quotation id");
    const rows = await database.query<Record<string, unknown>>(
      `SELECT l.id,l.line_no,l.item_code,l.description,l.brand,l.model,l.qty,l.unit,l.unit_price,l.line_total,l.currency,l.remark
       FROM dbo.supplier_quotation_lines l WHERE l.quotation_id=@id ORDER BY l.line_no;`,
      (bind) => bind.input("id", sql.BigInt, id),
    );
    return rows.recordset.map((r) => ({
      id: Number(r.id), lineNo: Number(r.line_no), itemCode: String(r.item_code), description: String(r.description),
      brand: String(r.brand), model: String(r.model), qty: Number(r.qty), unit: String(r.unit),
      unitPrice: Number(r.unit_price), lineTotal: Number(r.line_total), currency: String(r.currency), remark: String(r.remark ?? ""),
    }));
  });

  // All quotation lines for Price Library — joined with supplier + quotation header
  app.get("/api/v1/supplier-quotation-lines", async (request) => {
    await users.demandPermission(request, "estimate.read");
    const rows = await database.query<Record<string, unknown>>(`
      SELECT l.id, l.line_no, l.item_code, l.description, l.brand, l.model,
             l.qty, l.unit, l.unit_price, l.line_total, l.currency, l.remark,
             q.id quotation_id, q.quotation_no, q.supplier_reference, q.received_date,
             q.valid_until, q.currency quotation_currency,
             s.id supplier_id, s.name supplier_name
      FROM dbo.supplier_quotation_lines l
      JOIN dbo.supplier_quotations q ON q.id = l.quotation_id
      JOIN dbo.suppliers s ON s.id = q.supplier_id
      WHERE q.status IS NULL OR q.status != N'Superseded'
      ORDER BY q.received_date DESC, l.quotation_id DESC, l.line_no;
    `);
    return rows.recordset.map((r) => ({
      id: Number(r.id), lineNo: Number(r.line_no),
      itemCode: String(r.item_code), description: String(r.description),
      brand: String(r.brand), model: String(r.model),
      qty: Number(r.qty), unit: String(r.unit),
      unitPrice: Number(r.unit_price), lineTotal: Number(r.line_total),
      currency: String(r.currency), remark: String(r.remark ?? ""),
      quotationId: Number(r.quotation_id), quotationNumber: String(r.quotation_no),
      supplierReference: String(r.supplier_reference ?? ""),
      receivedDate: dateOnly(r.received_date as Date | string),
      validUntil: dateOnly(r.valid_until as Date | string),
      supplierId: Number(r.supplier_id), supplierName: String(r.supplier_name),
    }));
  });
}
