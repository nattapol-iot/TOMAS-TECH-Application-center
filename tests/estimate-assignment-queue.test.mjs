import assert from "node:assert/strict";
import test from "node:test";
import {
  assignmentDaysRemaining, assignmentNextAction, assignmentQueueSummary, assignmentUrgency,
  isActionableAssignment, sectionName, sortAssignmentQueue,
} from "../lib/estimate-assignment-queue.ts";

const TODAY = "2026-09-11";

const record = (overrides = {}) => ({
  assignmentId: 1,
  estimateId: 100,
  estimateNumber: "EST-2026-0100",
  inquiryNumber: "INQ-2026-0044",
  projectName: "Line 4 retrofit",
  customerName: "Acme",
  revision: 2,
  estimateStatus: "Engineering Input",
  estimateDueDate: "2026-12-31",
  estimateOwnerName: "Owner",
  section: "03 Electrical",
  sectionCode: "03",
  role: "Responsible",
  ownerName: "Assignee",
  supportName: null,
  dueDate: "2026-09-30",
  status: "Not Started",
  progress: 0,
  comment: null,
  costLineCount: 0,
  ...overrides,
});

test("an assigned section is actionable before anybody starts it", () => {
  assert.equal(isActionableAssignment(record({ status: "Not Started", progress: 0, costLineCount: 0 })), true);
  assert.equal(isActionableAssignment(record({ status: "In Progress" })), true);
  assert.equal(isActionableAssignment(record({ status: "Waiting Supplier" })), true);
});

test("finished sections and read-only estimates drop out of the actionable queue", () => {
  for (const status of ["Completed", "Reviewed"]) assert.equal(isActionableAssignment(record({ status })), false);
  for (const estimateStatus of ["Approved", "Locked"]) assert.equal(isActionableAssignment(record({ estimateStatus })), false);
});

test("urgency comes from the section due date, falling back to the estimate due date", () => {
  assert.equal(assignmentUrgency(record({ dueDate: "2026-09-01" }), TODAY), "overdue");
  assert.equal(assignmentUrgency(record({ dueDate: "2026-09-11" }), TODAY), "due-soon");
  assert.equal(assignmentUrgency(record({ dueDate: "2026-09-18" }), TODAY), "due-soon");
  assert.equal(assignmentUrgency(record({ dueDate: "2026-09-19" }), TODAY), "on-track");
  assert.equal(assignmentUrgency(record({ dueDate: null, estimateDueDate: "2026-09-01" }), TODAY), "overdue");
  assert.equal(assignmentUrgency(record({ dueDate: null, estimateDueDate: null }), TODAY), "none");
  assert.equal(assignmentUrgency(record({ dueDate: "2026-09-01", status: "Completed" }), TODAY), "none");
  assert.equal(assignmentDaysRemaining(record({ dueDate: "2026-09-14" }), TODAY), 3);
  assert.equal(assignmentDaysRemaining(record({ dueDate: null, estimateDueDate: null }), TODAY), null);
});

test("a brand-new assignment asks for the first cost line and names the discipline", () => {
  const next = assignmentNextAction(record({ status: "Not Started", costLineCount: 0 }));
  assert.equal(next.code, "first-cost-line");
  assert.equal(next.label, "Open Estimate · Cost Items");
  assert.match(next.detail, /03 Electrical/);
  assert.match(next.detail, /no cost line yet/);
  assert.equal(next.opensEstimate, true);
});

test("every other state gets its own next step instead of a generic prompt", () => {
  assert.equal(assignmentNextAction(record({ costLineCount: 4, progress: 40, status: "In Progress" })).code, "continue-costing");
  assert.equal(assignmentNextAction(record({ status: "Waiting Supplier" })).code, "waiting-supplier");
  assert.equal(assignmentNextAction(record({ status: "Waiting Information" })).code, "waiting-information");
  assert.equal(assignmentNextAction(record({ status: "Completed" })).code, "done");
  assert.equal(assignmentNextAction(record({ estimateStatus: "Approved" })).code, "read-only");
  assert.match(assignmentNextAction(record({ costLineCount: 4, progress: 40, status: "In Progress" })).detail, /4 cost line\(s\) at 40%/);
  assert.match(assignmentNextAction(record({ status: "Waiting Information" })).detail, /Owner/);
});

test("the queue puts actionable work first, most urgent first, and is stable", () => {
  const rows = [
    record({ assignmentId: 1, status: "Completed", dueDate: "2026-08-01" }),
    record({ assignmentId: 2, dueDate: "2026-09-18", estimateNumber: "EST-B", sectionCode: "04" }),
    record({ assignmentId: 3, dueDate: "2026-09-01" }),
    record({ assignmentId: 4, dueDate: "2026-12-01" }),
    record({ assignmentId: 5, dueDate: "2026-09-18", estimateNumber: "EST-A", sectionCode: "04" }),
  ];
  assert.deepEqual(sortAssignmentQueue(rows, TODAY).map((row) => row.assignmentId), [3, 5, 2, 4, 1]);
  assert.deepEqual(sortAssignmentQueue([...rows].reverse(), TODAY).map((row) => row.assignmentId), [3, 5, 2, 4, 1]);
  // Sorting must not mutate the caller's array.
  assert.deepEqual(rows.map((row) => row.assignmentId), [1, 2, 3, 4, 5]);
});

test("the summary counts what an engineer has to act on, not what they have ever been given", () => {
  const summary = assignmentQueueSummary([
    record({ assignmentId: 1, status: "Not Started", dueDate: "2026-09-01" }),
    record({ assignmentId: 2, status: "Not Started", dueDate: "2026-09-15" }),
    record({ assignmentId: 3, status: "In Progress", dueDate: "2026-12-01" }),
    record({ assignmentId: 4, status: "Completed", dueDate: "2026-09-01" }),
    record({ assignmentId: 5, status: "In Progress", estimateStatus: "Locked", dueDate: "2026-09-01" }),
  ], TODAY);
  assert.deepEqual(summary, { total: 5, actionable: 3, notStarted: 2, overdue: 1, dueThisWeek: 1 });
});

test("section codes resolve to the discipline names the estimate uses", () => {
  for (const [code, name] of [["01", "Hardware"], ["03", "Electrical"], ["06", "Engineering"], ["10", "Other Cost"]]) {
    assert.equal(sectionName(code), name);
  }
  assert.equal(sectionName("99"), "");
});
