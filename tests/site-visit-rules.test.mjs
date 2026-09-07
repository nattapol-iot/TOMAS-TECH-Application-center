import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

/*
 * Behavioural tests for the shared rule module. The file is TypeScript, so it
 * is transpiled and imported the same way tests/network-origin.test.mjs does —
 * these exercise the real functions, not a copy of them.
 *
 * The API re-decides every one of these rules server-side. What is proven here
 * is that the rule table itself says what we think it says: an edge that does
 * not exist cannot be walked, a blocker really blocks, and two appointments
 * that touch really do conflict once travel time is counted.
 */
const sourceUrl = new URL("../lib/site-visit-rules.ts", import.meta.url);
const source = await readFile(sourceUrl, "utf8");
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  fileName: "site-visit-rules.ts",
}).outputText;
const moduleUrl = `data:text/javascript;base64,${Buffer.from(compiled).toString("base64")}`;
const rules = await import(moduleUrl);

const ALL = rules.SITE_VISIT_PERMISSIONS;

/* ------------------------------------------------------------------ *
 * Workflow status transitions
 * ------------------------------------------------------------------ */

test("an intake may only move along a declared edge", () => {
  assert.equal(rules.decideIntakeTransition("Draft", "Pending Technical Review", ALL).allowed, true);

  // Skipping technical review entirely is the transition the whole module
  // exists to prevent, and there is simply no edge for it.
  const skipped = rules.decideIntakeTransition("Draft", "Ready to Schedule", ALL);
  assert.equal(skipped.allowed, false);
  assert.equal(skipped.code, "not_allowed");

  const fromNowhere = rules.decideIntakeTransition("Nonsense", "Draft", ALL);
  assert.equal(fromNowhere.allowed, false);
  assert.equal(fromNowhere.code, "unknown_status");

  // Terminal states are terminal.
  assert.deepEqual(rules.INTAKE_TRANSITIONS.Cancelled, []);
  assert.deepEqual(rules.INTAKE_TRANSITIONS.Closed, []);
});

test("a transition is refused without the permission that authorises it", () => {
  // Sales can submit their own intake…
  assert.equal(rules.decideIntakeTransition("Draft", "Pending Technical Review", ["intake.write"]).allowed, true);
  // …but cannot then approve it for scheduling.
  const approve = rules.decideIntakeTransition("Pending Technical Review", "Ready to Schedule", ["intake.write"]);
  assert.equal(approve.allowed, false);
  assert.equal(approve.code, "permission_denied");
  assert.match(approve.message, /intake\.review/);
});

test("sales cannot finally assign an engineer or schedule a visit", () => {
  const salesPermissions = ["intake.read", "intake.write", "visit.read"];
  // Moving an intake to Scheduled needs visit.schedule, which sales lacks.
  const scheduled = rules.decideIntakeTransition("Ready to Schedule", "Scheduled", salesPermissions);
  assert.equal(scheduled.allowed, false);
  assert.equal(scheduled.code, "permission_denied");

  // And every edge out of Tentative on the visit needs visit.schedule too.
  const available = rules.availableTransitions(rules.VISIT_TRANSITIONS, "Tentative", salesPermissions);
  assert.deepEqual(available, []);
});

test("returning an intake, and every cancel, demands a written reason", () => {
  const noReason = rules.decideIntakeTransition("Pending Technical Review", "More Information Required", ALL);
  assert.equal(noReason.allowed, false);
  assert.equal(noReason.code, "reason_required");

  const withReason = rules.decideIntakeTransition(
    "Pending Technical Review", "More Information Required", ALL, "No expected result was given");
  assert.equal(withReason.allowed, true);

  // Approving does not need one — only the negative outcomes do.
  assert.equal(rules.decideIntakeTransition("Pending Technical Review", "Ready to Schedule", ALL).allowed, true);
});

test("the visit workflow runs confirm, execute, report, approve in order", () => {
  const path = [
    ["Tentative", "Pending Engineer Confirmation"],
    ["Pending Engineer Confirmation", "Pending Customer Confirmation"],
    ["Pending Customer Confirmation", "Confirmed"],
    ["Confirmed", "In Progress"],
    ["In Progress", "Report Pending"],
    ["Report Pending", "Report Under Review"],
    ["Report Under Review", "Completed"],
    ["Completed", "Closed"],
  ];
  for (const [from, to] of path) {
    assert.equal(rules.decideVisitTransition(from, to, ALL, "reason").allowed, true, `${from} -> ${to}`);
  }

  // A visit cannot jump from Confirmed straight to Completed: it has to be
  // checked out of and reported on first.
  assert.equal(rules.decideVisitTransition("Confirmed", "Completed", ALL, "reason").allowed, false);
  // Nor can an engineer approve their own report by moving the visit directly.
  assert.equal(rules.decideVisitTransition("Report Pending", "Completed", ALL, "reason").allowed, false);
});

test("checking in and out belongs to visit.execute, approving the report to a manager", () => {
  const engineer = ["visit.read", "visit.execute", "visit.report"];
  assert.equal(rules.decideVisitTransition("Confirmed", "In Progress", engineer).allowed, true);
  assert.equal(rules.decideVisitTransition("In Progress", "Report Pending", engineer).allowed, true);
  assert.equal(rules.decideVisitTransition("Report Pending", "Report Under Review", engineer).allowed, true);
  // The engineer submits; somebody else approves.
  const approve = rules.decideVisitTransition("Report Under Review", "Completed", engineer);
  assert.equal(approve.allowed, false);
  assert.match(approve.message, /visit\.report_approve/);
});

test("every declared edge names a permission the module actually defines", () => {
  for (const map of [rules.INTAKE_TRANSITIONS, rules.VISIT_TRANSITIONS]) {
    for (const [from, edges] of Object.entries(map)) {
      for (const edge of edges) {
        assert.ok(ALL.includes(edge.permission), `${from} -> ${edge.to} uses unknown ${edge.permission}`);
        assert.ok(edge.action.length > 0, `${from} -> ${edge.to} has no action label`);
      }
    }
  }
});

test("every status in the vocabulary is reachable as a transition target or is a start state", () => {
  const targets = new Set(Object.values(rules.VISIT_TRANSITIONS).flat().map((edge) => edge.to));
  for (const status of rules.VISIT_STATUSES) {
    assert.ok(targets.has(status) || status === "Tentative", `${status} can never be reached`);
    assert.ok(status in rules.VISIT_TRANSITIONS, `${status} has no outgoing edge list`);
  }
  for (const status of rules.INTAKE_STATUSES) {
    assert.ok(status in rules.INTAKE_TRANSITIONS, `${status} has no outgoing edge list`);
  }
});

/* ------------------------------------------------------------------ *
 * Readiness
 * ------------------------------------------------------------------ */

const COMPLETE_INTAKE = {
  customerId: 1,
  siteName: "Bang Phli plant 2",
  siteAddress: "88/2 Moo 4, Bang Phli, Samut Prakan 10540",
  contactName: "Khun Somsak",
  contactPhone: "0812345678",
  contactEmail: "somsak@example.com",
  problemStatement: "Two operators stack twelve kilogram cartons by hand for a whole shift.",
  expectedResult: "Palletise fifteen cartons a minute with no manual handling at all.",
  purposeCount: 2,
  machineName: "Sidel carton sealer",
  machineModel: "SL-3000",
  existingSystem: "Existing Siemens S7-1200 on the sealer",
  attachmentCount: 3,
  windowCount: 2,
  safetyRequirement: "Safety shoes, helmet and a site induction",
  siteAccessRequirement: "Escort required past the packing hall",
  skillCount: 3,
};

test("a complete intake scores 100 and may be submitted", () => {
  const result = rules.evaluateReadiness(COMPLETE_INTAKE);
  assert.equal(result.score, 100);
  assert.equal(result.canSubmit, true);
  assert.deepEqual(result.blockers, []);
  assert.deepEqual(result.warnings, []);
  assert.equal(result.passed.length, rules.READINESS_CHECKS.length);
});

test("a missing mandatory field blocks submission, a missing optional one only warns", () => {
  const noResult = rules.evaluateReadiness({ ...COMPLETE_INTAKE, expectedResult: "" });
  assert.equal(noResult.canSubmit, false);
  assert.equal(noResult.blockers.length, 1);
  assert.equal(noResult.blockers[0].key, "expected_result");
  assert.ok(noResult.score < 100);

  const noPhoto = rules.evaluateReadiness({ ...COMPLETE_INTAKE, attachmentCount: 0 });
  assert.equal(noPhoto.canSubmit, true, "a missing attachment must not block a submit");
  assert.equal(noPhoto.warnings.length, 1);
  assert.equal(noPhoto.warnings[0].key, "attachment");
});

test("a one-word problem statement does not count as describing the problem", () => {
  // The check requires twenty characters precisely so "broken" cannot pass for
  // a description; the boundary is worth pinning.
  assert.equal(rules.evaluateReadiness({ ...COMPLETE_INTAKE, problemStatement: "broken" }).canSubmit, false);
  assert.equal(rules.evaluateReadiness({ ...COMPLETE_INTAKE, problemStatement: "x".repeat(19) }).canSubmit, false);
  assert.equal(rules.evaluateReadiness({ ...COMPLETE_INTAKE, problemStatement: "x".repeat(20) }).canSubmit, true);
});

test("a contact needs a name and one way of reaching them", () => {
  const nameOnly = rules.evaluateReadiness({ ...COMPLETE_INTAKE, contactPhone: "", contactEmail: "" });
  assert.equal(nameOnly.canSubmit, false);
  assert.ok(nameOnly.blockers.some((check) => check.key === "contact"));

  const emailOnly = rules.evaluateReadiness({ ...COMPLETE_INTAKE, contactPhone: "" });
  assert.equal(emailOnly.canSubmit, true);
  const phoneOnly = rules.evaluateReadiness({ ...COMPLETE_INTAKE, contactEmail: "" });
  assert.equal(phoneOnly.canSubmit, true);
});

test("an empty intake fails every blocker and scores zero", () => {
  const result = rules.evaluateReadiness({});
  assert.equal(result.score, 0);
  assert.equal(result.canSubmit, false);
  assert.equal(result.blockers.length + result.warnings.length, rules.READINESS_CHECKS.length);
  for (const check of [...result.blockers, ...result.warnings]) {
    assert.ok(check.hint.length > 0, `${check.key} gives the user no hint`);
  }
});

test("the weights add up, so the score is a real percentage", () => {
  const total = rules.READINESS_CHECKS.reduce((sum, check) => sum + check.weight, 0);
  assert.equal(total, 100);
  assert.equal(rules.READINESS_CHECKS.filter((check) => check.severity === "blocker").length, 5);
});

/* ------------------------------------------------------------------ *
 * Schedule conflicts
 * ------------------------------------------------------------------ */

const appointment = (overrides = {}) => ({
  visitId: 7,
  visitNumber: "SV-2609-0007",
  startsAt: "2026-09-09T02:00:00.000Z",
  endsAt: "2026-09-09T08:00:00.000Z",
  travelMinutesBefore: 60,
  travelMinutesAfter: 60,
  status: "Confirmed",
  ...overrides,
});

test("an overlapping appointment is a conflict", () => {
  const conflicts = rules.detectScheduleConflicts(
    { startsAt: "2026-09-09T04:00:00.000Z", endsAt: "2026-09-09T10:00:00.000Z" },
    [appointment()]);
  assert.equal(conflicts.length, 1);
  assert.equal(conflicts[0].kind, "appointment");
  assert.equal(conflicts[0].reference, "SV-2609-0007");
});

test("two visits that merely touch still conflict once travel time is counted", () => {
  // 08:00 finish, 60 minutes to drive away; a 08:30 start elsewhere cannot happen.
  const conflicts = rules.detectScheduleConflicts(
    { startsAt: "2026-09-09T08:30:00.000Z", endsAt: "2026-09-09T12:00:00.000Z", travelMinutesBefore: 60 },
    [appointment()]);
  assert.equal(conflicts.length, 1);
  assert.equal(conflicts[0].kind, "travel");
});

test("a genuinely free slot reports nothing", () => {
  const conflicts = rules.detectScheduleConflicts(
    { startsAt: "2026-09-10T02:00:00.000Z", endsAt: "2026-09-10T08:00:00.000Z", travelMinutesBefore: 60, travelMinutesAfter: 60 },
    [appointment()]);
  assert.deepEqual(conflicts, []);
});

test("a cancelled or closed visit releases the engineer's calendar", () => {
  for (const status of rules.RELEASED_VISIT_STATUSES) {
    const conflicts = rules.detectScheduleConflicts(
      { startsAt: "2026-09-09T04:00:00.000Z", endsAt: "2026-09-09T10:00:00.000Z" },
      [appointment({ status })]);
    assert.deepEqual(conflicts, [], `${status} should not hold the slot`);
  }
});

test("rescheduling the same visit does not conflict with itself", () => {
  const conflicts = rules.detectScheduleConflicts(
    { startsAt: "2026-09-09T03:00:00.000Z", endsAt: "2026-09-09T09:00:00.000Z", excludeVisitId: 7 },
    [appointment()]);
  assert.deepEqual(conflicts, []);
});

test("recorded leave conflicts, and is reported as leave rather than as a visit", () => {
  const conflicts = rules.detectScheduleConflicts(
    { startsAt: "2026-09-09T04:00:00.000Z", endsAt: "2026-09-09T06:00:00.000Z" },
    [],
    [{ id: 3, reason: "Annual leave", startsAt: "2026-09-09T00:00:00.000Z", endsAt: "2026-09-10T00:00:00.000Z" }]);
  assert.equal(conflicts.length, 1);
  assert.equal(conflicts[0].kind, "unavailable");
  assert.match(conflicts[0].message, /Annual leave/);
});

test("an invalid candidate window reports nothing rather than guessing", () => {
  assert.deepEqual(rules.detectScheduleConflicts({ startsAt: "nonsense", endsAt: "also nonsense" }, [appointment()]), []);
  assert.deepEqual(rules.detectScheduleConflicts(
    { startsAt: "2026-09-09T10:00:00.000Z", endsAt: "2026-09-09T08:00:00.000Z" }, [appointment()]), []);
});

/* ------------------------------------------------------------------ *
 * Skill match
 * ------------------------------------------------------------------ */

test("skill match is the share of required skills the engineer holds", () => {
  assert.equal(rules.skillMatch(["ROBOT", "SAFETY"], ["ROBOT", "SAFETY", "PLC"]).percent, 100);
  assert.equal(rules.skillMatch(["ROBOT", "SAFETY"], ["ROBOT"]).percent, 50);
  assert.equal(rules.skillMatch(["ROBOT", "SAFETY"], []).percent, 0);
  assert.deepEqual(rules.skillMatch(["ROBOT", "SAFETY"], ["robot"]).missing, ["SAFETY"]);
  // No requirement means nothing is missing, not that nothing matches.
  assert.equal(rules.skillMatch([], ["ROBOT"]).percent, 100);
});

test("a team covers between them what no single engineer holds", () => {
  const required = ["MECHANICAL", "ELECTRICAL", "SAFETY"];
  assert.equal(rules.skillMatch(required, ["MECHANICAL"]).percent, 33);
  const team = rules.teamSkillCoverage(required, [{ skills: ["MECHANICAL"] }, { skills: ["ELECTRICAL", "SAFETY"] }]);
  assert.equal(team.percent, 100);
  assert.deepEqual(team.missing, []);
});

/* ------------------------------------------------------------------ *
 * Report SLA
 * ------------------------------------------------------------------ */

test("the report deadline is counted from check-out", () => {
  assert.equal(rules.reportDueAt("2026-09-09T08:00:00.000Z", 3), "2026-09-12T08:00:00.000Z");
  assert.equal(rules.reportDueAt("2026-09-09T08:00:00.000Z", 1), "2026-09-10T08:00:00.000Z");
  // A nonsense policy falls back to the documented default rather than to NaN.
  assert.equal(rules.reportDueAt("2026-09-09T08:00:00.000Z", 0), "2026-09-12T08:00:00.000Z");
  assert.equal(rules.reportDueAt("not a date", 3), null);
});

test("the SLA state tells the engineer what they need to know today", () => {
  const due = "2026-09-12T08:00:00.000Z";
  assert.equal(rules.reportSlaState(due, "2026-09-09T08:00:00.000Z", "Draft"), "on_track");
  assert.equal(rules.reportSlaState(due, "2026-09-11T09:00:00.000Z", "Draft"), "due_soon");
  assert.equal(rules.reportSlaState(due, "2026-09-13T08:00:00.000Z", "Draft"), "overdue");
  assert.equal(rules.reportSlaState(null, "2026-09-13T08:00:00.000Z", "Draft"), "not_applicable");
});

test("a submitted report is judged on when it was submitted, not on when it is read", () => {
  const due = "2026-09-12T08:00:00.000Z";
  // Submitted in time, reviewed late: still met.
  assert.equal(rules.reportSlaState(due, "2026-09-20T00:00:00.000Z", "Approved", "2026-09-11T00:00:00.000Z"), "met");
  // Submitted late: missed, and no later approval changes that.
  assert.equal(rules.reportSlaState(due, "2026-09-20T00:00:00.000Z", "Approved", "2026-09-14T00:00:00.000Z"), "missed");
  // Exactly on the deadline counts as met.
  assert.equal(rules.reportSlaState(due, "2026-09-20T00:00:00.000Z", "Submitted", due), "met");
});

/* ------------------------------------------------------------------ *
 * Notification de-duplication
 * ------------------------------------------------------------------ */

test("the notification key is stable for the same event and different for another", () => {
  const first = rules.notificationKey("visit.assigned", "SiteVisit", 12, "assignment-4");
  assert.equal(first, rules.notificationKey("visit.assigned", "SiteVisit", 12, "assignment-4"));
  assert.notEqual(first, rules.notificationKey("visit.assigned", "SiteVisit", 13, "assignment-4"));
  assert.notEqual(first, rules.notificationKey("visit.rescheduled", "SiteVisit", 12, "assignment-4"));
});

test("the notification key normalises case and spaces, and fits the column", () => {
  assert.equal(
    rules.notificationKey("Visit.Assigned", "SiteVisit", 12, "Lead Engineer"),
    "visit.assigned:sitevisit:12:lead-engineer");
  assert.ok(rules.notificationKey("kind", "SiteVisit", 1, "x".repeat(500)).length <= 200);
});

/* ------------------------------------------------------------------ *
 * Document numbers
 * ------------------------------------------------------------------ */

test("document numbers follow the platform TYPE-YYMM-NNNN shape", () => {
  assert.equal(rules.isIntakeNumber("SIN-2609-0001"), true);
  assert.equal(rules.isVisitNumber("SV-2609-0042"), true);
  assert.equal(rules.isReportNumber("SVR-2609-0007"), true);
  assert.equal(rules.isIntakeNumber("SIN-2609-1"), false);
  assert.equal(rules.isIntakeNumber("SV-2609-0001"), false);
  assert.equal(rules.isVisitNumber(" SV-2609-0042 "), true, "a pasted number with spaces is still a number");
});
