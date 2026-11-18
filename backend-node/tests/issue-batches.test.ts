import assert from "node:assert/strict";
import test from "node:test";
import Fastify from "fastify";
import sql from "mssql";
import type { Database } from "../src/db.js";
import { registerErrorHandler } from "../src/errors.js";
import {
  batchIsClosed,
  canApproveIssues,
  hoursToManDays,
  issueActions,
  issueBatchInput,
  issueItemInput,
  issueItemsInput,
  MAX_BATCH_ITEMS,
  nextBatchNumber,
  nextIssueState,
  startingState,
  stateAfterEdit,
} from "../src/issue-batches.js";
import { ISSUE_BATCH_VISIBLE, registerIssueBatchRoutes } from "../src/routes/issue-batches.js";
import type { AppConfig } from "../src/config.js";
import type { CurrentUser } from "../src/types.js";
import type { CurrentUserService } from "../src/users.js";

const person = (id: number, roles: string[]): CurrentUser => ({ id, entraObjectId: "", email: `u${id}@example.com`, name: `User ${id}`, role: roles[0]!, roles, department: "IoT", isActive: true });

test("a Problem starts at once; a Requirement waits for a PM / Lead only when someone else typed it", () => {
  assert.equal(startingState("Problem", false), "Open");
  assert.equal(startingState("Problem", true), "Open");
  assert.equal(startingState("Requirement", false), "Approval");
  assert.equal(startingState("Requirement", true), "Open");
});

test("approvers are Admin, a Leader, any manager, or the batch project's manager or lead engineer", () => {
  const project = { managerId: 20, leadId: 21 };
  assert.equal(canApproveIssues(person(1, ["Engineer"]), project), false);
  assert.equal(canApproveIssues(person(1, ["Engineer"]), null), false);
  assert.equal(canApproveIssues(person(20, ["Engineer"]), project), true);
  assert.equal(canApproveIssues(person(21, ["Engineer"]), project), true);
  assert.equal(canApproveIssues(person(2, ["Engineer", "Leader"]), null), true);
  assert.equal(canApproveIssues(person(3, ["Project Manager"]), null), true);
  assert.equal(canApproveIssues(person(4, ["Admin"]), project), true);
});

test("each action moves an issue only from the states it belongs to", () => {
  assert.equal(nextIssueState("approve", "Approval", "Requirement", true), "Open");
  assert.equal(nextIssueState("approve", "Open", "Requirement", true), null);
  assert.equal(nextIssueState("reject", "Approval", "Requirement", true), "Rejected");
  assert.equal(nextIssueState("start", "Open", "Problem", false), "Doing");
  assert.equal(nextIssueState("start", "Doing", "Problem", false), null);
  assert.equal(nextIssueState("close", "Open", "Problem", false), "Done");
  assert.equal(nextIssueState("close", "Doing", "Problem", false), "Done");
  assert.equal(nextIssueState("close", "Approval", "Requirement", false), null);
  assert.equal(nextIssueState("cancel", "Approval", "Requirement", false), "Cancelled");
  assert.equal(nextIssueState("cancel", "Done", "Problem", false), null);
  // Reopening lands where a new issue of its kind would start for the person reopening it.
  assert.equal(nextIssueState("reopen", "Done", "Problem", false), "Open");
  assert.equal(nextIssueState("reopen", "Rejected", "Requirement", false), "Approval");
  assert.equal(nextIssueState("reopen", "Rejected", "Requirement", true), "Open");
  assert.equal(nextIssueState("reopen", "Doing", "Problem", true), null);
});

test("the buttons follow who the person is: PIC, author, approver", () => {
  const pic = { isApprover: false, isAssignee: true, isCreator: false, canWrite: true };
  const author = { isApprover: false, isAssignee: false, isCreator: true, canWrite: true };
  const approver = { isApprover: true, isAssignee: false, isCreator: false, canWrite: true };
  const bystander = { isApprover: false, isAssignee: false, isCreator: false, canWrite: true };
  assert.deepEqual(issueActions("Open", "Problem", pic), ["start", "close", "cancel"]);
  assert.deepEqual(issueActions("Approval", "Requirement", pic), ["cancel"]);
  assert.deepEqual(issueActions("Approval", "Requirement", approver), ["approve", "reject", "cancel"]);
  assert.deepEqual(issueActions("Open", "Problem", author), ["cancel"]);
  assert.deepEqual(issueActions("Done", "Problem", author), ["reopen"]);
  assert.deepEqual(issueActions("Open", "Problem", bystander), []);
  assert.deepEqual(issueActions("Open", "Problem", { ...approver, canWrite: false }), []);
});

test("turning a Problem into a Requirement sends it back for approval unless an approver did it", () => {
  assert.equal(stateAfterEdit("Open", "Problem", "Requirement", false), "Approval");
  assert.equal(stateAfterEdit("Doing", "Problem", "Requirement", false), "Approval");
  assert.equal(stateAfterEdit("Open", "Problem", "Requirement", true), "Open");
  assert.equal(stateAfterEdit("Open", "Requirement", "Problem", false), "Open");
});

test("a batch closes when it has issues and none still needs anyone", () => {
  assert.equal(batchIsClosed([]), false);
  assert.equal(batchIsClosed(["Done", "Cancelled", "Rejected"]), true);
  assert.equal(batchIsClosed(["Done", "Doing"]), false);
  assert.equal(batchIsClosed(["Approval"]), false);
});

test("batch numbers count up within the month and restart in a new one", () => {
  assert.equal(nextBatchNumber("202611", null), "IS-202611-0001");
  assert.equal(nextBatchNumber("202611", "IS-202611-0041"), "IS-202611-0042");
  assert.equal(nextBatchNumber("202612", "IS-202611-0041"), "IS-202612-0001");
  assert.throws(() => nextBatchNumber("2026-11", null));
});

test("hours become man-days at 8 hours to the day", () => {
  assert.equal(hoursToManDays(12), 1.5);
  assert.equal(hoursToManDays(1), 0.13);
  assert.equal(hoursToManDays(null), null);
});

test("an issue as typed: description required, a start alone is a one-day plan, an end needs a start", () => {
  assert.deepEqual(issueItemInput({ category: "Problem", description: "  Gross weight wrong  ", planStart: "2026-11-20", planHours: "4.5" }), {
    category: "Problem", description: "Gross weight wrong", functionName: "", assigneeId: null, planStart: "2026-11-20", planEnd: "2026-11-20", planHours: 4.5,
  });
  const fails = (value: unknown, field: string) => assert.throws(() => issueItemInput(value, 3), (error: { details?: { field: string; line: number } }) =>
    error.details?.field === field && error.details.line === 3);
  fails({ category: "Bug", description: "x" }, "category");
  fails({ category: "Problem", description: " " }, "description");
  fails({ category: "Problem", description: "x", planEnd: "2026-11-20" }, "planStart");
  fails({ category: "Problem", description: "x", planStart: "2026-11-21", planEnd: "2026-11-20" }, "planEnd");
  fails({ category: "Problem", description: "x", planHours: -1 }, "planHours");
  fails({ category: "Problem", description: "x", assigneeId: 0 }, "assigneeId");
  assert.throws(() => issueItemsInput([]), /at least one/);
  assert.throws(() => issueItemsInput([{ category: "Problem", description: "x" }], MAX_BATCH_ITEMS), /at most/);
});

test("a batch names a project of this system or one it does not have", () => {
  assert.equal(issueBatchInput({ projectId: 5, externalProject: "ignored", reportedOn: "2026-11-18" }).externalProject, "");
  assert.equal(issueBatchInput({ externalProject: "Old line 3 (2019)", reportedOn: "2026-11-18" }).projectId, null);
  assert.throws(() => issueBatchInput({ reportedOn: "2026-11-18" }), /project/);
  assert.throws(() => issueBatchInput({ projectId: 5 }), /Reported date/);
});

// ── Routes, with the database faked by statement ──

type Captured = { statement: string; params: Record<string, unknown> };
const config = { documentStorage: { maxFileSizeBytes: 1 } } as unknown as AppConfig;

function issueServer(t: import("node:test").TestContext, actor: CurrentUser, permissions: string[], respond: (statement: string, params: Record<string, unknown>) => unknown) {
  const captured: Captured[] = [];
  const answer = (statement: string, params: Record<string, unknown>) => {
    captured.push({ statement, params });
    return (respond(statement, params) ?? { recordset: [], recordsets: [[]] }) as { recordset: unknown[]; recordsets: unknown[][] };
  };
  t.mock.method(sql.Request.prototype, "query", async function (this: { parameters: Record<string, { value: unknown }> }, statement: string) {
    return answer(statement, Object.fromEntries(Object.entries(this.parameters).map(([key, value]) => [key, value.value])));
  });
  const database = {
    async query(statement: string, bind?: (request: unknown) => void) {
      const params: Record<string, unknown> = {};
      const request = { input(key: string, _type: unknown, value: unknown) { params[key] = value; return request; } };
      bind?.(request);
      if (statement.includes("user_effective_permissions")) return { recordset: [{ allowed: permissions.includes(String(params.permission)) }], recordsets: [] };
      return answer(statement, params);
    },
    async transaction(action: (tx: object) => Promise<unknown>) { return action({}); },
  } as unknown as Database;
  const users = {
    async required() { return actor; },
    async demandPermission(_request: unknown, permission: string) {
      if (!permissions.includes(permission)) throw Object.assign(new Error("denied"), { statusCode: 403 });
    },
  } as unknown as CurrentUserService;
  const app = Fastify();
  registerErrorHandler(app);
  registerIssueBatchRoutes(app, config, database, users);
  t.after(async () => { await app.close(); t.mock.restoreAll(); });
  return { app, captured };
}

const version = Buffer.alloc(8, 3);
const batchRow = { id: 6, batch_no: "IS-202611-0001", project_id: 29, external_project: "", customer_name: "", reported_on: "2026-11-18", reported_by: "K.Somchai",
  note: "", created_by: 7, created_by_name: "Engineer", created_at: "2026-11-18T03:00:00Z", updated_at: "2026-11-18T03:00:00Z", closed_at: null, row_version: version,
  project_no: "PJ250029", project_name: "Packing List System", project_status: "Closed", manager_id: 20, lead_engineer_id: 21, project_customer: "NTMV" };
const itemRow = (id: number, extra: Record<string, unknown>) => ({ id, batch_id: 6, line_no: id - 30, category: "Problem", function_name: "", description: "x", assignee_id: 9,
  assignee_name: "PIC", plan_start: null, plan_end: null, plan_hours: null, state: "Open", started_on: null, done_on: null, actual_hours: null, fix_note: "", reason: "",
  decided_by_name: null, decided_at: null, created_by: 7, created_by_name: "Engineer", created_at: "2026-11-18T03:00:00Z", updated_at: "2026-11-18T03:00:00Z", row_version: version, ...extra });

test("POST /issue-batches: an Engineer's Requirement waits, their Problem starts, the batch takes the month's next number", async (t) => {
  const engineer = person(7, ["Engineer"]);
  const { app, captured } = issueServer(t, engineer, ["schedule.read", "schedule.progress"], (statement) => {
    if (statement.includes("FROM dbo.projects p\n      WHERE p.id=@project") || statement.includes("SELECT p.id,p.manager_id,p.lead_engineer_id FROM dbo.projects p")) return { recordset: [{ id: 29, manager_id: 20, lead_engineer_id: 21 }], recordsets: [] };
    if (statement.includes("FROM dbo.users u JOIN OPENJSON(@ids)")) return { recordset: [{ id: 9 }], recordsets: [] };
    if (statement.includes("SELECT MAX(batch_no)")) return { recordset: [{ batch_no: "IS-209912-0007" }], recordsets: [] };
    if (statement.includes("INSERT dbo.issue_batches")) return { recordset: [{ id: 6 }], recordsets: [] };
    if (statement.includes(`SELECT b.id,b.batch_no`)) return { recordset: [batchRow], recordsets: [[batchRow], [itemRow(31, {}), itemRow(32, { category: "Requirement", state: "Approval" })], []] };
    return undefined;
  });
  const response = await app.inject({ method: "POST", url: "/api/v1/issue-batches", payload: {
    projectId: 29, reportedOn: "2026-11-18", reportedBy: "K.Somchai",
    items: [{ category: "Problem", description: "Gross weight wrong", assigneeId: 9, planStart: "2026-11-19", planHours: 4 }, { category: "Requirement", description: "Add Net weight row" }],
  } });
  assert.equal(response.statusCode, 201, response.body);
  const insert = captured.find((entry) => entry.statement.includes("INSERT dbo.issue_items"))!;
  assert.deepEqual((JSON.parse(String(insert.params.items)) as { state: string }[]).map((item) => item.state), ["Open", "Approval"]);
  const number = captured.find((entry) => entry.statement.includes("INSERT dbo.issue_batches"))!;
  assert.match(String(number.params.no), /^IS-\d{6}-0001$/);
  assert.ok(captured.some((entry) => entry.statement.includes("INSERT INTO dbo.audit_log")));
  const body = response.json();
  // The project is closed: late issues still come in against it.
  assert.equal(body.projectClosed, true);
  assert.equal(body.isApprover, false);
  assert.deepEqual(body.items.map((item: { state: string; actions: string[] }) => [item.state, item.actions]), [["Open", ["cancel"]], ["Approval", ["cancel"]]]);
});

test("POST /issue-batches refuses an issue with no description, naming its line, before the database", async (t) => {
  const { app, captured } = issueServer(t, person(7, ["Engineer"]), ["schedule.read", "schedule.progress"], () => undefined);
  const response = await app.inject({ method: "POST", url: "/api/v1/issue-batches", payload: {
    externalProject: "Old line", reportedOn: "2026-11-18", items: [{ category: "Problem", description: "ok" }, { category: "Problem", description: "" }],
  } });
  assert.equal(response.statusCode, 400);
  assert.deepEqual(response.json().details, { field: "description", line: 2 });
  assert.equal(captured.length, 0);
});

test("reading needs schedule.read; changing needs schedule.plan or schedule.progress", async (t) => {
  const { app } = issueServer(t, person(7, ["Viewer"]), ["schedule.read"], () => undefined);
  const response = await app.inject({ method: "POST", url: "/api/v1/issue-batches", payload: { externalProject: "x", reportedOn: "2026-11-18", items: [{ category: "Problem", description: "x" }] } });
  assert.equal(response.statusCode, 403);
  assert.equal(response.json().code, "issue_write");
});

test("closing an issue needs the actual end, actual hours and what was done; only its PIC, author or a PM / Lead may", async (t) => {
  const locked = { ...itemRow(31, { state: "Doing", started_on: "2026-11-18" }), batch_no: "IS-202611-0001", project_id: 29, manager_id: 20, lead_engineer_id: 21 };
  const respond = (statement: string) => {
    if (statement.includes("FROM dbo.issue_items i WITH (UPDLOCK,HOLDLOCK)")) return { recordset: [locked], recordsets: [] };
    if (statement.includes("SELECT state FROM dbo.issue_items")) return { recordset: [{ state: "Done" }, { state: "Cancelled" }], recordsets: [] };
    if (statement.includes(`SELECT b.id,b.batch_no`)) return { recordset: [batchRow], recordsets: [[batchRow], [itemRow(31, { state: "Done" })], []] };
    return undefined;
  };
  const pic = issueServer(t, person(9, ["Engineer"]), ["schedule.read", "schedule.progress"], respond);
  const rowVersion = version.toString("base64");
  const missing = await pic.app.inject({ method: "POST", url: "/api/v1/issue-items/31/close", payload: { rowVersion, doneOn: "2026-11-18", actualHours: 3 } });
  assert.equal(missing.statusCode, 400);
  assert.equal(missing.json().details.field, "fixNote");
  const early = await pic.app.inject({ method: "POST", url: "/api/v1/issue-items/31/close", payload: { rowVersion, doneOn: "2026-11-17", actualHours: 3, fixNote: "Fixed rounding" } });
  assert.equal(early.json().details.field, "doneOn");
  const done = await pic.app.inject({ method: "POST", url: "/api/v1/issue-items/31/close", payload: { rowVersion, doneOn: "2026-11-18", actualHours: 3.5, fixNote: "Fixed rounding" } });
  assert.equal(done.statusCode, 200, done.body);
  const update = pic.captured.find((entry) => entry.statement.includes("UPDATE dbo.issue_items SET state=@state"))!;
  assert.deepEqual([update.params.state, update.params.actual_hours, update.params.fix_note], ["Done", 3.5, "Fixed rounding"]);
  // Every issue left is finished, so the batch closes itself.
  const settle = pic.captured.find((entry) => entry.statement.includes("UPDATE dbo.issue_batches SET updated_at"))!;
  assert.equal(settle.params.closed, true);
});

test("an Engineer who is neither PIC nor author cannot close an issue, and nobody but a PM / Lead approves", async (t) => {
  const locked = { ...itemRow(32, { category: "Requirement", state: "Approval" }), batch_no: "IS-202611-0001", project_id: 29, manager_id: 20, lead_engineer_id: 21 };
  const respond = (statement: string) => statement.includes("FROM dbo.issue_items i WITH (UPDLOCK,HOLDLOCK)") ? { recordset: [locked], recordsets: [] } : undefined;
  const other = issueServer(t, person(12, ["Engineer"]), ["schedule.read", "schedule.progress"], respond);
  const rowVersion = version.toString("base64");
  const approve = await other.app.inject({ method: "POST", url: "/api/v1/issue-items/32/approve", payload: { rowVersion } });
  assert.equal(approve.statusCode, 403);
  const close = await other.app.inject({ method: "POST", url: "/api/v1/issue-items/32/close", payload: { rowVersion, doneOn: "2026-11-18", actualHours: 1, fixNote: "x" } });
  assert.equal(close.statusCode, 403);
  const stale = await other.app.inject({ method: "POST", url: "/api/v1/issue-items/32/cancel", payload: { rowVersion: Buffer.alloc(8, 9).toString("base64"), reason: "dup" } });
  assert.equal(stale.statusCode, 409);
  const unknown = await other.app.inject({ method: "POST", url: "/api/v1/issue-items/32/delete", payload: { rowVersion } });
  assert.equal(unknown.statusCode, 404);
});

test("the project's lead approves a Requirement; rejecting needs a reason", async (t) => {
  const locked = { ...itemRow(32, { category: "Requirement", state: "Approval" }), batch_no: "IS-202611-0001", project_id: 29, manager_id: 20, lead_engineer_id: 21 };
  const respond = (statement: string) => {
    if (statement.includes("FROM dbo.issue_items i WITH (UPDLOCK,HOLDLOCK)")) return { recordset: [locked], recordsets: [] };
    if (statement.includes("SELECT state FROM dbo.issue_items")) return { recordset: [{ state: "Open" }], recordsets: [] };
    if (statement.includes(`SELECT b.id,b.batch_no`)) return { recordset: [batchRow], recordsets: [[batchRow], [itemRow(32, { state: "Open" })], []] };
    return undefined;
  };
  const lead = issueServer(t, person(21, ["Engineer"]), ["schedule.read", "schedule.progress"], respond);
  const rowVersion = version.toString("base64");
  const reject = await lead.app.inject({ method: "POST", url: "/api/v1/issue-items/32/reject", payload: { rowVersion, reason: " " } });
  assert.equal(reject.json().details.field, "reason");
  const approve = await lead.app.inject({ method: "POST", url: "/api/v1/issue-items/32/approve", payload: { rowVersion } });
  assert.equal(approve.statusCode, 200, approve.body);
  const update = lead.captured.find((entry) => entry.statement.includes("UPDATE dbo.issue_items SET state=@state"))!;
  assert.equal(update.params.state, "Open");
  assert.match(update.statement, /decided_by=@actor,decided_at=SYSUTCDATETIME\(\)/);
});

test("GET /issue-batches scopes every read to the batches the caller may see", async (t) => {
  const { app, captured } = issueServer(t, person(7, ["Engineer"]), ["schedule.read"], (statement) =>
    statement.includes("all_count") ? { recordset: [], recordsets: [[{ all_count: 3, open_count: 2, approval_count: 1, mine_count: 1, closed_count: 1 }], []] } : undefined);
  const response = await app.inject({ method: "GET", url: "/api/v1/issue-batches?tab=approval&search=50%25" });
  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.json().tabs, { all: 3, open: 2, approval: 1, mine: 1, closed: 1 });
  assert.equal(response.json().total, 1);
  const list = captured.find((entry) => entry.statement.includes("all_count"))!;
  assert.ok(list.statement.includes(ISSUE_BATCH_VISIBLE));
  assert.match(list.statement, /AND agg\.approval_count>0/);
  assert.deepEqual([list.params.actor, list.params.elevated, list.params.like], [7, false, "%50\\%%"]);
});
