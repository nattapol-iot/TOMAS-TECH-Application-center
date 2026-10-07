import assert from "node:assert/strict";
import test from "node:test";
import {
  allowedProjectTransitions,
  checkProjectTransition,
  isProjectStatus,
  PROJECT_ACTIVE_FLOW,
  PROJECT_STATUSES,
  progressForStatus,
} from "../src/project-lifecycle.js";

test("the eight statuses match the database constraint and nothing else is accepted", () => {
  assert.deepEqual([...PROJECT_STATUSES], [
    "Planning", "Design", "Development", "Installation", "Commissioning", "Handover", "Closed", "On Hold",
  ]);
  for (const status of PROJECT_STATUSES) assert.ok(isProjectStatus(status));
  for (const value of ["planning", "Done", "", 1, null, undefined, {}]) assert.equal(isProjectStatus(value), false);
});

test("an open project moves to any other stage, forwards, back or skipping", () => {
  for (const from of PROJECT_ACTIVE_FLOW) {
    for (const to of PROJECT_ACTIVE_FLOW) {
      if (from === to) continue;
      assert.ok(allowedProjectTransitions(from).includes(to), `${from} should reach ${to}`);
      assert.ok(checkProjectTransition({ current: from, next: to }).ok, `${from} -> ${to}`);
    }
  }
  // Every other status and never the current one, in the order the statuses are listed.
  assert.deepEqual(allowedProjectTransitions("Installation"), ["Planning", "Design", "Development", "Commissioning", "Handover", "Closed", "On Hold"]);
});

test("a project can pause from any active stage and resume anywhere", () => {
  for (const status of PROJECT_ACTIVE_FLOW) assert.ok(allowedProjectTransitions(status).includes("On Hold"));
  for (const status of PROJECT_ACTIVE_FLOW) assert.ok(checkProjectTransition({ current: "On Hold", next: status }).ok);
  assert.equal(checkProjectTransition({ current: "On Hold", next: "Closed" }).ok, false);
  assert.ok(checkProjectTransition({ current: "On Hold", next: "Closed", actualDelivery: "2026-09-14" }).ok);
});

test("closing works from every open status, and only with an actual delivery date", () => {
  for (const status of [...PROJECT_ACTIVE_FLOW, "On Hold" as const]) {
    assert.ok(allowedProjectTransitions(status).includes("Closed"), `${status} should close`);
    assert.equal(checkProjectTransition({ current: status, next: "Closed" }).ok, false);
    assert.ok(checkProjectTransition({ current: status, next: "Closed", actualDelivery: "2026-09-14" }).ok);
  }
  const missing = checkProjectTransition({ current: "Handover", next: "Closed" });
  assert.equal(missing.ok, false);
  assert.match(missing.ok ? "" : missing.reason, /actual delivery/i);
  assert.ok(checkProjectTransition({ current: "Handover", next: "Closed", actualDelivery: "2026-09-14" }).ok);
});

test("reopening a closed project needs elevated standing", () => {
  assert.deepEqual(allowedProjectTransitions("Closed"), []);
  const refused = checkProjectTransition({ current: "Closed", next: "Handover" });
  assert.equal(refused.ok, false);
  assert.match(refused.ok ? "" : refused.reason, /manager or an administrator/i);
  assert.deepEqual(allowedProjectTransitions("Closed", true), ["Handover", "On Hold"]);
  assert.ok(checkProjectTransition({ current: "Closed", next: "Handover", elevated: true }).ok);
  // Elevated standing adds the reopen and nothing else: a reopen lands on Handover or On Hold.
  assert.equal(checkProjectTransition({ current: "Closed", next: "Planning", elevated: true }).ok, false);
  assert.deepEqual(allowedProjectTransitions("Design", true), allowedProjectTransitions("Design"));
});

test("staying on the same status is accepted and reports no change", () => {
  for (const status of PROJECT_STATUSES) {
    const result = checkProjectTransition({ current: status, next: status });
    assert.equal(result.ok, true);
    assert.equal(result.ok && result.changed, false);
  }
  const advance = checkProjectTransition({ current: "Design", next: "Development" });
  assert.equal(advance.ok && advance.changed, true);
});

test("a closed project always reads as complete", () => {
  assert.equal(progressForStatus("Closed", 0), 100);
  assert.equal(progressForStatus("Closed", 64), 100);
  assert.equal(progressForStatus("Handover", 64), 64);
  assert.equal(progressForStatus("On Hold", 0), 0);
});
