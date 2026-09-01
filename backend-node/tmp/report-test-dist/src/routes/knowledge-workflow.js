import sql from "mssql/msnodesqlv8.js";
import { ApiError } from "../errors.js";
import { bodyObject, parseDateOnly, positiveLong, requiredInteger, requiredText } from "../http.js";
import { auditKnowledge, canManageKnowledge, demandDocumentEditor, readKnowledgeVersion, setKnowledgeStatus } from "../knowledge-common.js";
const optionalText = (value, max, label) => { if (value == null)
    return ""; if (typeof value !== "string" || value.trim().length > max)
    throw new ApiError(400, "validation_failed", `${label} is invalid.`); return value.trim(); };
const todayIn = (timeZone) => { const p = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date()); const v = Object.fromEntries(p.map((x) => [x.type, x.value])); return `${v.year}-${v.month}-${v.day}`; };
export function registerKnowledgeWorkflowRoutes(app, config, database, users) {
    app.post("/api/v1/knowledge/versions/:versionId/submit", async (request) => {
        await users.demandPermission(request, "knowledge.upload");
        const actor = await users.required(request), manage = await canManageKnowledge(database, actor), versionId = positiveLong(request.params.versionId, "Version id"), body = bodyObject(request.body);
        const reviewerIds = Array.isArray(body.reviewerIds) ? [...new Set(body.reviewerIds.map((id) => requiredInteger(id, "Reviewer", 1)))] : [];
        const approverId = requiredInteger(body.approverId, "Approver", 1), comment = optionalText(body.comment, 2000, "Comment");
        if (!reviewerIds.length)
            throw new ApiError(400, "validation_failed", "At least one reviewer is required.");
        if (approverId === actor.id)
            throw new ApiError(409, "self_approval_forbidden", "The author cannot be the final approver of their own document.");
        return database.transaction(async (transaction) => { const current = await readKnowledgeVersion(transaction, versionId); await demandDocumentEditor(transaction, current.documentId, actor, manage); if (!["Draft", "Request Changes"].includes(current.status))
            throw new ApiError(409, "invalid_transition", `A revision in '${current.status}' cannot be submitted for review.`); if (approverId === current.createdBy)
            throw new ApiError(409, "self_approval_forbidden", "The revision author cannot be its final approver."); const valid = new sql.Request(transaction); valid.input("ids", sql.NVarChar(sql.MAX), [...reviewerIds, approverId].join(",")); const count = Number((await valid.query(`SELECT COUNT_BIG(DISTINCT u.id) count FROM dbo.users u INNER JOIN STRING_SPLIT(@ids,N',') s ON TRY_CONVERT(bigint,s.value)=u.id WHERE u.is_active=1 AND u.deleted_at IS NULL;`)).recordset[0]?.count ?? 0); if (count !== new Set([...reviewerIds, approverId]).size)
            throw new ApiError(422, "invalid_reference", "One or more reviewers or the approver were not found."); const clear = new sql.Request(transaction); clear.input("version", sql.BigInt, versionId); await clear.query(`DELETE FROM dbo.knowledge_document_approvals WHERE document_version_id=@version AND status=N'Pending';`); let sequence = 1; for (const reviewerId of reviewerIds) {
            const insert = new sql.Request(transaction);
            insert.input("version", sql.BigInt, versionId);
            insert.input("sequence", sql.Int, sequence++);
            insert.input("type", sql.NVarChar(20), "Review");
            insert.input("approver", sql.BigInt, reviewerId);
            await insert.query(`INSERT INTO dbo.knowledge_document_approvals(document_version_id,sequence,step_type,approver_id) VALUES(@version,@sequence,@type,@approver);`);
        } const approve = new sql.Request(transaction); approve.input("version", sql.BigInt, versionId); approve.input("sequence", sql.Int, sequence); approve.input("type", sql.NVarChar(20), "Approve"); approve.input("approver", sql.BigInt, approverId); await approve.query(`INSERT INTO dbo.knowledge_document_approvals(document_version_id,sequence,step_type,approver_id) VALUES(@version,@sequence,@type,@approver);`); await setKnowledgeStatus(transaction, current.documentId, versionId, "In Review"); await auditKnowledge(transaction, { documentId: current.documentId, versionId, actor, action: "SubmitForReview", before: { status: current.status }, after: { status: "In Review" }, reason: comment }); return { versionId, status: "In Review" }; }, sql.ISOLATION_LEVEL.READ_COMMITTED);
    });
    app.post("/api/v1/knowledge/versions/:versionId/decide", async (request) => {
        const actor = await users.required(request), versionId = positiveLong(request.params.versionId, "Version id"), body = bodyObject(request.body), decision = requiredText(body.decision, 20, "Decision"), comment = optionalText(body.comment, 2000, "Comment");
        if (!["Approved", "Request Changes", "Rejected"].includes(decision))
            throw new ApiError(400, "validation_failed", "Decision must be Approved, Request Changes or Rejected.");
        if (decision !== "Approved" && !comment)
            throw new ApiError(400, "validation_failed", "Comment is required.");
        return database.transaction(async (transaction) => { const current = await readKnowledgeVersion(transaction, versionId); const step = new sql.Request(transaction); step.input("version", sql.BigInt, versionId); step.input("me", sql.BigInt, actor.id); const pending = (await step.query(`SELECT TOP(1) a.id,a.step_type FROM dbo.knowledge_document_approvals a WHERE a.document_version_id=@version AND a.status=N'Pending' AND a.approver_id=@me AND a.sequence=(SELECT MIN(p.sequence) FROM dbo.knowledge_document_approvals p WHERE p.document_version_id=@version AND p.status=N'Pending') ORDER BY a.sequence;`)).recordset[0]; if (!pending)
            throw new ApiError(403, "not_an_approver", "You have no pending review or approval step on this revision."); const stepType = String(pending.step_type); await users.demandPermission(request, stepType === "Approve" ? "knowledge.approve" : "knowledge.review"); if (stepType === "Approve" && actor.id === current.createdBy)
            throw new ApiError(409, "self_approval_forbidden", "The revision author cannot approve their own document."); const update = new sql.Request(transaction); update.input("status", sql.NVarChar(20), decision); update.input("comment", sql.NVarChar(2000), comment); update.input("me", sql.BigInt, actor.id); update.input("id", sql.BigInt, Number(pending.id)); const result = await update.query(`UPDATE dbo.knowledge_document_approvals SET status=@status,comment=@comment,acted_by=@me,acted_at=SYSUTCDATETIME() WHERE id=@id AND status=N'Pending';`); if (result.rowsAffected[0] !== 1)
            throw new ApiError(409, "step_already_decided", "That step was already decided."); let status; if (decision === "Rejected")
            status = "Draft";
        else if (decision === "Request Changes")
            status = "Request Changes";
        else {
            const remaining = new sql.Request(transaction);
            remaining.input("version", sql.BigInt, versionId);
            status = Number((await remaining.query(`SELECT COUNT_BIG(*) count FROM dbo.knowledge_document_approvals WHERE document_version_id=@version AND status=N'Pending';`)).recordset[0]?.count ?? 0) === 0 ? "Approved" : "Pending Approval";
        } const stamp = new sql.Request(transaction); stamp.input("me", sql.BigInt, actor.id); stamp.input("version", sql.BigInt, versionId); stamp.input("review", sql.Bit, stepType === "Review" && decision === "Approved"); stamp.input("approve", sql.Bit, status === "Approved"); await stamp.query(`UPDATE dbo.knowledge_document_versions SET reviewed_by=CASE WHEN @review=1 THEN @me ELSE reviewed_by END,reviewed_at=CASE WHEN @review=1 THEN SYSUTCDATETIME() ELSE reviewed_at END,approved_by=CASE WHEN @approve=1 THEN @me ELSE approved_by END,approved_at=CASE WHEN @approve=1 THEN SYSUTCDATETIME() ELSE approved_at END WHERE id=@version;`); await setKnowledgeStatus(transaction, current.documentId, versionId, status); await auditKnowledge(transaction, { documentId: current.documentId, versionId, actor, action: decision === "Approved" ? "Approve" : decision === "Rejected" ? "Reject" : "RequestChanges", before: { status: current.status }, after: { status }, reason: comment }); return { versionId, status }; }, sql.ISOLATION_LEVEL.READ_COMMITTED);
    });
    app.post("/api/v1/knowledge/versions/:versionId/publish", async (request) => {
        await users.demandPermission(request, "knowledge.publish");
        const actor = await users.required(request), versionId = positiveLong(request.params.versionId, "Version id"), body = bodyObject(request.body), effectiveDate = parseDateOnly(body.effectiveDate, "Effective date", true) ?? todayIn(config.businessTimeZone), expiryDate = parseDateOnly(body.expiryDate, "Expiry date", true), comment = optionalText(body.comment, 2000, "Comment");
        if (expiryDate && expiryDate < effectiveDate)
            throw new ApiError(400, "validation_failed", "Expiry date cannot be before the effective date.");
        return database.transaction(async (transaction) => { const current = await readKnowledgeVersion(transaction, versionId); if (current.status !== "Approved")
            throw new ApiError(409, "invalid_transition", `Only an approved revision can be published. This revision is '${current.status}'.`); const previous = new sql.Request(transaction); previous.input("document", sql.BigInt, current.documentId); const old = (await previous.query(`SELECT id FROM dbo.knowledge_document_versions WITH(UPDLOCK,HOLDLOCK) WHERE document_id=@document AND status=N'Published';`)).recordset[0]; const oldId = old ? Number(old.id) : null; if (oldId) {
            const supersede = new sql.Request(transaction);
            supersede.input("old", sql.BigInt, oldId);
            supersede.input("new", sql.BigInt, versionId);
            await supersede.query(`UPDATE dbo.knowledge_document_versions SET status=N'Superseded',superseded_by_version_id=@new WHERE id=@old;`);
        } const publish = new sql.Request(transaction); publish.input("effective", sql.Date, effectiveDate); publish.input("expiry", sql.Date, expiryDate); publish.input("me", sql.BigInt, actor.id); publish.input("version", sql.BigInt, versionId); if ((await publish.query(`UPDATE dbo.knowledge_document_versions SET status=N'Published',effective_date=@effective,expiry_date=@expiry,published_by=@me,published_at=SYSUTCDATETIME() WHERE id=@version AND status=N'Approved';`)).rowsAffected[0] !== 1)
            throw new ApiError(409, "publish_conflict", "The revision changed while it was being published."); await setKnowledgeStatus(transaction, current.documentId, versionId, "Published"); if (oldId)
            await auditKnowledge(transaction, { documentId: current.documentId, versionId: oldId, actor, action: "Supersede", before: { status: "Published" }, after: { status: "Superseded", supersededBy: versionId }, reason: "Replaced by a newer revision" }); await auditKnowledge(transaction, { documentId: current.documentId, versionId, actor, action: "Publish", before: { status: "Approved" }, after: { status: "Published", effectiveDate }, reason: comment }); return { versionId, status: "Published", supersededVersionId: oldId }; });
    });
    app.post("/api/v1/knowledge/documents/:id/working-status", async (request) => {
        await users.demandPermission(request, "knowledge.edit");
        const actor = await users.required(request), manage = await canManageKnowledge(database, actor), id = positiveLong(request.params.id, "Document id"), body = bodyObject(request.body), status = requiredText(body.status, 30, "Status"), reason = optionalText(body.reason, 1000, "Reason");
        if (!["Shared", "Editing", "Final"].includes(status))
            throw new ApiError(400, "validation_failed", "Working document status is invalid.");
        return database.transaction(async (transaction) => { const read = new sql.Request(transaction); read.input("id", sql.BigInt, id); read.input("me", sql.BigInt, actor.id); read.input("manage", sql.Bit, manage); const row = (await read.query(`SELECT d.current_version_id,d.current_status FROM dbo.knowledge_documents d WITH(UPDLOCK,HOLDLOCK) LEFT JOIN dbo.users me ON me.id=@me WHERE d.id=@id AND d.document_type=N'Working Document' AND d.archived_at IS NULL AND (d.owner_id=@me OR @manage=1 OR EXISTS(SELECT 1 FROM dbo.knowledge_document_permissions p WHERE p.document_id=d.id AND p.permission_level IN(N'Edit',N'Manage') AND ((p.subject_type=N'User' AND p.subject_user_id=@me) OR (p.subject_type=N'Role' AND p.subject_role_id=me.role_id))));`)).recordset[0]; if (!row?.current_version_id)
            throw new ApiError(404, "document_not_found", "Working document not found."); const current = String(row.current_status), allowed = new Set(["Draft>Shared", "Shared>Editing", "Shared>Final", "Editing>Shared", "Editing>Final"]); if (!allowed.has(`${current}>${status}`))
            throw new ApiError(409, "invalid_transition", `A working document cannot move from '${current}' to '${status}'.`); const versionId = Number(row.current_version_id); await setKnowledgeStatus(transaction, id, versionId, status); await auditKnowledge(transaction, { documentId: id, versionId, actor, action: "EditMetadata", before: { status: current }, after: { status }, reason: reason || "Working document status changed" }); return { id, versionId, status }; });
    });
    app.post("/api/v1/knowledge/documents/:id/archive", async (request) => { await users.demandPermission(request, "knowledge.archive"); const actor = await users.required(request), id = positiveLong(request.params.id, "Document id"), reason = requiredText(bodyObject(request.body).reason, 1000, "Archive reason"); return database.transaction(async (transaction) => { const read = new sql.Request(transaction); read.input("id", sql.BigInt, id); const row = (await read.query(`SELECT current_version_id,current_status FROM dbo.knowledge_documents WITH(UPDLOCK,HOLDLOCK) WHERE id=@id AND archived_at IS NULL;`)).recordset[0]; if (!row)
        throw new ApiError(404, "document_not_found", "Document not found."); const versionId = row.current_version_id == null ? null : Number(row.current_version_id); if (versionId) {
        const version = new sql.Request(transaction);
        version.input("id", sql.BigInt, versionId);
        await version.query(`UPDATE dbo.knowledge_document_versions SET status=N'Archived' WHERE id=@id;`);
    } const update = new sql.Request(transaction); update.input("id", sql.BigInt, id); update.input("actor", sql.BigInt, actor.id); await update.query(`UPDATE dbo.knowledge_documents SET current_status=N'Archived',archived_at=SYSUTCDATETIME(),archived_by=@actor,updated_by=@actor,updated_at=SYSUTCDATETIME() WHERE id=@id;`); await auditKnowledge(transaction, { documentId: id, versionId, actor, action: "Archive", before: { status: row.current_status }, after: { status: "Archived" }, reason }); return { id, status: "Archived" }; }); });
    app.post("/api/v1/knowledge/documents/:id/restore", async (request) => { await users.demandPermission(request, "knowledge.archive"); const actor = await users.required(request), id = positiveLong(request.params.id, "Document id"), reason = requiredText(bodyObject(request.body).reason, 1000, "Restore reason"); return database.transaction(async (transaction) => { const read = new sql.Request(transaction); read.input("id", sql.BigInt, id); const row = (await read.query(`SELECT d.current_version_id,CASE WHEN v.published_at IS NOT NULL THEN N'Published' WHEN v.approved_at IS NOT NULL THEN N'Approved' ELSE N'Draft' END restored_status FROM dbo.knowledge_documents d WITH(UPDLOCK,HOLDLOCK) LEFT JOIN dbo.knowledge_document_versions v ON v.id=d.current_version_id WHERE d.id=@id AND d.archived_at IS NOT NULL;`)).recordset[0]; if (!row)
        throw new ApiError(404, "document_not_found", "Document not found."); const versionId = row.current_version_id == null ? null : Number(row.current_version_id), status = String(row.restored_status); if (versionId) {
        const version = new sql.Request(transaction);
        version.input("id", sql.BigInt, versionId);
        version.input("status", sql.NVarChar(30), status);
        await version.query(`UPDATE dbo.knowledge_document_versions SET status=@status WHERE id=@id AND status=N'Archived';`);
    } const update = new sql.Request(transaction); update.input("id", sql.BigInt, id); update.input("status", sql.NVarChar(30), status); update.input("actor", sql.BigInt, actor.id); await update.query(`UPDATE dbo.knowledge_documents SET current_status=@status,archived_at=NULL,archived_by=NULL,updated_by=@actor,updated_at=SYSUTCDATETIME() WHERE id=@id;`); await auditKnowledge(transaction, { documentId: id, versionId, actor, action: "Restore", before: { status: "Archived" }, after: { status }, reason }); return { id, status }; }); });
}
//# sourceMappingURL=knowledge-workflow.js.map