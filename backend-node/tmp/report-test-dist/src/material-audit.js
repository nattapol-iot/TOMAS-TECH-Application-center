import sql from "mssql/msnodesqlv8.js";
export async function insertMaterialAudit(transaction, actor, action, entityType, entityId, entityNumber, before, after, options = {}) {
    const request = new sql.Request(transaction);
    request.input("actor", sql.BigInt, actor.id);
    request.input("actor_role", sql.NVarChar(50), actor.role);
    request.input("action", sql.NVarChar(100), action);
    request.input("entity_type", sql.NVarChar(50), entityType);
    request.input("entity_id", sql.BigInt, entityId);
    request.input("entity_no", sql.NVarChar(50), entityNumber);
    request.input("before", sql.NVarChar(sql.MAX), before === null ? null : JSON.stringify(before));
    request.input("after", sql.NVarChar(sql.MAX), after === null ? null : JSON.stringify(after));
    request.input("qty", sql.Decimal(19, 4), options.quantity ?? null);
    request.input("project_id", sql.BigInt, options.projectId ?? null);
    request.input("reason", sql.NVarChar(sql.MAX), options.reason ?? null);
    request.input("attachment", sql.NVarChar(1000), options.attachmentStorageKey ?? null);
    request.input("approver", sql.BigInt, options.approverId ?? null);
    await request.query(`INSERT INTO dbo.mat_audit(actor_id,actor_role,action,entity_type,entity_id,entity_no,before_json,after_json,qty,project_id,reason,attachment_storage_key,approver_id)
    VALUES(@actor,@actor_role,@action,@entity_type,@entity_id,@entity_no,@before,@after,@qty,@project_id,@reason,@attachment,@approver);`);
}
//# sourceMappingURL=material-audit.js.map