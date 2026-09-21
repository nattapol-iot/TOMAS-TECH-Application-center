// Run through scripts/Test-DocumentLifecycleLocal.ps1. Never targets an application database.
import assert from "node:assert/strict";
import Fastify from "fastify";
import { Database } from "../src/db.ts";
import { ApiError, registerErrorHandler } from "../src/errors.ts";
import { registerDocumentLifecycleRoutes, guardDocumentLifecycle } from "../src/routes/document-lifecycle.ts";
import { registerEstimateRoutes } from "../src/routes/estimates.ts";
import { registerInquiryRoutes } from "../src/routes/inquiries.ts";

const expected = process.env.LIFECYCLE_TEST_DATABASE;
assert.match(expected ?? "", /^CodexLifecycleTest_[a-f0-9]{32}$/);
const db = new Database({ connectionString: process.env.LIFECYCLE_TEST_CONNECTION, trustServerCertificate: true, readOnly: false });
const app = Fastify();
registerErrorHandler(app);
const query = async text => (await db.query(text)).recordset;
let actor, customer, serial = 0;
const checks = [];
async function seed(withEstimate = true) {
  const n = ++serial;
  const rows = await query(`DECLARE @i bigint,@e bigint;
    INSERT dbo.inquiries(inquiry_no,inquiry_date,customer_id,project_name,project_type,estimate_owner_id,due_date,priority,status,created_by,updated_by)
    VALUES(N'INQ-TEST-${n}',CONVERT(date,GETDATE()),${customer},N'Local fixture',N'IoT',${actor.id},DATEADD(day,10,GETDATE()),N'Normal',N'New',${actor.id},${actor.id});
    SET @i=SCOPE_IDENTITY();
    ${withEstimate ? `INSERT dbo.estimates(estimate_no,inquiry_id,customer_id,project_name,project_type,owner_id,created_date,due_date,status,created_by,updated_by)
      VALUES(N'EST-TEST-${n}',@i,${customer},N'Local fixture',N'IoT',${actor.id},GETDATE(),DATEADD(day,10,GETDATE()),N'Draft',${actor.id},${actor.id});
      SET @e=SCOPE_IDENTITY(); UPDATE dbo.inquiries SET estimate_id=@e,status=N'Estimating' WHERE id=@i;
      INSERT dbo.cost_items(estimate_id,revision,category_code,category,module,item_code,description,qty,unit,unit_cost,price_source,owner_id,status,created_by,updated_by)
      VALUES(@e,0,'01',N'Hardware',N'PLC',N'PLC-1',N'Fixture part',2,N'Pcs',100,N'Manual Estimate',${actor.id},N'Ready',${actor.id},${actor.id});` : ""}
    SELECT @i inquiryId,@e estimateId;`);
  return { inquiryId: Number(rows[0].inquiryId), estimateId: rows[0].estimateId ? Number(rows[0].estimateId) : null };
}
async function preview(kind, id, suffix = "") {
  const response = await app.inject({ method: "GET", url: `/api/v1/${kind}/${id}/lifecycle${suffix}` });
  assert.equal(response.statusCode, 200, response.body); return response.json();
}
async function act(kind, id, action, extra = {}, expectedStatus = 200) {
  const p = await preview(kind, id);
  const response = await app.inject({ method: "POST", url: `/api/v1/${kind}/${id}/lifecycle`, payload: { action, token: p.token, reason: "Local integration", ...extra } });
  assert.equal(response.statusCode, expectedStatus, response.body); return response.json();
}
async function latest(kind, id) {
  return Number((await query(`SELECT MAX(id) id FROM dbo.document_lifecycle_events WHERE entity_type=N'${kind}' AND entity_id=${id};`))[0].id);
}
async function check(name, work) { await work(); checks.push(name); console.log(`PASS ${name}`); }
try {
  const identity = (await query("SELECT DB_NAME() name,CAST(SERVERPROPERTY('MachineName') AS nvarchar(128)) machine;"))[0];
  assert.equal(identity.name, expected); assert.equal(identity.machine.toLowerCase(), process.env.COMPUTERNAME.toLowerCase());
  const seedIdentity = (await query(`IF NOT EXISTS(SELECT 1 FROM dbo.roles WHERE code=N'Admin') INSERT dbo.roles(code,name) VALUES(N'Admin',N'Admin');
    DECLARE @role bigint=(SELECT id FROM dbo.roles WHERE code=N'Admin');
    INSERT dbo.permissions(code) SELECT v.code FROM (VALUES(N'inquiry.read'),(N'inquiry.write'),(N'estimate.read'),(N'estimate.write'),(N'estimate.approve')) v(code)
      WHERE NOT EXISTS(SELECT 1 FROM dbo.permissions p WHERE p.code=v.code);
    INSERT dbo.role_permissions(role_id,permission_id) SELECT @role,p.id FROM dbo.permissions p WHERE NOT EXISTS(SELECT 1 FROM dbo.role_permissions rp WHERE rp.role_id=@role AND rp.permission_id=p.id);
    INSERT dbo.users(entra_object_id,email,name,role_id) VALUES(N'local-lifecycle-fixture',N'lifecycle@example.invalid',N'Lifecycle fixture',@role);
    DECLARE @actor bigint=SCOPE_IDENTITY();
    INSERT dbo.customers(code,name,created_by,updated_by) VALUES(N'LOCAL-TEST',N'Local test customer',@actor,@actor);
    SELECT @actor actorId,SCOPE_IDENTITY() customerId;`))[0];
  actor = { id: Number(seedIdentity.actorId), roles: ["Admin"], role: "Admin", name: "Lifecycle fixture", department: "Engineering", email: "lifecycle@example.invalid", isActive: true };
  customer = Number(seedIdentity.customerId);
  const users = { async required() { return actor; }, async demandPermission(_req, code) {
    const rows = await db.query("SELECT code FROM dbo.user_effective_permissions WHERE user_id=@id AND code=@code;", q => q.input("id", actor.id).input("code", code));
    if (!rows.recordset.length) throw new ApiError(403, "permission_denied", "Fixture permission missing");
  } };
  app.addHook("preHandler", req => guardDocumentLifecycle(req, db, users));
  registerDocumentLifecycleRoutes(app, db, users, { businessTimeZone: "Asia/Bangkok" });
  registerEstimateRoutes(app, { businessTimeZone: "Asia/Bangkok" }, db, users);
  registerInquiryRoutes(app, { businessTimeZone: "Asia/Bangkok" }, db, users);

  await check("SQL inquiry soft delete, searchable trash and restoration", async () => {
    const { inquiryId } = await seed(false);
    await act("inquiries", inquiryId, "delete-draft");
    const list = await app.inject({ method: "GET", url: "/api/v1/inquiries/lifecycle-records?search=INQ-TEST" });
    assert.equal(list.statusCode, 200, list.body); assert.ok(list.json().items.some(row => Number(row.documentId) === inquiryId));
    await act("inquiries", inquiryId, "restore", { eventId: await latest("Inquiry", inquiryId) });
    assert.equal((await query(`SELECT deleted_at FROM dbo.inquiries WHERE id=${inquiryId}`))[0].deleted_at, null);
  });
  await check("SQL estimate deletion preserves cost lines and restores its inquiry link", async () => {
    const { inquiryId, estimateId } = await seed();
    await act("estimates", estimateId, "delete-draft");
    assert.equal((await query(`SELECT estimate_id FROM dbo.inquiries WHERE id=${inquiryId}`))[0].estimate_id, null);
    const detail = await app.inject({ method: "GET", url: `/api/v1/inquiries/${inquiryId}` });
    assert.equal(detail.statusCode, 200, detail.body); assert.equal(detail.json().deletedEstimateId, estimateId);
    const deletedList = await app.inject({ method: "GET", url: "/api/v1/inquiries" });
    assert.equal(deletedList.statusCode, 200, deletedList.body);
    assert.equal(deletedList.json().items.find(i => i.id === inquiryId).estimateStatus, "Deleted");
    await act("estimates", estimateId, "restore", { eventId: await latest("Estimate", estimateId) });
    assert.equal(Number((await query(`SELECT estimate_id FROM dbo.inquiries WHERE id=${inquiryId}`))[0].estimate_id), estimateId);
    assert.equal(Number((await query(`SELECT SUM(line_total) total FROM dbo.cost_items WHERE estimate_id=${estimateId}`))[0].total), 200);
    await act("estimates", estimateId, "cancel");
    const cancelledList = await app.inject({ method: "GET", url: "/api/v1/inquiries" });
    assert.equal(cancelledList.statusCode, 200, cancelledList.body);
    assert.equal(cancelledList.json().items.find(i => i.id === inquiryId).estimateStatus, "Cancelled");
    assert.equal((await query(`SELECT status FROM dbo.inquiries WHERE id=${inquiryId}`))[0].status, "Estimating");
    await act("inquiries", inquiryId, "cancel");
  });
  await check("SQL linked cancellation changes both statuses and preserves both audit records", async () => {
    const { inquiryId, estimateId } = await seed();
    await act("inquiries", inquiryId, "cancel-linked");
    assert.equal((await query(`SELECT status FROM dbo.estimates WHERE id=${estimateId}`))[0].status, "Cancelled");
    assert.equal((await query(`SELECT status FROM dbo.inquiries WHERE id=${inquiryId}`))[0].status, "Cancelled");
    assert.equal(Number((await query(`SELECT COUNT(*) n FROM dbo.audit_log WHERE (entity_type=N'Inquiry' AND entity_id=${inquiryId}) OR (entity_type=N'Estimate' AND entity_id=${estimateId})`))[0].n), 2);
  });
  await check("SQL withdrawal starts a new revision without changing immutable submissions", async () => {
    const { estimateId } = await seed();
    await query(`UPDATE dbo.estimates SET status=N'Engineering Review' WHERE id=${estimateId};
      INSERT dbo.estimate_submission_snapshots(estimate_id,revision,snapshot_json,snapshot_sha256,submitted_by) VALUES(${estimateId},0,N'{}',REPLICATE('a',64),${actor.id});`);
    await act("estimates", estimateId, "withdraw");
    const row = (await query(`SELECT revision,status FROM dbo.estimates WHERE id=${estimateId}`))[0];
    assert.equal(row.revision, 1); assert.equal(row.status, "Revision Required");
    assert.equal(Number((await query(`SELECT COUNT(*) n FROM dbo.cost_items WHERE estimate_id=${estimateId}`))[0].n), 2);
    assert.equal(Number((await query(`SELECT COUNT(*) n FROM dbo.estimate_submission_snapshots WHERE estimate_id=${estimateId} AND revision=0`))[0].n), 1);
  });
  await check("SQL discard revision falls back, restores and never reuses the discarded revision number", async () => {
    const { inquiryId, estimateId } = await seed();
    await query(`INSERT dbo.estimate_revisions(estimate_id,revision,reason,description,created_by,status,total)
      VALUES(${estimateId},0,N'Approved fixture',N'{"status":"Approved","progress":100,"contingencyRate":0,"dueDate":"2026-10-01"}',${actor.id},N'Approved',200);
      UPDATE dbo.estimates SET revision=1,status=N'Revision Required' WHERE id=${estimateId};
      INSERT dbo.cost_items(estimate_id,revision,category_code,category,module,item_code,description,qty,unit,unit_cost,price_source,owner_id,status,created_by,updated_by)
      VALUES(${estimateId},1,'01',N'Hardware',N'PLC',N'PLC-1',N'Revised part',2,N'Pcs',150,N'Manual Estimate',${actor.id},N'Ready',${actor.id},${actor.id});`);
    await act("estimates", estimateId, "delete-draft");
    assert.equal((await query(`SELECT revision FROM dbo.estimates WHERE id=${estimateId}`))[0].revision, 0);
    await act("estimates", estimateId, "restore", { eventId: await latest("Estimate", estimateId) });
    assert.equal((await query(`SELECT revision FROM dbo.estimates WHERE id=${estimateId}`))[0].revision, 1);
    await act("estimates", estimateId, "delete-draft");
    const version = (await query(`SELECT row_version FROM dbo.estimates WHERE id=${estimateId}`))[0].row_version.toString("base64");
    const response = await app.inject({ method: "POST", url: `/api/v1/estimates/${estimateId}/create-revision`, payload: { rowVersion: version, comment: "Next after discard" } });
    assert.equal(response.statusCode, 200, response.body); assert.equal(response.json().revision, 2);
    assert.equal((await query(`SELECT status FROM dbo.inquiries WHERE id=${inquiryId}`))[0].status, "Estimating");
  });
  await check("SQL project references block cancellation but allow reversible archival", async () => {
    const { inquiryId, estimateId } = await seed();
    // Historical imports may contain independently valid FKs that name different inquiries.
    const other = await seed(false);
    assert.notEqual(other.inquiryId, inquiryId);
    await query(`UPDATE dbo.estimates SET status=N'Approved' WHERE id=${estimateId};
      INSERT dbo.projects(project_no,name,customer_id,project_type,status,manager_id,lead_engineer_id,inquiry_id,estimate_id,po_no,po_date,start_date,target_delivery,folder_path,created_by,updated_by)
      VALUES(N'PJ-FIXTURE',N'Fixture project',${customer},N'IoT',N'Planning',${actor.id},${actor.id},${other.inquiryId},${estimateId},N'PO-TEST',GETDATE(),GETDATE(),DATEADD(day,10,GETDATE()),N'/fixture',${actor.id},${actor.id});`);
    await act("estimates", estimateId, "cancel", {}, 409);
    await act("estimates", estimateId, "archive");
    assert.equal((await query(`SELECT deleted_at FROM dbo.estimates WHERE id=${estimateId}`))[0].deleted_at, null);
    await act("estimates", estimateId, "restore", { eventId: await latest("Estimate", estimateId) });
  });
  await check("SQL audit failure rolls back the linked cancellation", async () => {
    const { inquiryId, estimateId } = await seed();
    await query(`CREATE TRIGGER dbo.trg_lifecycle_fixture_reject_audit ON dbo.audit_log AFTER INSERT AS
      IF EXISTS(SELECT 1 FROM inserted WHERE JSON_VALUE(after_json,'$.reason')=N'force rollback') THROW 51999,'Fixture rollback',1;`);
    try {
      await act("inquiries", inquiryId, "cancel-linked", { reason: "force rollback" }, 503);
      assert.equal((await query(`SELECT status FROM dbo.estimates WHERE id=${estimateId}`))[0].status, "Draft");
      assert.equal((await query(`SELECT status FROM dbo.inquiries WHERE id=${inquiryId}`))[0].status, "Estimating");
    } finally { await query("DROP TRIGGER dbo.trg_lifecycle_fixture_reject_audit;"); }
  });
  console.log(JSON.stringify({ passed: checks.length, database: expected, checks }));
} finally { await app.close(); await db.close(); }
