import { createHash } from "node:crypto";
import type { FastifyInstance, FastifyRequest } from "fastify";
import sql, { type Transaction } from "mssql";
import { insertAudit } from "../audit.js";
import type { Database } from "../db.js";
import type { AppConfig } from "../config.js";
import { lifecycleOptions, type DocumentKind, type LifecycleDocument, type LifecycleFacts } from "../document-lifecycle-policy.js";
import { ApiError } from "../errors.js";
import { bodyObject, clampedInteger, optionalText, positiveLong, requiredText } from "../http.js";
import type { CurrentUser } from "../types.js";
import { hasRole } from "../user-roles.js";
import type { CurrentUserService } from "../users.js";
import { withdrawEstimateReview } from "./estimates.js";

type Row = {
  id: number; number: string; project_name: string; status: string; revision: number; progress: number;
  owner_id: number; created_by: number; deleted_at: Date | null; archived_at: Date | null; row_version: Buffer;
  contingency_rate?: number; due_date: Date; locked_at?: Date | null; locked_by?: number | null;
  estimate_id?: number | null; inquiry_id?: number; submitted: number;
};
type Graph = { inquiry: Row; estimate: Row | null; projects: { id: number; number: string; status: string }[]; work: number;
  fallback: { revision: number; description: string; reviewed_by: number | null; reviewed_at: Date | null } | null };
type SavedRow = Omit<Row, "row_version"> & { row_version: string };
type SavedGraph = { inquiry: SavedRow; estimate: SavedRow | null };
type Event = { id: number; action: string; before_json: string; after_json: string; restored_at: Date | null };
const table = (kind: DocumentKind) => kind === "Inquiry" ? "inquiries" : "estimates";
const permission = (kind: DocumentKind) => kind === "Inquiry" ? "inquiry" : "estimate";
const saveRow = (row: Row): SavedRow => ({ ...row, row_version: row.row_version.toString("base64") });
const save = (g: Graph): SavedGraph => ({ inquiry: saveRow(g.inquiry), estimate: g.estimate ? saveRow(g.estimate) : null });
const root = (g: Graph, kind: DocumentKind) => kind === "Inquiry" ? g.inquiry : g.estimate!;
const token = (g: Graph) => createHash("sha256").update(JSON.stringify({ ...save(g), projects: g.projects, work: g.work, fallback: g.fallback })).digest("hex");
const manager = (actor: CurrentUser) => hasRole(actor, "Admin", "Engineering Manager");
async function purge(tx: Transaction, kind: DocumentKind, id: number, actor: number, execute = false) {
  return (await new sql.Request(tx).input("kind", sql.NVarChar(20), kind).input("id", sql.BigInt, id)
    .input("actor", sql.BigInt, actor).input("execute", sql.Bit, execute)
    .query<{ source: string; count: number }>("EXEC dbo.purge_trial_document @kind,@id,@actor,@execute;")).recordset;
}
function doc(row: Row): LifecycleDocument {
  return { id: Number(row.id), number: row.number, name: row.project_name, status: row.status, revision: row.revision,
    ownerId: Number(row.owner_id), createdBy: Number(row.created_by), deleted: !!row.deleted_at, archived: !!row.archived_at, submitted: !!row.submitted };
}

/** Lock the parent and all relevant links before deciding. Historical project references also block removal. */
async function graph(tx: Transaction, kind: DocumentKind, id: number): Promise<Graph> {
  const q = new sql.Request(tx).input("id", sql.BigInt, id);
  const inquiry = (await q.query<Row>(`SELECT i.id,i.inquiry_no number,i.project_name,i.status,i.revision,i.progress,
    i.estimate_owner_id owner_id,i.created_by,i.deleted_at,i.archived_at,i.row_version,i.due_date,i.estimate_id,0 submitted
    FROM dbo.inquiries i WITH(UPDLOCK,HOLDLOCK) WHERE i.id=${kind === "Inquiry" ? "@id" : "(SELECT inquiry_id FROM dbo.estimates WHERE id=@id)"};`)).recordset[0];
  if (!inquiry) throw new ApiError(404, "document_not_found", "Document not found.");
  const read = () => new sql.Request(tx).input("inquiry", sql.BigInt, inquiry.id);
  const estimate = (await read().query<Row>(`SELECT e.id,e.estimate_no number,e.project_name,e.status,e.revision,e.progress,
    e.owner_id,e.created_by,e.deleted_at,e.archived_at,e.row_version,e.due_date,e.contingency_rate,e.locked_at,e.locked_by,e.inquiry_id,
    (SELECT COUNT(*) FROM dbo.estimate_submission_snapshots s WITH(HOLDLOCK) WHERE s.estimate_id=e.id AND s.revision=e.revision) submitted
    FROM dbo.estimates e WITH(UPDLOCK,HOLDLOCK) WHERE e.inquiry_id=@inquiry;`)).recordset[0] ?? null;
  if (kind === "Estimate" && (!estimate || Number(estimate.id) !== id)) throw new ApiError(404, "document_not_found", "Document not found.");
  const projects = (await read().input("estimate", sql.BigInt, estimate?.id ?? null).query<Graph["projects"][number]>(
    `SELECT id,project_no number,status FROM dbo.projects WITH(UPDLOCK,HOLDLOCK) WHERE inquiry_id=@inquiry OR estimate_id=@estimate;`)).recordset;
  const work = (await read().query<{ count: number }>(`SELECT
    (SELECT COUNT(*) FROM dbo.sales_intakes WITH(HOLDLOCK) WHERE related_inquiry_id=@inquiry) +
    (SELECT COUNT(*) FROM dbo.unified_reports WITH(HOLDLOCK) WHERE inquiry_id=@inquiry) +
    (SELECT COUNT(*) FROM dbo.supplier_quotations WITH(HOLDLOCK) WHERE inquiry_id=@inquiry) +
    (SELECT COUNT(*) FROM dbo.inquiry_meetings WITH(HOLDLOCK) WHERE inquiry_id=@inquiry) count;`)).recordset[0]?.count ?? 0;
  const fallback = estimate ? (await new sql.Request(tx).input("estimate", sql.BigInt, estimate.id).input("revision", sql.Int, estimate.revision)
    .query<NonNullable<Graph["fallback"]>>(`SELECT TOP(1) revision,description,reviewed_by,reviewed_at FROM dbo.estimate_revisions WITH(HOLDLOCK)
      WHERE estimate_id=@estimate AND revision<@revision AND status IN(N'Approved',N'Locked')
      AND ISJSON(description)=1 ORDER BY revision DESC;`)).recordset[0] ?? null : null;
  return { inquiry, estimate, projects, work, fallback };
}

async function access(database: Database, actor: CurrentUser) {
  const rows = (await database.query<{ code: string }>("SELECT code FROM dbo.user_effective_permissions WHERE user_id=@actor;", q => q.input("actor", sql.BigInt, actor.id))).recordset;
  return new Set(rows.map(r => r.code));
}
function facts(g: Graph, kind: DocumentKind, actor: CurrentUser, permissions: Set<string>): LifecycleFacts {
  return { kind, document: doc(root(g, kind)), estimate: g.estimate ? doc(g.estimate) : null,
    hasProject: g.projects.length > 0, hasWork: g.work > 0, fallbackRevision: g.fallback?.revision ?? null,
    parentClosed: kind === "Estimate" && !!(g.inquiry.deleted_at || g.inquiry.archived_at || g.inquiry.status === "Cancelled"),
    actorId: actor.id, manager: manager(actor), canWrite: permissions.has(`${permission(kind)}.write`),
    canWriteEstimate: permissions.has("estimate.write"), canApprove: permissions.has("estimate.approve") };
}
async function eventById(tx: Transaction, kind: DocumentKind, id: number, eventId: number): Promise<Event> {
  const e = (await new sql.Request(tx).input("event", sql.BigInt, eventId).input("kind", sql.NVarChar(20), kind).input("id", sql.BigInt, id)
    .query<Event>(`SELECT id,action,before_json,after_json,restored_at FROM dbo.document_lifecycle_events WITH(UPDLOCK,HOLDLOCK)
      WHERE id=@event AND entity_type=@kind AND entity_id=@id AND action IN(N'delete-draft',N'archive');`)).recordset[0];
  if (!e || e.restored_at) throw new ApiError(409, "restore_unavailable", "This entry has already been restored or cannot be restored.");
  return e;
}
function restoreBlock(g: Graph, kind: DocumentKind, actor: CurrentUser, permissions: Set<string>, event: Event): string | null {
  const d = root(g, kind), after = JSON.parse(event.after_json) as SavedGraph;
  if (!permissions.has(`${permission(kind)}.write`) || !(manager(actor) || Number(d.owner_id) === actor.id || (kind === "Inquiry" && Number(d.created_by) === actor.id))) return "owner_required";
  // Restoring an archive only changes its visibility. Restoring a draft also restores the parent workflow.
  if (event.action === "archive") return d.archived_at ? null : "restore_changed";
  if (g.projects.length) return "project_linked";
  if (g.inquiry.row_version.toString("base64") !== after.inquiry.row_version ||
    g.estimate?.row_version.toString("base64") !== after.estimate?.row_version) return "restore_changed";
  if (kind === "Estimate" && (g.inquiry.archived_at || g.inquiry.deleted_at || g.inquiry.status === "Cancelled")) return "parent_closed";
  return null;
}

async function stamp(tx: Transaction, kind: DocumentKind, id: number, actor: number, assignments: string, bind?: (q: sql.Request) => void) {
  const q = new sql.Request(tx).input("id", sql.BigInt, id).input("actor", sql.BigInt, actor);
  bind?.(q);
  await q.query(`UPDATE dbo.${table(kind)} SET ${assignments},updated_by=@actor,updated_at=SYSUTCDATETIME() WHERE id=@id;`);
}
async function restoreRow(tx: Transaction, kind: DocumentKind, row: SavedRow, actor: number) {
  await stamp(tx, kind, row.id, actor, `status=@status,progress=@progress,revision=@revision,deleted_at=@deleted,archived_at=@archived,
    ${kind === "Inquiry" ? "estimate_id=@estimate" : "contingency_rate=@rate,due_date=@due,locked_at=@locked,locked_by=@locker"}`, q => {
    q.input("status", sql.NVarChar(50), row.status).input("progress", sql.Decimal(5, 2), row.progress).input("revision", sql.Int, row.revision)
      .input("deleted", sql.DateTimeOffset, row.deleted_at ? new Date(row.deleted_at) : null).input("archived", sql.DateTimeOffset, row.archived_at ? new Date(row.archived_at) : null);
    if (kind === "Inquiry") q.input("estimate", sql.BigInt, row.estimate_id ?? null);
    else q.input("rate", sql.Decimal(9, 4), row.contingency_rate ?? 0).input("due", sql.Date, new Date(row.due_date))
      .input("locked", sql.DateTimeOffset, row.locked_at ? new Date(row.locked_at) : null).input("locker", sql.BigInt, row.locked_by ?? null);
  });
}

export function registerDocumentLifecycleRoutes(app: FastifyInstance, database: Database, users: CurrentUserService, config: Pick<AppConfig, "businessTimeZone">): void {
  for (const kind of ["Inquiry", "Estimate"] as const) {
    const base = `/api/v1/${table(kind)}`;
    app.get(`${base}/lifecycle-records`, async request => {
      await users.demandPermission(request, `${permission(kind)}.read`);
      const query = request.query as Record<string, unknown>;
      const search = optionalText(query.search, 200, "Search"), page = clampedInteger(query.page, 1, 1, 100000);
      const result = await database.query<Record<string, unknown>>(`SELECT l.id eventId,l.entity_id documentId,l.entity_no number,
        d.project_name name,d.status,TRY_CONVERT(int,JSON_VALUE(l.before_json,'$.${kind === "Inquiry" ? "inquiry" : "estimate"}.revision')) revision,
        l.action,l.reason,u.name actor,l.occurred_at occurredAt,COUNT(*) OVER() total
        FROM dbo.document_lifecycle_events l INNER JOIN dbo.${table(kind)} d ON d.id=l.entity_id
        INNER JOIN dbo.users u ON u.id=l.actor_id WHERE l.entity_type=@kind AND l.restored_at IS NULL
        AND l.action IN(N'delete-draft',N'archive')
        AND (@search IS NULL OR l.entity_no LIKE N'%'+@search+N'%' OR d.project_name LIKE N'%'+@search+N'%')
        ORDER BY l.id DESC OFFSET @offset ROWS FETCH NEXT 25 ROWS ONLY;`, q => q.input("kind", sql.NVarChar(20), kind)
        .input("search", sql.NVarChar(200), search).input("offset", sql.Int, (page - 1) * 25));
      return { items: result.recordset, total: Number(result.recordset[0]?.total ?? 0), page, pageSize: 25 };
    });
    app.get(`${base}/:id/lifecycle`, async request => {
      await users.demandPermission(request, `${permission(kind)}.read`);
      const actor = await users.required(request), permissions = await access(database, actor);
      const id = positiveLong((request.params as { id: string }).id, "Document id");
      const eventValue = (request.query as { eventId?: string }).eventId;
      return database.transaction(async tx => {
        const g = await graph(tx, kind, id), f = facts(g, kind, actor, permissions);
        const event = eventValue ? await eventById(tx, kind, id, positiveLong(eventValue, "Event id")) : null;
        const purgeBlockers = hasRole(actor, "Admin") ? await purge(tx, kind, id, actor.id) : null;
        if (purgeBlockers && g.projects.length && !purgeBlockers.some(b => b.source === "dbo.projects")) purgeBlockers.push({ source: "dbo.projects", count: g.projects.length });
        return { document: f.document, token: token(g), options: lifecycleOptions(f),
          permanentDelete: purgeBlockers === null ? null : { allowed: permissions.has(`${permission(kind)}.write`) && !purgeBlockers.length, blockers: purgeBlockers },
          linkedEstimate: kind === "Inquiry" ? f.estimate : null, projects: g.projects, linkedWorkCount: g.work,
          fallbackRevision: g.fallback?.revision ?? null,
          restore: event ? { eventId: Number(event.id), reason: restoreBlock(g, kind, actor, permissions, event),
            revision: (JSON.parse(event.before_json) as SavedGraph)[kind === "Inquiry" ? "inquiry" : "estimate"]?.revision } : null };
      }, sql.ISOLATION_LEVEL.SERIALIZABLE);
    });
    app.post(`${base}/:id/lifecycle`, async request => {
      await users.demandPermission(request, `${permission(kind)}.write`);
      const actor = await users.required(request), permissions = await access(database, actor);
      const id = positiveLong((request.params as { id: string }).id, "Document id"), body = bodyObject(request.body);
      const action = requiredText(body.action, 30, "Action"), reason = requiredText(body.reason, 1000, "Reason");
      const expected = requiredText(body.token, 64, "Preview token");
      if (action === "permanent-delete" && !hasRole(actor, "Admin")) throw new ApiError(403, "admin_required", "Only Admin can permanently delete documents.");
      return database.transaction(async tx => {
        const g = await graph(tx, kind, id), current = root(g, kind), before = save(g);
        if (token(g) !== expected) throw new ApiError(409, "concurrency_conflict", "Documents changed. Refresh the preview before confirming.");
        if (action === "permanent-delete") {
          if (body.confirmNumber !== current.number) throw new ApiError(400, "confirmation_required", "Type the exact document number to confirm permanent deletion.");
          const blockers = await purge(tx, kind, id, actor.id);
          if (blockers.length || g.projects.length) throw new ApiError(409, "document_referenced", "Linked records must be handled before permanent deletion. Refresh the preview.");
          await purge(tx, kind, id, actor.id, true);
          await insertAudit(tx, actor.id, kind, id, current.number, "Document permanent-delete", before, { permanentlyDeleted: true, reason });
          if (kind === "Estimate") await insertAudit(tx, actor.id, "Inquiry", g.inquiry.id, g.inquiry.number,
            "Estimate permanent-delete", before.inquiry, { estimateId: null, reason });
          return { id, action, number: current.number };
        }
        if (action === "restore") {
          const event = await eventById(tx, kind, id, positiveLong(String(body.eventId ?? ""), "Event id"));
          const blocked = restoreBlock(g, kind, actor, permissions, event);
          if (blocked) throw new ApiError(409, blocked, "Restore is blocked. Refresh the preview to see why.");
          const original = JSON.parse(event.before_json) as SavedGraph;
          if (event.action === "archive") await stamp(tx, kind, id, actor.id, "archived_at=NULL");
          else {
            await restoreRow(tx, "Inquiry", original.inquiry, actor.id);
            if (kind === "Estimate" && original.estimate) await restoreRow(tx, "Estimate", original.estimate, actor.id);
          }
          await new sql.Request(tx).input("event", sql.BigInt, event.id).input("actor", sql.BigInt, actor.id)
            .query("UPDATE dbo.document_lifecycle_events SET restored_at=SYSUTCDATETIME(),restored_by=@actor WHERE id=@event;");
        } else {
          const option = lifecycleOptions(facts(g, kind, actor, permissions)).find(o => o.action === action);
          if (!option?.allowed) throw new ApiError(409, option?.reason ?? "invalid_action", "This action is unavailable. Refresh the preview to see why.");
          if (action === "archive") await stamp(tx, kind, id, actor.id, "archived_at=SYSUTCDATETIME()");
          if (action === "cancel" || action === "cancel-linked") {
            await stamp(tx, kind, id, actor.id, "status=N'Cancelled'");
            if (action === "cancel-linked" && g.estimate) {
              await stamp(tx, "Estimate", g.estimate.id, actor.id, "status=N'Cancelled'");
              await insertAudit(tx, actor.id, "Estimate", g.estimate.id, g.estimate.number, "Cancelled with inquiry", doc(g.estimate), { status: "Cancelled", reason });
            }
            if (kind === "Estimate") await stamp(tx, "Inquiry", g.inquiry.id, actor.id, "status=N'Estimating',progress=0");
          }
          if (action === "withdraw") {
            await withdrawEstimateReview(tx, id, current.revision, actor.id, config.businessTimeZone);
            await stamp(tx, "Inquiry", g.inquiry.id, actor.id, "status=N'Estimating',progress=75");
          }
          if (action === "delete-draft") {
            if (kind === "Estimate" && current.revision > 0 && g.fallback) {
              const snapshot = JSON.parse(g.fallback.description) as { status: string; progress: number; contingencyRate: number; dueDate: string };
              await restoreRow(tx, "Estimate", { ...saveRow(current), revision: g.fallback.revision, status: snapshot.status,
                progress: snapshot.progress, contingency_rate: snapshot.contingencyRate, due_date: new Date(snapshot.dueDate),
                locked_at: g.fallback.reviewed_at, locked_by: g.fallback.reviewed_by }, actor.id);
              await stamp(tx, "Inquiry", g.inquiry.id, actor.id, "status=N'Approved',progress=100");
            } else {
              await stamp(tx, kind, id, actor.id, "deleted_at=SYSUTCDATETIME()");
              if (kind === "Estimate") await stamp(tx, "Inquiry", g.inquiry.id, actor.id, "status=N'New',progress=0,estimate_id=NULL");
            }
          }
        }
        const after = save(await graph(tx, kind, id));
        await new sql.Request(tx).input("kind", sql.NVarChar(20), kind).input("id", sql.BigInt, id).input("number", sql.NVarChar(50), current.number)
          .input("action", sql.NVarChar(30), action).input("reason", sql.NVarChar(1000), reason).input("actor", sql.BigInt, actor.id)
          .input("before", sql.NVarChar(sql.MAX), JSON.stringify(before)).input("after", sql.NVarChar(sql.MAX), JSON.stringify(after))
          .query(`INSERT dbo.document_lifecycle_events(entity_type,entity_id,entity_no,action,reason,before_json,after_json,actor_id)
            VALUES(@kind,@id,@number,@action,@reason,@before,@after,@actor);`);
        await insertAudit(tx, actor.id, kind, id, current.number, `Document ${action}`, before, { ...after, reason });
        if (kind === "Estimate" && before.inquiry.row_version !== after.inquiry.row_version)
          await insertAudit(tx, actor.id, "Inquiry", g.inquiry.id, g.inquiry.number, `Estimate ${action}`, before.inquiry, { ...after.inquiry, reason });
        return { id, action, number: current.number };
      }, sql.ISOLATION_LEVEL.SERIALIZABLE);
    });
  }
}

/** Extra defence for existing editor endpoints, including old clients with an open workspace. */
export async function guardDocumentLifecycle(request: FastifyRequest, database: Database, users: CurrentUserService): Promise<void> {
  if (["GET", "HEAD", "OPTIONS"].includes(request.method)) return;
  const match = /^\/api\/v1\/(inquiries|estimates)\/(\d+)(?:\/([^?]+))?/.exec(request.url);
  if (!match || match[3] === "lifecycle") return;
  await users.demandPermission(request, match[1] === "inquiries" ? "inquiry.read" : "estimate.read");
  const row = (await database.query<{ closed: number }>(`SELECT CASE WHEN deleted_at IS NOT NULL OR archived_at IS NOT NULL OR status=N'Cancelled'
    THEN 1 ELSE 0 END closed FROM dbo.${match[1]} WHERE id=@id;`, q => q.input("id", sql.BigInt, Number(match[2])))).recordset[0];
  if (row?.closed) throw new ApiError(409, "document_closed", "This document is deleted, archived or cancelled. Use document history to restore it when available.");
}
