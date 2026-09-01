import sql from "mssql/msnodesqlv8.js";
import { insertAudit } from "../audit.js";
import { issueDocumentNumber } from "../document-number.js";
import { ApiError } from "../errors.js";
import { bodyObject, clampedInteger, dateOnly, firstQueryValue, optionalBodyText, optionalPositiveLong, optionalText, parseDateOnly, parseRowVersion, positiveLong, requiredInteger } from "../http.js";
function todayIn(timeZone) {
    const parts = new Intl.DateTimeFormat("en-GB", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date());
    const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
    return `${values.year}-${values.month}-${values.day}`;
}
function addYears(value, years) {
    const date = new Date(`${value}T00:00:00.000Z`);
    date.setUTCFullYear(date.getUTCFullYear() + years);
    return date.toISOString().slice(0, 10);
}
function optionalNonnegativeInteger(value, label) {
    const raw = firstQueryValue(value);
    if (raw === undefined || raw === "")
        return null;
    if (!/^\d+$/.test(raw) || !Number.isSafeInteger(Number(raw)))
        throw new ApiError(400, "validation_failed", `${label} is invalid.`);
    return Number(raw);
}
function percentage(value, label) {
    if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > 100) {
        throw new ApiError(400, "validation_failed", `${label} must be between 0 and 100.`);
    }
    if (!value.toString().includes("e") && (value.toString().split(".")[1]?.length ?? 0) > 4) {
        throw new ApiError(400, "validation_failed", `${label} cannot have more than 4 decimal places.`);
    }
    return value;
}
function managerOverride(actor) {
    return actor.role === "Engineering Manager" || actor.role === "Admin";
}
async function validationIssues(database, estimateId, transaction) {
    const statement = `SELECT code,message,entity_type,entity_id FROM dbo.fn_estimate_validation(@estimate_id) ORDER BY code,entity_id;`;
    const map = (rows) => rows.map((row) => ({
        code: row.code, message: row.message, entityType: row.entity_type, entityId: Number(row.entity_id),
    }));
    if (transaction) {
        const request = new sql.Request(transaction);
        request.input("estimate_id", sql.BigInt, estimateId);
        return map((await request.query(statement)).recordset);
    }
    return map((await database.query(statement, (request) => request.input("estimate_id", sql.BigInt, estimateId))).recordset);
}
async function snapshotRevision(transaction, estimateId, revision, reason, status, actorId) {
    const request = new sql.Request(transaction);
    request.input("estimate_id", sql.BigInt, estimateId);
    request.input("revision", sql.Int, revision);
    request.input("reason", sql.NVarChar(100), reason);
    request.input("snapshot_status", sql.NVarChar(50), status);
    request.input("actor", sql.BigInt, actorId);
    const result = await request.query(`
    DECLARE @snapshot nvarchar(max)=(SELECT e.estimate_no estimateNumber,e.inquiry_id inquiryId,e.customer_id customerId,
      e.project_name projectName,e.project_type projectType,e.owner_id ownerId,e.revision,e.created_date createdDate,
      e.due_date dueDate,e.status,e.progress,e.contingency_rate contingencyRate,e.created_by createdBy,e.updated_by updatedBy,
      e.created_at createdAt,e.updated_at updatedAt,@reason reviewComment,
      JSON_QUERY((SELECT t.material_total material,t.engineering_total engineering,t.outsource_total outsource,
        t.transportation_total transportation,t.accommodation_total accommodation,t.other_total other,t.base_total subtotal,
        t.contingency_total contingency,t.total FROM dbo.v_estimate_totals t WHERE t.estimate_id=e.id FOR JSON PATH,WITHOUT_ARRAY_WRAPPER)) totals
      FROM dbo.estimates e WHERE e.id=@estimate_id AND e.revision=@revision FOR JSON PATH,WITHOUT_ARRAY_WRAPPER);
    INSERT INTO dbo.estimate_revisions(estimate_id,revision,reason,description,created_by,reviewed_by,reviewed_at,status,total)
    OUTPUT inserted.id SELECT e.id,e.revision,@reason,@snapshot,@actor,@actor,SYSUTCDATETIME(),@snapshot_status,t.total
    FROM dbo.estimates e INNER JOIN dbo.v_estimate_totals t ON t.estimate_id=e.id WHERE e.id=@estimate_id AND e.revision=@revision;
  `);
    if (!result.recordset[0])
        throw new ApiError(409, "revision_snapshot_failed", "The current estimate revision could not be snapshotted.");
}
async function updateInquiry(transaction, inquiryId, status, progress, actorId) {
    const request = new sql.Request(transaction);
    request.input("status", sql.NVarChar(50), status);
    request.input("progress", sql.Decimal(5, 2), progress);
    request.input("actor", sql.BigInt, actorId);
    request.input("id", sql.BigInt, inquiryId);
    const result = await request.query(`UPDATE dbo.inquiries SET status=@status,progress=@progress,updated_by=@actor,updated_at=SYSUTCDATETIME() WHERE id=@id AND deleted_at IS NULL;`);
    if (result.rowsAffected[0] !== 1)
        throw new ApiError(409, "inquiry_update_failed", "The linked inquiry could not be updated.");
}
async function ensureRevisionSnapshot(transaction, estimateId, revision, reason, status, actorId) {
    const lookup = new sql.Request(transaction);
    lookup.input("estimate_id", sql.BigInt, estimateId);
    lookup.input("revision", sql.Int, revision);
    const snapshotExists = (await lookup.query(`SELECT CASE WHEN EXISTS(
    SELECT 1 FROM dbo.estimate_revisions WITH(UPDLOCK,HOLDLOCK) WHERE estimate_id=@estimate_id AND revision=@revision
  ) THEN CAST(1 AS bit) ELSE CAST(0 AS bit) END snapshot_exists;`)).recordset[0]?.snapshot_exists;
    if (!snapshotExists)
        await snapshotRevision(transaction, estimateId, revision, reason, status, actorId);
}
async function cloneRevisionLines(transaction, estimateId, currentRevision, nextRevision, actorId) {
    const clone = new sql.Request(transaction);
    clone.input("estimate_id", sql.BigInt, estimateId);
    clone.input("current_revision", sql.Int, currentRevision);
    clone.input("next_revision", sql.Int, nextRevision);
    clone.input("actor", sql.BigInt, actorId);
    await clone.query(`
    INSERT INTO dbo.cost_items(estimate_id,revision,category_code,category,subcategory,module,item_code,description,brand,model,specification,supplier_id,qty,unit,unit_cost,price_source,reference_no,reference_project,price_date,remark,owner_id,status,created_by,updated_by)
    SELECT estimate_id,@next_revision,category_code,category,subcategory,module,item_code,description,brand,model,specification,supplier_id,qty,unit,unit_cost,price_source,reference_no,reference_project,price_date,remark,owner_id,status,@actor,@actor FROM dbo.cost_items WITH(HOLDLOCK) WHERE estimate_id=@estimate_id AND revision=@current_revision AND deleted_at IS NULL;
    DECLARE @copiedManhours TABLE(old_id bigint,new_id bigint);
    MERGE dbo.manhour_lines AS target
    USING (SELECT * FROM dbo.manhour_lines WITH(HOLDLOCK) WHERE estimate_id=@estimate_id AND revision=@current_revision AND deleted_at IS NULL) AS source ON 1=0
    WHEN NOT MATCHED THEN INSERT(estimate_id,revision,package,activity,department,level,cost_type,provider,supplier_id,quotation_no,price_date,engineers,man_days,hours_per_day,daily_rate,owner_id,remark,created_by,updated_by)
    VALUES(source.estimate_id,@next_revision,source.package,source.activity,source.department,source.level,source.cost_type,source.provider,source.supplier_id,source.quotation_no,source.price_date,source.engineers,source.man_days,source.hours_per_day,source.daily_rate,source.owner_id,source.remark,@actor,@actor)
    OUTPUT source.id,inserted.id INTO @copiedManhours;
    INSERT dbo.audit_log(actor_id,entity_type,entity_id,entity_no,action,after_json)
    SELECT @actor,N'ManhourLine',copied.new_id,a.entity_no,N'Created',JSON_MODIFY(a.after_json,'$.copiedFromLineId',copied.old_id)
    FROM @copiedManhours copied CROSS APPLY (
      SELECT TOP(1) entity_no,after_json FROM dbo.audit_log
      WHERE entity_type=N'ManhourLine' AND entity_id=copied.old_id AND action=N'Created'
        AND JSON_VALUE(after_json,'$.kind')=N'manhour' AND LEN(JSON_VALUE(after_json,'$.sourceHash'))=64
      ORDER BY id
    ) a;
    INSERT INTO dbo.expense_lines(estimate_id,revision,package,expense_type,description,cost_type,supplier_id,reference_no,qty,unit,unit_cost,owner_id,remark,created_by,updated_by)
    SELECT estimate_id,@next_revision,package,expense_type,description,cost_type,supplier_id,reference_no,qty,unit,unit_cost,owner_id,remark,@actor,@actor FROM dbo.expense_lines WITH(HOLDLOCK) WHERE estimate_id=@estimate_id AND revision=@current_revision AND deleted_at IS NULL;
    INSERT INTO dbo.other_cost_lines(estimate_id,revision,category,description,qty,unit,unit_cost,remark,created_by,updated_by)
    SELECT estimate_id,@next_revision,category,description,qty,unit,unit_cost,remark,@actor,@actor FROM dbo.other_cost_lines WITH(HOLDLOCK) WHERE estimate_id=@estimate_id AND revision=@current_revision AND deleted_at IS NULL;
  `);
}
async function transition(request, id, permission, targetStatus, targetProgress, inquiryStatus, inquiryProgress, allowedStatuses, action, requireOwner, forbidOwner, database, users) {
    await users.demandPermission(request, permission);
    const actor = await users.required(request);
    const body = bodyObject(request.body);
    const rowVersion = parseRowVersion(body.rowVersion);
    const comment = optionalBodyText(body.comment, 20_000, "Workflow comment");
    return database.transaction(async (transaction) => {
        const lookup = new sql.Request(transaction);
        lookup.input("id", sql.BigInt, id);
        const current = (await lookup.query(`
      SELECT e.estimate_no,e.status,e.progress,e.revision,e.owner_id,e.inquiry_id,i.inquiry_no,i.status inquiry_status,i.progress inquiry_progress
      FROM dbo.estimates e WITH (UPDLOCK,HOLDLOCK) INNER JOIN dbo.inquiries i WITH (UPDLOCK,HOLDLOCK) ON i.id=e.inquiry_id
      WHERE e.id=@id AND e.deleted_at IS NULL AND i.deleted_at IS NULL;
    `)).recordset[0];
        if (!current)
            throw new ApiError(404, "estimate_not_found", "Estimate or its linked inquiry was not found.");
        if (!allowedStatuses.some((status) => status.toLowerCase() === current.status.toLowerCase())) {
            throw new ApiError(409, "invalid_transition", `Cannot move an estimate from '${current.status}' to '${targetStatus}'.`);
        }
        const ownerId = Number(current.owner_id);
        if (requireOwner && ownerId !== actor.id && !managerOverride(actor))
            throw new ApiError(403, "estimate_owner_required", "Only the estimate owner, an engineering manager or an administrator can submit this estimate.");
        if (forbidOwner && ownerId === actor.id)
            throw new ApiError(403, "self_approval_forbidden", "The estimate owner cannot approve their own estimate. Another approver must decide it.");
        const issues = await validationIssues(database, id, transaction);
        if (issues.length)
            throw new ApiError(422, "estimate_invalid", "The estimate has critical validation errors.", issues);
        const update = new sql.Request(transaction);
        update.input("status", sql.NVarChar(50), targetStatus);
        update.input("progress", sql.Decimal(5, 2), targetProgress);
        update.input("actor", sql.BigInt, actor.id);
        update.input("lock_estimate", sql.Bit, action === "Approved");
        update.input("id", sql.BigInt, id);
        update.input("row_version", sql.VarBinary(8), rowVersion);
        const updated = (await update.query(`
      UPDATE dbo.estimates SET status=@status,progress=@progress,
        locked_at=CASE WHEN @lock_estimate=1 THEN SYSUTCDATETIME() ELSE locked_at END,
        locked_by=CASE WHEN @lock_estimate=1 THEN @actor ELSE locked_by END,updated_by=@actor,updated_at=SYSUTCDATETIME()
      OUTPUT inserted.row_version WHERE id=@id AND row_version=@row_version;
    `)).recordset[0];
        if (!updated)
            throw new ApiError(409, "concurrency_conflict", "This estimate was changed by another user. Reload and try again.");
        if (action === "Approved")
            await snapshotRevision(transaction, id, current.revision, "Approved", "Approved", actor.id);
        const inquiryId = Number(current.inquiry_id);
        await updateInquiry(transaction, inquiryId, inquiryStatus, inquiryProgress, actor.id);
        await insertAudit(transaction, actor.id, "Estimate", id, current.estimate_no, action, { revision: current.revision, status: current.status, progress: Number(current.progress) }, { revision: current.revision, status: targetStatus, progress: targetProgress, comment });
        await insertAudit(transaction, actor.id, "Inquiry", inquiryId, current.inquiry_no, `Estimate ${action.toLowerCase()}`, { status: current.inquiry_status, progress: Number(current.inquiry_progress) }, { status: inquiryStatus, progress: inquiryProgress, estimateRevision: current.revision });
        return { id, revision: current.revision, status: targetStatus, progress: targetProgress, rowVersion: updated.row_version.toString("base64") };
    });
}
export function registerEstimateRoutes(app, config, database, users) {
    app.get("/api/v1/estimates", async (request) => {
        await users.demandPermission(request, "estimate.read");
        const query = request.query;
        const page = clampedInteger(query.page, 1, 1, Number.MAX_SAFE_INTEGER);
        const pageSize = clampedInteger(query.pageSize, 25, 1, 100);
        const search = optionalText(query.search, 200, "Search");
        const status = optionalText(query.status, 50, "Status");
        const customerId = optionalPositiveLong(query.customerId, "Customer id");
        const projectType = optionalText(query.projectType, 100, "Project type");
        const ownerId = optionalPositiveLong(query.ownerId, "Owner id");
        const department = optionalText(query.department, 100, "Department");
        const revision = optionalNonnegativeInteger(query.revision, "Revision");
        const result = await database.query(`
      SELECT e.id,e.estimate_no,i.inquiry_no,e.customer_id,c.name customer_name,e.project_name,e.project_type,
        e.owner_id,u.name owner_name,e.revision,e.due_date,e.status,e.progress,t.material_total,t.engineering_total,
        t.outsource_total,t.transportation_total,t.accommodation_total,t.other_total,t.contingency_total,t.total,
        e.created_date,e.updated_at,e.row_version,COUNT_BIG(*) OVER() total_count
      FROM dbo.estimates e INNER JOIN dbo.inquiries i ON i.id=e.inquiry_id INNER JOIN dbo.customers c ON c.id=e.customer_id
      INNER JOIN dbo.users u ON u.id=e.owner_id INNER JOIN dbo.v_estimate_totals t ON t.estimate_id=e.id
      WHERE e.deleted_at IS NULL AND (@status IS NULL OR e.status=@status) AND (@customer_id IS NULL OR e.customer_id=@customer_id)
        AND (@project_type IS NULL OR e.project_type=@project_type) AND (@owner_id IS NULL OR e.owner_id=@owner_id)
        AND (@department IS NULL OR u.department=@department) AND (@revision IS NULL OR e.revision=@revision)
        AND (@search IS NULL OR e.estimate_no LIKE N'%'+@search+N'%' OR i.inquiry_no LIKE N'%'+@search+N'%'
          OR e.project_name LIKE N'%'+@search+N'%' OR c.name LIKE N'%'+@search+N'%')
      ORDER BY e.updated_at DESC,e.id DESC OFFSET @offset ROWS FETCH NEXT @page_size ROWS ONLY;
    `, (sqlRequest) => {
            sqlRequest.input("status", sql.NVarChar(50), status);
            sqlRequest.input("search", sql.NVarChar(200), search);
            sqlRequest.input("customer_id", sql.BigInt, customerId);
            sqlRequest.input("project_type", sql.NVarChar(100), projectType);
            sqlRequest.input("owner_id", sql.BigInt, ownerId);
            sqlRequest.input("department", sql.NVarChar(100), department);
            sqlRequest.input("revision", sql.Int, revision);
            sqlRequest.input("offset", sql.Int, (page - 1) * pageSize);
            sqlRequest.input("page_size", sql.Int, pageSize);
        });
        return { items: result.recordset.map((row) => ({ id: Number(row.id), number: row.estimate_no, inquiryNumber: row.inquiry_no,
                customerId: Number(row.customer_id), customerName: row.customer_name, projectName: row.project_name, projectType: row.project_type,
                ownerId: Number(row.owner_id), ownerName: row.owner_name, revision: row.revision, createdDate: dateOnly(row.created_date), dueDate: dateOnly(row.due_date),
                status: row.status, progress: Number(row.progress), materialTotal: Number(row.material_total), engineeringTotal: Number(row.engineering_total),
                outsourceTotal: Number(row.outsource_total), transportationTotal: Number(row.transportation_total), accommodationTotal: Number(row.accommodation_total),
                otherTotal: Number(row.other_total), contingencyTotal: Number(row.contingency_total), total: Number(row.total), updatedAt: row.updated_at,
                rowVersion: row.row_version.toString("base64") })), page, pageSize, total: Number(result.recordset[0]?.total_count ?? 0) };
    });
    app.post("/api/v1/estimates", async (request, reply) => {
        await users.demandPermission(request, "estimate.write");
        const actor = await users.required(request);
        const body = bodyObject(request.body);
        const inquiryId = requiredInteger(body.inquiryId, "Inquiry", 1);
        const ownerId = requiredInteger(body.ownerId, "Owner", 1);
        const contingencyRate = percentage(body.contingencyRate, "Contingency rate");
        const dueDate = parseDateOnly(body.dueDate, "Due date");
        if (!managerOverride(actor) && ownerId !== actor.id)
            throw new ApiError(403, "estimate_owner_required", "Only an engineering manager or administrator can create an estimate for another owner.");
        const today = todayIn(config.businessTimeZone);
        if (dueDate < today || dueDate > addYears(today, 5))
            throw new ApiError(400, "validation_failed", "Due date must be between today and five years from today.");
        const created = await database.transaction(async (transaction) => {
            const lookup = new sql.Request(transaction);
            lookup.input("id", sql.BigInt, inquiryId);
            const inquiry = (await lookup.query(`
        SELECT customer_id,project_name,project_type,inquiry_no,estimate_owner_id,status,estimate_id FROM dbo.inquiries WITH (UPDLOCK,HOLDLOCK) WHERE id=@id AND deleted_at IS NULL;
      `)).recordset[0];
            if (!inquiry)
                throw new ApiError(404, "inquiry_not_found", "Inquiry not found.");
            if (inquiry.status !== "New" || inquiry.estimate_id !== null)
                throw new ApiError(409, "inquiry_not_eligible", "Only a new inquiry without an existing estimate can be converted to an estimate.");
            if (!managerOverride(actor) && Number(inquiry.estimate_owner_id) !== actor.id)
                throw new ApiError(403, "inquiry_owner_required", "Only the assigned inquiry owner, an engineering manager or an administrator can create its estimate.");
            const ownerRequest = new sql.Request(transaction);
            ownerRequest.input("owner_id", sql.BigInt, ownerId);
            const validOwner = (await ownerRequest.query(`SELECT CASE WHEN EXISTS(SELECT 1 FROM dbo.users u INNER JOIN dbo.roles r ON r.id=u.role_id
        WHERE u.id=@owner_id AND u.is_active=1 AND u.deleted_at IS NULL AND r.code IN(N'Engineer',N'Engineering Manager',N'Admin')) THEN CAST(1 AS bit) ELSE CAST(0 AS bit) END allowed;`)).recordset[0]?.allowed;
            if (!validOwner)
                throw new ApiError(400, "validation_failed", "The selected estimate owner must be an active engineer, engineering manager or administrator.");
            const number = await issueDocumentNumber(transaction, "EST", today);
            const insert = new sql.Request(transaction);
            insert.input("number", sql.NVarChar(30), number);
            insert.input("inquiry_id", sql.BigInt, inquiryId);
            insert.input("customer_id", sql.BigInt, Number(inquiry.customer_id));
            insert.input("project_name", sql.NVarChar(300), inquiry.project_name);
            insert.input("project_type", sql.NVarChar(100), inquiry.project_type);
            insert.input("owner_id", sql.BigInt, ownerId);
            insert.input("today", sql.Date, today);
            insert.input("due_date", sql.Date, dueDate);
            insert.input("contingency_rate", sql.Decimal(9, 4), contingencyRate);
            insert.input("actor", sql.BigInt, actor.id);
            const row = (await insert.query(`INSERT INTO dbo.estimates(estimate_no,inquiry_id,customer_id,project_name,project_type,owner_id,
        revision,created_date,due_date,status,progress,contingency_rate,created_by,updated_by) OUTPUT inserted.id,inserted.row_version
        VALUES(@number,@inquiry_id,@customer_id,@project_name,@project_type,@owner_id,0,@today,@due_date,N'Draft',0,@contingency_rate,@actor,@actor);`)).recordset[0];
            const id = Number(row.id);
            const updateInquiryRequest = new sql.Request(transaction);
            updateInquiryRequest.input("estimate_id", sql.BigInt, id);
            updateInquiryRequest.input("actor", sql.BigInt, actor.id);
            updateInquiryRequest.input("inquiry_id", sql.BigInt, inquiryId);
            const changed = await updateInquiryRequest.query(`UPDATE dbo.inquiries SET estimate_id=@estimate_id,status=N'Estimating',updated_by=@actor,updated_at=SYSUTCDATETIME()
        WHERE id=@inquiry_id AND status=N'New' AND estimate_id IS NULL AND deleted_at IS NULL;`);
            if (changed.rowsAffected[0] !== 1)
                throw new ApiError(409, "inquiry_not_eligible", "The inquiry can no longer be converted to an estimate.");
            await insertAudit(transaction, actor.id, "Estimate", id, number, "Created from inquiry", inquiry.inquiry_no, { inquiryId, ownerId, dueDate, contingencyRate });
            return { id, number, rowVersion: row.row_version.toString("base64") };
        });
        return reply.status(201).header("Location", `/api/v1/estimates/${created.id}`).send(created);
    });
    app.get("/api/v1/estimates/:id/validation", async (request) => {
        await users.demandPermission(request, "estimate.read");
        const id = positiveLong(request.params.id, "Estimate id");
        const exists = await database.query(`SELECT CASE WHEN EXISTS(SELECT 1 FROM dbo.estimates WHERE id=@id AND deleted_at IS NULL) THEN CAST(1 AS bit) ELSE CAST(0 AS bit) END estimate_exists;`, (sqlRequest) => sqlRequest.input("id", sql.BigInt, id));
        if (!exists.recordset[0]?.estimate_exists)
            throw new ApiError(404, "estimate_not_found", "Estimate not found.");
        const issues = await validationIssues(database, id);
        return { estimateId: id, valid: issues.length === 0, issues };
    });
    app.post("/api/v1/estimates/:id/submit", async (request) => transition(request, positiveLong(request.params.id, "Estimate id"), "estimate.write", "Engineering Review", 90, "Engineering Review", 90, ["Draft", "Engineering Input", "Revision Required"], "Submitted", true, false, database, users));
    app.post("/api/v1/estimates/:id/approve", async (request) => transition(request, positiveLong(request.params.id, "Estimate id"), "estimate.approve", "Approved", 100, "Approved", 100, ["Engineering Review"], "Approved", false, true, database, users));
    app.post("/api/v1/estimates/:id/create-revision", async (request) => {
        await users.demandPermission(request, "estimate.write");
        const actor = await users.required(request);
        const id = positiveLong(request.params.id, "Estimate id");
        const body = bodyObject(request.body);
        const rowVersion = parseRowVersion(body.rowVersion);
        const reason = optionalBodyText(body.comment, 100, "Revision reason");
        if (!reason)
            throw new ApiError(400, "validation_failed", "Revision reason is required.");
        return database.transaction(async (transaction) => {
            const lookup = new sql.Request(transaction);
            lookup.input("id", sql.BigInt, id);
            const current = (await lookup.query(`
        SELECT e.estimate_no,e.status,e.progress,e.revision,e.inquiry_id,e.row_version,i.inquiry_no,i.status inquiry_status,i.progress inquiry_progress,e.owner_id
        FROM dbo.estimates e WITH(UPDLOCK,HOLDLOCK) INNER JOIN dbo.inquiries i WITH(UPDLOCK,HOLDLOCK) ON i.id=e.inquiry_id
        WHERE e.id=@id AND e.deleted_at IS NULL AND i.deleted_at IS NULL;
      `)).recordset[0];
            if (!current)
                throw new ApiError(404, "estimate_not_found", "Estimate or its linked inquiry was not found.");
            if (!current.row_version.equals(rowVersion))
                throw new ApiError(409, "concurrency_conflict", "This estimate was changed by another user. Reload and try again.");
            if (!["approved", "locked"].includes(current.status.toLowerCase()))
                throw new ApiError(409, "invalid_transition", `Cannot create a revision while the estimate is '${current.status}'.`);
            if (Number(current.owner_id) !== actor.id && !managerOverride(actor))
                throw new ApiError(403, "estimate_owner_required", "Only the estimate owner, an engineering manager or an administrator can create a revision.");
            await ensureRevisionSnapshot(transaction, id, current.revision, reason, current.status, actor.id);
            const nextRevision = current.revision + 1;
            const update = new sql.Request(transaction);
            update.input("next_revision", sql.Int, nextRevision);
            update.input("actor", sql.BigInt, actor.id);
            update.input("id", sql.BigInt, id);
            update.input("current_revision", sql.Int, current.revision);
            update.input("row_version", sql.VarBinary(8), rowVersion);
            const updated = (await update.query(`UPDATE dbo.estimates SET revision=@next_revision,status=N'Revision Required',progress=75,
        locked_at=NULL,locked_by=NULL,updated_by=@actor,updated_at=SYSUTCDATETIME() OUTPUT inserted.row_version
        WHERE id=@id AND revision=@current_revision AND row_version=@row_version;`)).recordset[0];
            if (!updated)
                throw new ApiError(409, "concurrency_conflict", "This estimate was changed by another user. Reload and try again.");
            await cloneRevisionLines(transaction, id, current.revision, nextRevision, actor.id);
            const inquiryId = Number(current.inquiry_id);
            await updateInquiry(transaction, inquiryId, "Estimating", 75, actor.id);
            await insertAudit(transaction, actor.id, "Estimate", id, current.estimate_no, "Revision created", { revision: current.revision, status: current.status, progress: Number(current.progress) }, { revision: nextRevision, status: "Revision Required", progress: 75, reason });
            await insertAudit(transaction, actor.id, "Inquiry", inquiryId, current.inquiry_no, "Estimate revision created", { status: current.inquiry_status, progress: Number(current.inquiry_progress) }, { status: "Estimating", progress: 75, estimateRevision: nextRevision });
            return { id, revision: nextRevision, status: "Revision Required", progress: 75, rowVersion: updated.row_version.toString("base64") };
        });
    });
    app.post("/api/v1/estimates/:id/request-revision", async (request) => {
        await users.demandPermission(request, "estimate.approve");
        const actor = await users.required(request);
        const id = positiveLong(request.params.id, "Estimate id");
        const body = bodyObject(request.body);
        const rowVersion = parseRowVersion(body.rowVersion);
        const reason = optionalBodyText(body.comment, 100, "Revision reason");
        if (!reason)
            throw new ApiError(400, "validation_failed", "Revision reason is required.");
        return database.transaction(async (transaction) => {
            const lookup = new sql.Request(transaction);
            lookup.input("id", sql.BigInt, id);
            const current = (await lookup.query(`
        SELECT e.estimate_no,e.status,e.progress,e.revision,e.inquiry_id,e.row_version,i.inquiry_no,i.status inquiry_status,i.progress inquiry_progress,e.owner_id
        FROM dbo.estimates e WITH(UPDLOCK,HOLDLOCK) INNER JOIN dbo.inquiries i WITH(UPDLOCK,HOLDLOCK) ON i.id=e.inquiry_id
        WHERE e.id=@id AND e.deleted_at IS NULL AND i.deleted_at IS NULL;
      `)).recordset[0];
            if (!current)
                throw new ApiError(404, "estimate_not_found", "Estimate or its linked inquiry was not found.");
            if (!current.row_version.equals(rowVersion))
                throw new ApiError(409, "concurrency_conflict", "This estimate was changed by another user. Reload and try again.");
            if (current.status.toLowerCase() !== "engineering review")
                throw new ApiError(409, "invalid_transition", `Cannot request a revision while the estimate is '${current.status}'.`);
            if (Number(current.owner_id) === actor.id)
                throw new ApiError(403, "self_revision_forbidden", "The estimate owner cannot request a revision on their own estimate. Another approver must decide it.");
            await snapshotRevision(transaction, id, current.revision, reason, "Revision Required", actor.id);
            const nextRevision = current.revision + 1;
            const update = new sql.Request(transaction);
            update.input("next_revision", sql.Int, nextRevision);
            update.input("actor", sql.BigInt, actor.id);
            update.input("id", sql.BigInt, id);
            update.input("current_revision", sql.Int, current.revision);
            update.input("row_version", sql.VarBinary(8), rowVersion);
            const updated = (await update.query(`UPDATE dbo.estimates SET revision=@next_revision,status=N'Revision Required',progress=75,
        locked_at=NULL,locked_by=NULL,updated_by=@actor,updated_at=SYSUTCDATETIME() OUTPUT inserted.row_version
        WHERE id=@id AND revision=@current_revision AND row_version=@row_version;`)).recordset[0];
            if (!updated)
                throw new ApiError(409, "concurrency_conflict", "This estimate was changed by another user. Reload and try again.");
            await cloneRevisionLines(transaction, id, current.revision, nextRevision, actor.id);
            const inquiryId = Number(current.inquiry_id);
            await updateInquiry(transaction, inquiryId, "Estimating", 75, actor.id);
            await insertAudit(transaction, actor.id, "Estimate", id, current.estimate_no, "Revision requested", { revision: current.revision, status: current.status, progress: Number(current.progress) }, { revision: nextRevision, status: "Revision Required", progress: 75, reason });
            await insertAudit(transaction, actor.id, "Inquiry", inquiryId, current.inquiry_no, "Estimate revision requested", { status: current.inquiry_status, progress: Number(current.inquiry_progress) }, { status: "Estimating", progress: 75, estimateRevision: nextRevision });
            return { id, revision: nextRevision, status: "Revision Required", progress: 75, rowVersion: updated.row_version.toString("base64") };
        });
    });
}
//# sourceMappingURL=estimates.js.map