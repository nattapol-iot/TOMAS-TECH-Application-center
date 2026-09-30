import assert from "node:assert/strict";
import test from "node:test";
import { ApiError } from "../src/errors.js";
import { projectHealth, type HealthTask } from "../src/project-health.js";
import { parseProjectDetails } from "../src/project-initial-plan.js";

const today = "2026-10-10";
const open = { status: "Development", targetDelivery: "2026-12-31" };
const task = (change: Partial<HealthTask>): HealthTask => ({ planStart: "2026-10-01", planDays: 30, status: "In Progress", percentComplete: 40, forecastFinish: null, ...change });

test("a closed or paused project says so before any schedule arithmetic", () => {
  assert.equal(projectHealth({ status: "Closed", targetDelivery: "2026-01-01" }, [task({})], today), "Completed");
  assert.equal(projectHealth({ status: "On Hold", targetDelivery: "2026-01-01" }, [task({})], today), "On Hold");
  assert.equal(projectHealth(open, [], today), "No plan");
});

test("work running to plan is on track", () => {
  assert.equal(projectHealth(open, [task({}), task({ status: "Done", percentComplete: 100, planStart: "2026-09-01", planDays: 5 })], today), "On Track");
});

test("a late task, a missed delivery date or a forecast past delivery is delayed", () => {
  assert.equal(projectHealth(open, [task({ planStart: "2026-09-01", planDays: 5 })], today), "Delayed");
  assert.equal(projectHealth({ ...open, targetDelivery: "2026-10-09" }, [task({})], today), "Delayed");
  assert.equal(projectHealth(open, [task({ forecastFinish: "2027-01-15" })], today), "Delayed");
  // A finished task is never late.
  assert.equal(projectHealth(open, [task({ status: "Done", percentComplete: 100, planStart: "2026-09-01", planDays: 5 })], today), "On Track");
});

test("blocked, slipping, not started on time, or due soon and under half done is at risk", () => {
  assert.equal(projectHealth(open, [task({ status: "Blocked" })], today), "At Risk");
  assert.equal(projectHealth(open, [task({ forecastFinish: "2026-11-15" })], today), "At Risk");
  assert.equal(projectHealth(open, [task({ status: "Not Started", percentComplete: 0 })], today), "At Risk");
  assert.equal(projectHealth(open, [task({ planStart: "2026-10-05", planDays: 10, percentComplete: 30 })], today), "At Risk");
  assert.equal(projectHealth(open, [task({ planStart: "2026-10-05", planDays: 10, percentComplete: 60 })], today), "On Track");
});

test("team, payments and contacts are each optional, and each is checked when sent", () => {
  assert.deepEqual(parseProjectDetails({}), {});
  assert.deepEqual(parseProjectDetails({ department: "  Application ", paymentsReceived: ["AFTER_PO", "GO_LIVE", "AFTER_PO"], contactIds: [4, 4, 9] }),
    { team: "Application", paymentsReceived: ["AFTER_PO", "GO_LIVE"], contactIds: [4, 9] });
  assert.deepEqual(parseProjectDetails({ department: "", paymentsReceived: [], contactIds: [] }), { team: null, paymentsReceived: [], contactIds: [] });
  const rejects = (body: Record<string, unknown>, pattern: RegExp) => assert.throws(() => parseProjectDetails(body),
    (error: unknown) => error instanceof ApiError && error.statusCode === 400 && pattern.test(error.message));
  rejects({ paymentsReceived: ["PAID"] }, /Payments received must be any of/);
  rejects({ contactIds: [0] }, /Customer contact is invalid/);
  rejects({ department: 5 }, /Team must be text/);
  rejects({ department: "x".repeat(101) }, /cannot exceed 100/);
});
