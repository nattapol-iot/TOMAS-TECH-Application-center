import sql from "mssql/msnodesqlv8.js";
import { insertAudit } from "../audit.js";
import { ApiError } from "../errors.js";
import { bodyObject, optionalBodyText, parseDateOnly, parseRowVersion, positiveLong, requiredInteger, requiredText } from "../http.js";
const editableStatuses = ["Draft", "Engineering Input", "Revision Required"];
const categoryNames = {
    "01": "Hardware", "02": "Software", "03": "Electrical", "04": "Mechanical", "05": "Robot",
    "06": "Engineering", "07": "Outsource", "08": "Transportation", "09": "Accommodation", "10": "Other Cost",
};
const allowedPriceSources = [
    "Supplier Quotation", "Price Library", "Previous Project", "Budgetary", "Previous Estimate",
    "Previous Project Cost", "Purchase Price", "Master Price", "Manual Estimate", "Budgetary Price",
    "Master Template",
];
function decimal(value, minimum, maximum, scale, label) {
    if (typeof value !== "number" || !Number.isFinite(value) || value < minimum || value > maximum) {
        throw new ApiError(400, "validation_failed", `${label} must be between ${minimum} and ${maximum}.`);
    }
    const normalized = value.toString().toLowerCase();
    if (!normalized.includes("e") && (normalized.split(".")[1]?.length ?? 0) > scale) {
        throw new ApiError(400, "validation_failed", `${label} cannot have more than ${scale} decimal places.`);
    }
    return value;
}
function parseCostInput(request, requireLineVersion) {
    const body = bodyObject(request.body);
    const categoryCode = requiredText(body.categoryCode, 2, "Category code").toUpperCase();
    if (!categoryNames[categoryCode])
        throw new ApiError(400, "validation_failed", "Category code is not allowed.");
    const priceSource = requiredText(body.priceSource, 100, "Price source");
    if (!allowedPriceSources.includes(priceSource))
        throw new ApiError(400, "validation_failed", "Price source is not allowed.");
    const quantity = decimal(body.quantity, 0.0001, 1_000_000_000, 4, "Quantity");
    const unitCost = decimal(body.unitCost, 0, 1_000_000_000, 4, "Unit cost");
    if (quantity * unitCost > 999_999_999_999_999) {
        throw new ApiError(400, "validation_failed", "Line total exceeds the supported monetary range.");
    }
    let supplierId = null;
    if (body.supplierId !== null && body.supplierId !== undefined)
        supplierId = requiredInteger(body.supplierId, "Supplier", 1);
    const lineRowVersion = body.lineRowVersion === undefined || body.lineRowVersion === null || body.lineRowVersion === ""
        ? null : parseRowVersion(body.lineRowVersion);
    if (requireLineVersion && !lineRowVersion)
        throw new ApiError(400, "invalid_row_version", "The cost line row version is required.");
    return {
        estimateRowVersion: parseRowVersion(body.estimateRowVersion), lineRowVersion, categoryCode,
        subcategory: optionalBodyText(body.subcategory, 100, "Subcategory") ?? "",
        module: requiredText(body.module, 200, "Module"), itemCode: requiredText(body.itemCode, 100, "Item code"),
        description: requiredText(body.description, 500, "Description"), brand: optionalBodyText(body.brand, 100, "Brand") ?? "",
        model: optionalBodyText(body.model, 200, "Model") ?? "", specification: optionalBodyText(body.specification, 20_000, "Specification"),
        supplierId, quantity, unit: requiredText(body.unit, 50, "Unit"), unitCost, priceSource,
        referenceNumber: optionalBodyText(body.referenceNumber, 200, "Reference number"),
        referenceProject: optionalBodyText(body.referenceProject, 200, "Reference project"),
        priceDate: parseDateOnly(body.priceDate, "Price date", true), remark: optionalBodyText(body.remark, 20_000, "Remark"),
        ownerId: requiredInteger(body.ownerId, "Owner", 1),
    };
}
async function lockEditableEstimate(transaction, id, expected) {
    const request = new sql.Request(transaction);
    request.input("id", sql.BigInt, id);
    const row = (await request.query(`
    SELECT estimate_no,revision,status,row_version,owner_id,due_date FROM dbo.estimates WITH (UPDLOCK,HOLDLOCK)
    WHERE id=@id AND deleted_at IS NULL;
  `)).recordset[0];
    if (!row)
        throw new ApiError(404, "estimate_not_found", "Estimate not found.");
    if (!row.row_version.equals(expected))
        throw new ApiError(409, "concurrency_conflict", "This estimate changed. Reload and try again.");
    if (!editableStatuses.some((status) => status.toLowerCase() === row.status.toLowerCase())) {
        throw new ApiError(409, "estimate_locked", `Cost lines cannot be changed while the estimate is '${row.status}'.`);
    }
    return row;
}
async function validateReferences(transaction, ownerId, supplierId) {
    const request = new sql.Request(transaction);
    request.input("owner_id", sql.BigInt, ownerId);
    request.input("supplier_id", sql.BigInt, supplierId);
    const row = (await request.query(`
    SELECT CASE WHEN EXISTS(SELECT 1 FROM dbo.users u INNER JOIN dbo.roles r ON r.id=u.role_id
      WHERE u.id=@owner_id AND u.is_active=1 AND u.deleted_at IS NULL AND r.code IN(N'Engineer',N'Engineering Manager',N'Admin'))
      THEN CAST(1 AS bit) ELSE CAST(0 AS bit) END owner_valid,
      CASE WHEN @supplier_id IS NULL OR EXISTS(SELECT 1 FROM dbo.suppliers WHERE id=@supplier_id AND is_active=1 AND deleted_at IS NULL)
      THEN CAST(1 AS bit) ELSE CAST(0 AS bit) END supplier_valid;
  `)).recordset[0];
    if (!row.owner_valid)
        throw new ApiError(400, "validation_failed", "The selected cost owner must be an active engineer, engineering manager or administrator.");
    if (!row.supplier_valid)
        throw new ApiError(400, "validation_failed", "The selected supplier is inactive or does not exist.");
}
async function categoryAssignment(transaction, estimateId, revision, categoryCode) {
    const request = new sql.Request(transaction);
    request.input("estimate_id", sql.BigInt, estimateId);
    request.input("revision", sql.Int, revision);
    request.input("section", sql.NVarChar(100), categoryCode);
    return (await request.query(`
    SELECT TOP(1) a.owner_id,a.support_id FROM dbo.estimate_assignments a WITH (UPDLOCK,HOLDLOCK)
    INNER JOIN dbo.estimates e WITH (UPDLOCK,HOLDLOCK) ON e.id=a.estimate_id AND e.revision=@revision AND e.deleted_at IS NULL
    WHERE a.estimate_id=@estimate_id AND (a.section=@section OR (LEFT(a.section,2)=@section AND SUBSTRING(a.section,3,1)=N' '));
  `)).recordset[0] ?? null;
}
async function upsertCategoryAssignment(transaction, estimateId, categoryCode, ownerId, dueDate) {
    const request = new sql.Request(transaction);
    request.input("estimate_id", sql.BigInt, estimateId);
    request.input("section", sql.NVarChar(100), categoryCode);
    request.input("owner_id", sql.BigInt, ownerId);
    request.input("due_date", sql.Date, dueDate);
    await request.query(`UPDATE dbo.estimate_assignments SET progress=CASE WHEN owner_id=@owner_id THEN progress ELSE 0 END,
    status=CASE WHEN owner_id=@owner_id THEN status ELSE N'In Progress' END,owner_id=@owner_id,
    support_id=CASE WHEN support_id=@owner_id THEN NULL ELSE support_id END,due_date=@due_date
    WHERE estimate_id=@estimate_id AND section=@section;
    IF @@ROWCOUNT=0 INSERT INTO dbo.estimate_assignments(estimate_id,section,owner_id,support_id,due_date,status,progress,comment)
      VALUES(@estimate_id,@section,@owner_id,NULL,@due_date,N'In Progress',0,NULL);`);
}
function elevated(actor, estimate) {
    return actor.id === Number(estimate.owner_id) || actor.role === "Engineering Manager" || actor.role === "Admin";
}
function assigned(actor, assignment) {
    return !!assignment && (actor.id === Number(assignment.owner_id) || actor.id === Number(assignment.support_id));
}
async function costSnapshot(transaction, estimateId, revision, lineId, expected, includeDeleted) {
    const request = new sql.Request(transaction);
    request.input("line_id", sql.BigInt, lineId);
    request.input("estimate_id", sql.BigInt, estimateId);
    request.input("revision", sql.Int, revision);
    request.input("include_deleted", sql.Bit, includeDeleted);
    const row = (await request.query(`
    SELECT id,category_code,category,subcategory,module,item_code,description,brand,model,specification,supplier_id,qty,unit,
      unit_cost,price_source,reference_no,reference_project,price_date,remark,owner_id,status,deleted_at,row_version
    FROM dbo.cost_items WITH (UPDLOCK,HOLDLOCK) WHERE id=@line_id AND estimate_id=@estimate_id AND revision=@revision
      AND (@include_deleted=1 OR deleted_at IS NULL);
  `)).recordset[0];
    if (!row || !row.row_version.equals(expected))
        throw new ApiError(409, "concurrency_conflict", "This cost line was changed or removed. Reload and try again.");
    const { row_version, ...values } = row;
    return { ...values, rowVersion: row_version.toString("base64") };
}
function bindCost(request, estimateId, revision, input, actorId) {
    request.input("estimate_id", sql.BigInt, estimateId);
    request.input("revision", sql.Int, revision);
    request.input("category_code", sql.Char(2), input.categoryCode);
    request.input("category", sql.NVarChar(100), categoryNames[input.categoryCode]);
    request.input("subcategory", sql.NVarChar(100), input.subcategory);
    request.input("module", sql.NVarChar(200), input.module);
    request.input("item_code", sql.NVarChar(100), input.itemCode);
    request.input("description", sql.NVarChar(500), input.description);
    request.input("brand", sql.NVarChar(100), input.brand);
    request.input("model", sql.NVarChar(200), input.model);
    request.input("specification", sql.NVarChar(sql.MAX), input.specification);
    request.input("supplier_id", sql.BigInt, input.supplierId);
    request.input("qty", sql.Decimal(19, 4), input.quantity);
    request.input("unit", sql.NVarChar(50), input.unit);
    request.input("unit_cost", sql.Decimal(19, 4), input.unitCost);
    request.input("price_source", sql.NVarChar(100), input.priceSource);
    request.input("reference_no", sql.NVarChar(200), input.referenceNumber);
    request.input("reference_project", sql.NVarChar(200), input.referenceProject);
    request.input("price_date", sql.Date, input.priceDate);
    request.input("remark", sql.NVarChar(sql.MAX), input.remark);
    request.input("owner_id", sql.BigInt, input.ownerId);
    request.input("actor", sql.BigInt, actorId);
}
async function touchEstimate(transaction, id, actorId) {
    const request = new sql.Request(transaction);
    request.input("actor", sql.BigInt, actorId);
    request.input("id", sql.BigInt, id);
    const row = (await request.query(`UPDATE dbo.estimates SET updated_by=@actor,updated_at=SYSUTCDATETIME(),
    progress=CASE WHEN progress<10 THEN 10 ELSE progress END OUTPUT inserted.row_version WHERE id=@id;`)).recordset[0];
    if (!row)
        throw new ApiError(409, "concurrency_conflict", "The estimate could not be updated.");
    return row.row_version;
}
export function registerEstimateCostWriteRoutes(app, database, users) {
    app.post("/api/v1/estimates/:id/cost-items", async (request, reply) => {
        await users.demandPermission(request, "estimate.write");
        const actor = await users.required(request);
        const id = positiveLong(request.params.id, "Estimate id");
        const input = parseCostInput(request, false);
        const created = await database.transaction(async (transaction) => {
            const estimate = await lockEditableEstimate(transaction, id, input.estimateRowVersion);
            await validateReferences(transaction, input.ownerId, input.supplierId);
            if (!elevated(actor, estimate)) {
                const assignment = await categoryAssignment(transaction, id, estimate.revision, input.categoryCode);
                if (!assigned(actor, assignment))
                    throw new ApiError(403, "estimate_section_forbidden", "You may add cost lines only to an estimate section assigned to you.");
                if (input.ownerId !== Number(assignment.owner_id) && input.ownerId !== Number(assignment.support_id)) {
                    throw new ApiError(403, "cost_owner_forbidden", "You cannot assign a cost line to a user outside your assigned section.");
                }
            }
            else
                await upsertCategoryAssignment(transaction, id, input.categoryCode, input.ownerId, estimate.due_date);
            const insert = new sql.Request(transaction);
            bindCost(insert, id, estimate.revision, input, actor.id);
            const row = (await insert.query(`DECLARE @created TABLE(id bigint,row_version binary(8));
        INSERT INTO dbo.cost_items(estimate_id,revision,category_code,category,
        subcategory,module,item_code,description,brand,model,specification,supplier_id,qty,unit,unit_cost,price_source,reference_no,
        reference_project,price_date,remark,owner_id,status,created_by,updated_by) OUTPUT inserted.id,inserted.row_version INTO @created(id,row_version)
        VALUES(@estimate_id,@revision,@category_code,@category,@subcategory,@module,@item_code,@description,@brand,@model,@specification,
        @supplier_id,@qty,@unit,@unit_cost,@price_source,@reference_no,@reference_project,@price_date,@remark,@owner_id,N'Active',@actor,@actor);
        SELECT id,row_version FROM @created;`)).recordset[0];
            const lineId = Number(row.id);
            const estimateVersion = await touchEstimate(transaction, id, actor.id);
            const after = await costSnapshot(transaction, id, estimate.revision, lineId, row.row_version, false);
            await insertAudit(transaction, actor.id, "CostItem", lineId, estimate.estimate_no, "Created", null, after);
            return { id: lineId, rowVersion: row.row_version.toString("base64"), estimateRowVersion: estimateVersion.toString("base64") };
        });
        return reply.status(201).header("Location", `/api/v1/estimates/${id}/cost-items/${created.id}`).send(created);
    });
    app.put("/api/v1/estimates/:id/cost-items/:lineId", async (request) => {
        await users.demandPermission(request, "estimate.write");
        const actor = await users.required(request);
        const params = request.params;
        const id = positiveLong(params.id, "Estimate id");
        const lineId = positiveLong(params.lineId, "Cost line id");
        const input = parseCostInput(request, true);
        return database.transaction(async (transaction) => {
            const estimate = await lockEditableEstimate(transaction, id, input.estimateRowVersion);
            await validateReferences(transaction, input.ownerId, input.supplierId);
            const before = await costSnapshot(transaction, id, estimate.revision, lineId, input.lineRowVersion, false);
            if (!elevated(actor, estimate)) {
                const current = await categoryAssignment(transaction, id, estimate.revision, String(before.category_code));
                if (!assigned(actor, current))
                    throw new ApiError(403, "cost_line_forbidden", "You may update a cost line only while its current category is assigned to you.");
                if (input.ownerId !== Number(before.owner_id))
                    throw new ApiError(403, "cost_owner_forbidden", "Only the estimate owner, an engineering manager or an administrator can reassign a cost line.");
                if (String(before.category_code) !== input.categoryCode && !assigned(actor, await categoryAssignment(transaction, id, estimate.revision, input.categoryCode))) {
                    throw new ApiError(403, "estimate_section_forbidden", "You cannot move a line to an estimate section that is not assigned to you.");
                }
            }
            else
                await upsertCategoryAssignment(transaction, id, input.categoryCode, input.ownerId, estimate.due_date);
            const update = new sql.Request(transaction);
            bindCost(update, id, estimate.revision, input, actor.id);
            update.input("line_id", sql.BigInt, lineId);
            update.input("line_version", sql.VarBinary(8), input.lineRowVersion);
            const row = (await update.query(`DECLARE @updated TABLE(row_version binary(8));
        UPDATE dbo.cost_items SET category_code=@category_code,category=@category,subcategory=@subcategory,
        module=@module,item_code=@item_code,description=@description,brand=@brand,model=@model,specification=@specification,supplier_id=@supplier_id,
        qty=@qty,unit=@unit,unit_cost=@unit_cost,price_source=@price_source,reference_no=@reference_no,reference_project=@reference_project,
        price_date=@price_date,remark=@remark,owner_id=@owner_id,updated_by=@actor,updated_at=SYSUTCDATETIME() OUTPUT inserted.row_version INTO @updated(row_version)
        WHERE id=@line_id AND estimate_id=@estimate_id AND revision=@revision AND deleted_at IS NULL AND row_version=@line_version;
        SELECT row_version FROM @updated;`)).recordset[0];
            if (!row)
                throw new ApiError(409, "concurrency_conflict", "This cost line was changed or removed. Reload and try again.");
            const estimateVersion = await touchEstimate(transaction, id, actor.id);
            const after = await costSnapshot(transaction, id, estimate.revision, lineId, row.row_version, false);
            await insertAudit(transaction, actor.id, "CostItem", lineId, estimate.estimate_no, "Updated", before, after);
            return { id: lineId, rowVersion: row.row_version.toString("base64"), estimateRowVersion: estimateVersion.toString("base64") };
        });
    });
    app.post("/api/v1/estimates/:id/cost-items/:lineId/remove", async (request) => {
        await users.demandPermission(request, "estimate.write");
        const actor = await users.required(request);
        const params = request.params;
        const id = positiveLong(params.id, "Estimate id");
        const lineId = positiveLong(params.lineId, "Cost line id");
        const body = bodyObject(request.body);
        const estimateRowVersion = parseRowVersion(body.estimateRowVersion);
        const lineRowVersion = parseRowVersion(body.lineRowVersion);
        const reason = optionalBodyText(body.reason, 20_000, "Removal reason");
        return database.transaction(async (transaction) => {
            const estimate = await lockEditableEstimate(transaction, id, estimateRowVersion);
            const before = await costSnapshot(transaction, id, estimate.revision, lineId, lineRowVersion, false);
            if (!elevated(actor, estimate) && !assigned(actor, await categoryAssignment(transaction, id, estimate.revision, String(before.category_code)))) {
                throw new ApiError(403, "cost_line_forbidden", "You may remove a cost line only while its current category is assigned to you.");
            }
            const update = new sql.Request(transaction);
            update.input("actor", sql.BigInt, actor.id);
            update.input("line_id", sql.BigInt, lineId);
            update.input("estimate_id", sql.BigInt, id);
            update.input("revision", sql.Int, estimate.revision);
            update.input("line_version", sql.VarBinary(8), lineRowVersion);
            const row = (await update.query(`DECLARE @removed TABLE(row_version binary(8));
        UPDATE dbo.cost_items SET deleted_at=SYSUTCDATETIME(),updated_by=@actor,
        updated_at=SYSUTCDATETIME() OUTPUT inserted.row_version INTO @removed(row_version) WHERE id=@line_id AND estimate_id=@estimate_id AND revision=@revision
        AND deleted_at IS NULL AND row_version=@line_version;
        SELECT row_version FROM @removed;`)).recordset[0];
            if (!row)
                throw new ApiError(409, "concurrency_conflict", "This cost line was changed or removed. Reload and try again.");
            const estimateVersion = await touchEstimate(transaction, id, actor.id);
            const after = await costSnapshot(transaction, id, estimate.revision, lineId, row.row_version, true);
            await insertAudit(transaction, actor.id, "CostItem", lineId, estimate.estimate_no, "Removed", { line: before }, { line: after, removalReason: reason });
            return { id: lineId, estimateRowVersion: estimateVersion.toString("base64") };
        });
    });
    /* Applying a template is a bulk cost-line create, so it runs the same locks and the
       same section checks as one — a template can never write a line the engineer could
       not have typed. The whole module lands in one transaction, or none of it does. */
    app.post("/api/v1/estimates/:id/apply-template", async (request, reply) => {
        await users.demandPermission(request, "estimate.write");
        const actor = await users.required(request);
        const id = positiveLong(request.params.id, "Estimate id");
        const body = bodyObject(request.body);
        const estimateRowVersion = parseRowVersion(body.estimateRowVersion);
        const templateId = requiredInteger(body.templateId, "Template id", 1);
        const moduleName = requiredText(body.module, 200, "Module");
        const modules = requiredInteger(body.modules, "Module count", 1);
        if (modules > 500)
            throw new ApiError(400, "validation_failed", "A single apply cannot exceed 500 modules.");
        const keepPrices = body.keepReferencePrices !== false;
        const ownerId = requiredInteger(body.ownerId, "Owner", 1);
        const applied = await database.transaction(async (transaction) => {
            const estimate = await lockEditableEstimate(transaction, id, estimateRowVersion);
            const templateRequest = new sql.Request(transaction);
            templateRequest.input("template_id", sql.BigInt, templateId);
            const template = (await templateRequest.query(`
        SELECT code,name,revision,status FROM dbo.module_templates WHERE id=@template_id;`)).recordset[0];
            if (!template)
                throw new ApiError(404, "module_template_not_found", "Module template not found.");
            if (template.status === "Retired")
                throw new ApiError(409, "module_template_retired", "A retired template cannot be applied.");
            const linesRequest = new sql.Request(transaction);
            linesRequest.input("template_id", sql.BigInt, templateId);
            const lines = (await linesRequest.query(`SELECT category_code,subcategory,item_code,description,brand,model,specification,supplier_id,qty_per_module,unit,
        ref_unit_cost,ref_price_date,remark FROM dbo.module_template_lines WHERE template_id=@template_id AND deleted_at IS NULL
        ORDER BY sort_order,id;`)).recordset;
            if (!lines.length)
                throw new ApiError(409, "module_template_empty", "This template has no lines to apply.");
            const reference = `${template.code} R${String(template.revision).padStart(2, "0")}`;
            const disciplines = [...new Set(lines.map((line) => line.category_code))];
            for (const discipline of disciplines) {
                if (!elevated(actor, estimate)) {
                    const assignment = await categoryAssignment(transaction, id, estimate.revision, discipline);
                    if (!assigned(actor, assignment)) {
                        throw new ApiError(403, "estimate_section_forbidden", `You may add cost lines only to an estimate section assigned to you (${discipline}).`);
                    }
                    if (ownerId !== Number(assignment.owner_id) && ownerId !== Number(assignment.support_id)) {
                        throw new ApiError(403, "cost_owner_forbidden", "You cannot assign a cost line to a user outside your assigned section.");
                    }
                }
                else
                    await upsertCategoryAssignment(transaction, id, discipline, ownerId, estimate.due_date);
            }
            let created = 0;
            const renamedItemCodes = [];
            for (const line of lines) {
                const supplierId = line.supplier_id === null ? null : Number(line.supplier_id);
                await validateReferences(transaction, ownerId, supplierId);
                const quantity = Number(line.qty_per_module) * modules;
                const unitCost = keepPrices ? Number(line.ref_unit_cost) : 0;
                if (quantity * unitCost > 999_999_999_999_999) {
                    throw new ApiError(400, "validation_failed", `Line ${line.item_code} exceeds the supported monetary range at ${modules} modules.`);
                }
                // Item codes are unique per estimate/revision, not per module. Applying
                // a reusable module twice must allocate another line code, not fail the
                // whole transaction. The estimate lock serializes competing writers and
                // SQL comparison preserves the database's own collation rules.
                const allocate = new sql.Request(transaction);
                allocate.input("estimate_id", sql.BigInt, id);
                allocate.input("revision", sql.Int, estimate.revision);
                allocate.input("base", sql.NVarChar(100), line.item_code);
                const itemCode = (await allocate.query(`
          DECLARE @candidate nvarchar(100)=@base, @suffix int=1;
          WHILE EXISTS (SELECT 1 FROM dbo.cost_items WHERE estimate_id=@estimate_id
            AND revision=@revision AND item_code=@candidate AND deleted_at IS NULL)
          BEGIN
            SET @suffix=@suffix+1;
            SET @candidate=LEFT(@base,100-LEN(CONVERT(nvarchar(20),@suffix))-1)
              +N'-'+CONVERT(nvarchar(20),@suffix);
          END;
          SELECT @candidate AS item_code;
        `)).recordset[0].item_code;
                if (itemCode !== line.item_code)
                    renamedItemCodes.push({ original: line.item_code, applied: itemCode });
                const insert = new sql.Request(transaction);
                bindCost(insert, id, estimate.revision, {
                    estimateRowVersion, lineRowVersion: null, categoryCode: line.category_code, subcategory: line.subcategory,
                    module: moduleName, itemCode, description: line.description, brand: line.brand, model: line.model,
                    specification: line.specification, supplierId, quantity, unit: line.unit, unitCost,
                    priceSource: "Master Template", referenceNumber: reference, referenceProject: template.name,
                    priceDate: keepPrices && line.ref_price_date
                        ? (typeof line.ref_price_date === "string" ? line.ref_price_date.slice(0, 10) : line.ref_price_date.toISOString().slice(0, 10))
                        : null,
                    remark: line.remark, ownerId,
                }, actor.id);
                await insert.query(`INSERT INTO dbo.cost_items(estimate_id,revision,category_code,category,subcategory,module,item_code,
          description,brand,model,specification,supplier_id,qty,unit,unit_cost,price_source,reference_no,reference_project,
          price_date,remark,owner_id,status,created_by,updated_by)
          VALUES(@estimate_id,@revision,@category_code,@category,@subcategory,@module,@item_code,@description,@brand,@model,
          @specification,@supplier_id,@qty,@unit,@unit_cost,@price_source,@reference_no,@reference_project,@price_date,@remark,
          @owner_id,N'Active',@actor,@actor);`);
                created += 1;
            }
            const estimateVersion = await touchEstimate(transaction, id, actor.id);
            await insertAudit(transaction, actor.id, "Estimate", id, estimate.estimate_no, "Module template applied", null, {
                template: reference, templateName: template.name, module: moduleName, modules, lines: created, keepReferencePrices: keepPrices, renamedItemCodes,
            });
            return { lines: created, module: moduleName, reference, estimateRowVersion: estimateVersion.toString("base64") };
        });
        return reply.status(201).send(applied);
    });
}
//# sourceMappingURL=estimate-cost-write.js.map