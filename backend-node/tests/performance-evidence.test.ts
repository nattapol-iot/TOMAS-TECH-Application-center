import assert from "node:assert/strict";
import test from "node:test";
import { buildPerformanceEvidence, buildSalesPerformanceEvidence } from "../src/performance-evidence.js";
import { canManagePerformanceTarget, frameworkForRole } from "../src/performance-framework.js";

test("work evidence scores only due assigned work and keeps suggestions advisory", () => {
  const result = buildPerformanceEvidence({
    employeeId: 12,
    employeeName: "Test Engineer",
    cycleId: 2,
    cycleCode: "H2-2026",
    periodStart: "2026-07-01",
    periodEnd: "2026-12-31",
    today: "2026-09-06",
    projects: [{ id: 8, project_no: "PRJ-008", name: "Line monitor", status: "Development", role_on_project: "Engineer", start_date: "2026-07-01", target_delivery: "2026-11-30", actual_delivery: null }],
    inquiries: [{ id: 4, inquiry_no: "INQ-004", project_name: "Gateway", status: "Engineering Review", due_date: "2026-09-20", meeting_count: 1, updated_at: "2026-09-04" }],
    scheduleTasks: [
      { id: 1, project_id: 8, project_no: "PRJ-008", project_name: "Line monitor", name: "Design IO", status: "Done", is_milestone: false, due_date: "2026-08-10", actual_end: "2026-08-09", percent_done: 100, updated_at: "2026-08-09" },
      { id: 2, project_id: 8, project_no: "PRJ-008", project_name: "Line monitor", name: "Build gateway", status: "Done", is_milestone: false, due_date: "2026-08-25", actual_end: "2026-08-25", percent_done: 100, updated_at: "2026-08-25" },
      { id: 3, project_id: 8, project_no: "PRJ-008", project_name: "Line monitor", name: "Site test", status: "In Progress", is_milestone: true, due_date: "2026-09-01", actual_end: null, percent_done: 70, updated_at: "2026-09-05" },
      { id: 4, project_id: 8, project_no: "PRJ-008", project_name: "Line monitor", name: "Handover", status: "Not Started", is_milestone: true, due_date: "2026-11-20", actual_end: null, percent_done: 0, updated_at: "2026-09-05" },
    ],
    resourceTasks: [
      { id: 20, inquiry_id: null, project_id: 8, source_no: "PRJ-008", source_name: "Line monitor", title: "Resolve sensor alarm", is_issue: true, state: "Closed", execution_status: "Done", due_date: "2026-08-20", actual_end: "2026-08-18", percent_done: 100, updated_at: "2026-08-18" },
      { id: 21, inquiry_id: null, project_id: 8, source_no: "PRJ-008", source_name: "Line monitor", title: "Check packet loss", is_issue: true, state: "Approved", execution_status: "In Progress", due_date: "2026-09-15", actual_end: null, percent_done: 40, updated_at: "2026-09-05" },
    ],
  });

  assert.equal(result.metrics.assignedTaskCount, 6);
  assert.equal(result.metrics.dueTaskCount, 4);
  assert.equal(result.metrics.completedTaskCount, 3);
  assert.equal(result.metrics.onTimeTaskCount, 3);
  assert.equal(result.metrics.overdueTaskCount, 1);
  assert.equal(result.areas.find((area) => area.areaCode === "DELIVERY")?.suggestedScore, 4.5);
  assert.equal(result.areas.find((area) => area.areaCode === "QUALITY")?.suggestedScore, 3);
  assert.match(result.methodology, /decision support only/i);
  assert.match(result.areas.find((area) => area.areaCode === "DELIVERY")?.evidenceText ?? "", /3\/4/);
  assert.deepEqual(result.insights.map((insight) => insight.reasonCode), ["TECHNICAL_CONTRIBUTION", "DELIVERY_REVIEW"]);
});

test("work evidence with sparse data does not invent a score", () => {
  const result = buildPerformanceEvidence({
    employeeId: 1,
    employeeName: "New Starter",
    cycleId: 1,
    cycleCode: "H2-2026",
    periodStart: "2026-07-01",
    periodEnd: "2026-12-31",
    today: "2026-09-06",
    projects: [], scheduleTasks: [], resourceTasks: [], inquiries: [],
  });
  assert.equal(result.confidence, "LOW");
  assert.ok(result.areas.every((area) => area.suggestedScore === null));
  assert.equal(result.sources.reduce((sum, source) => sum + source.count, 0), 0);
  assert.deepEqual(result.insights, []);
});

test("sales evidence uses owned pipeline, forecast outcomes and Project handovers without inventing sparse scores", () => {
  const result = buildSalesPerformanceEvidence({
    employeeId: 24,
    employeeName: "Test Sales",
    cycleId: 2,
    cycleCode: "H2-2026",
    periodStart: "2026-07-01",
    periodEnd: "2026-12-31",
    today: "2026-09-06",
    inquiries: [
      { id: 1, inquiry_no: "INQ-001", project_name: "Approved line", status: "Approved", inquiry_date: "2026-07-01", due_date: "2026-08-01", updated_at: "2026-08-01", project_probability: 80, customer_interest_grade: "A", meeting_count: 2, estimate_id: 11, estimate_status: "Approved", estimate_total: 1_200_000, project_id: 101 },
      { id: 2, inquiry_no: "INQ-002", project_name: "Cancelled cell", status: "Cancelled", inquiry_date: "2026-07-05", due_date: "2026-08-05", updated_at: "2026-08-03", project_probability: 20, customer_interest_grade: "C", meeting_count: 1, estimate_id: 12, estimate_status: "Estimate Completed", estimate_total: 600_000, project_id: null },
      { id: 3, inquiry_no: "INQ-003", project_name: "Approved gateway", status: "Approved", inquiry_date: "2026-07-10", due_date: "2026-08-10", updated_at: "2026-08-09", project_probability: 70, customer_interest_grade: "A", meeting_count: 1, estimate_id: 13, estimate_status: "Locked", estimate_total: 900_000, project_id: 103 },
      { id: 4, inquiry_no: "INQ-004", project_name: "Cancelled sensor", status: "Cancelled", inquiry_date: "2026-07-12", due_date: "2026-08-12", updated_at: "2026-08-11", project_probability: 10, customer_interest_grade: "D", meeting_count: 0, estimate_id: null, estimate_status: null, estimate_total: null, project_id: null },
      { id: 5, inquiry_no: "INQ-005", project_name: "Active vision", status: "Engineering Review", inquiry_date: "2026-08-01", due_date: "2026-09-20", updated_at: "2026-09-05", project_probability: 60, customer_interest_grade: "B", meeting_count: 2, estimate_id: 15, estimate_status: "Engineering Review", estimate_total: 500_000, project_id: null },
    ],
  });

  assert.equal(result.frameworkCode, "SALES");
  assert.deepEqual(result.areas.map((area) => area.areaCode), ["PIPELINE", "CUSTOMER", "FORECAST", "COMMERCIAL", "HANDOVER"]);
  assert.equal(result.metrics.meetingCount, 6);
  assert.equal(result.metrics.approvedEstimateCount, 2);
  assert.equal(result.metrics.handoverCount, 2);
  assert.equal(result.areas.find((area) => area.areaCode === "FORECAST")?.suggestedScore, null);
  assert.equal(result.areas.find((area) => area.areaCode === "HANDOVER")?.suggestedScore, 5);
  assert.match(result.areas.find((area) => area.areaCode === "FORECAST")?.evidenceText ?? "", /without dated pre-outcome snapshots/);
  assert.match(result.methodology, /decision support only/i);
  assert.deepEqual(result.insights.map((insight) => insight.reasonCode), ["HANDOVER_COMPLETE", "FORECAST_CONTEXT"]);
});

test("role-specific frameworks and manager scope keep Sales separate from Engineering", () => {
  assert.deepEqual(frameworkForRole("Sales Engineer").areaCodes, ["PIPELINE", "CUSTOMER", "FORECAST", "COMMERCIAL", "HANDOVER"]);
  assert.deepEqual(frameworkForRole("Engineer").areaCodes, ["DELIVERY", "QUALITY", "TECHNICAL", "TEAMWORK"]);
  assert.equal(canManagePerformanceTarget("Sales Manager", "Sales Engineer"), true);
  assert.equal(canManagePerformanceTarget("Sales Manager", "Engineer"), false);
  assert.equal(canManagePerformanceTarget("Engineering Manager", "Sales Engineer"), false);
  assert.equal(canManagePerformanceTarget("Admin", "Sales Engineer"), true);
});
