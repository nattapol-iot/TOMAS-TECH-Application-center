import sql from "mssql/msnodesqlv8.js";
import type { FastifyInstance } from "fastify";
import type { Transaction as TransactionType } from "mssql";
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
import { demandProjectScope } from "../project-scope.js";
import { insertAudit } from "../audit.js";
import type { CurrentUser } from "../types.js";
import type { CurrentUserService } from "../users.js";
import { demandDrawingTask } from "../drawing-workflow.js";

function summary(row: Record<string, unknown> & { row_version: Buffer }) {
  return {
    id: Number(row.id),
    fileName: row.name,
    contentType: row.content_type,
    sizeBytes: Number(row.size_bytes),
    folderCode: row.folder_code,
    folderName: row.folder_name,
    documentType: row.document_type,
    remark: row.remark,
    uploadedByName: row.uploaded_by_name,
    uploadedAt: row.uploaded_at,
    sha256: row.provider_etag,
    rowVersion: row.row_version.toString("base64"),
  };
}

async function projectFolder(
  transaction: TransactionType,
  database: Database,
  actor: CurrentUser,
  projectId: number,
  folderCode: string,
): Promise<{ projectNumber: string; folderName: string }> {
  await demandProjectScope(database, actor, projectId, transaction);
  const request = new sql.Request(transaction);
  request.input("project", sql.BigInt, projectId);
  request.input("folder", sql.Char(2), folderCode);
  const row = (await request.query<{ project_no: string; folder_name: string | null }>(`
    SELECT p.project_no, f.name folder_name
    FROM dbo.projects p WITH (UPDLOCK,HOLDLOCK)
    LEFT JOIN dbo.project_folders f ON f.project_id=p.id AND f.folder_code=@folder
    WHERE p.id=@project AND p.deleted_at IS NULL;
  `)).recordset[0];
  if (!row) throw new ApiError(404, "project_not_found", "Project not found.");
  if (!row.folder_name) throw new ApiError(422, "invalid_folder", "The selected project folder does not exist.");
  return { projectNumber: row.project_no, folderName: row.folder_name };
}

export function registerProjectDocumentRoutes(
  app: FastifyInstance,
  config: AppConfig,
  database: Database,
  users: CurrentUserService,
): void {
  app.get("/api/v1/projects/:projectId/drawing-tasks", async (request) => {
    await users.demandPermission(request, "signing.request");
    const actor = await users.required(request);
    const projectId = positiveLong((request.params as { projectId?: string }).projectId, "Project id");
    await demandProjectScope(database, actor, projectId);
    return (await database.query<Record<string, unknown>>(`SELECT t.id,t.name,p.lead_engineer_id leaderId,p.manager_id managerId,
      leader.name leaderName,manager.name managerName
      FROM dbo.schedule_tasks t JOIN dbo.projects p ON p.id=t.project_id
      LEFT JOIN dbo.users leader ON leader.id=p.lead_engineer_id
      LEFT JOIN dbo.users manager ON manager.id=p.manager_id
      WHERE t.project_id=@project AND t.deleted_at IS NULL AND p.status<>N'Closed'
      AND EXISTS(SELECT 1 FROM dbo.schedule_task_pics pic WHERE pic.task_id=t.id AND pic.user_id=@actor)
      AND NOT EXISTS(SELECT 1 FROM dbo.schedule_tasks child WHERE child.parent_id=t.id AND child.deleted_at IS NULL)
      ORDER BY t.sort_order,t.id;`, bind => {bind.input("project",sql.BigInt,projectId);bind.input("actor",sql.BigInt,actor.id);})).recordset.map(row => ({...row,id:Number(row.id),leaderId:row.leaderId == null ? null : Number(row.leaderId),managerId:row.managerId == null ? null : Number(row.managerId)}));
  });
  app.get("/api/v1/projects/:projectId/documents", async (request) => {
    await users.demandPermission(request, "project.read");
    const actor = await users.required(request);
    const projectId = positiveLong((request.params as { projectId?: string }).projectId, "Project id");
    await demandProjectScope(database, actor, projectId);
    const result = await database.query<Record<string, unknown> & { row_version: Buffer }>(`
      SELECT d.id,d.name,d.content_type,d.size_bytes,d.folder_code,f.name folder_name,
             d.document_type,d.remark,u.name uploaded_by_name,d.uploaded_at,d.provider_etag,d.row_version
      FROM dbo.project_docs d
      INNER JOIN dbo.projects p ON p.id=d.project_id AND p.deleted_at IS NULL
      INNER JOIN dbo.project_folders f ON f.project_id=d.project_id AND f.folder_code=d.folder_code
      INNER JOIN dbo.users u ON u.id=d.uploaded_by
      WHERE d.project_id=@project AND d.deleted_at IS NULL
      ORDER BY d.uploaded_at DESC,d.id DESC;
    `, (bind) => bind.input("project", sql.BigInt, projectId));
    return result.recordset.map(summary);
  });

  app.post(
    "/api/v1/projects/:projectId/documents",
    { config: { rateLimit: DOCUMENT_UPLOAD_RATE_LIMIT } },
    async (request, reply) => {
    const actor = await users.required(request);
    const projectId = positiveLong((request.params as { projectId?: string }).projectId, "Project id");
    await demandProjectScope(database, actor, projectId);
    const upload = await readMultipartUpload(request, config.documentStorage.maxFileSizeBytes);
    const taskText = multipartText(upload.values, "taskId", 20);
    const taskId = taskText ? positiveLong(taskText, "Design task id") : null;
    await users.demandPermission(request, taskId ? "signing.request" : "project.write");
    if (taskId) await database.transaction(tx => demandDrawingTask(tx, projectId, taskId, actor.id), sql.ISOLATION_LEVEL.READ_COMMITTED);
    const folderCode = multipartText(upload.values, "folderCode", 2, true)!;
    const documentType = multipartText(upload.values, "documentType", 100, true)!;
    if (taskId && (folderCode !== "02" || documentType !== "Drawing")) throw new ApiError(400, "drawing_folder_required", "Task import is restricted to the Drawing folder and document type.");
    const remark = multipartText(upload.values, "remark", 20_000);
    if (!/^\d{2}$/.test(folderCode)) throw new ApiError(400, "invalid_folder", "Folder code must be two digits.");
    const fileName = uploadedFileName(upload.file.filename);
    const extension = validateFileExtension(fileName);
    const contentType = contentTypeFor(fileName);

    // Validate stable references before doing external I/O. The same checks are
    // repeated under locks in the metadata transaction.
    const preflight = await database.query<{ project_no: string; folder_name: string | null }>(`
      SELECT p.project_no,f.name folder_name FROM dbo.projects p
      LEFT JOIN dbo.project_folders f ON f.project_id=p.id AND f.folder_code=@folder
      WHERE p.id=@project AND p.deleted_at IS NULL;
    `, (bind) => { bind.input("project", sql.BigInt, projectId); bind.input("folder", sql.Char(2), folderCode); });
    if (!preflight.recordset[0]) throw new ApiError(404, "project_not_found", "Project not found.");
    if (!preflight.recordset[0].folder_name) throw new ApiError(422, "invalid_folder", "The selected project folder does not exist.");

    const key = storageKey(`projects/${projectId}/${folderCode}`, extension);
    const write = await writeStoredFile(config.documentStorage, key, upload.file.filepath);
    try {
      const created = await database.transaction(async (transaction) => {
        const context = await projectFolder(transaction, database, actor, projectId, folderCode);
        if (taskId) await demandDrawingTask(transaction, projectId, taskId, actor.id);
        const insert = new sql.Request(transaction);
        insert.input("project", sql.BigInt, projectId);
        insert.input("folder", sql.Char(2), folderCode);
        insert.input("name", sql.NVarChar(500), fileName);
        insert.input("document_type", sql.NVarChar(100), documentType);
        insert.input("content_type", sql.NVarChar(200), contentType);
        insert.input("size", sql.BigInt, write.sizeBytes);
        insert.input("key", sql.NVarChar(1000), key);
        insert.input("sha", sql.NVarChar(500), write.sha256);
        insert.input("actor", sql.BigInt, actor.id);
        insert.input("remark", sql.NVarChar(sql.MAX), remark);
        insert.input("folder_name", sql.NVarChar(200), context.folderName);
        insert.input("uploader", sql.NVarChar(200), actor.name);
        const row = (await insert.query<Record<string, unknown> & { row_version: Buffer }>(`
          INSERT INTO dbo.project_docs(project_id,folder_code,name,document_type,content_type,size_bytes,storage_key,provider_etag,uploaded_by,remark)
          OUTPUT inserted.id,inserted.name,inserted.content_type,inserted.size_bytes,inserted.folder_code,
                 @folder_name folder_name,inserted.document_type,inserted.remark,@uploader uploaded_by_name,
                 inserted.uploaded_at,inserted.provider_etag,inserted.row_version
          VALUES(@project,@folder,@name,@document_type,@content_type,@size,@key,@sha,@actor,@remark);
        `)).recordset[0]!;
        const result = summary(row);
        await insertAudit(transaction, actor.id, "ProjectDocument", result.id, context.projectNumber, "Uploaded", null, result);
        return result;
      }, sql.ISOLATION_LEVEL.READ_COMMITTED);
      return reply.status(201).header("Location", `/api/v1/projects/${projectId}/documents/${created.id}/content`).send(created);
    } catch (error) {
      if (error instanceof DatabaseCommitOutcomeUnknownError) {
        request.log.fatal({ err: error.originalError, storageKey: key, projectId }, "Project document commit outcome unknown; preserving storage file");
      } else {
        await deleteStoredFile(config.documentStorage, key);
      }
      throw error;
    }
  });

  app.get(
    "/api/v1/projects/:projectId/documents/:documentId/content",
    { config: { rateLimit: DOCUMENT_DOWNLOAD_RATE_LIMIT } },
    async (request, reply) => {
    await users.demandPermission(request, "project.read");
    const actor = await users.required(request);
    const params = request.params as { projectId?: string; documentId?: string };
    const projectId = positiveLong(params.projectId, "Project id");
    const documentId = positiveLong(params.documentId, "Document id");
    await demandProjectScope(database, actor, projectId);
    const result = await database.query<Record<string, unknown>>(`
      SELECT name,content_type,storage_key,size_bytes,provider_etag
      FROM dbo.project_docs WHERE id=@document AND project_id=@project AND deleted_at IS NULL;
    `, (bind) => { bind.input("document", sql.BigInt, documentId); bind.input("project", sql.BigInt, projectId); });
    const row = result.recordset[0];
    if (!row) throw new ApiError(404, "document_not_found", "Project document not found.");
    return sendStoredFile(request, reply, config.documentStorage, {
      storageKey: String(row.storage_key), fileName: String(row.name), contentType: String(row.content_type),
      sizeBytes: Number(row.size_bytes), sha256: row.provider_etag ? String(row.provider_etag) : null,
    });
  });
}
