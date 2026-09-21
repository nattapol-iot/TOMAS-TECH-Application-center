import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";
import Fastify from "fastify";
import sql from "mssql";
import type { Database } from "../src/db.js";
import { lifecycleOptions, type LifecycleFacts, type LifecycleAction } from "../src/document-lifecycle-policy.js";
import { ApiError, registerErrorHandler } from "../src/errors.js";
import { registerDocumentLifecycleRoutes } from "../src/routes/document-lifecycle.js";
import type { CurrentUserService } from "../src/users.js";

const base: LifecycleFacts = {
  kind: "Estimate", document: { id: 2, number: "EST-2", name: "Machine", status: "Draft", revision: 0, ownerId: 8, createdBy: 8, deleted: false, archived: false, submitted: false },
  estimate: null, hasProject: false, hasWork: false, fallbackRevision: null, actorId: 8, manager: false, canWrite: true, canWriteEstimate: true, canApprove: false,
};
const allowed = (facts: LifecycleFacts, action: LifecycleAction) => lifecycleOptions(facts).find(o => o.action === action)!;
test("policy: ownership and permissions are separate, including additional manager roles", () => {
  assert.equal(allowed(base, "delete-draft").allowed, true);
  assert.equal(allowed({ ...base, actorId: 99 }, "delete-draft").reason, "owner_required");
  assert.equal(allowed({ ...base, actorId: 99, manager: true }, "delete-draft").allowed, true);
  assert.equal(allowed({ ...base, manager: true, canWrite: false }, "delete-draft").allowed, false);
});
test("policy: project reference prevents deletion, cancellation and withdrawal, but preserves archive", () => {
  for (const action of ["delete-draft", "cancel", "withdraw"] as const) assert.equal(allowed({ ...base, hasProject: true }, action).allowed, false);
  assert.equal(allowed({ ...base, hasProject: true, document: { ...base.document, status: "Approved" } }, "archive").allowed, true);
});
test("policy: submitted drafts cannot be deleted, even after withdrawal", () => {
  assert.equal(allowed({ ...base, document: { ...base.document, status: "Engineering Input", submitted: true } }, "delete-draft").reason, "draft_only");
  assert.equal(allowed({ ...base, document: { ...base.document, status: "Engineering Review" } }, "cancel").reason, "withdraw_first");
  assert.equal(allowed({ ...base, document: { ...base.document, status: "Engineering Review" } }, "withdraw").allowed, true);
});
test("policy: latest draft deletion requires an approved fallback; past revisions are not deleted", () => {
  const f = { ...base, document: { ...base.document, revision: 3, status: "Revision Required" } };
  assert.equal(allowed(f, "delete-draft").reason, "no_approved_fallback");
  assert.equal(allowed({ ...f, fallbackRevision: 2 }, "delete-draft").allowed, true);
});
test("policy: approved estimate cancellation requires both approval permission and manager role", () => {
  const f = { ...base, document: { ...base.document, status: "Approved" } };
  assert.equal(allowed(f, "cancel").reason, "approver_required");
  assert.equal(allowed({ ...f, manager: true }, "cancel").reason, "approver_required");
  assert.equal(allowed({ ...f, manager: true, canApprove: true }, "cancel").allowed, true);
});
test("policy: inquiry deletion and linked cancellation respect downstream work and estimate ownership", () => {
  const f: LifecycleFacts = { ...base, kind: "Inquiry", document: { ...base.document, status: "New" } };
  assert.equal(allowed(f, "delete-draft").allowed, true);
  assert.equal(allowed({ ...f, hasWork: true }, "delete-draft").reason, "work_started");
  assert.equal(allowed({ ...f, estimate: base.document }, "delete-draft").reason, "estimate_linked");
  assert.equal(allowed({ ...f, estimate: base.document }, "cancel-linked").allowed, true);
  assert.equal(allowed({ ...f, estimate: { ...base.document, ownerId: 99 } }, "cancel-linked").reason, "estimate_owner_required");
  assert.equal(allowed({ ...f, estimate: { ...base.document, status: "Approved" } }, "cancel-linked").reason, "cancel_estimate_first");
});
test("policy: closed documents and closed parents cannot be mutated", () => {
  for (const facts of [{ ...base, parentClosed: true }, { ...base, document: { ...base.document, deleted: true } }, { ...base, document: { ...base.document, archived: true } }]) {
    assert.ok(lifecycleOptions(facts).every(o => !o.allowed));
  }
});

type FakeRow = Record<string, unknown> & { id: number; status: string; row_version: Buffer };
function fixture(t: TestContext, options: { estimate?: boolean; revision?: number; status?: string; projects?: boolean; actorId?: number; manager?: boolean; denied?: boolean; auditFailure?: boolean } = {}) {
  let sequence = 2;
  const row = (id: number, status: string): FakeRow => ({ id, number: id === 1 ? "INQ-1" : "EST-2", project_name: "Machine", status, revision: options.revision ?? 0,
    progress: 0, owner_id: 8, created_by: 8, deleted_at: null, archived_at: null, row_version: Buffer.alloc(8, id), due_date: new Date("2026-10-01"),
    estimate_id: options.estimate === false ? null : 2, inquiry_id: 1, contingency_rate: 5, locked_at: null, locked_by: null, submitted: 0 });
  let inquiry = row(1, options.estimate === false ? "New" : "Estimating"), estimate: FakeRow | null = options.estimate === false ? null : row(2, options.status ?? "Draft");
  let projects = options.projects ? [{ id: 3, number: "PJ-3", status: "Active" }] : [];
  const fallback = options.revision ? [{ revision: 2, reviewed_by: 77, reviewed_at: new Date("2026-09-20"), description: JSON.stringify({ status: "Approved", progress: 100, contingencyRate: 3, dueDate: "2026-09-30" }) }] : [];
  let events: Record<string, unknown>[] = [], rollback = false;
  const statements: string[] = [], audits: Record<string, unknown>[] = [];
  let isolation: unknown;
  t.mock.method(sql.Request.prototype, "query", async function (this: sql.Request, statement: string) {
    statements.push(statement);
    const p = Object.fromEntries(Object.entries(this.parameters).map(([k, v]) => [k, v.value]));
    if (statement.includes("FROM dbo.inquiries i WITH")) return { recordset: [{ ...inquiry }] };
    if (statement.includes("FROM dbo.estimates e WITH")) return { recordset: estimate ? [{ ...estimate }] : [] };
    if (statement.includes("FROM dbo.projects WITH")) return { recordset: projects };
    if (statement.includes("FROM dbo.sales_intakes WITH")) return { recordset: [{ count: 0 }] };
    if (statement.includes("SELECT TOP(1) revision,description")) return { recordset: fallback };
    if (statement.includes("SELECT MAX(revision)+1 next_revision")) return { recordset: [{ next_revision: Number(estimate?.revision ?? 0) + 1 }] };
    if (statement.includes("SELECT id FROM @created")) return { recordset: [{ id: 77 }] };
    if (statement.includes("SELECT id,action,before_json")) return { recordset: events.filter(e => e.id === p.event) };
    if (statement.includes("INSERT dbo.document_lifecycle_events")) events.push({ id: events.length + 1, action: p.action, before_json: p.before, after_json: p.after, restored_at: null });
    if (statement.includes("UPDATE dbo.document_lifecycle_events")) events.find(e => e.id === p.event)!.restored_at = new Date();
    if (statement.startsWith("UPDATE dbo.inquiries SET") || statement.startsWith("UPDATE dbo.estimates SET")) {
      const target = statement.startsWith("UPDATE dbo.inquiries SET") ? inquiry : estimate!;
      if (statement.includes("status=N'Cancelled'")) target.status = "Cancelled";
      if (statement.includes("status=N'Engineering Input'")) target.status = "Engineering Input";
      if (statement.includes("revision=@next,status=N'Revision Required'")) { target.status = "Revision Required"; target.revision = p.next; }
      if (statement.includes("status=N'Estimating'")) target.status = "Estimating";
      if (statement.includes("status=N'Approved'")) target.status = "Approved";
      if (statement.includes("status=N'New'")) target.status = "New";
      if (statement.includes("deleted_at=SYSUTCDATETIME()")) target.deleted_at = new Date();
      if (statement.includes("archived_at=SYSUTCDATETIME()")) target.archived_at = new Date();
      if (statement.includes("archived_at=NULL")) target.archived_at = null;
      if (statement.includes("estimate_id=NULL")) target.estimate_id = null;
      if (statement.includes("status=@status")) Object.assign(target, { status: p.status, revision: p.revision, deleted_at: p.deleted, archived_at: p.archived,
        estimate_id: p.estimate ?? target.estimate_id, contingency_rate: p.rate ?? target.contingency_rate, locked_by: p.locker, locked_at: p.locked });
      target.row_version = Buffer.alloc(8, ++sequence);
    }
    if (statement.includes("INSERT INTO dbo.audit_log")) {
      if (options.auditFailure) throw Error("Audit unavailable");
      audits.push(p);
    }
    return { recordset: [], rowsAffected: [1] };
  });
  const database = {
    async query() { return { recordset: ["inquiry.read", "estimate.read", "inquiry.write", "estimate.write", ...(options.manager ? ["estimate.approve"] : [])].map(code => ({ code })) }; },
    async transaction(work: (tx: object) => Promise<unknown>, level: unknown) {
      isolation = level;
      const beforeI = { ...inquiry }, beforeE = estimate ? { ...estimate } : null, beforeEvents = [...events];
      try { return await work({}); } catch (e) { inquiry = beforeI; estimate = beforeE; events = beforeEvents; rollback = true; throw e; }
    },
  } as unknown as Database;
  const users = { async required() { return { id: options.actorId ?? 8, roles: options.manager ? ["Engineer", "Admin"] : ["Engineer"] }; },
    async demandPermission() { if (options.denied) throw new ApiError(403, "permission_denied", "Denied"); } } as unknown as CurrentUserService;
  const app = Fastify(); registerErrorHandler(app); registerDocumentLifecycleRoutes(app, database, users, { businessTimeZone: "Asia/Bangkok" });
  t.after(() => app.close());
  const path = options.estimate === false ? "/api/v1/inquiries/1/lifecycle" : "/api/v1/estimates/2/lifecycle";
  const preview = async (url = path) => (await app.inject({ method: "GET", url })).json();
  const post = async (action: string, url = path, extra: Record<string, unknown> = {}) => {
    const data = await preview(url);
    return app.inject({ method: "POST", url, payload: { action, reason: "Test lifecycle", token: data.token, ...extra } });
  };
  return { app, preview, post, path, statements, audits, state: () => ({ inquiry, estimate, events, rollback, isolation }),
    changeParent: () => { inquiry.row_version = Buffer.alloc(8, 99); }, linkProject: () => { projects = [{ id: 3, number: "PJ-3", status: "Active" }]; } };
}

test("API: soft delete and restore an inquiry retains identity, records reason and uses serializable transaction", async t => {
  const f = fixture(t, { estimate: false });
  const deleted = await f.post("delete-draft"); assert.equal(deleted.statusCode, 200, deleted.body);
  assert.ok(f.state().inquiry.deleted_at); assert.equal(f.state().isolation, sql.ISOLATION_LEVEL.SERIALIZABLE);
  const restored = await f.post("restore", f.path, { eventId: 1 }); assert.equal(restored.statusCode, 200, restored.body);
  assert.equal(f.state().inquiry.deleted_at, null); assert.equal(f.state().inquiry.id, 1);
  assert.ok(f.audits.every(a => String(a.after).includes("Test lifecycle")));
  assert.ok(!f.statements.some(s => /DELETE\s+FROM/i.test(s)));
});
test("API: deleting estimate draft retains its data and restore reconnects inquiry", async t => {
  const f = fixture(t); assert.equal((await f.post("delete-draft")).statusCode, 200);
  assert.equal(f.state().inquiry.estimate_id, null);
  const response = await f.post("restore", f.path, { eventId: 1 }); assert.equal(response.statusCode, 200, response.body);
  assert.equal(f.state().inquiry.estimate_id, 2); assert.equal(f.state().estimate!.deleted_at, null);
  assert.ok(!f.statements.some(s => /UPDATE dbo\.(cost_items|manhour_lines|expense_lines)/.test(s)));
});
test("API: discard latest draft switches to approved revision and can restore exactly that draft", async t => {
  const f = fixture(t, { revision: 3, status: "Revision Required" });
  assert.equal((await f.preview()).fallbackRevision, 2);
  assert.equal((await f.post("delete-draft")).statusCode, 200);
  assert.equal(f.state().estimate!.revision, 2); assert.equal(f.state().estimate!.status, "Approved");
  assert.equal(f.state().estimate!.locked_by, 77, "fallback retains its original approver");
  assert.equal(f.state().estimate!.deleted_at, null);
  assert.equal((await f.post("restore", f.path, { eventId: 1 })).statusCode, 200);
  assert.equal(f.state().estimate!.revision, 3); assert.equal(f.state().estimate!.status, "Revision Required");
});
test("API: related documents changing between preview and confirmation stop the mutation", async t => {
  const f = fixture(t); const preview = await f.preview(); f.linkProject();
  const response = await f.app.inject({ method: "POST", url: f.path, payload: { action: "delete-draft", reason: "Duplicate", token: preview.token } });
  assert.equal(response.statusCode, 409); assert.equal(response.json().code, "concurrency_conflict");
  assert.equal(f.audits.length, 0); assert.equal(f.state().estimate!.deleted_at, null);
});
test("API: changing parent after deletion prevents restore from overwriting later work", async t => {
  const f = fixture(t); await f.post("delete-draft"); f.changeParent();
  const response = await f.post("restore", f.path, { eventId: 1 });
  assert.equal(response.statusCode, 409); assert.equal(response.json().code, "restore_changed");
});
test("API: cancellation with linked draft is atomic and audited for both documents", async t => {
  const f = fixture(t); const response = await f.post("cancel-linked", "/api/v1/inquiries/1/lifecycle");
  assert.equal(response.statusCode, 200, response.body); assert.equal(f.state().inquiry.status, "Cancelled");
  assert.equal(f.state().estimate!.status, "Cancelled"); assert.equal(f.audits.length, 2);
});
test("API: withdrawal preserves submission history and clones into a fresh revision for resubmission", async t => {
  const f = fixture(t, { status: "Engineering Review" });
  const response = await f.post("withdraw"); assert.equal(response.statusCode, 200, response.body);
  assert.equal(f.state().estimate!.revision, 1); assert.equal(f.state().estimate!.status, "Revision Required");
  assert.ok(f.statements.some(s => s.includes("MERGE dbo.cost_items")));
  assert.ok(!f.statements.some(s => /(?:UPDATE|DELETE)\s+(?:FROM\s+)?dbo\.estimate_submission_snapshots/.test(s)));
});
test("API: audit failure rolls back all linked cancellation changes", async t => {
  const f = fixture(t, { auditFailure: true });
  assert.equal((await f.post("cancel-linked", "/api/v1/inquiries/1/lifecycle")).statusCode, 500);
  assert.equal(f.state().rollback, true); assert.equal(f.state().inquiry.status, "Estimating"); assert.equal(f.state().estimate!.status, "Draft");
});
test("API: archive with project keeps document visible to references and restores visibility", async t => {
  const f = fixture(t, { status: "Approved", projects: true });
  assert.equal((await f.post("archive")).statusCode, 200); assert.equal(f.state().estimate!.deleted_at, null);
  assert.equal(f.state().estimate!.status, "Approved"); assert.ok(f.state().estimate!.archived_at);
  assert.equal((await f.post("restore", f.path, { eventId: 1 })).statusCode, 200); assert.equal(f.state().estimate!.archived_at, null);
});
test("API: server rejects unauthorized owner even with a valid preview token", async t => {
  const f = fixture(t, { actorId: 99 }); const response = await f.post("delete-draft");
  assert.equal(response.statusCode, 409); assert.equal(response.json().code, "owner_required"); assert.equal(f.audits.length, 0);
});
test("API: permission denial precedes data access", async t => {
  const f = fixture(t, { denied: true });
  assert.equal((await f.app.inject({ method: "GET", url: f.path })).statusCode, 403); assert.equal(f.statements.length, 0);
});
test("API: missing reason or preview token cannot mutate", async t => {
  const f = fixture(t);
  for (const payload of [{ action: "delete-draft", token: "x" }, { action: "delete-draft", reason: "Duplicate" }])
    assert.equal((await f.app.inject({ method: "POST", url: f.path, payload })).statusCode, 400);
  assert.equal(f.statements.length, 0);
});
