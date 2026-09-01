import sql from "mssql/msnodesqlv8.js";
import { DatabaseCommitOutcomeUnknownError } from "../db.js";
import { contentTypeFor, deleteStoredFile, multipartText, readMultipartForm, readMultipartUpload, sendStoredFile, storageKey, uploadedFileName, validateFileExtension, writeStoredFile } from "../document-storage.js";
import { ApiError } from "../errors.js";
import { booleanQuery, clampedInteger, dateOnly, optionalPositiveLong, optionalText, positiveLong } from "../http.js";
import { auditKnowledge, bindKnowledgeVisibility, canManageKnowledge, CONFIDENTIALITIES, DOCUMENT_TYPES, issueKnowledgeNumber, KNOWLEDGE_VISIBILITY, safeStoredName } from "../knowledge-common.js";
const KNOWLEDGE_EXTENSIONS = new Set([".pdf", ".doc", ".docx", ".xls", ".xlsx", ".ppt", ".pptx", ".txt", ".csv", ".png", ".jpg", ".jpeg"]);
const dateValue = (value, label) => { if (!value)
    return null; if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(Date.parse(`${value}T00:00:00Z`)))
    throw new ApiError(400, "validation_failed", `${label} must use YYYY-MM-DD.`); return value; };
const asId = (value, label) => value ? positiveLong(value, label) : null;
const todayIn = (timeZone) => { const parts = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date()); const value = Object.fromEntries(parts.map((part) => [part.type, part.value])); return `${value.year}-${value.month}-${value.day}`; };
function documentRow(row) {
    return { id: Number(row.id), documentNumber: row.document_no, title: row.title, documentType: row.document_type, categoryId: Number(row.category_id), categoryName: row.category_name, department: row.department_code, ownerId: Number(row.owner_id), ownerName: row.owner_name, confidentiality: row.confidentiality, status: row.display_status ?? row.current_status, workflowStatus: row.current_status, language: row.language, tags: row.tags, nextReviewDate: dateOnly(row.next_review_date), updatedAt: row.updated_at, archivedAt: row.archived_at, currentRevision: row.current_revision, effectiveDate: dateOnly(row.effective_date), expiryDate: dateOnly(row.expiry_date), currentVersionId: row.current_version_id == null ? null : Number(row.current_version_id), acknowledgementTotal: Number(row.ack_total ?? 0), acknowledgementDone: Number(row.ack_done ?? 0) };
}
function bindFile(request, input) {
    request.input("storage_key", sql.NVarChar(400), input.key);
    request.input("original_name", sql.NVarChar(500), input.fileName);
    request.input("safe_name", sql.NVarChar(500), safeStoredName(input.fileName));
    request.input("mime", sql.NVarChar(200), input.contentType);
    request.input("size", sql.BigInt, input.sizeBytes);
    request.input("sha", sql.Char(64), input.sha256);
    request.input("actor", sql.BigInt, input.actorId);
}
export function registerKnowledgeDocumentRoutes(app, config, database, users) {
    app.get("/api/v1/knowledge/documents", async (request) => {
        await users.demandPermission(request, "knowledge.view");
        const actor = await users.required(request);
        const manage = await canManageKnowledge(database, actor);
        const query = request.query;
        const search = optionalText(query.search, 200, "Search") ?? "", documentType = optionalText(query.documentType, 30, "Document type") ?? "", status = optionalText(query.status, 30, "Status") ?? "", department = optionalText(query.department, 200, "Department") ?? "", confidentiality = optionalText(query.confidentiality, 30, "Confidentiality") ?? "", language = (optionalText(query.language, 2, "Language") ?? "").toUpperCase();
        if (documentType && !DOCUMENT_TYPES.includes(documentType))
            throw new ApiError(400, "validation_failed", "Document type is not allowed.");
        if (confidentiality && !CONFIDENTIALITIES.includes(confidentiality))
            throw new ApiError(400, "validation_failed", "Confidentiality is not allowed.");
        if (language && !["EN", "TH", "JA"].includes(language))
            throw new ApiError(400, "validation_failed", "Language must be EN, TH or JA.");
        const categoryId = optionalPositiveLong(query.categoryId, "Category"), ownerId = optionalPositiveLong(query.ownerId, "Owner"), reviewDue = booleanQuery(query.reviewDue, false), includeArchived = booleanQuery(query.includeArchived, false), workspace = booleanQuery(query.workspace, false), page = clampedInteger(query.page, 1, 1, 1_000_000), pageSize = clampedInteger(query.pageSize, 25, 1, 100);
        const result = await database.query(`WITH visible AS (SELECT d.id,d.document_no,d.title,d.document_type,d.category_id,c.name_en category_name,d.department_code,d.owner_id,o.name owner_name,d.confidentiality,d.current_status,d.language,d.tags,d.next_review_date,d.updated_at,d.archived_at,v.revision current_revision,v.effective_date,v.expiry_date,v.id current_version_id,(SELECT COUNT_BIG(*) FROM dbo.knowledge_document_acknowledgements a WHERE a.document_version_id=v.id) ack_total,(SELECT COUNT_BIG(*) FROM dbo.knowledge_document_acknowledgements a WHERE a.document_version_id=v.id AND a.status=N'Acknowledged') ack_done,d.description search_description FROM dbo.knowledge_documents d INNER JOIN dbo.knowledge_categories c ON c.id=d.category_id INNER JOIN dbo.users o ON o.id=d.owner_id LEFT JOIN dbo.knowledge_document_versions v ON v.id=d.current_version_id WHERE ${KNOWLEDGE_VISIBILITY}) SELECT *,CASE WHEN archived_at IS NOT NULL THEN N'Archived' WHEN expiry_date IS NOT NULL AND expiry_date<@today THEN N'Expired' WHEN current_status=N'Published' AND next_review_date IS NOT NULL AND next_review_date<=@today THEN N'Review Due' ELSE current_status END display_status,COUNT_BIG(*) OVER() total_count FROM visible WHERE (@include_archived=1 OR archived_at IS NULL) AND (@document_type=N'' OR document_type=@document_type) AND (@workspace=0 OR document_type IN(N'Working Document',N'Project Document',N'Supplier Document')) AND (@status=N'' OR (@status=N'Expired' AND expiry_date<@today) OR (@status=N'Review Due' AND current_status=N'Published' AND next_review_date<=@today) OR current_status=@status) AND (@department=N'' OR department_code=@department) AND (@confidentiality=N'' OR confidentiality=@confidentiality) AND (@language=N'' OR language=@language) AND (@category_id IS NULL OR category_id=@category_id) AND (@owner_id IS NULL OR owner_id=@owner_id) AND (@review_due=0 OR next_review_date<=@today) AND (@search=N'' OR document_no LIKE N'%'+@search+N'%' OR title LIKE N'%'+@search+N'%' OR tags LIKE N'%'+@search+N'%' OR owner_name LIKE N'%'+@search+N'%' OR category_name LIKE N'%'+@search+N'%' OR search_description LIKE N'%'+@search+N'%' OR EXISTS(SELECT 1 FROM dbo.knowledge_document_versions sv LEFT JOIN dbo.knowledge_document_files sf ON sf.id=sv.file_id WHERE sv.document_id=visible.id AND (sf.original_file_name LIKE N'%'+@search+N'%' OR sv.extracted_text LIKE N'%'+@search+N'%'))) ORDER BY updated_at DESC,id DESC OFFSET @offset ROWS FETCH NEXT @page_size ROWS ONLY;`, (bind) => { bindKnowledgeVisibility(bind, actor, manage); bind.input("today", sql.Date, todayIn(config.businessTimeZone)); bind.input("include_archived", sql.Bit, includeArchived); bind.input("document_type", sql.NVarChar(30), documentType); bind.input("workspace", sql.Bit, workspace); bind.input("status", sql.NVarChar(30), status); bind.input("department", sql.NVarChar(200), department); bind.input("confidentiality", sql.NVarChar(30), confidentiality); bind.input("language", sql.Char(2), language); bind.input("category_id", sql.BigInt, categoryId); bind.input("owner_id", sql.BigInt, ownerId); bind.input("review_due", sql.Bit, reviewDue); bind.input("search", sql.NVarChar(200), search); bind.input("offset", sql.Int, (page - 1) * pageSize); bind.input("page_size", sql.Int, pageSize); });
        return { items: result.recordset.map(documentRow), page, pageSize, total: Number(result.recordset[0]?.total_count ?? 0) };
    });
    app.get("/api/v1/knowledge/documents/:id", async (request) => {
        await users.demandPermission(request, "knowledge.view");
        const actor = await users.required(request);
        const manage = await canManageKnowledge(database, actor);
        const id = positiveLong(request.params.id, "Document id");
        const header = await database.query(`SELECT d.id,d.document_no,d.title,d.description,d.document_type,d.category_id,c.name_en category_name,d.department_code,d.owner_id,o.name owner_name,d.confidentiality,d.current_status,d.language,d.tags,d.next_review_date,d.current_version_id,d.created_at,d.updated_at,d.archived_at,d.row_version FROM dbo.knowledge_documents d INNER JOIN dbo.knowledge_categories c ON c.id=d.category_id INNER JOIN dbo.users o ON o.id=d.owner_id WHERE d.id=@id AND ${KNOWLEDGE_VISIBILITY};`, (bind) => { bindKnowledgeVisibility(bind, actor, manage); bind.input("id", sql.BigInt, id); });
        const row = header.recordset[0];
        if (!row)
            throw new ApiError(404, "document_not_found", "Document not found.");
        const [versions, approvals, relations] = await Promise.all([
            database.query(`SELECT v.id,v.revision,v.version_number,v.status,v.change_type,v.change_summary,v.effective_date,v.expiry_date,v.created_at,cu.name created_by_name,v.approved_at,au.name approved_by_name,v.published_at,pu.name published_by_name,f.original_file_name,f.mime_type,f.size_bytes,v.superseded_by_version_id FROM dbo.knowledge_document_versions v INNER JOIN dbo.users cu ON cu.id=v.created_by LEFT JOIN dbo.users au ON au.id=v.approved_by LEFT JOIN dbo.users pu ON pu.id=v.published_by LEFT JOIN dbo.knowledge_document_files f ON f.id=v.file_id WHERE v.document_id=@id ORDER BY v.version_number DESC;`, (bind) => bind.input("id", sql.BigInt, id)),
            database.query(`SELECT a.id,a.document_version_id,a.sequence,a.step_type,a.approver_id,u.name approver_name,a.status,a.comment,a.acted_at FROM dbo.knowledge_document_approvals a INNER JOIN dbo.users u ON u.id=a.approver_id INNER JOIN dbo.knowledge_document_versions v ON v.id=a.document_version_id WHERE v.document_id=@id ORDER BY a.document_version_id DESC,a.sequence;`, (bind) => bind.input("id", sql.BigInt, id)),
            database.query(`SELECT r.id,r.entity_type,r.entity_id,r.relation_type,r.created_at,u.name created_by_name FROM dbo.knowledge_document_relations r INNER JOIN dbo.users u ON u.id=r.created_by WHERE r.document_id=@id ORDER BY r.entity_type,r.entity_id;`, (bind) => bind.input("id", sql.BigInt, id)),
        ]);
        const current = versions.recordset.find((version) => Number(version.id) === Number(row.current_version_id));
        const document = { ...documentRow({ ...row, current_revision: current?.revision ?? null, effective_date: current?.effective_date ?? null, expiry_date: current?.expiry_date ?? null }), description: row.description, rowVersion: row.row_version.toString("base64"), createdAt: row.created_at };
        return { document, versions: versions.recordset.map((v) => ({ id: Number(v.id), revision: v.revision, versionNumber: Number(v.version_number), status: v.status, changeType: v.change_type, changeSummary: v.change_summary, effectiveDate: dateOnly(v.effective_date), expiryDate: dateOnly(v.expiry_date), createdAt: v.created_at, createdByName: v.created_by_name, approvedAt: v.approved_at, approvedByName: v.approved_by_name, publishedAt: v.published_at, publishedByName: v.published_by_name, fileName: v.original_file_name, mimeType: v.mime_type, sizeBytes: v.size_bytes == null ? null : Number(v.size_bytes), supersededByVersionId: v.superseded_by_version_id == null ? null : Number(v.superseded_by_version_id) })), approvals: approvals.recordset.map((a) => ({ id: Number(a.id), versionId: Number(a.document_version_id), sequence: Number(a.sequence), stepType: a.step_type, approverId: Number(a.approver_id), approverName: a.approver_name, status: a.status, comment: a.comment, actedAt: a.acted_at })), relations: relations.recordset.map((r) => ({ id: Number(r.id), entityType: r.entity_type, entityId: Number(r.entity_id), relationType: r.relation_type, createdAt: r.created_at, createdByName: r.created_by_name })) };
    });
    app.post("/api/v1/knowledge/documents", async (request, reply) => {
        await users.demandPermission(request, "knowledge.upload");
        const actor = await users.required(request);
        const manage = await canManageKnowledge(database, actor);
        const form = await readMultipartForm(request, config.documentStorage.maxFileSizeBytes);
        const title = multipartText(form.values, "title", 300, true), description = multipartText(form.values, "description", 2000) ?? "", documentType = multipartText(form.values, "documentType", 30, true), categoryId = asId(multipartText(form.values, "categoryId", 30, true), "Category"), prefix = multipartText(form.values, "numberPrefix", 10, true).toUpperCase(), scope = multipartText(form.values, "numberScope", 20, true).toUpperCase(), department = multipartText(form.values, "department", 200) ?? actor.department ?? "", confidentiality = multipartText(form.values, "confidentiality", 30) ?? "Company", language = (multipartText(form.values, "language", 2) ?? "EN").toUpperCase(), tags = multipartText(form.values, "tags", 500) ?? "", ownerId = asId(multipartText(form.values, "ownerId", 30), "Owner") ?? actor.id, reviewDate = dateValue(multipartText(form.values, "nextReviewDate", 10), "Next review date");
        if (!DOCUMENT_TYPES.includes(documentType) || !CONFIDENTIALITIES.includes(confidentiality) || !["EN", "TH", "JA"].includes(language))
            throw new ApiError(400, "validation_failed", "Document type, confidentiality or language is invalid.");
        if (documentType === "Controlled Document" && !reviewDate)
            throw new ApiError(400, "validation_failed", "A controlled document requires a next review date.");
        if (ownerId !== actor.id && !manage)
            throw new ApiError(403, "forbidden", "Only a knowledge manager can assign another owner.");
        let key = null;
        let write = null;
        let fileName = null;
        let contentType = null;
        if (form.file) {
            fileName = uploadedFileName(form.file.filename);
            const extension = validateFileExtension(fileName, KNOWLEDGE_EXTENSIONS);
            contentType = contentTypeFor(fileName);
            key = storageKey("knowledge", extension);
            write = await writeStoredFile(config.documentStorage, key, form.file.filepath);
        }
        try {
            const created = await database.transaction(async (transaction) => { const validate = new sql.Request(transaction); validate.input("category", sql.BigInt, categoryId); validate.input("owner", sql.BigInt, ownerId); const refs = (await validate.query(`SELECT CAST(CASE WHEN EXISTS(SELECT 1 FROM dbo.knowledge_categories WHERE id=@category AND is_active=1) AND EXISTS(SELECT 1 FROM dbo.users WHERE id=@owner AND is_active=1 AND deleted_at IS NULL) THEN 1 ELSE 0 END AS bit) valid;`)).recordset[0]; if (!refs?.valid)
                throw new ApiError(422, "invalid_reference", "Category or owner was not found."); const documentNumber = await issueKnowledgeNumber(transaction, prefix, scope); let fileId = null; if (key && write && fileName && contentType) {
                const file = new sql.Request(transaction);
                bindFile(file, { key, fileName, contentType, sizeBytes: write.sizeBytes, sha256: write.sha256, actorId: actor.id });
                fileId = Number((await file.query(`INSERT INTO dbo.knowledge_document_files(storage_key,original_file_name,safe_file_name,mime_type,size_bytes,sha256,malware_scan_status,uploaded_by) OUTPUT inserted.id VALUES(@storage_key,@original_name,@safe_name,@mime,@size,@sha,N'Skipped',@actor);`)).recordset[0].id);
            } const doc = new sql.Request(transaction); doc.input("no", sql.NVarChar(40), documentNumber); doc.input("title", sql.NVarChar(300), title); doc.input("description", sql.NVarChar(2000), description); doc.input("type", sql.NVarChar(30), documentType); doc.input("category", sql.BigInt, categoryId); doc.input("department", sql.NVarChar(200), department); doc.input("owner", sql.BigInt, ownerId); doc.input("conf", sql.NVarChar(30), confidentiality); doc.input("language", sql.Char(2), language); doc.input("tags", sql.NVarChar(500), tags); doc.input("review", sql.Date, reviewDate); doc.input("actor", sql.BigInt, actor.id); const documentId = Number((await doc.query(`INSERT INTO dbo.knowledge_documents(document_no,title,description,document_type,category_id,department_code,owner_id,confidentiality,language,tags,next_review_date,created_by,updated_by) OUTPUT inserted.id VALUES(@no,@title,@description,@type,@category,@department,@owner,@conf,@language,@tags,@review,@actor,@actor);`)).recordset[0].id); const version = new sql.Request(transaction); version.input("document", sql.BigInt, documentId); version.input("file", sql.BigInt, fileId); version.input("actor", sql.BigInt, actor.id); const versionId = Number((await version.query(`INSERT INTO dbo.knowledge_document_versions(document_id,revision,version_number,file_id,change_type,change_summary,status,created_by) OUTPUT inserted.id VALUES(@document,N'R00',1,@file,N'Major',N'Initial issue',N'Draft',@actor);`)).recordset[0].id); const current = new sql.Request(transaction); current.input("document", sql.BigInt, documentId); current.input("version", sql.BigInt, versionId); current.input("actor", sql.BigInt, actor.id); await current.query(`UPDATE dbo.knowledge_documents SET current_version_id=@version,current_status=N'Draft',updated_by=@actor,updated_at=SYSUTCDATETIME() WHERE id=@document;`); await auditKnowledge(transaction, { documentId, versionId, actor, action: "Create", after: { documentNumber, title }, reason: "Document created" }); return { id: documentId, documentNumber, versionId }; }, sql.ISOLATION_LEVEL.READ_COMMITTED);
            return reply.status(201).header("Location", `/api/v1/knowledge/documents/${created.id}`).send(created);
        }
        catch (error) {
            if (key) {
                if (error instanceof DatabaseCommitOutcomeUnknownError)
                    request.log.fatal({ err: error.originalError, storageKey: key }, "Knowledge document commit outcome unknown; preserving file");
                else
                    await deleteStoredFile(config.documentStorage, key);
            }
            throw error;
        }
    });
    app.post("/api/v1/knowledge/documents/:id/versions", async (request, reply) => {
        await users.demandPermission(request, "knowledge.upload");
        const actor = await users.required(request);
        const manage = await canManageKnowledge(database, actor);
        const documentId = positiveLong(request.params.id, "Document id");
        const form = await readMultipartUpload(request, config.documentStorage.maxFileSizeBytes);
        const changeType = multipartText(form.values, "changeType", 10) ?? "Major", summary = multipartText(form.values, "changeSummary", 2000, true), baseVersionId = asId(multipartText(form.values, "baseVersionId", 30), "Base revision");
        if (!["Major", "Minor"].includes(changeType))
            throw new ApiError(400, "validation_failed", "Change type must be Major or Minor.");
        const fileName = uploadedFileName(form.file.filename), extension = validateFileExtension(fileName, KNOWLEDGE_EXTENSIONS), contentType = contentTypeFor(fileName), key = storageKey("knowledge", extension), write = await writeStoredFile(config.documentStorage, key, form.file.filepath);
        try {
            const created = await database.transaction(async (transaction) => { const probe = new sql.Request(transaction); probe.input("id", sql.BigInt, documentId); probe.input("me", sql.BigInt, actor.id); probe.input("manage", sql.Bit, manage); const row = (await probe.query(`SELECT d.current_version_id,COALESCE(MAX(v.version_number),0) max_version FROM dbo.knowledge_documents d LEFT JOIN dbo.knowledge_document_versions v ON v.document_id=d.id LEFT JOIN dbo.users me ON me.id=@me WHERE d.id=@id AND d.archived_at IS NULL AND (d.owner_id=@me OR @manage=1 OR EXISTS(SELECT 1 FROM dbo.knowledge_document_permissions p WHERE p.document_id=d.id AND p.permission_level IN(N'Edit',N'Manage') AND ((p.subject_type=N'User' AND p.subject_user_id=@me) OR (p.subject_type=N'Role' AND p.subject_role_id=me.role_id)))) GROUP BY d.current_version_id;`)).recordset[0]; if (!row)
                throw new ApiError(404, "document_not_found", "Document was not found, is archived, or you cannot edit it."); if (baseVersionId && baseVersionId !== Number(row.current_version_id))
                throw new ApiError(409, "revision_conflict", "A newer revision exists. Reload before uploading another version."); const duplicate = new sql.Request(transaction); duplicate.input("id", sql.BigInt, documentId); duplicate.input("sha", sql.Char(64), write.sha256); duplicate.input("size", sql.BigInt, write.sizeBytes); if (Number((await duplicate.query(`SELECT COUNT_BIG(*) count FROM dbo.knowledge_document_versions v INNER JOIN dbo.knowledge_document_files f ON f.id=v.file_id WHERE v.document_id=@id AND f.sha256=@sha AND f.size_bytes=@size;`)).recordset[0]?.count ?? 0) > 0)
                throw new ApiError(409, "duplicate_file", "This exact file already exists in the document version history."); const file = new sql.Request(transaction); bindFile(file, { key, fileName, contentType, sizeBytes: write.sizeBytes, sha256: write.sha256, actorId: actor.id }); const fileId = Number((await file.query(`INSERT INTO dbo.knowledge_document_files(storage_key,original_file_name,safe_file_name,mime_type,size_bytes,sha256,malware_scan_status,uploaded_by) OUTPUT inserted.id VALUES(@storage_key,@original_name,@safe_name,@mime,@size,@sha,N'Skipped',@actor);`)).recordset[0].id); const next = Number(row.max_version) + 1, revision = `R${String(next - 1).padStart(2, "0")}`; const version = new sql.Request(transaction); version.input("document", sql.BigInt, documentId); version.input("revision", sql.NVarChar(10), revision); version.input("number", sql.Int, next); version.input("file", sql.BigInt, fileId); version.input("type", sql.NVarChar(10), changeType); version.input("summary", sql.NVarChar(2000), summary); version.input("actor", sql.BigInt, actor.id); const versionId = Number((await version.query(`INSERT INTO dbo.knowledge_document_versions(document_id,revision,version_number,file_id,change_type,change_summary,status,created_by) OUTPUT inserted.id VALUES(@document,@revision,@number,@file,@type,@summary,N'Draft',@actor);`)).recordset[0].id); await auditKnowledge(transaction, { documentId, versionId, actor, action: "CreateVersion", after: { revision, changeType }, reason: summary }); return { versionId, revision }; }, sql.ISOLATION_LEVEL.READ_COMMITTED);
            return reply.status(201).header("Location", `/api/v1/knowledge/versions/${created.versionId}/content`).send(created);
        }
        catch (error) {
            if (error instanceof DatabaseCommitOutcomeUnknownError)
                request.log.fatal({ err: error.originalError, storageKey: key }, "Knowledge revision commit outcome unknown; preserving file");
            else
                await deleteStoredFile(config.documentStorage, key);
            throw error;
        }
    });
    app.get("/api/v1/knowledge/versions/:versionId/content", async (request, reply) => {
        await users.demandPermission(request, "knowledge.view");
        const actor = await users.required(request);
        const manage = await canManageKnowledge(database, actor);
        const versionId = positiveLong(request.params.versionId, "Version id"), preview = booleanQuery(request.query.preview, false);
        const result = await database.query(`SELECT v.document_id,d.document_no,f.storage_key,f.original_file_name,f.mime_type,f.size_bytes,f.sha256 FROM dbo.knowledge_document_versions v INNER JOIN dbo.knowledge_documents d ON d.id=v.document_id INNER JOIN dbo.knowledge_document_files f ON f.id=v.file_id WHERE v.id=@version AND ${KNOWLEDGE_VISIBILITY};`, (bind) => { bindKnowledgeVisibility(bind, actor, manage); bind.input("version", sql.BigInt, versionId); });
        const row = result.recordset[0];
        if (!row)
            throw new ApiError(404, "file_not_found", "The revision file was not found.");
        const mime = String(row.mime_type);
        if (preview && !(mime === "application/pdf" || mime.startsWith("image/") || mime.startsWith("text/")))
            throw new ApiError(415, "preview_not_supported", "This file type cannot be previewed safely in the browser.");
        await database.transaction(async (transaction) => auditKnowledge(transaction, { documentId: Number(row.document_id), versionId, actor, action: preview ? "Preview" : "Download", reason: String(row.document_no) }), sql.ISOLATION_LEVEL.READ_COMMITTED);
        return sendStoredFile(request, reply, config.documentStorage, { storageKey: String(row.storage_key), fileName: String(row.original_file_name), contentType: mime, sizeBytes: Number(row.size_bytes), sha256: String(row.sha256) }, { inline: preview });
    });
}
//# sourceMappingURL=knowledge-documents.js.map