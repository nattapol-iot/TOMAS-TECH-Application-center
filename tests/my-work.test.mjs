import assert from "node:assert/strict";
import test from "node:test";
import {
  canAnswerDayRequests,
  canFinishWork,
  canImportDrawingRow,
  canProgressScheduleRow,
  canRequestMoreDays,
  isLateAgainstPlan,
  isStaleInProgress,
  myWorkNeedsAttention,
  needsForecastDate,
  needsZeroProgressFinishConfirmation,
  offersDayRequest,
  offersPersonalTask,
  parseMyWorkExpansion,
  percentChangePatch,
  sortMyWorkGroups,
  statusChangePatch,
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

test("late means past the current plan finish; a later forecast does not clear it", () => {
  const today = "2026-10-06";
  assert.equal(isLateAgainstPlan({ status: "In Progress", planFinish: "2026-10-05" }, today), true);
  assert.equal(isLateAgainstPlan({ status: "In Progress", planFinish: "2026-10-05", forecastFinish: "2026-10-20" }, today), true, "the PM owns dates; a forecast only tells when");
  assert.equal(isLateAgainstPlan({ status: "In Progress", planFinish: "2026-10-06" }, today), false, "due today is not late");
  assert.equal(isLateAgainstPlan({ status: "Done", planFinish: "2026-10-01" }, today), false);
  assert.equal(isLateAgainstPlan({ status: "Not Started", planFinish: null }, today), false);
  assert.equal(needsForecastDate({ status: "In Progress", planFinish: "2026-10-05", forecastFinish: null, actualFinish: null }, today), true);
  assert.equal(needsForecastDate({ status: "In Progress", planFinish: "2026-10-05", forecastFinish: "2026-10-09", actualFinish: null }, today), false);
  const now = Date.parse("2026-10-06T03:00:00Z");
  assert.equal(isStaleInProgress({ status: "In Progress", updatedAt: "2026-09-30T03:00:00Z" }, now), true);
  assert.equal(isStaleInProgress({ status: "In Progress", updatedAt: "2026-10-02T03:00:00Z" }, now), false);
  assert.equal(isStaleInProgress({ status: "Blocked", updatedAt: "2026-09-01T03:00:00Z" }, now), false);
  const base = { canUpdate: true, status: "In Progress", planFinish: "2026-10-20", forecastFinish: null, actualFinish: null, updatedAt: "2026-10-05T03:00:00Z" };
  assert.equal(myWorkNeedsAttention(base, today, now), false);
  assert.equal(myWorkNeedsAttention({ ...base, planFinish: "2026-10-01", forecastFinish: "2026-10-30" }, today, now), true, "late with a forecast still needs attention");
  assert.equal(myWorkNeedsAttention({ ...base, status: "Blocked" }, today, now), true);
  assert.equal(myWorkNeedsAttention({ ...base, canUpdate: false, status: "Blocked" }, today, now), false);
});

test("the percent strip saves the dates and status the server requires, and nothing for the current value", () => {
  const today = "2026-10-06";
  const notStarted = { status: "Not Started", percentComplete: 0, actualStart: null, actualFinish: null };
  assert.equal(percentChangePatch(notStarted, 0, today), null);
  assert.deepEqual(percentChangePatch(notStarted, 25, today), { percentComplete: 25, status: "In Progress", actualFinish: null, actualStart: today });
  assert.deepEqual(percentChangePatch(notStarted, 100, today), { percentComplete: 100, status: "Done", actualStart: today, actualFinish: today });
  const started = { status: "In Progress", percentComplete: 50, actualStart: "2026-10-01", actualFinish: null };
  assert.deepEqual(percentChangePatch(started, 75, today), { percentComplete: 75, actualStart: "2026-10-01" });
  // In progress without a start (old data) gets one stamped once.
  assert.deepEqual(percentChangePatch({ ...started, actualStart: null }, 75, today), { percentComplete: 75, actualStart: today });
  assert.deepEqual(percentChangePatch(started, 0, today), { percentComplete: 0 });
  assert.deepEqual(percentChangePatch({ ...started, status: "Blocked" }, 75, today), { percentComplete: 75, actualStart: "2026-10-01" }, "a blocked task stays blocked");
});

test("a status change carries the percent and dates its rules need", () => {
  const today = "2026-10-06";
  const task = { status: "In Progress", percentComplete: 40, actualStart: "2026-10-01", actualFinish: null };
  assert.equal(statusChangePatch(task, "In Progress", today), null);
  assert.deepEqual(statusChangePatch(task, "Not Started", today), { status: "Not Started", percentComplete: 0, actualStart: null, actualFinish: null });
  assert.deepEqual(statusChangePatch(task, "Done", today), { status: "Done", percentComplete: 100, actualStart: "2026-10-01", actualFinish: today });
  assert.deepEqual(statusChangePatch(task, "Blocked", today), { status: "Blocked", actualStart: "2026-10-01", actualFinish: null, percentComplete: 40 });
  // Reopening finished work keeps it below 100 and clears the finish date.
  assert.deepEqual(statusChangePatch({ status: "Done", percentComplete: 100, actualStart: "2026-10-01", actualFinish: "2026-10-03" }, "In Progress", today),
    { status: "In Progress", actualStart: "2026-10-01", actualFinish: null, percentComplete: 99 });
  assert.deepEqual(statusChangePatch({ status: "Not Started", percentComplete: 0, actualStart: null, actualFinish: null }, "In Progress", today),
    { status: "In Progress", actualStart: today, actualFinish: null, percentComplete: 0 });
});

test("a start stamped by one click clears a forecast the server would reject as earlier than the start", () => {
  const today = "2026-10-06";
  // Late and never started, with an old forecast of 2026-10-02.
  const stale = { status: "Not Started", percentComplete: 0, actualStart: null, actualFinish: null, forecastFinish: "2026-10-02" };
  assert.deepEqual(percentChangePatch(stale, 50, today), { percentComplete: 50, status: "In Progress", actualFinish: null, actualStart: today, forecastFinish: null });
  assert.deepEqual(percentChangePatch(stale, 100, today), { percentComplete: 100, status: "Done", actualStart: today, actualFinish: today, forecastFinish: null });
  assert.deepEqual(statusChangePatch(stale, "In Progress", today), { status: "In Progress", actualStart: today, actualFinish: null, percentComplete: 0, forecastFinish: null });
  // A forecast on or after the start stays; an existing start is never moved.
  assert.deepEqual(percentChangePatch({ ...stale, forecastFinish: "2026-10-09" }, 50, today), { percentComplete: 50, status: "In Progress", actualFinish: null, actualStart: today });
  assert.deepEqual(percentChangePatch({ ...stale, status: "In Progress", actualStart: "2026-09-30", percentComplete: 25 }, 50, today), { percentComplete: 50, actualStart: "2026-09-30" });
});
