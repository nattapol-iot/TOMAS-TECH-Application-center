import assert from "node:assert/strict";
import test from "node:test";
import { projectHealth, summarizeProjectSchedule } from "../backend-node/src/project-health.ts";
import { projectHealth as executiveHealth } from "../backend-node/src/executive-dashboard-model.ts";
import { EMPTY_PORTFOLIO_FILTERS, PORTFOLIO_CHIPS, portfolioView, sortPortfolio } from "../lib/project-portfolio.ts";

const today = "2026-11-19", now = Date.parse(`${today}T00:00:00Z`);
const leaf = {
  id: 1, name: "Unfinished work", planStart: "2026-10-01", planFinish: "2026-10-10", workDays: 8,
  status: "Blocked", percentComplete: 10, forecastFinish: "2026-11-30", actualFinish: null,
  baselineFinish: "2026-10-09", isMilestone: false, inMasterPlan: false, rollup: false,
};
const project = { status: "Closed", targetDelivery: "2026-10-15" };
const row = (overrides = {}) => ({
  id: 1, number: "P1", name: "Closed project", customerName: "Customer", purchaseOrderNumber: "",
  managerName: "Manager", managerId: 1, leadEngineerId: 1, ...project,
  progress: 100, lastProgressAt: null, pendingRequests: 2,
  ...summarizeProjectSchedule(project, [leaf], today), ...overrides,
});

test("Closed projects keep neutral health with overdue, blocked, unfinished tasks", () => {
  const summary = summarizeProjectSchedule(project, [leaf], today);
  assert.equal(projectHealth(project, [{ ...leaf, planDays: 10 }], today), "Completed");
  assert.equal(summary.health, "Completed");
  assert.equal(executiveHealth(summary), "closed");
  assert.deepEqual([summary.overdueCount, summary.blockedCount, summary.slippedCount], [0, 0, 0]);
  assert.equal(summary.slipDays, null);
  assert.equal(summary.progress, 100);
  assert.equal(summary.plannedProgress, null);
  assert.equal(summary.doneCount, 0, "do not mark unfinished tasks Done");
  assert.equal(summary.taskCount, 1, "retain historical tasks");
  const futureMilestone = { ...leaf, isMilestone: true, planFinish: "2026-12-01" };
  assert.equal(summarizeProjectSchedule(project, [futureMilestone], today).nextMilestone, null);
  assert.equal(summarizeProjectSchedule(project, [], today).health, "Completed");
});

test("open projects still report overdue, blocked and slipped work", () => {
  const summary = summarizeProjectSchedule({ ...project, status: "In Progress" }, [leaf], today);
  assert.equal(summary.health, "Delayed");
  assert.deepEqual([summary.overdueCount, summary.blockedCount, summary.slippedCount], [1, 1, 1]);
  assert.ok(summary.slipDays > 0);
});

test("Closed projects are excluded from every attention chip and late health filter, even with stale health", () => {
  for (const health of ["Delayed", "At Risk", "No plan", "Completed"]) {
    const closed = row({ health, overdueCount: 4, blockedCount: 2, slipDays: 12 });
    const view = portfolioView([closed], EMPTY_PORTFOLIO_FILTERS, now);
    assert.equal(view.healthCounts.Completed, 1);
    assert.equal(view.healthCounts.Delayed, 0);
    assert.equal(view.healthCounts["At Risk"], 0);
    for (const chip of PORTFOLIO_CHIPS) {
      assert.equal(view.chipCounts[chip], 0, chip);
      assert.equal(portfolioView([closed], { ...EMPTY_PORTFOLIO_FILTERS, chip }, now).rows.length, 0);
    }
    for (const risk of ["Delayed", "At Risk"]) {
      assert.equal(portfolioView([closed], { ...EMPTY_PORTFOLIO_FILTERS, health: risk }, now).rows.length, 0);
    }
    assert.equal(portfolioView([closed], { ...EMPTY_PORTFOLIO_FILTERS, health: "Completed" }, now).rows.length, 1);
    const open = row({ id: 2, status: "In Progress", health: "On Track" });
    assert.deepEqual(sortPortfolio([closed, open]).map((item) => item.id), [2, 1]);
  }
});
