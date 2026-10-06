import assert from "node:assert/strict";
import test from "node:test";
import {
  canAnswerDayRequests,
  canFinishWork,
  canImportDrawingRow,
  canProgressScheduleRow,
  canRequestMoreDays,
  needsZeroProgressFinishConfirmation,
  offersDayRequest,
  offersPersonalTask,
  parseMyWorkExpansion,
  sortMyWorkGroups,
} from "../lib/my-work.ts";

test("saved group expansion accepts only boolean entries and survives damaged storage", () => {
  assert.deepEqual(parseMyWorkExpansion(null), {});
  assert.deepEqual(parseMyWorkExpansion("not-json"), {});
  assert.deepEqual(parseMyWorkExpansion("[]"), {});
  assert.deepEqual(parseMyWorkExpansion('{"project:1:true":true,"bad":"yes","closed":false}'), {
    "project:1:true": true,
    closed: false,
  });
});

test("blocked work cannot finish and a zero-percent finish needs confirmation", () => {
  assert.equal(canFinishWork("Blocked"), false);
  assert.equal(canFinishWork("In Progress"), true);
  assert.equal(needsZeroProgressFinishConfirmation(0, "Done"), true);
  assert.equal(needsZeroProgressFinishConfirmation(25, "Done"), false);
  assert.equal(needsZeroProgressFinishConfirmation(0, "In Progress"), false);
});

test("the mixed daily queue sorts every source by shared urgency and due date", () => {
  const rows = [
    { kind: "estimate", key: "EST-2", group: { urgency: 3, nearestDue: "2026-09-15", updatedAt: "2026-09-10T00:00:00Z" } },
    { kind: "schedule", key: "PRJ-1", group: { urgency: 0, nearestDue: "2026-09-20", updatedAt: "2026-09-11T00:00:00Z" } },
    { kind: "estimate", key: "EST-1", group: { urgency: 0, nearestDue: "2026-09-13", updatedAt: "2026-09-09T00:00:00Z" } },
  ];
  assert.deepEqual(sortMyWorkGroups(rows, "priority", (row) => row.key).map((row) => row.key), ["EST-1", "PRJ-1", "EST-2"]);
  assert.deepEqual(sortMyWorkGroups(rows, "project", (row) => row.key).map((row) => row.key), ["EST-1", "EST-2", "PRJ-1"]);
  assert.deepEqual(rows.map((row) => row.key), ["EST-2", "PRJ-1", "EST-1"], "sorting must not mutate the caller");
});

test("a Resource Plan row never offers a day request or a personal task", () => {
  const pending = { id: 9, requestDays: 2 };
  // Rows a Resource Plan task owns: dates change through Resource Plan, not My Work.
  assert.equal(offersDayRequest({ canUpdate: true, managedByResourcePlan: true, pendingRequest: null }), false);
  assert.equal(canRequestMoreDays({ canUpdate: true, managedByResourcePlan: true, pendingRequest: null }), false);
  assert.equal(offersPersonalTask({ canAddDetail: true, managedByResourcePlan: true }), false);
  // Ordinary rows keep today's behaviour.
  assert.equal(offersDayRequest({ canUpdate: true, managedByResourcePlan: false, pendingRequest: null }), true);
  assert.equal(offersDayRequest({ canUpdate: false, pendingRequest: null }), false);
  assert.equal(canRequestMoreDays({ canUpdate: true, pendingRequest: null }), true);
  assert.equal(canRequestMoreDays({ canUpdate: true, pendingRequest: pending }), false, "one request waits for the PM at a time");
  assert.equal(canRequestMoreDays({ canUpdate: false, pendingRequest: null }), false);
  assert.equal(offersPersonalTask({ canAddDetail: true }), true);
  assert.equal(offersPersonalTask({ canAddDetail: false, managedByResourcePlan: false }), false);
});

test("the server's canRequestDays verdict wins over the local rule", () => {
  assert.equal(canRequestMoreDays({ canUpdate: true, canRequestDays: false, pendingRequest: null }), false);
  assert.equal(canRequestMoreDays({ canUpdate: true, managedByResourcePlan: false, canRequestDays: true, pendingRequest: null }), true);
});

test("schedule rows use the API's canProgress flag and fall back to the PIC rule without it", () => {
  const context = { scheduleAllowsProgress: true, hasProgressPermission: true, userId: 7 };
  const leaf = { kind: "task", children: [], pics: [{ id: 3 }] };
  // The PM or an Admin who is not a PIC: the new flag allows it, the old rule did not.
  assert.equal(canProgressScheduleRow({ ...leaf, canProgress: true }, context), true);
  assert.equal(canProgressScheduleRow({ ...leaf, pics: [{ id: 7 }], canProgress: false }, context), false, "a false flag is final, PIC or not");
  assert.equal(canProgressScheduleRow(leaf, context), false);
  // Fallback: an assigned PIC on a non-phase leaf with the permission and an open schedule.
  const mine = { ...leaf, pics: [{ id: 7 }] };
  assert.equal(canProgressScheduleRow(mine, context), true);
  assert.equal(canProgressScheduleRow({ ...mine, kind: "phase" }, context), false);
  assert.equal(canProgressScheduleRow({ ...mine, children: [{}] }, context), false, "roll-ups take progress from their children");
  assert.equal(canProgressScheduleRow(mine, { ...context, hasProgressPermission: false }), false);
  assert.equal(canProgressScheduleRow(mine, { ...context, scheduleAllowsProgress: false }), false);
});

test("Import Drawing follows the drawing rule: an assigned PIC on an open, unmanaged leaf with signing.request", () => {
  const context = { scheduleAllowsProgress: true, hasSigningRequest: true, userId: 7 };
  const mine = { kind: "task", children: [], pics: [{ id: 7 }] };
  assert.equal(canImportDrawingRow(mine, context), true);
  // The PM or an Admin may post progress here (canProgress true) but is not the PIC: the server refuses the drawing.
  assert.equal(canImportDrawingRow({ ...mine, pics: [{ id: 3 }], canProgress: true }, context), false);
  assert.equal(canImportDrawingRow({ ...mine, pics: [], canProgress: true }, context), false);
  assert.equal(canImportDrawingRow({ ...mine, managedByResourcePlan: true }, context), false, "Resource Plan owns managed rows");
  assert.equal(canImportDrawingRow({ ...mine, kind: "phase" }, context), false);
  assert.equal(canImportDrawingRow({ ...mine, children: [{}] }, context), false);
  assert.equal(canImportDrawingRow(mine, { ...context, hasSigningRequest: false }), false);
  assert.equal(canImportDrawingRow(mine, { ...context, scheduleAllowsProgress: false }), false, "a closed project releases no drawings");
});

test("day requests are answered by whom the API says, and by plan owners on an older API", () => {
  assert.equal(canAnswerDayRequests({ canPlan: true, canAnswerRequests: true }, true), true);
  assert.equal(canAnswerDayRequests({ canPlan: true, canAnswerRequests: false }, true), false, "a false flag wins over canPlan");
  assert.equal(canAnswerDayRequests({ canPlan: false, canAnswerRequests: true }, true), true);
  assert.equal(canAnswerDayRequests({ canPlan: true }, true), true, "no flag: canPlan decides");
  assert.equal(canAnswerDayRequests({ canPlan: false }, true), false);
  assert.equal(canAnswerDayRequests({ canPlan: true, canAnswerRequests: true }, false), false, "the answer route requires schedule.plan");
});
