import sql from "mssql/msnodesqlv8.js";
import { issueDocumentNumber } from "../document-number.js";
import { ApiError } from "../errors.js";
import { bodyObject, optionalBodyText, optionalPositiveLong, parseDateOnly, parseRowVersion, positiveLong, requiredInteger } from "../http.js";
import { insertMaterialAudit } from "../material-audit.js";
import { demandProjectScope, isProjectElevated } from "../project-scope.js";
function todayIn(timeZone) {
    const parts = new Intl.DateTimeFormat("en-GB", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date());
    const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
    return `${values.year}-${values.month}-${values.day}`;
}
function quantity(value) {
    if (typeof value !== "number" || !Number.isFinite(value) || value < 0.0001 || value > 1_000_000_000)
        throw new ApiError(400, "validation_failed", "Quantity must be between 0.0001 and 1000000000.");
    if (!value.toString().toLowerCase().includes("e") && (value.toString().split(".")[1]?.length ?? 0) > 4)
        throw new ApiError(400, "validation_failed", "Quantity cannot have more than 4 decimal places.");
    return value;
}
async function header(transaction, id) {
    const request = new sql.Request(transaction);
    request.input("id", sql.BigInt, id);
    const row = (await request.query(`SELECT id,bom_no,revision,status,project_id,estimate_id FROM dbo.boms WITH (UPDLOCK,HOLDLOCK) WHERE id=@id AND deleted_at IS NULL;`)).recordset[0];
    if (!row)
        throw new ApiError(404, "bom_not_found", "BOM not found.");
    return row;
}
export function registerBomRoutes(app, config, database, users) {
    app.get("/api/v1/boms", async (request) => {
        await users.demandPermission(request, "procurement.read");
        const actor = await users.required(request);
        const projectId = optionalPositiveLong(request.query.projectId, "Project id");
        const result = await database.query(`SELECT b.id,b.bom_no,b.revision,b.status,b.project_id,p.project_no,p.name project_name,
      b.estimate_id,e.estimate_no,e.revision estimate_revision,b.created_at,cu.name created_by_name,b.released_at,ru.name released_by_name,
      (SELECT COUNT(*) FROM dbo.bom_lines l WHERE l.bom_id=b.id AND l.deleted_at IS NULL) line_count,
      (SELECT COALESCE(SUM(l.qty_required*l.est_unit_cost),0) FROM dbo.bom_lines l WHERE l.bom_id=b.id AND l.deleted_at IS NULL) bom_budget,b.row_version
      FROM dbo.boms b INNER JOIN dbo.projects p ON p.id=b.project_id INNER JOIN dbo.estimates e ON e.id=b.estimate_id
      INNER JOIN dbo.users cu ON cu.id=b.created_by LEFT JOIN dbo.users ru ON ru.id=b.released_by WHERE b.deleted_at IS NULL
      AND (@project IS NULL OR b.project_id=@project) AND (@elevated=1 OR p.manager_id=@actor OR p.lead_engineer_id=@actor
        OR EXISTS(SELECT 1 FROM dbo.project_members m WHERE m.project_id=p.id AND m.user_id=@actor)) ORDER BY b.id DESC;`, (r) => {
            r.input("project", sql.BigInt, projectId);
            r.input("actor", sql.BigInt, actor.id);
            r.input("elevated", sql.Bit, isProjectElevated(actor));
        });
        return result.recordset.map((row) => ({ id: Number(row.id), number: row.bom_no, revision: Number(row.revision), status: row.status, projectId: Number(row.project_id),
            projectNumber: row.project_no, projectName: row.project_name, estimateId: Number(row.estimate_id), estimateNumber: row.estimate_no, estimateRevision: Number(row.estimate_revision),
            createdAt: row.created_at, createdByName: row.created_by_name, releasedAt: row.released_at, releasedByName: row.released_by_name,
            lineCount: Number(row.line_count), bomBudget: Number(row.bom_budget), rowVersion: row.row_version.toString("base64") }));
    });
    app.get("/api/v1/boms/:id", async (request) => {
        await users.demandPermission(request, "procurement.read");
        const actor = await users.required(request);
        const id = positiveLong(request.params.id, "BOM id");
        const scoped = await database.query(`SELECT project_id FROM dbo.boms WHERE id=@id AND deleted_at IS NULL;`, (r) => r.input("id", sql.BigInt, id));
        const projectId = scoped.recordset[0] ? Number(scoped.recordset[0].project_id) : 0;
        if (!projectId)
            throw new ApiError(404, "bom_not_found", "BOM not found.");
        await demandProjectScope(database, actor, projectId);
        const result = await database.query(`SELECT b.bom_no,b.revision,b.status,b.project_id,p.project_no,p.name project_name,b.estimate_id,
      e.estimate_no,e.revision estimate_revision,b.row_version,t.material_total FROM dbo.boms b INNER JOIN dbo.projects p ON p.id=b.project_id
      INNER JOIN dbo.estimates e ON e.id=b.estimate_id LEFT JOIN dbo.v_estimate_totals t ON t.estimate_id=e.id WHERE b.id=@id AND b.deleted_at IS NULL;
      SELECT l.id,l.section_code,l.item_id,i.item_code,i.part_no,l.description,i.brand,l.qty_required,l.unit,l.est_unit_cost,l.customer_supplied_qty,l.non_stock,
        l.estimate_line_id,ci.item_code estimate_item_code,l.owner_id,u.name owner_name,l.sort_order,l.row_version,
        COALESCE(vb.usable,0) usable,COALESCE(vb.reserved,0) reserved,COALESCE(vb.available,0) available,COALESCE(vb.quarantine,0) quarantine,
        COALESCE((SELECT SUM(r.qty) FROM dbo.reservations r WHERE r.bom_line_id=l.id AND r.status IN(N'Active',N'Consumed')),0) allocated,
        COALESCE((SELECT SUM(r.qty) FROM dbo.reservations r WHERE r.bom_line_id=l.id AND r.status=N'Active'),0) active_reserved,
        COALESCE((SELECT SUM(CASE WHEN pol.qty>COALESCE(gr.received_qty,0) THEN pol.qty-COALESCE(gr.received_qty,0) ELSE 0 END)
          FROM dbo.mat_po_lines pol INNER JOIN dbo.mat_pos po ON po.id=pol.po_id AND po.deleted_at IS NULL AND po.status IN(N'Ordered',N'Partially Received')
          OUTER APPLY(SELECT SUM(gl.received_qty) received_qty FROM dbo.grn_lines gl INNER JOIN dbo.grns g ON g.id=gl.grn_id AND g.status=N'Confirmed' WHERE gl.po_line_id=pol.id) gr
          WHERE pol.bom_line_id=l.id),0) on_order,
        COALESCE((SELECT SUM(prl.qty) FROM dbo.mat_pr_lines prl INNER JOIN dbo.mat_prs pr ON pr.id=prl.pr_id AND pr.deleted_at IS NULL
          AND pr.status IN(N'Draft',N'In Approval',N'Approved') WHERE prl.bom_line_id=l.id),0) on_open_pr,
        COALESCE((SELECT SUM(ml.issued_qty-ml.returned_qty) FROM dbo.mir_lines ml INNER JOIN dbo.mirs m ON m.id=ml.mir_id
          AND m.status IN(N'Issued',N'Received',N'Completed') WHERE ml.bom_line_id=l.id),0) net_issued
      FROM dbo.bom_lines l LEFT JOIN dbo.mat_items i ON i.id=l.item_id LEFT JOIN dbo.v_item_balances vb ON vb.item_id=l.item_id
      LEFT JOIN dbo.cost_items ci ON ci.id=l.estimate_line_id INNER JOIN dbo.users u ON u.id=l.owner_id
      WHERE l.bom_id=@id AND l.deleted_at IS NULL ORDER BY l.section_code,l.sort_order,l.id;`, (r) => r.input("id", sql.BigInt, id));
        const h = result.recordsets[0]?.[0];
        if (!h)
            throw new ApiError(404, "bom_not_found", "BOM not found.");
        const lines = (result.recordsets[1] ?? []).map((raw) => {
            const row = raw;
            const required = Number(row.qty_required);
            const customer = Number(row.customer_supplied_qty);
            const nonStock = Boolean(row.non_stock);
            const allocated = Number(row.allocated);
            const active = Number(row.active_reserved);
            const onOrder = Number(row.on_order);
            const onOpenPr = Number(row.on_open_pr);
            const issued = Number(row.net_issued);
            const covered = Math.max(allocated, issued + active);
            const purchaseRequired = nonStock ? 0 : Math.max(0, required - covered - customer - onOrder - onOpenPr);
            return { id: Number(row.id), sectionCode: row.section_code, itemId: row.item_id === null ? null : Number(row.item_id), itemCode: row.item_code,
                partNumber: row.part_no, description: row.description, brand: row.brand, quantityRequired: required, unit: row.unit, estimatedUnitCost: Number(row.est_unit_cost),
                customerSuppliedQuantity: customer, nonStock, estimateLineId: row.estimate_line_id === null ? null : Number(row.estimate_line_id), estimateItemCode: row.estimate_item_code,
                ownerId: Number(row.owner_id), ownerName: row.owner_name, sortOrder: Number(row.sort_order), rowVersion: row.row_version.toString("base64"),
                onHand: Number(row.usable) + Number(row.quarantine), reserved: Number(row.reserved), available: Number(row.available), allocated, activeReserved: active,
                onOrder, onOpenPr, netIssued: issued, purchaseRequired, budget: required * Number(row.est_unit_cost) };
        });
        return { bom: { id, number: h.bom_no, revision: Number(h.revision), status: h.status, projectId: Number(h.project_id), projectNumber: h.project_no,
                projectName: h.project_name, estimateId: Number(h.estimate_id), estimateNumber: h.estimate_no, estimateRevision: Number(h.estimate_revision),
                rowVersion: h.row_version.toString("base64"), approvedMaterialBudget: Number(h.material_total ?? 0) }, lines };
    });
    app.post("/api/v1/boms", async (request, reply) => {
        await users.demandPermission(request, "procurement.request");
        const actor = await users.required(request);
        const body = bodyObject(request.body);
        const projectId = requiredInteger(body.projectId, "Project", 1);
        const today = todayIn(config.businessTimeZone);
        const created = await database.transaction(async (transaction) => {
            await demandProjectScope(database, actor, projectId, transaction);
            const lookup = new sql.Request(transaction);
            lookup.input("project", sql.BigInt, projectId);
            const estimate = (await lookup.query(`SELECT e.id,e.revision,e.estimate_no,e.status
        FROM dbo.projects p WITH (UPDLOCK,HOLDLOCK) INNER JOIN dbo.estimates e WITH (UPDLOCK,HOLDLOCK) ON e.id=p.estimate_id AND e.deleted_at IS NULL
        WHERE p.id=@project AND p.deleted_at IS NULL;`)).recordset[0];
            if (!estimate)
                throw new ApiError(409, "estimate_missing", "This project has no linked estimate to generate a BOM from.");
            if (!["approved", "locked"].includes(estimate.status.toLowerCase()))
                throw new ApiError(409, "estimate_not_approved", `A BOM can only be generated from an approved or locked estimate; this one is '${estimate.status}'.`);
            const existing = new sql.Request(transaction);
            existing.input("project", sql.BigInt, projectId);
            const current = (await existing.query(`SELECT TOP(1) bom_no FROM dbo.boms WITH (UPDLOCK,HOLDLOCK) WHERE project_id=@project AND deleted_at IS NULL;`)).recordset[0];
            if (current)
                throw new ApiError(409, "bom_exists", `${current.bom_no} already exists for this project. Create a revision instead.`);
            const number = await issueDocumentNumber(transaction, "BOM", today);
            const insert = new sql.Request(transaction);
            insert.input("number", sql.NVarChar(30), number);
            insert.input("project", sql.BigInt, projectId);
            insert.input("estimate", sql.BigInt, Number(estimate.id));
            insert.input("actor", sql.BigInt, actor.id);
            const bom = (await insert.query(`INSERT INTO dbo.boms(bom_no,revision,project_id,estimate_id,status,created_by,updated_by)
        OUTPUT inserted.id,inserted.row_version VALUES(@number,1,@project,@estimate,N'Draft',@actor,@actor);`)).recordset[0];
            const id = Number(bom.id);
            const copy = new sql.Request(transaction);
            copy.input("bom", sql.BigInt, id);
            copy.input("estimate", sql.BigInt, Number(estimate.id));
            copy.input("revision", sql.Int, estimate.revision);
            copy.input("actor", sql.BigInt, actor.id);
            const copied = await copy.query(`INSERT INTO dbo.bom_lines(bom_id,section_code,sort_order,item_id,estimate_line_id,description,qty_required,unit,est_unit_cost,customer_supplied_qty,owner_id,non_stock,created_by,updated_by)
        SELECT @bom,CASE ci.category_code WHEN '01' THEN N'HW.STD' WHEN '02' THEN N'SW' WHEN '03' THEN N'HW.EL' WHEN '04' THEN N'HW.ME' WHEN '05' THEN N'HW.STD' ELSE N'SVC' END,
        ROW_NUMBER() OVER(ORDER BY ci.category_code,ci.id),mi.id,ci.id,ci.description,ci.qty,ci.unit,ci.unit_cost,0,ci.owner_id,CASE WHEN mi.id IS NULL THEN 1 ELSE 0 END,@actor,@actor
        FROM dbo.cost_items ci INNER JOIN dbo.estimates e ON e.id=ci.estimate_id AND e.revision=ci.revision LEFT JOIN dbo.mat_items mi ON mi.item_code=ci.item_code AND mi.deleted_at IS NULL AND mi.is_active=1
        WHERE ci.estimate_id=@estimate AND ci.revision=@revision AND ci.deleted_at IS NULL AND ci.qty>0;`);
            const lineCount = copied.rowsAffected[0] ?? 0;
            if (!lineCount)
                throw new ApiError(409, "estimate_has_no_lines", "The finalized estimate revision has no cost lines to generate a BOM from.");
            await insertMaterialAudit(transaction, actor, "Generated BOM from estimate", "BOM", id, number, null, { estimate: estimate.estimate_no, estimateRevision: estimate.revision, lines: lineCount }, { projectId });
            return { id, number, revision: 1, status: "Draft", lineCount, rowVersion: bom.row_version.toString("base64") };
        });
        return reply.status(201).header("Location", `/api/v1/boms/${created.id}`).send(created);
    });
    app.post("/api/v1/boms/:id/release", async (request) => {
        await users.demandPermission(request, "procurement.approve");
        const actor = await users.required(request);
        const id = positiveLong(request.params.id, "BOM id");
        const body = bodyObject(request.body);
        const version = parseRowVersion(body.rowVersion);
        const comment = optionalBodyText(body.comment, 20_000, "Comment");
        return database.transaction(async (transaction) => {
            const current = await header(transaction, id);
            await demandProjectScope(database, actor, Number(current.project_id), transaction);
            if (current.status !== "Draft")
                throw new ApiError(409, "bom_not_draft", `Only a draft BOM can be released; this one is '${current.status}'.`);
            const update = new sql.Request(transaction);
            update.input("actor", sql.BigInt, actor.id);
            update.input("id", sql.BigInt, id);
            update.input("version", sql.VarBinary(8), version);
            const row = (await update.query(`UPDATE dbo.boms SET status=N'Released',released_at=SYSUTCDATETIME(),released_by=@actor,updated_by=@actor,updated_at=SYSUTCDATETIME()
        OUTPUT inserted.row_version WHERE id=@id AND deleted_at IS NULL AND row_version=@version;`)).recordset[0];
            if (!row)
                throw new ApiError(409, "concurrency_conflict", "This BOM changed. Reload and try again.");
            await insertMaterialAudit(transaction, actor, "Released BOM", "BOM", id, current.bom_no, { status: current.status }, { status: "Released" }, { projectId: Number(current.project_id), reason: comment, approverId: actor.id });
            return { id, status: "Released", rowVersion: row.row_version.toString("base64") };
        });
    });
    app.post("/api/v1/boms/:id/reservations", async (request, reply) => {
        await users.demandPermission(request, "procurement.request");
        const actor = await users.required(request);
        const id = positiveLong(request.params.id, "BOM id");
        const body = bodyObject(request.body);
        const lineId = requiredInteger(body.bomLineId, "BOM line", 1);
        const requested = quantity(body.quantity);
        const requiredDate = parseDateOnly(body.requiredDate, "Required date", true);
        const created = await database.transaction(async (transaction) => {
            const current = await header(transaction, id);
            const projectId = Number(current.project_id);
            await demandProjectScope(database, actor, projectId, transaction);
            if (current.status !== "Released")
                throw new ApiError(409, "bom_not_released", `Stock can only be reserved against a released BOM; this one is '${current.status}'.`);
            const lookup = new sql.Request(transaction);
            lookup.input("line", sql.BigInt, lineId);
            lookup.input("bom", sql.BigInt, id);
            const row = (await lookup.query(`SELECT l.item_id,i.item_code,l.qty_required,l.customer_supplied_qty,
        COALESCE((SELECT SUM(r.qty) FROM dbo.reservations r WITH (UPDLOCK,HOLDLOCK) WHERE r.bom_line_id=l.id AND r.status IN(N'Active',N'Consumed')),0) allocated,
        COALESCE((SELECT SUM(r.qty) FROM dbo.reservations r WITH (UPDLOCK,HOLDLOCK) WHERE r.bom_line_id=l.id AND r.status=N'Active'),0) active_reserved,
        COALESCE((SELECT SUM(ml.issued_qty-ml.returned_qty) FROM dbo.mir_lines ml WITH (UPDLOCK,HOLDLOCK) INNER JOIN dbo.mirs m WITH (UPDLOCK,HOLDLOCK)
          ON m.id=ml.mir_id AND m.status IN(N'Issued',N'Received',N'Completed') WHERE ml.bom_line_id=l.id),0) net_issued,
        COALESCE((SELECT SUM(t.qty) FROM dbo.stock_txns t WITH (UPDLOCK,HOLDLOCK) WHERE t.item_id=l.item_id AND t.bucket=N'stock'),0)-
        COALESCE((SELECT SUM(r.qty) FROM dbo.reservations r WITH (UPDLOCK,HOLDLOCK) WHERE r.item_id=l.item_id AND r.status=N'Active'),0) available
        FROM dbo.bom_lines l WITH (UPDLOCK,HOLDLOCK) INNER JOIN dbo.mat_items i ON i.id=l.item_id WHERE l.id=@line AND l.bom_id=@bom AND l.deleted_at IS NULL AND l.non_stock=0;`)).recordset[0];
            if (!row)
                throw new ApiError(404, "bom_line_not_found", "This BOM line does not exist or is not a stock line.");
            const itemId = Number(row.item_id);
            const itemCode = String(row.item_code);
            const available = Number(row.available);
            const covered = Math.max(Number(row.allocated), Number(row.net_issued) + Number(row.active_reserved));
            const remaining = Math.max(0, Number(row.qty_required) - Number(row.customer_supplied_qty) - covered);
            if (requested > remaining)
                throw new ApiError(409, "quantity_exceeds_bom_demand", `Only ${remaining} ${itemCode} is still required by this BOM line.`, { remainingDemand: remaining, requested });
            if (requested > available)
                throw new ApiError(409, "insufficient_stock", `Only ${available} of ${itemCode} is available to reserve.`, { available });
            const insert = new sql.Request(transaction);
            insert.input("item", sql.BigInt, itemId);
            insert.input("project", sql.BigInt, projectId);
            insert.input("line", sql.BigInt, lineId);
            insert.input("qty", sql.Decimal(19, 4), requested);
            insert.input("required_date", sql.Date, requiredDate);
            insert.input("actor", sql.BigInt, actor.id);
            const reservation = (await insert.query(`INSERT INTO dbo.reservations(item_id,project_id,bom_line_id,qty,required_date,owner_id,status) OUTPUT inserted.id VALUES(@item,@project,@line,@qty,@required_date,@actor,N'Active');`)).recordset[0];
            const reservationId = Number(reservation.id);
            await insertMaterialAudit(transaction, actor, "Reserved stock for project", "Reservation", reservationId, itemCode, { available }, { reserved: requested, remaining: available - requested }, { quantity: requested, projectId, reason: "BOM allocation" });
            return { id: reservationId, itemId, quantity: requested, available: available - requested, remainingDemand: remaining - requested };
        });
        return reply.status(201).header("Location", `/api/v1/boms/${id}/reservations/${created.id}`).send(created);
    });
    app.post("/api/v1/boms/:id/reservations/:reservationId/release", async (request) => {
        await users.demandPermission(request, "procurement.request");
        const actor = await users.required(request);
        const p = request.params;
        const id = positiveLong(p.id, "BOM id");
        const reservationId = positiveLong(p.reservationId, "Reservation id");
        return database.transaction(async (transaction) => {
            const current = await header(transaction, id);
            const projectId = Number(current.project_id);
            await demandProjectScope(database, actor, projectId, transaction);
            const update = new sql.Request(transaction);
            update.input("reservation", sql.BigInt, reservationId);
            update.input("bom", sql.BigInt, id);
            const row = (await update.query(`UPDATE r SET r.status=N'Released',r.updated_at=SYSUTCDATETIME() OUTPUT inserted.qty,i.item_code
        FROM dbo.reservations r INNER JOIN dbo.mat_items i ON i.id=r.item_id INNER JOIN dbo.bom_lines l ON l.id=r.bom_line_id
        WHERE r.id=@reservation AND l.bom_id=@bom AND r.status=N'Active';`)).recordset[0];
            if (!row)
                throw new ApiError(409, "reservation_not_active", "This reservation is not active on this BOM.");
            const released = Number(row.qty);
            await insertMaterialAudit(transaction, actor, "Released reservation", "Reservation", reservationId, row.item_code, { status: "Active", quantity: released }, { status: "Released" }, { quantity: released, projectId });
            return { id: reservationId, status: "Released", quantity: released };
        });
    });
}
//# sourceMappingURL=boms.js.map