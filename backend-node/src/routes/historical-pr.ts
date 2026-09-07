import type { FastifyInstance, FastifyRequest } from "fastify";
import sql from "mssql/msnodesqlv8.js";
import type { Transaction } from "mssql";
import { insertAudit } from "../audit.js";
import type { Database } from "../db.js";
import type { CurrentUserService } from "../users.js";
import type { CurrentUser } from "../types.js";
import { ApiError } from "../errors.js";
import { bodyObject, requiredText, requiredInteger, positiveLong, parseRowVersion } from "../http.js";
import { demandProjectScope, isProjectElevated } from "../project-scope.js";
import { parseHistoricalPr, type HistoricalWorkbook } from "../historical-pr.js";

type ImportRow = { id: number; project_id: number | null; source_project_number: string; document_reference: string; revision: number; is_current: boolean;
  source_name: string; source_hash: string; payload: string; links: string; row_version: Buffer; created_at: Date; created_by: number };
type Link = { estimateLineId: number | null; replacementKey: string | null };
const normalize = (v: string) => v.trim().toLowerCase();
const base = "/api/v1/historical-pr";
const publicRow = (r: ImportRow) => ({ id: Number(r.id), projectId: r.project_id == null ? null : Number(r.project_id), documentReference: r.document_reference,
  revision: r.revision, isCurrent: r.is_current, sourceName: r.source_name, createdAt: r.created_at,
  rowVersion: r.row_version.toString("base64"), workbook: JSON.parse(r.payload) as HistoricalWorkbook, links: JSON.parse(r.links) as Record<string, Link> });

export function registerHistoricalPrRoutes(app: FastifyInstance, database: Database, users: CurrentUserService) {
  async function scope(actor: CurrentUser, row: ImportRow, transaction?: Transaction) {
    if (row.project_id != null) await demandProjectScope(database, actor, Number(row.project_id), transaction);
    else if (Number(row.created_by) !== actor.id && !isProjectElevated(actor)) throw new ApiError(403, "project_scope_forbidden", "ไม่มีสิทธิ์อ่าน PR ย้อนหลังนี้");
  }
  async function ready() {
    const r = await database.query<{ ready: number }>("SELECT CASE WHEN OBJECT_ID(N'dbo.historical_pr_imports') IS NULL THEN 0 ELSE 1 END ready;");
    if (!r.recordset[0]?.ready) throw new ApiError(503, "historical_pr_not_ready", "กำลังเตรียมระบบ Import PR ย้อนหลัง กรุณาลองใหม่ภายหลัง");
  }
  async function read(id: number, transaction?: Transaction) {
    const q = "SELECT id,project_id,source_project_number,document_reference,revision,is_current,source_name,source_hash,payload,links,row_version,created_at,created_by FROM dbo.historical_pr_imports WHERE id=@id;";
    const r = transaction ? await new sql.Request(transaction).input("id", sql.BigInt, id).query<ImportRow>(q)
      : await database.query<ImportRow>(q, c => c.input("id", sql.BigInt, id));
    if (!r.recordset[0]) throw new ApiError(404, "historical_pr_not_found", "ไม่พบ PR ย้อนหลัง");
    return r.recordset[0];
  }
  async function parseRequest(request: FastifyRequest) {
    await users.demandPermission(request, "procurement.request"); const actor = await users.required(request); await ready();
    const body = bodyObject(request.body), sourceName = requiredText(body.sourceName, 500, "ชื่อไฟล์");
    const encoded = requiredText(body.fileBase64, 12 * 1024 * 1024, "ไฟล์ Excel");
    const bytes = Buffer.from(encoded, "base64");
    if (bytes.toString("base64") !== encoded) throw new ApiError(400, "invalid_file", "ข้อมูลไฟล์ไม่สมบูรณ์");
    const workbook = parseHistoricalPr(bytes, sourceName);
    const projects = await database.query<{ id: number; project_no: string; name: string }>(
      "SELECT id,project_no,name FROM dbo.projects WHERE project_no=@number AND deleted_at IS NULL;", c => c.input("number", sql.NVarChar(100), workbook.projectNumber));
    if (projects.recordset.length > 1) throw new ApiError(409, "ambiguous_project", "พบ Project มากกว่าหนึ่งรายการ กรุณาตรวจเลข Project");
    const project = projects.recordset[0] ?? { id: null, project_no: workbook.projectNumber, name: workbook.projectName };
    if (project.id != null) await demandProjectScope(database, actor, Number(project.id));
    else if (!["Admin", "Purchasing", "Engineering Manager"].includes(actor.role)) throw new ApiError(409, "project_not_found", "ไม่พบ Project ให้ Admin หรือ Purchasing นำเข้าประวัติรอเชื่อม Project ก่อน");
    const documentReference = body.documentReference == null ? workbook.documentReference : requiredText(body.documentReference, 200, "อ้างอิง PR เดิม");
    return { body, workbook, bytes, actor, project, documentReference };
  }
  app.get(base, async request => {
    await users.demandPermission(request, "procurement.read"); const actor = await users.required(request); await ready();
    const q = request.query as Record<string, unknown>;
    const search = typeof q.search === "string" ? q.search.trim().slice(0, 200) : "";
    const result = await database.query<ImportRow & { project_no: string; name: string; imported_by: string }>(`
      SELECT h.id,h.project_id,h.source_project_number,h.document_reference,h.revision,h.is_current,h.source_name,h.source_hash,h.payload,h.links,h.row_version,h.created_at,h.created_by,h.source_project_number project_no,COALESCE(p.name,JSON_VALUE(h.payload,'$.projectName')) name,u.name imported_by
      FROM dbo.historical_pr_imports h LEFT JOIN dbo.projects p ON p.id=h.project_id JOIN dbo.users u ON u.id=h.created_by
      WHERE (h.project_id IS NULL OR p.deleted_at IS NULL) AND h.is_current=1 AND (@elevated=1 OR (h.project_id IS NULL AND h.created_by=@actor) OR p.manager_id=@actor OR p.lead_engineer_id=@actor OR EXISTS(SELECT 1 FROM dbo.project_members m WHERE m.project_id=p.id AND m.user_id=@actor))
      AND (@search=N'' OR h.document_reference LIKE N'%'+@search+N'%' OR h.source_project_number LIKE N'%'+@search+N'%' OR p.name LIKE N'%'+@search+N'%' OR h.payload LIKE N'%'+@search+N'%') ORDER BY h.id DESC;`, c => {
        c.input("actor", sql.BigInt, actor.id); c.input("elevated", sql.Bit, isProjectElevated(actor)); c.input("search", sql.NVarChar(200), search);
      });
    return result.recordset.map(r => { const doc = publicRow(r); return { id: doc.id, projectId: doc.projectId, projectNumber: r.project_no, projectName: r.name,
      documentReference: doc.documentReference, revision: doc.revision, sourceName: doc.sourceName, createdAt: doc.createdAt, importedBy: r.imported_by,
      lineCount: doc.workbook.lines.length, totals: doc.workbook.totals,
      unmapped: doc.workbook.lines.filter(l => !doc.links[l.key]?.estimateLineId).length,
      awaitingReplacement: doc.workbook.lines.filter(l => l.status === "Cancelled" && !doc.links[l.key]?.replacementKey).length }; });
  });
  app.post(`${base}/preview`, { bodyLimit: 12 * 1024 * 1024 }, async request => {
    const { workbook, project, documentReference, actor } = await parseRequest(request);
    const existing = await database.query<{ id: number; revision: number; source_hash: string }>(
      "SELECT id,revision,source_hash FROM dbo.historical_pr_imports WHERE source_project_number=@project AND document_reference=@reference AND is_current=1;", c => {
        c.input("project", sql.NVarChar(100), workbook.projectNumber); c.input("reference", sql.NVarChar(200), documentReference);
      });
    const duplicate = await database.query<{ id: number }>("SELECT id FROM dbo.historical_pr_imports WHERE source_project_number=@project AND source_hash=@hash;", c => {
      c.input("project", sql.NVarChar(100), workbook.projectNumber); c.input("hash", sql.Char(64), workbook.sourceHash);
    });
    // A newly created project can have different members from the archived source's owner.
    // Possession of the workbook must not expose a previous import without its own scope check.
    if (existing.recordset[0]) await scope(actor, await read(Number(existing.recordset[0].id)));
    if (duplicate.recordset[0]) await scope(actor, await read(Number(duplicate.recordset[0].id)));
    return { workbook, project: { id: project.id == null ? null : Number(project.id), number: project.project_no, name: project.name }, documentReference,
      existingId: existing.recordset[0] ? Number(existing.recordset[0].id) : null, existingRevision: existing.recordset[0]?.revision ?? null,
      duplicateId: duplicate.recordset[0] ? Number(duplicate.recordset[0].id) : null };
  });
  app.post(base, { bodyLimit: 12 * 1024 * 1024 }, async (request, reply) => {
    const { body, workbook, bytes, actor, project, documentReference } = await parseRequest(request);
    const expectedId = body.expectedCurrentId === null ? null : requiredInteger(body.expectedCurrentId, "Preview revision", 1);
    const result = await database.transaction(async transaction => {
      if (project.id != null) await demandProjectScope(database, actor, Number(project.id), transaction);
      // An application lock also serializes imports for source projects not registered yet.
      await new sql.Request(transaction).input("resource", sql.NVarChar(255), `HistoricalPR:${normalize(workbook.projectNumber)}`).query("DECLARE @result int; EXEC @result=sys.sp_getapplock @Resource=@resource,@LockMode='Exclusive',@LockOwner='Transaction',@LockTimeout=10000; IF @result<0 THROW 51330,'Another import is running. Retry shortly.',1;");
      const q = new sql.Request(transaction).input("project", sql.BigInt, project.id).input("sourceProject", sql.NVarChar(100), workbook.projectNumber).input("hash", sql.Char(64), workbook.sourceHash).input("reference", sql.NVarChar(200), documentReference);
      const duplicate = (await q.query<{ id: number }>("SELECT id FROM dbo.historical_pr_imports WHERE source_project_number=@sourceProject AND source_hash=@hash;")).recordset[0];
      if (duplicate) {
        await scope(actor, await read(Number(duplicate.id), transaction), transaction);
        return { id: Number(duplicate.id), alreadyImported: true };
      }
      const old = (await q.query<ImportRow>("SELECT id,revision,created_by,project_id FROM dbo.historical_pr_imports WITH(UPDLOCK,HOLDLOCK) WHERE source_project_number=@sourceProject AND document_reference=@reference AND is_current=1;")).recordset[0];
      if (old) await scope(actor, old, transaction);
      if ((old ? Number(old.id) : null) !== expectedId) throw new ApiError(409, "preview_changed", "เอกสารเปลี่ยนหลัง Preview กรุณาตรวจไฟล์อีกครั้ง");
      q.input("actor", sql.BigInt, actor.id);
      if (old) await q.query("UPDATE dbo.historical_pr_imports SET is_current=0,updated_by=@actor,updated_at=SYSUTCDATETIME() WHERE source_project_number=@sourceProject AND document_reference=@reference AND is_current=1;");
      q.input("revision", sql.Int, (old?.revision ?? 0) + 1); q.input("source", sql.NVarChar(500), workbook.sourceName);
      q.input("bytes", sql.VarBinary(sql.MAX), bytes); q.input("payload", sql.NVarChar(sql.MAX), JSON.stringify(workbook));
      // New source versions start with no inferred mappings. Old version and links stay inspectable.
      const created = (await q.query<{ id: number }>(`INSERT dbo.historical_pr_imports(project_id,source_project_number,document_reference,revision,source_name,source_hash,source_bytes,payload,created_by,updated_by)
        OUTPUT inserted.id VALUES(@project,@sourceProject,@reference,@revision,@source,@hash,@bytes,@payload,@actor,@actor);`)).recordset[0]!;
      await insertAudit(transaction, actor.id, "HistoricalPR", Number(created.id), `HPR-${created.id}`, "Historical PR imported", old ? { previousId: old.id } : null,
        { projectId: project.id, documentReference, sourceName: workbook.sourceName, sourceHash: workbook.sourceHash, lines: workbook.lines.length, totals: workbook.totals });
      return { id: Number(created.id), alreadyImported: false };
    });
    return reply.code(result.alreadyImported ? 200 : 201).send(result);
  });
  app.get(`${base}/:id`, async request => {
    await users.demandPermission(request, "procurement.read"); const actor = await users.required(request); await ready();
    const row = await read(positiveLong((request.params as { id: string }).id, "PR ย้อนหลัง"));
    await scope(actor, row);
    const candidates = await database.query<{ id: number; module: string; item_code: string; description: string; qty: number; unit_cost: number; unit: string; estimate_no: string; revision: number }>(`
      SELECT c.id,c.module,c.item_code,c.description,c.qty,c.unit_cost,c.unit,e.estimate_no,e.revision
      FROM dbo.projects p JOIN dbo.estimates e ON e.id=p.estimate_id AND e.deleted_at IS NULL
      JOIN dbo.cost_items c ON c.estimate_id=e.id AND c.revision=e.revision AND c.deleted_at IS NULL WHERE p.id=@project;`, c => c.input("project", sql.BigInt, row.project_id));
    const versions = await database.query<ImportRow>(
      "SELECT id,revision,is_current,created_at,project_id,created_by FROM dbo.historical_pr_imports WHERE source_project_number=@project AND document_reference=@reference ORDER BY revision DESC;", c => {
        c.input("project", sql.NVarChar(100), row.source_project_number); c.input("reference", sql.NVarChar(200), row.document_reference);
      });
    const visibleVersions: ImportRow[] = [];
    for (const version of versions.recordset) {
      try { await scope(actor, version); visibleVersions.push(version); }
      catch (error) { if (!(error instanceof ApiError) || ![403, 404].includes(error.statusCode)) throw error; }
    }
    return { ...publicRow(row), estimateLines: candidates.recordset.map(c => ({ id: Number(c.id), module: c.module, itemCode: c.item_code, description: c.description,
      quantity: Number(c.qty), unitCost: Number(c.unit_cost), unit: c.unit, estimateNumber: c.estimate_no, revision: c.revision })),
      versions: visibleVersions.map(v => ({ id: Number(v.id), revision: v.revision, isCurrent: v.is_current, createdAt: v.created_at })) };
  });
  app.get(`${base}/:id/source`, async (request, reply) => {
    await users.demandPermission(request, "procurement.read"); const actor = await users.required(request); await ready();
    const row = await read(positiveLong((request.params as { id: string }).id, "PR ย้อนหลัง"));
    await scope(actor, row);
    const data = await database.query<{ source_bytes: Buffer }>("SELECT source_bytes FROM dbo.historical_pr_imports WHERE id=@id;", c => c.input("id", sql.BigInt, row.id));
    return reply.type("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
      .header("Content-Disposition", `attachment; filename="historical-pr.xlsx"; filename*=UTF-8''${encodeURIComponent(row.source_name)}`).send(data.recordset[0]!.source_bytes);
  });
  app.put(`${base}/:id/links`, async request => {
    await users.demandPermission(request, "procurement.request"); const actor = await users.required(request); await ready();
    const id = positiveLong((request.params as { id: string }).id, "PR ย้อนหลัง"), body = bodyObject(request.body), version = parseRowVersion(body.rowVersion);
    const rawLinks = bodyObject(body.links);
    return database.transaction(async transaction => {
      const row = await read(id, transaction); await scope(actor, row, transaction);
      if (!row.is_current) throw new ApiError(409, "historical_pr_old_version", "แก้การจับคู่ได้เฉพาะไฟล์รุ่นล่าสุด");
      const workbook = JSON.parse(row.payload) as HistoricalWorkbook;
      const valid = new Map(workbook.lines.map(l => [l.key, l])); const links: Record<string, Link> = {};
      for (const [key, value] of Object.entries(rawLinks)) {
        const line = valid.get(key); if (!line) throw new ApiError(400, "invalid_line", "ไม่พบรายการที่จะจับคู่");
        const link = bodyObject(value);
        const estimateLineId = link.estimateLineId == null ? null : requiredInteger(link.estimateLineId, "Estimate line", 1);
        const replacementKey = link.replacementKey == null || link.replacementKey === "" ? null : requiredText(link.replacementKey, 200, "รายการทดแทน");
        if (replacementKey) {
          const target = valid.get(replacementKey);
          if (line.status !== "Cancelled" || !target || target.status === "Cancelled" || target.status === "Unknown" || !target.poNumber || normalize(target.poNumber) === normalize(line.poNumber))
            throw new ApiError(400, "invalid_replacement", "ต้องเลือก Item จาก PO ใหม่ที่ยังมีผล สำหรับรายการ PO ที่ยกเลิก");
        }
        if (estimateLineId) {
          const check = await new sql.Request(transaction).input("line", sql.BigInt, estimateLineId).input("project", sql.BigInt, row.project_id).query(`
            SELECT c.id FROM dbo.projects p JOIN dbo.estimates e ON e.id=p.estimate_id AND e.deleted_at IS NULL
            JOIN dbo.cost_items c ON c.estimate_id=e.id AND c.revision=e.revision AND c.deleted_at IS NULL WHERE p.id=@project AND c.id=@line;`);
          if (!check.recordset.length) throw new ApiError(400, "invalid_estimate_line", "Estimate line ต้องอยู่ใน revision ปัจจุบันของ Project นี้");
        }
        links[key] = { estimateLineId, replacementKey };
      }
      const updated = await new sql.Request(transaction).input("id", sql.BigInt, id).input("links", sql.NVarChar(sql.MAX), JSON.stringify(links))
        .input("actor", sql.BigInt, actor.id).input("version", sql.VarBinary(8), version).query<{ row_version: Buffer }>(`
          UPDATE dbo.historical_pr_imports SET links=@links,updated_by=@actor,updated_at=SYSUTCDATETIME() OUTPUT inserted.row_version WHERE id=@id AND is_current=1 AND row_version=@version;`);
      if (!updated.recordset[0]) throw new ApiError(409, "concurrency_conflict", "ข้อมูลเปลี่ยนแล้ว กรุณาเปิดรายการใหม่ก่อนบันทึก");
      await insertAudit(transaction, actor.id, "HistoricalPR", id, `HPR-${id}`, "Historical PR links updated", JSON.parse(row.links), links);
      return { rowVersion: updated.recordset[0].row_version.toString("base64") };
    });
  });
  app.post(`${base}/:id/link-project`, async request => {
    await users.demandPermission(request, "procurement.request"); const actor = await users.required(request); await ready();
    const id = positiveLong((request.params as { id: string }).id, "PR ย้อนหลัง"), version = parseRowVersion(bodyObject(request.body).rowVersion);
    return database.transaction(async transaction => {
      const row = await read(id, transaction); await scope(actor, row, transaction);
      const q = new sql.Request(transaction).input("number", sql.NVarChar(100), row.source_project_number).input("id", sql.BigInt, id).input("actor", sql.BigInt, actor.id).input("version", sql.VarBinary(8), version);
      const p = (await q.query<{ id: number }>("SELECT id FROM dbo.projects WHERE project_no=@number AND deleted_at IS NULL;")).recordset[0];
      if (!p) throw new ApiError(409, "project_not_found", `ยังไม่พบ Project ${row.source_project_number} ในระบบ`);
      await demandProjectScope(database, actor, Number(p.id), transaction); q.input("project", sql.BigInt, p.id);
      const updated = await q.query("UPDATE dbo.historical_pr_imports SET project_id=@project,updated_by=@actor,updated_at=SYSUTCDATETIME() OUTPUT inserted.id WHERE id=@id AND is_current=1 AND project_id IS NULL AND row_version=@version;");
      if (!updated.recordset.length) throw new ApiError(409, "concurrency_conflict", "รายการเปลี่ยนแล้วหรือเชื่อม Project แล้ว กรุณาเปิดใหม่");
      await insertAudit(transaction, actor.id, "HistoricalPR", id, `HPR-${id}`, "Historical PR project linked", { projectId: null }, { projectId: Number(p.id) });
      return { projectId: Number(p.id) };
    });
  });
}
