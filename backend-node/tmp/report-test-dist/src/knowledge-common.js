import sql from "mssql/msnodesqlv8.js";
import { ApiError } from "./errors.js";
import { permissionFor } from "./schedule-service.js";
export const DOCUMENT_TYPES = ["Controlled Document", "Working Document", "Knowledge Article", "Presentation", "Template", "Project Document", "Supplier Document", "External Reference"];
export const CONFIDENTIALITIES = ["Company", "Department Only", "Project Team Only", "Management Only", "Confidential", "Restricted"];
export const ARTICLE_TYPES = ["How-to", "Troubleshooting", "FAQ", "Technical Note", "Best Practice", "Design Guideline", "Lessons Learned", "Root Cause Analysis", "Training Note"];
export const RELATION_TYPES = { Inquiry: "inquiries", Project: "projects", Estimate: "estimates", BOM: "boms", PR: "mat_prs", PO: "mat_pos", GoodsReceipt: "grns", MaterialIssue: "mirs", ItemMaster: "mat_items", Supplier: "suppliers", KnowledgeArticle: "knowledge_articles", Customer: "customers" };
export const KNOWLEDGE_VISIBILITY = `(
  d.owner_id=@me OR @can_manage=1 OR d.confidentiality=N'Company'
  OR (d.confidentiality=N'Department Only' AND d.department_code=@my_department AND LEN(d.department_code)>0)
  OR (d.confidentiality=N'Project Team Only' AND EXISTS(
    SELECT 1 FROM dbo.knowledge_document_relations kr INNER JOIN dbo.projects project ON project.id=kr.entity_id AND kr.entity_type=N'Project'
    WHERE kr.document_id=d.id AND (project.manager_id=@me OR project.lead_engineer_id=@me OR EXISTS(SELECT 1 FROM dbo.project_members pm WHERE pm.project_id=project.id AND pm.user_id=@me))))
  OR EXISTS(SELECT 1 FROM dbo.knowledge_document_permissions kp LEFT JOIN dbo.users pu ON pu.id=@me
    WHERE (kp.document_id=d.id OR kp.category_id=d.category_id) AND (
      (kp.subject_type=N'User' AND kp.subject_user_id=@me) OR (kp.subject_type=N'Role' AND kp.subject_role_id=pu.role_id)
      OR (kp.subject_type=N'Department' AND kp.subject_department_code=@my_department)
      OR (kp.subject_type=N'Project' AND EXISTS(SELECT 1 FROM dbo.projects project WHERE project.id=kp.subject_project_id AND (project.manager_id=@me OR project.lead_engineer_id=@me OR EXISTS(SELECT 1 FROM dbo.project_members pm WHERE pm.project_id=project.id AND pm.user_id=@me)))))))`;
export const ARTICLE_VISIBILITY = `(
  a.owner_id=@me OR @can_manage=1 OR a.confidentiality=N'Company'
  OR (a.confidentiality=N'Department Only' AND ao.department=@my_department AND LEN(ao.department)>0)
  OR EXISTS(SELECT 1 FROM dbo.knowledge_document_permissions kp LEFT JOIN dbo.users pu ON pu.id=@me
    WHERE (kp.article_id=a.id OR kp.category_id=a.category_id) AND (
      (kp.subject_type=N'User' AND kp.subject_user_id=@me) OR (kp.subject_type=N'Role' AND kp.subject_role_id=pu.role_id)
      OR (kp.subject_type=N'Department' AND kp.subject_department_code=@my_department)
      OR (kp.subject_type=N'Project' AND EXISTS(SELECT 1 FROM dbo.projects project WHERE project.id=kp.subject_project_id AND (project.manager_id=@me OR project.lead_engineer_id=@me OR EXISTS(SELECT 1 FROM dbo.project_members pm WHERE pm.project_id=project.id AND pm.user_id=@me)))))))`;
export function bindKnowledgeVisibility(request, actor, canManage) {
    request.input("me", sql.BigInt, actor.id);
    request.input("my_department", sql.NVarChar(200), actor.department ?? "");
    request.input("can_manage", sql.Bit, canManage);
}
export async function canManageKnowledge(database, actor) {
    return permissionFor(database, actor.role, "knowledge.manage_permissions");
}
export async function auditKnowledge(transaction, input) {
    const request = new sql.Request(transaction);
    request.input("document", sql.BigInt, input.documentId ?? null);
    request.input("version", sql.BigInt, input.versionId ?? null);
    request.input("article", sql.BigInt, input.articleId ?? null);
    request.input("actor", sql.BigInt, input.actor.id);
    request.input("role", sql.NVarChar(100), input.actor.role ?? "");
    request.input("action", sql.NVarChar(40), input.action);
    request.input("before", sql.NVarChar(sql.MAX), input.before == null ? null : typeof input.before === "string" ? input.before : JSON.stringify(input.before));
    request.input("after", sql.NVarChar(sql.MAX), input.after == null ? null : typeof input.after === "string" ? input.after : JSON.stringify(input.after));
    request.input("reason", sql.NVarChar(1000), (input.reason ?? "").slice(0, 1000));
    request.input("related_type", sql.NVarChar(30), input.relatedEntityType ?? null);
    request.input("related_id", sql.BigInt, input.relatedEntityId ?? null);
    await request.query(`INSERT INTO dbo.knowledge_audit_events(document_id,document_version_id,article_id,actor_id,actor_role,action,before_json,after_json,reason,related_entity_type,related_entity_id) VALUES(@document,@version,@article,@actor,@role,@action,@before,@after,@reason,@related_type,@related_id);`);
}
export async function demandDocumentEditor(transaction, documentId, actor, canManage) {
    const request = new sql.Request(transaction);
    request.input("id", sql.BigInt, documentId);
    request.input("me", sql.BigInt, actor.id);
    request.input("manage", sql.Bit, canManage);
    const row = (await request.query(`SELECT COUNT_BIG(*) count FROM dbo.knowledge_documents d LEFT JOIN dbo.users me ON me.id=@me WHERE d.id=@id AND (d.owner_id=@me OR @manage=1 OR EXISTS(SELECT 1 FROM dbo.knowledge_document_permissions p WHERE p.document_id=d.id AND p.permission_level IN(N'Edit',N'Manage') AND ((p.subject_type=N'User' AND p.subject_user_id=@me) OR (p.subject_type=N'Role' AND p.subject_role_id=me.role_id) OR (p.subject_type=N'Department' AND p.subject_department_code=me.department) OR (p.subject_type=N'Project' AND (EXISTS(SELECT 1 FROM dbo.projects project WHERE project.id=p.subject_project_id AND (project.manager_id=@me OR project.lead_engineer_id=@me)) OR EXISTS(SELECT 1 FROM dbo.project_members pm WHERE pm.project_id=p.subject_project_id AND pm.user_id=@me))))));`)).recordset[0];
    if (Number(row?.count ?? 0) !== 1)
        throw new ApiError(404, "document_not_found", "Document was not found or you cannot edit it.");
}
export async function readKnowledgeVersion(transaction, versionId) {
    const request = new sql.Request(transaction);
    request.input("version", sql.BigInt, versionId);
    const row = (await request.query(`SELECT document_id,status,created_by FROM dbo.knowledge_document_versions WITH (UPDLOCK,HOLDLOCK) WHERE id=@version;`)).recordset[0];
    if (!row)
        throw new ApiError(404, "version_not_found", "Revision was not found.");
    return { documentId: Number(row.document_id), status: row.status, createdBy: Number(row.created_by) };
}
export async function setKnowledgeStatus(transaction, documentId, versionId, status) {
    const version = new sql.Request(transaction);
    version.input("status", sql.NVarChar(30), status);
    version.input("version", sql.BigInt, versionId);
    await version.query(`UPDATE dbo.knowledge_document_versions SET status=@status WHERE id=@version;`);
    const document = new sql.Request(transaction);
    document.input("status", sql.NVarChar(30), status);
    document.input("version", sql.BigInt, versionId);
    document.input("document", sql.BigInt, documentId);
    await document.query(`UPDATE dbo.knowledge_documents SET current_version_id=@version,current_status=@status,updated_at=SYSUTCDATETIME() WHERE id=@document;`);
}
export async function issueKnowledgeNumber(transaction, prefix, scope) {
    const request = new sql.Request(transaction);
    request.input("prefix", sql.NVarChar(10), prefix);
    request.input("scope_code", sql.NVarChar(20), scope);
    request.output("document_number", sql.NVarChar(40));
    const result = await request.execute("dbo.issue_knowledge_document_number");
    return String(result.output.document_number);
}
export function safeStoredName(fileName) {
    const cleaned = [...fileName.replace(/[<>:"/\\|?*]/g, "_")]
        .map((character) => (character.charCodeAt(0) <= 31 ? "_" : character))
        .join("")
        .trim();
    return cleaned || "document";
}
//# sourceMappingURL=knowledge-common.js.map