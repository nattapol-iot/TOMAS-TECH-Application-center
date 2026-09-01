import sql from "mssql/msnodesqlv8.js";
import { issueDocumentNumber } from "../document-number.js";
import { ApiError } from "../errors.js";
import { bodyObject, booleanQuery, oneOf, optionalBodyText, optionalPositiveLong, optionalText, parseDateOnly, parseRowVersion, positiveLong, requiredInteger, requiredText } from "../http.js";
import { insertMaterialAudit } from "../material-audit.js";
import { demandProjectScope, isProjectElevated } from "../project-scope.js";
import { appendStockLedger } from "../stock-ledger.js";
function todayIn(timeZone) { const p = new Intl.DateTimeFormat("en-GB", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date()); const v = Object.fromEntries(p.map((x) => [x.type, x.value])); return `${v.year}-${v.month}-${v.day}`; }
function qty(value) {
    if (typeof value !== "number" || !Number.isFinite(value) || value < 0.0001 || value > 1_000_000_000)
        throw new ApiError(400, "validation_failed", "Quantity is outside the supported range.");
    if (!value.toString().toLowerCase().includes("e") && (value.toString().split(".")[1]?.length ?? 0) > 4)
        throw new ApiError(400, "validation_failed", "Quantity cannot have more than 4 decimal places.");
    return value;
}
async function header(transaction, id) { const request = new sql.Request(transaction); request.input("id", sql.BigInt, id); const row = (await request.query(`SELECT id,mir_no,project_id,requested_by,status FROM dbo.mirs WITH (UPDLOCK,HOLDLOCK) WHERE id=@id;`)).recordset[0]; if (!row)
    throw new ApiError(404, "mir_not_found", "Material issue request not found."); return row; }
function lines(value) {
    if (!Array.isArray(value) || !value.length)
        throw new ApiError(400, "validation_failed", "At least one line is required.");
    if (value.length > 200)
        throw new ApiError(400, "validation_failed", "A request cannot carry more than 200 lines.");
    const seen = new Set();
    return value.map((raw) => {
        const b = bodyObject(raw), bomLineId = requiredInteger(b.bomLineId, "BOM line", 1);
        if (seen.has(bomLineId))
            throw new ApiError(400, "validation_failed", "A BOM line can appear only once on a request.");
        seen.add(bomLineId);
        return { bomLineId, requestedQuantity: qty(b.requestedQuantity), location: optionalBodyText(b.location, 100, "Location"), purpose: optionalBodyText(b.purpose, 20_000, "Purpose") };
    });
}
async function insertLine(transaction, mirId, bomId, line) {
    const lookup = new sql.Request(transaction);
    lookup.input("line", sql.BigInt, line.bomLineId);
    lookup.input("bom", sql.BigInt, bomId);
    const row = (await lookup.query(`SELECT bl.item_id,i.item_code,bl.qty_required,bl.customer_supplied_qty,COALESCE(i.location,N'') location,
    COALESCE((SELECT SUM(ml.issued_qty-ml.returned_qty) FROM dbo.mir_lines ml INNER JOIN dbo.mirs m ON m.id=ml.mir_id AND m.status IN(N'Issued',N'Received') WHERE ml.bom_line_id=bl.id),0) issued,
    COALESCE((SELECT SUM(ml.requested_qty) FROM dbo.mir_lines ml INNER JOIN dbo.mirs m ON m.id=ml.mir_id AND m.status IN(N'Pending Approval',N'Approved',N'Picking') WHERE ml.bom_line_id=bl.id),0) committed
    FROM dbo.bom_lines bl INNER JOIN dbo.mat_items i ON i.id=bl.item_id WHERE bl.id=@line AND bl.bom_id=@bom AND bl.deleted_at IS NULL AND bl.non_stock=0;`)).recordset[0];
    if (!row)
        throw new ApiError(404, "bom_line_not_found", `BOM line ${line.bomLineId} is not a stock line on this BOM.`);
    const allowance = Number(row.qty_required) - Number(row.customer_supplied_qty), issued = Number(row.issued), committed = Number(row.committed), remaining = allowance - issued - committed;
    if (line.requestedQuantity > remaining)
        throw new ApiError(409, "exceeds_bom_quantity", `${row.item_code}: the BOM allows ${allowance}; ${issued} is net issued and ${committed} is already committed to open requests, so only ${Math.max(remaining, 0)} remains.`, { issuable: allowance, previouslyIssued: issued, openCommitted: committed, remaining: Math.max(remaining, 0), requested: line.requestedQuantity });
    const insert = new sql.Request(transaction);
    insert.input("mir", sql.BigInt, mirId);
    insert.input("bom_line", sql.BigInt, line.bomLineId);
    insert.input("item", sql.BigInt, Number(row.item_id));
    insert.input("bom_qty", sql.Decimal(19, 4), allowance);
    insert.input("issued", sql.Decimal(19, 4), issued);
    insert.input("requested", sql.Decimal(19, 4), line.requestedQuantity);
    insert.input("location", sql.NVarChar(100), line.location ?? String(row.location));
    insert.input("purpose", sql.NVarChar(sql.MAX), line.purpose);
    await insert.query(`INSERT INTO dbo.mir_lines(mir_id,bom_line_id,item_id,bom_qty,previously_issued_qty,requested_qty,location,purpose) VALUES(@mir,@bom_line,@item,@bom_qty,@issued,@requested,@location,@purpose);`);
}
async function consumeReservations(transaction, itemId, projectId, quantity) {
    const read = new sql.Request(transaction);
    read.input("item", sql.BigInt, itemId);
    read.input("project", sql.BigInt, projectId);
    const rows = (await read.query(`SELECT id,qty FROM dbo.reservations WITH (UPDLOCK,HOLDLOCK) WHERE item_id=@item AND project_id=@project AND status=N'Active' ORDER BY required_date,id;`)).recordset;
    let remaining = quantity;
    for (const row of rows) {
        if (remaining <= 0)
            break;
        const reservationQty = Number(row.qty), id = Number(row.id);
        if (reservationQty <= remaining) {
            const consume = new sql.Request(transaction);
            consume.input("id", sql.BigInt, id);
            await consume.query(`UPDATE dbo.reservations SET status=N'Consumed',updated_at=SYSUTCDATETIME() WHERE id=@id AND status=N'Active';`);
            remaining -= reservationQty;
        }
        else {
            const split = new sql.Request(transaction);
            split.input("consumed", sql.Decimal(19, 4), remaining);
            split.input("id", sql.BigInt, id);
            await split.query(`UPDATE dbo.reservations SET qty=qty-@consumed,updated_at=SYSUTCDATETIME() WHERE id=@id AND status=N'Active'; INSERT INTO dbo.reservations(item_id,project_id,bom_line_id,qty,required_date,owner_id,status) SELECT item_id,project_id,bom_line_id,@consumed,required_date,owner_id,N'Consumed' FROM dbo.reservations WHERE id=@id;`);
            remaining = 0;
        }
    }
}
export function registerMaterialIssueRoutes(app, config, database, users) {
    app.get("/api/v1/material-issues", async (request) => {
        await users.demandPermission(request, "inventory.read");
        const actor = await users.required(request);
        const q = request.query;
        const projectId = optionalPositiveLong(q.projectId, "Project id"), status = optionalText(q.status, 30, "Status"), mine = booleanQuery(q.mine, false);
        const result = await database.query(`SELECT m.id,m.mir_no,m.project_id,p.project_no,p.name project_name,m.requested_by,ru.name requested_by_name,m.requested_at,m.required_date,m.status,m.approved_by,au.name approved_by_name,m.issued_by,iu.name issued_by_name,m.issued_at,m.received_by,rcu.name received_by_name,m.received_at,COUNT(ml.id) line_count,COALESCE(SUM(ml.requested_qty),0) requested_qty,COALESCE(SUM(ml.issued_qty),0) issued_qty,COALESCE(SUM(ml.returned_qty),0) returned_qty,m.row_version
      FROM dbo.mirs m INNER JOIN dbo.projects p ON p.id=m.project_id INNER JOIN dbo.users ru ON ru.id=m.requested_by LEFT JOIN dbo.users au ON au.id=m.approved_by LEFT JOIN dbo.users iu ON iu.id=m.issued_by LEFT JOIN dbo.users rcu ON rcu.id=m.received_by LEFT JOIN dbo.mir_lines ml ON ml.mir_id=m.id
      WHERE (@project IS NULL OR m.project_id=@project) AND (@status IS NULL OR m.status=@status) AND (@mine=0 OR m.requested_by=@actor) AND (@elevated=1 OR p.manager_id=@actor OR p.lead_engineer_id=@actor OR EXISTS(SELECT 1 FROM dbo.project_members pm WHERE pm.project_id=p.id AND pm.user_id=@actor))
      GROUP BY m.id,m.mir_no,m.project_id,p.project_no,p.name,m.requested_by,ru.name,m.requested_at,m.required_date,m.status,m.approved_by,au.name,m.issued_by,iu.name,m.issued_at,m.received_by,rcu.name,m.received_at,m.row_version ORDER BY m.id DESC;`, (r) => { r.input("project", sql.BigInt, projectId); r.input("status", sql.NVarChar(30), status); r.input("mine", sql.Bit, mine); r.input("actor", sql.BigInt, actor.id); r.input("elevated", sql.Bit, isProjectElevated(actor)); });
        return result.recordset.map((row) => ({ id: Number(row.id), number: row.mir_no, projectId: Number(row.project_id), projectNumber: row.project_no, projectName: row.project_name, requestedById: Number(row.requested_by), requestedByName: row.requested_by_name, requestedAt: row.requested_at, requiredDate: row.required_date, status: row.status, approvedByName: row.approved_by_name, issuedByName: row.issued_by_name, issuedAt: row.issued_at, receivedByName: row.received_by_name, receivedAt: row.received_at, lineCount: Number(row.line_count), requestedQuantity: Number(row.requested_qty), issuedQuantity: Number(row.issued_qty), returnedQuantity: Number(row.returned_qty), rowVersion: row.row_version.toString("base64") }));
    });
    app.get("/api/v1/material-issues/:id", async (request) => {
        await users.demandPermission(request, "inventory.read");
        const actor = await users.required(request);
        const id = positiveLong(request.params.id, "Material issue id");
        const result = await database.query(`SELECT m.id,m.mir_no,m.project_id,p.project_no,p.name project_name,m.requested_by,ru.name requested_by_name,m.requested_at,m.required_date,m.status,m.approved_by,au.name approved_by_name,m.approved_at,m.picked_by,pu.name picked_by_name,m.issued_by,iu.name issued_by_name,m.issued_at,m.received_by,rcu.name received_by_name,m.received_at,m.row_version
      FROM dbo.mirs m INNER JOIN dbo.projects p ON p.id=m.project_id INNER JOIN dbo.users ru ON ru.id=m.requested_by LEFT JOIN dbo.users au ON au.id=m.approved_by LEFT JOIN dbo.users pu ON pu.id=m.picked_by LEFT JOIN dbo.users iu ON iu.id=m.issued_by LEFT JOIN dbo.users rcu ON rcu.id=m.received_by WHERE m.id=@id;
      SELECT ml.id,ml.bom_line_id,ml.item_id,i.item_code,i.part_no,bl.description,ml.bom_qty,ml.previously_issued_qty,ml.requested_qty,ml.issued_qty,ml.returned_qty,ml.location,ml.purpose,bl.unit,ml.row_version,COALESCE(vb.usable,0) usable,COALESCE(vb.available,0) available,
      COALESCE((SELECT SUM(r.qty) FROM dbo.reservations r WHERE r.item_id=ml.item_id AND r.project_id=(SELECT project_id FROM dbo.mirs WHERE id=@id) AND r.status=N'Active'),0) reserved FROM dbo.mir_lines ml INNER JOIN dbo.bom_lines bl ON bl.id=ml.bom_line_id INNER JOIN dbo.mat_items i ON i.id=ml.item_id LEFT JOIN dbo.v_item_balances vb ON vb.item_id=ml.item_id WHERE ml.mir_id=@id ORDER BY ml.id;`, (r) => r.input("id", sql.BigInt, id));
        const h = result.recordsets[0]?.[0];
        if (!h)
            throw new ApiError(404, "mir_not_found", "Material issue request not found.");
        await demandProjectScope(database, actor, Number(h.project_id));
        return { materialIssue: { id: Number(h.id), number: h.mir_no, projectId: Number(h.project_id), projectNumber: h.project_no, projectName: h.project_name, requestedById: Number(h.requested_by), requestedByName: h.requested_by_name, requestedAt: h.requested_at, requiredDate: h.required_date, status: h.status, approvedById: h.approved_by === null ? null : Number(h.approved_by), approvedByName: h.approved_by_name, approvedAt: h.approved_at, pickedByName: h.picked_by_name, issuedById: h.issued_by === null ? null : Number(h.issued_by), issuedByName: h.issued_by_name, issuedAt: h.issued_at, receivedById: h.received_by === null ? null : Number(h.received_by), receivedByName: h.received_by_name, receivedAt: h.received_at, rowVersion: h.row_version.toString("base64") },
            lines: (result.recordsets[1] ?? []).map((raw) => { const row = raw, issued = Number(row.issued_qty), returned = Number(row.returned_qty); return { id: Number(row.id), bomLineId: Number(row.bom_line_id), itemId: Number(row.item_id), itemCode: row.item_code, partNumber: row.part_no, description: row.description, bomQuantity: Number(row.bom_qty), previouslyIssued: Number(row.previously_issued_qty), requestedQuantity: Number(row.requested_qty), issuedQuantity: issued, returnedQuantity: returned, netIssued: issued - returned, location: row.location, purpose: row.purpose, unit: row.unit, rowVersion: row.row_version.toString("base64"), onHand: Number(row.usable), available: Number(row.available), reservedForThisProject: Number(row.reserved) }; }) };
    });
    app.post("/api/v1/material-issues", async (request, reply) => {
        await users.demandPermission(request, "procurement.request");
        const actor = await users.required(request);
        const body = bodyObject(request.body);
        const bomId = requiredInteger(body.bomId, "BOM", 1), requiredDate = parseDateOnly(body.requiredDate, "Required date"), purpose = optionalBodyText(body.purpose, 20_000, "Purpose"), requestLines = lines(body.lines), today = todayIn(config.businessTimeZone);
        const created = await database.transaction(async (transaction) => {
            const lookup = new sql.Request(transaction);
            lookup.input("bom", sql.BigInt, bomId);
            const bom = (await lookup.query(`SELECT project_id,status FROM dbo.boms WITH (UPDLOCK,HOLDLOCK) WHERE id=@bom AND deleted_at IS NULL;`)).recordset[0];
            if (!bom)
                throw new ApiError(404, "bom_not_found", "BOM not found.");
            if (bom.status !== "Released")
                throw new ApiError(409, "bom_not_released", `Material can only be issued against a released BOM; this one is '${bom.status}'.`);
            const projectId = Number(bom.project_id);
            await demandProjectScope(database, actor, projectId, transaction);
            const number = await issueDocumentNumber(transaction, "MIR", today);
            const insert = new sql.Request(transaction);
            insert.input("number", sql.NVarChar(30), number);
            insert.input("project", sql.BigInt, projectId);
            insert.input("actor", sql.BigInt, actor.id);
            insert.input("required", sql.Date, requiredDate);
            const mir = (await insert.query(`INSERT INTO dbo.mirs(mir_no,project_id,requested_by,required_date,status) OUTPUT inserted.id,inserted.row_version VALUES(@number,@project,@actor,@required,N'Pending Approval');`)).recordset[0];
            const id = Number(mir.id);
            for (const line of requestLines)
                await insertLine(transaction, id, bomId, line);
            await insertMaterialAudit(transaction, actor, "Requested material issue", "MIR", id, number, null, { lines: requestLines.length, status: "Pending Approval" }, { quantity: requestLines.reduce((s, x) => s + x.requestedQuantity, 0), projectId, reason: purpose });
            return { id, number, status: "Pending Approval", lineCount: requestLines.length, rowVersion: mir.row_version.toString("base64") };
        });
        return reply.status(201).header("Location", `/api/v1/material-issues/${created.id}`).send(created);
    });
    app.post("/api/v1/material-issues/:id/decide", async (request) => {
        await users.demandPermission(request, "procurement.approve");
        const actor = await users.required(request);
        const id = positiveLong(request.params.id, "Material issue id"), body = bodyObject(request.body), decision = oneOf(requiredText(body.decision, 20, "Decision"), "Decision", ["Approve", "Reject"]), comment = optionalBodyText(body.comment, 20_000, "Comment");
        return database.transaction(async (transaction) => { const h = await header(transaction, id); await demandProjectScope(database, actor, Number(h.project_id), transaction); if (h.status !== "Pending Approval")
            throw new ApiError(409, "mir_not_pending", `This request is '${h.status}' and is not waiting for approval.`); if (Number(h.requested_by) === actor.id)
            throw new ApiError(403, "self_approval_forbidden", "The requester cannot approve their own material issue request."); const overRequest = new sql.Request(transaction); overRequest.input("id", sql.BigInt, id); const over = Boolean((await overRequest.query(`SELECT CASE WHEN EXISTS(SELECT 1 FROM dbo.mir_lines WHERE mir_id=@id AND requested_qty>bom_qty-previously_issued_qty) THEN CAST(1 AS bit) ELSE CAST(0 AS bit) END over_bom;`)).recordset[0].over_bom); if ((decision !== "Approve" || over) && !comment)
            throw new ApiError(400, "comment_required", decision === "Approve" ? "This request exceeds the remaining BOM quantity — a comment is required to approve it." : "A comment is required when rejecting."); const next = decision === "Approve" ? "Approved" : "Rejected"; const update = new sql.Request(transaction); update.input("status", sql.NVarChar(30), next); update.input("approve", sql.Bit, decision === "Approve"); update.input("actor", sql.BigInt, actor.id); update.input("id", sql.BigInt, id); const row = (await update.query(`UPDATE dbo.mirs SET status=@status,approved_by=CASE WHEN @approve=1 THEN @actor ELSE NULL END,approved_at=CASE WHEN @approve=1 THEN SYSUTCDATETIME() ELSE NULL END OUTPUT inserted.row_version WHERE id=@id AND status=N'Pending Approval';`)).recordset[0]; if (!row)
            throw new ApiError(409, "concurrency_conflict", "This request changed. Reload and try again."); await insertMaterialAudit(transaction, actor, `${decision} material issue`, "MIR", id, h.mir_no, { status: "Pending Approval" }, { status: next }, { projectId: Number(h.project_id), reason: comment, approverId: actor.id }); return { id, status: next, rowVersion: row.row_version.toString("base64") }; });
    });
    app.post("/api/v1/material-issues/:id/issue", async (request) => {
        await users.demandPermission(request, "inventory.issue");
        const actor = await users.required(request);
        const id = positiveLong(request.params.id, "Material issue id"), body = bodyObject(request.body), version = parseRowVersion(body.rowVersion), comment = optionalBodyText(body.comment, 20_000, "Workflow comment"), today = todayIn(config.businessTimeZone);
        return database.transaction(async (transaction) => {
            const lock = new sql.Request(transaction);
            lock.input("id", sql.BigInt, id);
            await lock.query(`SELECT b.id FROM dbo.boms b WITH (UPDLOCK,HOLDLOCK) WHERE EXISTS(SELECT 1 FROM dbo.bom_lines bl INNER JOIN dbo.mir_lines ml ON ml.bom_line_id=bl.id WHERE bl.bom_id=b.id AND ml.mir_id=@id) ORDER BY b.id;`);
            const h = await header(transaction, id);
            if (h.status !== "Approved" && h.status !== "Picking")
                throw new ApiError(409, "mir_not_approved", `Material can only be issued against an approved request; this one is '${h.status}'.`);
            const read = new sql.Request(transaction);
            read.input("id", sql.BigInt, id);
            read.input("project", sql.BigInt, Number(h.project_id));
            const issueLines = (await read.query(`SELECT ml.id,ml.item_id,i.item_code,ml.requested_qty,ml.location,i.avg_unit_cost,
      COALESCE((SELECT SUM(t.qty) FROM dbo.stock_txns t WITH (UPDLOCK,HOLDLOCK) WHERE t.item_id=ml.item_id AND t.bucket=N'stock'),0) usable,
      COALESCE((SELECT SUM(r.qty) FROM dbo.reservations r WITH (UPDLOCK,HOLDLOCK) WHERE r.item_id=ml.item_id AND r.project_id=@project AND r.status=N'Active'),0) own_reserved,
      COALESCE((SELECT SUM(r.qty) FROM dbo.reservations r WHERE r.item_id=ml.item_id AND r.status=N'Active'),0) total_reserved,bl.qty_required-bl.customer_supplied_qty allowance,
      COALESCE((SELECT SUM(other_ml.issued_qty-other_ml.returned_qty) FROM dbo.mir_lines other_ml INNER JOIN dbo.mirs other_m ON other_m.id=other_ml.mir_id AND other_m.status IN(N'Issued',N'Received') WHERE other_ml.bom_line_id=ml.bom_line_id AND other_ml.mir_id<>@id),0) previously_issued
      FROM dbo.mir_lines ml INNER JOIN dbo.bom_lines bl ON bl.id=ml.bom_line_id INNER JOIN dbo.mat_items i ON i.id=ml.item_id WHERE ml.mir_id=@id ORDER BY ml.id;`)).recordset;
            if (!issueLines.length)
                throw new ApiError(409, "mir_empty", "This request has no lines to issue.");
            for (const line of issueLines) {
                const requested = Number(line.requested_qty), remaining = Number(line.allowance) - Number(line.previously_issued), usable = Number(line.usable), own = Number(line.own_reserved), available = usable - Number(line.total_reserved);
                if (requested > remaining)
                    throw new ApiError(409, "exceeds_bom_quantity", `${line.item_code}: only ${Math.max(remaining, 0)} remains on the BOM after ${line.previously_issued} was net issued by other requests.`, { bomAllowance: Number(line.allowance), previouslyIssued: Number(line.previously_issued), remaining: Math.max(remaining, 0), requested });
                if (requested > usable)
                    throw new ApiError(409, "insufficient_stock", `${line.item_code}: only ${usable} is physically in stock.`, { inStock: usable, requested });
                if (requested > own + available)
                    throw new ApiError(409, "reserved_for_another_project", `${line.item_code}: ${requested - own - available} of what you asked for is reserved for another project.`, { reservedForThisProject: own, free: available });
            }
            for (const line of issueLines) {
                const requested = Number(line.requested_qty), itemId = Number(line.item_id);
                await appendStockLedger(transaction, `mir:${id}:line:${line.id}:issue`, "MIR_ISSUE", itemId, -requested, "stock", String(line.location), h.mir_no, Number(h.project_id), Number(line.avg_unit_cost), actor.id, "Issued to project", today);
                await consumeReservations(transaction, itemId, Number(h.project_id), requested);
                const mark = new sql.Request(transaction);
                mark.input("id", sql.BigInt, Number(line.id));
                await mark.query(`UPDATE dbo.mir_lines SET issued_qty=requested_qty WHERE id=@id;`);
            }
            const update = new sql.Request(transaction);
            update.input("actor", sql.BigInt, actor.id);
            update.input("id", sql.BigInt, id);
            update.input("version", sql.VarBinary(8), version);
            const row = (await update.query(`UPDATE dbo.mirs SET status=N'Issued',picked_by=COALESCE(picked_by,@actor),issued_by=@actor,issued_at=SYSUTCDATETIME() OUTPUT inserted.row_version WHERE id=@id AND status IN(N'Approved',N'Picking') AND row_version=@version;`)).recordset[0];
            if (!row)
                throw new ApiError(409, "concurrency_conflict", "This request changed. Reload and try again.");
            const issued = issueLines.reduce((s, x) => s + Number(x.requested_qty), 0);
            await insertMaterialAudit(transaction, actor, "Issued material", "MIR", id, h.mir_no, { status: h.status }, { status: "Issued", lines: issueLines.length }, { quantity: issued, projectId: Number(h.project_id), reason: comment });
            return { id, status: "Issued", issuedQuantity: issued, rowVersion: row.row_version.toString("base64") };
        });
    });
    app.post("/api/v1/material-issues/:id/receipt", async (request) => { await users.demandPermission(request, "procurement.request"); const actor = await users.required(request); const id = positiveLong(request.params.id, "Material issue id"), body = bodyObject(request.body), version = parseRowVersion(body.rowVersion), comment = optionalBodyText(body.comment, 20_000, "Workflow comment"); return database.transaction(async (transaction) => { const h = await header(transaction, id); if (h.status !== "Issued")
        throw new ApiError(409, "mir_not_issued", `Only issued material can be confirmed; this request is '${h.status}'.`); if (Number(h.requested_by) !== actor.id && !isProjectElevated(actor))
        throw new ApiError(403, "requester_required", "Only the requester confirms receipt of their own material."); const update = new sql.Request(transaction); update.input("actor", sql.BigInt, actor.id); update.input("id", sql.BigInt, id); update.input("version", sql.VarBinary(8), version); const row = (await update.query(`UPDATE dbo.mirs SET status=N'Received',received_by=@actor,received_at=SYSUTCDATETIME() OUTPUT inserted.row_version WHERE id=@id AND status=N'Issued' AND row_version=@version;`)).recordset[0]; if (!row)
        throw new ApiError(409, "concurrency_conflict", "This request changed. Reload and try again."); await insertMaterialAudit(transaction, actor, "Confirmed member receipt", "MIR", id, h.mir_no, { status: "Issued" }, { status: "Received", receivedBy: actor.name }, { projectId: Number(h.project_id), reason: comment }); return { id, status: "Received", rowVersion: row.row_version.toString("base64") }; }); });
    app.post("/api/v1/material-issues/:id/returns", async (request) => { await users.demandPermission(request, "inventory.issue"); const actor = await users.required(request); const id = positiveLong(request.params.id, "Material issue id"), body = bodyObject(request.body), lineId = requiredInteger(body.lineId, "Line", 1), quantity = qty(body.quantity), reason = requiredText(body.reason, 20_000, "Reason"), today = todayIn(config.businessTimeZone); return database.transaction(async (transaction) => { const h = await header(transaction, id); if (h.status !== "Issued" && h.status !== "Received")
        throw new ApiError(409, "mir_not_issued", `Material can only be returned against an issued request; this one is '${h.status}'.`); const read = new sql.Request(transaction); read.input("line", sql.BigInt, lineId); read.input("mir", sql.BigInt, id); const line = (await read.query(`SELECT ml.item_id,i.item_code,ml.location,ml.issued_qty,ml.returned_qty,i.avg_unit_cost FROM dbo.mir_lines ml WITH (UPDLOCK,HOLDLOCK) INNER JOIN dbo.mat_items i ON i.id=ml.item_id WHERE ml.id=@line AND ml.mir_id=@mir;`)).recordset[0]; if (!line)
        throw new ApiError(404, "mir_line_not_found", "This line does not belong to the request."); const returnable = Number(line.issued_qty) - Number(line.returned_qty); if (quantity > returnable)
        throw new ApiError(409, "exceeds_issued", `${line.item_code}: ${line.issued_qty} was issued and ${line.returned_qty} already came back, so only ${returnable} can be returned.`, { returnable }); const update = new sql.Request(transaction); update.input("qty", sql.Decimal(19, 4), quantity); update.input("line", sql.BigInt, lineId); await update.query(`UPDATE dbo.mir_lines SET returned_qty=returned_qty+@qty WHERE id=@line;`); const sequenceRequest = new sql.Request(transaction); sequenceRequest.input("prefix", sql.NVarChar(200), `mir:${id}:line:${lineId}:return:%`); const sequence = Number((await sequenceRequest.query(`SELECT COUNT(*) count FROM dbo.stock_txns WHERE source_event_key LIKE @prefix;`)).recordset[0].count) + 1; await appendStockLedger(transaction, `mir:${id}:line:${lineId}:return:${sequence}`, "MIR_RETURN", Number(line.item_id), quantity, "stock", String(line.location), h.mir_no, Number(h.project_id), Number(line.avg_unit_cost), actor.id, reason, today); await insertMaterialAudit(transaction, actor, "Returned material to store", "MIR", id, h.mir_no, { issued: Number(line.issued_qty), alreadyReturned: Number(line.returned_qty) }, { returned: quantity, itemCode: line.item_code }, { quantity, projectId: Number(h.project_id), reason }); return { id, lineId, returned: quantity, itemCode: line.item_code }; }); });
}
//# sourceMappingURL=material-issues.js.map