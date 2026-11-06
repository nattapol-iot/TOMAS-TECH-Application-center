import assert from "node:assert/strict";
import test from "node:test";
import Fastify from "fastify";
import sql from "mssql";
import type { AppConfig } from "../src/config.js";
import type { Database } from "../src/db.js";
import type { EmailService, EstimateDecisionEmail, EstimateReviewEmail } from "../src/email.js";
import type { CurrentUserService } from "../src/users.js";
import { registerErrorHandler } from "../src/errors.js";
import { ESTIMATE_APPROVERS_SQL, mayDecideEstimate, waitingApprovers } from "../src/estimate-review.js";
import { registerEstimateRoutes } from "../src/routes/estimates.js";

/*
 * Owner 2026-11-06: nobody heard when an estimate was submitted, and nobody could see who had to approve it. One of the
 * listed approvers (Nattapol, Warit, Tachapon, Taweesak) decides, never on their own estimate; every approver gets a bell
 * and an email on submit, and the owner and the submitter get both on each decision.
 */

const version = Buffer.from("0000000000000001", "hex");
const approvers = [
  { id: 1, name: "Nattapol", email: "nattapol.p@tomastc.com" },
  { id: 7, name: "Tachapon", email: "tachapon.m@tomastc.com" },
  { id: 9, name: "Warit", email: "warit.c@tomastc.com" },
];

test("one listed approver decides, never on their own estimate unless they are an Admin", () => {
  assert.equal(mayDecideEstimate({ id: 9, roles: ["Engineer"] }, 7, approvers), true);
  assert.equal(mayDecideEstimate({ id: 12, roles: ["Engineering Manager"] }, 7, approvers), false);
  assert.equal(mayDecideEstimate({ id: 7, roles: ["Engineering Manager"] }, 7, approvers), false);
  assert.equal(mayDecideEstimate({ id: 1, roles: ["Admin"] }, 1, approvers), true);
  assert.deepEqual(waitingApprovers(approvers, 7, 5).map((approver) => approver.id), [1, 9]);
  assert.deepEqual(waitingApprovers(approvers, 7, 9).map((approver) => approver.id), [1]);
  // An empty list (a new database) keeps the earlier rule: everyone holding estimate.approve.
  assert.match(ESTIMATE_APPROVERS_SQL, /IF EXISTS\(SELECT 1 FROM dbo\.estimate_approvers\)/);
  assert.match(ESTIMATE_APPROVERS_SQL, /ELSE[\s\S]*p\.code=N'estimate\.approve'/);
});

function harness(t: { mock: { method: typeof import("node:test").mock.method } }, options: { actorId: number; status: string; submitterId?: number }) {
  const seen = { updated: false, bells: [] as Array<{ user: unknown; kind: unknown; title: unknown; key: unknown }>, reviewMails: [] as EstimateReviewEmail[], decisionMails: [] as EstimateDecisionEmail[] };
  const people: Record<number, { name: string; email: string }> = { 5: { name: "Somchai", email: "somchai@tomastc.com" }, 7: { name: "Tachapon", email: "tachapon.m@tomastc.com" } };
  t.mock.method(sql.Request.prototype, "query", async function (this: sql.Request, statement: string) {
    if (statement.includes("INNER JOIN dbo.inquiries i WITH")) {
      return { recordset: [{ estimate_no: "EST-2611-0004", status: options.status, progress: 90, revision: 2, owner_id: 7, inquiry_id: 3,
        inquiry_no: "RFQ-3", inquiry_status: "Engineering Review", inquiry_progress: 90, row_version: version }] };
    }
    if (statement.includes("dbo.estimate_approvers")) return { recordset: approvers };
    if (statement.includes("INNER JOIN dbo.v_estimate_totals t ON t.estimate_id=e.id WHERE e.id=@id")) {
      return { recordset: [{ project_name: "Line 3", customer_name: "Daifuku", owner_name: "Tachapon", owner_email: "tachapon.m@tomastc.com", total: 1527945.72 }] };
    }
    if (statement.includes("action=N'Submitted'")) {
      const submitter = options.submitterId === undefined ? null : people[options.submitterId];
      return { recordset: submitter ? [{ id: options.submitterId, ...submitter }] : [] };
    }
    if (statement.includes("dbo.notifications")) {
      seen.bells.push({ user: this.parameters.user?.value, kind: this.parameters.kind?.value, title: this.parameters.title?.value, key: this.parameters.key?.value });
      return { recordset: [] };
    }
    if (statement.includes("assert_estimate_totals") || statement.includes("fn_estimate_validation")) return { recordset: [] };
    if (statement.includes("unmapped_count")) return { recordset: [{ unmapped_count: 0 }] };
    if (statement.includes("UPDATE dbo.estimates SET")) { seen.updated = true; return { recordset: [{ row_version: version }] }; }
    if (statement.includes("UPDATE dbo.inquiries")) return { recordset: [], rowsAffected: [1] };
    // Snapshots, the next revision number, overhead and the cloned lines of a send-back.
    return { recordset: [{ id: 1, next_revision: 3, row_version: version, snapshot_json: "{}" }], rowsAffected: [1] };
  });
  const database = {
    async transaction(action: (transaction: object) => Promise<unknown>) { return action({}); },
    async query() { return { recordset: [] }; },
  } as unknown as Database;
  const email = {
    async sendEstimateReview(message: EstimateReviewEmail) { seen.reviewMails.push(message); return { status: "sent", recipients: [] }; },
    async sendEstimateDecision(message: EstimateDecisionEmail) { seen.decisionMails.push(message); return { status: "sent", recipients: [] }; },
  } as unknown as EmailService;
  const names: Record<number, string> = { 1: "Nattapol", 5: "Somchai", 7: "Tachapon", 9: "Warit", 12: "Someone" };
  const users = {
    async demandPermission() {},
    async required() { return { id: options.actorId, name: names[options.actorId], entraObjectId: "kc", role: "Engineer", roles: options.actorId === 1 ? ["Admin"] : ["Engineering Manager"] }; },
  } as unknown as CurrentUserService;
  const app = Fastify(); registerErrorHandler(app);
  registerEstimateRoutes(app, { businessTimeZone: "Asia/Bangkok" } as AppConfig, database, users, null, email);
  return { app, seen };
}

const post = (app: ReturnType<typeof Fastify>, action: string, comment = "") =>
  app.inject({ method: "POST", url: `/api/v1/estimates/4/${action}`, payload: { rowVersion: version.toString("base64"), comment } });

test("submitting tells every approver but the owner and the submitter, by bell and by email", async (t) => {
  const { app, seen } = harness(t, { actorId: 5, status: "Draft" });
  try {
    const response = await post(app, "submit", "Please check the PLC module");
    assert.equal(response.statusCode, 200, response.body);
    assert.equal(response.json().status, "Engineering Review");
    assert.deepEqual(seen.bells.map((bell) => bell.user), [1, 9]);
    assert.equal(seen.bells[0]!.kind, "ESTIMATE_REVIEW");
    assert.equal(seen.bells[0]!.title, "EST-2611-0004 R02 รออนุมัติ");
    assert.equal(seen.bells[0]!.key, "estimate-review:4:r2");
    assert.equal(seen.reviewMails.length, 1);
    const mail = seen.reviewMails[0]!;
    assert.deepEqual(mail.recipients.map((recipient) => recipient.email), ["nattapol.p@tomastc.com", "warit.c@tomastc.com"]);
    assert.equal(mail.submittedBy, "Somchai");
    assert.equal(mail.ownerName, "Tachapon");
    assert.equal(mail.comment, "Please check the PLC module");
  } finally { await app.close(); }
});

test("someone who is not a listed approver cannot approve, whatever their role", async (t) => {
  const { app, seen } = harness(t, { actorId: 12, status: "Engineering Review" });
  try {
    const response = await post(app, "approve");
    assert.equal(response.statusCode, 403, response.body);
    assert.match(response.body, /estimate_approver_required/);
    assert.match(response.body, /Nattapol, Tachapon, Warit/);
    assert.equal(seen.updated, false);
    assert.equal(seen.bells.length, 0);
  } finally { await app.close(); }
});

test("a listed approver on their own estimate cannot approve it", async (t) => {
  const { app, seen } = harness(t, { actorId: 7, status: "Engineering Review" });
  try {
    const response = await post(app, "approve");
    assert.equal(response.statusCode, 403, response.body);
    assert.match(response.body, /self_approval_forbidden/);
    assert.equal(seen.updated, false);
  } finally { await app.close(); }
});

test("an approval tells the owner and the submitter, by bell and by email", async (t) => {
  const { app, seen } = harness(t, { actorId: 9, status: "Engineering Review", submitterId: 5 });
  try {
    const response = await post(app, "approve", "OK to quote");
    assert.equal(response.statusCode, 200, response.body);
    assert.equal(response.json().status, "Approved");
    assert.deepEqual(seen.bells.map((bell) => bell.user), [7, 5]);
    assert.equal(seen.bells[0]!.kind, "ESTIMATE_DECISION");
    assert.equal(seen.bells[0]!.title, "EST-2611-0004 R02 อนุมัติแล้ว");
    const mail = seen.decisionMails[0]!;
    assert.equal(mail.decision, "Approved");
    assert.equal(mail.decidedBy, "Warit");
    assert.equal(mail.comment, "OK to quote");
    assert.deepEqual(mail.recipients.map((recipient) => recipient.email), ["tachapon.m@tomastc.com", "somchai@tomastc.com"]);
    assert.equal(seen.reviewMails.length, 0);
  } finally { await app.close(); }
});

test("a send-back tells the owner with the reason; the approver is never told of their own decision", async (t) => {
  const { app, seen } = harness(t, { actorId: 9, status: "Engineering Review", submitterId: 9 });
  try {
    const response = await post(app, "request-revision", "Add the travel cost");
    assert.equal(response.statusCode, 200, response.body);
    assert.equal(response.json().status, "Revision Required");
    assert.deepEqual(seen.bells.map((bell) => bell.user), [7]);
    assert.equal(seen.bells[0]!.title, "EST-2611-0004 R02 ส่งกลับให้แก้ไข");
    const mail = seen.decisionMails[0]!;
    assert.equal(mail.decision, "Revision requested");
    assert.equal(mail.comment, "Add the travel cost");
    assert.equal(mail.revision, 2);
  } finally { await app.close(); }
});

test("only a listed approver can send an estimate back", async (t) => {
  const { app, seen } = harness(t, { actorId: 12, status: "Engineering Review" });
  try {
    const response = await post(app, "request-revision", "Add the travel cost");
    assert.equal(response.statusCode, 403, response.body);
    assert.match(response.body, /estimate_approver_required/);
    assert.equal(seen.updated, false);
    assert.equal(seen.decisionMails.length, 0);
  } finally { await app.close(); }
});
