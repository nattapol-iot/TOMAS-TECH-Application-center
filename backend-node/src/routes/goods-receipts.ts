import type { FastifyInstance } from "fastify";
import sql from "mssql";
import type { Transaction as TransactionType } from "mssql";
import type { AppConfig } from "../config.js";
import type { Database } from "../db.js";
import { issueDocumentNumber } from "../document-number.js";
import { ApiError } from "../errors.js";
import { bodyObject, booleanQuery, oneOf, optionalBodyText, optionalPositiveLong, parseDateOnly, parseRowVersion, positiveLong, requiredInteger } from "../http.js";
import { insertMaterialAudit } from "../material-audit.js";
import { demandProjectScope, isProjectElevated } from "../project-scope.js";
import { appendStockLedger } from "../stock-ledger.js";
import { notifyUsers } from "../site-visit-common.js";
import type { CurrentUserService } from "../users.js";

type ReceiptLine = { purchaseOrderLineId: number; receivedQuantity: number; acceptedQuantity: number; damagedQuantity: number; rejectedQuantity: number;
  qcStatus: string; lotNumber: string | null; serialNumber: string | null; location: string | null; projectAllocationId: number | null;
  allowOverReceipt: boolean; remark: string | null };

function todayIn(timeZone: string): string { const p = new Intl.DateTimeFormat("en-GB", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date());
  const v = Object.fromEntries(p.map((x) => [x.type, x.value])); return `${v.year}-${v.month}-${v.day}`; }
function amount(value: unknown, label: string, minimum: number): number { if (typeof value !== "number" || !Number.isFinite(value) || value < minimum || value > 1_000_000_000) throw new ApiError(400, "validation_failed", `${label} is outside the supported range.`);
  if (!value.toString().toLowerCase().includes("e") && (value.toString().split(".")[1]?.length ?? 0) > 4) throw new ApiError(400, "validation_failed", `${label} cannot have more than 4 decimal places.`); return value; }
function parseLines(value: unknown): ReceiptLine[] { if (!Array.isArray(value) || !value.length) throw new ApiError(400, "validation_failed", "At least one line is required."); if (value.length > 200) throw new ApiError(400, "validation_failed", "A receipt cannot carry more than 200 lines.");
  const seen = new Set<number>(); return value.map((raw) => { const body = bodyObject(raw); const purchaseOrderLineId = requiredInteger(body.purchaseOrderLineId, "Purchase order line", 1);
    if (seen.has(purchaseOrderLineId)) throw new ApiError(400, "validation_failed", "A purchase order line can appear only once on a receipt."); seen.add(purchaseOrderLineId);
    const receivedQuantity = amount(body.receivedQuantity, "Received quantity", 0.0001); const acceptedQuantity = amount(body.acceptedQuantity, "Accepted quantity", 0);
    const damagedQuantity = amount(body.damagedQuantity, "Damaged quantity", 0); const rejectedQuantity = amount(body.rejectedQuantity, "Rejected quantity", 0);
    if (Math.abs(acceptedQuantity + damagedQuantity + rejectedQuantity - receivedQuantity) > 0.0000001) throw new ApiError(400, "validation_failed", "Accepted, damaged and rejected quantity must add up to the received quantity.");
    return { purchaseOrderLineId, receivedQuantity, acceptedQuantity, damagedQuantity, rejectedQuantity,
      qcStatus: body.qcStatus === null || body.qcStatus === undefined ? "Pending" : oneOf(String(body.qcStatus).trim(), "QC status", ["Pending", "Passed", "Failed"]),
      lotNumber: optionalBodyText(body.lotNumber, 100, "Lot number"), serialNumber: optionalBodyText(body.serialNumber, 200, "Serial number"),
      location: optionalBodyText(body.location, 100, "Location"), projectAllocationId: body.projectAllocationId === null || body.projectAllocationId === undefined ? null : requiredInteger(body.projectAllocationId, "Project allocation", 1),
      allowOverReceipt: body.allowOverReceipt === true, remark: optionalBodyText(body.remark, 20_000, "Remark") }; }); }

async function insertLine(transaction: TransactionType, grnId: number, poId: number, line: ReceiptLine): Promise<void> {
  const lookup = new sql.Request(transaction); lookup.input("line", sql.BigInt, line.purchaseOrderLineId); lookup.input("po", sql.BigInt, poId);
  const row = (await lookup.query<Record<string, unknown>>(`SELECT pol.item_id,COALESCE(i.item_code,prl.item_code) item_code,pol.qty,COALESCE(i.location,N'') default_location,
    COALESCE((SELECT SUM(gl.received_qty) FROM dbo.grn_lines gl INNER JOIN dbo.grns g ON g.id=gl.grn_id AND g.status=N'Confirmed' WHERE gl.po_line_id=pol.id),0) received
    FROM dbo.mat_po_lines pol WITH (UPDLOCK,HOLDLOCK) INNER JOIN dbo.mat_pr_lines prl ON prl.id=pol.pr_line_id LEFT JOIN dbo.mat_items i ON i.id=pol.item_id
    WHERE pol.id=@line AND pol.po_id=@po;`)).recordset[0]; if (!row) throw new ApiError(404, "po_line_not_found", `PO line ${line.purchaseOrderLineId} does not belong to this purchase order.`);
  const ordered = Number(row.qty), previous = Number(row.received), itemCode = String(row.item_code); if (previous + line.receivedQuantity > ordered) { if (!line.allowOverReceipt) throw new ApiError(409, "over_receipt", `${itemCode}: ${ordered} ordered and ${previous} already received, so ${line.receivedQuantity} exceeds the order. Approve it with allowOverReceipt and a remark.`, { ordered, previouslyReceived: previous, requested: line.receivedQuantity });
    if (!line.remark) throw new ApiError(400, "reason_required", `${itemCode}: an over-receipt needs a remark.`); }
  const location = line.location ?? String(row.default_location); if (!location) throw new ApiError(400, "validation_failed", `${itemCode}: a storage location is required.`);
  const insert = new sql.Request(transaction); insert.input("grn", sql.BigInt, grnId); insert.input("po", sql.BigInt, poId); insert.input("line", sql.BigInt, line.purchaseOrderLineId);
  insert.input("item", sql.BigInt, row.item_id === null ? null : Number(row.item_id)); insert.input("received", sql.Decimal(19, 4), line.receivedQuantity); insert.input("accepted", sql.Decimal(19, 4), line.acceptedQuantity);
  insert.input("damaged", sql.Decimal(19, 4), line.damagedQuantity); insert.input("rejected", sql.Decimal(19, 4), line.rejectedQuantity); insert.input("lot", sql.NVarChar(100), line.lotNumber);
  insert.input("serial", sql.NVarChar(200), line.serialNumber); insert.input("location", sql.NVarChar(100), location); insert.input("qc", sql.NVarChar(30), line.qcStatus);
  insert.input("project", sql.BigInt, line.projectAllocationId); insert.input("over", sql.Bit, line.allowOverReceipt); insert.input("remark", sql.NVarChar(sql.MAX), line.remark);
  await insert.query(`INSERT INTO dbo.grn_lines(grn_id,po_id,po_line_id,item_id,received_qty,accepted_qty,damaged_qty,rejected_qty,lot_no,serial_no,location,qc_status,project_allocation_id,allow_over_receipt,remark)
    VALUES(@grn,@po,@line,@item,@received,@accepted,@damaged,@rejected,@lot,@serial,@location,@qc,@project,@over,@remark);`);
}

async function refreshPo(transaction: TransactionType, poId: number, actorId: number): Promise<string> { const request = new sql.Request(transaction); request.input("po", sql.BigInt, poId); request.input("actor", sql.BigInt, actorId);
  return String((await request.query<{ status: string }>(`DECLARE @outstanding decimal(19,4)=(SELECT COALESCE(SUM(CASE WHEN pol.qty>COALESCE(rc.received_qty,0) THEN pol.qty-COALESCE(rc.received_qty,0) ELSE 0 END),0)
    FROM dbo.mat_po_lines pol OUTER APPLY(SELECT SUM(gl.received_qty) received_qty FROM dbo.grn_lines gl INNER JOIN dbo.grns g ON g.id=gl.grn_id AND g.status=N'Confirmed' WHERE gl.po_line_id=pol.id) rc WHERE pol.po_id=@po);
    DECLARE @received decimal(19,4)=(SELECT COALESCE(SUM(gl.received_qty),0) FROM dbo.grn_lines gl INNER JOIN dbo.grns g ON g.id=gl.grn_id AND g.status=N'Confirmed' INNER JOIN dbo.mat_po_lines pol ON pol.id=gl.po_line_id WHERE pol.po_id=@po);
    DECLARE @status nvarchar(30)=CASE WHEN @outstanding<=0 THEN N'Received' WHEN @received>0 THEN N'Partially Received' ELSE N'Ordered' END;
    UPDATE dbo.mat_pos SET status=@status,updated_by=@actor,updated_at=SYSUTCDATETIME() WHERE id=@po AND deleted_at IS NULL; SELECT @status status;`)).recordset[0]!.status); }

export function registerGoodsReceiptRoutes(app: FastifyInstance, config: AppConfig, database: Database, users: CurrentUserService): void {
  app.get("/api/v1/purchase-orders", async (request) => { await users.demandPermission(request, "procurement.read"); const actor = await users.required(request); const q = request.query as Record<string, unknown>;
    const projectId = optionalPositiveLong(q.projectId, "Project id"), openOnly = booleanQuery(q.openOnly, false); const result = await database.query<Record<string, unknown> & { row_version: Buffer }>(`SELECT po.id,po.po_no,po.pr_id,pr.pr_no,po.project_id,p.project_no,po.supplier_id,s.name supplier_name,
      po.order_date,po.confirmed_date,po.expected_date,po.status,COALESCE(SUM(pol.qty),0) ordered_qty,COALESCE(SUM(rc.received_qty),0) received_qty,
      COALESCE(SUM(pol.qty*pol.unit_price),0) value,COALESCE(SUM(CASE WHEN pol.qty>COALESCE(rc.received_qty,0) THEN (pol.qty-COALESCE(rc.received_qty,0))*pol.unit_price ELSE 0 END),0) open_value,po.row_version
      FROM dbo.mat_pos po INNER JOIN dbo.mat_prs pr ON pr.id=po.pr_id INNER JOIN dbo.projects p ON p.id=po.project_id INNER JOIN dbo.suppliers s ON s.id=po.supplier_id LEFT JOIN dbo.mat_po_lines pol ON pol.po_id=po.id
      OUTER APPLY(SELECT SUM(gl.received_qty) received_qty FROM dbo.grn_lines gl INNER JOIN dbo.grns g ON g.id=gl.grn_id AND g.status=N'Confirmed' WHERE gl.po_line_id=pol.id) rc
      WHERE po.deleted_at IS NULL AND (@project IS NULL OR po.project_id=@project) AND (@open=0 OR po.status IN(N'Ordered',N'Partially Received'))
      AND (@elevated=1 OR p.manager_id=@actor OR p.lead_engineer_id=@actor OR EXISTS(SELECT 1 FROM dbo.project_members m WHERE m.project_id=p.id AND m.user_id=@actor))
      GROUP BY po.id,po.po_no,po.pr_id,pr.pr_no,po.project_id,p.project_no,po.supplier_id,s.name,po.order_date,po.confirmed_date,po.expected_date,po.status,po.row_version ORDER BY po.id DESC;`, (r) => {
      r.input("project", sql.BigInt, projectId); r.input("open", sql.Bit, openOnly); r.input("actor", sql.BigInt, actor.id); r.input("elevated", sql.Bit, isProjectElevated(actor)); });
    return result.recordset.map((row) => ({ id: Number(row.id), number: row.po_no, purchaseRequisitionId: Number(row.pr_id), purchaseRequisitionNumber: row.pr_no,
      projectId: Number(row.project_id), projectNumber: row.project_no, supplierId: Number(row.supplier_id), supplierName: row.supplier_name, orderDate: row.order_date,
      confirmedDate: row.confirmed_date, expectedDate: row.expected_date, status: row.status, orderedQuantity: Number(row.ordered_qty), receivedQuantity: Number(row.received_qty),
      value: Number(row.value), openValue: Number(row.open_value), rowVersion: row.row_version.toString("base64") }));
  });

  app.get("/api/v1/purchase-orders/:id", async (request) => { await users.demandPermission(request, "procurement.read"); const actor = await users.required(request); const id = positiveLong((request.params as { id?: string }).id, "Purchase order id");
    const result = await database.query<Record<string, unknown> & { row_version?: Buffer }>(`SELECT po.id,po.po_no,po.project_id,p.project_no,po.supplier_id,s.name supplier_name,po.order_date,po.expected_date,po.status,po.row_version,pr.pr_no
      FROM dbo.mat_pos po INNER JOIN dbo.projects p ON p.id=po.project_id INNER JOIN dbo.suppliers s ON s.id=po.supplier_id INNER JOIN dbo.mat_prs pr ON pr.id=po.pr_id WHERE po.id=@id AND po.deleted_at IS NULL;
      SELECT pol.id,pol.item_id,COALESCE(i.item_code,prl.item_code) item_code,COALESCE(i.part_no,prl.part_no) part_no,prl.description,pol.qty,prl.unit,pol.unit_price,pol.bom_line_id,
      COALESCE(rc.received_qty,0) received_qty,COALESCE(i.location,N'') default_location FROM dbo.mat_po_lines pol INNER JOIN dbo.mat_pr_lines prl ON prl.id=pol.pr_line_id LEFT JOIN dbo.mat_items i ON i.id=pol.item_id
      OUTER APPLY(SELECT SUM(gl.received_qty) received_qty FROM dbo.grn_lines gl INNER JOIN dbo.grns g ON g.id=gl.grn_id AND g.status=N'Confirmed' WHERE gl.po_line_id=pol.id) rc WHERE pol.po_id=@id ORDER BY pol.id;`, (r) => r.input("id", sql.BigInt, id));
    const h = result.recordsets[0]?.[0] as (Record<string, unknown> & { row_version: Buffer }) | undefined; if (!h) throw new ApiError(404, "po_not_found", "Purchase order not found."); await demandProjectScope(database, actor, Number(h.project_id));
    return { purchaseOrder: { id: Number(h.id), number: h.po_no, projectId: Number(h.project_id), projectNumber: h.project_no, supplierId: Number(h.supplier_id), supplierName: h.supplier_name,
      orderDate: h.order_date, expectedDate: h.expected_date, status: h.status, rowVersion: h.row_version.toString("base64"), purchaseRequisitionNumber: h.pr_no },
      lines: (result.recordsets[1] ?? []).map((raw) => { const row = raw as Record<string, unknown>; const ordered = Number(row.qty), received = Number(row.received_qty); return { id: Number(row.id), itemId: row.item_id === null ? null : Number(row.item_id),
        itemCode: row.item_code, partNumber: row.part_no, description: row.description, orderedQuantity: ordered, unit: row.unit, unitPrice: Number(row.unit_price), bomLineId: Number(row.bom_line_id),
        previouslyReceived: received, outstandingQuantity: Math.max(0, ordered - received), defaultLocation: row.default_location }; }) };
  });

  app.get("/api/v1/goods-receipts", async (request) => { await users.demandPermission(request, "inventory.read"); const poId = optionalPositiveLong((request.query as Record<string, unknown>).poId, "Purchase order id");
    const result = await database.query<Record<string, unknown> & { row_version: Buffer }>(`SELECT g.id,g.grn_no,g.po_id,po.po_no,g.supplier_id,s.name supplier_name,g.delivery_note,g.received_date,g.status,g.confirmed_by,cu.name confirmed_by_name,g.confirmed_at,g.created_by,ou.name created_by_name,
      COALESCE(SUM(gl.received_qty),0) received_qty,COALESCE(SUM(gl.accepted_qty),0) accepted_qty,COALESCE(SUM(gl.damaged_qty+gl.rejected_qty),0) held_qty,g.row_version
      FROM dbo.grns g INNER JOIN dbo.mat_pos po ON po.id=g.po_id INNER JOIN dbo.suppliers s ON s.id=g.supplier_id INNER JOIN dbo.users ou ON ou.id=g.created_by LEFT JOIN dbo.users cu ON cu.id=g.confirmed_by LEFT JOIN dbo.grn_lines gl ON gl.grn_id=g.id
      WHERE (@po IS NULL OR g.po_id=@po) GROUP BY g.id,g.grn_no,g.po_id,po.po_no,g.supplier_id,s.name,g.delivery_note,g.received_date,g.status,g.confirmed_by,cu.name,g.confirmed_at,g.created_by,ou.name,g.row_version ORDER BY g.id DESC;`, (r) => r.input("po", sql.BigInt, poId));
    return result.recordset.map((row) => ({ id: Number(row.id), number: row.grn_no, purchaseOrderId: Number(row.po_id), purchaseOrderNumber: row.po_no, supplierId: Number(row.supplier_id), supplierName: row.supplier_name,
      deliveryNote: row.delivery_note, receivedDate: row.received_date, status: row.status, confirmedById: row.confirmed_by === null ? null : Number(row.confirmed_by), confirmedByName: row.confirmed_by_name,
      confirmedAt: row.confirmed_at, receivedById: Number(row.created_by), receivedByName: row.created_by_name, receivedQuantity: Number(row.received_qty), acceptedQuantity: Number(row.accepted_qty), heldQuantity: Number(row.held_qty), rowVersion: row.row_version.toString("base64") }));
  });

  app.get("/api/v1/goods-receipts/:id", async (request) => { await users.demandPermission(request, "inventory.read"); const id = positiveLong((request.params as { id?: string }).id, "Goods receipt id");
    const result = await database.query<Record<string, unknown> & { row_version?: Buffer }>(`SELECT g.id,g.grn_no,g.po_id,po.po_no,g.supplier_id,s.name supplier_name,g.delivery_note,g.received_date,g.status,g.created_by,ou.name received_by_name,g.confirmed_by,cu.name confirmed_by_name,g.confirmed_at,g.row_version
      FROM dbo.grns g INNER JOIN dbo.mat_pos po ON po.id=g.po_id INNER JOIN dbo.suppliers s ON s.id=g.supplier_id INNER JOIN dbo.users ou ON ou.id=g.created_by LEFT JOIN dbo.users cu ON cu.id=g.confirmed_by WHERE g.id=@id;
      SELECT gl.id,gl.po_line_id,gl.item_id,COALESCE(i.item_code,prl.item_code) item_code,COALESCE(i.part_no,prl.part_no) part_no,prl.description,pol.qty,gl.received_qty,gl.accepted_qty,gl.damaged_qty,gl.rejected_qty,gl.lot_no,gl.serial_no,gl.location,gl.qc_status,gl.project_allocation_id,gl.remark,gl.allow_over_receipt,prl.unit,
      COALESCE(prev.received_qty,0) previous_received FROM dbo.grn_lines gl INNER JOIN dbo.mat_po_lines pol ON pol.id=gl.po_line_id INNER JOIN dbo.mat_pr_lines prl ON prl.id=pol.pr_line_id LEFT JOIN dbo.mat_items i ON i.id=gl.item_id
      OUTER APPLY(SELECT SUM(x.received_qty) received_qty FROM dbo.grn_lines x INNER JOIN dbo.grns xg ON xg.id=x.grn_id AND xg.status=N'Confirmed' WHERE x.po_line_id=gl.po_line_id AND x.grn_id<>gl.grn_id) prev WHERE gl.grn_id=@id ORDER BY gl.id;`, (r) => r.input("id", sql.BigInt, id));
    const h = result.recordsets[0]?.[0] as (Record<string, unknown> & { row_version: Buffer }) | undefined; if (!h) throw new ApiError(404, "grn_not_found", "Goods receipt not found.");
    return { goodsReceipt: { id: Number(h.id), number: h.grn_no, purchaseOrderId: Number(h.po_id), purchaseOrderNumber: h.po_no, supplierId: Number(h.supplier_id), supplierName: h.supplier_name,
      deliveryNote: h.delivery_note, receivedDate: h.received_date, status: h.status, receivedById: Number(h.created_by), receivedByName: h.received_by_name, confirmedById: h.confirmed_by === null ? null : Number(h.confirmed_by), confirmedByName: h.confirmed_by_name, confirmedAt: h.confirmed_at, rowVersion: h.row_version.toString("base64") },
      lines: (result.recordsets[1] ?? []).map((raw) => { const row = raw as Record<string, unknown>; const ordered = Number(row.qty), received = Number(row.received_qty), previous = Number(row.previous_received); return { id: Number(row.id), purchaseOrderLineId: Number(row.po_line_id), itemId: row.item_id === null ? null : Number(row.item_id), itemCode: row.item_code,
        partNumber: row.part_no, description: row.description, orderedQuantity: ordered, previouslyReceived: previous, receivedQuantity: received, acceptedQuantity: Number(row.accepted_qty), damagedQuantity: Number(row.damaged_qty), rejectedQuantity: Number(row.rejected_qty),
        lotNumber: row.lot_no, serialNumber: row.serial_no, location: row.location, qcStatus: row.qc_status, projectAllocationId: row.project_allocation_id === null ? null : Number(row.project_allocation_id), remark: row.remark, allowOverReceipt: Boolean(row.allow_over_receipt), unit: row.unit, outstandingAfter: Math.max(0, ordered - previous - received) }; }) };
  });

  app.post("/api/v1/goods-receipts", async (request, reply) => { await users.demandPermission(request, "inventory.receive"); const actor = await users.required(request); const body = bodyObject(request.body);
    const poId = requiredInteger(body.purchaseOrderId, "Purchase order", 1); const deliveryNote = optionalBodyText(body.deliveryNote, 200, "Delivery note") ?? ""; const receivedDate = parseDateOnly(body.receivedDate, "Received date", true) ?? todayIn(config.businessTimeZone); const lines = parseLines(body.lines);
    const created = await database.transaction(async (transaction) => { const lookup = new sql.Request(transaction); lookup.input("po", sql.BigInt, poId); const po = (await lookup.query<{ supplier_id: number | string; status: string }>(`SELECT supplier_id,status FROM dbo.mat_pos WITH (UPDLOCK,HOLDLOCK) WHERE id=@po AND deleted_at IS NULL;`)).recordset[0];
      if (!po) throw new ApiError(404, "po_not_found", "Purchase order not found."); if (po.status !== "Ordered" && po.status !== "Partially Received") throw new ApiError(409, "po_not_receivable", `Goods cannot be received against a purchase order that is '${po.status}'.`);
      const number = await issueDocumentNumber(transaction, "GRN", todayIn(config.businessTimeZone)); const insert = new sql.Request(transaction); insert.input("number", sql.NVarChar(30), number); insert.input("po", sql.BigInt, poId); insert.input("supplier", sql.BigInt, Number(po.supplier_id));
      insert.input("note", sql.NVarChar(200), deliveryNote); insert.input("date", sql.Date, receivedDate); insert.input("actor", sql.BigInt, actor.id); const grn = (await insert.query<{ id: number | string; row_version: Buffer }>(`INSERT INTO dbo.grns(grn_no,po_id,supplier_id,delivery_note,received_date,status,created_by) OUTPUT inserted.id,inserted.row_version VALUES(@number,@po,@supplier,@note,@date,N'Draft',@actor);`)).recordset[0]!; const id = Number(grn.id);
      for (const line of lines) await insertLine(transaction, id, poId, line); await insertMaterialAudit(transaction, actor, "Recorded goods receipt", "GRN", id, number, null, { purchaseOrderId: poId, lines: lines.length, status: "Draft" }, { quantity: lines.reduce((sum, line) => sum + line.receivedQuantity, 0), reason: deliveryNote || null });
      return { id, number, status: "Draft", lineCount: lines.length, rowVersion: grn.row_version.toString("base64") }; }); return reply.status(201).header("Location", `/api/v1/goods-receipts/${created.id}`).send(created);
  });

  app.post("/api/v1/goods-receipts/:id/confirm", async (request) => { await users.demandPermission(request, "inventory.receive"); const actor = await users.required(request); const id = positiveLong((request.params as { id?: string }).id, "Goods receipt id");
    const body = bodyObject(request.body); const version = parseRowVersion(body.rowVersion); const comment = optionalBodyText(body.comment, 20_000, "Workflow comment");
    return database.transaction(async (transaction) => { const lookup = new sql.Request(transaction); lookup.input("id", sql.BigInt, id); const grn = (await lookup.query<{ grn_no: string; po_id: number | string; status: string; received_date: Date | string }>(`SELECT grn_no,po_id,status,received_date FROM dbo.grns WITH (UPDLOCK,HOLDLOCK) WHERE id=@id;`)).recordset[0];
      if (!grn) throw new ApiError(404, "grn_not_found", "Goods receipt not found."); if (grn.status !== "Draft") throw new ApiError(409, "grn_not_draft", `Only a draft receipt can be confirmed; this one is '${grn.status}'.`);
      const poId = Number(grn.po_id); const projectRequest = new sql.Request(transaction); projectRequest.input("po", sql.BigInt, poId); const projectId = Number((await projectRequest.query<{ project_id: number | string }>(`SELECT project_id FROM dbo.mat_pos WITH (UPDLOCK,HOLDLOCK) WHERE id=@po AND deleted_at IS NULL;`)).recordset[0]!.project_id);
      const confirmable = new sql.Request(transaction); confirmable.input("grn", sql.BigInt, id); const checks = (await confirmable.query<Record<string, unknown>>(`SELECT gl.po_line_id,COALESCE(i.item_code,prl.item_code) item_code,pol.qty ordered,gl.received_qty requested,
        COALESCE((SELECT SUM(previous.received_qty) FROM dbo.grn_lines previous WITH (UPDLOCK,HOLDLOCK,INDEX(IX_grn_lines_po_line)) INNER JOIN dbo.grns pg ON pg.id=previous.grn_id AND pg.status=N'Confirmed' WHERE previous.po_line_id=gl.po_line_id AND previous.grn_id<>@grn),0) previous_received,
        gl.allow_over_receipt,gl.remark FROM dbo.grn_lines gl WITH (UPDLOCK,HOLDLOCK) INNER JOIN dbo.mat_po_lines pol WITH (UPDLOCK,HOLDLOCK) ON pol.id=gl.po_line_id INNER JOIN dbo.mat_pr_lines prl ON prl.id=pol.pr_line_id LEFT JOIN dbo.mat_items i ON i.id=gl.item_id WHERE gl.grn_id=@grn ORDER BY gl.po_line_id;`)).recordset;
      for (const row of checks) if (Number(row.previous_received) + Number(row.requested) > Number(row.ordered)) { const details = { purchaseOrderLineId: Number(row.po_line_id), ordered: Number(row.ordered), previouslyReceived: Number(row.previous_received), requested: Number(row.requested), resultingReceived: Number(row.previous_received) + Number(row.requested) };
        if (!row.allow_over_receipt) throw new ApiError(409, "over_receipt", `${row.item_code}: only ${Math.max(0, Number(row.ordered) - Number(row.previous_received))} remains on the order; another confirmed receipt makes this draft exceed the ordered quantity.`, details);
        if (!row.remark) throw new ApiError(409, "over_receipt_reason_required", `${row.item_code}: the explicitly allowed over-receipt still needs a remark before it can be confirmed.`, details); }
      const linesRequest = new sql.Request(transaction); linesRequest.input("id", sql.BigInt, id); const movements = (await linesRequest.query<Record<string, unknown>>(`SELECT gl.id,gl.item_id,gl.accepted_qty,gl.damaged_qty+gl.rejected_qty held,gl.location,pol.unit_price FROM dbo.grn_lines gl INNER JOIN dbo.mat_po_lines pol ON pol.id=gl.po_line_id WHERE gl.grn_id=@id ORDER BY gl.id;`)).recordset;
      if (!movements.length) throw new ApiError(409, "grn_empty", "This receipt has no lines to confirm."); const occurred = grn.received_date instanceof Date ? grn.received_date.toISOString().slice(0, 10) : String(grn.received_date).slice(0, 10);
      for (const move of movements) if (move.item_id !== null) { const accepted = Number(move.accepted_qty), held = Number(move.held); const itemId = Number(move.item_id), location = String(move.location), cost = Number(move.unit_price);
        if (accepted > 0) await appendStockLedger(transaction, `grn:${id}:line:${move.id}:accepted`, "GRN_RECEIPT", itemId, accepted, "stock", location, grn.grn_no, null, cost, actor.id, "Accepted on delivery", occurred);
        if (held > 0) await appendStockLedger(transaction, `grn:${id}:line:${move.id}:quarantine`, "GRN_QUARANTINE", itemId, held, "quarantine", location, grn.grn_no, null, cost, actor.id, "Damaged or rejected on delivery — held for inspection", occurred); }
      const confirm = new sql.Request(transaction); confirm.input("actor", sql.BigInt, actor.id); confirm.input("id", sql.BigInt, id); confirm.input("version", sql.VarBinary(8), version); const confirmed = (await confirm.query<{ row_version: Buffer }>(`UPDATE dbo.grns SET status=N'Confirmed',confirmed_by=@actor,confirmed_at=SYSUTCDATETIME() OUTPUT inserted.row_version WHERE id=@id AND status=N'Draft' AND row_version=@version;`)).recordset[0];
      if (!confirmed) throw new ApiError(409, "concurrency_conflict", "This receipt changed. Reload and try again."); const poStatus = await refreshPo(transaction, poId, actor.id);
      const accepted = movements.reduce((sum, x) => sum + Number(x.accepted_qty), 0), quarantined = movements.reduce((sum, x) => sum + Number(x.held), 0); await insertMaterialAudit(transaction, actor, "Confirmed goods receipt", "GRN", id, grn.grn_no, { status: "Draft" }, { status: "Confirmed", accepted, quarantined, purchaseOrderStatus: poStatus }, { quantity: accepted + quarantined, projectId, reason: comment });
      const stakeholders = new sql.Request(transaction); stakeholders.input("project", sql.BigInt, projectId); stakeholders.input("po", sql.BigInt, poId); stakeholders.input("actor", sql.BigInt, actor.id);
      const recipientRows = await stakeholders.query<{ recipient_id: number | string }>(`SELECT DISTINCT recipient_id FROM(SELECT p.manager_id recipient_id FROM dbo.projects p WHERE p.id=@project UNION SELECT p.lead_engineer_id FROM dbo.projects p WHERE p.id=@project UNION SELECT pm.user_id FROM dbo.project_members pm WHERE pm.project_id=@project UNION SELECT pr.requested_by FROM dbo.mat_pos po INNER JOIN dbo.mat_prs pr ON pr.id=po.pr_id WHERE po.id=@po) recipients WHERE recipient_id IS NOT NULL AND recipient_id<>@actor;`);
      await notifyUsers(transaction, recipientRows.recordset.map((row) => Number(row.recipient_id)), "MATERIAL_RECEIVED", `ของมาถึงแล้ว · ${grn.grn_no}`, `รับของแล้ว ${accepted} หน่วยจาก PO; กักตรวจสอบ ${quarantined} หน่วย กรุณาตรวจสอบและวางแผนเบิกของสำหรับโครงการ`, "GoodsReceipt", id, `goods-receipt:${id}:confirmed`);
      return { id, status: "Confirmed", purchaseOrderStatus: poStatus, accepted, quarantined, rowVersion: confirmed.row_version.toString("base64") }; });
  });
}
