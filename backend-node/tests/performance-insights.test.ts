import assert from "node:assert/strict";
import test from "node:test";
import { buildEngineeringPerformanceInsights, buildSalesPerformanceInsights } from "../src/performance-insights.js";

const schedule = (id: number, overrides: Partial<{
  status: string; due_date: string | null; actual_end: string | null; updated_at: string; name: string;
}> = {}) => ({
  id, status: "Done", due_date: `2026-08-${String(id).padStart(2, "0")}`, actual_end: `2026-08-${String(id).padStart(2, "0")}`,
  updated_at: "2026-08-31", name: `Task ${id}`, ...overrides,
});

const issue = (id: number, state: string, overrides: Partial<{
  execution_status: string; due_date: string | null; actual_end: string | null; updated_at: string; title: string;
}> = {}) => ({
  id, title: `Issue ${id}`, is_issue: true, state, execution_status: state === "Closed" ? "Done" : "In Progress",
  due_date: `2026-08-${String(id).padStart(2, "0")}`, actual_end: state === "Closed" ? "2026-08-20" : null,
  updated_at: "2026-08-31", ...overrides,
});

const inquiry = (id: number, overrides: Partial<{
  status: string; inquiry_date: string; meeting_count: number; estimate_id: number | null; project_id: number | null;
}> = {}) => ({
  id, inquiry_no: `INQ-${id}`, status: "Estimating", inquiry_date: `2026-07-${String(id).padStart(2, "0")}`,
  meeting_count: 0, estimate_id: null, project_id: null, ...overrides,
});

test("Engineering selection is deterministic and uses fixed priority before magnitude", () => {
  const input = {
    projects: [{ id: 9, project_no: "PJ-9", target_delivery: "2026-08-20", actual_delivery: "2026-08-18" }],
    scheduleTasks: [
      schedule(1), schedule(2),
      schedule(3, { status: "In Progress", actual_end: null, due_date: "2026-08-03" }),
      schedule(4, { status: "In Progress", actual_end: null, due_date: "2026-08-04" }),
    ],
    resourceTasks: [issue(11, "Approved"), issue(12, "Approved")],
    asOf: "2026-09-01", confidence: "HIGH" as const,
  };
  const first = buildEngineeringPerformanceInsights(input);
  const shuffled = buildEngineeringPerformanceInsights({
    ...input,
    projects: [...input.projects].reverse(), scheduleTasks: [...input.scheduleTasks].reverse(), resourceTasks: [...input.resourceTasks].reverse(),
  });

  assert.deepEqual(shuffled, first);
  assert.deepEqual(first.map((item) => item.reasonCode), ["DELIVERY_EARLY", "DELIVERY_REVIEW"]);
  assert.deepEqual(first[1]?.facts, { overdueCount: 4, dueCount: 6, oldestDueDate: "2026-08-03" });
});

test("minimum samples and LOW confidence do not create unsupported personal conclusions", () => {
  const insights = buildEngineeringPerformanceInsights({
    projects: [{ id: 1, project_no: "PJ-1", target_delivery: "2026-08-20", actual_delivery: "2026-08-19" }],
    scheduleTasks: [schedule(1), schedule(2)], resourceTasks: [], asOf: "2026-09-01", confidence: "LOW",
  });

  assert.equal(insights.some((item) => item.reasonCode === "DELIVERY_ON_TIME"), false);
  assert.equal(insights[0]?.reasonCode, "DELIVERY_EARLY");
  assert.equal(insights[0]?.kind, "CONTEXT");
  assert.equal(insights[0]?.confidence, "LOW");
});

test("zero Issues never becomes a quality success signal and early requires actual-before-target", () => {
  const insights = buildEngineeringPerformanceInsights({
    projects: [
      { id: 1, project_no: "PJ-1", target_delivery: "2026-08-20", actual_delivery: "2026-08-20" },
      { id: 2, project_no: "PJ-2", target_delivery: "2026-08-20", actual_delivery: "2026-08-21" },
    ],
    scheduleTasks: [schedule(1), schedule(2), schedule(3)], resourceTasks: [], asOf: "2026-09-01", confidence: "HIGH",
  });

  assert.equal(insights.some((item) => item.reasonCode.startsWith("ISSUE_")), false);
  assert.equal(insights.some((item) => item.reasonCode === "DELIVERY_EARLY"), false);
  assert.equal(insights.some((item) => item.reasonCode === "DELIVERY_ON_TIME"), true);
});

test("reopened assigned Issues are workload, not defect causation or handling success", () => {
  const insights = buildEngineeringPerformanceInsights({
    projects: [], scheduleTasks: [],
    resourceTasks: [
      issue(1, "Approved", { execution_status: "Done", actual_end: "2026-08-20" }),
      issue(2, "Approved", { execution_status: "Done", actual_end: "2026-08-21" }),
    ],
    asOf: "2026-09-01", confidence: "HIGH",
  });

  assert.equal(insights.some((item) => item.reasonCode === "ISSUE_HANDLING_STRONG"), false);
  const workload = insights.find((item) => item.reasonCode === "ISSUE_WORKLOAD_REVIEW");
  assert.equal(workload?.kind, "ATTENTION");
  assert.deepEqual(workload?.facts, { openIssueCount: 2, issueCount: 2, oldestIssueDate: "2026-08-01" });
  assert.equal(JSON.stringify(insights).match(/defect|cause|workmanship/iu), null);
});

test("canonical identities are deduplicated before Engineering thresholds are applied", () => {
  const duplicatedIssue = issue(1, "Closed");
  const duplicatedTask = schedule(1);
  const insights = buildEngineeringPerformanceInsights({
    projects: [], scheduleTasks: [duplicatedTask, duplicatedTask, schedule(2)],
    resourceTasks: [duplicatedIssue, duplicatedIssue], asOf: "2026-09-01", confidence: "HIGH",
  });

  assert.equal(insights.some((item) => item.reasonCode === "DELIVERY_ON_TIME"), false);
  assert.equal(insights.some((item) => item.reasonCode === "ISSUE_HANDLING_STRONG"), false);
});

test("Sales uses distinct Inquiry coverage and stable fixed-priority selection", () => {
  const rows = [
    inquiry(1, { status: "Approved", meeting_count: 4, estimate_id: 10, project_id: 101 }),
    inquiry(2, { status: "Approved", meeting_count: 3, estimate_id: 20, project_id: 102 }),
    inquiry(3, { meeting_count: 6, estimate_id: 30 }),
    inquiry(4, { meeting_count: 2, estimate_id: 40 }),
    inquiry(5, { meeting_count: 1, estimate_id: 50 }),
  ];
  const insights = buildSalesPerformanceInsights({ inquiries: [...rows, rows[2]!], confidence: "HIGH" });
  const shuffled = buildSalesPerformanceInsights({ inquiries: [...rows].reverse(), confidence: "HIGH" });

  assert.deepEqual(insights, shuffled);
  assert.equal(insights.find((item) => item.kind === "STRENGTH")?.reasonCode, "HANDOVER_COMPLETE");
  assert.deepEqual(insights.find((item) => item.reasonCode === "HANDOVER_COMPLETE")?.facts, { approvedCount: 2, handoverCount: 2 });
  assert.equal(insights.find((item) => item.kind === "CONTEXT")?.reasonCode, "FORECAST_CONTEXT");
});

test("Sales review thresholds use eligible Inquiry bases and oldest authorized source", () => {
  const insights = buildSalesPerformanceInsights({
    inquiries: [
      inquiry(5, { inquiry_date: "2026-07-05", status: "Approved" }),
      inquiry(3, { inquiry_date: "2026-07-03", status: "Engineering Review" }),
      inquiry(1, { inquiry_date: "2026-07-01", status: "Estimating" }),
      inquiry(2, { inquiry_date: "2026-07-02", status: "New" }),
      inquiry(4, { inquiry_date: "2026-07-04", status: "New", meeting_count: 1 }),
    ],
    confidence: "MEDIUM",
  });

  assert.equal(insights.find((item) => item.kind === "ATTENTION")?.reasonCode, "HANDOVER_REVIEW");
  assert.deepEqual(insights.find((item) => item.reasonCode === "HANDOVER_REVIEW")?.facts, { approvedCount: 1, handoverCount: 0 });
  assert.deepEqual(insights.find((item) => item.reasonCode === "HANDOVER_REVIEW")?.source, { type: "INQUIRY", id: 5, label: "INQ-5" });
  const estimate = buildSalesPerformanceInsights({
    inquiries: [inquiry(1), inquiry(2, { status: "Engineering Review" }), inquiry(3, { status: "Approved", project_id: 103 })],
    confidence: "MEDIUM",
  }).find((item) => item.reasonCode === "ESTIMATE_COVERAGE_REVIEW");
  assert.deepEqual(estimate?.facts, { eligibleInquiryCount: 3, estimateCoveredCount: 0 });
  assert.deepEqual(estimate?.source, { type: "INQUIRY", id: 1, label: "INQ-1" });
});

test("LOW-confidence Sales evidence is context-only and duplicate meetings do not inflate coverage", () => {
  const insights = buildSalesPerformanceInsights({
    inquiries: [inquiry(1, { meeting_count: 10 }), inquiry(2), inquiry(3), inquiry(4)], confidence: "LOW",
  });
  const followup = insights.find((item) => item.reasonCode === "CUSTOMER_FOLLOWUP_REVIEW");

  assert.equal(followup?.kind, "CONTEXT");
  assert.deepEqual(followup?.facts, { activeInquiryCount: 4, inquiriesWithMeetingCount: 1 });
  assert.equal(insights.some((item) => item.kind === "STRENGTH" || item.kind === "ATTENTION"), false);
});
