import sql from "mssql";
import type { FastifyInstance } from "fastify";
import type { AppConfig } from "../config.js";
import { DatabaseCommitOutcomeUnknownError, type Database } from "../db.js";
import {
  contentTypeFor,
  deleteStoredFile,
  DOCUMENT_DOWNLOAD_RATE_LIMIT,
  DOCUMENT_UPLOAD_RATE_LIMIT,
  multipartText,
  readMultipartUpload,
  sendStoredFile,
  storageKey,
  uploadedFileName,
  validateFileExtension,
  writeStoredFile,
} from "../document-storage.js";
import { ApiError } from "../errors.js";
import { positiveLong } from "../http.js";
import { insertAudit } from "../audit.js";
import type { CurrentUserService } from "../users.js";

function attachment(row: Record<string, unknown> & { row_version: Buffer }) {
  return {
    id: Number(row.id), fileName: row.name, category: row.category, contentType: row.content_type,
    sizeBytes: Number(row.size_bytes), uploadedByName: row.uploaded_by_name, uploadedAt: row.uploaded_at,
    rowVersion: row.row_version.toString("base64"),
  };
}

export function registerInquiryAttachmentRoutes(
  app: FastifyInstance,
  config: AppConfig,
  database: Database,
  users: CurrentUserService,
): void {
  app.post(
    "/api/v1/inquiries/:id/attachments",
    { config: { rateLimit: DOCUMENT_UPLOAD_RATE_LIMIT } },
    async (request, reply) => {
    await users.demandPermission(request, "inquiry.write");
    const actor = await users.required(request);
    const id = positiveLong((request.params as { id?: string }).id, "Inquiry id");
    const inquiry = await database.query<{ inquiry_no: string }>(
      `SELECT inquiry_no FROM dbo.inquiries WHERE id=@id AND deleted_at IS NULL;`,
      (bind) => bind.input("id", sql.BigInt, id),
    );
    const inquiryNumber = inquiry.recordset[0]?.inquiry_no;
    if (!inquiryNumber) throw new ApiError(404, "inquiry_not_found", "Inquiry not found.");

    const upload = await readMultipartUpload(request, config.documentStorage.maxFileSizeBytes);
    const category = multipartText(upload.values, "category", 100, true)!;
    const fileName = uploadedFileName(upload.file.filename);
    const extension = validateFileExtension(fileName);
    const contentType = contentTypeFor(fileName);
    const key = storageKey(`inquiries/${id}`, extension);
    const write = await writeStoredFile(config.documentStorage, key, upload.file.filepath);
    try {
      const created = await database.transaction(async (transaction) => {
        const verify = new sql.Request(transaction);
        verify.input("id", sql.BigInt, id);
        const current = (await verify.query<{ inquiry_no: string }>(
          `SELECT inquiry_no FROM dbo.inquiries WITH (UPDLOCK,HOLDLOCK) WHERE id=@id AND deleted_at IS NULL AND archived_at IS NULL AND status<>N'Cancelled';`,
        )).recordset[0];
        if (!current) throw new ApiError(404, "inquiry_not_found", "Inquiry not found.");
        const insert = new sql.Request(transaction);
        insert.input("id", sql.BigInt, id);
        insert.input("name", sql.NVarChar(500), fileName);
        insert.input("category", sql.NVarChar(100), category);
        insert.input("content_type", sql.NVarChar(200), contentType);
        insert.input("size", sql.BigInt, write.sizeBytes);
        insert.input("key", sql.NVarChar(1000), key);
        insert.input("sha", sql.Char(64), write.sha256);
        insert.input("actor", sql.BigInt, actor.id);
        insert.input("uploader", sql.NVarChar(200), actor.name);
        const row = (await insert.query<Record<string, unknown> & { row_version: Buffer }>(`
          INSERT INTO dbo.inquiry_attachments(inquiry_id,name,category,content_type,size_bytes,storage_key,sha256,uploaded_by)
          OUTPUT inserted.id,inserted.name,inserted.category,inserted.content_type,inserted.size_bytes,
                 @uploader uploaded_by_name,inserted.uploaded_at,inserted.row_version
          VALUES(@id,@name,@category,@content_type,@size,@key,@sha,@actor);
        `)).recordset[0]!;
        const result = attachment(row);
        await insertAudit(transaction, actor.id, "Inquiry", id, current.inquiry_no, "Attachment uploaded", null, {
          id: result.id, fileName, category, sizeBytes: write.sizeBytes, sha256: write.sha256,
        });
        return result;
      }, sql.ISOLATION_LEVEL.READ_COMMITTED);
      return reply.status(201).header("Location", `/api/v1/inquiries/${id}/attachments/${created.id}/content`).send(created);
    } catch (error) {
      if (error instanceof DatabaseCommitOutcomeUnknownError) {
        request.log.fatal({ err: error.originalError, storageKey: key, inquiryId: id }, "Inquiry attachment commit outcome unknown; preserving storage file");
      } else {
        await deleteStoredFile(config.documentStorage, key);
      }
      throw error;
    }
  });

  app.get(
    "/api/v1/inquiries/:id/attachments/:attachmentId/content",
    { config: { rateLimit: DOCUMENT_DOWNLOAD_RATE_LIMIT } },
    async (request, reply) => {
    await users.demandPermission(request, "inquiry.read");
    const params = request.params as { id?: string; attachmentId?: string };
    const id = positiveLong(params.id, "Inquiry id");
    const attachmentId = positiveLong(params.attachmentId, "Attachment id");
    const result = await database.query<Record<string, unknown>>(`
      SELECT name,content_type,storage_key,size_bytes,sha256
      FROM dbo.inquiry_attachments
      WHERE id=@attachment AND inquiry_id=@inquiry AND deleted_at IS NULL;
    `, (bind) => { bind.input("attachment", sql.BigInt, attachmentId); bind.input("inquiry", sql.BigInt, id); });
    const row = result.recordset[0];
    if (!row) throw new ApiError(404, "attachment_not_found", "Inquiry attachment not found.");
    return sendStoredFile(request, reply, config.documentStorage, {
      storageKey: String(row.storage_key), fileName: String(row.name), contentType: String(row.content_type),
      sizeBytes: Number(row.size_bytes), sha256: row.sha256 ? String(row.sha256) : null,
    });
  });
}
