import assert from "node:assert/strict";
import test from "node:test";
import { ApiError } from "../src/errors.js";
import { countedLeaves, projectHealth, scheduleLeaves, summarizeProjectSchedule, type HealthTask, type ScheduleLeaf } from "../src/project-health.js";
import { MASTER_PLAN_PHASE, parseProjectDetails } from "../src/project-initial-plan.js";
import { MASTER_PLAN_PHASE as SHARED_MASTER_PLAN_PHASE } from "../src/schedule-phases.js";
import { resolveTasks, type TaskRow } from "../src/schedule-service.js";

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

// ---- summarizeProjectSchedule: one progress / health formula for every screen ----

const leaf = (change: Partial<ScheduleLeaf>): ScheduleLeaf => ({
  id: 1, name: "Install", planStart: "2026-10-01", planFinish: "2026-10-30", workDays: 22, status: "In Progress", percentComplete: 40,
  forecastFinish: null, actualFinish: null, baselineFinish: null, isMilestone: false, inMasterPlan: false, ...change,
});
const summary = (leaves: ScheduleLeaf[], project: { status: string; targetDelivery: string | null } = open) => summarizeProjectSchedule(project, leaves, today);

test("work counts; the Master Plan frame counts only when the project has nothing else", () => {
  const work = leaf({ id: 1 }), frame = leaf({ id: 2, inMasterPlan: true });
  assert.deepEqual(countedLeaves([frame, work]).map((item) => item.id), [1]);
  assert.deepEqual(countedLeaves([frame, leaf({ id: 3, inMasterPlan: true })]).map((item) => item.id), [2, 3]);
  assert.deepEqual(countedLeaves([]), []);
});

test("progress is weighted by work days, max(1, workDays) per leaf, rounded to 2 decimals", () => {
  assert.equal(summary([leaf({ workDays: 3, percentComplete: 100 }), leaf({ id: 2, workDays: 1, percentComplete: 0 })]).progress, 75);
  // A zero-day leaf still weighs one day.
  assert.equal(summary([leaf({ workDays: 3, percentComplete: 100 }), leaf({ id: 2, workDays: 0, percentComplete: 0 })]).progress, 75);
  assert.equal(summary([leaf({ workDays: 2, percentComplete: 50 }), leaf({ id: 2, workDays: 1, percentComplete: 0 })]).progress, 33.33);
  // Master Plan rows do not dilute the work, but are the progress when they are all there is.
  assert.equal(summary([leaf({ workDays: 5, percentComplete: 60 }), leaf({ id: 2, workDays: 50, percentComplete: 0, inMasterPlan: true })]).progress, 60);
  assert.equal(summary([leaf({ workDays: 1, percentComplete: 20, inMasterPlan: true }), leaf({ id: 2, workDays: 1, percentComplete: 40, inMasterPlan: true })]).progress, 30);
  const empty = summary([]);
  assert.equal(empty.progress, null); assert.equal(empty.plannedProgress, null); assert.equal(empty.taskCount, 0);
});

test("planned progress is where each leaf should be today by calendar days, with the same weights", () => {
  // 2026-10-01..2026-10-20 is 20 days and today (10-10) is day 10: 50 %.
  assert.equal(summary([leaf({ planStart: "2026-10-01", planFinish: "2026-10-20" })]).plannedProgress, 50);
  // Finished in the past counts 100, not yet started counts 0, weighted 1 : 3.
  assert.equal(summary([leaf({ planStart: "2026-09-01", planFinish: "2026-09-05", workDays: 1 }), leaf({ id: 2, planStart: "2026-11-01", planFinish: "2026-11-05", workDays: 3 })]).plannedProgress, 25);
  // Starting today is day one of its span.
  assert.equal(summary([leaf({ planStart: "2026-10-10", planFinish: "2026-10-12" })]).plannedProgress, 33.33);
  // Any counted leaf without dates makes the planned figure unknown; an undated Master Plan row does not.
  assert.equal(summary([leaf({}), leaf({ id: 2, planStart: null, planFinish: null })]).plannedProgress, null);
  assert.equal(summary([leaf({ planStart: "2026-10-01", planFinish: "2026-10-20" }), leaf({ id: 2, planStart: null, planFinish: null, inMasterPlan: true })]).plannedProgress, 50);
});

test("a Closed project reads progress 100 with no plan comparison, as the close flow promises", () => {
  const closed = { status: "Closed", targetDelivery: "2026-09-30" };
  // Leaves never marked Done before the close: 40 % and 0 % open work.
  const result = summary([leaf({ percentComplete: 40 }), leaf({ id: 2, status: "Not Started", percentComplete: 0, planStart: "2026-09-01", planFinish: "2026-09-05" })], closed);
  assert.equal(result.progress, 100); assert.equal(result.plannedProgress, null); assert.equal(result.health, "Completed");
  // The counts still describe the schedule as it was left.
  assert.equal(result.taskCount, 2); assert.equal(result.doneCount, 0);
  // No counted leaves keeps the documented null, so callers fall back to the typed progress.
  assert.equal(summary([], closed).progress, null);
  // Any other status keeps the work-day weighted figure.
  assert.equal(summary([leaf({ percentComplete: 40 })], { status: "Handover", targetDelivery: "2026-12-31" }).progress, 40);
});

test("summary health: closed, on hold and no plan come first", () => {
  assert.equal(summary([leaf({ planFinish: "2026-09-01" })], { status: "Closed", targetDelivery: "2026-01-01" }).health, "Completed");
  assert.equal(summary([leaf({ planFinish: "2026-09-01" })], { status: "On Hold", targetDelivery: null }).health, "On Hold");
  assert.equal(summary([]).health, "No plan");
  assert.equal(summary([], { status: "Closed", targetDelivery: null }).health, "Completed");
  // Leaves without a resolved start cannot be judged.
  assert.equal(summary([leaf({ planStart: null, planFinish: null })]).health, "No plan");
});

test("summary health: delayed when the target passed, a leaf is late or a forecast runs past the target", () => {
  assert.equal(summary([leaf({})]).health, "On Track");
  assert.equal(summary([leaf({})], { ...open, targetDelivery: "2026-10-09" }).health, "Delayed");
  assert.equal(summary([leaf({ status: "Done", percentComplete: 100 })], { ...open, targetDelivery: "2026-10-09" }).health, "On Track");
  assert.equal(summary([leaf({ planStart: "2026-09-01", planFinish: "2026-10-09" })]).health, "Delayed");
  assert.equal(summary([leaf({ planStart: "2026-09-01", planFinish: "2026-10-09", status: "Done", percentComplete: 100 })]).health, "On Track");
  assert.equal(summary([leaf({ forecastFinish: "2027-01-15" })]).health, "Delayed");
  // A forecast past the target is only judged when there is a target; past its own finish it is still a risk.
  assert.equal(summary([leaf({ forecastFinish: "2027-01-15" })], { ...open, targetDelivery: null }).health, "At Risk");
});

test("summary health: at risk when blocked, slipping, not started on time, or due soon and under half done", () => {
  assert.equal(summary([leaf({ status: "Blocked" })]).health, "At Risk");
  assert.equal(summary([leaf({ forecastFinish: "2026-11-15" })]).health, "At Risk");
  assert.equal(summary([leaf({ status: "Not Started", percentComplete: 0 })]).health, "At Risk");
  assert.equal(summary([leaf({ status: "Not Started", percentComplete: 0, planStart: "2026-10-10" })]).health, "On Track");
  assert.equal(summary([leaf({ planFinish: "2026-10-17", percentComplete: 30 })]).health, "At Risk");
  assert.equal(summary([leaf({ planFinish: "2026-10-17", percentComplete: 60 })]).health, "On Track");
  assert.equal(summary([leaf({ planFinish: "2026-10-18", percentComplete: 30 })]).health, "On Track");
});

test("summary health ignores the Master Plan frame unless it is the only plan", () => {
  const lateFrame = leaf({ id: 2, planStart: "2026-09-01", planFinish: "2026-09-05", status: "Blocked", inMasterPlan: true });
  assert.equal(summary([leaf({}), lateFrame]).health, "On Track");
  assert.equal(summary([lateFrame]).health, "Delayed");
});

test("overdue, blocked, slipped, done and task counts cover counted leaves only", () => {
  const result = summary([
    leaf({ id: 1, planFinish: "2026-10-05" }), // overdue
    leaf({ id: 2, planFinish: "2026-10-05", status: "Done", percentComplete: 100, actualFinish: "2026-10-12", baselineFinish: "2026-10-05" }), // done late: slipped, not overdue
    leaf({ id: 3, status: "Blocked", forecastFinish: "2026-11-02", baselineFinish: "2026-10-30" }), // blocked, slipped by forecast
    leaf({ id: 4, planFinish: "2026-11-02", baselineFinish: "2026-10-30" }), // slipped by plan
    leaf({ id: 5, baselineFinish: "2026-10-30" }), // on its baseline
    leaf({ id: 6, planFinish: "2026-10-01", status: "Blocked", baselineFinish: "2026-09-01", inMasterPlan: true }), // frame: ignored
  ]);
  assert.equal(result.taskCount, 5); assert.equal(result.doneCount, 1);
  assert.equal(result.overdueCount, 1); assert.equal(result.blockedCount, 1); assert.equal(result.slippedCount, 3);
});

test("plan dates, forecast finish and slip days come from counted leaves", () => {
  const leaves = [
    leaf({ id: 1, planStart: "2026-10-01", planFinish: "2026-10-20", actualFinish: "2026-10-18", status: "Done" }),
    leaf({ id: 2, planStart: "2026-10-05", planFinish: "2026-11-30", forecastFinish: "2027-01-05" }),
    leaf({ id: 3, planStart: "2026-09-20", planFinish: "2026-12-10" }),
    leaf({ id: 4, planStart: "2026-01-01", planFinish: "2027-06-01", inMasterPlan: true }),
  ];
  const result = summary(leaves);
  assert.equal(result.planStart, "2026-09-20"); assert.equal(result.planFinish, "2026-12-10");
  assert.equal(result.forecastFinish, "2027-01-05");
  assert.equal(result.slipDays, 5); // target 2026-12-31
  assert.equal(summary(leaves, { ...open, targetDelivery: "2027-01-15" }).slipDays, -10);
  assert.equal(summary(leaves, { ...open, targetDelivery: null }).slipDays, null);
  // Without a forecast or actual, the plan finish is the forecast; an actual finish beats a forecast.
  assert.equal(summary([leaf({ planFinish: "2026-10-30" })]).forecastFinish, "2026-10-30");
  assert.equal(summary([leaf({ planFinish: "2026-10-30", forecastFinish: "2026-12-01", actualFinish: "2026-10-28" })]).forecastFinish, "2026-10-28");
  assert.equal(summary([]).slipDays, null);
});

test("next milestone is the earliest open milestone or Master Plan row from today, over all leaves", () => {
  const result = summary([
    leaf({ id: 1, name: "Work", planFinish: "2026-10-11" }), // not a milestone
    leaf({ id: 2, name: "FAT", planFinish: "2026-10-09", isMilestone: true }), // already past
    leaf({ id: 3, name: "SAT", planFinish: "2026-10-12", isMilestone: true, status: "Done" }), // done
    leaf({ id: 4, name: "Kick-off B", planFinish: "2026-10-15", inMasterPlan: true }), // frame rows still feed it
    leaf({ id: 5, name: "Kick-off A", planFinish: "2026-10-15", isMilestone: true }),
    leaf({ id: 6, name: "Handover", planFinish: "2026-12-01", inMasterPlan: true }),
  ]);
  assert.deepEqual(result.nextMilestone, { name: "Kick-off A", date: "2026-10-15" });
  assert.deepEqual(summary([leaf({ name: "Due today", planFinish: today, isMilestone: true })]).nextMilestone, { name: "Due today", date: today });
  assert.equal(summary([leaf({ planFinish: "2026-10-11" })]).nextMilestone, null);
});

// ---- scheduleLeaves: leaves from the resolved schedule ----

let nextId = 0;
const row = (change: Partial<TaskRow>): TaskRow => {
  const id = change.id ?? ++nextId;
  return {
    id, projectId: 7, parentId: null, sortOrder: id, kind: "task", name: `Row ${id}`, isMilestone: false, origin: "manual",
    createdBy: 1, visibility: "Internal", planStart: "2026-10-05", planDays: 5, startMode: "fixed", predecessorId: null, lagDays: 0,
    picExternal: "", planManDays: 0, baselineStart: null, baselineFinish: null, baselineDays: 0, baselineRevision: 0, actualStart: null,
    actualFinish: null, forecastFinish: null, percentComplete: 0, status: "Not Started", blockedReason: null, remark: null, actualManDays: 0,
    updatedBy: 1, updatedAt: null, rowVersion: Buffer.alloc(8), ...change,
  };
};

test("the Master Plan phase name lives in a module with no imports and is re-exported unchanged", () => {
  assert.equal(MASTER_PLAN_PHASE, "Master Plan");
  assert.equal(SHARED_MASTER_PLAN_PHASE, MASTER_PLAN_PHASE);
});

test("scheduleLeaves keeps leaves with resolved dates and marks rows under the Master Plan phase", () => {
  const frame = row({ kind: "phase", name: MASTER_PLAN_PHASE, planStart: null });
  const kickOff = row({ parentId: frame.id, name: "Kick-off", isMilestone: true, planStart: "2026-10-05", planDays: 1 });
  const frameGroup = row({ parentId: frame.id, name: "Delivery", planStart: null });
  const handover = row({ parentId: frameGroup.id, name: "Handover", planStart: "2026-12-01", planDays: 1 });
  const team = row({ kind: "phase", name: "Team plan", planStart: null });
  const design = row({ parentId: team.id, name: "Design", planStart: "2026-10-05", planDays: 5, percentComplete: 40, status: "In Progress", baselineFinish: "2026-10-08" });
  const build = row({ parentId: team.id, name: "Build", planStart: null, startMode: "linked", predecessorId: design.id, planDays: 3 });
  const emptyPhase = row({ kind: "phase", name: "Spare", planStart: null });
  const loose = row({ name: "Loose", planStart: "2026-10-20", planDays: 2 });
  const tasks = [frame, kickOff, frameGroup, handover, team, design, build, emptyPhase, loose];
  const leaves = scheduleLeaves(tasks, resolveTasks(tasks, new Set()));
  // Phases (even childless ones) and the roll-up group are left out.
  assert.deepEqual(leaves.map((item) => item.name), ["Kick-off", "Handover", "Design", "Build", "Loose"]);
  const byName = new Map(leaves.map((item) => [item.name, item]));
  assert.equal(byName.get("Kick-off")!.inMasterPlan, true); assert.equal(byName.get("Kick-off")!.isMilestone, true);
  assert.equal(byName.get("Handover")!.inMasterPlan, true);
  assert.equal(byName.get("Design")!.inMasterPlan, false); assert.equal(byName.get("Loose")!.inMasterPlan, false);
  assert.deepEqual(byName.get("Design"), { id: design.id, name: "Design", planStart: "2026-10-05", planFinish: "2026-10-09", workDays: 5,
    status: "In Progress", percentComplete: 40, forecastFinish: null, actualFinish: null, baselineFinish: "2026-10-08", isMilestone: false, inMasterPlan: false });
  // A linked row carries the start the calculation resolved (next work day after Design), so it can be judged.
  assert.equal(byName.get("Build")!.planStart, "2026-10-12"); assert.equal(byName.get("Build")!.planFinish, "2026-10-14");
  assert.equal(byName.get("Build")!.workDays, 3);
  // End to end: the frame is excluded from progress but still names the next milestone.
  const result = summarizeProjectSchedule(open, leaves, today);
  assert.equal(result.taskCount, 3);
  assert.deepEqual(result.nextMilestone, { name: "Handover", date: "2026-12-01" });
});

test("scheduleLeaves stops walking up at a missing parent or a parent loop", () => {
  const orphan = row({ parentId: 99_999, name: "Orphan" });
  assert.deepEqual(scheduleLeaves([orphan], resolveTasks([orphan], new Set())).map((item) => [item.name, item.inMasterPlan]), [["Orphan", false]]);
  // The calculation refuses a parent loop; the walk to the top row must still end if it is handed one.
  const first = row({ id: 900, kind: "phase", name: MASTER_PLAN_PHASE, parentId: 901 }), second = row({ id: 901, kind: "task", name: "Loop", parentId: 900 });
  const child = row({ id: 902, parentId: 900, name: "Inside loop" });
  const calculation = resolveTasks([{ ...first, parentId: null }, second, child], new Set());
  assert.deepEqual(scheduleLeaves([first, second, child], calculation).map((item) => item.name), ["Loop", "Inside loop"]);
});
