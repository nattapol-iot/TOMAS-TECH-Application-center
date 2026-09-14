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

test("work moves one step either way along the active flow", () => {
  // Forward is the normal path.
  for (const [index, status] of PROJECT_ACTIVE_FLOW.entries()) {
    const next = PROJECT_ACTIVE_FLOW[index + 1];
    if (next) assert.ok(allowedProjectTransitions(status).includes(next), `${status} should reach ${next}`);
  }
  // Rework sends a project back one stage, which happens often enough that blocking it is a lie.
  assert.ok(allowedProjectTransitions("Commissioning").includes("Installation"));
  assert.ok(checkProjectTransition({ current: "Commissioning", next: "Installation" }).ok);
  // Skipping stages is not allowed.
  assert.equal(checkProjectTransition({ current: "Planning", next: "Installation" }).ok, false);
  assert.equal(checkProjectTransition({ current: "Planning", next: "Handover" }).ok, false);
});

test("a project can pause from any active stage and resume anywhere", () => {
  for (const status of PROJECT_ACTIVE_FLOW) assert.ok(allowedProjectTransitions(status).includes("On Hold"));
  for (const status of PROJECT_ACTIVE_FLOW) assert.ok(checkProjectTransition({ current: "On Hold", next: status }).ok);
  assert.equal(checkProjectTransition({ current: "On Hold", next: "Closed" }).ok, false);
});

test("closing happens only from Handover and only with an actual delivery date", () => {
  for (const status of PROJECT_ACTIVE_FLOW) {
    const allowed = allowedProjectTransitions(status).includes("Closed");
    assert.equal(allowed, status === "Handover", `${status} closing should be ${status === "Handover"}`);
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
  // Elevated standing adds the reopen and nothing else: it cannot skip stages either.
  assert.equal(checkProjectTransition({ current: "Planning", next: "Closed", elevated: true }).ok, false);
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
