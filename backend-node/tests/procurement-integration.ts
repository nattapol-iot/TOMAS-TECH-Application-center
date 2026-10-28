// Invoked only by scripts/Test-ProcurementLocalDb.ps1 against its newly created instance (schema 90, seeded by procurement-074-seed.sql).
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
import { registerPurchaseRequisitionRoutes } from "../src/routes/purchase-requisitions.js";
import { registerReportRoutes } from "../src/routes/reports.js";
import type { CurrentUser } from "../src/types.js";
import type { ErpGateway, ErpRequest } from "../src/erp-purchasing.js";

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
const erpCalls: ErpCall[] = [], erpRequests = new Map<string, ErpRequest>(), signedOut = new Set<string>();
let refuseNextCreate = false;
const gateway: ErpGateway = { async call<T>(subject: string, tool: string, args: Record<string, unknown>) {
  erpCalls.push({ subject, tool, args });
  const ok = (data: unknown) => ({ ok: true as const, data: data as T });
  if (!subject || signedOut.has(subject)) return { ok: false, kind: "signed_out", message: "Sign in with TMT ID again." };
  if (tool === "purchasing_options_get") return ok({ departments: [{ value: "APPENG", label: "Application Engineer" }, { value: "IOTENG", label: "IoT Engineer" }] });
  if (tool === "purchase_request_get") { const found = erpRequests.get(String(args.external_ref)); return found ? ok({ request: found }) : { ok: false, kind: "not_found", message: "Not found." }; }
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

const users = new CurrentUserService(database), config = { businessTimeZone: "Asia/Bangkok" } as AppConfig;
const app = Fastify({ forceCloseConnections: true }); registerErrorHandler(app);
let actors: CurrentUser[] = [];
app.addHook("onRequest", async (request) => { const actor = actors.find((a) => a.name === request.headers["x-test-actor"]); if (actor) request.currentUser = actor; });
app.addHook("onError", async (_request, _reply, error) => { if (!error.statusCode || error.statusCode >= 500) console.error("Procurement test route error:", error.message); });
registerBomRoutes(app, config, database, users); registerPurchaseRequisitionRoutes(app, config, database, users, { gateway, appBaseUrl: "https://eng.test" }); registerReportRoutes(app, config, database, users);
type Json = Record<string, unknown> & { [key: string]: any }; // eslint-disable-line @typescript-eslint/no-explicit-any
async function call(method: "GET" | "POST" | "PUT", url: string, actor: string, body?: unknown, status = 200): Promise<Json> {
  const response = await app.inject({ method, url: `/api/v1${url}`, headers: { "x-test-actor": actor }, ...(body ? { payload: body as object } : {}) });
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
  assert.deepEqual(old.lines.map((line: Json) => [line.itemCode, line.requested, line.purchaseRequired]).sort(), [["CBL-01", 60, 40], ["PLC-01", 1, 1], ["SCADA-LIC", 0, 1]]);
  assert.deepEqual(old.modules.map((m: Json) => [m.module, m.budget, m.requested]), [["Panel", 25000, 9000 + 3000], ["Software", 30000, 0]]);

  // A new BOM takes only the material categories; every line can be requested, inventory item or not.
  const bom = await call("POST", "/boms", "Requester", { projectId: fresh }, 201);
  assert.equal(bom.lineCount, 3);
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
  const submitted2 = await call("POST", `/purchase-requisitions/${pr2.id}/submit`, "Requester", { rowVersion: pr2.rowVersion });
  const submitted3 = await call("POST", `/purchase-requisitions/${pr3.id}/submit`, "Requester", { rowVersion: pr3.rowVersion });
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
  assert.equal((await call("GET", `/purchase-requisitions/${pr2.id}`, "Requester")).erp.prNo, null);
  signedOut.delete("procurement-ci-Requester");
  const sent2 = await call("POST", `/purchase-requisitions/${pr2.id}/erp-send`, "Requester", {});
  assert.deepEqual([sent2.sent, creates().at(-1)!.args.department], [true, "IOTENG"]);

  // PR 3: the Engineering Manager approves after the PM. The ERP refuses it twice; the requester sends it again under the same ref.
  await call("POST", `/purchase-requisitions/${pr3.id}/decide`, "PM", { decision: "Approve", comment: "needed for the historian" });
  await call("POST", `/purchase-requisitions/${pr3.id}/decide`, "PM", { decision: "Approve", comment: "me again" }, 403);
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
  console.log(`PASS: procurement API on LocalDB (1,000-line PR in ${elapsed} ms).`);
} finally {
  await app.close();
  bridge.stdin.end();
}
