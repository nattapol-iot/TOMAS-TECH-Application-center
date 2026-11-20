// Invoked only by scripts/Test-ProcurementLocalDb.ps1 against its newly created instance (latest schema, seeded by procurement-074-seed.sql).
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createInterface } from "node:readline";
import { fileURLToPath } from "node:url";
import Fastify from "fastify";
import sql from "mssql";
import type { Database } from "../src/db.js";
import type { AppConfig } from "../src/config.js";
import { CurrentUserService } from "../src/users.js";
import { registerErrorHandler } from "../src/errors.js";
import { registerBomRoutes } from "../src/routes/boms.js";
import { registerPurchaseUnitRoutes } from "../src/routes/purchase-units.js";
import { registerPurchaseRequisitionRoutes } from "../src/routes/purchase-requisitions.js";
import { registerReportRoutes } from "../src/routes/reports.js";
import type { CurrentUser } from "../src/types.js";
import type { ErpGateway, ErpRequest } from "../src/erp-purchasing.js";
import type { PurchaseRequisitionApprovalEmail, PurchaseRequisitionDecisionEmail } from "../src/email.js";

if (!/^\(localdb\)\\IoTProcCI_[a-f0-9]{16}$/.test(process.env.PROCUREMENT_TEST_SERVER ?? "")) throw Error("Private procurement LocalDB instance required");
const bridge = spawn("pwsh", ["-NoProfile", "-File", fileURLToPath(new URL("./helpers/procurement-sql-bridge.ps1", import.meta.url))], { stdio: ["pipe", "pipe", "inherit"], windowsHide: true });
const lines = createInterface({ input: bridge.stdout });
type Result = { recordset: Record<string, unknown>[]; recordsets: Record<string, unknown>[][]; output: Record<string, unknown>; rowsAffected: number[] };
const queue: { resolve: (result: Result) => void; reject: (error: Error) => void }[] = [];
lines.on("line", (line) => {
  const pending = queue.shift(); if (!pending) return;
  try {
    const result = JSON.parse(line, (_key, value) => value && typeof value === "object" && "__binary" in value ? Buffer.from(value.__binary, "base64")
      : value && typeof value === "object" && "__date" in value ? new Date(value.__date) : value);
    if (result.error) pending.reject(Error(result.error));
    else { const sets = result.recordsets ?? []; pending.resolve({ recordset: sets[0] ?? [], recordsets: sets, output: result.output ?? {}, rowsAffected: [sets[0]?.length ?? 0] }); }
  } catch (error) { pending.reject(error as Error); }
});
bridge.on("exit", (code) => { for (const pending of queue.splice(0)) pending.reject(Error(`SQL bridge exited: ${code}`)); });
function run(statement: string, request?: sql.Request, procedure = false): Promise<Result> {
  const parameters = Object.fromEntries(Object.entries(request?.parameters ?? {}).map(([name, p]) => {
    const type = (typeof p.type === "function" ? p.type : p.type.type) as { name: string };
    const typeName = type.name;
    // mssql spells NVARCHAR(MAX) as length 65535 (sql.MAX); SqlClient needs -1 or it truncates there.
    return [name, { type: typeName, length: p.length === sql.MAX ? -1 : p.length ?? (typeName === "NVarChar" ? -1 : undefined), output: p.io === 2, ...(Buffer.isBuffer(p.value) ? { binary: p.value.toString("base64") } : { value: p.value ?? null }) }];
  }));
  return new Promise((resolve, reject) => { queue.push({ resolve, reject }); bridge.stdin.write(JSON.stringify({ sql: statement, parameters, procedure }) + "\n"); });
}
// The bridge reports result sets, not affected rows; statements whose row count the routes read end with SELECT @@ROWCOUNT through this shim.
sql.Request.prototype.query = async function (this: sql.Request, statement: string) {
  const counted = /^\s*(UPDATE|INSERT|DELETE)\b/i.test(statement) && !/\bOUTPUT\b/i.test(statement);
  const result = await run(counted ? `${statement.replace(/;\s*$/, "")}; SELECT @@ROWCOUNT affected;` : statement, this);
  if (counted) { const affected = Number(result.recordsets.at(-1)?.[0]?.affected ?? 0); return { ...result, recordset: [], recordsets: [], rowsAffected: [affected] }; }
  return result;
} as typeof sql.Request.prototype.query;
sql.Request.prototype.execute = function (this: sql.Request, procedure: string) { return run(procedure, this, true); } as typeof sql.Request.prototype.execute;
const database = {
  async query(statement: string, bind?: (q: sql.Request) => void) { const q = new sql.Request(); bind?.(q); return q.query(statement); },
  async transaction<T>(fn: (tx: sql.Transaction) => Promise<T>) { await run("BEGIN TRANSACTION"); try { const result = await fn(new sql.Transaction()); await run("COMMIT"); return result; } catch (error) { await run("IF @@TRANCOUNT>0 ROLLBACK"); throw error; } },
} as unknown as Database;

// A stand-in for the Pegasus ERP's MCP tools: one PR per external_ref, people who are signed out, and a refusal on demand.
type ErpCall = { subject: string; tool: string; args: Record<string, unknown> };
const erpCalls: ErpCall[] = [], erpRequests = new Map<string, ErpRequest>(), signedOut = new Set<string>(), deletedRefs = new Set<string>();
let refuseNextCreate = false;
// The project Request Lists the fake ERP holds, by external_ref: one item per line, as project_request_list_add answered.
const requestLists = new Map<string, Array<Record<string, unknown>>>();
const gateway: ErpGateway = { async call<T>(subject: string, tool: string, args: Record<string, unknown>) {
  erpCalls.push({ subject, tool, args });
  const ok = (data: unknown) => ({ ok: true as const, data: data as T });
  if (!subject || signedOut.has(subject)) return { ok: false, kind: "signed_out", message: "Sign in with TMT ID again." };
  if (tool === "purchasing_options_get") return ok({ departments: [{ value: "APPENG", label: "Application Engineer" }, { value: "IOTENG", label: "IoT Engineer" }] });
  if (deletedRefs.has(String(args.external_ref))) return { ok: false, kind: "ref_deleted", message: "This request was deleted in the ERP." };
  if (tool === "purchase_request_get") { const found = erpRequests.get(String(args.external_ref)); return found ? ok({ request: found }) : { ok: false, kind: "not_found", message: "Not found." }; }
  if (tool === "project_request_list_add") { const listRef = String(args.external_ref), held = requestLists.get(listRef);
    if (held) return ok({ created: false, items: held });
    const items = (args.lines as Array<Record<string, unknown>>).map((line, index) => ({ line_ref: line.line_ref, item_id: 900 + requestLists.size * 10 + index, status: "WAITING",
      status_label: "Waiting for Purchasing", orders: [], cancelled_reason: null, url: `https://erp.test/request-list/${requestLists.size}/${index}` }));
    requestLists.set(listRef, items); return ok({ created: true, items }); }
  if (tool === "project_request_list_get") { const items = requestLists.get(String(args.external_ref)); return items ? ok({ external_ref: args.external_ref, items }) : { ok: false, kind: "not_found", message: "Not found." }; }
  if (tool !== "purchase_request_create") return { ok: false, kind: "error", message: `Unexpected tool ${tool}` };
  if (refuseNextCreate) { refuseNextCreate = false; return { ok: false, kind: "validation", message: "The given data was invalid.", errors: { department: ["Unknown department."] } }; }
  const ref = String(args.external_ref), existing = erpRequests.get(ref);
  if (existing) return ok({ created: false, request: existing });
  const next = erpRequests.size + 1;
  const request: ErpRequest = { pr_id: next, pr_no: `PR2610-${String(next).padStart(4, "0")}`, external_ref: ref, status: "QUOTES_PENDING", status_label: "Quotes pending",
    revision_no: 0, requester: { employee_id: 7, name: "Requester" }, rejection_reason: null, po_no: null, url: `https://erp.test/pr/${next}` };
  erpRequests.set(ref, request);
  return ok({ created: true, request });
} };
const creates = () => erpCalls.filter((entry) => entry.tool === "purchase_request_create");

// The final approver's emails, and the requester's after each decision, kept instead of sent.
const mails: PurchaseRequisitionApprovalEmail[] = [], told: PurchaseRequisitionDecisionEmail[] = [];
const email = {
  async sendPurchaseRequisitionApproval(message: PurchaseRequisitionApprovalEmail) { mails.push(message); return { status: "sent" as const, recipients: message.recipients.map((r) => r.email) }; },
  async sendPurchaseRequisitionDecision(message: PurchaseRequisitionDecisionEmail) { told.push(message); return { status: "sent" as const, recipients: message.recipients.map((r) => r.email) }; },
};
// What the requester was told about one PR: [decision, step, waiting for, the ERP's answer, to].
const toldOf = (number: unknown) => told.filter((m) => m.prNumber === number)
  .map((m) => [m.decision, m.step, m.nextApproverName, m.erp && (m.erp.sent ? m.erp.prNo : "not sent"), m.recipients.map((r) => r.email).join()]);

const users = new CurrentUserService(database), config = { businessTimeZone: "Asia/Bangkok" } as AppConfig;
const app = Fastify({ forceCloseConnections: true }); registerErrorHandler(app);
let actors: CurrentUser[] = [];
app.addHook("onRequest", async (request) => { const actor = actors.find((a) => a.name === request.headers["x-test-actor"]); if (actor) request.currentUser = actor; });
app.addHook("onError", async (_request, _reply, error) => { if (!error.statusCode || error.statusCode >= 500) console.error("Procurement test route error:", error.message); });
registerBomRoutes(app, config, database, users); registerPurchaseUnitRoutes(app, database, users); registerPurchaseRequisitionRoutes(app, config, database, users, { gateway, appBaseUrl: "https://eng.test" }, email); registerReportRoutes(app, config, database, users);
// The same PR routes with the server told to use the ERP's Request List: by tool, and as a sheet its requester uploads.
const modeApp = (pegasusRequestList: "tool" | "excel") => { const other = Fastify({ forceCloseConnections: true }); registerErrorHandler(other);
  other.addHook("onRequest", async (request) => { const actor = actors.find((a) => a.name === request.headers["x-test-actor"]); if (actor) request.currentUser = actor; });
  other.addHook("onError", async (_request, _reply, error) => { if (!error.statusCode || error.statusCode >= 500) console.error(`Procurement test route error (${pegasusRequestList}):`, error.message); });
  registerPurchaseRequisitionRoutes(other, { ...config, pegasusRequestList } as AppConfig, database, users, { gateway, appBaseUrl: "https://eng.test" }, email); return other; };
const toolApp = modeApp("tool"), excelApp = modeApp("excel");
/** The app the calls below go to: the default (one ERP PR), or one of the two above. */
let target = app;
type Json = Record<string, unknown> & { [key: string]: any }; // eslint-disable-line @typescript-eslint/no-explicit-any
async function call(method: "GET" | "POST" | "PUT", url: string, actor: string, body?: unknown, status = 200): Promise<Json> {
  const response = await target.inject({ method, url: `/api/v1${url}`, headers: { "x-test-actor": actor }, ...(body ? { payload: body as object } : {}) });
  assert.equal(response.statusCode, status, `${method} ${url} as ${actor}: ${response.body}`);
  return response.json() as Json;
}

try {
  actors = (await run(`SELECT u.id,u.name,u.email,u.department,r.code role FROM dbo.users u JOIN dbo.roles r ON r.id=u.role_id WHERE u.email LIKE 'procurement-ci-%@test.invalid'`)).recordset
    .map((r) => ({ id: Number(r.id), name: String(r.name), email: String(r.email), department: String(r.department), role: String(r.role), roles: [String(r.role)], entraObjectId: `procurement-ci-${String(r.name)}`, isActive: true }));
  assert.equal(actors.length, 5);
  const fresh = Number((await run(`SELECT id FROM dbo.projects WHERE project_no=N'PC-FRESH'`)).recordset[0]!.id);
  const legacy = Number((await run(`SELECT id FROM dbo.boms WHERE bom_no=N'BOM-PC-LEGACY'`)).recordset[0]!.id);

  // A legacy BOM after 074: the labour line it was generated with is hidden; ordered PR lines still cover their BOM lines.
  const old = await call("GET", `/boms/${legacy}`, "Requester");
  // Its two Outsource lines (migration 108: one shown again, one added) can be requested and carry their module's budget.
  assert.deepEqual(old.lines.map((line: Json) => [line.itemCode, line.requested, line.purchaseRequired]).sort(),
    [["CBL-01", 60, 40], ["OUT-01", 0, 1], ["OUT-02", 0, 5], ["PLC-01", 1, 1], ["SCADA-LIC", 0, 1]]);
  assert.deepEqual(old.lines.filter((line: Json) => line.sectionCode === "OUT").map((line: Json) => [line.itemCode, line.module, line.nonStock, line.budget]).sort(),
    [["OUT-01", "Install", true, 12000], ["OUT-02", "Install", true, 15000]]);
  assert.deepEqual(old.modules.map((m: Json) => [m.module, m.budget, m.requested]), [["Install", 27000, 0], ["Panel", 25000, 9000 + 3000], ["Software", 30000, 0]]);
  // One budget figure (owner 2026-11-20): the BOM, its row in the list and its modules all add up the same lines, outsource
  // included. The BOM once showed the estimate's material total instead, 27,000 short here (955,902.64 against 855,902.64 live).
  assert.equal(old.bom.bomBudget, 27000 + 25000 + 30000);
  assert.equal(old.bom.approvedMaterialBudget, undefined);
  assert.equal(old.lines.reduce((sum: number, line: Json) => sum + line.budget, 0), old.bom.bomBudget);
  const legacyRow = (await call("GET", "/boms", "Requester")).find((item: Json) => item.id === legacy);
  assert.equal(legacyRow.bomBudget, old.bom.bomBudget);
  // Migration 109: the BOM seeded at revision 1 counts from 0 now, like its estimate.
  assert.deepEqual([old.bom.revision, legacyRow.revision], [0, 0]);

  // A new BOM takes the material and outsource categories (this estimate has no outsource); every line can be requested, inventory item or not.
  const bom = await call("POST", "/boms", "Requester", { projectId: fresh }, 201);
  assert.equal(bom.lineCount, 3);
  assert.equal(bom.revision, 0);
  await call("POST", `/boms/${bom.id}/release`, "PM", { rowVersion: bom.rowVersion, comment: "released for the test" });
  const workspace = await call("GET", `/boms/${bom.id}`, "Requester");
  const byCode = Object.fromEntries(workspace.lines.map((line: Json) => [line.itemCode, line])) as Record<string, Json>;
  assert.deepEqual(Object.keys(byCode).sort(), ["CBL-01", "PLC-01", "SCADA-LIC"]);
  assert.deepEqual(Object.values(byCode).map((line) => line.purchaseRequired).sort(), [1, 100, 2]);
  assert.deepEqual(workspace.modules.map((m: Json) => [m.module, m.budget, m.requested]), [["Panel", 25000, 0], ["Software", 30000, 0]]);

  // PR 1: a planned line, a substitute, an unplanned item and the software, with no supplier. Panel lands exactly on its budget.
  const pr1 = await call("POST", "/purchase-requisitions", "Requester", { bomId: bom.id, priority: "Normal", requiredDate: "2099-03-01", erpDepartment: "APPENG", lines: [
    { bomLineId: byCode["PLC-01"]!.id, quantity: 2, unitPrice: 10000 },
    { lineType: "Substitute", bomLineId: byCode["CBL-01"]!.id, partNumber: "CBL-ALT", description: "Cable drum, other make", unit: "roll", quantity: 1, unitPrice: 4500 },
    { lineType: "Unplanned", module: "panel", description: "Mounting bracket", unit: "pcs", quantity: 5, unitPrice: 100 },
    { bomLineId: byCode["SCADA-LIC"]!.id, quantity: 1, unitPrice: 30000 },
  ] }, 201);
  assert.equal(pr1.lineCount, 4); assert.equal(pr1.amount, 55000);
  let detail = await call("GET", `/purchase-requisitions/${pr1.id}`, "Requester");
  assert.deepEqual(detail.lines.map((line: Json) => [line.lineType, line.module, line.coveredQuantity, line.supplierId]),
    [["Planned", "Panel", 2, null], ["Substitute", "Panel", 100, null], ["Unplanned", "Panel", 0, null], ["Planned", "Software", 1, null]]);
  assert.equal(detail.lines[1].original.itemCode, "CBL-01");
  assert.deepEqual(detail.modules.map((m: Json) => [m.module, m.budget, m.thisRequest]), [["Panel", 25000, 25000], ["Software", 30000, 30000]]);
  assert.deepEqual(detail.ruleFlags, []);
  const after = await call("GET", `/boms/${bom.id}`, "Requester");
  assert.ok(after.lines.every((line: Json) => line.purchaseRequired === 0));
  await call("POST", "/purchase-requisitions", "Requester", { bomId: bom.id, priority: "Normal", requiredDate: "2099-03-01", lines: [{ bomLineId: byCode["PLC-01"]!.id, quantity: 1, unitPrice: 1 }] }, 409);

  // PR 2 takes Panel 8% over: the PM decides, with a comment. PR 3 takes Software 16.7% over: the Engineering Manager joins.
  const pr2 = await call("POST", "/purchase-requisitions", "Requester", { bomId: bom.id, priority: "Normal", requiredDate: "2099-03-01",
    lines: [{ lineType: "Unplanned", module: "Panel", description: "Extra terminals", unit: "lot", quantity: 1, unitPrice: 2000 }] }, 201);
  const pr3 = await call("POST", "/purchase-requisitions", "Requester", { bomId: bom.id, priority: "Normal", requiredDate: "2099-03-01",
    lines: [{ lineType: "Unplanned", module: "Software", description: "Historian add-on", unit: "set", quantity: 1, unitPrice: 5000 }] }, 201);
  // Raised first, PR 1 stays within budget even though later PRs overrun the same modules.
  assert.deepEqual((await call("GET", `/purchase-requisitions/${pr1.id}`, "Requester")).ruleFlags, []);
  const submitted1 = await call("POST", `/purchase-requisitions/${pr1.id}/submit`, "Requester", { rowVersion: pr1.rowVersion });
  // The app's own numbers do not read like an ERP PR: REQ-<project>-<round> for a request that belongs to no Unit (migration 114).
  assert.deepEqual([pr1.number, pr2.number, pr3.number], ["REQ-PC-FRESH-01", "REQ-PC-FRESH-02", "REQ-PC-FRESH-03"]);
  // A request that goes over budget is not submitted without its requester's reason; the approvers then read it.
  const unexplained = await call("POST", `/purchase-requisitions/${pr2.id}/submit`, "Requester", { rowVersion: pr2.rowVersion }, 422);
  assert.equal(unexplained.code, "justification_required"); assert.match(unexplained.message, /Panel: 2,000 THB over budget \(8\.0%\)/);
  const submitted2 = await call("POST", `/purchase-requisitions/${pr2.id}/submit`, "Requester", { rowVersion: pr2.rowVersion, justification: "Terminals were left out of the estimate" });
  const submitted3 = await call("POST", `/purchase-requisitions/${pr3.id}/submit`, "Requester", { rowVersion: pr3.rowVersion, justification: "Customer asked for the historian" });
  assert.deepEqual([(await call("GET", `/purchase-requisitions/${pr1.id}`, "Requester")).purchaseRequisition.overBudgetReason, (await call("GET", `/purchase-requisitions/${pr2.id}`, "Requester")).purchaseRequisition.overBudgetReason],
    [null, "Terminals were left out of the estimate"]);
  assert.deepEqual(submitted1.ruleFlags, []);
  assert.deepEqual(submitted2.ruleFlags.map((flag: Json) => [flag.level, flag.text]), [["manager", "Panel: 2,000 THB over budget (8.0%)"]]);
  assert.deepEqual(submitted3.ruleFlags.map((flag: Json) => [flag.level, flag.text]), [["management", "Software: 5,000 THB over budget (16.7%)"]]);
  const steps = async (id: number) => (await call("GET", `/purchase-requisitions/${id}`, "Requester")).steps.map((step: Json) => step.name);
  assert.deepEqual(await steps(pr1.id), ["Submitted by Requester", "Project Manager Approval", "Sent to ERP"]);
  assert.deepEqual(await steps(pr2.id), ["Submitted by Requester", "Project Manager Approval", "Sent to ERP"]);
  assert.deepEqual(await steps(pr3.id), ["Submitted by Requester", "Project Manager Approval", "Management Approval", "Sent to ERP"]);
  assert.equal((await call("GET", "/procurement/approvals/attention", "PM")).waiting, 3);

  // PR 1: the PM's approval is the last one, so it goes to the ERP at once, as its requester, with every line.
  const approved1 = await call("POST", `/purchase-requisitions/${pr1.id}/decide`, "PM", { decision: "Approve" });
  assert.deepEqual([approved1.status, approved1.erp.sent, approved1.erp.prNo], ["Approved", true, "PR2610-0001"]);
  await call("POST", `/purchase-requisitions/${pr1.id}/decide`, "Buyer", { decision: "Approve" }, 409);
  // The requester is told every decision: the bell, and a mail that waits for the ERP's answer.
  assert.deepEqual(toldOf(pr1.number), [["Approve", "Project Manager Approval", "", "PR2610-0001", "procurement-ci-Requester@test.invalid"]]);
  const sent1 = creates()[0]!;
  const ref1 = String(sent1.args.external_ref);
  assert.equal(sent1.subject, "procurement-ci-Requester");
  assert.match(ref1, /^ENGAPP-PR-[0-9a-f-]{36}$/);
  assert.deepEqual([sent1.args.department, sent1.args.needed_by_date, sent1.args.est_cost_url, (sent1.args.lines as unknown[]).length], ["APPENG", "2099-03-01", "https://eng.test/#/purchase", 4]);
  detail = await call("GET", `/purchase-requisitions/${pr1.id}`, "Requester");
  assert.deepEqual([detail.erp.prNo, detail.erp.status, detail.erp.ref, detail.erp.enabled], ["PR2610-0001", "QUOTES_PENDING", ref1, true]);
  assert.deepEqual([detail.steps.at(-1).status, detail.steps.at(-1).comment], ["Completed", "PR2610-0001"]);
  // Sending again returns the same ERP PR; only the requester may send it.
  assert.deepEqual(await call("POST", `/purchase-requisitions/${pr1.id}/erp-send`, "Requester", {}), { sent: true, prNo: "PR2610-0001" });
  assert.equal(creates().length, 1);
  await call("POST", `/purchase-requisitions/${pr1.id}/erp-send`, "PM", {}, 403);

  // Purchasing raises the PO in the ERP; the next person to open the PR reads it with their own token, and the PR is ordered.
  erpRequests.set(ref1, { ...erpRequests.get(ref1)!, status: "CONVERTED", status_label: "Converted", po_no: "PO2610-0007" });
  const synced = await call("POST", `/purchase-requisitions/${pr1.id}/erp-sync`, "PM", {});
  assert.deepEqual([synced.synced, synced.status, synced.erp.poNo], [true, "Converted to PO", "PO2610-0007"]);
  assert.equal(erpCalls.at(-1)!.subject, "procurement-ci-PM");
  const reads = () => erpCalls.filter((entry) => entry.tool === "purchase_request_get").length;
  const readsBefore = reads();
  await call("POST", `/purchase-requisitions/${pr1.id}/erp-sync`, "Requester", {});
  assert.equal(reads(), readsBefore, "a converted PR is not read again");
  detail = await call("GET", `/purchase-requisitions/${pr1.id}`, "Requester");
  assert.deepEqual([detail.purchaseRequisition.status, detail.purchaseRequisition.erpPoRef], ["Converted to PO", "PO2610-0007"]);
  assert.equal(Number((await run(`SELECT COUNT(*) n FROM dbo.mat_pos WHERE pr_id=${Number(pr1.id)}`)).recordset[0]!.n), 0);
  const listed = (await call("GET", "/purchase-requisitions", "Requester")) as unknown as Json[];
  assert.equal(listed.find((row) => row.id === pr1.id)!.erp.prNo, "PR2610-0001");
  // Ordered lines keep covering their BOM lines.
  assert.ok((await call("GET", `/boms/${bom.id}`, "Requester")).lines.every((line: Json) => line.purchaseRequired === 0));

  // PR 2: a flagged approval needs a comment. Its requester's TMT ID session has ended, so the PR waits Approved and they are told;
  // signed in again, they send it, and the ERP department is matched from their own.
  await call("POST", `/purchase-requisitions/${pr2.id}/decide`, "PM", { decision: "Approve" }, 400);
  signedOut.add("procurement-ci-Requester");
  const approved2 = await call("POST", `/purchase-requisitions/${pr2.id}/decide`, "PM", { decision: "Approve", comment: "terminals forgotten in the estimate" });
  assert.deepEqual([approved2.status, approved2.erp.sent, approved2.erp.kind], ["Approved", false, "signed_out"]);
  const requesterId = actors.find((actor) => actor.name === "Requester")!.id;
  assert.equal(Number((await run(`SELECT COUNT(*) n FROM dbo.notifications WHERE user_id=${requesterId} AND kind=N'PR_ERP_SEND' AND entity_type=N'PurchaseRequisition' AND entity_id=${Number(pr2.id)}`)).recordset[0]!.n), 1);
  const decisionBells = async (prId: number) => (await run(`SELECT title FROM dbo.notifications WHERE user_id=${requesterId} AND kind=N'PR_DECISION' AND entity_id=${prId} ORDER BY id`)).recordset.map((r) => String(r.title));
  assert.deepEqual([await decisionBells(pr1.id), await decisionBells(pr2.id)], [[`PR ${String(pr1.number)} อนุมัติแล้ว`], [`PR ${String(pr2.number)} อนุมัติแล้ว`]]);
  assert.deepEqual(toldOf(pr2.number).map((m) => m[3]), ["not sent"]);
  assert.equal((await call("GET", `/purchase-requisitions/${pr2.id}`, "Requester")).erp.prNo, null);
  signedOut.delete("procurement-ci-Requester");
  const sent2 = await call("POST", `/purchase-requisitions/${pr2.id}/erp-send`, "Requester", {});
  assert.deepEqual([sent2.sent, creates().at(-1)!.args.department], [true, "IOTENG"]);

  // PR 3: the Engineering Manager approves after the PM. The ERP refuses it twice; the requester sends it again under the same ref.
  await call("POST", `/purchase-requisitions/${pr3.id}/decide`, "PM", { decision: "Approve", comment: "needed for the historian" });
  await call("POST", `/purchase-requisitions/${pr3.id}/decide`, "PM", { decision: "Approve", comment: "me again" }, 403);
  assert.deepEqual(toldOf(pr3.number), [["Approve", "Project Manager Approval", "Engineering Manager", null, "procurement-ci-Requester@test.invalid"]]);
  assert.deepEqual(await decisionBells(pr3.id), [`PR ${String(pr3.number)} ผ่าน Project Manager Approval · รอ Engineering Manager`]);
  refuseNextCreate = true;
  const approved3 = await call("POST", `/purchase-requisitions/${pr3.id}/decide`, "EM", { decision: "Approve", comment: "accepted overrun" });
  assert.deepEqual([approved3.status, approved3.erp.sent, approved3.erp.kind], ["Approved", false, "validation"]);
  assert.match((await call("GET", `/purchase-requisitions/${pr3.id}`, "Requester")).erp.error, /Unknown department/);
  refuseNextCreate = true;
  await call("POST", `/purchase-requisitions/${pr3.id}/erp-send`, "Requester", { department: "APPENG" }, 422);
  assert.equal((await call("POST", `/purchase-requisitions/${pr3.id}/erp-send`, "Requester", { department: "APPENG" })).sent, true);
  assert.equal(new Set(creates().slice(-3).map((entry) => entry.args.external_ref)).size, 1, "every try of one PR carries the same external_ref");
  assert.equal((await call("GET", `/purchase-requisitions/${pr3.id}`, "Requester")).erp.error, null);

  // Opening the list reads open ERP PRs with the viewer's token: none were synced in the last 15 minutes until we age them; PR 1 is final.
  const listSync = () => call("POST", "/purchase-requisitions/erp-sync", "Requester", {});
  assert.deepEqual(await listSync(), { checked: 0, updated: 0 });
  await run(`UPDATE dbo.mat_prs SET erp_synced_at=DATEADD(hour,-1,SYSUTCDATETIME()) WHERE id IN(${Number(pr2.id)},${Number(pr3.id)})`);
  // A signed-out viewer stops the round without marking the PR, so the next open reads it.
  signedOut.add("procurement-ci-Requester");
  assert.deepEqual(await listSync(), { checked: 1, updated: 0 });
  signedOut.delete("procurement-ci-Requester");
  const ref2 = String(creates().find((entry) => entry.args.department === "IOTENG")!.args.external_ref);
  erpRequests.set(ref2, { ...erpRequests.get(ref2)!, status: "CONVERTED", status_label: "Converted", po_no: "PO2610-0008" });
  assert.deepEqual(await listSync(), { checked: 2, updated: 1 });
  assert.deepEqual(await listSync(), { checked: 0, updated: 0 }, "a PR read in the last 15 minutes is not read again");
  const row2 = ((await call("GET", "/purchase-requisitions", "Requester")) as unknown as Json[]).find((row) => row.id === pr2.id)!;
  assert.deepEqual([row2.status, row2.erpPoRef], ["Converted to PO", "PO2610-0008"]);

  // The PR cycle report counts the ERP order as the PR becoming a purchase order, and times how long each PR took to reach the ERP.
  const cycle = await call("GET", `/reports/pr-cycle-time?projectId=${fresh}`, "Requester");
  assert.equal(cycle.lifecycle.prCount, 3);
  assert.notEqual(cycle.lifecycle.averageCreatedToFirstPurchaseOrderHours, null);
  assert.ok(cycle.stages.some((stage: Json) => stage.stage === "Sent to ERP" && stage.completedCount === 3));

  // The ERP still holds PR 3, so it is neither taken back nor cancelled here: Purchasing cancels it in the ERP.
  const held = await call("GET", `/purchase-requisitions/${pr3.id}`, "Requester");
  assert.match(JSON.stringify(await call("POST", `/purchase-requisitions/${pr3.id}/withdraw`, "Requester", { rowVersion: held.purchaseRequisition.rowVersion }, 409)), /pr_in_erp/);
  assert.match(JSON.stringify(await call("POST", `/purchase-requisitions/${pr3.id}/cancel`, "Requester", { rowVersion: held.purchaseRequisition.rowVersion }, 409)), /pr_in_erp/);
  await call("PUT", `/purchase-requisitions/${pr3.id}`, "Requester", { rowVersion: held.purchaseRequisition.rowVersion, priority: "Normal", requiredDate: "2099-03-01",
    lines: [{ lineType: "Unplanned", module: "Software", description: "x", unit: "set", quantity: 1, unitPrice: 1 }] }, 409);
  // The ERP's limit is checked when a line is entered, not cut when it is sent.
  await call("POST", "/purchase-requisitions", "Requester", { bomId: bom.id, priority: "Normal", requiredDate: "2099-03-01",
    lines: [{ lineType: "Unplanned", module: "Panel", description: "Screws", unit: "pcs", quantity: 1_000_001, unitPrice: 0 }] }, 400);
  // A draft's own lines are left out of what the BOM workspace counts as requested when it is opened for editing.
  assert.equal((await call("GET", `/boms/${bom.id}?exceptPr=${Number(pr1.id)}`, "Requester")).lines.find((line: Json) => line.itemCode === "PLC-01").purchaseRequired, 2);

  // PR 4: the ERP refuses it after approval. Its requester takes it back to Draft (the ERP is asked first and does not have it),
  // corrects it and submits it again; the route is built from the new lines and the next send carries a new external_ref.
  const pr4 = await call("POST", "/purchase-requisitions", "Requester", { bomId: bom.id, priority: "Normal", requiredDate: "2099-03-01", erpDepartment: "APPENG",
    lines: [{ lineType: "Unplanned", module: "Panel", description: "Cable ties", unit: "bag", quantity: 1, unitPrice: 300 }] }, 201);
  await call("POST", `/purchase-requisitions/${pr4.id}/submit`, "Requester", { rowVersion: pr4.rowVersion, justification: "over budget in this test" });
  refuseNextCreate = true;
  const approved4 = await call("POST", `/purchase-requisitions/${pr4.id}/decide`, "PM", { decision: "Approve", comment: "ties for the panel" });
  assert.deepEqual([approved4.status, approved4.erp.sent, approved4.erp.kind], ["Approved", false, "validation"]);
  const ref4 = String(creates().at(-1)!.args.external_ref);
  let detail4 = await call("GET", `/purchase-requisitions/${pr4.id}`, "Requester");
  await call("POST", `/purchase-requisitions/${pr4.id}/withdraw`, "Buyer", { rowVersion: detail4.purchaseRequisition.rowVersion }, 403);
  const back = await call("POST", `/purchase-requisitions/${pr4.id}/withdraw`, "Requester", { rowVersion: detail4.purchaseRequisition.rowVersion, reason: "ERP refused the department" });
  assert.equal(back.status, "Draft");
  assert.deepEqual([erpCalls.at(-1)!.tool, erpCalls.at(-1)!.args.external_ref, erpCalls.at(-1)!.subject], ["purchase_request_get", ref4, "procurement-ci-Requester"]);
  detail4 = await call("GET", `/purchase-requisitions/${pr4.id}`, "Requester");
  assert.deepEqual([detail4.purchaseRequisition.status, detail4.erp.ref, detail4.erp.error, detail4.steps.length], ["Draft", null, null, 0]);
  await call("PUT", `/purchase-requisitions/${pr4.id}`, "Requester", { rowVersion: back.rowVersion, priority: "High", requiredDate: "2099-03-02", lines: [] }, 400);
  await call("PUT", `/purchase-requisitions/${pr4.id}`, "Requester", { rowVersion: pr4.rowVersion, priority: "High", requiredDate: "2099-03-02",
    lines: [{ lineType: "Unplanned", module: "Panel", description: "x", unit: "bag", quantity: 1, unitPrice: 1 }] }, 409);
  await call("PUT", `/purchase-requisitions/${pr4.id}`, "PM", { rowVersion: back.rowVersion, priority: "High", requiredDate: "2099-03-02",
    lines: [{ lineType: "Unplanned", module: "Panel", description: "x", unit: "bag", quantity: 1, unitPrice: 1 }] }, 403);
  const edited = await call("PUT", `/purchase-requisitions/${pr4.id}`, "Requester", { rowVersion: back.rowVersion, priority: "High", requiredDate: "2099-03-02", purpose: "Panel wiring",
    lines: [{ lineType: "Unplanned", module: "Panel", description: "Cable ties, UV resistant", unit: "bag", quantity: 2, unitPrice: 300 }] });
  assert.deepEqual([edited.number, edited.status, edited.lineCount, edited.amount], [pr4.number, "Draft", 1, 600]);
  detail4 = await call("GET", `/purchase-requisitions/${pr4.id}`, "Requester");
  assert.deepEqual([detail4.purchaseRequisition.priority, detail4.purchaseRequisition.purpose, detail4.lines.map((line: Json) => [line.description, line.quantity])],
    ["High", "Panel wiring", [["Cable ties, UV resistant", 2]]]);
  // With the earlier PRs Panel is now 10.4% over, so the route built on the second submit adds the Engineering Manager.
  // Its reason was given the first time; it is kept, so the corrected request goes again without asking twice.
  const resubmitted = await call("POST", `/purchase-requisitions/${pr4.id}/submit`, "Requester", { rowVersion: edited.rowVersion });
  assert.deepEqual(resubmitted.ruleFlags.map((flag: Json) => flag.level), ["management"]);
  assert.deepEqual(await steps(pr4.id), ["Submitted by Requester", "Project Manager Approval", "Management Approval", "Sent to ERP"]);
  await call("POST", `/purchase-requisitions/${pr4.id}/decide`, "PM", { decision: "Approve", comment: "ties for the panel" });
  const approved4again = await call("POST", `/purchase-requisitions/${pr4.id}/decide`, "EM", { decision: "Approve", comment: "accepted" });
  assert.equal(approved4again.erp.sent, true);
  const ref4again = String(creates().at(-1)!.args.external_ref);
  assert.notEqual(ref4again, ref4, "a PR taken back is sent under a new external_ref");
  assert.equal(((creates().at(-1)!.args.lines as Array<Record<string, unknown>>)[0]!).quantity, 2);

  // The ERP then deletes PR 4. Reading it says so; its requester cancels it, and its Panel spend goes back to the BOM.
  deletedRefs.add(ref4again);
  const deleted = await call("POST", `/purchase-requisitions/${pr4.id}/erp-sync`, "Requester", {});
  assert.deepEqual([deleted.synced, deleted.kind], [false, "ref_deleted"]);
  assert.match(String(deleted.erp.error), /deleted this requisition/);
  await run(`UPDATE dbo.mat_prs SET erp_synced_at=DATEADD(hour,-1,SYSUTCDATETIME()) WHERE id=${Number(pr4.id)}`);
  const readsBeforeList = reads();
  await listSync();
  assert.equal(reads(), readsBeforeList, "a PR the ERP deleted is not read again on every list open");
  const panelWithPr4 = (await call("GET", `/boms/${bom.id}`, "Requester")).modules.find((m: Json) => m.module === "Panel").requested;
  detail4 = await call("GET", `/purchase-requisitions/${pr4.id}`, "Requester");
  await call("POST", `/purchase-requisitions/${pr4.id}/cancel`, "Requester", { rowVersion: detail4.purchaseRequisition.rowVersion, reason: "no longer needed" });
  await call("GET", `/purchase-requisitions/${pr4.id}`, "Requester", undefined, 404);
  assert.equal(panelWithPr4 - (await call("GET", `/boms/${bom.id}`, "Requester")).modules.find((m: Json) => m.module === "Panel").requested, 600);
  // The database itself keeps the lines of a PR past Draft.
  await assert.rejects(run(`DELETE FROM dbo.mat_pr_lines WHERE pr_id=${Number(pr3.id)}`), /Only the lines of a draft purchase requisition can be removed/);

  // A thousand unplanned lines are one PR in one request; cancelling the draft returns the module's budget.
  const started = Date.now();
  const big = await call("POST", "/purchase-requisitions", "Requester", { bomId: bom.id, priority: "Normal", requiredDate: "2099-03-01",
    lines: Array.from({ length: 1000 }, (_, index) => ({ lineType: "Unplanned", module: "Panel", partNumber: `SPARE-${index + 1}`, description: `Spare part ${index + 1}`, unit: "pcs", quantity: 1, unitPrice: 1 })) }, 201);
  const elapsed = Date.now() - started;
  assert.equal(big.lineCount, 1000); assert.equal(big.amount, 1000);
  assert.ok(elapsed < 15_000, `a 1,000-line PR took ${elapsed} ms`);
  const panelBefore = (await call("GET", `/boms/${bom.id}`, "Requester")).modules.find((m: Json) => m.module === "Panel").requested;
  await call("POST", `/purchase-requisitions/${big.id}/cancel`, "Requester", { rowVersion: big.rowVersion, reason: "split per site" });
  const panelAfter = (await call("GET", `/boms/${bom.id}`, "Requester")).modules.find((m: Json) => m.module === "Panel").requested;
  assert.equal(panelBefore - panelAfter, 1000);

  // The owner's route (migration 097, 2026-11-03): the requester's department head, then the final approver, then the ERP. The head
  // here is an Engineer outside the project without procurement.approve: being named on the PR is enough to open and decide it.
  assert.equal(mails.length, 0, "the earlier route emails nobody");
  await run(`INSERT dbo.users(entra_object_id,email,name,role_id,department) SELECT N'procurement-ci-Lead',N'procurement-ci-Lead@test.invalid',N'Lead',r.id,N'IoT Engineer Dept.' FROM dbo.roles r WHERE r.code=N'Engineer'`);
  const leadId = Number((await run(`SELECT id FROM dbo.users WHERE email=N'procurement-ci-Lead@test.invalid'`)).recordset[0]!.id);
  actors.push({ id: leadId, name: "Lead", email: "procurement-ci-Lead@test.invalid", department: "IoT Engineer Dept.", role: "Engineer", roles: ["Engineer"], entraObjectId: "procurement-ci-Lead", isActive: true });
  const emId = actors.find((actor) => actor.name === "EM")!.id;
  await run(`INSERT dbo.pr_approval_settings(id,final_approver_id) VALUES(1,${emId}); INSERT dbo.pr_department_approvers(department,approver_id,final_may_decide) VALUES(N'IoT Engineer Dept.',${leadId},1)`);
  const raise = async (description: string) => {
    const pr = await call("POST", "/purchase-requisitions", "Requester", { bomId: bom.id, priority: "Normal", requiredDate: "2099-03-01", erpDepartment: "APPENG",
      lines: [{ lineType: "Unplanned", module: "Panel", description, unit: "pcs", quantity: 1, unitPrice: 10 }] }, 201);
    await call("POST", `/purchase-requisitions/${pr.id}/submit`, "Requester", { rowVersion: pr.rowVersion, justification: "over budget in this test" });
    return pr;
  };
  const bells = async (prId: number, userId: number) => Number((await run(`SELECT COUNT(*) n FROM dbo.notifications WHERE user_id=${userId} AND kind=N'PR_APPROVAL' AND entity_id=${prId}`)).recordset[0]!.n);
  const queue = async (actor: string) => (await call("GET", "/purchase-requisitions?waitingForMe=true", actor)) as unknown as Json[];
  // The PR sheet names who the requester's PR goes to.
  assert.deepEqual((await call("GET", "/purchase-requisitions/approval-route", "Requester")).approvers,
    [{ step: "Department Approval", name: "Lead" }, { step: "Final Approval", name: "EM" }]);

  // PR 5 (IoT): the final approver may decide the head's step. Both are told at once; only the final approver gets an email.
  const pr5 = await raise("Labels");
  assert.deepEqual(await steps(pr5.id), ["Submitted by Requester", "Department Approval", "Final Approval", "Sent to ERP"]);
  assert.deepEqual([await bells(pr5.id, leadId), await bells(pr5.id, emId)], [1, 1]);
  assert.deepEqual(mails.map((mail) => [mail.prNumber, mail.recipients.map((r) => r.email), mail.stepApproverName]), [[pr5.number, ["procurement-ci-EM@test.invalid"], "Lead"]]);
  assert.deepEqual((await queue("Lead")).map((row) => [row.id, row.canDecide]), [[pr5.id, true]]);
  assert.equal((await call("GET", `/purchase-requisitions/${pr5.id}`, "Lead")).purchaseRequisition.id, pr5.id);
  assert.equal((await queue("EM")).some((row) => row.id === pr5.id), true);
  await call("POST", `/purchase-requisitions/${pr5.id}/decide`, "Requester", { decision: "Approve", comment: "mine" }, 403);
  const decided5 = await call("POST", `/purchase-requisitions/${pr5.id}/decide`, "EM", { decision: "Approve", comment: "labels for the panel" });
  assert.deepEqual([decided5.status, decided5.step, decided5.erp.sent], ["Approved", "Final Approval", true]);
  const steps5 = (await call("GET", `/purchase-requisitions/${pr5.id}`, "Requester")).steps as Json[];
  assert.deepEqual(steps5.map((step) => [step.name, step.status, step.approverId]),
    [["Submitted by Requester", "Completed", requesterId], ["Department Approval", "Not Required", leadId], ["Final Approval", "Completed", emId], ["Sent to ERP", "Completed", null]]);
  assert.deepEqual(toldOf(pr5.number).map((m) => m.slice(0, 3)), [["Approve", "Final Approval", ""]]);

  // PR 6 (Mechanical, Electrical): the head decides first; then the final approver is told, by email too.
  await run(`UPDATE dbo.pr_department_approvers SET final_may_decide=0`);
  const pr6 = await raise("Glands");
  assert.deepEqual([await bells(pr6.id, leadId), await bells(pr6.id, emId), mails.length], [1, 0, 1]);
  await call("POST", `/purchase-requisitions/${pr6.id}/decide`, "EM", { decision: "Approve", comment: "too early" }, 403);
  assert.equal((await call("GET", "/procurement/approvals/attention", "Lead")).waiting, 1);
  const head6 = await call("POST", `/purchase-requisitions/${pr6.id}/decide`, "Lead", { decision: "Approve", comment: "glands for the panel" });
  assert.deepEqual([head6.status, head6.step], ["In Approval", "Department Approval"]);
  assert.deepEqual([await bells(pr6.id, emId), mails.length, mails.at(-1)!.prNumber, mails.at(-1)!.stepApproverName], [1, 2, pr6.number, ""]);
  assert.equal((await call("POST", `/purchase-requisitions/${pr6.id}/decide`, "EM", { decision: "Reject", comment: "use stock" })).status, "Rejected");
  // The requester hears of the head's approval and of the rejection, with its reason.
  assert.deepEqual(toldOf(pr6.number).map((m) => m.slice(0, 3)), [["Approve", "Department Approval", "EM"], ["Reject", "Final Approval", ""]]);
  assert.equal(told.at(-1)!.comment, "use stock");
  assert.deepEqual(await decisionBells(pr6.id), [`PR ${String(pr6.number)} ผ่าน Department Approval · รอ EM`, `PR ${String(pr6.number)} ไม่อนุมัติ`]);

  // PR 7: the final approver raises one. They may stand in for their head, and approve their own PR at the final step; nobody emails them about it.
  await run(`UPDATE dbo.pr_approval_settings SET final_approver_id=${requesterId}; UPDATE dbo.pr_department_approvers SET final_may_decide=1`);
  const pr7 = await raise("Ferrules");
  assert.deepEqual([await bells(pr7.id, leadId), await bells(pr7.id, requesterId), mails.length], [1, 0, 2]);
  const own7 = await call("POST", `/purchase-requisitions/${pr7.id}/decide`, "Requester", { decision: "Approve", comment: "own PR at the final step" });
  assert.deepEqual([own7.status, own7.erp.sent], ["Approved", true]);
  assert.deepEqual([toldOf(pr7.number), await decisionBells(pr7.id)], [[], []], "nobody tells the requester what they decided themselves");
  // A BOM generated now takes the estimate's Outsource lines with its material, and still leaves engineering hours out.
  const legacyProject = Number((await run(`SELECT project_id FROM dbo.boms WHERE id=${legacy}`)).recordset[0]!.project_id);
  await run(`UPDATE dbo.boms SET deleted_at=SYSUTCDATETIME() WHERE id=${legacy}`);
  const regenerated = await call("POST", "/boms", "Requester", { projectId: legacyProject }, 201);
  assert.equal(regenerated.lineCount, 5);
  assert.deepEqual((await call("GET", `/boms/${regenerated.id}`, "Requester")).lines.map((line: Json) => [line.itemCode, line.sectionCode, line.nonStock]).sort(),
    [["CBL-01", "HW.EL", true], ["OUT-01", "OUT", true], ["OUT-02", "OUT", true], ["PLC-01", "HW.STD", false], ["SCADA-LIC", "SW", true]]);
  // Bug 4 (migration 110): at or over the review threshold, the person who generated a BOM cannot release it.
  await run(`UPDATE dbo.boms SET deleted_at=SYSUTCDATETIME() WHERE id=${Number(regenerated.id)}`);
  const own = await call("POST", "/boms", "Admin", { projectId: legacyProject }, 201);
  assert.equal(Number((await run(`SELECT bom_review_threshold t FROM dbo.procurement_settings WHERE id=1`)).recordset[0]!.t), 100000);
  // THB 82,000 is under the starting threshold of 100,000: one person may do both. Lower the threshold to see the rule.
  await run(`UPDATE dbo.procurement_settings SET bom_review_threshold=82000 WHERE id=1`);
  const asCreator = (await call("GET", "/boms", "Admin")).find((item: Json) => item.id === own.id);
  assert.deepEqual([asCreator.bomBudget, asCreator.needsSecondReleaser], [82000, true]);
  assert.equal((await call("GET", "/boms", "PM")).find((item: Json) => item.id === own.id).needsSecondReleaser, false);
  const refused = await call("POST", `/boms/${own.id}/release`, "Admin", { rowVersion: own.rowVersion, comment: "my own" }, 403);
  assert.equal(refused.code, "bom_self_release_forbidden");
  assert.match(refused.message, /THB 82,000\.00, at or over the review threshold of THB 82,000\.00/);
  assert.equal((await run(`SELECT status FROM dbo.boms WHERE id=${Number(own.id)}`)).recordset[0]!.status, "Draft");
  // Another approver releases it.
  await call("POST", `/boms/${own.id}/release`, "PM", { rowVersion: own.rowVersion, comment: "reviewed" });
  assert.equal((await run(`SELECT status FROM dbo.boms WHERE id=${Number(own.id)}`)).recordset[0]!.status, "Released");
  // Under the threshold, the person who generated a BOM may release it.
  await run(`UPDATE dbo.boms SET deleted_at=SYSUTCDATETIME() WHERE id=${Number(own.id)}; UPDATE dbo.procurement_settings SET bom_review_threshold=100000 WHERE id=1;`);
  const small = await call("POST", "/boms", "Admin", { projectId: legacyProject }, 201);
  assert.equal((await call("GET", "/boms", "Admin")).find((item: Json) => item.id === small.id).needsSecondReleaser, false);
  await call("POST", `/boms/${small.id}/release`, "Admin", { rowVersion: small.rowVersion, comment: "under the threshold" });
  // ---- The ERP's project Request List (docs/PEGASUS_ERP_REQUEST_LIST_TH.md), behind PEGASUS_REQUEST_LIST.
  // By tool: after the final approval the lines go to the project's Request List as the requester; no ERP PR is opened.
  const prsBefore = creates().length;
  const listGets = () => erpCalls.filter((entry) => entry.tool === "project_request_list_get").length;
  const detailOf = (id: unknown) => call("GET", `/purchase-requisitions/${Number(id)}`, "Requester");
  const lastSync = (id: unknown, minutes: number) => run(`UPDATE dbo.mat_prs SET erp_synced_at=DATEADD(minute,-${minutes},SYSUTCDATETIME()) WHERE id=${Number(id)}`);
  target = toolApp;
  const pr8 = await raise("Request list by tool");
  const sent8 = await call("POST", `/purchase-requisitions/${pr8.id}/decide`, "Requester", { decision: "Approve", comment: "to the request list" });
  assert.deepEqual([sent8.status, sent8.erp.sent, sent8.erp.requestList, sent8.erp.prNo], ["Approved", true, true, undefined]);
  assert.equal(creates().length, prsBefore, "no ERP PR is opened");
  const add8 = erpCalls.filter((entry) => entry.tool === "project_request_list_add").at(-1)!, ref8 = String(add8.args.external_ref);
  assert.match(ref8, /^ENGAPP-PR-[0-9a-f-]{36}$/);
  assert.deepEqual([add8.subject, add8.args.project_no, add8.args.department, (add8.args.lines as Json[]).map((line) => [line.line_ref, line.item_description, line.quantity, line.remark])],
    ["procurement-ci-Requester", "PC-FRESH", "APPENG", [[`${ref8}-1`, "Request list by tool", 1, "Not in the estimate · Module Panel"]]]);
  let list8 = await detailOf(pr8.id);
  assert.deepEqual([list8.erp.target, list8.erp.prNo, list8.erp.statusLabel, list8.erp.requestList, list8.erp.cancelPending], ["REQUEST_LIST", null, "Request List · 0/1 ordered", "tool", false]);
  assert.deepEqual(list8.lines.map((line: Json) => [line.erp.lineRef, line.erp.status, line.erp.statusLabel, line.erp.orders]), [[`${ref8}-1`, "WAITING", "Waiting for Purchasing", []]]);
  assert.deepEqual([list8.steps.at(-1).name, list8.steps.at(-1).status, list8.steps.at(-1).comment], ["Sent to ERP", "Completed", "Request List"]);
  assert.equal((await call("GET", "/purchase-requisitions", "Requester")).find((item: Json) => item.id === pr8.id).erp.target, "REQUEST_LIST");
  // A second send (a double press, a retry after a timeout) adds nothing: the request is already there.
  assert.deepEqual([(await call("POST", `/purchase-requisitions/${pr8.id}/erp-send`, "Requester", {})).requestList, erpCalls.filter((entry) => entry.tool === "project_request_list_add").length], [true, 1]);
  // Purchasing orders the line. Inside 15 minutes of the last read the ERP is not asked again, whoever opens the request.
  requestLists.get(ref8)![0] = { ...requestLists.get(ref8)![0], status: "ORDERED", status_label: "Ordered", orders: [{ pr_no: "PR2611-0001", po_no: "PO2611-0003", quantity: 1, supplier_name: "Keyence" }] };
  assert.deepEqual([(await call("POST", `/purchase-requisitions/${pr8.id}/erp-sync`, "Requester")).cached, listGets()], [true, 0]);
  await lastSync(pr8.id, 16);
  const read8 = await call("POST", `/purchase-requisitions/${pr8.id}/erp-sync`, "PM");
  assert.deepEqual([read8.synced, read8.status, listGets(), erpCalls.at(-1)!.subject, erpCalls.at(-1)!.args.external_ref], [true, "Converted to PO", 1, "procurement-ci-PM", ref8]);
  list8 = await detailOf(pr8.id);
  // Every line ordered or cancelled: the request is fully ordered, and it is not read again.
  assert.deepEqual([list8.purchaseRequisition.status, list8.erp.statusLabel], ["Converted to PO", "Request List · 1/1 ordered"]);
  assert.deepEqual(list8.lines[0].erp.orders, [{ prNo: "PR2611-0001", poNo: "PO2611-0003", quantity: 1, supplierName: "Keyence", url: null }]);
  await lastSync(pr8.id, 16);
  assert.deepEqual([(await call("POST", `/purchase-requisitions/${pr8.id}/erp-sync`, "PM")).synced, listGets()], [true, 1]);

  // A recall after sending: the ERP has no cancel tool, so the request is marked and Purchasing cancels its line in the ERP.
  const pr9 = await raise("Request list recall");
  await call("POST", `/purchase-requisitions/${pr9.id}/decide`, "Requester", { decision: "Approve", comment: "to the request list" });
  let list9 = await detailOf(pr9.id);
  const recall = await call("POST", `/purchase-requisitions/${pr9.id}/withdraw`, "Requester", { rowVersion: list9.purchaseRequisition.rowVersion, reason: "wrong part" }, 409);
  assert.equal(recall.code, "erp_cancel_pending");
  list9 = await detailOf(pr9.id);
  assert.deepEqual([list9.purchaseRequisition.status, list9.erp.cancelPending, list9.erp.target], ["Approved", true, "REQUEST_LIST"]);
  // The PR list's read finds the cancelled line, and the request closes by itself.
  const ref9 = String(list9.erp.ref);
  requestLists.get(ref9)![0] = { ...requestLists.get(ref9)![0], status: "CANCELLED", status_label: "Cancelled", cancelled_reason: "Requester asked" };
  await lastSync(pr9.id, 16);
  const swept = await call("POST", "/purchase-requisitions/erp-sync", "Requester");
  assert.ok(swept.checked >= 1 && swept.updated >= 1, JSON.stringify(swept));
  list9 = await detailOf(pr9.id);
  assert.deepEqual([list9.purchaseRequisition.status, list9.erp.cancelPending, list9.lines[0].erp.status, list9.lines[0].erp.cancelledReason], ["Rejected", false, "CANCELLED", "Requester asked"]);

  // A project still on its placeholder number is stopped before the ERP is asked: the Request List belongs to a project.
  await run(`UPDATE dbo.projects SET project_no=N'PJ000000' WHERE id=${fresh}`);
  const pr10 = await raise("Placeholder project");
  const addsBefore = erpCalls.filter((entry) => entry.tool === "project_request_list_add").length;
  const held10 = await call("POST", `/purchase-requisitions/${pr10.id}/decide`, "Requester", { decision: "Approve", comment: "to the request list" });
  assert.deepEqual([held10.status, held10.erp.sent, held10.erp.kind], ["Approved", false, "validation"]);
  assert.match(held10.erp.message, /placeholder number PJ000000/);
  assert.equal(erpCalls.filter((entry) => entry.tool === "project_request_list_add").length, addsBefore);
  assert.match((await detailOf(pr10.id)).erp.error, /placeholder number PJ000000/);
  await run(`UPDATE dbo.projects SET project_no=N'PC-FRESH' WHERE id=${fresh}`);
  // With its real number, its requester sends it.
  assert.deepEqual([(await call("POST", `/purchase-requisitions/${pr10.id}/erp-send`, "Requester", {})).requestList, (await detailOf(pr10.id)).erp.error], [true, null]);

  // As a sheet: the ERP is asked nothing. The approved request gets its reference and line keys for the download.
  target = excelApp;
  const pr11 = await raise("Request list by sheet");
  const callsBefore = erpCalls.length;
  const sheet11 = await call("POST", `/purchase-requisitions/${pr11.id}/decide`, "Requester", { decision: "Approve", comment: "to the request list" });
  assert.deepEqual([sheet11.status, sheet11.erp.sent, sheet11.erp.kind], ["Approved", false, "excel"]);
  assert.equal(erpCalls.length, callsBefore, "the ERP is asked nothing");
  let list11 = await detailOf(pr11.id);
  assert.match(String(list11.erp.ref), /^ENGAPP-PR-/);
  assert.deepEqual([list11.erp.requestList, list11.erp.target, list11.erp.error, list11.lines[0].erp.lineRef, list11.lines[0].erp.status], ["excel", null, null, `${list11.erp.ref}-1`, null]);
  // Its requester says the sheet is uploaded; from then on it counts as sent. Nobody else may say so, and not twice.
  await call("POST", `/purchase-requisitions/${pr11.id}/request-list-uploaded`, "PM", undefined, 403);
  const uploaded11 = await call("POST", `/purchase-requisitions/${pr11.id}/request-list-uploaded`, "Requester");
  assert.deepEqual([uploaded11.erp.target, uploaded11.erp.statusLabel], ["REQUEST_LIST", "Request List"]);
  await call("POST", `/purchase-requisitions/${pr11.id}/request-list-uploaded`, "Requester", undefined, 409);
  list11 = await detailOf(pr11.id);
  assert.deepEqual([list11.purchaseRequisition.status, list11.steps.at(-1).status], ["Approved", "Completed"]);
  // An uploaded sheet cannot be read back, so opening the request asks the ERP nothing.
  assert.deepEqual([(await call("POST", `/purchase-requisitions/${pr11.id}/erp-sync`, "Requester")).synced, erpCalls.length], [false, callsBefore]);
  target = app;
  // With the switch off again, a request the Request List holds is not turned into an ERP PR by another send.
  const prsNow = creates().length;
  assert.deepEqual([(await call("POST", `/purchase-requisitions/${pr11.id}/erp-send`, "Requester", {})).requestList, creates().length], [true, prsNow]);
  // ---- Purchase Units under a Module (migration 113, owner 2026-11-20).
  const unitsOf = (project: number) => call("GET", `/projects/${project}/purchase-units`, "Requester");
  let units = await unitsOf(fresh);
  assert.deepEqual(units.modules.map((m: Json) => [m.module, m.budget, m.given, m.ungiven]), [["Panel", 25000, 0, 25000], ["Software", 30000, 0, 30000]]);
  assert.deepEqual([units.units, units.disciplines], [[], []]);
  // A Unit takes a share of its Module's budget: a drawing number and a name, or the Module's one general Unit.
  const valve = await call("POST", `/projects/${fresh}/purchase-units`, "Requester", { module: "panel", discipline: "ME", drawingNo: "MZ08-U001", unitName: "MASTER VALVE UNIT", budget: 15000 }, 201);
  assert.deepEqual([valve.module, valve.discipline, valve.drawingNo, valve.unitName, valve.isGeneral, valve.budget], ["Panel", "ME", "MZ08-U001", "MASTER VALVE UNIT", false, 15000]);
  assert.equal((await call("POST", `/projects/${fresh}/purchase-units`, "Requester", { module: "Panel", discipline: "ME", drawingNo: "MZ08-U001", unitName: "Again", budget: 1 }, 409)).code, "unit_exists");
  const general = await call("POST", `/projects/${fresh}/purchase-units`, "Requester", { module: "Panel", discipline: "ME", isGeneral: true, budget: 10000 }, 201);
  assert.deepEqual([general.unitName, general.drawingNo, general.isGeneral], ["General / Common", "", true]);
  assert.equal((await call("POST", `/projects/${fresh}/purchase-units`, "Requester", { module: "Panel", discipline: "ME", isGeneral: true, budget: 0 }, 409)).code, "unit_exists");
  // The Units of a Module cannot be given more than the Module has: 15,000 + 10,000 is all of Panel's 25,000.
  const tooMuch = await call("POST", `/projects/${fresh}/purchase-units`, "Requester", { module: "Panel", discipline: "EE", drawingNo: "EZ01", unitName: "Panel wiring", budget: 1 }, 422);
  assert.equal(tooMuch.code, "unit_budget_over_module"); assert.match(tooMuch.message, /THB 0\.00 is left for this Unit/);
  assert.equal((await call("POST", `/projects/${fresh}/purchase-units`, "Requester", { module: "Nowhere", discipline: "ME", drawingNo: "X1", unitName: "X", budget: 1 }, 422)).code, "unit_module_unknown");
  await call("POST", `/projects/${fresh}/purchase-units`, "Requester", { module: "Panel", discipline: "QA", drawingNo: "X1", unitName: "X", budget: 1 }, 400);
  await call("POST", `/projects/${fresh}/purchase-units`, "Requester", { module: "Software", discipline: "SW", unitName: "No drawing", budget: 1 }, 400);
  // The budget is corrected within what the Module still has.
  assert.equal((await call("PUT", `/purchase-units/${general.id}`, "Requester", { drawingNo: "", unitName: "General / Common", budget: 12000, rowVersion: general.rowVersion }, 422)).code, "unit_budget_over_module");
  const general9 = await call("PUT", `/purchase-units/${general.id}`, "Requester", { unitName: "Common parts", budget: 9000, rowVersion: general.rowVersion });
  assert.deepEqual([general9.unitName, general9.budget, general9.module, general9.discipline], ["Common parts", 9000, "Panel", "ME"]);
  await call("PUT", `/purchase-units/${general.id}`, "Requester", { unitName: "Stale", budget: 1, rowVersion: general.rowVersion }, 409);

  // A request is raised for a Unit. Raised within the Unit's budget it carries no Unit flag.
  const forUnit = (price: number) => call("POST", "/purchase-requisitions", "Requester", { bomId: bom.id, unitId: valve.id, priority: "Normal", requiredDate: "2099-03-01", erpDepartment: "APPENG",
    lines: [{ lineType: "Unplanned", module: "Panel", description: "Valve block", unit: "pcs", quantity: 1, unitPrice: price }] }, 201);
  const pr12 = await forUnit(12000);
  // Its number says what it is for: discipline, project, drawing, and the round for that Unit.
  assert.equal(pr12.number, "REQ-ME-PC-FRESH-MZ08-U001-01");
  let unit12 = await detailOf(pr12.id);
  assert.deepEqual(unit12.unit, { id: valve.id, module: "Panel", discipline: "ME", drawingNo: "MZ08-U001", unitName: "MASTER VALVE UNIT", budget: 15000, requestedElsewhere: 0, thisRequest: 12000 });
  assert.ok(!unit12.ruleFlags.some((flag: Json) => flag.code === "over_unit_budget"));
  assert.deepEqual((await call("GET", "/purchase-requisitions", "Requester")).filter((item: Json) => item.id === pr12.id).map((item: Json) => [item.unitId, item.unitLabel]), [[valve.id, "ME · MZ08-U001 MASTER VALVE UNIT"]]);
  // The next one takes the Unit 2,000 over what it was given: its approver is told, as for a module over its budget.
  const pr13 = await forUnit(5000);
  assert.equal(pr13.number, "REQ-ME-PC-FRESH-MZ08-U001-02");
  const unit13 = await detailOf(pr13.id);
  assert.deepEqual([unit13.unit.requestedElsewhere, unit13.unit.thisRequest], [12000, 5000]);
  assert.deepEqual(unit13.ruleFlags.filter((flag: Json) => flag.code === "over_unit_budget").map((flag: Json) => [flag.level, flag.text]), [["manager", "Unit MZ08-U001 MASTER VALVE UNIT: 2,000 THB over its budget"]]);
  // The earlier request stays within the Unit: the one that takes it over carries the overrun.
  unit12 = await detailOf(pr12.id);
  assert.ok(!unit12.ruleFlags.some((flag: Json) => flag.code === "over_unit_budget"));
  // An edit moves a draft to another Unit, or to none.
  const moved = await call("PUT", `/purchase-requisitions/${pr13.id}`, "Requester", { rowVersion: pr13.rowVersion, unitId: general.id, priority: "Normal", requiredDate: "2099-03-01",
    lines: [{ lineType: "Unplanned", module: "Panel", description: "Valve block", unit: "pcs", quantity: 1, unitPrice: 5000 }] });
  assert.deepEqual([(await detailOf(pr13.id)).unit.id, (await detailOf(pr13.id)).unit.unitName], [general.id, "Common parts"]);
  // Moved to the general Unit, the draft takes that Unit's number; moved to no Unit, the project's next one.
  assert.deepEqual([moved.number, (await detailOf(pr13.id)).purchaseRequisition.number], ["REQ-ME-PC-FRESH-GEN-01", "REQ-ME-PC-FRESH-GEN-01"]);
  await call("PUT", `/purchase-requisitions/${pr13.id}`, "Requester", { rowVersion: moved.rowVersion, priority: "Normal", requiredDate: "2099-03-01",
    lines: [{ lineType: "Unplanned", module: "Panel", description: "Valve block", unit: "pcs", quantity: 1, unitPrice: 5000 }] });
  assert.equal((await detailOf(pr13.id)).unit, null);
  assert.match(String((await detailOf(pr13.id)).purchaseRequisition.number), /^REQ-PC-FRESH-[0-9]{2}$/);
  // The Unit's next request does not reuse a round a moved or cancelled request once held.
  const pr14 = await forUnit(1);
  assert.equal(pr14.number, "REQ-ME-PC-FRESH-MZ08-U001-02");
  // A request over its Unit's budget needs its reason too.
  await call("POST", `/purchase-requisitions/${pr14.id}/cancel`, "Requester", { rowVersion: pr14.rowVersion, reason: "only for the number" });
  const pr15 = await forUnit(5000);
  assert.equal(pr15.number, "REQ-ME-PC-FRESH-MZ08-U001-03");
  assert.match((await call("POST", `/purchase-requisitions/${pr15.id}/submit`, "Requester", { rowVersion: pr15.rowVersion }, 422)).message, /Unit MZ08-U001 MASTER VALVE UNIT: 2,000 THB over its budget/);
  await call("POST", `/purchase-requisitions/${pr15.id}/cancel`, "Requester", { rowVersion: pr15.rowVersion, reason: "only for the reason check" });

  // The project's picture: each Unit, each Module's share given out, and each discipline's total.
  units = await unitsOf(fresh);
  assert.deepEqual(units.units.map((unit: Json) => [unit.discipline, unit.drawingNo, unit.unitName, unit.budget, unit.requests, unit.requested, unit.approved, unit.ordered, unit.remaining]),
    [["ME", "", "Common parts", 9000, 0, 0, 0, 0, 9000], ["ME", "MZ08-U001", "MASTER VALVE UNIT", 15000, 1, 12000, 0, 0, 3000]]);
  assert.deepEqual(units.modules.map((m: Json) => [m.module, m.budget, m.given, m.ungiven]), [["Panel", 25000, 24000, 1000], ["Software", 30000, 0, 30000]]);
  // What still waits to be ordered, the earliest date it is needed by, and each Unit's requests for the drill-down (cached ERP status only).
  assert.deepEqual(units.disciplines, [{ discipline: "ME", units: 2, budget: 24000, requested: 12000, approved: 0, ordered: 0, remaining: 12000, waitingLines: 1, nearestNeedBy: "2099-03-01" }]);
  assert.deepEqual(units.units.map((unit: Json) => [unit.unitName, unit.waitingLines, unit.nearestNeedBy, unit.requestList.map((item: Json) => [item.number, item.status, item.requiredDate, item.amount, item.lines, item.waitingLines])]),
    [["Common parts", 0, null, []], ["MASTER VALVE UNIT", 1, "2099-03-01", [["REQ-ME-PC-FRESH-MZ08-U001-01", "Draft", "2099-03-01", 12000, 1, 1]]]]);
  // A line the ERP has ordered no longer waits; a cancelled one neither.
  await run(`UPDATE dbo.mat_pr_lines SET erp_line_status=N'ORDERED' WHERE pr_id=${Number(pr12.id)}`);
  assert.deepEqual((await unitsOf(fresh)).units.map((unit: Json) => [unit.unitName, unit.waitingLines, unit.nearestNeedBy, unit.ordered]), [["Common parts", 0, null, 0], ["MASTER VALVE UNIT", 0, null, 12000]]);
  await run(`UPDATE dbo.mat_pr_lines SET erp_line_status=NULL WHERE pr_id=${Number(pr12.id)}`);

  // A Unit belongs to one project, and one with requests cannot be removed.
  const elsewhere = await call("POST", `/projects/${legacyProject}/purchase-units`, "Requester", { module: "Install", discipline: "IN", drawingNo: "IN-01", unitName: "Site work", budget: 1000 }, 201);
  assert.equal((await call("POST", "/purchase-requisitions", "Requester", { bomId: bom.id, unitId: elsewhere.id, priority: "Normal", requiredDate: "2099-03-01",
    lines: [{ lineType: "Unplanned", module: "Panel", description: "Wrong unit", unit: "pcs", quantity: 1, unitPrice: 1 }] }, 422)).code, "unit_not_in_project");
  assert.equal((await call("POST", `/purchase-units/${valve.id}/remove`, "Requester", { rowVersion: valve.rowVersion }, 409)).code, "unit_in_use");
  assert.equal((await call("POST", `/purchase-units/${elsewhere.id}/remove`, "Requester", { rowVersion: elsewhere.rowVersion })).removed, true);
  assert.deepEqual((await unitsOf(legacyProject)).units, []);
  // Its drawing number is free again for a new Unit.
  await call("POST", `/projects/${legacyProject}/purchase-units`, "Requester", { module: "Install", discipline: "IN", drawingNo: "IN-01", unitName: "Site work again", budget: 500 }, 201);
  // The PR-Form's line fields and part lines (migration 115, owner 2026-11-20): a manifold and its valves on one request for the Unit.
  // The parts keep the line they belong to through an edit, and a valve needed early brings the Unit's need-by date forward.
  const formLines = [
    { lineType: "Unplanned", module: "Panel", partNumber: "MANIFOLD-8", description: "Valve manifold", unit: "pcs", quantity: 1, unitPrice: 100, material: "A5052", treatment: "Anodize",
      detail: "8 stations", quantityPerSet: 1, attachmentUrl: "https://example.sharepoint.com/sites/eng/drawing.pdf" },
    { lineType: "Unplanned", module: "Panel", partNumber: "VALVE-A", description: "Valve", unit: "pcs", quantity: 8, unitPrice: 10, quantityPerSet: 8, needBy: "2099-02-01", parentIndex: 0 },
    { lineType: "Unplanned", module: "Panel", partNumber: "SILENCER", description: "Silencer", unit: "pcs", quantity: 2, unitPrice: 5, parentIndex: 0 },
  ];
  const formed = await call("POST", "/purchase-requisitions", "Requester", { bomId: bom.id, unitId: valve.id, priority: "Normal", requiredDate: "2099-03-01", lines: formLines }, 201);
  let formedDetail = await call("GET", `/purchase-requisitions/${formed.id}`, "Requester");
  let formIds = formedDetail.lines.map((line: Json) => line.id);
  assert.deepEqual(formedDetail.lines.map((line: Json) => [line.partNumber, line.material, line.treatment, line.detail, line.quantityPerSet, line.needBy, line.attachmentUrl, line.parentLineId]), [
    ["MANIFOLD-8", "A5052", "Anodize", "8 stations", 1, null, "https://example.sharepoint.com/sites/eng/drawing.pdf", null],
    ["VALVE-A", null, null, null, 8, "2099-02-01", null, formIds[0]],
    ["SILENCER", null, null, null, null, null, null, formIds[0]]]);
  assert.equal((await unitsOf(fresh)).units.find((unit: Json) => unit.unitName === "MASTER VALVE UNIT").nearestNeedBy, "2099-02-01");
  // A part of a part, and a link that is not a web link, are refused; the database keeps a part on a line of the same request, not itself.
  await call("POST", "/purchase-requisitions", "Requester", { bomId: bom.id, priority: "Normal", requiredDate: "2099-03-01",
    lines: [formLines[0], formLines[1], { ...formLines[2], parentIndex: 1 }] }, 400);
  await call("POST", "/purchase-requisitions", "Requester", { bomId: bom.id, priority: "Normal", requiredDate: "2099-03-01",
    lines: [{ ...formLines[0], attachmentUrl: "file://server/drawing.pdf" }] }, 400);
  await assert.rejects(run(`UPDATE dbo.mat_pr_lines SET parent_line_id=${formIds[0]} WHERE id=${formIds[0]}`), /CK_mat_pr_lines_form_fields/);
  await assert.rejects(run(`UPDATE dbo.mat_pr_lines SET parent_line_id=${formIds[0]} WHERE id=(SELECT MIN(id) FROM dbo.mat_pr_lines WHERE pr_id=${Number(pr12.id)})`), /FK_mat_pr_lines_parent/);
  // Editing the draft replaces its lines, parts included: the silencer becomes a line of its own.
  const reworked = await call("PUT", `/purchase-requisitions/${formed.id}`, "Requester", { rowVersion: formed.rowVersion, priority: "Normal", requiredDate: "2099-03-01",
    lines: [formLines[0], formLines[1], { ...formLines[2], parentIndex: null }] });
  formedDetail = await call("GET", `/purchase-requisitions/${formed.id}`, "Requester");
  formIds = formedDetail.lines.map((line: Json) => line.id);
  assert.deepEqual(formedDetail.lines.map((line: Json) => [line.partNumber, line.parentLineId]), [["MANIFOLD-8", null], ["VALVE-A", formIds[0]], ["SILENCER", null]]);
  await call("POST", `/purchase-requisitions/${formed.id}/cancel`, "Requester", { rowVersion: reworked.rowVersion, reason: "only for the form fields check" });
  console.log(`PASS: procurement API on LocalDB (1,000-line PR in ${elapsed} ms).`);
} finally {
  await app.close(); await toolApp.close(); await excelApp.close();
  bridge.stdin.end();
}
